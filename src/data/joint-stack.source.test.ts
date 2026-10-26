import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { framePaintsContent, frameRole } from './split-stage.ts';

const here = dirname(fileURLToPath(import.meta.url));
const astro = readFileSync(join(here, '../pages/records/[id].astro'), 'utf8');
const css = readFileSync(join(here, '../styles/global.css'), 'utf8');

/** The `applyFrame` function body, from its signature to the next top-level `function`. */
function applyFrameSource(): string {
	const start = astro.indexOf('function applyFrame(');
	assert.ok(start > 0, 'applyFrame is missing');
	const end = astro.indexOf('\n\t\tfunction ', start + 1);
	assert.ok(end > start, 'applyFrame has no closing boundary');
	return astro.slice(start, end);
}

describe('detail joint stack', () => {
	it('routes the per-frame role into applyFrame from the runway place', () => {
		assert.match(astro, /import \{[^}]*framePaintsContent[^}]*\} from '\.\.\/\.\.\/data\/split-stage'/s);
		const applyAll = astro.slice(astro.indexOf('const applyAll = ()'));
		const call = applyAll.slice(applyAll.indexOf('applyFrame(frame, local'));
		assert.ok(call.length > 0, 'applyAll does not call applyFrame');
		// The content flag comes from the place, not from the frame opacity alone.
		assert.match(call.slice(0, 120), /applyFrame\(frame, local, framePaintsContent\(frameIndex, place\)\)/);
	});

	it('zeroes plate, boxes, leaders, and notes on a frame that is not active', () => {
		const apply = applyFrameSource();
		assert.match(apply, /function applyFrame\(frame: HTMLElement, p: number, paints = true\): void/);
		assert.match(apply, /const showContent = paints;/);
		assert.match(apply, /toggle\('is-plate', showContent && paint\.plateOpacity === 1\)/);
		assert.match(apply, /plate\.style\.opacity = String\(showContent \? paint\.plateOpacity : 0\)/);
		assert.match(apply, /graphics\.style\.opacity = String\(showContent \? visual\.boxesOpacity : 0\)/);
		assert.match(apply, /leaders\.style\.opacity = leadersOn \? '1' : '0'/);
		assert.match(apply, /notes\.style\.opacity = String\(showContent \? visual\.notesOpacity : 0\)/);
		// Every one of those gates must also drive visibility, or a stale layer stays painted.
		assert.match(apply, /graphics\.style\.visibility = showContent && visual\.boxesOpacity > 0/);
		assert.match(apply, /leaders\.style\.visibility = leadersOn \? 'visible' : 'hidden'/);
		assert.match(apply, /notes\.style\.visibility = showContent && visual\.notesOpacity > 0/);
	});

	it('keeps the crossfade on the frame opacity at a fixed duration', () => {
		// The joint still fades the whole frame; only its content layers stop painting.
		assert.match(css, /\.record-page--split \.split-frame \{[\s\S]*?opacity: 0;/);
		assert.match(css, /\.record-page--split \.split-frame\.is-active \{\s*opacity: 1;\s*\}/);
		assert.match(astro, /frame\.style\.transitionDuration = duration;/);
	});

	it('agrees with the shared role helper', () => {
		// Guard against the page and the tested helper drifting apart.
		const joint = { index: 1, local: 0, joint: 0.4, outgoing: 0 };
		assert.equal(frameRole(0, joint), 'leaving');
		assert.equal(framePaintsContent(0, joint), false);
		assert.equal(framePaintsContent(1, joint), true);
	});
});

describe('frame role', () => {
	const jointPlace = { index: 1, local: 0, joint: 0.5, outgoing: 0 };
	const passPlace = { index: 1, local: 0.4, joint: 0, outgoing: -1 };

	it('marks the incoming frame active, the outgoing one leaving, and the rest idle', () => {
		assert.equal(frameRole(1, jointPlace), 'active');
		assert.equal(frameRole(0, jointPlace), 'leaving');
		assert.equal(frameRole(2, jointPlace), 'idle');
		assert.equal(frameRole(1, passPlace), 'active');
		assert.equal(frameRole(0, passPlace), 'idle');
	});

	it('paints plate and callouts on the active frame only', () => {
		assert.equal(framePaintsContent(1, jointPlace), true);
		assert.equal(framePaintsContent(0, jointPlace), false);
		assert.equal(framePaintsContent(2, jointPlace), false);
		assert.equal(framePaintsContent(0, passPlace), false);
		// A frame that owns the pass paints, whatever its local progress is.
		assert.equal(framePaintsContent(0, { index: 0, local: 1, joint: 0, outgoing: -1 }), true);
		assert.equal(framePaintsContent(0, { index: 0, local: 0.2, joint: 0, outgoing: -1 }), true);
	});
});
