import { MIN_NOTE_REM } from './detail-display.ts';

export const CALLOUT_ATTR = 'data-callout';
export const IMAGERY_VAR = '--imagery-h';
export const SIZE_CONTAINER_SELECTOR = '.record-page--split .split-frame';

export type CalloutMode = 'margin' | 'overlay-no-gutter';

export type SplitCalloutArgs = {
	narrow: boolean;
	stripPx: number;
	rem: number;
	placements: readonly { kind: 'side' | 'letterbox' | 'scrim' }[];
};

const CIRCLED_NUMERALS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

export function noteIndexPrefix(index: number): string {
	if (Number.isInteger(index) && index >= 1 && index <= CIRCLED_NUMERALS.length) {
		return CIRCLED_NUMERALS[index - 1] ?? `(${index})`;
	}
	return `(${index})`;
}

export function splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null {
	if (!args.narrow) return null;
	if (args.stripPx + 1e-6 < MIN_NOTE_REM * args.rem) return 'overlay-no-gutter';
	if (args.placements.length > 0 && args.placements.every((note) => note.kind === 'side')) {
		return 'margin';
	}
	return null;
}
