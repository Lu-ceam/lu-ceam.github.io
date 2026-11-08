/**
 * Whole-model oracle.
 *
 * `src/data/records.ts` loads the entire export + layout at import time and
 * throws on the first problem. That is the real production model, so the
 * validator uses it as an oracle instead of re-implementing layout merging,
 * reveal detection, or the public hide rules for 内圈刻字 / 压片.
 *
 * If the oracle throws, every raw inventory row is kept, the dependent checks
 * become `blocked`, and the run cannot report the requested layer as passed.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DisplayImageMap } from './report.ts';

export type ModelRecord = {
	id: string;
	artist: string;
	composer: string;
	work: string;
	label: string;
	catalogNumber: string;
	category: string;
	matrix: string | null;
	pressing: string | null;
	decade: string;
	year?: number;
	recording: string;
	condition: string;
	eq: string;
	story: string;
	notes: string;
	links: { title: string; href: string; site: string }[];
	status: string;
	photo: string;
	image: { src: string; width: number; height: number };
	detailsNote: string;
	details: Array<{
		part: string;
		disc?: number;
		side?: number;
		source: string;
		plate: { src: string; width: number; height: number };
		upright?: { src: string; width: number; height: number };
		transform?: unknown;
		marks: Array<{ id: string; label?: string; note?: string }>;
		caption: string;
		alt: string;
		text: string;
	}>;
	legacy: boolean;
	trajectory?: unknown;
};

export type ModelState =
	| {
			ok: true;
			records: Map<string, ModelRecord>;
			ids: string[];
			showMatrix: (record: ModelRecord) => boolean;
			showPressing: (record: ModelRecord) => boolean;
			detailMode: (detail: ModelRecord['details'][number]) => 'reveal' | 'callout' | 'legacy';
			visibleDetailText: (detail: ModelRecord['details'][number]) => string | null;
		}
	| { ok: false; reason: string };

/**
 * Import the whole-model module that belongs to `repoRoot`. `records.ts` uses
 * `process.cwd()` defaults and imports its layout JSON relatively, so both the
 * module path and the cwd are resolved from the given root. The real checkout
 * and an isolated fixture tree therefore load their own model without editing
 * any shared file.
 */
export async function loadModel(repoRoot: string): Promise<ModelState> {
	const previous = process.cwd();
	try {
		process.chdir(repoRoot);
		try {
			const [model, display] = await Promise.all([
				import(pathToFileURL(join(repoRoot, 'src/data/records.ts')).href),
				import(pathToFileURL(join(repoRoot, 'src/data/detail-display.ts')).href),
			]);
			const records = model.records as unknown as ModelRecord[];
			const map = new Map(records.map((record) => [record.id, record]));
			return {
				ok: true,
				records: map,
				ids: records.map((record) => record.id),
				showMatrix: (record) => model.showMatrix(record as never),
				showPressing: (record) => model.showPressing(record as never),
				detailMode: (detail) => display.detailMode(detail as never),
				visibleDetailText: (detail) => display.visibleDetailText(detail as never) ?? null,
			};
		} catch (error) {
			return { ok: false, reason: error instanceof Error ? error.message : String(error) };
		}
	} finally {
		process.chdir(previous);
	}
}

/**
 * The layout-derived display mapping: which raster each detail renders and with
 * what geometry. This is the real `records.ts` merge (plate, upright, transform),
 * not a guess about the payload.
 */
export function expectedDisplayImages(
	record: ModelRecord,
	hasChapterShell: boolean,
	modeOf: (detail: ModelRecord['details'][number]) => 'reveal' | 'callout' | 'legacy',
): DisplayImageMap {
	return {
		// The hero <img> is only in the `!hasReveal` branch of the production page.
		hero: hasChapterShell ? null : { ...record.image },
		details: record.details.map((detail) => {
			const mode = modeOf(detail);
			// The production page renders the crop-geometry upright only for reveal.
			const rendersUpright = mode === 'reveal' && detail.upright !== undefined && detail.transform !== undefined;
			return {
				part: detail.part,
				mode,
				plate: { ...detail.plate },
				upright: rendersUpright
					? {
							src: detail.upright!.src,
							width: detail.upright!.width,
							height: detail.upright!.height,
							crop: {
								...(detail.transform as { crop: { x: number; y: number; w: number; h: number } }).crop,
							},
						}
					: null,
			};
		}),
	};
}

export function expectedPublicAssets(record: ModelRecord): string[] {
	const out = new Set<string>();
	out.add(record.image.src);
	for (const detail of record.details) {
		out.add(detail.plate.src);
		if (detail.upright) out.add(detail.upright.src);
	}
	return [...out].sort();
}

