export type PhoneCalloutFixture = {
	id: 'mhjl329';
	viewport: { width: 390; height: 844 };
	rem: 18;
	pane: { width: 354; height: 489.5 };
	stripRem: 2.75;
	padRem: 0.75;
	padPx: 13.5;
	label: { plate: { width: 255; height: 255 }; settledImageryH: 282 };
	cover: { plate: { width: 255; height: 158 }; settledImageryH: 185 };
};

export type DeskCalloutFixture = {
	id: 'mhjl329';
	viewport: { width: 1440; height: 900 };
	rem: 18;
	phi: { min: 1.6; max: 1.64 };
	imageryHeight: '100svh';
	labelStripRem: 8.75;
	coverStripRem: 6.2;
};

export type WorkedLeaderFixture = {
	gap: 100;
	dash: '6 5';
	points: [
		{ x: 100; y: 40 },
		{ x: 116; y: 40 },
		{ x: 184; y: 70 },
		{ x: 200; y: 70 },
	];
};

export const phoneMhjl329: PhoneCalloutFixture = {
	id: 'mhjl329',
	viewport: { width: 390, height: 844 },
	rem: 18,
	pane: { width: 354, height: 489.5 },
	stripRem: 2.75,
	padRem: 0.75,
	padPx: 13.5,
	label: { plate: { width: 255, height: 255 }, settledImageryH: 282 },
	cover: { plate: { width: 255, height: 158 }, settledImageryH: 185 },
};

export const deskMhjl329: DeskCalloutFixture = {
	id: 'mhjl329',
	viewport: { width: 1440, height: 900 },
	rem: 18,
	phi: { min: 1.6, max: 1.64 },
	imageryHeight: '100svh',
	labelStripRem: 8.75,
	coverStripRem: 6.2,
};

export const workedLeader: WorkedLeaderFixture = {
	gap: 100,
	dash: '6 5',
	points: [
		{ x: 100, y: 40 },
		{ x: 116, y: 40 },
		{ x: 184, y: 70 },
		{ x: 200, y: 70 },
	],
};

export const legacyRecordId = 'ml4001' as const;
