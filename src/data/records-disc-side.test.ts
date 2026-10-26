import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	detailDomKey,
	detailPlatePath,
	detailUprightPath,
	formatDetailFace,
	formatDetailFaceLong,
	layoutDetailFaceKey,
	layoutFileSchema,
	parseFaceFromSource,
	resolveDetailFace,
} from './records.ts';

const here = dirname(fileURLToPath(import.meta.url));

function minimalDetail(overrides: Record<string, unknown> = {}) {
	const part = (overrides.part as string) ?? 'label';
	const disc = overrides.disc as number | undefined;
	const side = overrides.side as number | undefined;
	const id = 'x1';
	const plateSrc =
		disc !== undefined && side !== undefined
			? `/records/${id}/${part}-d${disc}-s${side}.webp`
			: `/records/${id}/${part}.webp`;
	return {
		part,
		...(disc !== undefined ? { disc } : {}),
		...(side !== undefined ? { side } : {}),
		source: (overrides.source as string) ?? 'details/label-d1-s2.webp',
		alt: '标签',
		plate: { src: plateSrc, width: 100, height: 100 },
		marks: [],
		...Object.fromEntries(
			Object.entries(overrides).filter(([k]) => !['part', 'disc', 'side', 'source'].includes(k)),
		),
	};
}

function minimalRecord(details: unknown[]) {
	return {
		id: 'x1',
		image: { src: '/records/x1/hero.webp', width: 200, height: 200 },
		detailsNote: '编号对照',
		details,
	};
}

describe('parseFaceFromSource', () => {
	it('reads dN-sM from the basename', () => {
		assert.deepEqual(parseFaceFromSource('details/label-d1-s2.webp'), { disc: 1, side: 2 });
		assert.deepEqual(parseFaceFromSource('details/label-d2-s3.webp'), { disc: 2, side: 3 });
		assert.deepEqual(parseFaceFromSource('label-d10-s12.webp'), { disc: 10, side: 12 });
	});

	it('accepts a suffix after the face stem', () => {
		assert.deepEqual(parseFaceFromSource('details/label-d1-s2-disc.webp'), { disc: 1, side: 2 });
	});

	it('returns undefined without a face stem', () => {
		assert.equal(parseFaceFromSource('details/cover-front.webp'), undefined);
		assert.equal(parseFaceFromSource('details/insert-1.webp'), undefined);
		assert.equal(parseFaceFromSource('details/label.webp'), undefined);
	});
});

describe('resolveDetailFace', () => {
	it('lets explicit disc+side win over source', () => {
		assert.deepEqual(
			resolveDetailFace({ disc: 2, side: 4, source: 'details/label-d1-s2.webp' }),
			{ disc: 2, side: 4 },
		);
	});

	it('parses source when both fields are omitted', () => {
		assert.deepEqual(resolveDetailFace({ source: 'details/label-d1-s2.webp' }), {
			disc: 1,
			side: 2,
		});
	});

	it('does not merge a lone explicit field with the parsed face', () => {
		assert.equal(resolveDetailFace({ disc: 2, source: 'details/label-d1-s2.webp' }), undefined);
		assert.equal(resolveDetailFace({ side: 2, source: 'details/label-d1-s2.webp' }), undefined);
	});
});

describe('formatDetailFace', () => {
	it('formats the short chrome label', () => {
		assert.equal(formatDetailFace({ disc: 1, side: 2 }), 'd1-s2');
		assert.equal(formatDetailFace(undefined), '');
	});

	it('documents the long chrome label', () => {
		assert.equal(formatDetailFaceLong({ disc: 1, side: 2 }), 'Disc 1 · side 2');
		assert.equal(formatDetailFaceLong(undefined), '');
	});
});

describe('detail asset paths', () => {
	it('keeps legacy paths without explicit disc+side', () => {
		assert.equal(detailPlatePath('falp381', { part: 'label' }), '/records/falp381/label.webp');
		assert.equal(
			detailUprightPath('falp381', { part: 'label' }),
			'/records/falp381/label-upright.webp',
		);
		assert.equal(detailDomKey({ part: 'label' }), 'label');
	});

	it('uses dN-sM stems when both fields are explicit', () => {
		assert.equal(
			detailPlatePath('falp381', { part: 'label', disc: 1, side: 2 }),
			'/records/falp381/label-d1-s2.webp',
		);
		assert.equal(
			detailUprightPath('falp381', { part: 'label', disc: 1, side: 2 }),
			'/records/falp381/label-d1-s2-upright.webp',
		);
		assert.equal(detailDomKey({ part: 'label', disc: 1, side: 2 }), 'label-d1-s2');
	});

	it('ignores a lone field for asset naming', () => {
		assert.equal(detailPlatePath('x', { part: 'label', disc: 1 }), '/records/x/label.webp');
		assert.equal(detailPlatePath('x', { part: 'label', side: 2 }), '/records/x/label.webp');
	});
});

describe('layout uniqueness refine', () => {
	it('allows the same part with different explicit disc/side', () => {
		const parsed = layoutFileSchema.safeParse([
			minimalRecord([
				minimalDetail({ part: 'label', disc: 1, side: 1, source: 'details/label-d1-s1.webp' }),
				minimalDetail({ part: 'label', disc: 1, side: 2, source: 'details/label-d1-s2.webp' }),
			]),
		]);
		assert.equal(parsed.success, true, parsed.success ? '' : parsed.error.message);
	});

	it('rejects duplicate (part, disc??0, side??0)', () => {
		const parsed = layoutFileSchema.safeParse([
			minimalRecord([
				minimalDetail({ part: 'label', source: 'details/label-d1-s1.webp' }),
				minimalDetail({ part: 'label', source: 'details/label-d1-s2.webp' }),
			]),
		]);
		assert.equal(parsed.success, false);
		const messages = parsed.success ? [] : parsed.error.issues.map((i) => i.message);
		assert.ok(messages.some((m) => m.includes('重复的 part/disc/side')));
	});

	it('rejects the same explicit face twice', () => {
		const parsed = layoutFileSchema.safeParse([
			minimalRecord([
				minimalDetail({ part: 'label', disc: 1, side: 2, source: 'details/a.webp' }),
				minimalDetail({ part: 'label', disc: 1, side: 2, source: 'details/b.webp' }),
			]),
		]);
		assert.equal(parsed.success, false);
	});

	it('keys omit parsed-from-source faces', () => {
		assert.equal(layoutDetailFaceKey({ part: 'label' }), ['label', 0, 0].join('\0'));
		assert.equal(layoutDetailFaceKey({ part: 'label', disc: 1, side: 2 }), ['label', 1, 2].join('\0'));
	});
});

describe('existing layout still validates (shape)', () => {
	it('accepts records-layout.json without rewriting entries', () => {
		const raw = JSON.parse(readFileSync(join(here, 'records-layout.json'), 'utf8'));
		const parsed = layoutFileSchema.safeParse(raw);
		assert.equal(parsed.success, true, parsed.success ? '' : parsed.error.message);
	});
});
