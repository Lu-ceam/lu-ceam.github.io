export function settledImageryHeight(args: {
	paneHeight: number;
	plate: { top: number; bottom: number };
	notes: readonly { top: number; bottom: number }[];
	padPx: number;
}): number {
	let unionTop = args.plate.top;
	let unionBottom = args.plate.bottom;
	for (const note of args.notes) {
		unionTop = Math.min(unionTop, note.top);
		unionBottom = Math.max(unionBottom, note.bottom);
	}
	const contentH = unionBottom - unionTop + 2 * args.padPx;
	return Math.min(args.paneHeight, contentH);
}
