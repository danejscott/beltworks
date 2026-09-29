import { applyGameLength, BLD, BDef, Cost, ITEMS, RECIPES, START_UNLOCKS } from './data';
import { diffOf, tierMult } from './difficulty';
import { genTerrain, gridFor, H, HX, HY, isLand, isWater, ResNode, setWorldSize, TT, W } from './terrain';
import { Feat, genFeatures } from './features';
import { shoreTiles } from './ships';
import { DX, DY, opp } from './util';
import { clearTeams, MP, wrand } from './teams';
import { applyExtraNode } from './online';

export interface Ent { id: number; type: string; x: number; y: number; rot: number; w: number; h: number; born: number; pop: number; [k: string]: any }

export interface State {
  seed: number; inv: Record<string, number>; unlocked: Set<string>; done: Set<string>; maxTier: number;
  elev: Cost; time: number; won: boolean; flags: Record<string, any>; delivered: Record<string, number>;
  speed: number; points: number; coupons: number; couponsEarned: number; shop: Record<string, number>;
  stationSeq: number; trainSeq: number;
  name: string; mode: string; size: number; regrow: number[]; // regrow: flat [tileIndex, dueTime, ...]
  dayNight: boolean;            // day/night cycle on?
  lines: Line[];                // looped train lines built by Quick Route
  looted: number[];             // crash sites / crystals already collected (feature ids)
  alts: string[];               // alternate recipes researched
  altOffer: string[] | null;    // pending research choice
  ach: Record<string, number>;  // achievement id -> game time unlocked
  made: Record<string, number>; // total produced by machines, ever
  discN: number[]; discF: number[]; // discovered node / feature indices
  truckSeq: number; lineSeq: number; shipSeq?: number;
  genV?: number;                // terrain generator version (2 = randomized)
  portsV?: number;              // 1 = world uses single input/output ports
  playT?: number;               // real seconds played in this world
  msT?: Record<string, number>; tierT?: Record<string, number>; wonT?: number;
  lenV?: number;                // 1 = milestone amounts scale with difficulty (game length)
  rngS?: number;                // state of the world's random generator (so every copy rolls the same)
  xn?: [number, number, string, number][]; // extra resource nodes (online spawns)
  cq?: { q: string[]; active: boolean; t: number }; // hand-crafting queue
}
export interface Line { id: number; a: number; b: number; cells: number[]; split: number }
export interface Truck {
  id: number; o?: number; name: string; x: number; y: number; a: number; sched: number[]; si: number; state: string;
  cargo: Record<string, number>; tot: number; path: number[]; pi: number; v: number; waitT: number; idleT: number; retryT: number;
}

export interface Train {
  id: number; o?: number; name: string; cars: string[]; cells: number[]; // tile indices, head first (2 per car)
  frac: number; route: number[]; v: number; sched: number[]; si: number;
  state: string; cargo: Record<string, number>; tot: number; waitT: number; idleT: number; blockT: number; running: boolean; dir?: number;
  oneWay?: boolean; line?: number;
}

/** floors: 0 = ground, 1..3 = on foundations; LH = height of one floor in world units */
export const NL = 4, LH = 4;
const TALL: Record<string, number> = { elevator: 13, tower: 5, hub: 4.5 };
const GROUND_ONLY = new Set(['miner', 'extractor', 'harvester', 'rail', 'train', 'wagon', 'station', 'tstation', 'hub', 'elevator', 'drone', 'foundation', 'outpost', 'port']);
export const groundOnly = (type: string) => { const d = BLD[type]; return GROUND_ONLY.has(d.kind) || !!(d.on && d.on !== 'water'); };
export const G = {
  S: null as State,
  ents: new Map<number, Ent>(),
  grid: new Int32Array(W * H),        // ground floor
  up: [null, null, null, null] as (Int32Array | null)[], // floors 1..3 (allocated when first used)
  floor: new Uint8Array(W * H),       // bit z set = foundation deck on floor z
  floorN: 0,
  nextId: 1,
  tiles: null as Uint8Array,
  trees: null as Uint8Array,
  trees0: null as Uint8Array,
  nodes: [] as ResNode[],
  nodeGrid: null as Int32Array,
  trains: [] as Train[],
  trainOcc: new Map<number, number>(),
  trucks: [] as Truck[],
  ships: [] as any[],
  feats: [] as Feat[],
  featGrid: null as Int32Array,
  disc: null as Uint8Array,      // per node: discovered?
  fdisc: null as Uint8Array,     // per feature: discovered?
  pings: [] as { x: number; y: number; t: number; col: string; label: string }[],
  dirty: { links: true, power: true, fluid: true },
  rev: 1, treeRev: 1, railRev: 1,
  L: null as any,
  pnets: [] as any[],
  fnets: [] as any[],
  covGrid: null as Int32Array,
  realNow: 0,
  fx: {
    placed: (_e: Ent) => { }, removed: (_e: Ent) => { }, tile: (_x: number, _y: number) => { },
    toast: (_h: string, _k?: string) => { }, sfx: (_n: string) => { }, chop: (_x: number, _y: number, _n: number) => { },
    ui: (_k: string, _o: any) => { },   // UI reactions to the local player's own commands (open a panel, particles)
  },
};

export const def = (e: Ent): BDef => BLD[e.type];
export const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
export function gridOf(z: number): Int32Array { return z === 0 ? G.grid : (G.up[z] || (G.up[z] = new Int32Array(W * H))); }
export const hasFloor = (x: number, y: number, z: number) => z === 0 || (x >= 0 && y >= 0 && x < W && y < H && !!(G.floor[y * W + x] & (1 << z)));
export function entAt(x: number, y: number, z = 0): Ent | null {
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const g = z === 0 ? G.grid : G.up[z];
  if (!g) return null;
  const id = g[y * W + x];
  return id ? G.ents.get(id) || null : null;
}
export function featAt(x: number, y: number): Feat | null {
  if (!inB(x, y) || !G.featGrid) return null;
  const f = G.featGrid[y * W + x];
  return f ? G.feats[f - 1] : null;
}
export function nodeAt(x: number, y: number): ResNode | null {
  if (!inB(x, y)) return null;
  const n = G.nodeGrid[y * W + x];
  return n ? G.nodes[n - 1] : null;
}
export function dims(type: string, rot: number): [number, number] {
  const d = BLD[type];
  return rot & 1 ? [d.h, d.w] : [d.w, d.h];
}
export const count = (t: string) => (G.L && G.L.cnt[t]) || 0;

// ---------------------------------------------------------------------------
// Inventory
export const creative = () => G.S && G.S.mode === 'creative';
export function canAfford(c: Cost, mult = 1) { if (creative()) return true; for (const k in c) if ((G.S.inv[k] || 0) < c[k] * mult) return false; return true; }
export function pay(c: Cost, mult = 1) { if (creative()) return; for (const k in c) G.S.inv[k] = (G.S.inv[k] || 0) - c[k] * mult; }
export function addInv(k: string, n: number) { G.S.inv[k] = (G.S.inv[k] || 0) + n; }
export function refund(c: Cost, mult = 1) { if (creative()) return; for (const k in c) addInv(k, c[k] * mult); }
export function missingText(c: Cost, mult = 1) {
  return Object.keys(c).filter(k => (G.S.inv[k] || 0) < c[k] * mult).map(k => `${ITEMS[k].n} ${Math.floor(G.S.inv[k] || 0)}/${c[k] * mult}`).join(', ');
}

// ---------------------------------------------------------------------------
// Tiles
export function chopTree(x: number, y: number, give = true) {
  const i = y * W + x;
  if (!G.trees[i]) return 0;
  G.trees[i] = 0; G.treeRev++;
  const S = G.S, mean = diffOf(S.mode).regrow;
  S.regrow.push(i, S.time + mean * (0.5 + wrand()));
  const n = give ? (G.S.shop.pick ? 10 : 5) : 0;
  if (n) addInv('wood', n);
  S.flags.chops = (S.flags.chops || 0) + 1;
  G.fx.tile(x, y);
  G.fx.chop(x, y, n);
  return n;
}

// ---------------------------------------------------------------------------
// Placement
/** index along the front/back edge of the single output (and input) port; rotation-symmetric */
export function portIdx(e: { w: number; h: number; rot: number }) {
  const s = e.rot & 1 ? e.w : e.h;
  return e.rot < 2 ? Math.floor(s / 2) : Math.ceil(s / 2) - 1;
}
/** the one tile in front of the building where its output comes out */
export function frontTiles(e: { x: number; y: number; w: number; h: number; rot: number }): number[][] {
  const { x, y, w, h, rot } = e, k = portIdx(e);
  if (rot === 0) return [[x + w, y + k]];
  if (rot === 2) return [[x - 1, y + k]];
  if (rot === 1) return [[x + k, y + h]];
  return [[x + k, y - 1]];
}
/** the one tile behind the building that feeds its input (straight in line with the output) */
export function inPort(e: { x: number; y: number; w: number; h: number; rot: number }): number[] {
  const { x, y, w, h, rot } = e, k = portIdx(e);
  if (rot === 0) return [x - 1, y + k];
  if (rot === 2) return [x + w, y + k];
  if (rot === 1) return [x + k, y - 1];
  return [x + k, y + h];
}
/** building kinds that take items through a single input port */
export const PORTED = new Set(['machine', 'storage', 'station', 'tstation', 'port', 'drone', 'sink', 'gen']);
/** all tiles bordering the footprint, with the side of the building they touch */
export function borderTiles(e: { x: number; y: number; w: number; h: number }): number[][] {
  const out: number[][] = [];
  for (let j = 0; j < e.h; j++) { out.push([e.x + e.w, e.y + j, 0]); out.push([e.x - 1, e.y + j, 2]); }
  for (let i = 0; i < e.w; i++) { out.push([e.x + i, e.y + e.h, 1]); out.push([e.x + i, e.y - 1, 3]); }
  return out;
}

export function canPlace(type: string, x: number, y: number, rot: number, o: { free?: boolean; replaceKind?: string; z?: number } = {}): string | null {
  const d = BLD[type];
  if (!d) return 'Unknown';
  if (!G.S.unlocked.has(type) && d.kind !== 'hub') return 'Locked';
  const z = o.z || 0;
  if (z > 0 && groundOnly(type)) return 'Must be built on the ground floor';
  if (d.kind === 'lift') {
    const z2 = z + (d.dz || 0);
    if (z2 < 0 || z2 >= NL) return d.dz! > 0 ? 'Already on the top floor' : 'Already on the ground floor';
    if (!inB(x, y)) return 'Out of bounds';
    if (z2 > 0 && !hasFloor(x, y, z2)) return `The floor ${d.dz! > 0 ? 'above' : 'below'} needs a foundation here`;
    if (entAt(x, y, z2)) return `Something is in the way on the floor ${d.dz! > 0 ? 'above' : 'below'}`;
    if (z2 === 0 && (G.tiles[y * W + x] === TT.ROCK || G.nodeGrid[y * W + x])) return 'Blocked on the ground floor';
  }
  if (d.kind === 'pipe' && d.dz) {
    if (z + 1 >= NL) return 'Already on the top floor';
    if (!hasFloor(x, y, z + 1)) return 'The floor above needs a foundation here';
    if (entAt(x, y, z + 1)) return 'Something is in the way on the floor above';
  }
  const [w, h] = dims(type, rot);
  let node: ResNode | null = null;
  const grid = z === 0 ? G.grid : G.up[z];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const tx = x + i, ty = y + j;
    if (!inB(tx, ty)) return 'Out of bounds';
    if (z > 0) {
      if (!hasFloor(tx, ty, z)) return 'Needs a foundation under it (lay Foundations on this floor first)';
      if (grid && grid[ty * W + tx]) return 'Something is in the way';
      continue;
    }
    const id = G.grid[ty * W + tx];
    if (id) {
      const e = G.ents.get(id);
      if (!(o.replaceKind && e && BLD[e.type].kind === o.replaceKind)) return 'Something is in the way';
    }
    const t = G.tiles[ty * W + tx];
    if (t === TT.ROCK && d.kind !== 'rail') return 'Can\'t build on rock (only railways can tunnel through mountains)';
    if (G.featGrid && G.featGrid[ty * W + tx]) return G.feats[G.featGrid[ty * W + tx] - 1].kind === 'site' ? 'A crash site is in the way (click it to loot it)' : 'A power crystal is in the way (click it to collect it)';
    if (d.on === 'water') { if (!isWater(t)) return 'Must be placed entirely on water'; }
    else if (!d.logistic && !isLand(t)) return 'Can\'t build that on water';
    const n = G.nodeGrid[ty * W + tx];
    if (n) {
      if (!d.on || d.on === 'water') return 'Resource node in the way';
      node = G.nodes[n - 1];
    }
  }
  if (d.on && d.on !== 'water') {
    if (!node || node.x !== x || node.y !== y) return d.on === 'node' ? 'Place on an ore node' : d.on === 'oil' ? 'Place on an oil node' : 'Place on a geyser';
    if (d.on === 'node' && (node.res === 'crude_oil' || node.res === 'geyser')) return 'Miners need an ore node';
    if (d.on === 'oil' && node.res !== 'crude_oil') return 'Needs an oil node';
    if (d.on === 'geyser' && node.res !== 'geyser') return 'Needs a geyser';
  }
  if (d.kind === 'elevator') { const me = MP.teams ? MP.cur : 0; for (const x of G.ents.values()) if (BLD[x.type].kind === 'elevator' && (x.o || 0) === me) return 'Only one Space Elevator'; }
  if (d.kind === 'port' && shoreTiles(x, y, w, h) < 2) return 'Build it on the shore — it must touch a lake or the sea';
  if (TALL[type] && G.floorN) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) for (let zz = z + 1; zz < NL; zz++)
    if (hasFloor(x + i, y + j, zz) && (zz - z) * LH - 0.3 < TALL[type]) return 'Too tall to fit under the foundations above';
  if (!o.free && !canAfford(d.cost)) return 'Need: ' + missingText(d.cost);
  return null;
}

export function place(type: string, x: number, y: number, rot: number, o: { free?: boolean; quiet?: boolean; id?: number; z?: number; owner?: number } = {}): Ent {
  const d = BLD[type];
  if (!o.free) pay(d.cost);
  if (d.noRotate) rot = 0;
  const [w, h] = dims(type, rot);
  const id = o.id ?? G.nextId++;
  if (o.id) G.nextId = Math.max(G.nextId, o.id + 1);
  const e: Ent = { id, type, x, y, rot, w, h, born: o.quiet ? -99 : G.realNow, pop: 0 };
  const z = o.z || 0;
  if (z) e.z = z;
  const own = o.owner ?? (MP.teams ? MP.cur : 0);
  if (own) e.o = own;
  if (d.dz) e.z2 = z + (d.kind === 'pipe' ? 1 : d.dz);
  switch (d.kind) {
    case 'belt': case 'lift': e.items = []; e.len = 1; e.curve = -1; break;
    case 'tunnel': e.items = []; e.len = 1; e.curve = -1; e.pair = 0; e.isExit = false; break;
    case 'ptunnel': e.pair = 0; e.isExit = false; e.famt = 0; e.ffluid = null; break;
    case 'machine': e.recipe = null; e.ib = {}; e.ob = {}; e.prog = 0; e.work = false; e.eff = 0; e.st = 'idle'; e.rr = 0; e.clock = 1; e.shards = 0; e.amp = 0; e.req = 0; break;
    case 'miner': case 'extractor': e.node = nodeAt(x, y); e.ob = 0; e.tm = 0; e.st = 'work'; e.rr = 0; e.clock = 1; e.shards = 0; e.req = 0; e.eff = 0; break;
    case 'harvester': e.ob = 0; e.tm = 0; e.st = 'work'; e.rr = 0; e.req = 0; e.targets = null; break;
    case 'storage': e.store = {}; e.tot = 0; e.rr = 0; break;
    case 'sink': e.st = 'idle'; e.req = 0; e.sunk = 0; break;
    case 'splitter': e.buf = []; e.rr = 0; break;
    case 'merger': e.slot = [null, null, null, null]; e.rr = 0; break;
    case 'sorter': e.buf = []; e.rr = 0; e.filt = ['any', 'any', 'any']; break;
    case 'pipe': case 'tank': e.famt = 0; e.ffluid = null; break;
    case 'gen': e.fuelT = 0; e.fbuf = {}; e.water = 0; e.clock = 1; e.shards = 0; e.st = 'idle'; e.out = 0; e.node = nodeAt(x, y); break;
    case 'battery': e.stored = 0; break;
    case 'rail': e.pairs = 0; break;
    case 'station': e.store = {}; e.tot = 0; e.mode = 'load'; e.name = 'Station ' + (++G.S.stationSeq); e.rr = 0; e.req = 0; break;
    case 'tstation': e.store = {}; e.tot = 0; e.mode = 'load'; e.name = 'Truck Stop ' + (++G.S.stationSeq); e.rr = 0; e.req = 0; break;
    case 'outpost': e.name = 'Outpost ' + (++G.S.stationSeq); break;
    case 'port': e.store = {}; e.tot = 0; e.mode = 'load'; e.name = 'Harbor ' + (++G.S.stationSeq); e.rr = 0; e.req = 0; break;
    case 'drone': e.target = 0; e.outbox = {}; e.obTot = 0; e.inbox = {}; e.ibTot = 0; e.rr = 0; e.req = 0; e.dr = { s: 'home', t: 0, cargo: {}, n: 0 }; e.name = 'Port ' + (++G.S.stationSeq); break;
  }
  const g = gridOf(z);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (y + j) * W + x + i;
    g[k] = e.id;
    if (z === 0 && G.trees[k]) chopTree(x + i, y + j, !o.free);
  }
  if (e.z2 !== undefined) { gridOf(e.z2)[y * W + x] = e.id; if (e.z2 === 0 && G.trees[y * W + x]) chopTree(x, y, !o.free); }
  G.ents.set(e.id, e);
  if ((d.kind === 'tunnel' || d.kind === 'ptunnel') && !o.id) pairTunnel(e);
  markDirty(d.kind);
  if (!o.quiet) G.fx.placed(e);
  return e;
}

// ---------------------------------------------------------------------------
// Foundations (floor decks)
/** why a foundation can't go at (x,y) on floor z, or null */
export function floorBlocked(x: number, y: number, z: number): string | null {
  if (z < 1 || z >= NL) return 'Foundations go on floors 1–3 (press PageUp)';
  if (!inB(x, y)) return 'Out of bounds';
  const i = y * W + x;
  if (G.floor[i] & (1 << z)) return 'Already has a foundation';
  if (G.tiles[i] === TT.ROCK) return 'Not over mountains';
  for (let zz = 0; zz < z; zz++) { const e = entAt(x, y, zz); if (e && (TALL[e.type] || 0) > (z - zz) * LH - 0.3) return 'Too close to the top of ' + BLD[e.type].n; }
  return null;
}
export function setFloor(x: number, y: number, z: number, on: boolean) {
  const i = y * W + x, bit = 1 << z, had = !!(G.floor[i] & bit);
  if (on === had) return;
  if (on) { G.floor[i] |= bit; G.floorN++; } else { G.floor[i] &= ~bit; G.floorN--; }
  G.rev++;
}
export function markDirty(kind: string) {
  G.rev++;
  if (kind === 'rail') G.railRev++;
  G.dirty.links = true;
  if (kind !== 'belt' && kind !== 'rail' && kind !== 'decor') G.dirty.power = true;
  if (kind === 'pipe' || kind === 'ptunnel' || kind === 'tank' || kind === 'machine' || kind === 'extractor' || kind === 'gen') G.dirty.fluid = true;
}

function pairTunnel(e: Ent) {
  const d = BLD[e.type];
  for (let k = 1; k <= d.range; k++) {
    const t = entAt(e.x - DX[e.rot] * k, e.y - DY[e.rot] * k, e.z || 0);
    if (!t || t.type !== e.type) continue;
    if (t.rot === e.rot && !t.isExit && !t.pair) { t.pair = e.id; e.pair = t.id; e.isExit = true; }
    break;
  }
}

export function contentsOf(e: Ent): Cost {
  const c: Cost = {};
  const add = (k: string, n: number) => { if (n > 0 && !ITEMS[k].fluid) c[k] = (c[k] || 0) + n; };
  const d = BLD[e.type];
  if (e.items) for (const it of e.items) add(it.it, 1);
  if (e.ib) for (const k in e.ib) add(k, e.ib[k]);
  if (e.ob && typeof e.ob === 'object') for (const k in e.ob) add(k, e.ob[k]);
  if (d.kind === 'miner' && e.ob && e.node) add(e.node.res, e.ob);
  if (d.kind === 'harvester' && e.ob) add('wood', e.ob);
  if (e.store) for (const k in e.store) add(k, e.store[k]);
  if (e.buf) for (const k of e.buf) add(k, 1);
  if (e.slot) for (const k of e.slot) if (k) add(k, 1);
  if (e.fbuf) for (const k in e.fbuf) add(k, e.fbuf[k]);
  if (e.outbox) for (const k in e.outbox) add(k, e.outbox[k]);
  if (e.inbox) for (const k in e.inbox) add(k, e.inbox[k]);
  if (e.dr) for (const k in e.dr.cargo) add(k, e.dr.cargo[k]);
  if (e.shards) add('power_shard', e.shards);
  if (e.amp) add('amplifier', e.amp);
  return c;
}

export function canRemove(e: Ent): string | null {
  const d = BLD[e.type];
  if (d.kind === 'hub') return 'The HUB can\'t be removed';
  if (d.kind === 'rail') { for (const t of G.trains) if (t.cells.includes(e.y * W + e.x)) return 'A train is on this track'; }
  return null;
}

export function remove(e: Ent, o: { quiet?: boolean } = {}): boolean {
  if (canRemove(e)) return false;
  const d = BLD[e.type];
  refund(d.cost);
  const c = contentsOf(e);
  for (const k in c) addInv(k, c[k]);
  if (e.pair) { const p = G.ents.get(e.pair); if (p) { p.pair = 0; p.isExit = false; } }
  const g = gridOf(e.z || 0);
  for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++) g[(e.y + j) * W + e.x + i] = 0;
  if (e.z2 !== undefined) gridOf(e.z2)[e.y * W + e.x] = 0;
  G.ents.delete(e.id);
  if (d.kind === 'station' || d.kind === 'drone' || d.kind === 'tstation' || d.kind === 'port') {
    for (const t of G.trains) t.sched = t.sched.filter(s => s !== e.id);
    for (const t of G.trucks) t.sched = t.sched.filter(s => s !== e.id);
    for (const t of G.ships) t.sched = t.sched.filter((s: number) => s !== e.id);
    for (const p of G.ents.values()) if (p.target === e.id) p.target = 0;
  }
  markDirty(d.kind);
  if (!o.quiet) G.fx.removed(e);
  return true;
}

export function rotateEnt(e: Ent, dir = 1) {
  const d = BLD[e.type];
  if (d.noRotate || d.kind === 'rail' || d.kind === 'tunnel' || d.kind === 'ptunnel') return false;
  if (e.w !== e.h) return false;
  e.rot = (e.rot + dir + 4) & 3; e.pop = 1;
  markDirty(d.kind);
  return true;
}

// ---------------------------------------------------------------------------
// Rails: each rail tile holds a bitmask of "side pairs" it connects.
export const PAIRS = [[0, 2], [1, 3], [0, 1], [1, 2], [2, 3], [3, 0]];
export function pairBit(a: number, b: number) {
  for (let i = 0; i < 6; i++) { const p = PAIRS[i]; if ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) return 1 << i; }
  return 0;
}
export function railSides(pairs: number) { let s = 0; for (let i = 0; i < 6; i++) if (pairs & (1 << i)) s |= (1 << PAIRS[i][0]) | (1 << PAIRS[i][1]); return s; }
/** exits available when entering a rail tile through side `entry` */
export function railExits(pairs: number, entry: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 6; i++) if (pairs & (1 << i)) {
    const p = PAIRS[i];
    if (p[0] === entry) out.push(p[1]); else if (p[1] === entry) out.push(p[0]);
  }
  return out;
}
export function rotatePairs(pairs: number, r: number) {
  let o = 0;
  for (let i = 0; i < 6; i++) if (pairs & (1 << i)) o |= pairBit((PAIRS[i][0] + r) & 3, (PAIRS[i][1] + r) & 3);
  return o;
}
export function railAt(idx: number): Ent | null {
  const id = G.grid[idx];
  if (!id) return null;
  const e = G.ents.get(id);
  return e && e.type === 'rail' ? e : null;
}
export { opp, DX, DY };

// ---------------------------------------------------------------------------
export const REGROW_MEAN: Record<string, number> = { easy: 150, hard: 1200, creative: 60 };
export function newState(seed: number, o: { name?: string; mode?: string; size?: number; dayNight?: boolean } = {}): State {
  const mode = o.mode || 'easy';
  const inv: Record<string, number> = { ...diffOf(mode).kit };
  const S: State = {
    seed, inv, unlocked: new Set(START_UNLOCKS), done: new Set(), maxTier: 0, elev: {}, time: 0, won: false,
    flags: {}, delivered: {}, speed: 1, points: 0, coupons: 0, couponsEarned: 0, shop: {}, stationSeq: 0, trainSeq: 0,
    name: o.name || 'New World', mode, size: o.size || 1024, regrow: [],
    dayNight: o.dayNight !== false, genV: 6, portsV: 1, lenV: 1, lines: [], looted: [], alts: [], altOffer: null, ach: {}, made: {}, discN: null, discF: null, truckSeq: 0, lineSeq: 0,
  };
  if (mode === 'creative') {
    for (const k in BLD) S.unlocked.add(k);
    for (const k in RECIPES) S.unlocked.add(k);
    for (const k in ITEMS) S.inv[k] = 999999;
    S.maxTier = 7; S.flags.tutDone = 1;
  }
  return S;
}
/** regrow chopped trees whose time has come (called about once a second) */
export function tickRegrow() {
  const S = G.S, q = S.regrow;
  if (!q || !q.length) return;
  const keep: number[] = [];
  for (let k = 0; k < q.length; k += 2) {
    const i = q[k], due = q[k + 1];
    if (due > S.time) { keep.push(i, due); continue; }
    if (G.trees[i] || G.grid[i] || G.nodeGrid[i] || !isLand(G.tiles[i])) continue;
    G.trees[i] = 1; G.treeRev++;
    G.fx.tile(i % W, Math.floor(i / W));
  }
  S.regrow = keep;
}
let terrainKey = '', featGrid0: Int32Array | null = null, baseNodes = 0;
export function resetWorld(seed: number, S?: State, keepTerrain = false) {
  S = S || newState(seed);
  if (!S.regrow) S.regrow = [];
  if (!S.size) S.size = 1024;
  if (!S.mode) S.mode = 'easy';
  if (!S.name) S.name = 'My World';
  if (S.dayNight === undefined) S.dayNight = true;
  if (!S.lines) S.lines = [];
  if (!S.looted) S.looted = [];
  if (!S.alts) S.alts = [];
  if (S.altOffer === undefined) S.altOffer = null;
  if (!S.ach) S.ach = {};
  if (!S.made) S.made = {};
  if (S.discN === undefined) S.discN = null;
  if (S.discF === undefined) S.discF = null;
  S.truckSeq = S.truckSeq || 0; S.lineSeq = S.lineSeq || 0; S.shipSeq = S.shipSeq || 0;
  setWorldSize(gridFor(S.size, S.genV || 1));
  const mode = S.mode;
  applyGameLength(tier => tierMult(mode, tier), !S.lenV);
  const same = keepTerrain && G.tiles && terrainKey === `${seed}|${S.mode}|${S.genV}|${S.size}`;
  const t = same ? { tiles: G.tiles, trees: G.trees0.slice(), nodes: G.nodes, nodeGrid: G.nodeGrid } : genTerrain(seed, S.mode, S.genV || 1, S.size);
  const f = same ? { feats: G.feats, grid: featGrid0!.slice() } : genFeatures(seed, t.tiles, t.trees, t.nodeGrid);
  terrainKey = `${seed}|${S.mode}|${S.genV}|${S.size}`;
  if (!same) featGrid0 = f.grid.slice();
  G.feats = f.feats; G.featGrid = f.grid;
  for (const id of S.looted) { const fe = G.feats[id - 1]; if (fe) for (let j = 0; j < fe.w; j++) for (let i = 0; i < fe.w; i++) G.featGrid[(fe.y + j) * W + fe.x + i] = 0; }
  G.disc = new Uint8Array(t.nodes.length); G.fdisc = new Uint8Array(G.feats.length); G.pings = [];
  if (same) { for (let k = baseNodes; k < t.nodes.length; k++) { const n = t.nodes[k]; for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) t.nodeGrid[(n.y + j) * W + n.x + i] = 0; } t.nodes.length = baseNodes; }
  else baseNodes = t.nodes.length;
  G.tiles = t.tiles; G.trees = t.trees; G.trees0 = t.trees.slice(); G.nodes = t.nodes; G.nodeGrid = t.nodeGrid;
  // resource nodes added for online spawns (not part of the generated terrain)
  for (const [x, y, res, p] of (S as any).xn || []) applyExtraNode(x, y, res, p);
  G.ents = new Map(); G.grid = new Int32Array(W * H); G.up = [null, null, null, null]; G.floor = new Uint8Array(W * H); G.floorN = 0; G.nextId = 1; G.trains = []; G.trainOcc = new Map(); G.trucks = []; G.ships = [];
  G.covGrid = null;
  G.S = S;
  G.dirty = { links: true, power: true, fluid: true };
  G.rev++; G.treeRev++;
  if (S.mode === 'creative') for (const k in BLD) S.unlocked.add(k);
}
export function newWorld(seed: number, o: { name?: string; mode?: string; size?: number; dayNight?: boolean } = {}) {
  clearTeams();
  resetWorld(seed, newState(seed, o));
  place('hub', HX, HY, 0, { free: true, quiet: true });
}
