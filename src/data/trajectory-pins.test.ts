import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PLACE_ROLES } from './records-export.ts';
import { PIN_DENSITY } from './trajectory-guide.ts';
import {
	PIN_GLYPH_BODY,
	PIN_ROLE_FILE,
	PIN_SHELL_PATH,
	PIN_SHELL_VIEWBOX_H,
	PIN_SHELL_VIEWBOX_W,
	PIN_TIP_RATIO,
	PIN_TIP_VIEWBOX,
	ROLE_PIN_GLYPH,
	pinBodyHtml,
	pinMarkSvg,
	pinShellSize,
	pinShellSvg,
	rolePinGlyph,
	type PinRoleGlyph,
} from './trajectory-pins.ts';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

/** The elements of an icon file, with the wrapper and the design comments gone. */
function fileBody(path: string): string {
	const file = read(path);
	const start = file.indexOf('>', file.indexOf('<svg')) + 1;
	return file
		.slice(start, file.lastIndexOf('</svg>'))
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

const LOCKED: PinRoleGlyph[] = [
	'birth',
	'residence',
	'composition',
	'performance',
	'premiere',
	'founded',
	'recording',
	'pressing',
	'release',
];

describe('trajectory pin shell', () => {
	it('anchors the point, not the head centre, and keeps the old head diameter', () => {
		// The point sits at (20, 50) in a 40×52 box: 1.25 head diameters down.
		assert.deepEqual(PIN_TIP_VIEWBOX, { x: 20, y: 50 });
		assert.equal(PIN_TIP_RATIO, 50 / PIN_SHELL_VIEWBOX_W);
		assert.ok(PIN_SHELL_VIEWBOX_H > PIN_SHELL_VIEWBOX_W, 'the tail hangs below the head');
		assert.match(PIN_SHELL_PATH, /^M20 2/);

		// Sparse rest Ø28 / active Ø40: the shell head is that diameter, the box taller.
		const rest = pinShellSize(PIN_DENSITY.sparse.restR * 2);
		const active = pinShellSize(PIN_DENSITY.sparse.activeR * 2);
		assert.equal(rest.head, 28);
		assert.equal(active.head, 40);
		assert.equal(rest.width, 28);
		assert.equal(rest.anchorX, 14);
		assert.equal(rest.anchorY, 35);
		assert.equal(rest.height, 36.4);
		assert.equal(active.anchorY, 50);
		assert.ok(active.height > active.width);
		assert.equal(PIN_DENSITY.sparse.activeR * 2, 40, 'the active head stays the old ceiling');
	});

	it('draws one shell with no colour of its own', () => {
		const shell = pinShellSvg();
		assert.match(shell, /class="traj-pin-shell"/);
		assert.match(shell, /viewBox="0 0 40 52"/);
		assert.match(shell, new RegExp(`d="${PIN_SHELL_PATH}"`));
		assert.doesNotMatch(shell, /#[0-9a-f]{3,6}|fill="(?!none)[^"]+"/i);

		const empty = pinBodyHtml(null, 0);
		assert.match(empty, /class="traj-pin-body"/);
		assert.doesNotMatch(empty, /traj-pin-mark/);
		const full = pinBodyHtml('performance', PIN_DENSITY.sparse.activeMarkPx);
		assert.match(full, /--pin-mark:26px/);
		assert.match(full, /class="traj-pin-mark"/);
		assert.match(full, /<svg viewBox="0 0 24 24"/);
	});
});

describe('role to pin mark map', () => {
	it('maps the nine roles the design locked and leaves the rest empty', () => {
		for (const role of LOCKED) assert.equal(rolePinGlyph(role), role, role);
		assert.equal(rolePinGlyph('other'), null);
		assert.equal(rolePinGlyph('nonsense'), null);
		assert.equal(rolePinGlyph(''), null);
		// The contract enum is untouched: only `other` reads as an empty pin.
		for (const role of PLACE_ROLES) {
			const glyph = rolePinGlyph(role);
			if (role === 'other') assert.equal(glyph, null);
			else assert.ok(glyph, role);
		}
	});

	it('keeps performance on the piano and premiere on the opening curtain', () => {
		assert.equal(PIN_ROLE_FILE.performance, '/icons/traj-role/performance.svg');
		assert.equal(PIN_ROLE_FILE.premiere, '/icons/traj-role/premiere.svg');
		// Piano: three keys under the lid.
		assert.match(PIN_GLYPH_BODY.performance, /M10 13v4/);
		assert.match(PIN_GLYPH_BODY.performance, /M2 13h20/);
		// Opening curtain: a top bar, straight folds, and a short centre gap.
		assert.match(PIN_GLYPH_BODY.premiere, /M2 3 H22/);
		assert.match(PIN_GLYPH_BODY.premiere, /M10 8 V16/);
		assert.match(PIN_GLYPH_BODY.premiere, /M14 8 V16/);
		// Not the sunburst / funnel alternatives.
		for (const body of Object.values(PIN_GLYPH_BODY)) {
			assert.doesNotMatch(body, /<polygon|<ellipse/);
		}
	});

	it('ships the main files verbatim and never the alternates', () => {
		for (const key of LOCKED) {
			const path = PIN_ROLE_FILE[key].replace(/^\//, 'public/');
			assert.equal(fileBody(path), PIN_GLYPH_BODY[key], path);
			const file = read(path);
			assert.match(file, /viewBox="0 0 24 24"/);
			assert.match(file, /stroke="currentColor"/);
			assert.match(file, /stroke-width="2"/);
			assert.doesNotMatch(file, /\p{Extended_Pictographic}/u);
			assert.doesNotMatch(file, /(fill|stroke)="#[0-9a-f]{3,6}"/i);
			assert.match(pinMarkSvg(key), /aria-hidden="true"/);
		}
		for (const alt of [
			'performance-bow',
			'performance-proscenium-alt',
			'performance-spotlight',
			'premiere-curtain',
			'premiere-sparkles-alt',
			'founded-building-2-full',
		]) {
			assert.throws(() => read(`public/icons/traj-role/${alt}.svg`), alt);
			assert.equal(
				JSON.stringify(ROLE_PIN_GLYPH).includes(alt),
				false,
				`${alt} must not reach the map`,
			);
		}
	});
});

describe('pin tokens and wiring', () => {
	it('writes the engraved / relief tokens and one 180ms tip shot', () => {
		const view = read('src/components/TrajectoryMap.astro');
		assert.match(view, /--traj-pin-brick: #B85C38;/);
		assert.match(view, /--traj-pin-paper: #FFF8F2;/);
		assert.match(view, /--traj-pin-rest-fill: transparent;/);
		assert.match(view, /--traj-pin-rest-stroke: var\(--traj-pin-brick\);/);
		assert.match(view, /--traj-pin-active-fill: var\(--traj-pin-brick\);/);
		assert.match(view, /--traj-pin-active-glyph: var\(--traj-pin-paper\);/);
		assert.match(view, /--traj-pin-transition: 200ms ease;/);
		assert.match(view, /--traj-pin-pop-ms: 180ms;/);

		// Rest → active crosses fill, stroke and the mark colour in that window.
		const pin = view.slice(view.indexOf('.traj .traj-pin-shell path'), view.indexOf('@keyframes'));
		assert.match(pin, /transition:\s*fill var\(--traj-pin-transition\),/);
		assert.match(pin, /\.traj \.traj-pin\.is-active \.traj-pin-shell path \{/);
		assert.match(pin, /\.traj \.traj-pin\.is-active \.traj-pin-mark \{/);
		assert.match(pin, /\.traj \.traj-pin\.is-pin-pop \.traj-pin-body \{/);
		// The mark keeps only its colour cross; it never moves on its own.
		assert.doesNotMatch(pin, /\.traj \.traj-pin\.is-pin-pop \.traj-pin-mark \{/);
		// One shot: no loop, no second class.
		assert.doesNotMatch(view, /traj-pin-pop[^;]*infinite/);
		assert.match(
			view,
			/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.traj \.traj-pin\.is-pin-pop \.traj-pin-body \{\s*animation: none;/,
		);
	});

	it('presses the pin in from its tip: scale once, no wobble, no drop', () => {
		const view = read('src/components/TrajectoryMap.astro');

		// The toy moves are gone for good.
		assert.doesNotMatch(view, /traj-pin-pop-wobble/);
		assert.doesNotMatch(view, /traj-pin-pop-drop/);

		// Anchor the shot at the tip, not the box centre.
		const body = view.slice(view.indexOf('.traj .traj-pin-body {'), view.indexOf('.traj .traj-pin-shell {'));
		assert.match(body, /transform-origin: 50% 100%;/);

		const popAt = view.indexOf('.traj .traj-pin.is-pin-pop .traj-pin-body');
		const pop = view.slice(popAt, view.indexOf('@media (prefers-reduced-motion', popAt));
		assert.match(pop, /animation: traj-pin-pop-scale var\(--traj-pin-pop-ms\) ease-out;/);
		assert.doesNotMatch(pop, /rotate|translate[XY]?\(|bounce|elastic/);

		const shotAt = view.indexOf('@keyframes traj-pin-pop-scale');
		const shot = view.slice(shotAt, view.indexOf('@media (prefers-reduced-motion', shotAt));
		assert.doesNotMatch(shot, /rotate|translate[XY]?\(/);
		const stops = [...shot.matchAll(/transform:\s*scale\(([\d.]+)\);/g)].map((m) => Number(m[1]));
		assert.deepEqual(stops, [1, 1.03, 1]);
		assert.ok(Math.max(...stops) <= 1.03);
		// bite into the paper quickly, then rest: no overshoot tail.
		assert.match(shot, /0% \{\s*transform: scale\(1\);\s*\}/);
		assert.match(shot, /100% \{\s*transform: scale\(1\);\s*\}/);
	});

	it('builds a DivIcon pin and pops it once, after the settle', () => {
		const client = read('src/components/trajectory-map-client.ts');
		assert.match(client, /rolePinGlyph\(dot\.place\.role\)/);
		assert.match(client, /pinBodyHtml/);
		assert.doesNotMatch(client, /L\.circleMarker\(\[place\.lat, place\.lon\]/);
		assert.doesNotMatch(client, /PIN_GLYPH_SVG/);

		const pop = client.slice(client.indexOf('function popPin'), client.indexOf('function pinGlyphOf'));
		assert.ok(pop.length > 0);
		assert.match(pop, /if \(!el \|\| reduceMotion\(\)\) return;/);
		assert.match(pop, /classList\.add\('is-pin-pop'\)/);
		assert.match(pop, /'animationend'/);
		assert.match(pop, /\{ once: true \}/);
		assert.doesNotMatch(pop, /setInterval|requestAnimationFrame/);

		const markers = client.slice(
			client.indexOf('function paintMarkers'),
			client.indexOf('function repaintMarkers'),
		);
		// The shot waits for the landing, and one station pops once.
		assert.match(markers, /if \(!on \|\| flying\) continue;/);
		assert.match(markers, /if \(poppedKey === key\) continue;/);

		const chrono = client.slice(
			client.indexOf('function paintChronoMarkers'),
			client.indexOf('function pinIcon'),
		);
		assert.match(chrono, /paintPin\(dot, null,/);
	});
});
