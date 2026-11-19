// The screen: a WebGL canvas with the 2D HUD canvas over it, the text kit and the vignette.
import * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { params } from './hook';

/** Logical size of the HUD. */
export const W = 1280, H = 720;
export const SERIF = '"Nanum Myeongjo", "AppleMyungjo", "Apple SD Gothic Neo", serif';
export const SANS = '"Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
/** A headless shot or check: 3D draws cheap; players never see it. */
export const CHEAP = params.get('render') === 'cheap';
/** The post-effects chain, made by main once the scene exists. */
export const post: { composer: EffectComposer | null; bloom: UnrealBloomPass | null } = { composer: null, bloom: null };

export const wrap = document.getElementById('wrap')!;
export const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
export const ctx = canvas.getContext('2d')!;
export const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector<HTMLCanvasElement>('#gl')!, antialias: !CHEAP });
renderer.setPixelRatio(CHEAP ? 0.5 : Math.min(2, devicePixelRatio || 1));
renderer.shadowMap.enabled = !CHEAP;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
/** Fills the window at any size and pixel ratio, 16:9. */
export function fit(): void { // fills the window at any size and pixel ratio, 16:9
  const s = Math.min(innerWidth / W, innerHeight / H), r = s * (devicePixelRatio || 1);
  const cw = Math.round(W * s), ch = Math.round(H * s);
  wrap.style.width = cw + 'px'; wrap.style.height = ch + 'px';
  wrap.style.top = Math.max(0, Math.floor((innerHeight - ch) / 2)) + 'px';
  canvas.width = Math.round(W * r); canvas.height = Math.round(H * r);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  ctx.setTransform(r, 0, 0, r, 0, 0);
  renderer.setSize(cw, ch);
  if (post.composer) { post.composer.setPixelRatio(renderer.getPixelRatio()); post.composer.setSize(cw, ch); }
}
addEventListener('resize', fit); fit();
/** HUD text with a soft dark glow behind it. */
export function text(s: string, x: number, y: number, size: number, c: string, align: CanvasTextAlign = 'center', font = SANS, weight = 600, alpha = 1): void {
  ctx.globalAlpha = alpha; ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(20,8,30,0.85)'; ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = c; ctx.fillText(s, x, y);
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
}
export const vignette = (() => { // a soft dark edge, drawn over every frame
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
  gr.addColorStop(0, 'rgba(20,6,30,0)'); gr.addColorStop(1, 'rgba(20,6,30,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H); return c;
})();
