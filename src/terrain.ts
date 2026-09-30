import { clamp, fbm, hash2, lerp, mulberry32 } from './util';
import { diffOf } from './difficulty';

// World size is chosen when a world is created (small / medium / large).
export let W = 1024, H = 1024;
export let HX = 510, HY = 510; // HUB top-left
export const SIZES: Record<string, { n: number; label: string; desc: string }> = {
  small: { n: 512, label: 'Small', desc: 'A 512² island — cozy, everything is close' },
  medium: { n: 1024, label: 'Medium', desc: 'A 1024² island — the classic size' },
  large: { n: 2304, label: 'Large', desc: 'A 2304² island — 5× the land, built for trains' },
  enormous: { n: 4608, label: 'Enormous', desc: 'A 4608² island — 4× Large. Needs a desktop PC with plenty of memory (about a minute to generate)' },
};
export function setWorldSize(n: number) { W = H = n; HX = HY = n / 2 - 2; }
/** v6 worlds are islands: the grid grows so the ocean fits around the same amount of land (a multiple of the 64-tile render chunk) */
export function gridFor(land: number, v: number) { return v >= 6 ? Math.ceil(land * 1.42 / 64) * 64 : land; }

export const TT = { GRASS: 0, GRASS2: 1, SAND: 2, DIRT: 3, WATER: 4, DEEP: 5, ROCK: 6 };
export const TILE_NAMES = ['Grassland', 'Forest floor', 'Sand', 'Dirt', 'Shallow Water', 'Deep Water', 'Rock'];

// ---------------------------------------------------------------------------
// Biomes: each resource only appears in certain environments
export type Biome = 'plains' | 'forest' | 'desert' | 'highlands' | 'water';
export const BIOME_NAMES: Record<Biome, string> = { plains: 'Plains', forest: 'Forest', desert: 'Desert', highlands: 'Highlands', water: 'Lake' };
export const RES_BIOMES: Record<string, Biome[]> = {
  iron_ore: ['plains', 'forest', 'highlands'],
  copper_ore: ['plains', 'highlands'],
  limestone: ['plains', 'desert', 'highlands'],
  coal: ['forest', 'highlands'],
  caterium_ore: ['highlands', 'desert'],
  raw_quartz: ['desert'],
  bauxite: ['desert', 'highlands'],
  crude_oil: ['desert'],
  geyser: ['highlands'],
  sulfur: ['highlands', 'desert'],
  uranium: ['highlands', 'desert'],
};
export function biomeAtTiles(tiles: Uint8Array, x: number, y: number): Biome {
  const c = [0, 0, 0, 0, 0];
  for (let j = -4; j <= 4; j += 2) for (let i = -4; i <= 4; i += 2) {
    const tx = x + i, ty = y + j;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
    const t = tiles[ty * W + tx];
    if (t === TT.WATER || t === TT.DEEP) c[4]++;
    else if (t === TT.ROCK || t === TT.DIRT) c[3]++;
    else c[t]++;
  }
  let best = 0;
  for (let k = 1; k < 5; k++) if (c[k] > c[best]) best = k;
  return (['plains', 'forest', 'desert', 'highlands', 'water'] as Biome[])[best];
}

export interface ResNode { id: number; x: number; y: number; res: string; p: number }
// res: an ore item key, 'crude_oil' (oil node) or 'geyser'

export interface Terrain { tiles: Uint8Array; trees: Uint8Array; nodes: ResNode[]; nodeGrid: Int32Array }

export const isLand = (t: number) => t <= TT.DIRT;
export const isWater = (t: number) => t === TT.WATER || t === TT.DEEP;

/** generation parameters. Version 1 (old saves) uses fixed values; version 2+ worlds are randomized per seed. */
function genParams(seed: number, v: number) {
  const P = { scale: 150, mscale: 110, warp: 0, pDeep: 0.06, pWater: 0.12, pSand: 0.145, pDirt: 0.87, pRock: 0.93, desert: 0.36, forest: 0.585, edge: 28, lakeA: Math.atan2(20, 36), lakeD: 41, hx: W / 2 - 2, hy: H / 2 - 2 };
  if (v < 2) return P;
  const r = mulberry32(seed * 31 + 7);
  P.scale = 100 + r() * 130;
  P.mscale = 70 + r() * 90;
  P.warp = r() < 0.75 ? 20 + r() * 110 : 0;
  P.pWater = 0.06 + r() * 0.15; P.pDeep = P.pWater * (0.35 + r() * 0.3); P.pSand = P.pWater + 0.015 + r() * 0.03;
  P.pRock = 1 - (0.035 + r() * 0.085); P.pDirt = P.pRock - (0.04 + r() * 0.05);
  P.desert = 0.3 + r() * 0.12; P.forest = 0.54 + r() * 0.09;
  P.edge = Math.min(W * 0.12, r() < 0.3 ? 60 + r() * 60 : 22 + r() * 20);   // sometimes an island
  P.lakeA = r() * Math.PI * 2; P.lakeD = 30 + r() * 18;
  const off = (n: number) => Math.round(n / 2 - 2 + (r() - 0.5) * n * 0.36);
  P.hx = Math.max(130, Math.min(W - 134, off(W))); P.hy = Math.max(130, Math.min(H - 134, off(H)));
  return P;
}
export function genTerrain(seed: number, mode = 'easy', v = 1, land = W): Terrain {
  if (v >= 3) return genTerrainV3(seed, mode, v, land);
  const tiles = new Uint8Array(W * H), trees = new Uint8Array(W * H);
  const P = genParams(seed, v);
  HX = P.hx; HY = P.hy;
  const cx = HX + 2, cy = HY + 2;
  // pass 1: raw heights, then pick thresholds by percentile so every seed has a similar mix
  const hs = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let wx = x, wy = y;
    if (P.warp) { wx += (fbm(x / 260, y / 260, seed + 41, 2) - 0.5) * P.warp * 2; wy += (fbm(x / 260 + 50, y / 260, seed + 43, 2) - 0.5) * P.warp * 2; }
    hs[y * W + x] = fbm(wx / P.scale, wy / P.scale, seed, 4);
  }
  const sample: number[] = [];
  const stepS = Math.max(37, Math.floor(W * H / 40000));
  for (let i = 0; i < W * H; i += stepS) sample.push(hs[i]);
  sample.sort((a, b) => a - b);
  const pct = (p: number) => sample[Math.floor(p * (sample.length - 1))];
  const tDeep = pct(P.pDeep), tWater = pct(P.pWater), tSand = pct(P.pSand), tDirt = pct(P.pDirt), tRock = pct(P.pRock), mid = pct(0.5);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = Math.hypot(x - cx, y - cy);
      let h = hs[i];
      h = lerp(h, mid, clamp(1 - (d - 28) / 45, 0, 1));
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (e < P.edge) h = lerp(tDeep - 0.1, h, e / P.edge);
      let m = fbm(x / P.mscale + 300, y / P.mscale, seed + 7, 3);
      m = lerp(m, 0.47, clamp(1 - (d - 45) / 50, 0, 1));
      let t: number;
      if (h < tDeep) t = TT.DEEP;
      else if (h < tWater) t = TT.WATER;
      else if (h < tSand) t = TT.SAND;
      else if (h > tRock) t = TT.ROCK;
      else if (h > tDirt) t = TT.DIRT;
      else if (m < P.desert) t = TT.SAND;        // deserts
      else if (m > P.forest) t = TT.GRASS2;      // forests
      else t = TT.GRASS;                         // plains
      tiles[i] = t;
      if ((t === TT.GRASS || t === TT.GRASS2) && d > 16) {
        let p = t === TT.GRASS2 ? 0.25 + (m - P.forest) * 3 : 0.012;
        p *= clamp((d - 16) / 40, 0.15, 1);
        if (hash2(x, y, seed + 99) < p) trees[i] = 1;
      }
    }
  }
  const rng = mulberry32(seed ^ 0x5bd1e995);
  const blob = (bx: number, by: number, r: number, fn: (i: number, x: number, y: number, dd: number) => void) => {
    for (let y = Math.max(1, by - r - 3); y <= Math.min(H - 2, by + r + 3); y++) for (let x = Math.max(1, bx - r - 3); x <= Math.min(W - 2, bx + r + 3); x++) {
      const dd = Math.hypot(x - bx, y - by) / r + (hash2(x, y, seed + 17) - 0.5) * 0.25;
      if (dd < 1) fn(y * W + x, x, y, dd);
    }
  };
  // guaranteed lake near the start
  const lx = Math.round(cx + Math.cos(P.lakeA) * P.lakeD), ly = Math.round(cy + Math.sin(P.lakeA) * P.lakeD);
  for (let y = ly - 12; y <= ly + 12; y++) for (let x = lx - 14; x <= lx + 14; x++) {
    const dd = Math.hypot((x - lx) / 1.2, y - ly) + (hash2(x, y, seed + 3) - 0.5) * 1.5;
    const i = y * W + x;
    if (dd < 4) tiles[i] = TT.DEEP; else if (dd < 8) tiles[i] = TT.WATER; else if (dd < 9.5 && isLand(tiles[i])) tiles[i] = TT.SAND;
    if (dd < 11) trees[i] = 0;
  }
  // guaranteed forest (coal) and desert (oil, quartz) not too far from the start
  const fa = rng() * Math.PI * 2, fxc = Math.round(cx + Math.cos(fa) * 52), fyc = Math.round(cy + Math.sin(fa) * 52);
  blob(fxc, fyc, 14, (i, x, y) => { if (isLand(tiles[i])) { tiles[i] = TT.GRASS2; trees[i] = hash2(x, y, seed + 5) < 0.35 ? 1 : 0; } });
  const da = fa + Math.PI * (0.7 + rng() * 0.6), dxc = Math.round(cx + Math.cos(da) * 120), dyc = Math.round(cy + Math.sin(da) * 120);
  blob(dxc, dyc, 20, (i) => { if (isLand(tiles[i]) || tiles[i] === TT.ROCK) { tiles[i] = TT.SAND; trees[i] = 0; } });

  // ---- resource nodes
  const nodes: ResNode[] = [];
  const nodeGrid = new Int32Array(W * H);
  const canNode = (x: number, y: number, res: string) => {
    if (x < 30 || y < 30 || x > W - 32 || y > H - 32) return false;
    if (x > HX - 8 && x < HX + 12 && y > HY - 8 && y < HY + 12) return false;
    for (let j = -3; j < 5; j++) for (let i = -3; i < 5; i++) if (nodeGrid[(y + j) * W + x + i]) return false;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (!isLand(tiles[(y + j) * W + x + i])) return false;
    return RES_BIOMES[res].includes(biomeAtTiles(tiles, x + 1, y + 1));
  };
  const add = (x: number, y: number, res: string, p: number) => {
    const id = nodes.length + 1;
    nodes.push({ id, x, y, res, p });
    for (let j = -1; j < 3; j++) for (let i = -1; i < 3; i++) trees[(y + j) * W + x + i] = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) nodeGrid[(y + j) * W + x + i] = id;
  };
  const pureBias = mode === 'easy' ? 0.15 : mode === 'hard' ? -0.04 : 0.08;
  const impure = mode === 'easy' ? 0.18 : mode === 'hard' ? 0.5 : 0.3;
  const purity = (d: number) => {
    const r = rng(), pc = Math.max(0.02, clamp((d - 60) / 500, 0, 0.35) + 0.05 + pureBias);
    return r < pc ? 2 : r < pc + impure ? 0 : 1;
  };
  const tryPlace = (res: string, dmin: number, dmax: number, p?: number, ox = cx, oy = cy, tries = 900) => {
    for (let k = 0; k < tries; k++) {
      const a = rng() * Math.PI * 2, d = dmin + rng() * (dmax - dmin);
      const x = Math.round(ox + Math.cos(a) * d), y = Math.round(oy + Math.sin(a) * d);
      if (canNode(x, y, res)) { add(x, y, res, p ?? purity(Math.hypot(x - cx, y - cy))); return { x, y }; }
    }
    return null;
  };
  /** place near the start, widening the search if the right biome isn't nearby */
  const starter = (res: string, dmin: number, dmax: number, p: number) => {
    for (let k = 0; k < 6; k++) if (tryPlace(res, dmin, dmax * (1 + k * 0.6), p)) return;
  };
  starter('iron_ore', 11, 15, 1); starter('iron_ore', 12, 17, 1); starter('iron_ore', 13, 20, 0);
  starter('copper_ore', 14, 20, 1); starter('copper_ore', 16, 25, 0);
  starter('limestone', 14, 22, 1); starter('limestone', 18, 27, 1);
  if (mode === 'easy') { starter('iron_ore', 16, 26, 2); starter('copper_ore', 18, 28, 1); }
  tryPlace('coal', 0, 10, 1, fxc, fyc, 400); tryPlace('coal', 3, 12, 1, fxc, fyc, 400);
  starter('coal', 30, 70, 1);
  tryPlace('crude_oil', 0, 10, 1, dxc, dyc, 400); tryPlace('crude_oil', 5, 14, 1, dxc, dyc, 400); tryPlace('raw_quartz', 4, 16, 1, dxc, dyc, 400);
  tryPlace('caterium_ore', 4, 17, 1, dxc, dyc, 400);
  starter('caterium_ore', 60, 110, 1); starter('raw_quartz', 70, 130, 1);
  starter('geyser', 50, 100, 1); starter('bauxite', 110, 200, 1);
  // everything else, scaled by map area and difficulty
  const area = (W * H) / (1024 * 1024), rich = mode === 'easy' ? 1.5 : mode === 'hard' ? 0.6 : 1.2;
  const maxR = W * 0.47;
  const oilField = (dmin: number, dmax: number) => {
    const c = tryPlace('crude_oil', dmin, dmax, 1);
    if (!c) return;
    const n = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) tryPlace('crude_oil', 5, 14, undefined, c.x, c.y, 200);
  };
  for (let i = 0; i < Math.round(11 * area * rich); i++) oilField(140, maxR);
  const counts: [string, number, number][] = [
    ['iron_ore', 75, 30], ['copper_ore', 55, 30], ['limestone', 50, 30], ['coal', 50, 40],
    ['caterium_ore', 32, 70], ['raw_quartz', 32, 70], ['bauxite', 28, 150], ['geyser', 30, 60],
  ];
  for (const [res, n, dmin] of counts) for (let i = 0; i < Math.round(n * area * rich); i++) tryPlace(res, dmin, maxR, undefined, cx, cy, 300);
  return { tiles, trees, nodes, nodeGrid };
}

// ---------------------------------------------------------------------------
// Version 3 worlds: big biomes that sit in different directions from the HUB, and resources placed
// in rings that scale with the map, so a full factory has to reach out across the whole map.
/** resource rings as fractions of the map's radius (HUB to edge) */
export const RINGS: Record<string, [number, number]> = {
  iron_ore: [0.04, 0.9], copper_ore: [0.04, 0.9], limestone: [0.04, 0.9],
  coal: [0.2, 0.9], geyser: [0.3, 0.9],
  caterium_ore: [0.38, 0.92], raw_quartz: [0.42, 0.92], crude_oil: [0.4, 0.92], sulfur: [0.45, 0.92],
  bauxite: [0.6, 0.9], uranium: [0.7, 0.92],
};
/** v3 = big regions + rings; v4 adds uranium and keeps the desert away from big water */
/** a smooth noise field sampled every `st` tiles and bilinearly interpolated (much faster than per-tile noise) */
function coarseField(st: number, fn: (x: number, y: number) => number) {
  const gw = Math.ceil(W / st) + 2, gh = Math.ceil(H / st) + 2, g = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fn(i * st, j * st);
  return (x: number, y: number) => {
    const fx = x / st, fy = y / st, i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * gw + i;
    const a = g[k] + (g[k + 1] - g[k]) * tx, b = g[k + gw] + (g[k + gw + 1] - g[k + gw]) * tx;
    return a + (b - a) * ty;
  };
}
/** v6: organic region borders (warped), soft desert drying, noisy blobs, and an island coastline */
function genTerrainV3(seed: number, mode: string, v = 3, land = W): Terrain {
  const isl = v >= 6;
  const tiles = new Uint8Array(W * H), trees = new Uint8Array(W * H);
  const r = mulberry32(seed * 31 + 11);
  const D = diffOf(mode);
  // HUB near the middle so every direction has room for its rings
  const off = (n: number) => Math.round(n / 2 - 2 + (r() - 0.5) * n * 0.1);
  HX = off(W); HY = off(H);
  const cx = HX + 2, cy = HY + 2;
  const R = isl ? land / 2 : Math.min(W, H) / 2;      // "map radius" used for all rings (the land's size, not the ocean's)
  const scale = 110 + r() * 110, mscale = (70 + r() * 90) * 2.75;   // biomes ~2.75x the old size
  const warp = r() < 0.75 ? 20 + r() * 110 : 0;
  // v5: more water overall (and more still on Hard)
  const pWater = (v >= 5 ? 0.15 + r() * 0.07 + (mode === 'hard' ? 0.06 : 0) : 0.06 + r() * 0.1), pDeep = pWater * (0.35 + r() * 0.3), pSand = pWater + 0.015 + r() * 0.03;
  const pRock = 1 - (0.035 + r() * 0.06), pDirt = pRock - (0.04 + r() * 0.04);
  const edge = Math.min(W * 0.08, 18 + r() * 26);
  // three big regions spread around the HUB
  const aDesert = r() * Math.PI * 2, aForest = aDesert + Math.PI * 2 / 3 + (r() - 0.5) * 0.6, aHigh = aDesert + Math.PI * 4 / 3 + (r() - 0.5) * 0.6;
  const lobe = (a: number, t: number) => { const c = Math.cos(a - t); return c > 0 ? c * c : 0; };
  const hs = new Float32Array(W * H), hb = new Float32Array(W * H);
  // v6: bend the region borders so they wander instead of running straight out from the HUB
  const rw = R * 0.34;
  const wA = isl ? coarseField(8, (x, y) => (fbm(x / rw + 17, y / rw, seed + 61, 3) - 0.5) * 2.4) : null;
  const wF = isl ? coarseField(8, (x, y) => 1 + (fbm(x / rw, y / rw + 33, seed + 63, 3) - 0.5) * 0.6) : null;
  const warpA = (x: number, y: number) => wA ? wA(x, y) : 0;
  const warpF = (x: number, y: number) => wF ? wF(x, y) : 1;
  // v6 island: a coast value (distance from the middle, roughened at several scales); the threshold is picked
  // so the island (lakes included, ocean not) has exactly the old map's area
  let coast: Float32Array | null = null, cThr = 0;
  const cstep = 1 / R;
  if (isl) {
    coast = new Float32Array(W * H);
    const gx0 = W / 2, gy0 = H / 2, mb = Math.max(24, W * 0.05);
    const cf = coarseField(4, (x, y) => {
      const qx = x + (fbm(x / 190, y / 190, seed + 73, 2) - 0.5) * R * 0.26, qy = y + (fbm(x / 190 + 70, y / 190, seed + 75, 2) - 0.5) * R * 0.26;
      const c = Math.hypot(qx - gx0, qy - gy0) / R;
      return c + (fbm(x / (R * 0.45), y / (R * 0.45), seed + 71, 4) - 0.5) * 0.6 + (fbm(x / 60, y / 60, seed + 77, 2) - 0.5) * 0.12;
    });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c = cf(x, y);
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (e < mb) c += (1 - e / mb) * 3;                         // never touch the grid's edge
      coast[y * W + x] = c;
    }
    const cs: number[] = [];
    const st = Math.max(7, Math.floor(W * H / 60000));
    for (let i = 0; i < W * H; i += st) cs.push(coast[i]);
    cs.sort((a, b) => a - b);
    cThr = cs[Math.min(cs.length - 1, Math.floor(cs.length * (land * land) / (W * H)))];
  }
  // v6: the height warp is smooth, so sample it coarsely; open ocean needs no heights at all
  const hwx = isl && warp ? coarseField(8, (x, y) => (fbm(x / 260, y / 260, seed + 41, 2) - 0.5) * warp * 2) : null;
  const hwy = isl && warp ? coarseField(8, (x, y) => (fbm(x / 260 + 50, y / 260, seed + 43, 2) - 0.5) * warp * 2) : null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (coast && coast[y * W + x] > cThr + 0.02) { hs[y * W + x] = -9; continue; }
    let wx = x, wy = y;
    if (hwx) { wx += hwx(x, y); wy += hwy!(x, y); }
    else if (warp) { wx += (fbm(x / 260, y / 260, seed + 41, 2) - 0.5) * warp * 2; wy += (fbm(x / 260 + 50, y / 260, seed + 43, 2) - 0.5) * warp * 2; }
    // v5: a very broad layer joins low ground into bigger lakes and bays
    hs[y * W + x] = v >= 5 ? fbm(wx / scale, wy / scale, seed, 4) * 0.62 + fbm(wx / (scale * 2.6), wy / (scale * 2.6), seed + 51, 3) * 0.38 : fbm(wx / scale, wy / scale, seed, 4);
  }
  const sample: number[] = [];
  const stepS = Math.max(37, Math.floor(W * H / 40000));
  for (let i = 0; i < W * H; i += stepS) if (hs[i] > -9) sample.push(hs[i]);
  sample.sort((a, b) => a - b);
  const pct = (p: number) => sample[Math.floor(p * (sample.length - 1))];
  const tDeep = pct(pDeep), tWater = pct(pWater), tSand = pct(pSand), tDirt = pct(pDirt), tRock = pct(pRock), mid = pct(0.5), spread = pct(0.9) - pct(0.1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (coast && coast[i] > cThr) {                                // the ocean (a shallow shelf of varying width, then deep water)
      const cv = coast[i];
      tiles[i] = cv > cThr + 21 * cstep || cv > cThr + (5 + fbm(x / 40, y / 40, seed + 97, 2) * 16) * cstep ? TT.DEEP : TT.WATER;
      hb[i] = -9;
      continue;
    }
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), f = d / R * warpF(x, y), a = Math.atan2(dy, dx) + warpA(x, y);
    const ring = Math.min(1, Math.max(0, (f - 0.12) / 0.25));   // sectors fade in outside the core
    let h = hs[i];
    const hl = ring * lobe(a, aHigh);
    h += hl * spread * 0.45;                                     // the highlands carry the big mountain ranges
    hb[i] = h;
    h = lerp(h, mid, clamp(1 - (d - 24) / 40, 0, 1));            // flat, dry start area
    const e = isl ? 1e9 : Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e < edge) h = lerp(tDeep - 0.1, h, e / edge);
    let m = fbm(x / mscale + 300, y / mscale, seed + 7, 3);
    m += ring * (0.27 * lobe(a, aForest) - 0.25 * lobe(a, aDesert));
    m = lerp(m, 0.47, clamp(1 - (d - 30) / 60, 0, 1));
    let t: number;
    const dry = v >= 4 && !isl && ring * lobe(a, aDesert) > 0.3 && e >= edge;   // no lakes in the desert
    // v6: the desert dries out gradually (lakes shrink along their shores instead of being cut off)
    const hw = isl ? h + clamp(ring * lobe(a, aDesert) * 1.6 - 0.15, 0, 1) * spread * 0.55 : h;
    const cv = coast ? coast[i] : 0;
    if (coast && cv > cThr - 2.5 * cstep && h <= tRock) t = TT.SAND;                  // beaches
    else if (!dry && hw < tDeep) t = TT.DEEP;
    else if (!dry && hw < tWater) t = TT.WATER;
    else if (!dry && hw < tSand) t = TT.SAND;
    else if (h > tRock) t = TT.ROCK;
    else if (h > tDirt) t = TT.DIRT;
    else if (hl > 0.35 && fbm(x / 40 + 90, y / 40, seed + 13, 2) < 0.25 + hl * 0.3) t = TT.DIRT;   // rocky ground between the ranges
    else if (m < 0.36) t = TT.SAND;
    else if (m > 0.585) t = TT.GRASS2;
    else t = TT.GRASS;
    tiles[i] = t;
    if ((t === TT.GRASS || t === TT.GRASS2) && d > 16) {
      let p = t === TT.GRASS2 ? 0.25 + (m - 0.585) * 3 : 0.012;
      p *= clamp((d - 16) / 40, 0.15, 1);
      if (hash2(x, y, seed + 99) < p) trees[i] = 1;
    }
  }
  // Mountains are an obstacle until trains can tunnel through them, but they should never swallow the map:
  // keep at most ~2x the usual amount of rock. The lowest rock becomes foothills (buildable rocky dirt).
  {
    const cap = Math.min(0.13, 2 * (1 - pRock)) * (isl ? land * land : W * H);
    const rockH: number[] = [];
    for (let i = 0; i < W * H; i++) if (tiles[i] === TT.ROCK) rockH.push(hb[i]);
    if (rockH.length > cap) {
      rockH.sort((a, b) => b - a);
      const thr = rockH[Math.floor(cap)];
      for (let i = 0; i < W * H; i++) if (tiles[i] === TT.ROCK && hb[i] <= thr) tiles[i] = TT.DIRT;
    }
    // a band of foothills around every range
    const foot = new Uint8Array(W * H);
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (tiles[i] !== TT.ROCK) continue;
      for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) if (j * j + k * k <= 9 + ((x * 7 + y * 13 + j + k) & 3)) foot[(y + j) * W + x + k] = 1;
    }
    for (let i = 0; i < W * H; i++) if (foot[i] && (tiles[i] === TT.GRASS || tiles[i] === TT.GRASS2 || tiles[i] === TT.SAND)) { tiles[i] = TT.DIRT; trees[i] = 0; }
  }
  const blob = (bx: number, by: number, rad: number, fn: (i: number, x: number, y: number) => void) => {
    const rb = Math.ceil(isl ? rad * 1.7 + 4 : rad + 3);   // v6 edges wobble outward, so search further (else they clip into rectangles)
    for (let y = Math.max(1, by - rb); y <= Math.min(H - 2, by + rb); y++) for (let x = Math.max(1, bx - rb); x <= Math.min(W - 2, bx + rb); x++) {
      const dd = Math.hypot(x - bx, y - by) / rad + (isl ? (fbm(x / (rad * 0.45 + 4), y / (rad * 0.45 + 4), seed + 81, 3) - 0.5) * 0.8 : (hash2(x, y, seed + 17) - 0.5) * 0.25);
      if (dd < 1) fn(y * W + x, x, y);
    }
  };
  const at = (a: number, f: number) => [Math.round(cx + Math.cos(a) * f * R), Math.round(cy + Math.sin(a) * f * R)];
  // a small lake and a wood grove near the start
  const la = r() * Math.PI * 2, [lx, ly] = at(la, Math.min(0.16, 40 / R));
  blob(lx, ly, 9, (i, x, y) => { const dd = Math.hypot(x - lx, y - ly); tiles[i] = dd < 4 ? TT.DEEP : TT.WATER; trees[i] = 0; });
  const [gx, gy] = at(la + Math.PI * (0.7 + r() * 0.6), Math.min(0.1, 26 / R));
  blob(gx, gy, 6, (i, x, y) => { if (tiles[i] === TT.GRASS || tiles[i] === TT.GRASS2) trees[i] = hash2(x, y, seed + 5) < 0.45 ? 1 : 0; });
  // guarantee each big region exists where it should
  const [fx, fy] = at(aForest, 0.32), [sx, sy] = at(aDesert, 0.55), [hx, hy] = at(aHigh, 0.55);
  blob(fx, fy, Math.round(R * 0.12), (i, x, y) => { if (isLand(tiles[i]) && tiles[i] !== TT.ROCK) { tiles[i] = TT.GRASS2; trees[i] = hash2(x, y, seed + 5) < 0.3 ? 1 : 0; } });
  blob(sx, sy, Math.round(R * 0.16), (i) => { if (isLand(tiles[i])) { tiles[i] = TT.SAND; trees[i] = 0; } });
  blob(hx, hy, Math.round(R * 0.14), (i) => { if (isLand(tiles[i]) && tiles[i] !== TT.ROCK) { tiles[i] = TT.DIRT; trees[i] = 0; } });
  if (v >= 4) keepDesertFromWater(tiles, isl ? seed : 0);

  // ---- resource nodes
  const nodes: ResNode[] = [];
  const nodeGrid = new Int32Array(W * H);
  const canNode = (x: number, y: number, res: string) => {
    if (x < 30 || y < 30 || x > W - 32 || y > H - 32) return false;
    if (x > HX - 8 && x < HX + 12 && y > HY - 8 && y < HY + 12) return false;
    for (let j = -3; j < 5; j++) for (let i = -3; i < 5; i++) if (nodeGrid[(y + j) * W + x + i]) return false;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (!isLand(tiles[(y + j) * W + x + i])) return false;
    return RES_BIOMES[res].includes(biomeAtTiles(tiles, x + 1, y + 1));
  };
  const add = (x: number, y: number, res: string, p: number) => {
    const id = nodes.length + 1;
    nodes.push({ id, x, y, res, p });
    for (let j = -1; j < 3; j++) for (let i = -1; i < 3; i++) trees[(y + j) * W + x + i] = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) nodeGrid[(y + j) * W + x + i] = id;
  };
  // better nodes further out
  const purity = (f: number) => { const q = r(), pc = Math.max(0.02, 0.04 + 0.34 * clamp((f - 0.1) / 0.75, 0, 1) + D.pureBias); return q < pc ? 2 : q < pc + D.impure ? 0 : 1; };
  const tryPlace = (res: string, dmin: number, dmax: number, p?: number, ox = cx, oy = cy, tries = 900) => {
    for (let k = 0; k < tries; k++) {
      const a = r() * Math.PI * 2, d = dmin + r() * (dmax - dmin);
      const x = Math.round(ox + Math.cos(a) * d), y = Math.round(oy + Math.sin(a) * d);
      if (canNode(x, y, res)) { add(x, y, res, p ?? purity(Math.hypot(x - cx, y - cy) / R)); return { x, y }; }
    }
    return null;
  };
  const starter = (res: string, dmin: number, dmax: number, p: number) => { for (let k = 0; k < 6; k++) if (tryPlace(res, dmin, dmax * (1 + k * 0.6), p)) return; };
  starter('iron_ore', 11, 15, 1); starter('iron_ore', 12, 17, 1); starter('iron_ore', 13, 20, 0);
  starter('copper_ore', 14, 20, 1); starter('copper_ore', 16, 25, 0);
  starter('limestone', 14, 22, 1); starter('limestone', 18, 27, 1);
  if (mode === 'easy') { starter('iron_ore', 16, 26, 2); starter('copper_ore', 18, 28, 1); }
  // a first taste of each region, at the near edge of its ring
  tryPlace('coal', 0, R * 0.06, 1, fx, fy, 600); tryPlace('coal', 0, R * 0.08, 1, fx, fy, 600);
  for (const res of ['crude_oil', 'crude_oil', 'raw_quartz', 'caterium_ore', 'sulfur']) tryPlace(res, 0, R * 0.1, 1, sx, sy, 600);
  for (const res of ['geyser', 'caterium_ore', 'sulfur', 'bauxite']) tryPlace(res, 0, R * 0.1, undefined, hx, hy, 600);
  // everything else, spread through each resource's ring, scaled by map area and difficulty
  const area = (isl ? land * land : W * H) / (1024 * 1024);
  const counts: [string, number][] = [['iron_ore', 70], ['copper_ore', 52], ['limestone', 48], ['coal', 48], ['caterium_ore', 30], ['raw_quartz', 30], ['bauxite', 26], ['geyser', 26], ['sulfur', 30]];
  for (const [res, n] of counts) { const [a0, a1] = RINGS[res]; for (let i = 0; i < Math.round(n * area * D.rich); i++) tryPlace(res, a0 * R, a1 * R, undefined, cx, cy, 300); }
  const [o0, o1] = RINGS.crude_oil;
  for (let i = 0; i < Math.round(10 * area * D.rich); i++) {
    const c = tryPlace('crude_oil', o0 * R, o1 * R);
    if (!c) continue;
    const n = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) tryPlace('crude_oil', 5, 14, undefined, c.x, c.y, 200);
  }
  if (v >= 4) {
    // uranium: rare, glowing, near the edges of the map
    const [u0, u1] = RINGS.uranium;
    for (let i = 0; i < Math.max(4, Math.round(16 * area * D.rich)); i++) tryPlace('uranium', u0 * R, u1 * R, undefined, cx, cy, 300);
  }
  carvePasses(tiles, cx, cy, nodes, isl ? seed : 0);
  return { tiles, trees, nodes, nodeGrid };
}

/**
 * Make sure every resource node can be reached from the HUB without crossing a mountain.
 * Cheapest-path search where land costs 1, water 20 and rock 15: a pass is only carved where the way
 * around is enormous or doesn't exist, so mountains stay an obstacle (a long detour) until trains tunnel through.
 */
function carvePasses(tiles: Uint8Array, cx: number, cy: number, nodes: ResNode[], seed = 0) {
  const N = W * H, dist = new Int32Array(N).fill(0x7fffffff), from = new Int32Array(N).fill(-1);
  // v6 (seed given): land costs wobble with noise so passes wind naturally instead of running dead straight
  let jit: Uint8Array | null = null;
  if (seed) {
    jit = new Uint8Array(N);
    const jf = coarseField(3, (x, y) => fbm(x / 11, y / 11, seed + 91, 2));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) jit[y * W + x] = Math.floor(clamp(jf(x, y), 0, 0.999) * 4);
  }
  // (v6 routes never cross deep water: that also keeps the search off the open ocean)
  const cost = jit ? (t: number, i: number) => t === TT.ROCK ? 36 : t === TT.DEEP ? 0 : t === TT.WATER ? 48 : 2 + jit![i]
    : (t: number, _i: number) => t === TT.ROCK ? 15 : t === TT.WATER || t === TT.DEEP ? 20 : 1;
  // Dial's algorithm: bucket queue keyed by distance (edge costs are small integers)
  const B = jit ? 49 : 21, buckets: number[][] = Array.from({ length: B }, () => []);
  const s0 = cy * W + cx; dist[s0] = 0; buckets[0].push(s0);
  let d = 0, pending = 1;
  while (pending > 0) {
    const bk = buckets[d % B];
    while (bk.length) {
      const i = bk.pop()!; pending--;
      if (dist[i] !== d) continue;
      const x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx, c = cost(tiles[ni], ni);
        if (!c) continue;
        const nd = d + c;
        if (nd < dist[ni]) { dist[ni] = nd; from[ni] = i; buckets[nd % B].push(ni); pending++; }
      }
    }
    d++;
  }
  // walk each node's cheapest route home; any rock on it becomes a 5-wide rocky pass
  const done = new Uint8Array(N);
  for (const n of nodes) {
    for (let c = n.y * W + n.x; c >= 0 && !done[c]; c = from[c]) {
      done[c] = 1;
      if (tiles[c] !== TT.ROCK) continue;
      const x = c % W, y = (c / W) | 0;
      for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
        const t = (y + j) * W + x + k;
        if (t >= 0 && t < N && tiles[t] === TT.ROCK && j * j + k * k <= 5) tiles[t] = TT.DIRT;
      }
    }
  }
}

/** Deserts shouldn't touch big lakes or the sea: sand near large water turns to grassland (keeping a thin beach). */
function keepDesertFromWater(tiles: Uint8Array, seed = 0) {
  const N = W * H, wet = (t: number) => t === TT.WATER || t === TT.DEEP;
  // find large water bodies
  const comp = new Int32Array(N).fill(-1), big: boolean[] = [];
  for (let i = 0; i < N; i++) {
    if (comp[i] >= 0 || !wet(tiles[i])) continue;
    const id = big.length, st = [i]; comp[i] = id; let n = 0;
    while (st.length) {
      const c = st.pop()!; n++;
      const x = c % W, y = (c / W) | 0;
      if (x > 0 && comp[c - 1] < 0 && wet(tiles[c - 1])) { comp[c - 1] = id; st.push(c - 1); }
      if (x < W - 1 && comp[c + 1] < 0 && wet(tiles[c + 1])) { comp[c + 1] = id; st.push(c + 1); }
      if (y > 0 && comp[c - W] < 0 && wet(tiles[c - W])) { comp[c - W] = id; st.push(c - W); }
      if (y < H - 1 && comp[c + W] < 0 && wet(tiles[c + W])) { comp[c + W] = id; st.push(c + W); }
    }
    big.push(n >= 400);
  }
  // distance (in tiles) from large water, up to 12
  const dist = new Uint8Array(N).fill(255), q: number[] = [];
  for (let i = 0; i < N; i++) if (comp[i] >= 0 && big[comp[i]]) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], d = dist[c]; if (d >= 12) continue;
    const x = c % W, y = (c / W) | 0;
    for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1]) if (n >= 0 && dist[n] === 255) { dist[n] = d + 1; q.push(n); }
  }
  if (!seed) { for (let i = 0; i < N; i++) if (tiles[i] === TT.SAND && dist[i] > 2 && dist[i] <= 12) tiles[i] = TT.GRASS; return; }
  // v6: round (chamfer) distance and a wandering width, so the green shore band has no corners
  const fd = new Float32Array(N);
  for (let i = 0; i < N; i++) fd[i] = comp[i] >= 0 && big[comp[i]] ? 0 : 1e6;
  const S2 = Math.SQRT2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let v = fd[i]; if (!v) continue;
    if (x > 0) v = Math.min(v, fd[i - 1] + 1);
    if (y > 0) { v = Math.min(v, fd[i - W] + 1); if (x > 0) v = Math.min(v, fd[i - W - 1] + S2); if (x < W - 1) v = Math.min(v, fd[i - W + 1] + S2); }
    fd[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let v = fd[i]; if (!v) continue;
    if (x < W - 1) v = Math.min(v, fd[i + 1] + 1);
    if (y < H - 1) { v = Math.min(v, fd[i + W] + 1); if (x < W - 1) v = Math.min(v, fd[i + W + 1] + S2); if (x > 0) v = Math.min(v, fd[i + W - 1] + S2); }
    fd[i] = v;
  }
  for (let i = 0; i < N; i++) {
    if (tiles[i] !== TT.SAND || fd[i] <= 2.5 || fd[i] > 24) continue;
    const x = i % W, y = (i / W) | 0, lim = 7 + fbm(x / 23, y / 23, seed + 95, 3) * 12;
    if (fd[i] <= lim) tiles[i] = TT.GRASS;
  }
}
