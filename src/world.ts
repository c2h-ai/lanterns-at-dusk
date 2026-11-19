// The 3D world: sky, light, water and every object on the lake, built once.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { tune } from './config';
import { renderer, W, H, CHEAP } from './screen';
import { lerp, smooth } from './game/math';
import { BASINS, CHANNEL_R, ISLAND, START, LANTERNS, HOUSES, BRIDGES, GATES, hash2, waterSd, groundH } from './game/lake';
import type { Loose } from './game/types';

// ---- Scene, sky and light -----------------------------------------------------------------
export const scene3 = new THREE.Scene();
export const cam = new THREE.PerspectiveCamera(55, W / H, 0.1, 3000);
// Three stages of the sky, blended by `dusk` (0 golden hour, 1 deep red, 2 night).
export const PALETTES = [
  { zenith: 0x34357e, upper: 0xb9467a, mid: 0xff6a3c, horizon: 0xffc066, sun: 0xfff0c8, deep: 0x2a1838, fog: 0xf0885e, elev: 6, sunI: 3.2, hemi: 0.9 },
  { zenith: 0x231d5c, upper: 0x8c2f6e, mid: 0xdc3f34, horizon: 0xff8442, sun: 0xffc896, deep: 0x22132f, fog: 0xc95a52, elev: 2, sunI: 2.4, hemi: 0.7 },
  { zenith: 0x05081a, upper: 0x0f1434, mid: 0x231f4c, horizon: 0x45376a, sun: 0xa9bcff, deep: 0x05070f, fog: 0x1d1934, elev: -8, sunI: 0.5, hemi: 0.35 },
];
export const SKY_U = {
  uZenith: { value: new THREE.Color() }, uUpper: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() },
  uNight: { value: 0 }, uTime: { value: 0 },
};
export const SKY_GLSL = `
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
export const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: SKY_U,
  vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: SKY_GLSL + `varying vec3 vDir; void main() { gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`,
});
export const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), skyMat); sky.frustumCulled = false; sky.renderOrder = -1; scene3.add(sky);
export const fog = new THREE.Fog(0xf0885e, 30, 240);
export const hemi = new THREE.HemisphereLight(0xff9a70, 0x2a1838, 0.9); scene3.add(hemi);
export const sun = new THREE.DirectionalLight(0xffb070, 3); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 260 });
scene3.add(sun, sun.target);
export const SUN_AZ = 200; // degrees: the sun sits low ahead of the course, so the water carries its gold path
/** Blends the sky, fog, water and light between the three stages of dusk (0 to 2). */
scene3.fog = fog;
type PaletteColor = 'zenith' | 'upper' | 'mid' | 'horizon' | 'sun' | 'deep' | 'fog';
export function applyPalette(dusk: number): void {
  const i = Math.min(1, Math.floor(dusk)), t = dusk - i, a = PALETTES[i], b = PALETTES[Math.min(2, i + 1)];
  const mixC = (k: PaletteColor, out: THREE.Color): THREE.Color => out.setHex(a[k]).lerp(new THREE.Color(b[k]), t);
  mixC('zenith', SKY_U.uZenith.value); mixC('upper', SKY_U.uUpper.value); mixC('mid', SKY_U.uMid.value);
  mixC('horizon', SKY_U.uHorizon.value); mixC('sun', SKY_U.uSunCol.value);
  mixC('fog', fog.color); mixC('deep', WATER_U.uDeep.value);
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
export const sunPos = new THREE.Vector3();

// ---- Water: a mirror of the sky and the scene, broken by small waves and the boat's rings -----
export const MAX_RIPPLES = 16, MAX_LIGHTS = 8;
export const WATER_U = Object.assign({
  uDeep: { value: new THREE.Color(0x2a1838) }, uFogCol: { value: new THREE.Color() }, uFogNear: { value: 30 }, uFogFar: { value: 240 },
  uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uLights: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uLightCol: { value: new THREE.Color(0xffa040) }, uReflect: { value: 0 }, uWave: { value: 1 }, uBlur: { value: 0.55 },
  tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, color: { value: new THREE.Color(0xffffff) },
}, SKY_U);
export const WATER_SHADER = {
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
export let water: THREE.Mesh;
if (!CHEAP) {
  const refl = new Reflector(new THREE.PlaneGeometry(1400, 1400), {
    shader: WATER_SHADER, clipBias: 0.003,
    textureWidth: Math.round(W * Math.min(2, devicePixelRatio || 1) * 0.6), textureHeight: Math.round(H * Math.min(2, devicePixelRatio || 1) * 0.6),
  });
  // Reflector clones the uniforms: share the live ones back so palette and ripples reach it.
  const own = (refl.material as THREE.ShaderMaterial).uniforms, live = WATER_U as Record<string, THREE.IUniform>;
  for (const k of Object.keys(live)) if (!['tDiffuse', 'textureMatrix', 'color'].includes(k)) own[k] = live[k];
  own.uReflect.value = 1; water = refl;
} else {
  water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.ShaderMaterial(WATER_SHADER));
}
water.rotation.x = -Math.PI / 2; scene3.add(water);

// ---- Pieces ---------------------------------------------------------------------------------
export const matCache: Record<string, THREE.MeshStandardMaterial> = {};
/** A cached flat-shaded material of colour c. */
export function mat(c: number, extra?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const k = c + (extra ? JSON.stringify(extra) : '');
  if (!matCache[k]) matCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color: c, flatShading: true, roughness: 0.9, metalness: 0 }, extra));
  return matCache[k];
}
/** A shadow-casting mesh, placed and added to parent. */
export function mesh(geo: THREE.BufferGeometry, m: number | THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D): THREE.Mesh {
  const o = new THREE.Mesh(geo, typeof m === 'number' ? mat(m) : m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
  if (parent) parent.add(o);
  return o;
}
/** A material that glows in its own colour. */
export const glowMat = (c: number, i: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, flatShading: true, roughness: 0.6 });
export const C = { wood: 0x8a5236, woodDark: 0x2e1a1e, cloak: 0x2a3060, cloakLight: 0x3d4888, skin: 0xd99a7a, paper: 0xffd9a0, glow: 0xffa040,
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
export const reedU = { uTime: { value: 0 }, uBoat: { value: new THREE.Vector2() } };
export const reedMat = new THREE.MeshStandardMaterial({ color: C.reed, flatShading: true, roughness: 1 });
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
  const spots: number[][] = [];
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
/** Circles [x, z, r] and boxes [x0, x1, z0, z1] the boat cannot pass. */
export const POSTS: number[][] = [], BOXES: number[][] = [];
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
/** A tube along the given points. */
export function tube(points: number[][], r: number, color: number, parent: THREE.Object3D, seg = 24): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  return mesh(new THREE.TubeGeometry(curve, seg, r, 6, false), color, 0, 0, 0, parent);
}
export function makeBoat() {
  const g = new THREE.Group(), N = 26, K = 10, L = 1.95;
  // Hull: cross-sections along the length, one colour per plank strake.
  const half = (z: number): { w: number; d: number; lift: number } => { const t = Math.abs(z) / L; return { w: 0.74 * Math.pow(Math.max(0, 1 - t * t), 0.55), d: 0.5 * (1 - t * t * 0.55), lift: 0.32 * t * t * (z < 0 ? 1.25 : 1) }; };
  const P = (i: number, k: number): number[] => { const z = -L + 2 * L * i / N, { w, d, lift } = half(z), a = Math.PI * k / K; return [-Math.cos(a) * w, 0.45 + lift - Math.sin(a) * d * (1 - lift * 0.4), z]; };
  const pos: number[] = [], col: number[] = [], shades = [new THREE.Color(0x8a5236), new THREE.Color(0x6e3f2a), new THREE.Color(0x9a6040)];
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
export const boat = makeBoat(); scene3.add(boat.group);
export const boatLight = new THREE.PointLight(0xffa050, 14, 18, 1.5); scene3.add(boatLight);

// Floating lanterns: a small raft with a six-sided paper lantern.
export function makeLantern() {
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
export const lanterns = LANTERNS.map(([x, z, basin], i) => {
  const l = makeLantern(); l.group.position.set(x, 0, z); scene3.add(l.group);
  // A faint column of light over each unlit lantern, so it can be found from across the basin.
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.5, 16, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  beam.position.y = 8.6; l.group.add(beam);
  return Object.assign(l, { x, z, basin, i, lit: false, litAt: 0, rise: 0, beam });
});
export const lampPool = Array.from({ length: 4 }, () => { const p = new THREE.PointLight(0xff9a40, 0, 20, 1.8); scene3.add(p); return p; });

// The stilt village: houses on legs, warm windows, plank bridges with strings of small lights.
export const windows: { m: THREE.MeshStandardMaterial; house: number }[] = [];
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
export const bridgeLights: THREE.MeshStandardMaterial[] = [];
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
export const GATE_POSTS: number[][] = [];
export const gateObjs = GATES.map(gd => {
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
export function makeLighthouse() {
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
export const lighthouse = makeLighthouse(); lighthouse.group.position.set(ISLAND.x, 0, ISLAND.z); scene3.add(lighthouse.group);
export const lighthouseLight = new THREE.PointLight(0xffd090, 0, 120, 1.2); lighthouseLight.position.set(ISLAND.x, 19.4, ISLAND.z); scene3.add(lighthouseLight);

// Floating motes: embers in the sunset, fireflies at night, kept in a box around the camera.
export const MOTES = 420;
export const moteGeo = new THREE.BufferGeometry(), motePos = new Float32Array(MOTES * 3), moteSeed = new Float32Array(MOTES);
for (let i = 0; i < MOTES; i++) { motePos[i * 3] = hash2(i, 11) * 80 - 40; motePos[i * 3 + 1] = 0.3 + hash2(i, 12) * 8; motePos[i * 3 + 2] = hash2(i, 13) * 80 - 40; moteSeed[i] = hash2(i, 14); }
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3)); moteGeo.setAttribute('seed', new THREE.BufferAttribute(moteSeed, 1));
export const moteU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0.4 }, uColor: { value: new THREE.Color(0xffb060) } };
export const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({
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
export const lineup = (() => {
  const g = new THREE.Group(); g.position.set(600, 0, 0); scene3.add(g);
  const b = makeBoat(); b.group.rotation.y = -1.2; b.group.position.set(-6, 0.3, 0); g.add(b.group);
  const l = makeLantern(); l.paper.emissiveIntensity = 2.5; l.group.scale.setScalar(2.2); l.group.position.set(0, 0, 0); g.add(l.group);
  const h = makeLighthouse(); h.lampMat.emissiveIntensity = 3; h.group.scale.setScalar(0.32); h.group.position.set(6.5, 0.5, -1); g.add(h.group);
  return { names: ['나룻배와 사공', '물 위의 등불', '등대'], xs: [-6, 0, 6.5] };
})();
