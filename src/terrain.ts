import { clamp, fbm, hash2, lerp, mulberry32 } from './util';

// World size is chosen when a world is created (small / medium / large).
export let W = 1024, H = 1024;
export let HX = 510, HY = 510; // HUB top-left
export const SIZES: Record<string, { n: number; label: string; desc: string }> = {
  small: { n: 512, label: 'Small', desc: '512 × 512 — cozy, everything is close' },
  medium: { n: 1024, label: 'Medium', desc: '1024 × 1024 — the classic size' },
  large: { n: 2304, label: 'Large', desc: '2304 × 2304 — 5× the area, built for trains' },
};
export function setWorldSize(n: number) { W = H = n; HX = HY = n / 2 - 2; }

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
export function genTerrain(seed: number, mode = 'easy', v = 1): Terrain {
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
