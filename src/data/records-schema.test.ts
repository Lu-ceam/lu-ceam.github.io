import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { findInternalMarkers } from '../../scripts/check-public-records.mjs';
import { loadRecords } from './records-load.ts';
import {
	catalogWhen,
	expectedVerification,
	parseIndex,
	parseRecord,
	showPressingDetails,
	storyBody,
} from './records-schema.ts';

const sha = 'a'.repeat(64);

function indexOf(id: string) {
	return {
		schemaVersion: 1,
		generatedAt: '2026-10-24T00:00:00+08:00',
		records: [{ id, updatedAt: '2026-10-24T00:00:00+08:00', sha256: sha }],
	};
}

function recordOf(id: string, extra: Record<string, unknown> = {}) {
	return {
		id,
		composer: '巴赫',
		work: '作品',
		performers: '某人',
		label: '厂牌',
		catalogNumber: 'CAT 1',
		category: '古典',
		pressing: '压片说明',
		matrix: '矩阵说明',
		recording: '1960 年录音',
		eq: 'RIAA',
		condition: 'Goldmine VG',
		verificationStatus: 'pending',
		statusLabel: '待核（仅口述）',
		notes: '一句简介。',
		links: [],
		images: [
			{ file: 'images/cover-front.webp', kind: 'cover-front', caption: '封面', showsPrice: true },
		],
		details: [],
		...extra,
	};
}

describe('schemaVersion and forbidden fields', () => {
	it('rejects an unknown schemaVersion', () => {
		assert.throws(
			() => parseIndex({ ...indexOf('abc'), schemaVersion: 2 }, 'index.json'),
			/未知的 schemaVersion/,
		);
		assert.throws(() => parseIndex({ generatedAt: 'x', records: indexOf('abc').records }, 'index.json'), /未知的 schemaVersion/);
	});

	it('rejects forbidden keys and keeps showsPrice', () => {
		assert.throws(() => parseRecord(recordOf('abc', { evidence: '内部' })), /禁止字段 evidence/);
		assert.throws(
			() => parseRecord(recordOf('abc', { links: [{ title: 't', href: 'https://example.com', site: 'example.com', price: '1' }] })),
			/禁止字段 price/,
		);
		const parsed = parseRecord(recordOf('abc'));
		assert.equal(parsed.images[0]?.showsPrice, true);
		assert.equal(parsed.statusLabel, '待核（仅口述）');
	});

	it('requires verificationStatus to follow the label', () => {
		assert.throws(
			() => parseRecord(recordOf('abc', { verificationStatus: 'verified', statusLabel: '待复核' })),
			/verificationStatus 应为 pending/,
		);
		assert.equal(expectedVerification('大体已核（两面待补）'), 'partial');
		assert.equal(expectedVerification('已核（死蜡未拍）'), 'verified');
		assert.equal(expectedVerification('待核（仅口述）'), 'pending');
	});
});

describe('pressing visibility', () => {
	it('shows pressing for verified and partial, and hides it for pending', () => {
		assert.equal(
			showPressingDetails({ legacy: false, statusLabel: '已核（死蜡未拍）', verificationStatus: 'verified' }),
			true,
		);
		assert.equal(
			showPressingDetails({ legacy: false, statusLabel: '大体已核（两面待补）', verificationStatus: 'partial' }),
			true,
		);
		assert.equal(
			showPressingDetails({ legacy: false, statusLabel: '待核（仅口述）', verificationStatus: 'pending' }),
			false,
		);
	});

	it('hides legacy pressing unless the old label starts with 已核', () => {
		assert.equal(
			showPressingDetails({ legacy: true, statusLabel: '待复核', verificationStatus: 'pending' }),
			false,
		);
		assert.equal(
			showPressingDetails({ legacy: true, statusLabel: '大体已核（两面待补）', verificationStatus: 'partial' }),
			false,
		);
		assert.equal(
			showPressingDetails({ legacy: true, statusLabel: '已核（纹尾未拍）', verificationStatus: 'verified' }),
			true,
		);
	});
});

describe('story and catalog year', () => {
	it('drops the leading markdown title', () => {
		assert.equal(storyBody('# 标题\n\n第一段。\n\n第二段。'), '第一段。\n\n第二段。');
	});

	it('shows a plain year in the catalog and the decade otherwise', () => {
		assert.equal(catalogWhen({ year: '2024', decade: '2020s' }), '2024');
		assert.equal(catalogWhen({ year: '1954–55（推测）', decade: '1950s' }), '1950s');
		assert.equal(catalogWhen({ decade: '1940s' }), '1940s');
	});
});

describe('dist marker check', () => {
	it('ignores 待补拍 inside public condition text', () => {
		assert.deepEqual(findInternalMarkers('封底与内袋待补拍。'), []);
		assert.deepEqual(findInternalMarkers('"showsPrice": true'), []);
	});

	it('flags field names and the old section headings', () => {
		assert.ok(findInternalMarkers('needLead').includes('needLead'));
		assert.ok(findInternalMarkers('<summary>待补拍<span class="fold-lead">').includes('<summary>待补拍'));
		assert.ok(findInternalMarkers('证据核对').includes('证据核对'));
		assert.ok(findInternalMarkers('{"evidence":"x"}').includes('forbidden-field-key'));
		assert.ok(findInternalMarkers('{"source-of-purchase":"shop"}').includes('forbidden-field-key'));
	});
});

describe('loadRecords', () => {
	it('fails when a referenced image is missing', async () => {
		const root = await mkdtemp(join(tmpdir(), 'records-missing-'));
		await mkdir(join(root, 'records', 'abc'), { recursive: true });
		await writeFile(join(root, 'index.json'), JSON.stringify(indexOf('abc')));
		await writeFile(join(root, 'records', 'abc', 'record.json'), JSON.stringify(recordOf('abc')));
		await writeFile(join(root, 'records', 'abc', 'story.md'), '# 标题\n\n正文。\n');
		await assert.rejects(
			() => loadRecords({ exportRoot: root, legacyRoot: '', publish: false }),
			/找不到图片/,
		);
	});

	it('loads a record and does not publish runout images into the view', async () => {
		const root = await mkdtemp(join(tmpdir(), 'records-ok-'));
		const dir = join(root, 'records', 'abc');
		await mkdir(join(dir, 'images'), { recursive: true });
		await mkdir(join(dir, 'details'), { recursive: true });
		await sharp({
			create: { width: 8, height: 6, channels: 3, background: { r: 10, g: 20, b: 30 } },
		})
			.webp()
			.toFile(join(dir, 'images', 'cover-front.webp'));
		await sharp({
			create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } },
		})
			.webp()
			.toFile(join(dir, 'images', 'runout-d1-s1.webp'));
		await writeFile(join(root, 'index.json'), JSON.stringify(indexOf('abc')));
		await writeFile(
			join(dir, 'record.json'),
			JSON.stringify(
				recordOf('abc', {
					images: [
						{ file: 'images/cover-front.webp', kind: 'cover-front', caption: '封面' },
						{ file: 'images/runout-d1-s1.webp', kind: 'runout', caption: '死蜡' },
					],
				}),
			),
		);
		await writeFile(join(dir, 'story.md'), '# 标题\n\n1962 年的正文。\n');
		const records = await loadRecords({ exportRoot: root, legacyRoot: '', publish: false });
		assert.equal(records.length, 1);
		assert.equal(records[0]?.photos.length, 0);
		assert.equal(records[0]?.statusLabel, '待核（仅口述）');
		assert.equal(records[0]?.decade, '1960s');
		assert.equal(records[0]?.image.width, 8);
	});
});
