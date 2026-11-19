// Small number helpers.
/** v kept between a and b. */
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** a to b by t. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 0 below a, 1 above b, eased between. */
export const smooth = (a: number, b: number, v: number): number => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
