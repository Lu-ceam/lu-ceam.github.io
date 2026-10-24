/**
 * Vinyl collection. The build reads the curator export in `records/`
 * (schemaVersion 1) and the not-yet-exported rows in `records-legacy/`.
 * Unknown schemaVersion, a missing image, or a forbidden field fails the build.
 */
export {
	badgeClass,
	catalogWhen,
	decadeLabel,
	deriveSortYear,
	expectedVerification,
	FORBIDDEN_FIELDS,
	heroAlt,
	recordSearchText,
	showMatrix,
	showPressing,
	showPressingDetails,
	sortRecords,
	statusBucket,
	storyBody,
	storyParagraphs,
	uniqueValues,
} from './records-schema.ts';
export type { StatusBucket, VinylRecord } from './records-schema.ts';

import { loadRecords } from './records-load.ts';

export const records = await loadRecords();
