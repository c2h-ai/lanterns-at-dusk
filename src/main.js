// The game: the one-shot's script, carried over as it was. The grow step splits it
// by what the code does and moves it to TypeScript.
import './config.js';
import * as THREE_CORE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
// The one-shot used one global THREE with its add-ons on it; the same shape, from npm.
const THREE = { ...THREE_CORE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, Reflector };

'use strict';
// Lanterns at Dusk: row a small boat across a sunset lake, light the floating lanterns,
// and light the lighthouse at nightfall.

// ---- Built to be checked ----------------------------------------------------------------
const params = new URLSearchParams(location.search);
const tune = new Proxy({}, { get: (_, k) => CONFIG[k].value }); // live: tune.speed is CONFIG.speed.value
const STEP = 1 / 60;            // simulation step in seconds; motion is per second, never per frame
const W = 1280, H = 720;        // logical size of the HUD
const SERIF = '"Nanum Myeongjo", "AppleMyungjo", "Apple SD Gothic Neo", serif';
const SANS = '"Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const TITLE = 'Lanterns at Dusk';
const CONTROLS = [
  'W / ↑ : 노 젓기     S / ↓ : 뒤로',
  'A D / ← → : 방향 바꾸기',
  'Space : 가까운 등불 밝히기',
  '마우스 드래그 : 둘러보기     P : 일시정지     M : 음소거',
];
const clock = window.GAME_CLOCK || { now: () => performance.now() / 1000 }; // a check may inject one
const CHEAP = params.get('render') === 'cheap'; // a headless shot or check: 3D draws cheap; players never see it
let seed;
function rng() { // mulberry32; every gameplay random call reads this, never Math.random
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const events = []; // window.game.events: anything the game wants a run to see
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- Screen: a WebGL canvas with the HUD canvas over it ---------------------------------
const wrap = document.getElementById('wrap');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: !CHEAP });
renderer.setPixelRatio(CHEAP ? 0.5 : Math.min(2, devicePixelRatio || 1));
renderer.shadowMap.enabled = !CHEAP;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
let composer = null, bloom = null; // post effects, made once the scene exists
function fit() { // fills the window at any size and pixel ratio, 16:9
  const s = Math.min(innerWidth / W, innerHeight / H), r = s * (devicePixelRatio || 1);
  const cw = Math.round(W * s), ch = Math.round(H * s);
  wrap.style.width = cw + 'px'; wrap.style.height = ch + 'px';
  wrap.style.top = Math.max(0, Math.floor((innerHeight - ch) / 2)) + 'px';
  canvas.width = Math.round(W * r); canvas.height = Math.round(H * r);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  ctx.setTransform(r, 0, 0, r, 0, 0);
  renderer.setSize(cw, ch);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(cw, ch); }
}
addEventListener('resize', fit); fit();
function text(s, x, y, size, c, align = 'center', font = SANS, weight = 600, alpha = 1) {
  ctx.globalAlpha = alpha; ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(20,8,30,0.85)'; ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = c; ctx.fillText(s, x, y);
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
}
const vignette = (() => { // a soft dark edge, drawn over every frame
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
  gr.addColorStop(0, 'rgba(20,6,30,0)'); gr.addColorStop(1, 'rgba(20,6,30,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H); return c;
})();

// ---- Input: keys by position (event.code), OS key repeat ignored ------------------------
const down = new Set(), hit = new Set();
const pressed = code => hit.has(code); // true for one step after the key goes down
addEventListener('keydown', e => {
  startAudio();
  if (!e.repeat) { down.add(e.code); hit.add(e.code); }
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => down.delete(e.code));
let dragging = false, dragX = 0, dragY = 0, lookIn = { yaw: 0, pitch: 0 };
addEventListener('pointerdown', e => { startAudio(); dragging = true; dragX = e.clientX; dragY = e.clientY; });
addEventListener('pointermove', e => {
  if (!dragging) return;
  lookIn.yaw -= (e.clientX - dragX) * tune.mouse_sensitivity; lookIn.pitch += (e.clientY - dragY) * tune.mouse_sensitivity;
  dragX = e.clientX; dragY = e.clientY;
});
addEventListener('pointerup', () => { dragging = false; });
addEventListener('blur', () => { down.clear(); dragging = false; });

// ---- Audio: started on first input, mute on M --------------------------------------------
let audio = null, muted = false;
function noiseBuffer(ac, secs) { // white noise from a fixed LCG (sound only, never gameplay)
  const b = ac.createBuffer(1, Math.floor(ac.sampleRate * secs), ac.sampleRate), d = b.getChannelData(0);
  let x = 12345; for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = x / 0x3fffffff - 1; }
  return b;
}
function startAudio() {
  if (!audio) {
    const ac = window.GAME_AUDIO || new (window.AudioContext || window.webkitAudioContext)(); // a check may inject one
    const out = ac.createGain(); out.gain.value = muted ? 0 : tune.volume;
    out.connect(ac.destination); audio = { ac, out, noise: noiseBuffer(ac, 2) };
    // Ambience: lapping water (filtered noise) and a soft two-note drone.
    const src = ac.createBufferSource(); src.buffer = audio.noise; src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ac.createGain(); g.gain.value = 0.05; src.connect(lp).connect(g).connect(out); src.start();
    for (const [f, v] of [[110, 0.018], [164.8, 0.012], [220.5, 0.006]]) {
      const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = f; og.gain.value = v;
      o.connect(og).connect(out); o.start();
    }
  }
  if (audio.ac.state === 'suspended') audio.ac.resume();
}
function setMuted(m) { muted = m; if (audio) audio.out.gain.value = m ? 0 : tune.volume; }
addEventListener('tune', () => setMuted(muted)); // the tweak panel (an add-on), when added, moved a value: the volume follows
function tone(freq, dur, type = 'sine', vol = 0.2, delay = 0) {
  if (!audio || muted) return;
  const t = audio.ac.currentTime + delay, o = audio.ac.createOscillator(), g = audio.ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.out); o.start(t); o.stop(t + dur);
}
function splash(vol = 0.12, freq = 900) {
  if (!audio || muted) return;
  const t = audio.ac.currentTime, s = audio.ac.createBufferSource(), f = audio.ac.createBiquadFilter(), g = audio.ac.createGain();
  s.buffer = audio.noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  s.connect(f).connect(g).connect(audio.out); s.start(t, (t * 7) % 1.4); s.stop(t + 0.55);
}
const sfx = {
  stroke: () => splash(0.1, 700),
  light: () => [659.3, 987.8, 1318.5].forEach((f, i) => tone(f, 1.8 - i * 0.3, 'sine', 0.12, i * 0.09)),
  gate: () => { tone(98, 1.6, 'triangle', 0.18); [523.3, 784, 1046.5].forEach((f, i) => tone(f, 1.5, 'sine', 0.08, 0.3 + i * 0.15)); },
  bump: () => splash(0.08, 300),
  ending: () => [392, 493.9, 587.3, 784, 987.8].forEach((f, i) => tone(f, 5, 'sine', 0.09, i * 0.35)),
};

// ---- The lake: three basins joined by channels, each channel shut by a gate ---------------
const BASINS = [
  { x: 0, z: 0, r: 40, name: '1장 · 노을 갈대밭' },
  { x: 28, z: -112, r: 42, name: '2장 · 기둥 마을' },
  { x: -12, z: -240, r: 55, name: '3장 · 등대의 호수' },
];
const CHANNEL_R = 8;
const ISLAND = { x: -12, z: -262, r: 9 }; // the lighthouse rock
const START = { x: 3, z: 27, heading: 0 };
const LANTERNS = [ // [x, z, basin]
  [-27, -8, 0], [24, -20, 0], [-14, -30, 0],
  [14, -96, 1], [44, -100, 1], [47, -138, 1], [4, -134, 1],
  [-40, -225, 2], [20, -235, 2], [-35, -272, 2], [15, -275, 2],
];
const HOUSES = [[5, -92], [22, -84], [50, -108], [38, -142], [12, -128], [55, -128]];
const BRIDGES = [[0, 1], [2, 5], [3, 5], [3, 4]];
const MEMORIES = [
  '할머니는 해 질 녘에만 배를 띄웠다.',
  '"물은 빛을 기억한단다." 그렇게 말하며 웃으셨다.',
  '그날 나는 노 젓는 법을 처음 배웠다.',
  '기둥 마을의 창마다 저녁이 켜지던 시절이 있었다.',
  '우리는 다리 밑에서 등불을 띄우며 소원을 빌었다.',
  '누군가는 떠났고, 누군가는 끝내 돌아오지 않았다.',
  '그래도 할머니는 매일 같은 시간에 불을 켰다.',
  '밤이 오면 호수는 하늘을 닮는다.',
  '별과 등불이 구별되지 않을 만큼.',
  '마지막으로 등대에 불이 오르던 날을 기억한다.',
  '이제는 내가 불을 켤 차례다.',
];
const FINAL_MEMORY = '물은 빛을 기억한다. 그리고 나는, 그 빛을 기억한다.';
const GATES = [0, 1].map(i => { // where channel i leaves basin i
  const a = BASINS[i], b = BASINS[i + 1], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
  return { i, x: a.x + dx / l * (a.r + 3), z: a.z + dz / l * (a.r + 3), dx: dx / l, dz: dz / l, open: false, lift: 0 };
});

// Smooth value noise (deterministic): shapes the shores and hills.
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(ix, iz), hash2(ix + 1, iz), ux), lerp(hash2(ix, iz + 1), hash2(ix + 1, iz + 1), ux), uz);
}
function fbm(x, z) { let s = 0, a = 0.5; for (let i = 0; i < 4; i++) { s += a * vnoise(x, z); x *= 2.03; z *= 2.03; a *= 0.5; } return s; }
function capsule(px, pz, ax, az, bx, bz, r) {
  const abx = bx - ax, abz = bz - az, t = clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz), 0, 1);
  return Math.hypot(px - ax - abx * t, pz - az - abz * t) - r;
}
// Signed distance to the water's edge: below 0 is water. `collide` shuts channels whose gate is closed.
function waterSd(x, z, collide) {
  let d = Infinity;
  for (const b of BASINS) d = Math.min(d, Math.hypot(x - b.x, z - b.z) - b.r);
  for (const g of GATES) {
    if (collide && !g.open) continue;
    const a = BASINS[g.i], b = BASINS[g.i + 1];
    d = Math.min(d, capsule(x, z, a.x, a.z, b.x, b.z, CHANNEL_R));
  }
  d += (fbm(x * 0.06, z * 0.06) - 0.5) * 7; // ragged shores
  return Math.max(d, -(Math.hypot(x - ISLAND.x, z - ISLAND.z) - ISLAND.r));
}
function groundH(x, z) { // land height, the same function the terrain mesh is built from
  const s = waterSd(x, z, false);
  if (s < 0) return -2.5 + Math.max(s, -6) * 0.2;
  return Math.min(28, 0.3 + s * 0.32 + fbm(x * 0.035 + 7, z * 0.035) * Math.min(s, 40) * 0.55);
}

// ---- Scene, sky and light -----------------------------------------------------------------
const scene3 = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(55, W / H, 0.1, 3000);
// Three stages of the sky, blended by `dusk` (0 golden hour, 1 deep red, 2 night).
const PALETTES = [
  { zenith: 0x34357e, upper: 0xb9467a, mid: 0xff6a3c, horizon: 0xffc066, sun: 0xfff0c8, deep: 0x2a1838, fog: 0xf0885e, elev: 6, sunI: 3.2, hemi: 0.9 },
  { zenith: 0x231d5c, upper: 0x8c2f6e, mid: 0xdc3f34, horizon: 0xff8442, sun: 0xffc896, deep: 0x22132f, fog: 0xc95a52, elev: 2, sunI: 2.4, hemi: 0.7 },
  { zenith: 0x05081a, upper: 0x0f1434, mid: 0x231f4c, horizon: 0x45376a, sun: 0xa9bcff, deep: 0x05070f, fog: 0x1d1934, elev: -8, sunI: 0.5, hemi: 0.35 },
];
const SKY_U = {
  uZenith: { value: new THREE.Color() }, uUpper: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() },
  uNight: { value: 0 }, uTime: { value: 0 },
};
const SKY_GLSL = `
uniform vec3 uZenith, uUpper, uMid, uHorizon, uSunCol, uSunDir; uniform float uNight, uTime;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
vec3 skyColor(vec3 d) {
  float h = d.y; vec3 col;
  col = mix(uHorizon, uMid, smoothstep(0.0, 0.07, h));
  col = mix(col, uUpper, smoothstep(0.05, 0.26, h));
  col = mix(col, uZenith, smoothstep(0.22, 0.8, h));
  if (h < 0.0) col = mix(uHorizon, uMid * 0.7, smoothstep(0.0, -0.25, h));
  vec3 sd = normalize(uSunDir); float s = max(dot(d, sd), 0.0), day = 1.0 - uNight;
  col += uSunCol * (pow(s, 6.0) * 0.3 + pow(s, 48.0) * 0.45) * day;
  col += uSunCol * smoothstep(0.9982, 0.999, s) * 3.5 * day;
  if (h > 0.0) { // long painted cloud bands, lit from the sun's side
    float az = atan(d.z, d.x);
    vec2 cp = vec2(az * 3.2 + uTime * 0.003, h * 26.0);
    float n = fbm2(cp + vec2(fbm2(cp * 0.6) * 1.8, 0.0));
    float band = smoothstep(0.015, 0.07, h) * (1.0 - smoothstep(0.22, 0.45, h));
    float c = smoothstep(0.52, 0.78, n) * band;
    vec3 lit = mix(uUpper * 1.15, uSunCol * 1.6, pow(s, 3.0) * day);
    col = mix(col, mix(lit, uZenith * 1.6, uNight * 0.8), c * 0.85);
    vec2 sp = vec2(az * 140.0, asin(clamp(h, 0.0, 1.0)) * 140.0), g = floor(sp); float r = h21(g);
    float star = step(0.986, r) * smoothstep(0.32, 0.0, length(fract(sp) - 0.5));
    col += vec3(1.0, 0.95, 0.88) * star * uNight * smoothstep(0.04, 0.25, h) * (0.55 + 0.45 * sin(uTime * 1.7 + r * 50.0)) * 2.0;
  }
  return col;
}`;
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: SKY_U,
  vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: SKY_GLSL + `varying vec3 vDir; void main() { gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), skyMat); sky.frustumCulled = false; sky.renderOrder = -1; scene3.add(sky);
scene3.fog = new THREE.Fog(0xf0885e, 30, 240);
const hemi = new THREE.HemisphereLight(0xff9a70, 0x2a1838, 0.9); scene3.add(hemi);
const sun = new THREE.DirectionalLight(0xffb070, 3); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 260 });
scene3.add(sun, sun.target);
const SUN_AZ = 200; // degrees: the sun sits low ahead of the course, so the water carries its gold path
function applyPalette(dusk) {
  const i = Math.min(1, Math.floor(dusk)), t = dusk - i, a = PALETTES[i], b = PALETTES[Math.min(2, i + 1)];
  const mixC = (k, out) => out.setHex(a[k]).lerp(new THREE.Color(b[k]), t);
  mixC('zenith', SKY_U.uZenith.value); mixC('upper', SKY_U.uUpper.value); mixC('mid', SKY_U.uMid.value);
  mixC('horizon', SKY_U.uHorizon.value); mixC('sun', SKY_U.uSunCol.value);
  mixC('fog', scene3.fog.color); mixC('deep', WATER_U.uDeep.value);
  const elev = lerp(a.elev, b.elev, t);
  SKY_U.uNight.value = smooth(1.2, 1.9, dusk);
  SKY_U.uSunDir.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Math.max(elev, 3)), THREE.MathUtils.degToRad(SUN_AZ));
  if (elev < 0) SKY_U.uSunDir.value.y = Math.sin(THREE.MathUtils.degToRad(elev));
  sun.color.copy(SKY_U.uSunCol.value); sun.intensity = lerp(a.sunI, b.sunI, t);
  hemi.intensity = lerp(a.hemi, b.hemi, t); hemi.color.copy(SKY_U.uMid.value).lerp(SKY_U.uZenith.value, 0.3);
  // At night the light comes from a high moon instead of the sunken sun.
  const night = SKY_U.uNight.value;
  sunPos.copy(SKY_U.uSunDir.value); sunPos.y = Math.max(sunPos.y, 0.1); sunPos.lerp(new THREE.Vector3(0.4, 0.8, 0.3), night).normalize();
}
const sunPos = new THREE.Vector3();

// ---- Water: a mirror of the sky and the scene, broken by small waves and the boat's rings -----
const MAX_RIPPLES = 16, MAX_LIGHTS = 8;
const WATER_U = Object.assign({
  uDeep: { value: new THREE.Color(0x2a1838) }, uFogCol: { value: new THREE.Color() }, uFogNear: { value: 30 }, uFogFar: { value: 240 },
  uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uLights: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uLightCol: { value: new THREE.Color(0xffa040) }, uReflect: { value: 0 }, uWave: { value: 1 }, uBlur: { value: 0.55 },
  tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, color: { value: new THREE.Color(0xffffff) },
}, SKY_U);
const WATER_SHADER = {
  uniforms: WATER_U,
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vReflUv; varying vec3 vWorld;
    void main() { vReflUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: SKY_GLSL + `
    uniform sampler2D tDiffuse; uniform float uReflect, uWave, uBlur, uFogNear, uFogFar;
    uniform vec3 uDeep, uFogCol, uLightCol; uniform vec4 uRipples[${MAX_RIPPLES}]; uniform vec4 uLights[${MAX_LIGHTS}];
    varying vec4 vReflUv; varying vec3 vWorld;
    vec2 wav(vec2 p, vec2 dir, float k, float sp, float a) { return a * k * dir * cos(dot(p, dir) * k + uTime * sp); }
    void main() {
      vec2 p = vWorld.xz;
      vec2 g = wav(p, vec2(0.8, 0.6), 0.55, 1.1, 0.05) + wav(p, vec2(-0.6, 0.8), 0.9, 1.6, 0.03) + wav(p, vec2(0.2, -0.98), 1.7, 2.3, 0.015)
             + wav(p, vec2(-0.95, -0.3), 3.1, 3.4, 0.008) + wav(p, vec2(0.7, -0.7), 5.3, 4.1, 0.004);
      vec2 q = p * 0.35 + uTime * 0.05; float e = 0.05;
      g += vec2(fbm2(q + vec2(e, 0.0)) - fbm2(q - vec2(e, 0.0)), fbm2(q + vec2(0.0, e)) - fbm2(q - vec2(0.0, e))) * 0.35;
      g *= uWave;
      for (int i = 0; i < ${MAX_RIPPLES}; i++) {
        vec4 r = uRipples[i]; if (r.w <= 0.0) continue;
        vec2 dv = p - r.xy; float d = length(dv), k = d - r.z * 2.4;
        g += dv / max(d, 0.001) * sin(k * 5.0) * exp(-k * k * 0.9) * exp(-r.z * 0.8) * r.w * 0.5;
      }
      vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 V = normalize(cameraPosition - vWorld), R = reflect(-V, n); R.y = abs(R.y);
      float fres = clamp(0.25 + 0.75 * pow(1.0 - max(dot(n, V), 0.0), 3.0), 0.0, 1.0);
      vec3 refl = skyColor(normalize(R));
      if (uReflect > 0.5) {
        vec4 uv = vReflUv; uv.xy += n.xz * uBlur * uv.w;
        vec4 sc = texture2DProj(tDiffuse, uv); refl = sc.rgb;
      }
      vec3 col = mix(uDeep, refl, fres);
      vec3 sd = normalize(uSunDir); float spec = pow(max(dot(R, sd), 0.0), 220.0);
      col += uSunCol * spec * 5.0 * (1.0 - uNight);
      for (int i = 0; i < ${MAX_LIGHTS}; i++) {
        vec4 L = uLights[i]; if (L.w <= 0.0) continue;
        vec3 ld = normalize(L.xyz - vWorld); float s = pow(max(dot(R, ld), 0.0), 40.0); float dist = length(L.xz - p);
        col += uLightCol * L.w * (s * 2.2 / (1.0 + dist * 0.06) + 0.35 * exp(-dist * 0.45));
      }
      float fd = length(cameraPosition - vWorld);
      col = mix(col, uFogCol, smoothstep(uFogNear, uFogFar, fd));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
let water;
if (!CHEAP) {
  water = new THREE.Reflector(new THREE.PlaneGeometry(1400, 1400), {
    shader: WATER_SHADER, clipBias: 0.003,
    textureWidth: Math.round(W * Math.min(2, devicePixelRatio || 1) * 0.6), textureHeight: Math.round(H * Math.min(2, devicePixelRatio || 1) * 0.6),
  });
  // Reflector clones the uniforms: share the live ones back so palette and ripples reach it.
  const own = water.material.uniforms;
  for (const k of Object.keys(WATER_U)) if (!['tDiffuse', 'textureMatrix', 'color'].includes(k)) own[k] = WATER_U[k];
  own.uReflect.value = 1;
} else {
  water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.ShaderMaterial(WATER_SHADER));
}
water.rotation.x = -Math.PI / 2; scene3.add(water);

// ---- Pieces ---------------------------------------------------------------------------------
const matCache = {};
function mat(c, extra) {
  const k = c + (extra ? JSON.stringify(extra) : '');
  if (!matCache[k]) matCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color: c, flatShading: true, roughness: 0.9, metalness: 0 }, extra));
  return matCache[k];
}
function mesh(geo, m, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(geo, typeof m === 'number' ? mat(m) : m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
  if (parent) parent.add(o);
  return o;
}
const glowMat = (c, i) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, flatShading: true, roughness: 0.6 });
const C = { wood: 0x8a5236, woodDark: 0x2e1a1e, cloak: 0x2a3060, cloakLight: 0x3d4888, skin: 0xd99a7a, paper: 0xffd9a0, glow: 0xffa040,
  wall: 0x7a4a5e, roof: 0x3a2236, stone: 0x5a4458, stoneLight: 0x7a5e70, reed: 0x2a1c24, white: 0xe8dccf, red: 0x9a2a36 };

// Terrain: banks and hills shaped from the lake's own distance field, so shores match the boat's.
{
  const geo = new THREE.PlaneGeometry(340, 470, 170, 235); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -110);
  const pos = geo.attributes.position, col = [], cSand = new THREE.Color(0xb86a4c), cLow = new THREE.Color(0x5c3446), cHigh = new THREE.Color(0x35223f);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = groundH(x, z); pos.setY(i, h);
    const c = h < 0.8 ? cSand : cLow.clone().lerp(cHigh, smooth(2, 16, h)); col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  land.receiveShadow = true; land.castShadow = true; scene3.add(land);
}
// Far ranges, layered into the haze.
for (let i = 0; i < 14; i++) {
  const a = i / 14 * Math.PI * 2, r = 330 + (i % 3) * 70, h = 50 + hash2(i, 3) * 70;
  const m = mesh(new THREE.ConeGeometry(70 + hash2(i, 9) * 50, h, 6), 0x3a2448, Math.cos(a) * r, h / 2 - 4, -120 + Math.sin(a) * r * 1.2);
  m.castShadow = false;
}

// Reeds: thousands of thin blades along the shallows, swaying, and parting around the boat.
const reedU = { uTime: { value: 0 }, uBoat: { value: new THREE.Vector2() } };
const reedMat = new THREE.MeshStandardMaterial({ color: C.reed, flatShading: true, roughness: 1 });
reedMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, reedU);
  sh.vertexShader = 'uniform float uTime; uniform vec2 uBoat;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float hh = clamp(position.y / 2.2, 0.0, 1.0); hh *= hh;
    transformed.x += sin(uTime * 1.2 + ip.x * 0.35 + ip.z * 0.2) * 0.25 * hh;
    transformed.z += cos(uTime * 0.9 + ip.z * 0.3) * 0.12 * hh;
    vec2 away = ip.xz - uBoat; float dd = length(away);
    transformed.xz += away / max(dd, 0.01) * smoothstep(3.2, 0.6, dd) * 1.3 * hh;`);
};
{
  const blade = new THREE.ConeGeometry(0.045, 2.2, 3); blade.translate(0, 1.1, 0);
  const head = new THREE.CylinderGeometry(0.07, 0.07, 0.35, 4); head.translate(0, 1.85, 0);
  const spots = [];
  for (let i = 0; i < 26000 && spots.length < 4200; i++) {
    const x = -70 + hash2(i, 1) * 150, z = 50 - hash2(i, 2) * 200, s = waterSd(x, z, false);
    const inPatch = Math.hypot(x + 27, z + 8) < 7 && Math.hypot(x + 27, z + 8) > 3.2; // the reed ring hiding lantern 1
    if ((s > -3.5 && s < 0.6) || inPatch) spots.push([x, z]);
  }
  const reeds = new THREE.InstancedMesh(blade, reedMat, spots.length), heads = new THREE.InstancedMesh(head, reedMat, spots.length);
  const m4 = new THREE.Matrix4();
  spots.forEach(([x, z], i) => {
    const s = 0.7 + hash2(x, z) * 0.7; m4.makeScale(s, s * (0.8 + hash2(z, x) * 0.6), s).setPosition(x, Math.max(-0.3, groundH(x, z) * 0.2 - 0.2), z);
    reeds.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
  });
  reeds.castShadow = true; heads.castShadow = true; scene3.add(reeds, heads);
}
// Old mooring posts in the first basin, and the dock the trip starts from. Both stop the boat.
const POSTS = [], BOXES = [];
for (let i = 0; i < 12; i++) {
  const a = hash2(i, 5) * Math.PI * 2, r = 12 + hash2(i, 6) * 22, x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (Math.hypot(x - START.x, z - START.z) < 8) continue;
  const p = mesh(new THREE.CylinderGeometry(0.16, 0.2, 3 + hash2(i, 7) * 2, 6), C.woodDark, x, 0.6, z, scene3); POSTS.push([x, z, 0.25]);
  p.rotation.set((hash2(i, 8) - 0.5) * 0.3, 0, (hash2(i, 9) - 0.5) * 0.3);
}
{
  const dock = new THREE.Group(); scene3.add(dock);
  // The dock reaches from deep water all the way up onto the bank.
  let shoreZ = 30; while (shoreZ < 70 && waterSd(0, shoreZ, false) < 0.5) shoreZ += 0.5;
  for (let z = 30, k = 0; z < shoreZ + 1.5; z += 0.6, k++) mesh(new THREE.BoxGeometry(2.4, 0.12, 0.5), k % 2 ? C.wood : 0x6a3e2c, 0, 0.75, z, dock);
  for (let z = 30; z < shoreZ + 1; z += 2.4) for (const x of [-1.1, 1.1]) mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), C.woodDark, x, -0.2, z, dock);
  const post = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 5), C.woodDark, 1.1, 1.8, 30, dock);
  mesh(new THREE.OctahedronGeometry(0.12, 0), glowMat(C.glow, 1.2), 1.1, 2.85, 30, dock);
  BOXES.push([-1.3, 1.3, 29.6, shoreZ + 1.5]);
}

// The boat and the ferryman. A plank-built skiff with ribs, a curled stem and a stern post; the
// ferryman wears a wide reed hat and a long coat, and sculls one long oar over the stern. Faces -z.
function tube(points, r, color, parent, seg = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(curve, seg, r, 6, false), color, 0, 0, 0, parent);
}
function makeBoat() {
  const g = new THREE.Group(), N = 26, K = 10, L = 1.95;
  // Hull: cross-sections along the length, one colour per plank strake.
  const half = z => { const t = Math.abs(z) / L; return { w: 0.74 * Math.pow(Math.max(0, 1 - t * t), 0.55), d: 0.5 * (1 - t * t * 0.55), lift: 0.32 * t * t * (z < 0 ? 1.25 : 1) }; };
  const P = (i, k) => { const z = -L + 2 * L * i / N, { w, d, lift } = half(z), a = Math.PI * k / K; return [-Math.cos(a) * w, 0.45 + lift - Math.sin(a) * d * (1 - lift * 0.4), z]; };
  const pos = [], col = [], shades = [new THREE.Color(0x8a5236), new THREE.Color(0x6e3f2a), new THREE.Color(0x9a6040)];
  for (let i = 0; i < N; i++) for (let k = 0; k < K; k++) {
    const a = P(i, k), b = P(i + 1, k), c = P(i, k + 1), d = P(i + 1, k + 1), sh = shades[Math.min(k, K - 1 - k) % 3];
    for (const v of [a, b, c, c, b, d]) { pos.push(...v); col.push(sh.r, sh.g, sh.b); }
  }
  const hull = new THREE.BufferGeometry(); hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); hull.computeVertexNormals();
  mesh(hull, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.8 }), 0, 0, 0, g);
  // Gunwales along both top edges, ribs inside, floorboards and two thwarts.
  for (const k of [0, K]) tube(Array.from({ length: N + 1 }, (_, i) => { const p = P(i, k); return [p[0] * 1.02, p[1] + 0.03, p[2]]; }), 0.045, 0x5a3020, g, 40);
  for (let i = 3; i < N - 2; i += 3) tube(Array.from({ length: K + 1 }, (_, k) => { const p = P(i, k); return [p[0] * 0.93, p[1] + 0.02, p[2]]; }), 0.022, 0x4a2a1c, g, 12);
  mesh(new THREE.BoxGeometry(0.5, 0.03, 2.6), 0x7a4a30, 0, 0.0, 0.05, g);
  for (const z of [-0.75, 0.25]) { const z0 = half(z); mesh(new THREE.BoxGeometry(z0.w * 1.9, 0.06, 0.3), 0x9a6644, 0, 0.36, z, g); }
  // Curled stem at the bow and a stern post with the oarlock.
  tube([[0, 0.55, -L - 0.02], [0, 0.85, -L - 0.12], [0, 1.08, -L - 0.08], [0, 1.15, -L + 0.06], [0, 1.06, -L + 0.12]], 0.05, 0x5a3020, g, 16);
  tube([[0, 0.5, L - 0.05], [0, 0.72, L + 0.04], [0, 0.88, L + 0.06]], 0.06, 0x5a3020, g, 8);
  mesh(new THREE.TorusGeometry(0.07, 0.02, 5, 8), 0x2e1a1e, 0, 0.92, L + 0.06, g).rotation.x = Math.PI / 2;
  // Cargo: a crate, a sack and a coil of rope.
  mesh(new THREE.BoxGeometry(0.42, 0.32, 0.36), 0x9a6a42, 0.12, 0.2, -0.3, g).rotation.y = 0.3;
  const sack = mesh(new THREE.IcosahedronGeometry(0.22, 1), 0xb89a70, -0.2, 0.18, -0.45, g); sack.scale.set(1, 0.7, 1.2);
  mesh(new THREE.TorusGeometry(0.15, 0.04, 5, 12), 0xc8a874, -0.15, 0.1, 0.62, g).rotation.x = Math.PI / 2;
  // Lantern pole bending over the bow, the lamp on a short chain.
  tube([[0.0, 0.4, -1.25], [0.0, 1.2, -1.45], [0.0, 1.85, -1.85], [0.0, 1.95, -2.25]], 0.035, 0x3a2218, g, 16);
  const lamp = new THREE.Group(); lamp.position.set(0, 1.92, -2.25); g.add(lamp);
  mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 3), 0x2e1a1e, 0, -0.11, 0, lamp);
  const body = new THREE.Group(); body.position.y = -0.4; lamp.add(body);
  mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.3, 6), glowMat(C.paper, 3), 0, 0, 0, body);
  mesh(new THREE.ConeGeometry(0.17, 0.12, 6), C.woodDark, 0, 0.21, 0, body);
  mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.05, 6), C.woodDark, 0, -0.17, 0, body);
  // The stern oar: pivots on the oarlock, blade trailing in the water, handle toward the ferryman.
  const oar = new THREE.Group(); oar.position.set(0, 0.95, L + 0.06); oar.rotation.order = 'YXZ'; g.add(oar);
  mesh(new THREE.CylinderGeometry(0.03, 0.035, 4.2, 6), 0x9a6a42, 0, 0, 1.1, oar).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.05, 0.24, 0.8), 0x9a6a42, 0, 0, 3.0, oar);
  const handle = new THREE.Object3D(); handle.position.set(0, 0, -0.95); oar.add(handle);
  // The ferryman.
  const man = new THREE.Group(); man.position.set(0, 0.06, 1.5); g.add(man);
  const coatPts = [[0.001, 1.52], [0.17, 1.5], [0.2, 1.38], [0.24, 1.15], [0.27, 0.85], [0.33, 0.5], [0.4, 0.15], [0.43, 0.02]].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(coatPts, 10), C.cloak, 0, 0, 0, man);
  mesh(new THREE.CylinderGeometry(0.26, 0.29, 0.1, 10), 0x6a4a3a, 0, 0.92, 0, man); // sash
  const sashTail = mesh(new THREE.BoxGeometry(0.08, 0.4, 0.03), 0x6a4a3a, 0.16, 0.72, 0.24, man); sashTail.rotation.z = 0.15;
  mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.16, 10), C.cloakLight, 0, 1.5, 0, man); // collar
  const head = new THREE.Group(); head.position.set(0, 1.68, 0); man.add(head);
  mesh(new THREE.IcosahedronGeometry(0.15, 1), C.skin, 0, 0, 0, head);
  mesh(new THREE.BoxGeometry(0.2, 0.08, 0.1), 0x3a2a2a, 0, -0.07, -0.1, head); // beard shadow
  const hat = mesh(new THREE.ConeGeometry(0.58, 0.3, 14), 0xc8a060, 0, 0.17, 0, head);
  mesh(new THREE.TorusGeometry(0.17, 0.025, 4, 12), C.red, 0, 0.1, 0, head).rotation.x = Math.PI / 2;
  const scarf = new THREE.Group(); scarf.position.set(0.06, 1.48, 0.18); man.add(scarf);
  mesh(new THREE.BoxGeometry(0.13, 0.03, 0.55), C.red, 0, 0, 0.27, scarf);
  mesh(new THREE.BoxGeometry(0.1, 0.03, 0.45), C.red, -0.1, -0.06, 0.22, scarf).rotation.y = 0.2;
  // Arms reach for the oar handle each frame (render3D aims them).
  const arms = [-1, 1].map(sx => {
    const a = new THREE.Group(); a.position.set(sx * 0.22, 1.38, 0); man.add(a);
    mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.62, 6), C.cloak, 0, 0, 0.31, a).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.06, 6, 4), C.skin, 0, 0, 0.64, a);
    return a;
  });
  return { group: g, lamp, oar, scarf, man, head, arms, handle };
}
const boat = makeBoat(); scene3.add(boat.group);
const boatLight = new THREE.PointLight(0xffa050, 14, 18, 1.5); scene3.add(boatLight);

// Floating lanterns: a small raft with a six-sided paper lantern.
function makeLantern() {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.14, 8), C.woodDark, 0, 0.02, 0, g);
  for (let k = 0; k < 4; k++) { const leaf = mesh(new THREE.ConeGeometry(0.22, 0.6, 4), 0x4a2a3a, 0, 0.12, 0, g); leaf.rotation.set(1.2, k * Math.PI / 2, 0); leaf.translateY(0.35); }
  const paper = new THREE.MeshStandardMaterial({ color: C.paper, emissive: C.glow, emissiveIntensity: 0.03, flatShading: true, roughness: 0.7 });
  mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.6, 6), paper, 0, 0.5, 0, g);
  mesh(new THREE.ConeGeometry(0.34, 0.2, 6), C.woodDark, 0, 0.9, 0, g);
  mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 6), C.woodDark, 0, 0.2, 0, g);
  mesh(new THREE.TorusGeometry(0.08, 0.015, 4, 8), C.woodDark, 0, 1.04, 0, g);
  return { group: g, paper };
}
const lanterns = LANTERNS.map(([x, z, basin], i) => {
  const l = makeLantern(); l.group.position.set(x, 0, z); scene3.add(l.group);
  // A faint column of light over each unlit lantern, so it can be found from across the basin.
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.5, 16, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  beam.position.y = 8.6; l.group.add(beam);
  return Object.assign(l, { x, z, basin, i, lit: false, litAt: 0, rise: 0, beam });
});
const lampPool = Array.from({ length: 4 }, () => { const p = new THREE.PointLight(0xff9a40, 0, 20, 1.8); scene3.add(p); return p; });

// The stilt village: houses on legs, warm windows, plank bridges with strings of small lights.
const windows = [];
HOUSES.forEach(([x, z], hi) => {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = hash2(x, z) * Math.PI; scene3.add(g);
  for (const [sx, sz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3], [0, 1.5]]) mesh(new THREE.CylinderGeometry(0.12, 0.15, 3.6, 5), C.woodDark, sx, 0.4, sz, g);
  mesh(new THREE.BoxGeometry(3.4, 0.2, 3.4), C.wood, 0, 2.2, 0, g);
  mesh(new THREE.BoxGeometry(2.8, 2, 2.6), C.wall, 0, 3.3, 0, g);
  const roofShape = new THREE.Shape(); roofShape.moveTo(-1.8, 0); roofShape.lineTo(0, 1.5); roofShape.lineTo(1.8, 0);
  const roof = mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 3.2, bevelEnabled: false }), C.roof, 0, 4.25, -1.6, g);
  for (const [wx, wz, ry] of [[-0.6, 1.31, 0], [0.6, 1.31, 0], [1.41, 0, Math.PI / 2], [-1.41, 0.3, Math.PI / 2]]) {
    const wm = glowMat(0xffb060, 0.05), w = mesh(new THREE.PlaneGeometry(0.5, 0.65), wm, wx, 3.4, wz, g);
    w.rotation.y = ry; w.castShadow = false; windows.push({ m: wm, house: hi });
  }
});
const bridgeLights = [];
for (const [a, b] of BRIDGES) {
  const [ax, az] = HOUSES[a], [bx, bz] = HOUSES[b], l = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
  const g = new THREE.Group(); g.position.set(ax, 0, az); g.rotation.y = ang; scene3.add(g);
  mesh(new THREE.BoxGeometry(1.2, 0.12, l - 2), C.wood, 0, 2.25, l / 2, g);
  for (const sx of [-0.6, 0.6]) mesh(new THREE.CylinderGeometry(0.02, 0.02, l - 2, 4), C.woodDark, sx, 2.9, l / 2, g).rotation.x = Math.PI / 2;
  for (let k = 1; k < 8; k++) {
    const t = k / 8, sag = Math.sin(t * Math.PI) * 0.6, m = glowMat(0xffc070, 0.05);
    mesh(new THREE.SphereGeometry(0.08, 6, 4), m, 0, 4.4 - sag, 1 + (l - 2) * t, g).castShadow = false; bridgeLights.push(m);
  }
}

// Gates: two stone posts, a beam, and a plank barrier that rises when the basin is all lit.
const GATE_POSTS = [];
const gateObjs = GATES.map(gd => {
  const g = new THREE.Group(); g.position.set(gd.x, 0, gd.z); g.rotation.y = Math.atan2(gd.dx, gd.dz); scene3.add(g);
  for (const sx of [-1, 1]) {
    mesh(new THREE.BoxGeometry(1.4, 8, 1.4), C.stone, sx * (CHANNEL_R + 1.2), 2.5, 0, g);
    mesh(new THREE.BoxGeometry(1.7, 0.4, 1.7), C.stoneLight, sx * (CHANNEL_R + 1.2), 6.6, 0, g);
  }
  mesh(new THREE.BoxGeometry(2 * CHANNEL_R + 4.6, 0.8, 1), C.stone, 0, 7.2, 0, g);
  for (const sx of [-1, 1]) GATE_POSTS.push([gd.x - gd.dz * sx * (CHANNEL_R + 1.2), gd.z + gd.dx * sx * (CHANNEL_R + 1.2), 1.0]);
  const lamps = [-1, 1].map(sx => { const m = glowMat(0xffb060, 0.05); mesh(new THREE.OctahedronGeometry(0.3, 0), m, sx * (CHANNEL_R + 1.2), 7.3, 0, g); return m; });
  const bar = new THREE.Group(); g.add(bar);
  for (let k = -7; k <= 7; k++) mesh(new THREE.BoxGeometry(1.0, 3.6, 0.25), k % 2 ? C.woodDark : C.wood, k * 1.12, 0.9, 0, bar);
  mesh(new THREE.BoxGeometry(2 * CHANNEL_R + 1, 0.25, 0.4), C.woodDark, 0, 2.3, 0, bar);
  return { g, bar, lamps };
});

// The lighthouse on its rock, with a lamp room and a sweeping beam once it is lit.
function makeLighthouse() {
  const g = new THREE.Group();
  for (let k = 0; k < 7; k++) mesh(new THREE.DodecahedronGeometry(2.6 + hash2(k, 1) * 2, 0), C.stone, Math.cos(k) * 6, -0.6, Math.sin(k) * 6, g);
  mesh(new THREE.CylinderGeometry(7, 9, 2, 9), C.stone, 0, 0, 0, g);
  for (let k = 0; k < 5; k++) mesh(new THREE.CylinderGeometry(2.3 - k * 0.22, 2.5 - k * 0.22, 3.2, 12), k % 2 ? C.red : C.white, 0, 2.6 + k * 3.2, 0, g);
  mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.3, 12), C.woodDark, 0, 18.3, 0, g);
  const lampMat = glowMat(0xfff0c0, 0.05), room = mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 10), lampMat, 0, 19.4, 0, g);
  mesh(new THREE.ConeGeometry(1.6, 1.6, 10), C.red, 0, 21.1, 0, g);
  mesh(new THREE.BoxGeometry(2.4, 2.2, 2.4), C.wall, 5, 2.1, 1, g);
  const beamGeo = new THREE.ConeGeometry(7, 60, 24, 1, true); beamGeo.translate(0, -30, 0); beamGeo.rotateZ(Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 19.4; g.add(beam);
  return { group: g, lampMat, beam, room };
}
const lighthouse = makeLighthouse(); lighthouse.group.position.set(ISLAND.x, 0, ISLAND.z); scene3.add(lighthouse.group);
const lighthouseLight = new THREE.PointLight(0xffd090, 0, 120, 1.2); lighthouseLight.position.set(ISLAND.x, 19.4, ISLAND.z); scene3.add(lighthouseLight);

// Floating motes: embers in the sunset, fireflies at night, kept in a box around the camera.
const MOTES = 420;
const moteGeo = new THREE.BufferGeometry(), motePos = new Float32Array(MOTES * 3), moteSeed = new Float32Array(MOTES);
for (let i = 0; i < MOTES; i++) { motePos[i * 3] = hash2(i, 11) * 80 - 40; motePos[i * 3 + 1] = 0.3 + hash2(i, 12) * 8; motePos[i * 3 + 2] = hash2(i, 13) * 80 - 40; moteSeed[i] = hash2(i, 14); }
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3)); moteGeo.setAttribute('seed', new THREE.BufferAttribute(moteSeed, 1));
const moteU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0.4 }, uColor: { value: new THREE.Color(0xffb060) } };
const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({
  uniforms: moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `uniform float uTime; uniform vec3 uCenter; attribute float seed; varying float vA;
    void main() { vec3 p = position; p.xz = mod(p.xz - uCenter.xz + 40.0, 80.0) - 40.0 + uCenter.xz;
      p += vec3(sin(uTime * 0.4 + seed * 40.0), sin(uTime * 0.7 + seed * 17.0) * 0.4, cos(uTime * 0.3 + seed * 23.0)) * 1.5;
      vA = 0.5 + 0.5 * sin(uTime * (1.0 + seed * 2.0) + seed * 60.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (2.0 + seed * 3.0) * 60.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uAmount; uniform vec3 uColor; varying float vA;
    void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor * 3.0, smoothstep(0.5, 0.0, d) * vA * uAmount); }`,
}));
motes.frustumCulled = false; scene3.add(motes);

// The figures lineup, for the outline check (?scene=figures), far off the course.
const lineup = (() => {
  const g = new THREE.Group(); g.position.set(600, 0, 0); scene3.add(g);
  const b = makeBoat(); b.group.rotation.y = -1.2; b.group.position.set(-6, 0.3, 0); g.add(b.group);
  const l = makeLantern(); l.paper.emissiveIntensity = 2.5; l.group.scale.setScalar(2.2); l.group.position.set(0, 0, 0); g.add(l.group);
  const h = makeLighthouse(); h.lampMat.emissiveIntensity = 3; h.group.scale.setScalar(0.32); h.group.position.set(6.5, 0.5, -1); g.add(h.group);
  return { names: ['나룻배와 사공', '물 위의 등불', '등대'], xs: [-6, 0, 6.5] };
})();

// ---- State ----------------------------------------------------------------------------------
let scene, state, B, camS;
const ripples = [];
function addRipple(x, z, strength) {
  if (ripples.length >= MAX_RIPPLES) ripples.shift();
  ripples.push({ x, z, age: 0, s: strength });
}
function reset() {
  seed = Number(params.get('seed')) || CONFIG.seed;
  // state.gained: what this run gained or learned, the high the ending shows.
  state = { t: 0, score: 0, gained: '', lit: 0, basin: 0, seen: [true, false, false], dusk: 0, memory: null, banner: { text: BASINS[0].name, t: 0 },
    ending: -1, done: false, endT: 0, prompt: '', rowed: false, wakeT: 0, bumpT: 0 };
  B = { x: START.x, z: START.z, heading: START.heading, v: 0, side: 0, yawRate: 0, phase: 0, prev: [START.x, START.z, START.heading], power: 0 };
  camS = { yaw: B.heading, prevYaw: B.heading, look: 0, pitch: 0 };
  ripples.length = 0;
  for (const l of lanterns) { l.lit = false; l.rise = 0; l.paper.emissiveIntensity = 0.03; l.group.position.set(l.x, 0, l.z); }
  for (const g of GATES) { g.open = false; g.lift = 0; }
  for (const go of gateObjs) for (const m of go.lamps) m.emissiveIntensity = 0.05;
  for (const w of windows) w.m.emissiveIntensity = 0.05;
  for (const m of bridgeLights) m.emissiveIntensity = 0.05;
  lighthouse.lampMat.emissiveIntensity = 0.05; lighthouse.beam.material.opacity = 0; lighthouseLight.intensity = 0;
}
const forward = h => [-Math.sin(h), -Math.cos(h)];
const litIn = b => lanterns.filter(l => l.basin === b && l.lit).length;
const countIn = b => lanterns.filter(l => l.basin === b).length;
function duskTarget() {
  if (state.ending >= 0) return 2;
  const b = state.seen[2] ? 2 : state.seen[1] ? 1 : 0;
  return [0, 0.8, 1.55][b] + litIn(b) / countIn(b) * [0.5, 0.55, 0.45][b];
}

// ---- Simulation -----------------------------------------------------------------------------
function updateBoat(dt) {
  B.prev = [B.x, B.z, B.heading];
  const row = down.has('KeyW') || down.has('ArrowUp'), back = down.has('KeyS') || down.has('ArrowDown');
  const turn = (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0) - (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0);
  if (state.ending >= 0) { B.v *= Math.exp(-dt); return; }
  // Rowing comes in strokes: thrust on the pull, a glide on the return.
  if (row) {
    const before = B.phase; B.phase += dt / tune.stroke_time; state.rowed = true;
    if (Math.floor(B.phase) !== Math.floor(before) || before % 1 === 0) {
      sfx.stroke(); const [fx, fz] = forward(B.heading);
      addRipple(B.x - fx * 2.6 + fz * 0.6, B.z - fz * 2.6 - fx * 0.6, 1);
    }
    const f = B.phase % 1; B.power = Math.max(0, Math.sin(f * Math.PI * 2)) * 1.6;
  } else { B.power = 0; if (B.phase % 1 > 0.02) B.phase = Math.min(Math.ceil(B.phase), B.phase + dt / tune.stroke_time); }
  B.v += (B.power * tune.stroke_thrust - (back ? tune.back_thrust : 0)) * dt;
  B.v -= B.v * tune.water_drag * dt;
  B.v = clamp(B.v, -2, tune.max_speed);
  const want = turn * tune.turn_rate * (0.35 + 0.65 * Math.min(1, Math.abs(B.v) / 2.5));
  B.yawRate += (want - B.yawRate) * (1 - Math.exp(-tune.turn_ease * dt));
  B.heading += B.yawRate * dt;
  B.side -= B.side * tune.side_grip * dt;
  let [fx, fz] = forward(B.heading), rx = -fz, rz = fx;
  B.x += (fx * B.v + rx * B.side) * dt; B.z += (fz * B.v + rz * B.side) * dt;
  // Shores and gates: the lake's distance field pushes the hull back into open water.
  // The hull is three circles (bow, middle, stern) tested against shores, gates, posts and the dock.
  const HULL = [[1.35, 0.55], [0, 0.85], [-1.35, 0.6]];
  for (const [off, r] of HULL) {
    const px = () => B.x + fx * off, pz = () => B.z + fz * off;
    const d = waterSd(px(), pz(), true);
    if (d > -r) {
      const e = 0.15, x0 = px(), z0 = pz();
      const gx = (waterSd(x0 + e, z0, true) - waterSd(x0 - e, z0, true)) / (2 * e), gz = (waterSd(x0, z0 + e, true) - waterSd(x0, z0 - e, true)) / (2 * e);
      const gl = Math.hypot(gx, gz) || 1; collide(gx / gl, gz / gl, d + r);
    }
    const obstacles = [...HOUSES.map(([x, z]) => [x, z, 2.4]), ...POSTS, ...GATE_POSTS, ...lanterns.filter(l => l.rise === 0).map(l => [l.x, l.z, 0.6])];
    for (const [cx, cz, cr] of obstacles) {
      const dx = px() - cx, dz = pz() - cz, dd = Math.hypot(dx, dz), m = cr + r;
      if (dd < m && dd > 0) collide(-dx / dd, -dz / dd, m - dd);
    }
    for (const [x0, x1, z0, z1] of BOXES) {
      const qx = clamp(px(), x0, x1), qz = clamp(pz(), z0, z1), dx = px() - qx, dz = pz() - qz, dd = Math.hypot(dx, dz);
      if (dd < r && dd > 0) collide(-dx / dd, -dz / dd, r - dd);
      else if (dd === 0) { const c = (x0 + x1) / 2, sx = px() < c ? -1 : 1; collide(-sx, 0, (sx < 0 ? px() - x0 : x1 - px()) + r); }
    }
  }
  function collide(nx, nz, pen) { // n points into the obstacle
    B.x -= nx * pen; B.z -= nz * pen;
    const vx = fx * B.v + rx * B.side, vz = fz * B.v + rz * B.side, vn = vx * nx + vz * nz;
    if (vn <= 0) return;
    const ox = vx - nx * vn * (1 + tune.shore_bounce), oz = vz - nz * vn * (1 + tune.shore_bounce);
    B.v = ox * fx + oz * fz; B.side = ox * rx + oz * rz;
    if (vn > 1.2 && state.bumpT <= 0) { sfx.bump(); state.bumpT = 0.6; events.push({ type: 'bump' }); }
  }
  state.bumpT -= dt;
  // A wake from the bow while the boat moves.
  state.wakeT -= dt;
  if (Math.abs(B.v) > 0.8 && state.wakeT <= 0) { addRipple(B.x + fx * 1.9, B.z + fz * 1.9, 0.45); state.wakeT = 0.45; }
}
function updateStory(dt) {
  // Which basin the boat is in, and a chapter card the first time it arrives.
  BASINS.forEach((b, i) => {
    if (Math.hypot(B.x - b.x, B.z - b.z) < b.r - 4) {
      state.basin = i;
      if (!state.seen[i]) { state.seen[i] = true; state.banner = { text: b.name, t: 0 }; events.push({ type: 'chapter', n: i + 1 }); }
    }
  });
  state.prompt = '';
  if (state.ending >= 0) return;
  let near = null, nd = Infinity;
  for (const l of lanterns) { const d = Math.hypot(B.x - l.x, B.z - l.z); if (!l.lit && d < nd) { nd = d; near = l; } }
  if (near && nd < tune.lantern_reach) {
    state.prompt = 'Space · 등불 밝히기';
    if (pressed('Space')) lightLantern(near);
  }
  // A closed gate tells how many lanterns are left behind.
  GATES.forEach((g, i) => {
    if (!g.open && Math.hypot(B.x - g.x, B.z - g.z) < 14) {
      const left = countIn(i) - litIn(i); state.prompt = `물길이 닫혀 있다 · 남은 등불 ${left}개`;
    }
  });
  if (state.basin === 2 && litIn(2) === countIn(2) && Math.hypot(B.x - ISLAND.x, B.z - ISLAND.z) < ISLAND.r + 9) {
    state.prompt = 'Space · 등대에 불 켜기';
    if (pressed('Space')) { state.ending = 0; sfx.ending(); state.memory = { text: FINAL_MEMORY, t: 0, hold: tune.ending_time }; events.push({ type: 'lighthouse' }); }
  } else if (state.basin === 2 && Math.hypot(B.x - ISLAND.x, B.z - ISLAND.z) < ISLAND.r + 9) {
    state.prompt = `등대에 불을 켜려면 · 남은 등불 ${countIn(2) - litIn(2)}개`;
  }
}
function lightLantern(l) {
  l.lit = true; l.litAt = state.t; state.lit++; sfx.light(); addRipple(l.x, l.z, 1.6);
  state.memory = { text: MEMORIES[state.lit - 1] || '', t: 0, hold: tune.memory_hold };
  events.push({ type: 'light', n: state.lit });
  const g = GATES[l.basin];
  if (g && litIn(l.basin) === countIn(l.basin)) {
    g.open = true; sfx.gate(); for (const m of gateObjs[l.basin].lamps) m.emissiveIntensity = 3;
    state.banner = { text: '물길이 열렸다', t: 0 }; events.push({ type: 'gate', n: l.basin + 1 });
  }
}
function updateWorld(dt) {
  state.t += dt;
  const target = duskTarget();
  state.dusk += clamp(target - state.dusk, -tune.dusk_speed * dt, tune.dusk_speed * dt);
  for (const r of ripples) r.age += dt;
  while (ripples.length && ripples[0].age > 6) ripples.shift();
  for (const g of GATES) g.lift = g.open ? Math.min(1, g.lift + dt / 3) : 0;
  if (state.memory) state.memory.t += dt;
  state.banner.t += dt;
  // The village wakes as its lanterns are lit.
  const v = litIn(1);
  windows.forEach(w => { const on = w.house < v * 1.6 || GATES[1].open; w.m.emissiveIntensity += ((on ? 2.2 : 0.05) - w.m.emissiveIntensity) * Math.min(1, dt * 2); });
  for (const m of bridgeLights) m.emissiveIntensity += (((v >= 2) ? 2.5 : 0.05) - m.emissiveIntensity) * Math.min(1, dt * 2);
  if (state.ending >= 0) {
    state.ending += dt;
    const k = smooth(0, 2.5, state.ending);
    lighthouse.lampMat.emissiveIntensity = 0.05 + k * 6; lighthouse.beam.material.opacity = k * 0.12; lighthouseLight.intensity = k * 900;
    lanterns.forEach((l, i) => { if (state.ending > 1.5 + i * 0.25) l.rise += dt * (0.7 + (i % 3) * 0.2); });
    if (state.ending > tune.ending_time && scene === 'play') { state.done = true; state.endT = state.t; state.gained = '등대에 불이 켜졌다'; scene = 'results'; events.push({ type: 'win', t: state.t }); }
  }
}
function updateCamera(dt) {
  camS.prevYaw = camS.yaw;
  camS.look += lookIn.yaw; camS.pitch = clamp(camS.pitch + lookIn.pitch, -0.25, 0.6); lookIn.yaw = lookIn.pitch = 0;
  if (!dragging) { const k = 1 - Math.exp(-tune.look_return * dt); camS.look -= camS.look * k; camS.pitch -= camS.pitch * k; }
  let d = B.heading + camS.look - camS.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  camS.yaw += d * (1 - Math.exp(-tune.cam_follow * dt));
}

// ---- Drawing --------------------------------------------------------------------------------
let ALPHA = 1; // how far the frame is between the last two steps
const tmpV = new THREE.Vector3();
function render3D(mode) {
  const a = ALPHA, t = state.t;
  const bx = lerp(B.prev[0], B.x, a), bz = lerp(B.prev[1], B.z, a), bh = lerp(B.prev[2], B.heading, a);
  // Boat, oar and scarf.
  const bob = Math.sin(t * 1.3) * 0.05;
  boat.group.position.set(bx, bob, bz); boat.group.rotation.set(Math.sin(t * 1.1) * 0.02 - B.power * 0.02, bh, -B.yawRate * 0.12 + Math.sin(t * 0.9) * 0.025);
  const f = B.phase % 1;
  // Sculling: the oar sweeps side to side; the ferryman leans into it and his hands follow the handle.
  const sw = Math.sin(f * Math.PI * 2), idle = Math.sin(t * 0.8) * 0.06;
  boat.oar.rotation.set(0.38 + Math.cos(f * Math.PI * 2) * 0.05, (B.power > 0 || f > 0.01 ? sw * 0.38 : idle) - B.yawRate * 0.4, 0);
  boat.man.rotation.set(-0.06 - B.power * 0.05, -sw * 0.18, sw * 0.05);
  boat.head.rotation.set(0.05, sw * 0.12 + B.yawRate * 0.4, 0);
  boat.group.updateMatrixWorld(true);
  boat.handle.getWorldPosition(tmpV);
  for (const arm of boat.arms) arm.lookAt(tmpV);
  boat.scarf.rotation.set(0.2 + Math.sin(t * 3.1) * 0.15 + B.v * 0.03, Math.sin(t * 2.1) * 0.3 + B.yawRate * 0.6, Math.sin(t * 4.3) * 0.1);
  boat.lamp.rotation.set(B.power * 0.12 + Math.sin(t * 1.3) * 0.05, 0, Math.sin(t * 1.7) * 0.1 + B.yawRate * 0.3);
  boat.lamp.getWorldPosition(tmpV); boatLight.position.copy(tmpV);
  const lampPos = tmpV.clone();
  // Lanterns: bob, glimmer when near and unlit, flicker when lit, rise at the end.
  const lightsList = [{ p: lampPos, w: 0.8 }];
  lanterns.forEach((l, i) => {
    const y = Math.sin(t * 1.1 + i) * 0.05 + l.rise * l.rise * 0.6 + l.rise * 2;
    l.group.position.set(l.x + Math.sin(l.rise * 0.8 + i) * l.rise * 0.6, y, l.z);
    l.group.rotation.set(Math.sin(t * 0.9 + i) * 0.05, l.rise * 0.5, Math.cos(t * 0.8 + i) * 0.05);
    const near = Math.hypot(bx - l.x, bz - l.z) < tune.lantern_glimmer_range;
    if (l.lit) l.paper.emissiveIntensity = Math.min(2.6, (t - l.litAt) * 3) * (0.92 + Math.sin(t * 9 + i * 3) * 0.05 + Math.sin(t * 23 + i) * 0.03);
    else l.paper.emissiveIntensity = 0.25 + Math.max(0, Math.sin(t * 2.2 + i)) * (near ? 0.6 : 0.25);
    l.beam.visible = !l.lit && l.basin === state.basin;
    l.beam.material.opacity = tune.lantern_beam * (0.7 + Math.sin(t * 1.6 + i) * 0.3);
    if (l.lit) lightsList.push({ p: new THREE.Vector3(l.group.position.x, y + 0.5, l.z), w: 1, d: Math.hypot(cam.position.x - l.x, cam.position.z - l.z) });
  });
  if (state.ending >= 0) lightsList.push({ p: new THREE.Vector3(ISLAND.x, 19.4, ISLAND.z), w: 2.5, d: 0 });
  const sorted = lightsList.slice(1).sort((p, q) => p.d - q.d);
  lampPool.forEach((pl, i) => { const s = sorted[i]; pl.intensity = s ? 18 : 0; if (s) pl.position.copy(s.p); });
  const ul = WATER_U.uLights.value;
  [lightsList[0], ...sorted].slice(0, MAX_LIGHTS).forEach((s, i) => ul[i].set(s.p.x, s.p.y, s.p.z, s.w));
  for (let i = Math.min(MAX_LIGHTS, sorted.length + 1); i < MAX_LIGHTS; i++) ul[i].w = 0;
  ripples.forEach((r, i) => WATER_U.uRipples.value[i].set(r.x, r.z, r.age, r.s));
  for (let i = ripples.length; i < MAX_RIPPLES; i++) WATER_U.uRipples.value[i].w = 0;
  // Gates and the lighthouse beam.
  GATES.forEach((g, i) => { gateObjs[i].bar.position.y = smooth(0, 1, g.lift) * 6.2; });
  lighthouse.beam.rotation.y = t * 0.6;
  // Camera.
  if (mode === 'title') {
    cam.position.set(Math.sin(t * 0.05) * 7, 4.2 + Math.sin(t * 0.13) * 0.4, 40); cam.lookAt(0, 3.5, -40);
  } else if (mode === 'figures') {
    cam.position.set(600, 3.4, -13); cam.lookAt(600, 1.6, 0);
  } else {
    const yaw = camS.prevYaw + Math.atan2(Math.sin(camS.yaw - camS.prevYaw), Math.cos(camS.yaw - camS.prevYaw)) * a;
    const end = state.ending >= 0 ? smooth(0, 9, state.ending) : 0;
    const dist = tune.cam_distance * (1 + end * 1.6), hgt = tune.cam_height + camS.pitch * dist + end * 9;
    let cx = bx + Math.sin(yaw) * dist, cz = bz + Math.cos(yaw) * dist, cy = Math.max(hgt, groundH(cx, cz) + 1.5, 0.8);
    cam.position.set(cx, cy, cz);
    const [fx, fz] = forward(yaw);
    cam.lookAt(bx + fx * 5, 1.4 + end * 8, bz + fz * 5);
  }
  // Sky, light and post.
  applyPalette(state.dusk);
  SKY_U.uTime.value = t; reedU.uTime.value = t; reedU.uBoat.value.set(bx, bz);
  sky.position.copy(cam.position);
  water.position.set(Math.round(cam.position.x / 20) * 20, 0, Math.round(cam.position.z / 20) * 20);
  const focus = mode === 'figures' ? new THREE.Vector3(600, 0, 0) : new THREE.Vector3(bx, 0, bz);
  sun.position.copy(focus).addScaledVector(sunPos, 150); sun.target.position.copy(focus);
  scene3.fog.near = 30; scene3.fog.far = tune.fog_far * (1 - SKY_U.uNight.value * 0.35);
  WATER_U.uFogCol.value.copy(scene3.fog.color); WATER_U.uFogNear.value = scene3.fog.near; WATER_U.uFogFar.value = scene3.fog.far;
  WATER_U.uWave.value = tune.water_ripple; WATER_U.uBlur.value = tune.reflection_blur * 0.1;
  moteU.uTime.value = t; moteU.uCenter.value.copy(cam.position); moteU.uAmount.value = 0.35 + SKY_U.uNight.value * 0.65;
  moteU.uColor.value.setHex(0xffa050).lerp(new THREE.Color(0xd8ff8a), SKY_U.uNight.value);
  renderer.toneMappingExposure = tune.exposure;
  if (composer) { bloom.strength = tune.bloom_strength; bloom.threshold = tune.bloom_threshold; bloom.radius = tune.bloom_radius; composer.render(); }
  else renderer.render(scene3, cam);
}
function fade(t, hold) { return Math.min(1, t / 1.2) * (1 - smooth(hold + 1.2, hold + 2.6, t)); }
function drawHUD() {
  ctx.clearRect(0, 0, W, H); ctx.drawImage(vignette, 0, 0);
  if (state.ending < 0) {
    const b = state.basin;
    text(BASINS[b].name, 40, 40, 20, '#ffe8d0', 'left', SERIF, 600, 0.85);
    text(`등불 ${litIn(b)} / ${countIn(b)}`, 40, 70, 18, '#ffd29a', 'left', SERIF, 600, 0.8);
  }
  if (state.banner && state.banner.t < 5) {
    const al = fade(state.banner.t, 2.2);
    text(state.banner.text, W / 2, H * 0.3, 44, '#fff3e2', 'center', SERIF, 700, al);
  }
  if (state.memory && state.memory.t < state.memory.hold + 2.6) {
    text(state.memory.text, W / 2, H * 0.74, 30, '#fff6ea', 'center', SERIF, 600, fade(state.memory.t, state.memory.hold));
  }
  // A marker on the nearest unlit lantern in this basin: on screen, or an arrow at the edge.
  if (state.ending < 0) {
    let best = null, bd = Infinity;
    for (const l of lanterns) if (!l.lit && l.basin === state.basin) { const d = Math.hypot(B.x - l.x, B.z - l.z); if (d < bd) { bd = d; best = l; } }
    if (best && bd > tune.lantern_reach) {
      const v = new THREE.Vector3(best.x, 1.2, best.z).applyMatrix4(cam.matrixWorldInverse), behind = v.z > 0;
      v.applyMatrix4(cam.projectionMatrix);
      let sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
      if (behind) { sx = W - sx; sy = H - sy; }
      const on = !behind && sx > 40 && sx < W - 40 && sy > 40 && sy < H - 40;
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffd27a'; ctx.strokeStyle = 'rgba(40,10,30,0.8)'; ctx.lineWidth = 2;
      if (on) {
        ctx.beginPath(); ctx.moveTo(sx, sy - 34); ctx.lineTo(sx + 8, sy - 24); ctx.lineTo(sx, sy - 14); ctx.lineTo(sx - 8, sy - 24); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 1; text(`${Math.round(bd)}m`, sx, sy - 50, 16, '#ffe8d0', 'center', SANS, 600, 0.85);
      } else {
        const ang = Math.atan2(sy - H / 2, sx - W / 2), ex = W / 2 + Math.cos(ang) * (W / 2 - 50), ey = H / 2 + Math.sin(ang) * (H / 2 - 50);
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        ctx.globalAlpha = 1; text('등불', ex - Math.cos(ang) * 30, ey - Math.sin(ang) * 30, 15, '#ffe8d0', 'center', SANS, 600, 0.85);
      }
      ctx.globalAlpha = 1;
    }
  }
  if (!state.rowed && state.t > 1.5) text('W로 노를 저어 보세요', W / 2, H - 70, 22, '#ffe8d0', 'center', SANS, 600, 0.6 + Math.sin(state.t * 3) * 0.3);
  else if (state.prompt) text(state.prompt, W / 2, H - 70, 22, '#ffe8d0', 'center', SANS, 600, 0.95);
  if (muted) text('음소거', W - 30, 40, 16, '#ffe8d0', 'right', SANS, 600, 0.8);
}

// ---- Scenes ---------------------------------------------------------------------------------
const scenes = {
  figures: {
    update(dt) { state.t += dt; },
    draw() {
      render3D('figures'); ctx.clearRect(0, 0, W, H);
      lineup.names.forEach((n, i) => { tmpV.set(600 + lineup.xs[i], -0.6, -2.5).project(cam); text(n, (tmpV.x + 1) / 2 * W, (1 - tmpV.y) / 2 * H, 26, '#fff3e2', 'center', SERIF, 700); });
    },
  },
  title: {
    update(dt) { state.t += dt; if (pressed('Enter') || pressed('Space')) { reset(); scene = 'play'; } },
    draw() {
      render3D('title'); ctx.clearRect(0, 0, W, H); ctx.drawImage(vignette, 0, 0);
      text(TITLE, W / 2, 170, 78, '#fff3e2', 'center', SERIF, 700);
      text('노을 진 호수를 건너며 등불을 밝히는 짧은 여행', W / 2, 238, 26, '#ffd9b0', 'center', SERIF, 600);
      CONTROLS.forEach((c, i) => text(c, W / 2, 470 + i * 36, 20, '#ffe8d0', 'center', SANS, 600, 0.9));
      text('Enter 또는 Space로 시작', W / 2, 640, 26, '#ffd27a', 'center', SERIF, 700, 0.6 + Math.sin(state.t * 2.5) * 0.35);
    },
  },
  play: {
    update(dt) {
      if (pressed('KeyP') || pressed('Escape')) { scene = 'pause'; return; }
      updateBoat(dt); updateStory(dt); updateWorld(dt); updateCamera(dt);
    },
    draw() { render3D('play'); drawHUD(); },
  },
  pause: {
    update() { if (pressed('KeyP') || pressed('Escape')) scene = 'play'; },
    draw() {
      render3D('play'); ctx.clearRect(0, 0, W, H); ctx.fillStyle = 'rgba(20,8,30,0.5)'; ctx.fillRect(0, 0, W, H);
      text('잠시 멈춤', W / 2, H / 2 - 20, 52, '#fff3e2', 'center', SERIF, 700); text('P를 눌러 계속', W / 2, H / 2 + 40, 22, '#ffd9b0', 'center', SANS);
    },
  },
  results: {
    update(dt) { updateWorld(dt); updateCamera(dt); if (pressed('Enter')) { reset(); scene = 'play'; } },
    draw() {
      render3D('play'); ctx.clearRect(0, 0, W, H); ctx.drawImage(vignette, 0, 0);
      ctx.fillStyle = 'rgba(10,6,24,0.35)'; ctx.fillRect(0, 0, W, H);
      const m = Math.floor(state.endT / 60), s = Math.floor(state.endT % 60);
      text(state.gained, W / 2, 70, 44, '#fff3e2', 'center', SERIF, 700);
      text(`밝힌 등불 ${state.lit} / ${lanterns.length}  ·  등대  ·  여행 시간 ${m}분 ${s}초`, W / 2, 122, 22, '#ffd9b0', 'center', SERIF, 600);
      // Every memory gathered, appearing one by one, then the last line.
      const k = (state.t - state.endT) * 2.2;
      MEMORIES.forEach((line, i) => text(line, W / 2, 182 + i * 36, 21, '#fff6ea', 'center', SERIF, 600, clamp(k - i, 0, 1) * 0.9));
      text(FINAL_MEMORY, W / 2, 182 + MEMORIES.length * 36 + 22, 23, '#ffd27a', 'center', SERIF, 700, clamp(k - MEMORIES.length, 0, 1));
      text('Enter: 처음부터 다시', W / 2, H - 40, 20, '#ffe8d0', 'center', SANS, 600, clamp(k - MEMORIES.length - 1, 0, 1));
    },
  },
};

// ---- Post effects ---------------------------------------------------------------------------
if (!CHEAP) {
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene3, cam));
  bloom = new THREE.UnrealBloomPass(new THREE.Vector2(W, H), tune.bloom_strength, tune.bloom_radius, tune.bloom_threshold);
  composer.addPass(bloom);
  composer.addPass(new THREE.OutputPass());
  fit();
}

// ---- Loop: fixed step, frame time clamped -------------------------------------------------
function step() {
  if (pressed('KeyM')) { setMuted(!muted); hit.delete('KeyM'); }
  scenes[scene].update(STEP); hit.clear();
}
let last, acc = 0;
function tick() {
  const now = clock.now();
  acc += Math.min(now - last, 0.25); last = now; // a stall never fast-forwards the game
  while (acc >= STEP) { step(); acc -= STEP; }
  ALPHA = acc / STEP; // draw between steps, so the view never judders
  drawFrame();
}
function drawFrame() { scenes[scene].draw(); }
function frame() { tick(); requestAnimationFrame(frame); }
// A headless browser on a time budget runs timers but almost no animation frames: a timer
// ticks when no frame has come for 100 ms on a visible page; a hidden tab stays paused.
function timer() { if (document.visibilityState === 'visible' && clock.now() - last > 0.1) tick(); }

// ---- What a check can read and drive (?manual=1 stops the loop; players never see it) ----
window.game = {
  get scene() { return scene; },
  get state() { return Object.assign({}, state, { boat: { x: B.x, z: B.z, heading: B.heading, speed: B.v } }); },
  press(code) { hit.add(code); },
  hold(code, on) { on ? down.add(code) : down.delete(code); },
  get events() { return events; }, // the loop steps; a check empties it
  step(n = 1, draw = true, alpha = 1) {
    for (let i = 0; i < n; i++) step();
    if (draw) { ALPHA = alpha; drawFrame(); }
  },
};

reset();
scene = params.get('scene') || 'title';
last = clock.now();
if (params.get('manual') === '1') drawFrame();
else { requestAnimationFrame(frame); setInterval(timer, 50); }
