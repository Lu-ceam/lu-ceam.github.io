import { readFileSync } from 'node:fs';

export type ImageSize = { width: number; height: number };

function jpegSize(buf: Buffer): ImageSize {
	if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
		throw new Error('不是 JPEG');
	}
	let offset = 2;
	while (offset + 8 < buf.length) {
		if (buf[offset] !== 0xff) {
			offset += 1;
			continue;
		}
		const marker = buf[offset + 1]!;
		if (marker === 0xd8 || marker === 0xd9) {
			offset += 2;
			continue;
		}
		if (marker === 0xda) break;
		const segmentLength = buf.readUInt16BE(offset + 2);
		if (segmentLength < 2 || offset + 2 + segmentLength > buf.length) break;
		const isStartOfFrame =
			marker >= 0xc0 &&
			marker <= 0xcf &&
			marker !== 0xc4 &&
			marker !== 0xc8 &&
			marker !== 0xcc;
		if (isStartOfFrame) {
			return {
				height: buf.readUInt16BE(offset + 5),
				width: buf.readUInt16BE(offset + 7),
			};
		}
		offset += 2 + segmentLength;
	}
	throw new Error('JPEG 里没有尺寸');
}

function webpSize(buf: Buffer): ImageSize {
	if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
		throw new Error('不是 WebP');
	}
	const tag = buf.toString('ascii', 12, 16);
	if (tag === 'VP8 ') {
		return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
	}
	if (tag === 'VP8L') {
		const bits = buf.readUInt32LE(21);
		return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
	}
	if (tag === 'VP8X') {
		return {
			width: 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16)),
			height: 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16)),
		};
	}
	throw new Error('无法读取 WebP 尺寸');
}

function pngSize(buf: Buffer): ImageSize {
	if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') {
		throw new Error('不是 PNG');
	}
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function readImageSize(file: string): ImageSize {
	const buf = readFileSync(file);
	const lower = file.toLowerCase();
	try {
		if (lower.endsWith('.webp')) return webpSize(buf);
		if (lower.endsWith('.png')) return pngSize(buf);
		if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return jpegSize(buf);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`${message}：${file}`);
	}
	throw new Error(`无法读取图片尺寸：${file}`);
}
