/**
 * Trajectory / entity inspection for the catalog validator.
 *
 * Everything here is derived through the real exported helpers:
 * `loadEntityCatalog`, `assertEntityGraph`, `assertTrajectoryPointers`,
 * `expandRecordTrajectories`. Nothing is re-implemented loosely and
 * `records.ts` / `records-entities.ts` are not modified.
 *
 * Pointer stations carry no year: year, city, role and coordinates live on the
 * Event. Order checks therefore run on the expanded stations, not on the raw
 * pointer shape, and a blocked expansion reports `null` counts instead of 0.
 */
import { join } from 'node:path';
import {
	assertEntityGraph,
	assertTrajectoryPointers,
	expandRecordTrajectories,
	loadEntityCatalog,
	type EntityCatalog,
} from '../../src/data/records-entities.ts';
import type { ExportRecord, TrajectoryPlace } from '../../src/data/records-export.ts';
import type { Finding, NotChecked, TrajectoryReport } from './report.ts';
import { fingerprintFiles, sha256Hex } from './report.ts';

export type EntityCatalogState =
	| { ok: true; catalog: EntityCatalog }
	| { ok: false; reason: string; path: string };

/** Load the entity catalog once. A failure is reported, never turned into an empty catalog. */
export function loadEntities(exportRoot: string): EntityCatalogState {
	try {
		return { ok: true, catalog: loadEntityCatalog(exportRoot) };
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
			path: join(exportRoot, 'events', 'index.json'),
		};
	}
}

/**
 * A disc may reference shared events, plus the events it owns.
 * Filtering the catalog to that view lets one disc expand through the real
 * `expandRecordTrajectories` without the single-record ownership pre-check
 * failing on another disc's owned event. The whole-graph check still runs once
 * over every record and catalog entity.
 */
export function catalogViewFor(catalog: EntityCatalog, recordId: string): EntityCatalog {
	const events = new Map(
		[...catalog.events.entries()].filter(([, event]) => {
			const owner = (event as { recordId?: string | null }).recordId;
			return owner === undefined || owner === null || owner === recordId;
		}),
	) as EntityCatalog['events'];
	return { ...catalog, events };
}

export type EntityGraphCheck = { ok: true } | { ok: false; reason: string };

/** One whole-graph check over every parsed record, exactly like the build path. */
export function checkEntityGraph(records: readonly ExportRecord[], entities: EntityCatalogState): EntityGraphCheck {
	if (!entities.ok) return { ok: false, reason: entities.reason };
	try {
		assertEntityGraph(records, entities.catalog);
		return { ok: true };
	} catch (error) {
		return { ok: false, reason: error instanceof Error ? error.message : String(error) };
	}
}

/** Labels that are placeholders rather than real time text. Whole-value match only. */
export const SENTINEL_LABELS_V1: readonly string[] = ['—', '–', '-', '?', '待定', '待核', '未核'];

export type TimeKind =
	| 'known-year'
	| 'known-date'
	| 'known-month'
	| 'approx'
	| 'range'
	| 'after'
	| 'unknown'
	| 'sentinel'
	| 'unparseable';

export type TimeInfo = {
	kind: TimeKind;
	year: number | null;
	month: number | null;
	day: number | null;
	comparable: boolean;
	label: string | null;
	reason: string | null;
};

const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH = /^(\d{4})-(\d{2})$/;
const YEAR_ONLY = /^(\d{4})$/;
const RANGE = /(\d{4})\s*(?:[–—-]|~|～)\s*(\d{2,4})/;
const AFTER = /(\d{4})\s*年?\s*(?:以后|之后|后)/;
const APPROX = /^约\s*\d{4}/;

/**
 * Parse one station's time conservatively. Anything outside the whitelist is
 * `unparseable`.
 *
 * `timeStatus:"unknown"` + `year:null` + `timeNote` is the canonical unknown
 * branch of the shared time contract: it is a **legal, typed** state, so it is
 * neither `sentinel` nor `unparseable`. It stays out of every comparison (no
 * year), which is exactly what "unknown" means for the order check.
 */
export function classifyTime(
	year: number | null,
	yearLabel: string | undefined,
	timeStatus?: string | null,
): TimeInfo {
	const label = yearLabel?.trim() ?? null;
	if (timeStatus === 'unknown') {
		return { kind: 'unknown', year: null, month: null, day: null, comparable: false, label, reason: '显式 unknown：年份未核，不参与比例轴与顺序比较' };
	}
	if (label !== null && SENTINEL_LABELS_V1.includes(label)) {
		return { kind: 'sentinel', year, month: null, day: null, comparable: false, label, reason: '占位时间标签，不能作为已核年份' };
	}
	if (label === null) {
		if (year === null) {
			return { kind: 'unparseable', year: null, month: null, day: null, comparable: false, label, reason: 'no year and no label' };
		}
		return { kind: 'known-year', year, month: null, day: null, comparable: true, label, reason: null };
	}
	const full = FULL_DATE.exec(label);
	if (full) {
		return { kind: 'known-date', year: Number(full[1]), month: Number(full[2]), day: Number(full[3]), comparable: true, label, reason: null };
	}
	const ym = YEAR_MONTH.exec(label);
	if (ym) {
		return { kind: 'known-month', year: Number(ym[1]), month: Number(ym[2]), day: null, comparable: true, label, reason: null };
	}
	const single = YEAR_ONLY.exec(label);
	if (single) {
		return { kind: 'known-year', year: Number(single[1]), month: null, day: null, comparable: true, label, reason: null };
	}
	if (AFTER.test(label)) {
		return { kind: 'after', year, month: null, day: null, comparable: false, label, reason: '“年后”只有下界' };
	}
	if (APPROX.test(label)) {
		return { kind: 'approx', year, month: null, day: null, comparable: false, label, reason: '约年仅作范围参考' };
	}
	if (RANGE.test(label)) {
		return { kind: 'range', year, month: null, day: null, comparable: false, label, reason: '区间标签只有范围' };
	}
	return { kind: 'unparseable', year, month: null, day: null, comparable: false, label, reason: '不识别的时间标签语法' };
}

export type TrajectoryInspection = {
	report: TrajectoryReport;
	findings: Finding[];
	notChecked: NotChecked[];
	fingerprint: string | null;
	places: TrajectoryPlace[] | null;
};

function isInversion(previous: TimeInfo, current: TimeInfo): 'year' | 'month' | 'day' | null {
	if (previous.year === null || current.year === null) return null;
	if (current.year < previous.year) return 'year';
	if (current.year > previous.year) return null;
	if (!previous.comparable || !current.comparable) return null;
	if (previous.month === null || current.month === null) return null;
	if (current.month < previous.month) return 'month';
	if (current.month > previous.month) return null;
	if (previous.day === null || current.day === null) return null;
	if (current.day < previous.day) return 'day';
	return null;
}

type StationView = {
	index: number;
	id: string;
	year: number | null;
	label: string | null;
	role: string | null;
	eventId: string | null;
	/** canonical 时间分支：缺省（旧导出）与 'known' 都当已知，只有 'unknown' 是未知。 */
	timeStatus: string | null;
};

function expandedViews(record: ExportRecord, places: TrajectoryPlace[] | null): StationView[] {
	const raw = record.trajectory?.places ?? [];
	return raw.map((station, index) => {
		const expanded = places?.[index];
		const year =
			expanded !== undefined ? expanded.year : 'year' in station && typeof station.year === 'number' ? station.year : null;
		const label =
			expanded !== undefined
				? (expanded as { yearLabel?: string }).yearLabel ?? null
				: 'yearLabel' in station && typeof station.yearLabel === 'string'
					? station.yearLabel
					: null;
		const role = expanded !== undefined ? expanded.role : 'role' in station ? station.role : null;
		// 未知分支只认**显式** timeStatus：缺省状态不当未知（合同 §2）。
		const timeStatus =
			expanded !== undefined
				? (expanded as { timeStatus?: string }).timeStatus ?? null
				: 'timeStatus' in station && typeof station.timeStatus === 'string'
					? station.timeStatus
					: null;
		return {
			index,
			id: station.id,
			year,
			label,
			role,
			eventId: 'eventId' in station ? station.eventId : null,
			timeStatus,
		};
	});
}

/**
 * One record's trajectory state. `blocked` keeps `null` counts instead of a
 * fake 0, and every other check in the record still runs.
 */
export function inspectTrajectory(
	record: ExportRecord,
	entities: EntityCatalogState,
	_recordDir: string,
): TrajectoryInspection {
	const findings: Finding[] = [];
	const notChecked: NotChecked[] = [];
	const rawViews = expandedViews(record, null);
	const emptyReport: TrajectoryReport = {
		state: 'not-checked',
		reason: null,
		refStations: null,
		expandedStations: null,
		inlineStations: null,
		pointerStations: null,
		uniqueEventIds: null,
		roles: {},
		stationIds: rawViews.map((view) => view.id),
		stationYears: rawViews.map((view) => view.year),
		timeKinds: {},
		stationsFingerprint: null,
	};

	if (!record.trajectory) {
		return {
			report: { ...emptyReport, state: 'absent', reason: 'no_trajectory', refStations: 0, expandedStations: 0, inlineStations: 0, pointerStations: 0, uniqueEventIds: 0 },
			findings,
			notChecked,
			fingerprint: null,
			places: null,
		};
	}

	// Expand first: pointer stations only gain their year/role after expansion.
	let places: TrajectoryPlace[] | null = null;
	let state: TrajectoryReport['state'] = 'present-valid';
	let blockReason: string | null = null;
	if (entities.ok) {
		try {
			const view = catalogViewFor(entities.catalog, record.id);
			assertTrajectoryPointers(record, view);
			const expanded = expandRecordTrajectories([record], view)[0];
			places = expanded?.trajectory?.places ?? null;
			if (!places || places.length !== rawViews.length) {
				state = 'blocked';
				blockReason = 'expansion lost or added stations';
				findings.push({
					key: '',
					baselineId: null,
					code: 'TRAJECTORY_EXPANSION_MISMATCH',
					severity: 'error',
					layer: 'source',
					status: 'blocked',
					recordId: record.id,
					fieldPath: 'trajectory.places',
					stationId: null,
					expected: { stations: rawViews.length },
					actual: { stations: places?.length ?? null },
					reason: '展开后的站点数与源站数不一致',
					recommendation: '检查 Event 指针展开；不能跳过站点仍报总数正常',
					evidence: [`${record.id}/record.json trajectory.places`],
				});
			}
		} catch (error) {
			state = 'blocked';
			blockReason = error instanceof Error ? error.message : String(error);
			findings.push({
				key: '',
				baselineId: null,
				code: 'TRAJECTORY_POINTER_INVALID',
				severity: 'error',
				layer: 'source',
				status: 'active',
				recordId: record.id,
				fieldPath: 'trajectory.places',
				stationId: null,
				expected: { resolvablePointers: true },
				actual: { resolvable: false },
				reason: blockReason,
				recommendation: '修正悬空 eventId / 归属 / 重复站；该盘展开站点计数保持 null（blocked），不伪造 0',
				evidence: [`${record.id}/record.json trajectory.places`],
			});
		}
	} else {
		state = 'blocked';
		blockReason = `entity catalog unavailable: ${entities.reason}`;
		findings.push({
			key: '',
			baselineId: null,
			code: 'ENTITY_CATALOG_INVALID',
			severity: 'error',
			layer: 'source',
			status: 'blocked',
			recordId: record.id,
			fieldPath: 'events/index.json',
			stationId: null,
			expected: { catalogLoaded: true },
			actual: { catalogLoaded: false },
			reason: entities.reason,
			recommendation: '修复实体目录（路径见 evidence）；依赖展开的检查保持 blocked，不声称请求层通过',
			evidence: [entities.path],
		});
	}

	const views = expandedViews(record, places);
	const pointerStations = rawViews.filter((view) => view.eventId !== null);
	const inlineStations = rawViews.filter((view) => view.eventId === null);
	const roles: Record<string, number> = {};
	for (const view of views) if (view.role) roles[view.role] = (roles[view.role] ?? 0) + 1;

	const times = views.map((view) => {
		const time = classifyTime(view.year, view.label ?? undefined, view.timeStatus);
		// A pointer station that could not be expanded has no time evidence at all;
		// that is not "unparseable", it is blocked (already reported once).
		if (view.eventId !== null && places === null) {
			return { ...time, kind: 'unparseable' as const, reason: null };
		}
		return time;
	});
	const timeKinds: Record<string, number> = {};
	for (const time of times) timeKinds[time.kind] = (timeKinds[time.kind] ?? 0) + 1;

	for (const [index, view] of views.entries()) {
		const time = times[index]!;
		/*
		 * `sentinel` 现在**不可达**：站点解析器（`REJECT_SENTINEL_TIME`）会在
		 * `parseRecord` 就拒掉占位标签，记录进不了这一段。占位标签的记录由
		 * `source.ts` 的原始形状扫描报 `TRAJECTORY_SENTINEL_LABEL_REJECTED`，
		 * 那里能给出站号与字段路径。`classifyTime` 仍保留 `sentinel` 类别，
		 * 因为它是一个纯分类器，且原始扫描与它的口径必须一致。
		 */
		if (time.kind === 'sentinel') continue;
		if (time.kind === 'unparseable' && time.reason !== null) {
			notChecked.push({
				code: 'TRAJECTORY_TIME_UNPARSEABLE',
				layer: 'source',
				recordId: record.id,
				fieldPath: `trajectory.places[${index}].yearLabel`,
				reason: time.reason,
				dependency: null,
			});
		}
	}

	// Guide order: known anchors only. Unknown / approx / ranges never compare as 0.
	let previous: { view: StationView; time: TimeInfo } | null = null;
	for (const [index, view] of views.entries()) {
		const time = times[index]!;
		if (time.year === null || (view.eventId !== null && places === null)) continue;
		if (previous) {
			const kind = isInversion(previous.time, time);
			if (kind) {
				findings.push({
					key: '',
					baselineId: null,
					code: 'TRAJECTORY_GUIDE_ORDER_INVERSION',
					severity: 'error',
					layer: 'source',
					status: 'active',
					recordId: record.id,
					fieldPath: `trajectory.places[${index}].year`,
					stationId: view.id,
					expected: { notBefore: previous.view.id, previousYear: previous.time.year },
					actual: { year: time.year, month: time.month, day: time.day, comparedOn: kind },
					reason: `导览顺序倒退：${previous.view.id}（${previous.time.label ?? previous.time.year}）→ ${view.id}（${time.label ?? time.year}）按${kind === 'year' ? '年' : kind === 'month' ? '月' : '日'}比较为倒序`,
					recommendation: '调整 places 顺序或年份证据；有意倒叙须走精确旁路批准（两站/版本），不能整盘禁用排序规则',
					evidence: [
						`${record.id}/record.json trajectory.places[${previous.view.index}].year`,
						`${record.id}/record.json trajectory.places[${index}].year`,
					],
				});
			}
			if (previous.time.year === time.year && (!previous.time.comparable || !time.comparable)) {
				notChecked.push({
					code: 'TRAJECTORY_SAME_YEAR_ORDER_UNVERIFIED',
					layer: 'source',
					recordId: record.id,
					fieldPath: `trajectory.places[${index}].year`,
					reason: `同年顺序不可证明（${previous.time.label ?? '—'} → ${time.label ?? '—'}）：约年/范围/混精度不补 1 日比较`,
					dependency: null,
				});
			}
		}
		previous = { view, time };
	}

	const report: TrajectoryReport = {
		...emptyReport,
		state,
		reason: blockReason,
		refStations: rawViews.length,
		expandedStations: places ? places.length : null,
		inlineStations: inlineStations.length,
		pointerStations: pointerStations.length,
		uniqueEventIds: pointerStations.length === 0 ? 0 : new Set(pointerStations.map((view) => view.eventId!)).size,
		roles,
		stationYears: views.map((view) => view.year),
		timeKinds,
		stationsFingerprint: places
			? fingerprintFiles([
					['trajectory.json', sha256Hex(JSON.stringify(record.trajectory))],
					...places.map((place, index) => [`place:${index}`, sha256Hex(JSON.stringify(place))] as const),
				])
			: fingerprintFiles([['trajectory.json', sha256Hex(JSON.stringify(record.trajectory))]]),
	};
	return {
		report,
		findings,
		notChecked,
		fingerprint: report.stationsFingerprint,
		places,
	};
}

