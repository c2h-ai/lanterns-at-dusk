// The lake's layout and shape: basins, channels, gates, lanterns, and the distance field the
// terrain and the boat's collisions are both built from. No browser in here.
import { clamp, lerp } from './math';

export const BASINS = [
  { x: 0, z: 0, r: 40, name: '1장 · 노을 갈대밭' },
  { x: 28, z: -112, r: 42, name: '2장 · 기둥 마을' },
  { x: -12, z: -240, r: 55, name: '3장 · 등대의 호수' },
];
export const CHANNEL_R = 8;
export const ISLAND = { x: -12, z: -262, r: 9 }; // the lighthouse rock
export const START = { x: 3, z: 27, heading: 0 };
export const LANTERNS = [ // [x, z, basin]
  [-27, -8, 0], [24, -20, 0], [-14, -30, 0],
  [14, -96, 1], [44, -100, 1], [47, -138, 1], [4, -134, 1],
  [-40, -225, 2], [20, -235, 2], [-35, -272, 2], [15, -275, 2],
];
export const HOUSES = [[5, -92], [22, -84], [50, -108], [38, -142], [12, -128], [55, -128]];
export const BRIDGES = [[0, 1], [2, 5], [3, 5], [3, 4]];
export const MEMORIES = [
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
export const FINAL_MEMORY = '물은 빛을 기억한다. 그리고 나는, 그 빛을 기억한다.';
export const GATES = [0, 1].map(i => { // where channel i leaves basin i
  const a = BASINS[i], b = BASINS[i + 1], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
  return { i, x: a.x + dx / l * (a.r + 3), z: a.z + dz / l * (a.r + 3), dx: dx / l, dz: dz / l, open: false, lift: 0 };
});

// Smooth value noise (deterministic): shapes the shores and hills.
export function hash2(x: number, z: number): number { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(ix, iz), hash2(ix + 1, iz), ux), lerp(hash2(ix, iz + 1), hash2(ix + 1, iz + 1), ux), uz);
}
export function fbm(x: number, z: number): number { let s = 0, a = 0.5; for (let i = 0; i < 4; i++) { s += a * vnoise(x, z); x *= 2.03; z *= 2.03; a *= 0.5; } return s; }
export function capsule(px: number, pz: number, ax: number, az: number, bx: number, bz: number, r: number): number {
  const abx = bx - ax, abz = bz - az, t = clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz), 0, 1);
  return Math.hypot(px - ax - abx * t, pz - az - abz * t) - r;
}
// Signed distance to the water's edge: below 0 is water. `collide` shuts channels whose gate is closed.
export function waterSd(x: number, z: number, collide: boolean): number {
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
export function groundH(x: number, z: number): number { // land height, the same function the terrain mesh is built from
  const s = waterSd(x, z, false);
  if (s < 0) return -2.5 + Math.max(s, -6) * 0.2;
  return Math.min(28, 0.3 + s * 0.32 + fbm(x * 0.035 + 7, z * 0.035) * Math.min(s, 40) * 0.55);
}
