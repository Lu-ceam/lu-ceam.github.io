import { DWELL_START } from './split-stage.ts';

/**
 * Camera and callouts are parked in the 定焦 dwell.
 * A joint is still a crossfade, so it is never a reading-only scroll.
 */
export function runwayParked(local: number, joint: number): boolean {
	return joint <= 0 && local >= DWELL_START;
}

/** Same progress as measuring the runway, from a cached document top and travel. */
export function runwayProgress(scrollY: number, pageTop: number, travel: number): number {
	if (travel <= 0) return 1;
	return Math.min(1, Math.max(0, (scrollY - pageTop) / travel));
}

export type ReadingLatchInput = {
	narrow: boolean;
	local: number;
	joint: number;
	notesOpacity: number;
	placeKey: string | null;
	viewportKey: string;
	paneSettled: boolean;
};

/**
 * The phone frame is parked and its callouts have already been measured.
 * Notes stay on the heavy path until the pane has collapsed and leaders are placed.
 */
export function canLatchReading(args: ReadingLatchInput): boolean {
	if (!args.narrow || !runwayParked(args.local, args.joint)) return false;
	if (args.notesOpacity <= 0) return true;
	return args.paneSettled && args.placeKey !== null && args.placeKey === args.viewportKey;
}

/** Further scrolls on this latched phone frame only pace the reading column. */
export function readingScrollOnly(
	args: ReadingLatchInput & {
		frameIndex: number;
		latchedIndex: number | null;
		latchedKey: string | null;
		hasMetrics: boolean;
	},
): boolean {
	if (!args.hasMetrics || args.latchedIndex !== args.frameIndex || args.latchedKey !== args.viewportKey) {
		return false;
	}
	return canLatchReading(args);
}
