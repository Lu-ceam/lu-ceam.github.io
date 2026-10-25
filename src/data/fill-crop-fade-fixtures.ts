export type FillCropWindow = {
	cropT: 0 | 0.5 | 1;
	left: number;
	top: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
};

export type FillCropRect = { left: number; top: number; width: number; height: number };

export type FillCropDetail = {
	natural: { width: number; height: number };
	plate: { width: number; height: number };
	crop: { x: number; y: number; w: number; h: number };
};

export type FillCropFixture = {
	id: 'mhjl329';
	rem: 18;
	desk: { width: 801; height: 900 };
	phone: { width: 354; height: 489.5 };
	paneCenterDesk: { x: 400.5; y: 450 };
	paneCenterPhone: { x: 177; y: 244.75 };
	label: FillCropDetail & {
		s: FillCropRect;
		windows: { t0: FillCropWindow; t05: FillCropWindow; t1: FillCropWindow };
	};
	cover: FillCropDetail & {
		s: FillCropRect;
		fixedCenter: FillCropRect;
		windows: { t0: FillCropWindow; t05: FillCropWindow };
	};
	phoneCover: { t0: FillCropWindow; s: FillCropRect };
	local: { hold: 0.08; zoomMid: 0.24; wash: 0.46; plateEnd: 0.52 };
	tolerancePx: 0.01;
	settledTolerancePx: 0.1;
};

export const mhjl329FillCrop: FillCropFixture = {
	id: 'mhjl329',
	rem: 18,
	desk: { width: 801, height: 900 },
	phone: { width: 354, height: 489.5 },
	paneCenterDesk: { x: 400.5, y: 450 },
	paneCenterPhone: { x: 177, y: 244.75 },
	label: {
		natural: { width: 1050, height: 1400 },
		plate: { width: 400, height: 400 },
		crop: { x: 274, y: 403, w: 514, h: 514 },
		s: { left: 157.5, top: 207, width: 486, height: 486 },
		windows: {
			t0: {
				cropT: 0,
				left: 239.143,
				top: 259.071,
				width: 330.429,
				height: 330.429,
				centerX: 404.357,
				centerY: 424.286,
			},
			t05: {
				cropT: 0.5,
				left: 202.061,
				top: 236.776,
				width: 400.735,
				height: 400.735,
				centerX: 402.429,
				centerY: 437.143,
			},
			t1: {
				cropT: 1,
				left: 157.5,
				top: 207,
				width: 486,
				height: 486,
				centerX: 400.5,
				centerY: 450,
			},
		},
	},
	cover: {
		natural: { width: 1400, height: 1400 },
		plate: { width: 400, height: 248 },
		crop: { x: 219, y: 210, w: 379, h: 235 },
		s: { left: 112.14, top: 271.217, width: 576.72, height: 357.566 },
		fixedCenter: { left: 292.079, top: 382.773, width: 216.842, height: 134.454 },
		windows: {
			t0: {
				cropT: 0,
				left: 125.299,
				top: 169.65,
				width: 216.842,
				height: 134.454,
				centerX: 233.72,
				centerY: 236.877,
			},
			t05: {
				cropT: 0.5,
				left: 140.301,
				top: 233.807,
				width: 353.619,
				height: 219.263,
				centerX: 317.11,
				centerY: 343.438,
			},
		},
	},
	phoneCover: {
		t0: {
			cropT: 0,
			left: 55.376,
			top: 120.85,
			width: 95.833,
			height: 59.421,
			centerX: 103.292,
			centerY: 150.561,
		},
		s: { left: 49.56, top: 165.737, width: 254.88, height: 158.026 },
	},
	local: { hold: 0.08, zoomMid: 0.24, wash: 0.46, plateEnd: 0.52 },
	tolerancePx: 0.01,
	settledTolerancePx: 0.1,
};
