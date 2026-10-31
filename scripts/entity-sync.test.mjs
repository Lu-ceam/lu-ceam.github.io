import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { syncEntityCatalog } from './append-records.mjs';

async function writeJson(file, data) {
	await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

describe('syncEntityCatalog', () => {
	it('copies export entities onto the site and keeps a site-only person', async () => {
		const root = await mkdtemp(join(tmpdir(), 'entity-sync-'));
		const exportDir = join(root, 'export');
		const destDir = join(root, 'records');
		try {
			await mkdir(join(exportDir, 'people'), { recursive: true });
			await mkdir(join(destDir, 'people'), { recursive: true });
			await writeJson(join(exportDir, 'people', 'index.json'), { schemaVersion: 1, ids: ['js-bach'] });
			await writeJson(join(exportDir, 'people', 'js-bach.json'), {
				schemaVersion: 1,
				id: 'js-bach',
				nameZh: '约翰·塞巴斯蒂安·巴赫',
			});
			await writeJson(join(destDir, 'people', 'index.json'), { schemaVersion: 1, ids: ['starker'] });
			await writeJson(join(destDir, 'people', 'starker.json'), {
				schemaVersion: 1,
				id: 'starker',
				nameZh: '雅诺什·斯塔克尔',
			});
			await syncEntityCatalog(exportDir, destDir);
			const index = JSON.parse(await readFile(join(destDir, 'people', 'index.json'), 'utf8'));
			assert.deepEqual(index.ids, ['js-bach', 'starker']);
			const bach = JSON.parse(await readFile(join(destDir, 'people', 'js-bach.json'), 'utf8'));
			assert.equal(bach.nameZh, '约翰·塞巴斯蒂安·巴赫');
			const starker = JSON.parse(await readFile(join(destDir, 'people', 'starker.json'), 'utf8'));
			assert.equal(starker.id, 'starker');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
