// Explorable world features: crash sites (hard drives + power shards) and power crystals.
// Generated deterministically from the world seed; what has been looted is stored in the save.
import { Cost } from './data';
import { H, HX, HY, isLand, TT, W } from './terrain';

export interface Feat { id: number; kind: 'site' | 'crystal'; x: number; y: number; w: number; tier: number; cost: Cost; shards: number }

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SITE_COST: Cost[][] = [
  [{}, { iron_plate: 30 }, { iron_rod: 40 }],
  [{ reinforced_plate: 10 }, { rotor: 8 }, { cable: 60 }],
  [{ modular_frame: 6 }, { encased_beam: 10 }, { motor: 4 }],
];

export function genFeatures(seed: number, tiles: Uint8Array, trees: Uint8Array, nodeGrid: Int32Array) {
  const r = rng(seed * 7 + 13);
  const f = (W * H) / (1024 * 1024);
  const nSites = Math.max(6, Math.round(20 * f)), nCrys = Math.max(16, Math.round(50 * f));
  const feats: Feat[] = [];
  const grid = new Int32Array(W * H);
  const maxD = Math.hypot(W, H) * 0.5;
  const ok = (x: number, y: number, w: number) => {
    if (x < 4 || y < 4 || x + w >= W - 4 || y + w >= H - 4) return false;
    if (Math.hypot(x - HX, y - HY) < 30) return false;
    for (let j = -1; j <= w; j++) for (let i = -1; i <= w; i++) {
      const k = (y + j) * W + x + i, t = tiles[k];
      if (!isLand(t) || t === TT.ROCK || nodeGrid[k] || grid[k]) return false;
    }
    for (const o of feats) if (Math.abs(o.x - x) < 7 && Math.abs(o.y - y) < 7) return false;
    return true;
  };
  const put = (kind: 'site' | 'crystal', n: number) => {
    let tries = 0, made = 0;
    while (made < n && tries++ < n * 400) {
      const w = kind === 'site' ? 2 : 1;
      const x = Math.floor(r() * W), y = Math.floor(r() * H);
      if (!ok(x, y, w)) continue;
      const d = Math.hypot(x - HX, y - HY) / maxD;
      const tier = d < 0.3 ? 0 : d < 0.62 ? 1 : 2;
      const fe: Feat = { id: feats.length + 1, kind, x, y, w, tier, cost: {}, shards: 0 };
      if (kind === 'site') { fe.cost = SITE_COST[tier][Math.floor(r() * 3)]; fe.shards = tier === 0 ? (r() < 0.5 ? 1 : 0) : tier === 1 ? 1 : 1 + (r() < 0.5 ? 1 : 0); }
      else fe.shards = tier === 0 ? 1 : tier === 1 ? 2 : 5;
      feats.push(fe);
      for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) { const k = (y + j) * W + x + i; grid[k] = fe.id; trees[k] = 0; }
      made++;
    }
  };
  put('site', nSites);
  put('crystal', nCrys);
  return { feats, grid };
}
