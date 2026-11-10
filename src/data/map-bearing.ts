/**
 * 飞行中「航向一行」的契约面（PRD `/home/box/web-layout/prd-bearing-heading.md`）。
 *
 * 整段飞行（陆路＋远洋，从起飞到落稳）旁白带顶端只有这一行：`航向 → {目的站中文名}`。
 * 目的站是目的地的中文名（`.traj-city` 同源），不是海域名；箭头是 Unicode「→」。
 * 本模块不做海域替换，也不负责 DOM：client 只拿文案与时机口径。
 */

/** 航向行文案。箭头必须是 Unicode「→」，禁止 "->"。 */
export function bearingHeading(destCity: string): string {
	return `航向 → ${destCity.trim()}`;
}

/** 飞行的三段：未飞（idle）／正在飞（in-flight）／已落稳（settled）。 */
export type FlightBearingPhase = 'idle' | 'in-flight' | 'settled';

/**
 * 飞行全程（in-flight）必须显示航向行。
 * 落稳后清掉，交还既有题头与站文；idle 本就没有航向。
 */
export function shouldShowFlightBearing(phase: FlightBearingPhase): boolean {
	return phase === 'in-flight';
}

/**
 * 飞行未结束时卡片不得被 `is-out` 淡掉：那会把航向行一起透明成空槽。
 * 换站卡的既有淡入只发生在落稳之后（settled），飞行中恒为 false。
 */
export function shouldHoldCardOutDuringFlight(phase: FlightBearingPhase): boolean {
	return phase === 'settled';
}
