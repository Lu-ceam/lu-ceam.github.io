import type { LeaderPoint } from './detail-display.ts';

export type PlateRect = {
	left: number;
	right: number;
	top: number;
	bottom: number;
};

export type SplitMark = { x: number; y: number; w: number; h: number };

export type SplitLeaderInput = {
	index: number;
	mark: SplitMark;
	side: 'left' | 'right';
	note: PlateRect;
	omitLeader: boolean;
};

export type SplitLeaderResult = {
	index: number;
	points: LeaderPoint[] | null;
};

export function leaderEntersNoteInterior(
	points: readonly LeaderPoint[],
	note: PlateRect,
): boolean {
	void points;
	void note;
	throw new Error('Not implemented: leaderEntersNoteInterior');
}

export function polylinesProperlyCross(
	left: readonly LeaderPoint[],
	right: readonly LeaderPoint[],
): boolean {
	void left;
	void right;
	throw new Error('Not implemented: polylinesProperlyCross');
}

export function splitLeaderPath(args: {
	mark: SplitMark;
	side: 'left' | 'right';
	note: PlateRect;
}): LeaderPoint[] | null {
	void args;
	throw new Error('Not implemented: splitLeaderPath');
}

export function selectSplitLeaders(items: readonly SplitLeaderInput[]): SplitLeaderResult[] {
	void items;
	throw new Error('Not implemented: selectSplitLeaders');
}
