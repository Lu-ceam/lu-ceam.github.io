/**
 * Teardrop pin shell and the role → inner mark map for the trajectory map.
 * Pure: the Leaflet driver builds the DivIcon, this module owns the geometry.
 *
 * The shell is site-side (布局拥有): a round head plus a tail whose point is the
 * geographic anchor. Head diameter ≈ the old rest / active diameter, the tail
 * hangs below it, and `iconAnchor` is the point — never the head centre.
 *
 * The marks are the design-owned `traj-role` files, copied verbatim into
 * `public/icons/traj-role/` (main files only, no alternates). Each is inlined
 * here so `currentColor` can flip for the engraved / relief states; the copy
 * on disk stays the reference for review.
 */

export type PinRoleGlyph =
	| 'birth'
	| 'residence'
	| 'composition'
	| 'performance'
	| 'premiere'
	| 'founded'
	| 'recording'
	| 'pressing'
	| 'release';

/** LOCKED: role → file. `other`, an unknown role, or no glyphKind reads as an empty pin. */
export const ROLE_PIN_GLYPH: Record<string, PinRoleGlyph> = {
	birth: 'birth',
	residence: 'residence',
	composition: 'composition',
	performance: 'performance',
	premiere: 'premiere',
	founded: 'founded',
	recording: 'recording',
	pressing: 'pressing',
	release: 'release',
};

/** Static copy of the same map, for review against the icon directory. */
export const PIN_ROLE_FILE: Record<PinRoleGlyph, string> = {
	birth: '/icons/traj-role/birth.svg',
	residence: '/icons/traj-role/residence.svg',
	composition: '/icons/traj-role/composition.svg',
	performance: '/icons/traj-role/performance.svg',
	premiere: '/icons/traj-role/premiere.svg',
	founded: '/icons/traj-role/founded.svg',
	recording: '/icons/traj-role/recording.svg',
	pressing: '/icons/traj-role/pressing.svg',
	release: '/icons/traj-role/release.svg',
};

export function rolePinGlyph(role: string): PinRoleGlyph | null {
	return ROLE_PIN_GLYPH[role] ?? null;
}

/**
 * Inner geometry, verbatim from `public/icons/traj-role/<key>.svg`.
 * `viewBox="0 0 24 24"`, stroke only, no colour of its own.
 */
export const PIN_GLYPH_BODY: Record<PinRoleGlyph, string> = {
	birth: '<path d="M2 21a8 8 0 0 1 13.292-6" /> <circle cx="10" cy="8" r="5" /> <path d="M19 16v6" /> <path d="M22 19h-6" />',
	residence:
		'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /> <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />',
	composition:
		'<path d="m19 6-5.2-3.9a.5.5 0 0 0-.8.4V18" /> <circle cx="9" cy="18" r="4" />',
	performance:
		'<path d="M10 13v4" /> <path d="M14 13v4" /> <path d="M18 13v4" /> <path d="M2 13h20" /> <path d="M22 11.5A3.5 3.5 0 0018.5 8a3.52 3.52 0 01-3.173-2A7 7 0 002 9v10a2 2 0 002 2h16a2 2 0 002-2z" /> <path d="M6 13v4" />',
	premiere:
		'<path d="M2 3 H22"/> <path d="M3 3 V20"/> <path d="M7 3 V20"/> <path d="M17 3 V20"/> <path d="M21 3 V20"/> <path d="M10 8 V16"/> <path d="M14 8 V16"/>',
	founded:
		'<path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/> <path d="M10 8h4"/> <path d="M10 12h4"/> <path d="M10 21v-3a2 2 0 0 1 4 0v3"/>',
	recording:
		'<path d="M12 19v3" /> <path d="M19 10v2a7 7 0 0 1-14 0v-2" /> <rect x="9" y="2" width="6" height="13" rx="3" />',
	pressing:
		'<circle cx="12" cy="12" r="10" /> <path d="M6 12c0-1.7.7-3.2 1.8-4.2" /> <circle cx="12" cy="12" r="2" /> <path d="M18 12c0 1.7-.7 3.2-1.8 4.2" />',
	release:
		'<rect width="18" height="18" x="3" y="3" rx="2" /> <circle cx="12" cy="12" r="5" /> <path d="M12 12h.01" />',
};

/** The mark, in `currentColor`. Geometry only: no emoji, no second accent. */
export function pinMarkSvg(key: PinRoleGlyph): string {
	return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PIN_GLYPH_BODY[key]}</svg>`;
}

/**
 * Shell: round head Ø40 in a 40×52 box, tail point at (20, 50).
 * The head is the diameter the density table quotes; the tail hangs below it.
 */
export const PIN_SHELL_VIEWBOX_W = 40;
export const PIN_SHELL_VIEWBOX_H = 52;
/** Where the point sits inside the box: 50/40 of the head diameter down. */
export const PIN_TIP_RATIO = 50 / PIN_SHELL_VIEWBOX_W;
/** Box height per head diameter: the tail adds 30%. */
export const PIN_BOX_RATIO = PIN_SHELL_VIEWBOX_H / PIN_SHELL_VIEWBOX_W;
/** The point, and the only anchor a pin may use. */
export const PIN_TIP_VIEWBOX = { x: 20, y: 50 };
export const PIN_SHELL_PATH =
	'M20 2C31.046 2 40 10.954 40 22C40 30.5 33.5 37.5 20 50C6.5 37.5 0 30.5 0 22C0 10.954 8.954 2 20 2Z';

export type PinShellSize = {
	/** Head diameter: the old rest / active diameter. */
	head: number;
	width: number;
	height: number;
	/** DivIcon anchor: x at the middle, y at the point. */
	anchorX: number;
	anchorY: number;
};

export function pinShellSize(head: number): PinShellSize {
	const width = Math.round(head * 100) / 100;
	const height = Math.round(width * PIN_BOX_RATIO * 100) / 100;
	return {
		head: width,
		width,
		height,
		anchorX: width / 2,
		anchorY: Math.round(width * PIN_TIP_RATIO * 100) / 100,
	};
}

/** Shell markup. Dense tiers pass `mark = 0` and get an empty (anchor-only) pin. */
export function pinShellSvg(): string {
	return `<svg class="traj-pin-shell" viewBox="0 0 ${PIN_SHELL_VIEWBOX_W} ${PIN_SHELL_VIEWBOX_H}" aria-hidden="true" focusable="false"><path d="${PIN_SHELL_PATH}" /></svg>`;
}

/** Full inner markup for one pin: shell, plus the role mark when there is room. */
export function pinBodyHtml(kind: PinRoleGlyph | null, mark: number): string {
	const inner = kind && mark > 0 ? `<span class="traj-pin-mark">${pinMarkSvg(kind)}</span>` : '';
	return `<span class="traj-pin-body" style="--pin-mark:${Math.max(0, mark)}px">${pinShellSvg()}${inner}</span>`;
}
