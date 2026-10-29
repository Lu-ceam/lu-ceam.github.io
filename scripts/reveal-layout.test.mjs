import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { cropIsProperSubRectangle, expectedPlateHeight } from '../src/data/detail-display.ts';
import { detailPlatePath, detailUprightPath } from '../src/data/records.ts';
import { isDataOnlyPath } from './ship-records.mjs';
import {
	assetPaths,
	ensureRevealAssets,
	findRecordSpan,
	isRevealDetail,
	minimalRevealCrop,
	readWebpSize,
	replaceLayoutRecord,
} from './reveal-layout.mjs';

function fakeWebp(width, height) {
	const buf = Buffer.alloc(30);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(22, 4);
	buf.write('WEBP', 8);
	buf.write('VP8X', 12);
	const w = width - 1;
	const h = height - 1;
	buf[24] = w & 0xff;
	buf[25] = (w >> 8) & 0xff;
	buf[26] = (w >> 16) & 0xff;
	buf[27] = h & 0xff;
	buf[28] = (h >> 8) & 0xff;
	buf[29] = (h >> 16) & 0xff;
	return buf;
}

describe('minimal reveal crop', () => {
	it('reads the published 2901461 cover and insets it by at least 2px', async () => {
		const size = readWebpSize('public/records/2901461/cover.webp');
		assert.deepEqual(size, { width: 1400, height: 1385 });
		const crop = minimalRevealCrop(size.width, size.height, size.width, size.height);
		assert.equal(cropIsProperSubRectangle(crop, size), true);
		assert.ok(crop.x + crop.w <= size.width);
		assert.ok(crop.y + crop.h <= size.height);
		const expected = expectedPlateHeight(size.width, crop);
		assert.ok(Math.abs(size.height - expected) <= 1);
	});

	it('matches a square plate', () => {
		const crop = minimalRevealCrop(400, 400, 400, 400);
		assert.equal(cropIsProperSubRectangle(crop, { width: 400, height: 400 }), true);
		assert.ok(Math.abs(400 - expectedPlateHeight(400, crop)) <= 1);
	});
});

describe('asset paths', () => {
	it('matches the site plate and upright paths', () => {
		const plain = { part: 'cover' };
		assert.equal(assetPaths('2901461', plain).plate, detailPlatePath('2901461', plain));
		assert.equal(assetPaths('2901461', plain).upright, detailUprightPath('2901461', plain));
		const faced = { part: 'label', disc: 1, side: 2 };
		assert.equal(assetPaths('ab1', faced).plate, detailPlatePath('ab1', faced));
		assert.equal(assetPaths('ab1', faced).upright, detailUprightPath('ab1', faced));
	});
});

describe('layout splicing', () => {
	it('rewrites one record and keeps a sibling angleDeg of 0.0', () => {
		const raw = `[
  {
    "id": "keep0",
    "angleDeg": 0.0
  },
  {
    "id": "edit1",
    "marks": []
  }
]
`;
		const next = replaceLayoutRecord(raw, { id: 'edit1', marks: [], upright: { width: 4, height: 4 } });
		assert.match(next, /"angleDeg": 0\.0/);
		assert.equal(findRecordSpan(next, 'keep0') !== null, true);
		const parsed = JSON.parse(next);
		assert.equal(parsed[1].upright.width, 4);
		assert.equal(parsed[0].id, 'keep0');
	});
});

describe('ensureRevealAssets', () => {
	it('copies a plate to upright and leaves an existing reveal row alone', async () => {
		const root = await mkdtemp(join(tmpdir(), 'reveal-'));
		try {
			const recordsRoot = join(root, 'records');
			const publicRoot = join(root, 'public');
			const layoutPath = join(root, 'records-layout.json');
			await mkdir(join(recordsRoot, 'records', 'ab1'), { recursive: true });
			await mkdir(join(recordsRoot, 'records', 'done1'), { recursive: true });
			await mkdir(join(publicRoot, 'records', 'ab1'), { recursive: true });
			await mkdir(join(publicRoot, 'records', 'done1'), { recursive: true });
			await writeFile(
				join(recordsRoot, 'index.json'),
				`${JSON.stringify({
					schemaVersion: 1,
					records: [
						{ id: 'ab1' },
						{ id: 'done1' },
					],
				})}\n`,
			);
			await writeFile(join(recordsRoot, 'records', 'ab1', 'record.json'), '{}\n');
			await writeFile(join(recordsRoot, 'records', 'done1', 'record.json'), '{}\n');
			const plate = fakeWebp(40, 30);
			await writeFile(join(publicRoot, 'records', 'ab1', 'cover.webp'), plate);
			const donePlate = fakeWebp(20, 20);
			await writeFile(join(publicRoot, 'records', 'done1', 'label.webp'), donePlate);
			await writeFile(join(publicRoot, 'records', 'done1', 'label-upright.webp'), donePlate);
			await writeFile(join(publicRoot, 'records', 'done1', 'hero.webp'), donePlate);
			const doneDetail = {
				part: 'label',
				source: 'images/label.webp',
				alt: '标签',
				plate: { src: '/records/done1/label.webp', width: 20, height: 20 },
				upright: { src: '/records/done1/label-upright.webp', width: 20, height: 20 },
				transform: {
					cropSpace: 'upright',
					angleDeg: 0,
					crop: minimalRevealCrop(20, 20, 20, 20),
					exportWidth: 20,
				},
				marks: [{ id: '1', badge: 'tl', side: 'auto', x: 0, y: 0, w: 4, h: 4 }],
			};
			assert.equal(isRevealDetail(doneDetail), true);
			const original = `${JSON.stringify(
				[
					{
						id: 'ab1',
						image: { src: '/records/ab1/hero.webp', width: 40, height: 30 },
						detailsNote: '尚无编号题铭。',
						details: [
							{
								part: 'cover',
								source: 'images/cover-front.jpg',
								alt: '封套',
								plate: { src: '/records/ab1/cover.webp', width: 40, height: 30 },
								marks: [],
							},
						],
					},
					{
						id: 'done1',
						image: { src: '/records/done1/hero.webp', width: 20, height: 20 },
						detailsNote: '已有题铭。',
						details: [doneDetail],
					},
				],
				null,
				2,
			)}\n`;
			await writeFile(layoutPath, original);
			await writeFile(join(publicRoot, 'records', 'ab1', 'hero.webp'), plate);
			const first = await ensureRevealAssets({ recordsRoot, layoutPath, publicRoot });
			assert.deepEqual(first.changed, ['ab1']);
			const written = await readFile(layoutPath, 'utf8');
			assert.match(written, /"id": "done1"/);
			assert.match(written, /已有题铭/);
			const parsed = JSON.parse(written);
			const cover = parsed[0].details[0];
			assert.equal(cover.marks.length, 0);
			assert.equal(isRevealDetail(cover), true);
			const upright = await readFile(join(publicRoot, 'records', 'ab1', 'cover-upright.webp'));
			assert.deepEqual(upright, plate);
			const second = await ensureRevealAssets({ recordsRoot, layoutPath, publicRoot });
			assert.deepEqual(second.changed, []);
			assert.equal(await readFile(layoutPath, 'utf8'), written);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe('ship-records', () => {
	it('treats layout and public images as data-only', () => {
		assert.equal(isDataOnlyPath('records/index.json'), true);
		assert.equal(isDataOnlyPath('public/records/2901461/cover-upright.webp'), true);
		assert.equal(isDataOnlyPath('src/data/records-layout.json'), true);
		assert.equal(isDataOnlyPath('src/data/detail-display.ts'), false);
		assert.equal(isDataOnlyPath('src/pages/records/[id].astro'), false);
	});

	it('exits non-zero when the export has a forbidden field', () => {
		const dir = spawnSync('mktemp', ['-d'], { encoding: 'utf8' }).stdout.trim();
		try {
			spawnSync('mkdir', ['-p', join(dir, 'records')]);
			const index = {
				schemaVersion: 1,
				generatedAt: '2026-10-29T00:00:00.000Z',
				records: [],
				price: 1,
			};
			spawnSync('tee', [join(dir, 'index.json')], { input: `${JSON.stringify(index)}\n` });
			const result = spawnSync(process.execPath, ['scripts/ship-records.mjs', dir], {
				encoding: 'utf8',
				cwd: process.cwd(),
			});
			assert.notEqual(result.status, 0);
			assert.match(`${result.stderr}${result.stdout}`, /禁止字段/);
		} finally {
			spawnSync('rm', ['-rf', dir]);
		}
	});

	it('exits non-zero without an export directory', () => {
		const result = spawnSync(process.execPath, ['scripts/ship-records.mjs'], {
			encoding: 'utf8',
			cwd: process.cwd(),
		});
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /用法/);
	});
});
