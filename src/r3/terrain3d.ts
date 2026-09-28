// 3D terrain: chunked height mesh (mountains rise, lakes sink) + a shader for ground colour, and a water plane.
import * as THREE from 'three';
import { H, TT, W } from '../terrain';
import { fbm } from '../util';
import { G } from '../world';
import { C } from './core';
import { view } from '../view';

const CH = 64;
export const T3 = {
  hts: null as Float32Array,
  hts0: null as Float32Array,     // heights before railway cuttings
  cut: new Set<number>(),         // vertices currently lowered for railway cuttings
  cutSig: '',
  tex: null as THREE.DataTexture,
  data: null as Uint8Array,
  group: null as THREE.Group,
  uniforms: { uTiles: { value: null as THREE.Texture }, uTime: { value: 0 }, uSize: { value: new THREE.Vector2(W, H) }, uCamT: { value: new THREE.Vector2() }, uTreeR: { value: 100 }, uSnow: { value: 10.8 } },
  dirtyT: 0,
  mat: null as THREE.Material,
};
/** build one terrain chunk at a given vertex step (1 = full detail) */
function chunkGeo(ci: number, cj: number, st: number) {
  const n = CH / st + 1, pos = new Float32Array(n * n * 3), nrm = new Float32Array(n * n * 3), ix: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = ci * CH + i * st, y = cj * CH + j * st, k = (j * n + i) * 3;
    pos[k] = x; pos[k + 1] = hAt(x, y); pos[k + 2] = y;
    const nx = hAt(x - 1, y) - hAt(x + 1, y), ny = 2, nz = hAt(x, y - 1) - hAt(x, y + 1), L = Math.hypot(nx, ny, nz);
    nrm[k] = nx / L; nrm[k + 1] = ny / L; nrm[k + 2] = nz / L;
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; ix.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(ix); g.computeBoundingSphere();
  return g;
}

const GLSL_COMMON = `
uniform sampler2D uTiles; uniform float uTime; uniform vec2 uSize; uniform vec2 uCamT; uniform float uTreeR; uniform float uSnow;
varying vec3 vW;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm3(vec2 p){ return vn(p)*0.5 + vn(p*2.1)*0.3 + vn(p*4.3)*0.2; }
vec4 tileAt(vec2 t){ return texture(uTiles, (clamp(floor(t), vec2(0.0), uSize - 1.0) + 0.5) / uSize); }
int ttype(vec4 s){ return int(s.r * 255.0 + 0.5); }
vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }
vec3 baseCol(int t, vec2 w){
  float n = fbm3(w*0.18), m = vn(w*0.9);
  vec3 c;
  if(t==0) c = mix(mix(vec3(0.27,0.36,0.17), vec3(0.33,0.42,0.19), n), vec3(0.38,0.40,0.21), m*0.35);
  else if(t==1) c = mix(mix(vec3(0.20,0.31,0.15), vec3(0.26,0.37,0.17), n), vec3(0.23,0.30,0.16), m*0.3);
  else if(t==2) c = mix(vec3(0.58,0.53,0.41), vec3(0.66,0.60,0.46), n*0.7 + m*0.3);
  else if(t==3) c = mix(vec3(0.36,0.30,0.23), vec3(0.43,0.36,0.27), n*0.6 + m*0.4);
  else if(t==4) c = vec3(0.55,0.5,0.38);
  else if(t==5) c = vec3(0.35,0.33,0.28);
  else c = mix(vec3(0.30,0.29,0.27), vec3(0.40,0.38,0.35), fbm3(w*0.6));
  return c;
}
`;

function tileType(x: number, y: number) {
  if (x < 0 || y < 0 || x >= W || y >= H) return TT.DEEP;
  return G.tiles[y * W + x];
}
function computeHeights() {
  const hts = new Float32Array((W + 1) * (H + 1));
  const seed = G.S.seed;
  // distance (in tiles) from each corner to the mountain edge -> smooth slopes, no cliff teeth
  const N = (W + 1) * (H + 1), dist = new Float32Array(N);
  for (let cy = 0; cy <= H; cy++) for (let cx = 0; cx <= W; cx++) {
    const a = tileType(cx - 1, cy - 1), b = tileType(cx, cy - 1), c = tileType(cx - 1, cy), d = tileType(cx, cy);
    dist[cy * (W + 1) + cx] = (a === TT.ROCK && b === TT.ROCK && c === TT.ROCK && d === TT.ROCK) ? 1e6 : 0;
  }
  const S2 = Math.SQRT2;
  for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
    const i = y * (W + 1) + x; let v = dist[i]; if (!v) continue;
    if (x > 0) v = Math.min(v, dist[i - 1] + 1);
    if (y > 0) { v = Math.min(v, dist[i - W - 1] + 1); if (x > 0) v = Math.min(v, dist[i - W - 2] + S2); if (x < W) v = Math.min(v, dist[i - W] + S2); }
    dist[i] = v;
  }
  for (let y = H; y >= 0; y--) for (let x = W; x >= 0; x--) {
    const i = y * (W + 1) + x; let v = dist[i]; if (!v) continue;
    if (x < W) v = Math.min(v, dist[i + 1] + 1);
    if (y < H) { v = Math.min(v, dist[i + W + 1] + 1); if (x < W) v = Math.min(v, dist[i + W + 2] + S2); if (x > 0) v = Math.min(v, dist[i + W] + S2); }
    dist[i] = v;
  }
  for (let cy = 0; cy <= H; cy++) for (let cx = 0; cx <= W; cx++) {
    const a = tileType(cx - 1, cy - 1), b = tileType(cx, cy - 1), c = tileType(cx - 1, cy), d = tileType(cx, cy);
    let h = 0;
    const dd = dist[cy * (W + 1) + cx];
    if (dd > 0) {
      const k = Math.min(1, dd / 6), e = k * k * (3 - 2 * k);
      // height grows with distance from the mountain's edge, so crests form along the middle of each range;
      // ridged noise then carves sharp secondary peaks and gullies
      const inner = Math.min(dd, 26);
      const rg = 1 - Math.min(1, Math.abs(fbm(cx / 13, cy / 13, seed + 21, 3) * 2 - 1) * 1.8);
      const rg2 = 1 - Math.min(1, Math.abs(fbm(cx / 6, cy / 6, seed + 29, 2) * 2 - 1) * 2.0);
      const pk = fbm(cx / 11, cy / 11, seed + 27, 3);
      h = e * (1.2 + 1.4 * fbm(cx / 18, cy / 18, seed + 9, 3))
        + Math.pow(inner, 1.1) * 0.3 * (0.35 + 1.3 * pk * pk)
        + e * Math.pow(rg, 2.0) * Math.min(dd, 14) * 0.45
        + e * Math.pow(rg2, 2.5) * Math.min(dd, 8) * 0.18
        + 0.5 * fbm(cx / 3.5, cy / 3.5, seed + 5, 2) * Math.min(1, dd / 2);
    } else {
      const wt = (t: number) => t === TT.WATER || t === TT.DEEP;
      if (wt(a) && wt(b) && wt(c) && wt(d)) h = (a === TT.DEEP && b === TT.DEEP && c === TT.DEEP && d === TT.DEEP) ? -1.2 : -0.5;
    }
    hts[cy * (W + 1) + cx] = h;
  }
  return hts;
}
const hAt = (x: number, y: number) => { x = Math.max(0, Math.min(W, x)); y = Math.max(0, Math.min(H, y)); return T3.hts[y * (W + 1) + x]; };

export function buildTerrain() {
  if (T3.group) { C.scene.remove(T3.group); T3.group.traverse(o => { if ((o as any).geometry) (o as any).geometry.dispose(); }); }
  T3.hts = computeHeights();
  T3.hts0 = T3.hts.slice(); T3.cut = new Set(); T3.cutSig = '';
  // snow caps only the top of the mountains, however tall this world's ranges are
  { const hh: number[] = []; for (let i = 0; i < T3.hts.length; i += 3) if (T3.hts[i] > 2) hh.push(T3.hts[i]); hh.sort((a, b) => a - b);
    T3.uniforms.uSnow.value = hh.length > 50 ? Math.max(9, hh[Math.floor(hh.length * 0.8)]) : 10.8; }
  // tile texture
  T3.data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { T3.data[i * 4] = G.tiles[i]; T3.data[i * 4 + 1] = G.trees[i] ? 255 : 0; T3.data[i * 4 + 3] = 255; }
  if (T3.tex) T3.tex.dispose();
  T3.tex = new THREE.DataTexture(T3.data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  T3.tex.magFilter = THREE.NearestFilter; T3.tex.minFilter = THREE.NearestFilter; T3.tex.needsUpdate = true;
  T3.uniforms.uTiles.value = T3.tex;
  T3.uniforms.uSize.value.set(W, H);

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, T3.uniforms);
    sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL_COMMON + TERRAIN_FN)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( terrainColor(), opacity );');
  };
  const group = new THREE.Group();
  T3.mat = mat;
  for (let cj = 0; cj < H / CH; cj++) for (let ci = 0; ci < W / CH; ci++) {
    const m = new THREE.Mesh(chunkGeo(ci, cj, 8), mat);
    m.userData.lod = 3; m.userData.ci = ci; m.userData.cj = cj; m.userData.cx = ci * CH + CH / 2; m.userData.cy = cj * CH + CH / 2;
    m.receiveShadow = true; m.castShadow = true;
    group.add(m);
  }
  // water plane (also covers the ocean beyond the map)
  const wmat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c4652'), roughness: 0.08, metalness: 0.1 });
  wmat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, T3.uniforms);
    sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL_COMMON + WATER_FN)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( waterColor(), opacity );')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(normal + waterNormal());');
  };
  const wg = new THREE.PlaneGeometry(W + 1600, H + 1600, 1, 1); wg.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wg, wmat);
  water.position.set(W / 2, -0.14, H / 2); water.receiveShadow = true;
  group.add(water);
  C.scene.add(group);
  T3.group = group;
}

const TERRAIN_FN = `
vec3 terrainColor(){
  vec2 w = vW.xz;
  vec4 s = tileAt(w); int t = ttype(s);
  vec3 c = baseCol(t, w);
  vec2 f = fract(w);
  float pix = max(fwidth(w.x), fwidth(w.y));
  float fine = 1.0 - smoothstep(0.04, 0.12, pix);
  vec2 wf = f + (vec2(vn(w*3.1), vn(w*3.1+17.0)) - 0.5) * 0.35;
  for (int k = 0; k < 4; k++) {
    vec2 d = k==0?vec2(1,0):k==1?vec2(-1,0):k==2?vec2(0,1):vec2(0,-1);
    int nt = ttype(tileAt(w + d));
    if (nt != t && (t < 4 || t == 6) && (nt < 4 || nt == 6)) {
      float e = k==0?1.0-wf.x:k==1?wf.x:k==2?1.0-wf.y:wf.y;
      c = mix(c, baseCol(nt, w), (1.0 - smoothstep(0.0, 0.6, e)) * 0.5);
    }
  }
  if (t <= 1) {
    float blades = vn(w*13.0) * 0.5 + vn(w*31.0 + 7.0) * 0.5;
    c *= 1.0 + (blades - 0.5) * 0.14 * fine;
    c *= 1.0 + sin(uTime*1.3 + dot(w, vec2(0.35, 0.22)) + vn(w*0.15)*5.0) * 0.02;
    c = mix(c, c * vec3(1.12, 1.08, 0.8), smoothstep(0.78, 0.9, vn(w*2.3 + 40.0)) * 0.4);
  } else if (t == 2 || t == 3) c *= 1.0 + (vn(w*14.0) - 0.5) * 0.12 * fine;
  if (s.g > 0.5) { float farT = smoothstep(uTreeR * 0.85, uTreeR, length(w - uCamT)); c = mix(c, vec3(0.13,0.2,0.1) + vn(w*2.0)*0.04, 0.6 * farT); c *= 1.0 - 0.12 * (1.0 - farT); }
  // cliffs: steep slopes show layered rock
  vec3 fn = normalize(cross(dFdx(vW), dFdy(vW)));
  float slope = 1.0 - abs(fn.y);
  vec3 cliff = mix(vec3(0.30,0.27,0.24), vec3(0.40,0.36,0.31), vn(vec2((w.x + w.y) * 2.0, vW.y * 7.0))) * (0.85 + 0.3 * vn(w * 5.0));
  c = mix(c, cliff, smoothstep(0.3, 0.7, slope));
  if (t == 6 && vW.y > 0.3) c = mix(c, vec3(0.25,0.32,0.17) * (0.8 + 0.4 * vn(w * 3.0)), smoothstep(0.45, 0.15, slope) * smoothstep(0.35, 0.7, vn(w * 0.35)) * 0.7 * (1.0 - smoothstep(3.0, 5.0, vW.y)));
  // high rock turns pale grey, then snow caps the peaks (thicker on flatter ground)
  if (vW.y > 4.0) {
    c = mix(c, vec3(0.46,0.45,0.44) * (0.85 + 0.3 * vn(w * 2.0)), smoothstep(4.0, 9.0, vW.y) * 0.55);
    float line = uSnow + (vn(w * 0.25) - 0.5) * 3.0 + (vn(w * 1.7) - 0.5) * 1.0;
    float sn = smoothstep(line, line + 1.2, vW.y) * (1.0 - smoothstep(0.62, 0.9, slope) * 0.75);
    c = mix(c, vec3(0.93,0.95,0.98) * (0.93 + 0.07 * vn(w * 6.0)), clamp(sn, 0.0, 1.0));
  }
  if (vW.y < -0.05) c *= mix(1.0, 0.55, clamp(-vW.y, 0.0, 1.0));
  float cl = vn(w*0.035 + uTime*vec2(0.012, 0.007)) * 0.65 + vn(w*0.09 + uTime*vec2(0.02, 0.01)) * 0.35;
  c *= 1.0 - smoothstep(0.58, 0.75, cl) * 0.18;
  return srgb(c);
}
`;
const WATER_FN = `
vec3 waterColor(){
  vec2 w = vW.xz;
  vec4 s = tileAt(w); int t = ttype(s);
  vec3 c = t == 5 || w.x < 0.0 || w.y < 0.0 || w.x > uSize.x || w.y > uSize.y ? vec3(0.06,0.20,0.28) : vec3(0.12,0.32,0.36);
  float shore = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 d = k==0?vec2(1,0):k==1?vec2(-1,0):k==2?vec2(0,1):vec2(0,-1);
    int nt = ttype(tileAt(w + d * 0.6));
    if (nt < 4) shore = max(shore, 1.0);
  }
  float foam = shore * smoothstep(0.55, 0.9, vn(w*3.0 + uTime*0.6)) * (0.6 + 0.4*sin(uTime*2.0 + (w.x+w.y)*3.0));
  c = mix(c, vec3(0.85,0.9,0.9), foam * 0.6);
  float cl = vn(w*0.035 + uTime*vec2(0.012, 0.007)) * 0.65 + vn(w*0.09 + uTime*vec2(0.02, 0.01)) * 0.35;
  c *= 1.0 - smoothstep(0.58, 0.75, cl) * 0.18;
  return srgb(c);
}
vec3 waterNormal(){
  vec2 w = vW.xz; float e = 0.15;
  float h0 = vn(w*1.1 + uTime*vec2(0.3, 0.2)) + vn(w*2.7 - uTime*vec2(0.25, 0.1))*0.5;
  float hx = vn((w+vec2(e,0.0))*1.1 + uTime*vec2(0.3, 0.2)) + vn((w+vec2(e,0.0))*2.7 - uTime*vec2(0.25, 0.1))*0.5;
  float hz = vn((w+vec2(0.0,e))*1.1 + uTime*vec2(0.3, 0.2)) + vn((w+vec2(0.0,e))*2.7 - uTime*vec2(0.25, 0.1))*0.5;
  vec3 nW = vec3(h0 - hx, 0.0, h0 - hz) * 0.6;
  return (viewMatrix * vec4(nW, 0.0)).xyz;
}
`;

/** refresh the tree flag for one tile (chopped) — uploads are batched */
export function terrainTileChanged(x: number, y: number) {
  if (!T3.data) return;
  const i = y * W + x;
  T3.data[i * 4 + 1] = G.trees[i] ? 255 : 0;
  T3.dirtyT = 1;
}
export function terrainTick(dt: number, time: number) {
  T3.uniforms.uTime.value = time;
  if (T3.group) {
    const tx = view.cam.x, tz = view.cam.y, base = C.dist;
    let budget = 3;
    for (const m of T3.group.children as THREE.Mesh[]) {
      const u = m.userData; if (u.ci === undefined) continue;
      const d = Math.max(0, Math.hypot(u.cx - tx, u.cy - tz) - CH * 0.7) + Math.max(0, base - 250) * 0.4;
      const lod = d < 170 ? 0 : d < 380 ? 1 : d < 720 ? 2 : 3;
      if (lod !== u.lod && (budget > 0 || lod > u.lod)) {
        if (lod < u.lod) budget--;
        m.geometry.dispose(); m.geometry = chunkGeo(u.ci, u.cj, [1, 2, 4, 8][lod]); u.lod = lod;
      }
    }
  }
  if (T3.dirtyT) { T3.dirtyT += dt; if (T3.dirtyT > 0.5) { T3.tex.needsUpdate = true; T3.dirtyT = 0; } }
}
/** height a railway must be under to count as inside a tunnel */
export const TUN_H = 2.3;
/** original (uncut) terrain height */
export function groundHeight0(x: number, y: number) {
  if (!T3.hts0) return 0;
  const ix = Math.max(0, Math.min(W, Math.round(x))), iy = Math.max(0, Math.min(H, Math.round(y)));
  return T3.hts0[iy * (W + 1) + ix];
}
/** is this tile deep enough inside a mountain for a railway to run in a tunnel? */
export const tunnelInside = (x: number, y: number) => groundHeight0(x, y) >= TUN_H && groundHeight0(x + 1, y) >= TUN_H && groundHeight0(x, y + 1) >= TUN_H && groundHeight0(x + 1, y + 1) >= TUN_H;
/** carve cuttings where railways run into mountains so trains stay at ground level until the tunnel mouth */
export function updateCuts(rockRails: number[]) {
  if (!T3.hts0) return;
  const sig = rockRails.length + ':' + rockRails.reduce((a, b) => (a * 31 + b) | 0, 7);
  if (sig === T3.cutSig) return;
  T3.cutSig = sig;
  const W1 = W + 1, touched = new Set<number>();
  for (const v of T3.cut) { T3.hts[v] = T3.hts0[v]; touched.add(v); }
  T3.cut = new Set();
  for (const i of rockRails) {
    const x = i % W, y = Math.floor(i / W);
    if (tunnelInside(x, y)) continue;
    for (const [vx, vy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
      const v = vy * W1 + vx;
      T3.hts[v] = Math.min(T3.hts0[v], 0.0); T3.cut.add(v); touched.add(v);
    }
  }
  // rebuild the terrain chunks that changed
  const chunks = new Set<number>();
  for (const v of touched) { const vx = v % W1, vy = Math.floor(v / W1); for (const cx of [Math.floor((vx - 1) / CH), Math.floor(vx / CH)]) for (const cy of [Math.floor((vy - 1) / CH), Math.floor(vy / CH)]) chunks.add(cy * 10000 + cx); }
  if (T3.group) for (const m of T3.group.children as THREE.Mesh[]) {
    const u = m.userData; if (u.ci === undefined || !chunks.has(u.cj * 10000 + u.ci)) continue;
    m.geometry.dispose(); m.geometry = chunkGeo(u.ci, u.cj, [1, 2, 4, 8][u.lod]);
  }
}
export function groundHeight(x: number, y: number) {
  if (!T3.hts) return 0;
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = hAt(ix, iy), b = hAt(ix + 1, iy), c = hAt(ix, iy + 1), d = hAt(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
