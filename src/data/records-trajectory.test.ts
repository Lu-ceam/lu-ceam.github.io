import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { assertLayoutHasNoTrajectory } from './records.ts';
import { loadRecordsExport, parseRecord } from './records-export.ts';

function baseRecord(extra: Record<string, unknown> = {}) {
	return {
		id: 'demo01',
		composer: '巴赫',
		work: '作品',
		performers: '某人',
		label: '厂牌',
		catalogNumber: 'X 1',
		category: '古典',
		pressing: '不详',
		matrix: '不详',
		recording: '不详',
		eq: 'RIAA',
		condition: '未定',
		verificationStatus: 'pending',
		statusLabel: '待复核',
		notes: '一句公开说明。',
		links: [],
		images: [{ file: 'images/cover-front.webp', kind: 'cover-front', caption: '封面' }],
		details: [],
		...extra,
	};
}

function place(extra: Record<string, unknown> = {}) {
	return {
		id: 'leipzig',
		year: 1723,
		cityZh: '莱比锡',
		city: 'Leipzig',
		role: 'composition',
		lon: 12.373,
		lat: 51.34,
		...extra,
	};
}

describe('trajectory on record.json', () => {
	it('accepts a place and defaults nothing into the layout', () => {
		const parsed = parseRecord(
			baseRecord({
				trajectory: {
					places: [place({ yearLabel: '1723–50', zoom: 8, blurb: '一句' })],
				},
			}),
		);
		assert.equal(parsed.trajectory?.places.length, 1);
		assert.equal(parsed.trajectory?.places[0]?.yearLabel, '1723–50');
	});

	it('fails an empty places array', () => {
		assert.throws(
			() => parseRecord(baseRecord({ trajectory: { places: [] } })),
			/places 不能为空/,
		);
	});

	it('fails an unknown trajectory key', () => {
		assert.throws(
			() => parseRecord(baseRecord({ trajectory: { places: [place()], note: 'x' } })),
			/校验失败/,
		);
	});

	it('requires a blurb when role is other', () => {
		assert.throws(
			() => parseRecord(baseRecord({ trajectory: { places: [place({ id: 'utrecht', role: 'other' })] } })),
			/other/,
		);
	});

	it('rejects a duplicate place id, a year out of range, and a bad slug', () => {
		assert.throws(
			() =>
				parseRecord(
					baseRecord({
						trajectory: { places: [place(), place({ cityZh: '另一处' })] },
					}),
				),
			/重复的 place id/,
		);
		assert.throws(
			() => parseRecord(baseRecord({ trajectory: { places: [place({ year: 1499 })] } })),
			/校验失败/,
		);
		assert.throws(
			() => parseRecord(baseRecord({ trajectory: { places: [place({ id: 'NewYork' })] } })),
			/校验失败/,
		);
	});

	it('rejects forbidden keys nested under trajectory', () => {
		assert.throws(
			() =>
				parseRecord(
					baseRecord({
						trajectory: { places: [place({ price: 1 })] },
					}),
				),
			/禁止字段/,
		);
	});
});

describe('layout rejects trajectory coordinates', () => {
	it('rejects trajectory, places, lon, and lat keys', () => {
		for (const key of ['trajectory', 'places', 'lon', 'lat', 'Lon']) {
			assert.throws(
				() => assertLayoutHasNoTrajectory({ id: 'x', [key]: 1 }),
				/轨迹字段/,
			);
		}
	});

	it('rejects a nested lat', () => {
		assert.throws(
			() => assertLayoutHasNoTrajectory([{ id: 'x', details: [{ lat: 1 }] }]),
			/details\.0\.lat/,
		);
	});

	it('accepts the real layout file', () => {
		const layout = JSON.parse(readFileSync(join(process.cwd(), 'src/data/records-layout.json'), 'utf8'));
		assert.doesNotThrow(() => assertLayoutHasNoTrajectory(layout));
	});
});

describe('d37779 illustrative trajectory', () => {
	it('matches the handoff nodes and stays on the legacy record only', () => {
		const records = loadRecordsExport();
		const sample = records.find((record) => record.id === 'd37779');
		assert.ok(sample);
		assert.equal(sample.legacy, true);
		const places = sample.trajectory?.places;
		assert.ok(places);
		assert.deepEqual(
			places.map((place) => [place.id, place.year, place.role, place.lat, place.lon, place.zoom]),
			[
				['eisenach', 1685, 'birth', 50.975, 10.319, 7],
				['leipzig', 1723, 'composition', 51.34, 12.373, 8],
				['toronto', 1932, 'birth', 43.653, -79.383, 7],
				['ny-30th', 1981, 'recording', 40.744, -73.978, 10],
				['holland', 1982, 'pressing', 52.132, 5.291, 6],
				['utrecht', 1982, 'other', 52.09, 5.122, 9],
			],
		);
		assert.equal(places[1]?.yearLabel, '1723–50');
		assert.equal(places[3]?.yearLabel, '1981-05');
		assert.equal(places[4]?.city, 'Netherlands');
		assert.ok((places[4]?.zoom ?? 99) <= 7);
		assert.equal(places[5]?.yearLabel, '—');
		for (const place of places) {
			assert.match(place.blurb ?? '', /待馆员核定/);
		}
		assert.equal(records.find((record) => record.id === 'lpbr6083')?.trajectory, undefined);
		assert.equal(records.filter((record) => record.trajectory).length, 1);
	});
});
