// Playwright: the single-file build opened from disk, driven through the
// game-state hook (src/hook.ts). npm run smoke runs only the @boot test.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

/** Opens the build and collects every page error and console error. */
async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(build(query));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  return errors;
}

test('boots to the title screen with no errors @boot', async ({ page }) => {
  const errors = await open(page, 'manual=1&render=cheap');
  expect(await page.evaluate(() => window.game!.scene)).toBe('title');
  const size = await page.locator('#game').boundingBox();
  expect(size && size.width > 0 && size.height > 0).toBe(true);
  expect(errors).toEqual([]);
});

test('rowing moves the boat forward, and the same seed repeats it exactly', async ({ page }) => {
  // ?manual=1 stops the loop, so only step() moves the game.
  type Boat = { x: number; z: number; heading: number; speed: number };
  async function run(): Promise<{ scene: string; moved: number; boat: Boat }> {
    await open(page, 'manual=1&seed=7&render=cheap');
    return page.evaluate(() => {
      const g = window.game!, boat = (): Boat => (g.state as { boat: Boat }).boat;
      g.press('Enter'); g.step(1, false);
      const z0 = boat().z;
      g.hold('ArrowUp', true); g.step(180, false); g.hold('ArrowUp', false);
      g.hold('ArrowLeft', true); g.step(60, false); g.hold('ArrowLeft', false);
      return { scene: g.scene, moved: z0 - boat().z, boat: boat() };
    });
  }
  const first = await run();
  expect(first.scene).toBe('play');
  expect(first.moved).toBeGreaterThan(3); // forward is -z
  expect(await run()).toEqual(first);
});
