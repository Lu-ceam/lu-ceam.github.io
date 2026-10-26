/**
 * Fail the build if dist/ still contains curator-only fields or the old
 * section headings. Condition text may legitimately say 待补拍 (ml4001,
 * mg50370), so the raw word 补拍 is not a marker. The old heading was the
 * summary label 待补拍 wrapped for needLead, plus 证据核对.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import forbiddenFields from '../src/data/forbidden-fields.json' with { type: 'json' };

const TEXT_EXT = new Set([
	'.html',
	'.css',
	'.js',
	'.mjs',
	'.json',
	'.txt',
	'.xml',
	'.svg',
	'.webmanifest',
]);

const DISTINCTIVE = ['needLead', 'need_lead', 'need-lead', '证据核对', '补拍清单'];

const SUMMARY_HEADING = /<summary\b[^>]*>\s*待补拍/;

function keyPattern() {
	const body = forbiddenFields.map((field) => field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
	return new RegExp(`["'](?:${body})["']\\s*:`, 'i');
}

const KEY_RE = keyPattern();

export function findInternalMarkers(text) {
	const hits = [];
	for (const marker of DISTINCTIVE) {
		if (text.includes(marker)) hits.push(marker);
	}
	if (SUMMARY_HEADING.test(text)) hits.push('<summary>待补拍');
	if (KEY_RE.test(text)) hits.push('forbidden-field-key');
	return hits;
}

async function walk(dir, out) {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		// Build scratch such as dist/.prerender is not published output.
		if (entry.name.startsWith('.')) continue;
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			await walk(abs, out);
			continue;
		}
		if (!TEXT_EXT.has(extname(entry.name))) continue;
		out.push(abs);
	}
}

export async function checkDist(distDir) {
	const files = [];
	await walk(distDir, files);
	const failures = [];
	for (const file of files) {
		const text = await readFile(file, 'utf8');
		const hits = findInternalMarkers(text);
		if (hits.length > 0) failures.push({ file, hits });
	}
	return failures;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
	const distDir = process.argv[2] ?? 'dist';
	const failures = await checkDist(distDir);
	if (failures.length === 0) {
		console.log(`internal-field check passed (${distDir})`);
	} else {
		console.error(`internal-field check failed (${distDir}):`);
		for (const failure of failures) {
			console.error(`- ${failure.file}: ${failure.hits.join(', ')}`);
		}
		process.exit(1);
	}
}
