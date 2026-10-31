/**
 * Museum Person / Work / Event files under the curator export.
 *
 * `records/people|works|events/` sit beside `records/records/`. They are not
 * layout. A disc trajectory points at an Event; the build expands that pointer
 * into the place shape the map already reads. Dangling ids fail the build.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
	DISC_EVENT_ROLES,
	PLACE_ROLES,
	assertExportValue,
	formatIssues,
	isEventPointer,
	loadRecordsExport,
	slugId,
	type ExportOptions,
	type SiteExportRecord,
	type Trajectory,
	type TrajectoryPlace,
	type TrajectoryStation,
} from './records-export.ts';

const recordIdPattern = /^[a-z0-9]+$/;

const idList = z.array(z.string().regex(slugId, 'id 须为馆级小写 slug'));

export const personSchema = z.strictObject({
	schemaVersion: z.literal(1),
	id: z.string().regex(slugId, 'id 须为馆级小写 slug'),
	nameZh: z.string().min(1),
	name: z.string().min(1).optional(),
});

export const workSchema = z.strictObject({
	schemaVersion: z.literal(1),
	id: z.string().regex(slugId, 'id 须为馆级小写 slug'),
	titleZh: z.string().min(1),
	title: z.string().min(1).optional(),
	composerPersonId: z.string().regex(slugId, 'composerPersonId 须为馆级小写 slug').optional(),
});

export const eventSchema = z
	.strictObject({
		schemaVersion: z.literal(1),
		id: z.string().regex(slugId, 'id 须为馆级小写 slug'),
		year: z.number().int().min(1500).max(2100),
		yearLabel: z.string().min(1).max(32).optional(),
		cityZh: z.string().min(1),
		city: z.string().min(1),
		role: z.enum(PLACE_ROLES),
		lon: z.number().min(-180).max(180),
		lat: z.number().min(-90).max(90),
		zoom: z.number().int().min(3).max(12).optional(),
		blurb: z.string().min(1).optional(),
		personIds: idList.optional(),
		workIds: idList.optional(),
		recordId: z.string().regex(recordIdPattern, 'recordId 须为唱片 id').nullable().optional(),
	})
	.superRefine((event, ctx) => {
		if (event.role === 'other' && event.blurb === undefined) {
			ctx.addIssue({
				code: 'custom',
				message: 'role 为 other 时必须填写 blurb',
				path: ['blurb'],
			});
		}
	});

export const entityIndexSchema = z.strictObject({
	schemaVersion: z.literal(1),
	ids: idList,
});

export type Person = z.infer<typeof personSchema>;
export type Work = z.infer<typeof workSchema>;
export type MuseumEvent = z.infer<typeof eventSchema>;

export type EntityCatalog = {
	people: Map<string, Person>;
	works: Map<string, Work>;
	events: Map<string, MuseumEvent>;
};

export const ENTITY_KINDS = ['people', 'works', 'events'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

const discRoles = new Set<string>(DISC_EVENT_ROLES);

function emptyCatalog(): EntityCatalog {
	return { people: new Map(), works: new Map(), events: new Map() };
}

function parseEntity<T>(schema: z.ZodType<T>, data: unknown, file: string): T {
	assertExportValue(data, file);
	const parsed = schema.safeParse(data);
	if (!parsed.success) {
		throw new Error(`${file} 校验失败：\n${formatIssues(parsed.error)}`);
	}
	return parsed.data;
}

export function parsePerson(data: unknown, file = 'person.json'): Person {
	return parseEntity(personSchema, data, file);
}

export function parseWork(data: unknown, file = 'work.json'): Work {
	return parseEntity(workSchema, data, file);
}

export function parseEvent(data: unknown, file = 'event.json'): MuseumEvent {
	return parseEntity(eventSchema, data, file);
}

function readJson(file: string): unknown {
	let text: string;
	try {
		text = readFileSync(file, 'utf8');
	} catch {
		throw new Error(`找不到 ${file}`);
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new Error(`无法解析 JSON：${file}`);
	}
}

function listJsonIds(dir: string): string[] {
	return readdirSync(dir)
		.filter((name) => name.endsWith('.json') && name !== 'index.json')
		.map((name) => name.slice(0, -'.json'.length))
		.sort();
}

function loadKind<T extends { id: string }>(
	root: string,
	kind: EntityKind,
	parse: (data: unknown, file: string) => T,
): Map<string, T> {
	const dir = join(root, kind);
	if (!existsSync(dir)) return new Map();
	if (!statSync(dir).isDirectory()) {
		throw new Error(`${dir} 必须是目录`);
	}
	const indexFile = join(dir, 'index.json');
	if (!existsSync(indexFile)) {
		throw new Error(`找不到 ${indexFile}`);
	}
	const index = parseEntity(entityIndexSchema, readJson(indexFile), indexFile);
	const onDisk = listJsonIds(dir);
	const indexed = new Set(index.ids);
	const disk = new Set(onDisk);
	for (const id of index.ids) {
		if (!disk.has(id)) throw new Error(`${indexFile} 列出了不存在的 ${kind}/${id}.json`);
	}
	for (const id of onDisk) {
		if (!indexed.has(id)) throw new Error(`${kind}/${id}.json 不在 ${kind}/index.json 里`);
	}
	const seen = new Set<string>();
	const out = new Map<string, T>();
	for (const id of index.ids) {
		if (seen.has(id)) throw new Error(`${indexFile} 重复列出 ${id}`);
		seen.add(id);
		const file = join(dir, `${id}.json`);
		const entity = parse(readJson(file), file);
		if (entity.id !== id) {
			throw new Error(`${file} 的 id「${entity.id}」与文件名 ${id} 不一致`);
		}
		out.set(id, entity);
	}
	return out;
}

/** Read `people/`, `works/`, and `events/` under an export root. Missing kinds are empty. */
export function loadEntityCatalog(exportRoot = join(process.cwd(), 'records')): EntityCatalog {
	if (!existsSync(exportRoot)) return emptyCatalog();
	return {
		people: loadKind(exportRoot, 'people', parsePerson),
		works: loadKind(exportRoot, 'works', parseWork),
		events: loadKind(exportRoot, 'events', parseEvent),
	};
}

function personIdsOf(event: MuseumEvent): readonly string[] {
	return event.personIds ?? [];
}

function workIdsOf(event: MuseumEvent): readonly string[] {
	return event.workIds ?? [];
}

function ownedRecordId(event: MuseumEvent): string | undefined {
	if (event.recordId === undefined || event.recordId === null) return undefined;
	return event.recordId;
}

function assertEventOwnership(event: MuseumEvent, recordIds: ReadonlySet<string>): void {
	const owner = ownedRecordId(event);
	const people = personIdsOf(event);
	const works = workIdsOf(event);
	if (discRoles.has(event.role)) {
		if (!owner) {
			throw new Error(`碟专属事件 ${event.id}（${event.role}）必须填写 recordId`);
		}
	} else if (event.role !== 'other') {
		if (owner) {
			throw new Error(`共享事件 ${event.id} 不能填写 recordId`);
		}
		if (people.length === 0 && works.length === 0) {
			throw new Error(`共享事件 ${event.id} 必须填写 personIds 或 workIds`);
		}
	} else if (!owner && people.length === 0 && works.length === 0) {
		throw new Error(`事件 ${event.id} 须归属人、作品，或一张碟（recordId）`);
	}
	if (owner && !recordIds.has(owner)) {
		throw new Error(`悬空 recordId：${owner}（事件 ${event.id}）`);
	}
}

type PointerRecord = { id: string; trajectory?: Trajectory };

/**
 * Fail the build when a person, work, event, or disc id does not resolve.
 * Also enforces shared vs disc-owned ownership. Does not invent a default event.
 */
export function assertEntityGraph(records: readonly PointerRecord[], catalog: EntityCatalog): void {
	const recordIds = new Set(records.map((record) => record.id));
	for (const work of catalog.works.values()) {
		if (work.composerPersonId && !catalog.people.has(work.composerPersonId)) {
			throw new Error(`悬空 personId：${work.composerPersonId}（作品 ${work.id} 的 composerPersonId）`);
		}
	}
	for (const event of catalog.events.values()) {
		assertEventOwnership(event, recordIds);
		for (const personId of personIdsOf(event)) {
			if (!catalog.people.has(personId)) {
				throw new Error(`悬空 personId：${personId}（事件 ${event.id}）`);
			}
		}
		for (const workId of workIdsOf(event)) {
			if (!catalog.works.has(workId)) {
				throw new Error(`悬空 workId：${workId}（事件 ${event.id}）`);
			}
		}
	}
	for (const record of records) {
		for (const station of record.trajectory?.places ?? []) {
			if (!isEventPointer(station)) continue;
			const event = catalog.events.get(station.eventId);
			if (!event) {
				throw new Error(`悬空 eventId：${station.eventId}（${record.id} 的站 ${station.id}）`);
			}
			const owner = ownedRecordId(event);
			if (owner && owner !== record.id) {
				throw new Error(`事件 ${event.id} 属于碟 ${owner}，不能被 ${record.id} 引用`);
			}
		}
	}
}

function expandStation(recordId: string, station: TrajectoryStation, catalog: EntityCatalog): TrajectoryPlace {
	if (!isEventPointer(station)) return station;
	const event = catalog.events.get(station.eventId);
	if (!event) {
		throw new Error(`悬空 eventId：${station.eventId}（${recordId} 的站 ${station.id}）`);
	}
	const place: TrajectoryPlace = {
		id: station.id,
		year: event.year,
		cityZh: event.cityZh,
		city: event.city,
		role: event.role,
		lon: event.lon,
		lat: event.lat,
		eventId: event.id,
	};
	if (event.yearLabel) place.yearLabel = event.yearLabel;
	if (event.zoom !== undefined) place.zoom = event.zoom;
	const blurb = station.blurb ?? event.blurb;
	if (blurb) place.blurb = blurb;
	return place;
}

/**
 * Check one disc's pointers against a catalog. Used by ship before the whole-site
 * graph check, so a ticket can fail on a dangling eventId without loading every record.
 */
export function assertTrajectoryPointers(record: PointerRecord, catalog: EntityCatalog): void {
	for (const station of record.trajectory?.places ?? []) {
		if (!isEventPointer(station)) continue;
		const event = catalog.events.get(station.eventId);
		if (!event) {
			throw new Error(`悬空 eventId：${station.eventId}（${record.id} 的站 ${station.id}）`);
		}
		for (const personId of personIdsOf(event)) {
			if (!catalog.people.has(personId)) {
				throw new Error(`悬空 personId：${personId}（事件 ${event.id}）`);
			}
		}
		for (const workId of workIdsOf(event)) {
			if (!catalog.works.has(workId)) {
				throw new Error(`悬空 workId：${workId}（事件 ${event.id}）`);
			}
		}
		const owner = ownedRecordId(event);
		if (owner && owner !== record.id) {
			throw new Error(`事件 ${event.id} 属于碟 ${owner}，不能被 ${record.id} 引用`);
		}
	}
}

/**
 * Copy records with every `eventId` station replaced by the Event's place fields.
 * A station `blurb` overrides only the caption. Coordinates, year, city, and role stay on the Event.
 */
export function expandRecordTrajectories<T extends PointerRecord>(
	records: readonly T[],
	catalog: EntityCatalog,
): Array<Omit<T, 'trajectory'> & { trajectory?: SiteExportRecord['trajectory'] }> {
	assertEntityGraph(records, catalog);
	return records.map((record) => {
		const { trajectory, ...rest } = record;
		if (!trajectory) return rest;
		const titleZh = trajectory.titleZh;
		return {
			...rest,
			trajectory: {
				...(titleZh ? { titleZh } : {}),
				places: trajectory.places.map((station) => expandStation(record.id, station, catalog)),
			},
		};
	});
}

/** Load the export and expand pointers. This is the build-time hard-fail path. */
export function resolveRecordsExport(options: ExportOptions = {}): SiteExportRecord[] {
	const records = loadRecordsExport(options);
	const exportRoot = options.exportRoot ?? join(process.cwd(), 'records');
	const catalog = loadEntityCatalog(exportRoot);
	return expandRecordTrajectories(records, catalog);
}

