// Input: keys by position (event.code), OS key repeat ignored, and mouse drag to look.
import { tune } from './config';
import { startAudio } from './audio';

export const down = new Set<string>(), hit = new Set<string>();
export const pressed = (code: string): boolean => hit.has(code); // true for one step after the key goes down
addEventListener('keydown', e => {
  startAudio();
  if (!e.repeat) { down.add(e.code); hit.add(e.code); }
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => down.delete(e.code));
export let dragging = false, dragX = 0, dragY = 0, lookIn = { yaw: 0, pitch: 0 };
addEventListener('pointerdown', e => { startAudio(); dragging = true; dragX = e.clientX; dragY = e.clientY; });
addEventListener('pointermove', e => {
  if (!dragging) return;
  lookIn.yaw -= (e.clientX - dragX) * tune.mouse_sensitivity; lookIn.pitch += (e.clientY - dragY) * tune.mouse_sensitivity;
  dragX = e.clientX; dragY = e.clientY;
});
addEventListener('pointerup', () => { dragging = false; });
addEventListener('blur', () => { down.clear(); dragging = false; });
