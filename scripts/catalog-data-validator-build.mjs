#!/usr/bin/env node
/**
 * Controlled build + receipt writer (acceptance F5).
 *
 * The validator itself never builds. This script is the only place that runs the
 * existing `npm run build`, and it does so exactly once while recording:
 *
 *   - the input fingerprint *before* the build (indexes, every record.json /
 *     story.md, entity indexes, layout, render/model source, public/records
 *     rasters, package state, comparison tool), and
 *   - the output fingerprint *after* the build (per-route page + payload hash,
 *     per-route asset hash).
 *
 * The receipt is what lets `catalog-data-validator audit --dist dist --receipt …`
 * say "this dist came from this tree" instead of guessing from mtimes. A missing,
 * failed, foreign or stale receipt is a build-input problem (exit 2), never a
 * silent pass.
 *
 * Usage:
 *   node --experimental-strip-types scripts/catalog-data-validator-build.mjs \
 *     [--repo-root <dir>] [--dist <dir>] [--receipt <file>] [-- npm run build]
 *
 * Exit: the build's own exit code (0 success), or 2 for a usage/IO problem.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReceipt } from './catalog-data-validator/receipt.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
	const args = {
		repoRoot: resolve(HERE, '..'),
		dist: null,
		receipt: null,
		command: ['npm', 'run', 'build'],
	};
	const rest = [];
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const take = () => {
			const next = argv[index + 1];
			if (next === undefined) throw new Error(`missing value for ${arg}`);
			index += 1;
			return next;
		};
		if (arg === '--repo-root') args.repoRoot = resolve(take());
		else if (arg === '--dist') args.dist = resolve(take());
		else if (arg === '--receipt') args.receipt = resolve(take());
		else if (arg === '--') {
			rest.push(...argv.slice(index + 1));
			break;
		} else if (arg === '--help' || arg === '-h') {
			process.stdout.write(
				'usage: node --experimental-strip-types scripts/catalog-data-validator-build.mjs ' +
					'[--repo-root <dir>] [--dist <dir>] [--receipt <file>] [-- <command...>]\n',
			);
			process.exit(0);
		} else {
			throw new Error(`unknown argument: ${arg}`);
		}
	}
	if (rest.length > 0) args.command = rest;
	args.dist = args.dist ?? join(args.repoRoot, 'dist');
	args.receipt = args.receipt ?? join(args.repoRoot, '.astro', 'catalog-build-receipt.json');
	return args;
}

function git(repoRoot, args) {
	try {
		return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
}

async function main(argv) {
	let args;
	try {
		args = parseArgs(argv);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		return 2;
	}

	const head = git(args.repoRoot, ['rev-parse', 'HEAD']);
	const status = git(args.repoRoot, ['status', '--porcelain']);
	const dirty = status === null ? null : status !== '';

	// The fingerprint is taken *before* the build so the receipt can only claim
	// "built from these bytes", never "these bytes were here afterwards".
	const { inputFingerprint } = await import('./catalog-data-validator/receipt.ts');
	const input = inputFingerprint(args.repoRoot);

	const startedAt = new Date().toISOString();
	let exitCode = 0;
	try {
		execFileSync(args.command[0], args.command.slice(1), {
			cwd: args.repoRoot,
			stdio: 'inherit',
			env: process.env,
		});
	} catch (error) {
		exitCode = typeof error?.status === 'number' ? error.status : 1;
	}
	const finishedAt = new Date().toISOString();

	const { outputFingerprint } = await import('./catalog-data-validator/receipt.ts');
	const output = existsSync(args.dist) ? outputFingerprint(args.dist) : undefined;

	const receipt = buildReceipt({
		repoRoot: args.repoRoot,
		distRoot: args.dist,
		command: args.command.join(' '),
		exitCode,
		startedAt,
		finishedAt,
		sourceHead: head,
		sourceDirty: dirty,
		input,
		output,
	});

	try {
		mkdirSync(dirname(args.receipt), { recursive: true });
		writeFileSync(args.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
	} catch (error) {
		process.stderr.write(
			`failed to write receipt into ${args.receipt}: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 2;
	}

	process.stdout.write(
		[
			`build ${exitCode === 0 ? 'ok' : `failed (exit ${exitCode})`}`,
			`  input=${input.sha256}`,
			`  output=${output?.sha256 ?? '(no dist)'}`,
			`  receipt=${args.receipt}`,
		].join('\n') + '\n',
	);
	return exitCode;
}

process.exitCode = await main(process.argv.slice(2));
