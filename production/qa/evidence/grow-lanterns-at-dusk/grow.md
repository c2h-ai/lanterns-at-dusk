# Grow: lanterns-at-dusk

From `one-shot/lanterns-at-dusk` (ecfd90a), grown at 3cf2ec4 (iteration 2).

| Step | Result | Seen in |
|---|---|---|
| 1 Reference | exact yes: two same-seed runs matched, 0 errors | reference.png |
| 2 Copy (JavaScript, three.js from npm 0.186.1) | match yes, 0 errors | copy.png |
| 3 TypeScript (screen, input, audio, world, game/lake, game/math, main) | match yes, 0 errors; `tsc --noEmit` clean | typescript.png |
| 4 Rules under test | Vitest 3 passed (gate shuts its channel, open start water, a memory per lantern; the gate rule broken once and seen to fail); Playwright 2 passed (@boot, rowing moves the boat and the same seed repeats) | - |
| 5 Checks | `npm run build` ok, `test-run.sh web` rule web:pass (5 tests), `npm run smoke` 1 passed | - |

typescript.png and reference.png show the same frame.

NOT ASSESSED: nothing.

Still `Loose`: the boat state, the camera state, the game state, lanterns and the lighthouse and boat objects from world.ts (typing still to do).
