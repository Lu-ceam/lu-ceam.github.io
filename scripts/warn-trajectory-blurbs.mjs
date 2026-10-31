/**
 * Soft warning only. Exit 0 even when a blurb is still illustrative or
 * names the flyover / year field, and even if the scan itself throws.
 * Records with no trajectory are silent.
 */
import { resolveRecordsExport } from '../src/data/records-entities.ts';
import { illustrativeBlurbWarnings } from '../src/data/trajectory-camera.ts';

try {
	const warnings = illustrativeBlurbWarnings(resolveRecordsExport());
	if (warnings.length === 0) {
		console.log('trajectory blurb check: 没有示意旁注或实现用语');
	} else {
		console.warn(
			`trajectory blurb check: ${warnings.length} 处旁注仍是示意、待核定，或含实现用语（不失败构建，不挡住没有轨迹的唱片）`,
		);
		for (const line of warnings) console.warn(`  ${line}`);
	}
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.warn(`trajectory blurb check skipped: ${message}`);
}
