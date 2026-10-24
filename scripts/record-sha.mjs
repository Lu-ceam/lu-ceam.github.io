import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** README algorithm: sorted relative paths, path UTF-8 + NUL + raw SHA-256 of the file. */
export function directorySha256(dir) {
	const files = [];
	const walk = (rel) => {
		const abs = join(dir, rel);
		if (statSync(abs).isDirectory()) {
			for (const name of readdirSync(abs)) walk(rel ? `${rel}/${name}` : name);
			return;
		}
		files.push(rel);
	};
	walk('');
	files.sort();
	const hash = createHash('sha256');
	for (const rel of files) {
		hash.update(Buffer.from(rel, 'utf8'));
		hash.update(Buffer.from([0]));
		hash.update(createHash('sha256').update(readFileSync(join(dir, rel))).digest());
	}
	return hash.digest('hex');
}
