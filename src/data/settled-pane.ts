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

export type HugPlate = {
	left: number;
	top: number;
	width: number;
	height: number;
};

/**
 * Move a plate measured in the tall pane up so the note union sits on the pad.
 * Height is the hugged imagery band. A second call with notes shifted by the
 * same delta does not move the plate again.
 */
export function hugSettledPlate(args: {
	paneHeight: number;
	plate: HugPlate;
	notes: readonly { top: number; bottom: number }[];
	padPx: number;
}): { height: number; plate: HugPlate } {
	const height = settledImageryHeight({
		paneHeight: args.paneHeight,
		plate: { top: args.plate.top, bottom: args.plate.top + args.plate.height },
		notes: args.notes,
		padPx: args.padPx,
	});
	let unionTop = args.plate.top;
	for (const note of args.notes) unionTop = Math.min(unionTop, note.top);
	const delta = unionTop - args.padPx;
	return {
		height,
		plate: {
			left: args.plate.left,
			top: args.plate.top - delta,
			width: args.plate.width,
			height: args.plate.height,
		},
	};
}
