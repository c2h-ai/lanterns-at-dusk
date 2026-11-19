// The page: state, the boat and the story, drawing, scenes and the loop. The lake's shape is in
// game/lake.ts; the world's objects in world.ts; what the checks drive is in hook.ts.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CONFIG, tune } from './config';
import { clock, install, manual, params, seedFrom } from './hook';
import { W, H, SERIF, SANS, CHEAP, post, renderer, ctx, fit, text, vignette } from './screen';
import { down, hit, pressed, lookIn, dragging } from './input';
import { sfx, setMuted, muted } from './audio';
import { clamp, lerp, smooth } from './game/math';
import type { Loose } from './game/types';
import { BASINS, ISLAND, START, LANTERNS, HOUSES, GATES, MEMORIES, FINAL_MEMORY, waterSd, groundH } from './game/lake';
import { scene3, fog, cam, sky, SKY_U, WATER_U, MAX_RIPPLES, MAX_LIGHTS, applyPalette, sunPos, sun, water, reedU, boat, boatLight,
  lanterns, lampPool, windows, bridgeLights, gateObjs, GATE_POSTS, POSTS, BOXES, lighthouse, lighthouseLight, moteU, lineup } from './world';

const STEP = 1 / 60;            // simulation step in seconds; motion is per second, never per frame
const TITLE = 'Lanterns at Dusk';
const CONTROLS = [
  'W / ↑ : 노 젓기     S / ↓ : 뒤로',
  'A D / ← → : 방향 바꾸기',
  'Space : 가까운 등불 밝히기',
  '마우스 드래그 : 둘러보기     P : 일시정지     M : 음소거',
];
let seed = 0;
function rng(): number { // mulberry32; every gameplay random call reads this, never Math.random
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
void rng;
const events: unknown[] = []; // window.game.events: anything the game wants a run to see

// ---- State ----------------------------------------------------------------------------------
/** A scene: how it steps and how it draws. */
interface Scene { update(dt: number): void; draw(): void }
let scene = 'title', state: Loose, B: Loose, camS: Loose;
const ripples: { x: number; z: number; age: number; s: number }[] = [];
function addRipple(x: number, z: number, strength: number): void {
  if (ripples.length >= MAX_RIPPLES) ripples.shift();
  ripples.push({ x, z, age: 0, s: strength });
}
function reset(): void {
  seed = seedFrom(CONFIG.seed);
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
const forward = (h: number): [number, number] => [-Math.sin(h), -Math.cos(h)];
const litIn = (b: number): number => lanterns.filter((l: Loose) => l.basin === b && l.lit).length;
const countIn = (b: number): number => lanterns.filter((l: Loose) => l.basin === b).length;
function duskTarget(): number {
  if (state.ending >= 0) return 2;
  const b = state.seen[2] ? 2 : state.seen[1] ? 1 : 0;
  return [0, 0.8, 1.55][b] + litIn(b) / countIn(b) * [0.5, 0.55, 0.45][b];
}

// ---- Simulation -----------------------------------------------------------------------------
function updateBoat(dt: number): void {
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
  function collide(nx: number, nz: number, pen: number): void { // n points into the obstacle
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
function updateStory(dt: number): void {
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
function lightLantern(l: Loose): void {
  l.lit = true; l.litAt = state.t; state.lit++; sfx.light(); addRipple(l.x, l.z, 1.6);
  state.memory = { text: MEMORIES[state.lit - 1] || '', t: 0, hold: tune.memory_hold };
  events.push({ type: 'light', n: state.lit });
  const g = GATES[l.basin];
  if (g && litIn(l.basin) === countIn(l.basin)) {
    g.open = true; sfx.gate(); for (const m of gateObjs[l.basin].lamps) m.emissiveIntensity = 3;
    state.banner = { text: '물길이 열렸다', t: 0 }; events.push({ type: 'gate', n: l.basin + 1 });
  }
}
function updateWorld(dt: number): void {
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
function updateCamera(dt: number): void {
  camS.prevYaw = camS.yaw;
  camS.look += lookIn.yaw; camS.pitch = clamp(camS.pitch + lookIn.pitch, -0.25, 0.6); lookIn.yaw = lookIn.pitch = 0;
  if (!dragging) { const k = 1 - Math.exp(-tune.look_return * dt); camS.look -= camS.look * k; camS.pitch -= camS.pitch * k; }
  let d = B.heading + camS.look - camS.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  camS.yaw += d * (1 - Math.exp(-tune.cam_follow * dt));
}

// ---- Drawing --------------------------------------------------------------------------------
let ALPHA = 1; // how far the frame is between the last two steps
const tmpV = new THREE.Vector3();
function render3D(mode: string): void {
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
  const lightsList: { p: THREE.Vector3; w: number; d?: number }[] = [{ p: lampPos, w: 0.8 }];
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
  const sorted = lightsList.slice(1).sort((p, q) => (p.d ?? 0) - (q.d ?? 0));
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
  fog.near = 30; fog.far = tune.fog_far * (1 - SKY_U.uNight.value * 0.35);
  WATER_U.uFogCol.value.copy(fog.color); WATER_U.uFogNear.value = fog.near; WATER_U.uFogFar.value = fog.far;
  WATER_U.uWave.value = tune.water_ripple; WATER_U.uBlur.value = tune.reflection_blur * 0.1;
  moteU.uTime.value = t; moteU.uCenter.value.copy(cam.position); moteU.uAmount.value = 0.35 + SKY_U.uNight.value * 0.65;
  moteU.uColor.value.setHex(0xffa050).lerp(new THREE.Color(0xd8ff8a), SKY_U.uNight.value);
  renderer.toneMappingExposure = tune.exposure;
  if (post.composer && post.bloom) { post.bloom.strength = tune.bloom_strength; post.bloom.threshold = tune.bloom_threshold; post.bloom.radius = tune.bloom_radius; post.composer.render(); }
  else renderer.render(scene3, cam);
}
function fade(t: number, hold: number): number { return Math.min(1, t / 1.2) * (1 - smooth(hold + 1.2, hold + 2.6, t)); }
function drawHUD(): void {
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
const scenes: Record<string, Scene> = {
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
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene3, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), tune.bloom_strength, tune.bloom_radius, tune.bloom_threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  post.composer = composer; post.bloom = bloom;
  fit();
}

// ---- Loop: fixed step, frame time clamped -------------------------------------------------
function step(): void {
  if (pressed('KeyM')) { setMuted(!muted); hit.delete('KeyM'); }
  scenes[scene].update(STEP); hit.clear();
}
let last = 0, acc = 0;
function tick(): void {
  const now = clock.now();
  acc += Math.min(now - last, 0.25); last = now; // a stall never fast-forwards the game
  while (acc >= STEP) { step(); acc -= STEP; }
  ALPHA = acc / STEP; // draw between steps, so the view never judders
  drawFrame();
}
function drawFrame(): void { scenes[scene].draw(); }
function frame(): void { tick(); requestAnimationFrame(frame); }
// A headless browser on a time budget runs timers but almost no animation frames: a timer
// ticks when no frame has come for 100 ms on a visible page; a hidden tab stays paused.
function timer(): void { if (document.visibilityState === 'visible' && clock.now() - last > 0.1) tick(); }

// ---- What a check can read and drive (?manual=1 stops the loop; players never see it) ----
install({
  get scene() { return scene; },
  get state() { return Object.assign({}, state, { boat: { x: B.x, z: B.z, heading: B.heading, speed: B.v } }); },
  press(code) { hit.add(code); },
  hold(code, on) { on ? down.add(code) : down.delete(code); },
  get events() { return events; }, // the loop steps; a check empties it
  step(n = 1, draw = true, alpha = 1) {
    for (let i = 0; i < n; i++) step();
    if (draw) { ALPHA = alpha; drawFrame(); }
  },
});

reset();
scene = params.get('scene') || 'title';
last = clock.now();
if (manual) drawFrame();
else { requestAnimationFrame(frame); setInterval(timer, 50); }
