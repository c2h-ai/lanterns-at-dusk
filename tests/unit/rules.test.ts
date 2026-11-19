// Vitest: the lake's rules in src/game/, run in Node with no browser.
import { describe, expect, it } from 'vitest';
import { BASINS, GATES, LANTERNS, MEMORIES, waterSd } from '../../src/game/lake';

describe('the lake', () => {
  it('starts the boat in open water in the first basin', () => {
    expect(waterSd(BASINS[0].x, BASINS[0].z, true)).toBeLessThan(0);
  });

  it('keeps a channel shut until its gate opens', () => {
    const g = GATES[0], a = BASINS[0], b = BASINS[1];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2; // the middle of the first channel
    g.open = false;
    expect(waterSd(mx, mz, true)).toBeGreaterThan(0); // the boat may not enter
    expect(waterSd(mx, mz, false)).toBeLessThan(0); // but the water is drawn there
    g.open = true;
    expect(waterSd(mx, mz, true)).toBeLessThan(0);
    g.open = false;
  });

  it('has one memory for every lantern', () => {
    expect(MEMORIES.length).toBe(LANTERNS.length);
  });
});
