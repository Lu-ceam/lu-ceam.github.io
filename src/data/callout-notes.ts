import type { NoteKind } from './detail-display.ts';

export const CALLOUT_ATTR = 'data-callout';
export const IMAGERY_VAR = '--imagery-h';
export const SIZE_CONTAINER_SELECTOR = '.record-page--split .split-frame';

export type CalloutMode = 'margin' | 'margin-first';

export type SplitCalloutArgs = {
	narrow: boolean;
	stripPx: number;
	rem: number;
	placements: readonly { kind: NoteKind }[];
};

const CIRCLED_NUMERALS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

export function noteIndexPrefix(index: number): string {
	if (Number.isInteger(index) && index >= 1 && index <= CIRCLED_NUMERALS.length) {
		return CIRCLED_NUMERALS[index - 1] ?? `(${index})`;
	}
	return `(${index})`;
}

export function splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null {
	void args.stripPx;
	void args.rem;
	if (!args.narrow) return null;
	if (args.placements.length === 0) return null;
	if (args.placements.every((note) => note.kind === 'side')) return 'margin';
	return 'margin-first';
}
