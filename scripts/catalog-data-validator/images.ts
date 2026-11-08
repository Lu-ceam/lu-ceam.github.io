/**
 * Source photo inspection for the catalog validator.
 *
 * The export schema only guarantees a path shape. This module checks the file
 * itself: realpath containment, regular file, non-zero size, format signature,
 * and a full image decode (not just a header probe). JPEG, PNG and WebP all go
 * through sharp, which is already installed as Astro's optional dependency; the
 * validator never installs anything.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

export type AssetStatus =
	| 'valid'
	| 'missing'
	| 'escape'
	| 'not-file'
	| 'empty'
	| 'format-mismatch'
	| 'decode-failed'
	| 'decoder-unavailable';

export type AssetInspection = {
	rel: string;
	abs: string;
	status: AssetStatus;
	format: 'jpeg' | 'png' | 'webp' | null;
	width: number | null;
	height: number | null;
	bytes: number | null;
	sha256: string | null;
	realpath: string | null;
	reason: string | null;
};

export type SharpModule = {
	(input: Buffer | string): {
		metadata(): Promise<{ width?: number; height?: number; format?: string }>;
		raw(): { toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> };
	};
};

let sharpModule: SharpModule | null | undefined;
let sharpError: string | null = null;

/** Load the installed decoder once. Returns null when it is not available. */
export async function loadImageDecoder(): Promise<SharpModule | null> {
	if (sharpModule !== undefined) return sharpModule;
	try {
		const imported = (await import('sharp')) as unknown as { default?: SharpModule } & SharpModule;
		sharpModule = imported.default ?? imported;
	} catch (error) {
		sharpModule = null;
		sharpError = error instanceof Error ? error.message : String(error);
	}
	return sharpModule;
}

export function imageDecoderError(): string | null {
	return sharpError;
}

export function detectImageFormat(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
	if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
		return 'png';
	}
	if (
		buf.length >= 12 &&
		buf.toString('ascii', 0, 4) === 'RIFF' &&
		buf.toString('ascii', 8, 12) === 'WEBP'
	) {
		return 'webp';
	}
	return null;
}

export function extensionFormat(file: string): 'jpeg' | 'png' | 'webp' | null {
	const lower = file.toLowerCase();
	if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpeg';
	if (lower.endsWith('.png')) return 'png';
	if (lower.endsWith('.webp')) return 'webp';
	return null;
}

/** `rel` must resolve strictly inside `rootAbs`, after resolving symlinks on both. */
export function resolveInsideReal(root: string, rel: string): { ok: true; abs: string; real: string } | { ok: false; reason: string; abs: string } {
	const rootAbs = resolve(root);
	if (rel.includes('\0') || rel.includes('\\') || isAbsolute(rel)) {
		return { ok: false, reason: 'path is absolute or contains a backslash / NUL', abs: resolve(rootAbs, rel) };
	}
	const abs = resolve(rootAbs, rel);
	if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
		return { ok: false, reason: 'path escapes the record directory', abs };
	}
	let realRoot: string;
	try {
		realRoot = realpathSync(rootAbs);
	} catch (error) {
		return { ok: false, reason: `record directory realpath failed: ${String(error)}`, abs };
	}
	let real: string;
	try {
		real = realpathSync(abs);
	} catch {
		return { ok: false, reason: 'file does not exist', abs };
	}
	if (real !== realRoot && !real.startsWith(realRoot + sep)) {
		return { ok: false, reason: `symlink target escapes the record directory (${real})`, abs };
	}
	return { ok: true, abs, real };
}

export type InspectOptions = { recordDir: string; rel: string; decoder: SharpModule | null };

/** Full inspection: containment, file type, size, signature and a complete decode. */
export async function inspectAsset(options: InspectOptions): Promise<AssetInspection> {
	const { recordDir, rel, decoder } = options;
	const resolved = resolveInsideReal(recordDir, rel);
	const base: AssetInspection = {
		rel,
		abs: resolved.abs,
		status: 'missing',
		format: null,
		width: null,
		height: null,
		bytes: null,
		sha256: null,
		realpath: resolved.ok ? resolved.real : null,
		reason: null,
	};
	if (!resolved.ok) {
		const escape = /escapes|absolute|backslash/.test(resolved.reason);
		return { ...base, status: escape ? 'escape' : 'missing', reason: resolved.reason };
	}
	if (!existsSync(resolved.abs)) return base;
	let stat;
	try {
		stat = statSync(resolved.abs);
	} catch (error) {
		return { ...base, status: 'not-file', reason: error instanceof Error ? error.message : String(error) };
	}
	if (!stat.isFile()) return { ...base, status: 'not-file', reason: 'not a regular file' };
	if (stat.size === 0) return { ...base, status: 'empty', bytes: 0, reason: 'zero-byte file' };
	const buf = readFileSync(resolved.abs);
	const sha256 = createHash('sha256').update(buf).digest('hex');
	const actual = detectImageFormat(buf);
	const expected = extensionFormat(rel);
	const withHash = { ...base, bytes: stat.size, sha256, format: actual };
	if (actual === null) {
		return { ...withHash, status: 'format-mismatch', reason: 'file signature is not JPEG, PNG or WebP' };
	}
	if (expected !== null && expected !== actual) {
		return {
			...withHash,
			status: 'format-mismatch',
			reason: `extension says ${expected} but the bytes are ${actual}`,
		};
	}
	if (!decoder) {
		return { ...withHash, status: 'decoder-unavailable', reason: 'image decoder is not installed' };
	}
	try {
		const meta = await decoder(buf).metadata();
		const decoded = await decoder(buf).raw().toBuffer({ resolveWithObject: true });
		if (!meta.width || !meta.height || meta.width <= 0 || meta.height <= 0) {
			return { ...withHash, status: 'decode-failed', reason: 'decoder reported a non-positive dimension' };
		}
		if (decoded.info.width !== meta.width || decoded.info.height !== meta.height) {
			return {
				...withHash,
				status: 'decode-failed',
				reason: `decoded raster ${decoded.info.width}×${decoded.info.height} does not match metadata ${meta.width}×${meta.height}`,
			};
		}
		return { ...withHash, status: 'valid', width: meta.width, height: meta.height };
	} catch (error) {
		return {
			...withHash,
			status: 'decode-failed',
			reason: error instanceof Error ? error.message.split('\n')[0] ?? error.message : String(error),
		};
	}
}

/** Every file under `dir/images` and `dir/details`, as root-relative paths. */
export function listAssetFiles(recordDir: string): string[] {
	const out: string[] = [];
	for (const sub of ['images', 'details']) {
		const dir = join(recordDir, sub);
		if (!existsSync(dir)) continue;
		for (const entry of readFileSyncDir(dir)) out.push(`${sub}/${entry}`);
	}
	return out.sort();
}

function readFileSyncDir(dir: string): string[] {
	// Directory inventory only; content checks are separate.
	return readdirSync(dir).filter((name) => {
		try {
			return statSync(join(dir, name)).isFile();
		} catch {
			return false;
		}
	});
}
