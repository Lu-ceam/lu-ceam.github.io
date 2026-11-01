import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { syncEntityCatalog } from './append-records.mjs';
import { importRecords } from './import-records.mjs';

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

	it('merges organizations by id and keeps a site-only organization', async () => {
		const root = await mkdtemp(join(tmpdir(), 'entity-sync-org-'));
		const exportDir = join(root, 'export');
		const destDir = join(root, 'records');
		try {
			await mkdir(join(exportDir, 'organizations'), { recursive: true });
			await mkdir(join(destDir, 'organizations'), { recursive: true });
			await writeJson(join(exportDir, 'organizations', 'index.json'), {
				schemaVersion: 1,
				ids: ['philharmonia-orchestra'],
			});
			await writeJson(join(exportDir, 'organizations', 'philharmonia-orchestra.json'), {
				schemaVersion: 1,
				id: 'philharmonia-orchestra',
				nameZh: '爱乐乐团',
				name: 'Philharmonia Orchestra',
				kind: ['ensemble'],
			});
			await writeJson(join(destDir, 'organizations', 'index.json'), {
				schemaVersion: 1,
				ids: ['concertgebouw'],
			});
			await writeJson(join(destDir, 'organizations', 'concertgebouw.json'), {
				schemaVersion: 1,
				id: 'concertgebouw',
				nameZh: '阿姆斯特丹音乐厅管弦乐团',
			});
			await syncEntityCatalog(exportDir, destDir);
			const index = JSON.parse(await readFile(join(destDir, 'organizations', 'index.json'), 'utf8'));
			assert.deepEqual(index.ids, ['concertgebouw', 'philharmonia-orchestra']);
			const phil = JSON.parse(await readFile(join(destDir, 'organizations', 'philharmonia-orchestra.json'), 'utf8'));
			assert.equal(phil.nameZh, '爱乐乐团');
			const kept = JSON.parse(await readFile(join(destDir, 'organizations', 'concertgebouw.json'), 'utf8'));
			assert.equal(kept.id, 'concertgebouw');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('leaves site organizations in place when a full import omits the directory', async () => {
		const root = await mkdtemp(join(tmpdir(), 'entity-import-org-'));
		const exportDir = join(root, 'export');
		const destDir = join(root, 'records');
		try {
			await mkdir(exportDir, { recursive: true });
			await mkdir(join(destDir, 'organizations'), { recursive: true });
			await writeJson(join(exportDir, 'index.json'), { schemaVersion: 1, generatedAt: 't', records: [] });
			await writeJson(join(destDir, 'organizations', 'index.json'), {
				schemaVersion: 1,
				ids: ['philharmonia-orchestra'],
			});
			await writeJson(join(destDir, 'organizations', 'philharmonia-orchestra.json'), {
				schemaVersion: 1,
				id: 'philharmonia-orchestra',
				nameZh: '爱乐乐团',
			});
			await importRecords(exportDir, destDir);
			const kept = JSON.parse(
				await readFile(join(destDir, 'organizations', 'philharmonia-orchestra.json'), 'utf8'),
			);
			assert.equal(kept.nameZh, '爱乐乐团');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
