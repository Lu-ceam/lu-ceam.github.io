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

export function noteIndexPrefix(index: number): string {
	void index;
	throw new Error('Not implemented: noteIndexPrefix');
}

export function splitCalloutMode(args: SplitCalloutArgs): CalloutMode | null {
	void args;
	throw new Error('Not implemented: splitCalloutMode');
}
