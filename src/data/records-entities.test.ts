import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { groupOverviewPins } from './trajectory-camera.ts';
import { SHARED_ROLES } from './records-export.ts';
import {
	assertEntityGraph,
	assertTrajectoryPointers,
	expandRecordTrajectories,
	loadEntityCatalog,
	parseEvent,
	parseOrganization,
	resolveRecordsExport,
	type EntityCatalog,
	type MuseumEvent,
	type Organization,
	type Person,
	type Work,
} from './records-entities.ts';

function person(id = 'js-bach'): Person {
	return {
		schemaVersion: 1,
		id,
		nameZh: '约翰·塞巴斯蒂安·巴赫',
		name: 'Johann Sebastian Bach',
	};
}

function work(extra: Partial<Work> = {}): Work {
	return {
		schemaVersion: 1,
		id: 'bwv1007-1012',
		titleZh: '无伴奏大提琴组曲',
		title: 'Suites for Solo Cello',
		composerPersonId: 'js-bach',
		...extra,
	};
}

function birth(extra: Partial<MuseumEvent> = {}): MuseumEvent {
	return {
		schemaVersion: 1,
		id: 'evt-bach-birth-eisenach',
		year: 1685,
		cityZh: '艾森纳赫',
		city: 'Eisenach',
		role: 'birth',
		lon: 10.319,
		lat: 50.975,
		zoom: 7,
		blurb: '约翰·塞巴斯蒂安·巴赫 1685 年生于艾森纳赫。',
		personIds: ['js-bach'],
		workIds: [],
		...extra,
	};
}

function organization(id = 'philharmonia-orchestra'): Organization {
	return {
		schemaVersion: 1,
		id,
		nameZh: '爱乐乐团',
		name: 'Philharmonia Orchestra',
		kind: ['ensemble'],
	};
}

function founded(extra: Partial<MuseumEvent> = {}): MuseumEvent {
	return {
		schemaVersion: 1,
		id: 'evt-philharmonia-founded-london',
		year: 1945,
		cityZh: '伦敦',
		city: 'London',
		role: 'founded',
		lon: -0.128,
		lat: 51.507,
		zoom: 7,
		blurb: '沃尔特·莱格筹建爱乐乐团',
		organizationIds: ['philharmonia-orchestra'],
		personIds: [],
		workIds: [],
		recordId: null,
		...extra,
	};
}

function catalog(
	events: MuseumEvent[],
	people: Person[] = [person()],
	works: Work[] = [],
	organizations: Organization[] = [],
): EntityCatalog {
	return {
		people: new Map(people.map((item) => [item.id, item])),
		works: new Map(works.map((item) => [item.id, item])),
		organizations: new Map(organizations.map((item) => [item.id, item])),
		events: new Map(events.map((item) => [item.id, item])),
	};
}

describe('entity pointer graph', () => {
	it('expands an event pointer and lets the disc override only the blurb', () => {
		const expanded = expandRecordTrajectories(
			[
				{
					id: 'mg50370',
					trajectory: {
						places: [
							{ id: 'eisenach', eventId: 'evt-bach-birth-eisenach', blurb: '这张碟上的一句旁注。' },
							{
								id: 'budapest-starker',
								year: 1924,
								cityZh: '布达佩斯',
								city: 'Budapest',
								role: 'birth' as const,
								lon: 19.145,
								lat: 47.482,
							},
						],
					},
				},
			],
			catalog([birth()]),
		);
		const places = expanded[0]?.trajectory?.places;
		assert.ok(places);
		assert.equal(places[0]?.eventId, 'evt-bach-birth-eisenach');
		assert.equal(places[0]?.year, 1685);
		assert.equal(places[0]?.cityZh, '艾森纳赫');
		assert.equal(places[0]?.role, 'birth');
		assert.equal(places[0]?.lon, 10.319);
		assert.equal(places[0]?.lat, 50.975);
		assert.equal(places[0]?.blurb, '这张碟上的一句旁注。');
		assert.equal(places[1]?.eventId, undefined);
		assert.equal(places[1]?.city, 'Budapest');
	});

	it('hard-fails dangling eventId, personId, workId, and recordId', () => {
		assert.throws(
			() =>
				expandRecordTrajectories(
					[{ id: 'mg50370', trajectory: { places: [{ id: 'eisenach', eventId: 'evt-missing' }] } }],
					catalog([]),
				),
			/悬空 eventId：evt-missing/,
		);
		assert.throws(
			() => assertEntityGraph([], catalog([birth({ personIds: ['nobody'] })])),
			/悬空 personId：nobody/,
		);
		assert.throws(
			() =>
				assertEntityGraph(
					[],
					catalog([birth({ workIds: ['missing-work'] })]),
				),
			/悬空 workId：missing-work/,
		);
		assert.throws(
			() =>
				assertEntityGraph(
					[],
					catalog([], [person()], [work({ composerPersonId: 'missing-person' })]),
				),
			/悬空 personId：missing-person/,
		);
		assert.throws(
			() =>
				assertEntityGraph(
					[{ id: 'other' }],
					catalog([
						birth({
							id: 'evt-mg50370-recording-new-york',
							role: 'recording',
							recordId: 'mg50370',
							personIds: [],
							workIds: [],
							blurb: '录音。',
						}),
					]),
				),
			/悬空 recordId：mg50370/,
		);
	});

	it('rejects a shared event with recordId, a disc event without one, and a cross-disc pointer', () => {
		assert.throws(
			() => assertEntityGraph([{ id: 'mg50370' }], catalog([birth({ recordId: 'mg50370' })])),
			/不能填写 recordId/,
		);
		assert.throws(
			() =>
				assertEntityGraph(
					[{ id: 'mg50370' }],
					catalog([
						birth({
							id: 'evt-mg50370-recording-new-york',
							role: 'recording',
							personIds: [],
							workIds: [],
							blurb: '录音。',
						}),
					]),
				),
			/必须填写 recordId/,
		);
		assert.throws(
			() =>
				expandRecordTrajectories(
					[
						{ id: 'mg50370' },
						{
							id: 'dg10049',
							trajectory: { places: [{ id: 'rec', eventId: 'evt-mg50370-recording-new-york' }] },
						},
					],
					catalog([
						birth({
							id: 'evt-mg50370-recording-new-york',
							role: 'recording',
							recordId: 'mg50370',
							personIds: [],
							workIds: [],
							blurb: '录音。',
						}),
					]),
				),
			/属于碟 mg50370/,
		);
	});

	it('allows shared other events with only a blurb (soft org-founded)', () => {
		assert.doesNotThrow(() =>
			assertEntityGraph(
				[
					{
						id: 'jp1200',
						trajectory: {
							places: [{ id: 'founded', eventId: 'evt-concertgebouw-orchestra-founded-amsterdam' }],
						},
					},
					{
						id: 'll912',
						trajectory: {
							places: [{ id: 'founded', eventId: 'evt-concertgebouw-orchestra-founded-amsterdam' }],
						},
					},
				],
				catalog([
					birth({
						id: 'evt-concertgebouw-orchestra-founded-amsterdam',
						role: 'other',
						year: 1888,
						cityZh: '阿姆斯特丹',
						city: 'Amsterdam',
						lon: 4.879,
						lat: 52.356,
						personIds: [],
						workIds: [],
						blurb: 'Concertgebouw Orchestra 创立。',
					}),
				]),
			),
		);
	});

	it('rejects an event file whose index entry has no json', () => {
		const root = mkdtempSync(join(tmpdir(), 'entities-'));
		try {
			mkdirSync(join(root, 'people'));
			writeFileSync(
				join(root, 'people', 'index.json'),
				`${JSON.stringify({ schemaVersion: 1, ids: ['js-bach'] }, null, 2)}\n`,
			);
			assert.throws(() => loadEntityCatalog(root), /不存在的 people\/js-bach\.json/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('hard-fails a dangling organizationId and founded ownership', () => {
		assert.ok(SHARED_ROLES.includes('founded'));
		assert.throws(
			() => assertEntityGraph([], catalog([founded()], [], [], [])),
			/悬空 organizationId：philharmonia-orchestra/,
		);
		assert.throws(
			() =>
				assertEntityGraph(
					[{ id: 'samplephil1' }],
					catalog([founded({ organizationIds: [], personIds: [], workIds: [] })], [], [], [organization()]),
				),
			/organizationIds 至少要有 1 个/,
		);
		assert.throws(
			() =>
				assertEntityGraph(
					[{ id: 'samplephil1' }],
					catalog([founded({ recordId: 'samplephil1' })], [], [], [organization()]),
				),
			/不能填写 recordId/,
		);
		assert.throws(
			() =>
				assertEntityGraph(
					[{ id: 'samplephil1' }],
					catalog(
						[birth({ personIds: [], workIds: [], organizationIds: ['philharmonia-orchestra'] })],
						[],
						[],
						[organization()],
					),
				),
			/必须填写 personIds 或 workIds/,
		);
		assert.doesNotThrow(() =>
			assertEntityGraph(
				[{ id: 'samplephil1' }],
				catalog([founded()], [person()], [], [organization()]),
			),
		);
		const pointer = {
			id: 'samplephil1',
			trajectory: {
				places: [{ id: 'philharmonia-founded', eventId: 'evt-philharmonia-founded-london' }],
			},
		};
		assert.throws(
			() => assertTrajectoryPointers(pointer, catalog([founded()], [], [], [])),
			/悬空 organizationId：philharmonia-orchestra/,
		);
		assert.throws(
			() =>
				assertTrajectoryPointers(
					pointer,
					catalog([founded({ recordId: 'samplephil1' })], [], [], [organization()]),
				),
			/不能填写 recordId/,
		);
		assert.throws(
			() =>
				assertTrajectoryPointers(
					pointer,
					catalog([founded({ organizationIds: [] })], [], [], [organization()]),
				),
			/organizationIds 至少要有 1 个/,
		);
		const expanded = expandRecordTrajectories(
			[pointer, { ...pointer, id: 'samplephil2' }],
			catalog([founded()], [], [], [organization()]),
		);
		assert.equal(expanded[0]?.trajectory?.places[0]?.role, 'founded');
		assert.equal(expanded[0]?.trajectory?.places[0]?.cityZh, '伦敦');
		assert.equal(expanded[1]?.trajectory?.places[0]?.eventId, 'evt-philharmonia-founded-london');
		const pins = groupOverviewPins(
			expanded.flatMap((record) =>
				(record.trajectory?.places ?? []).map((place) => ({
					recordId: record.id,
					eventId: place.eventId,
				})),
			),
		);
		assert.equal(pins.length, 1);
		assert.equal(pins[0]?.members.length, 2);
	});

	it('still accepts a transitional other blurb and an other event that names only an organization', () => {
		const parsed = parseEvent({
			schemaVersion: 1,
			id: 'evt-soft-org',
			year: 1945,
			cityZh: '伦敦',
			city: 'London',
			role: 'other',
			lon: -0.128,
			lat: 51.507,
			blurb: '爱乐乐团创立（待 founded／Organization 契约）',
			organizationIds: ['philharmonia-orchestra'],
		});
		assert.equal(parsed.role, 'other');
		assert.doesNotThrow(() =>
			assertEntityGraph([], catalog([parsed], [], [], [organization()])),
		);
		assert.doesNotThrow(() =>
			assertEntityGraph(
				[
					{
						id: 'jp1200',
						trajectory: {
							places: [{ id: 'founded', eventId: 'evt-soft-blurb' }],
						},
					},
				],
				catalog([
					{
						...parsed,
						id: 'evt-soft-blurb',
						organizationIds: [],
						personIds: [],
						workIds: [],
						recordId: null,
						blurb: 'Concertgebouw Orchestra 创立。',
					},
				]),
			),
		);
		assert.throws(
			() =>
				assertEntityGraph(
					[],
					catalog([
						{
							...parsed,
							id: 'evt-soft-empty',
							organizationIds: [],
							personIds: [],
							workIds: [],
							recordId: null,
							blurb: undefined,
						},
					]),
				),
			/或填写 blurb/,
		);
	});

	it('parses a thin organization and rejects unknown keys, bad kinds, and founded shape', () => {
		const org = parseOrganization({
			schemaVersion: 1,
			id: 'philharmonia-orchestra',
			nameZh: '爱乐乐团',
			kind: [],
		});
		assert.equal(org.name, undefined);
		assert.deepEqual(org.kind, []);
		assert.throws(
			() =>
				parseOrganization({
					schemaVersion: 1,
					id: 'philharmonia-orchestra',
					nameZh: '爱乐乐团',
					bio: '不要长传记',
				}),
			/校验失败/,
		);
		assert.throws(
			() =>
				parseOrganization({
					schemaVersion: 1,
					id: 'philharmonia-orchestra',
					nameZh: '爱乐乐团',
					kind: ['ensemble', 'venue'],
				}),
			/校验失败/,
		);
		assert.throws(
			() => parseEvent({ ...founded(), organizationIds: [] }),
			/organizationIds 至少要有 1 个/,
		);
		assert.throws(() => parseEvent({ ...founded(), recordId: 'samplephil1' }), /不能填写 recordId/);
		const event = parseEvent(founded());
		assert.deepEqual(event.organizationIds, ['philharmonia-orchestra']);
	});

	it('rejects a missing organization file the same way as a missing person', () => {
		const root = mkdtempSync(join(tmpdir(), 'orgs-'));
		try {
			mkdirSync(join(root, 'organizations'));
			writeFileSync(
				join(root, 'organizations', 'index.json'),
				`${JSON.stringify({ schemaVersion: 1, ids: ['philharmonia-orchestra'] }, null, 2)}\n`,
			);
			assert.throws(() => loadEntityCatalog(root), /不存在的 organizations\/philharmonia-orchestra\.json/);
			rmSync(join(root, 'organizations'), { recursive: true, force: true });
			const empty = loadEntityCatalog(root);
			assert.equal(empty.organizations.size, 0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('rejects a forbidden field nested on an event', () => {
		assert.throws(
			() =>
				parseEvent({
					schemaVersion: 1,
					id: 'evt-x',
					year: 1720,
					cityZh: '科滕',
					city: 'Köthen',
					role: 'composition',
					lon: 11.974,
					lat: 51.751,
					price: 1,
				}),
			/禁止字段/,
		);
	});
});

describe('migrated Bach entities', () => {
	it('shares one birth event across the Bach discs and expands a work event on the tour', () => {
		const records = resolveRecordsExport();
		const births = records.flatMap((record) =>
			(record.trajectory?.places ?? [])
				.filter((place) => place.eventId === 'evt-bach-birth-eisenach')
				.map((place) => ({ recordId: record.id, place })),
		);
		assert.deepEqual(
			births.map((stop) => stop.recordId).sort(),
			['104971', '2901461', '79307', 'd37779', 'dg10049', 'mg50370', 'ml5060', 'ms6338', 'src4119'],
		);
		for (const stop of births) {
			assert.equal(stop.place.cityZh, '艾森纳赫');
			assert.equal(stop.place.city, 'Eisenach');
			assert.equal(stop.place.year, 1685);
			assert.equal(stop.place.role, 'birth');
			assert.equal(stop.place.lon, 10.319);
			assert.equal(stop.place.lat, 50.975);
		}
		const pins = groupOverviewPins(
			births.map((stop) => ({ recordId: stop.recordId, eventId: stop.place.eventId })),
		);
		assert.equal(pins.length, 1);
		assert.equal(pins[0]?.members.length, 9);

		const suites = records.find((record) => record.id === 'mg50370');
		assert.ok(suites?.trajectory);
		const composition = suites.trajectory.places.find(
			(place) => place.eventId === 'evt-bach-cello-suites-koethen',
		);
		assert.equal(composition?.role, 'composition');
		assert.equal(composition?.city, 'Köthen');
		assert.equal(composition?.year, 1720);
		assert.match(composition?.blurb ?? '', /无伴奏大提琴组曲/);
		const recording = suites.trajectory.places.find(
			(place) => place.eventId === 'evt-mg50370-recording-new-york',
		);
		assert.equal(recording?.role, 'recording');
		assert.equal(recording?.yearLabel, '1963-04');
		const pressing = suites.trajectory.places.find(
			(place) => place.eventId === 'evt-mg50370-pressing-canada',
		);
		assert.equal(pressing?.role, 'pressing');

		const concertDiscs = records.filter((record) =>
			(record.trajectory?.places ?? []).some(
				(place) => place.eventId === 'evt-concertgebouw-orchestra-founded-amsterdam',
			),
		);
		assert.deepEqual(
			concertDiscs.map((record) => record.id).sort(),
			['jp1200', 'll912'],
		);
	});
});
