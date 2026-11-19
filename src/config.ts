// Every tuning value, from data/config.json: each with value, min, max and step. The game
// reads them live through `tune`, so the tweak panel (dev server only) moves them at once.
import data from '../data/config.json';

type Data = typeof data;
/** The tunable keys: every entry with a value. */
export type TuneKey = Exclude<keyof Data, 'seed'>;
/** The whole file, as the game and the panel share it. */
export const CONFIG: Data = data;
/** Live reads: tune.stroke_time is CONFIG.stroke_time.value. */
export const tune = new Proxy({}, { get: (_, k) => CONFIG[k as TuneKey].value }) as { readonly [K in TuneKey]: number };
if (import.meta.env.DEV) await import('./dev/tune');
