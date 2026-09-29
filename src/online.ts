// Online worlds: join codes, creating a server world, and spawning new players far apart with a fair start.
// Pure game logic — used by the server (to run the world) and by the client (to read team info).
import { BLD, ITEMS } from './data';
import { biomeAtTiles, isLand, TT, W, H } from './terrain';
import { addTeam, enableTeams, MP, TeamInfo } from './teams';
import { canPlace, G, newState, place, resetWorld } from './world';

// ---------------------------------------------------------------------------
// Join codes: 8 characters, no look-alikes (0/O, 1/I/L)
export const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode(rand: () => number = Math.random) { let s = ''; for (let i = 0; i < 8; i++) s += CODE_ABC[Math.floor(rand() * CODE_ABC.length)]; return s; }
export const fmtCode = (c: string) => c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c;
/** tidy what a player typed into a code (or '' if it can't be one) */
export function normCode(s: string) {
  const c = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 8 && [...c].every(ch => CODE_ABC.includes(ch)) ? c : '';
}

export const PLAYER_COLS = ['#e8543f', '#3a7bd5', '#2fb86b', '#f2c12e', '#9b59d6', '#1fb5b5', '#ff7fb0', '#8d6e4f', '#e67e22', '#d0d4dc', '#6a8f2f', '#2c3e8f'];

// ---------------------------------------------------------------------------
/** a fresh world for a server: nobody spawned yet (team 0 is "nature" and owns nothing) */
export function createServerWorld(seed: number, o: { name: string; size: number; mode: string; dayNight: boolean }) {
  resetWorld(seed, newState(seed, o));
  enableTeams(0);
  MP.info.set(0, { id: 0, name: 'Nature', col: '#888888', leader: 0, hx: 0, hy: 0 });
}

const HUBW = 4;
function hubOK(x: number, y: number) {
  if (x < 8 || y < 8 || x > W - 12 || y > H - 12) return false;
  return !canPlace('hub', x, y, 0, { free: true, z: 0 });
}
function nodesNear(x: number, y: number, r: number, res: string) {
  let n = 0;
  for (const nd of G.nodes) if (nd.res === res && Math.abs(nd.x - x) < r && Math.abs(nd.y - y) < r && Math.hypot(nd.x - x, nd.y - y) < r && !G.grid[nd.y * W + nd.x]) n++;
  return n;
}
function waterNear(x: number, y: number, r: number) {
  for (let k = 0; k < 64; k++) { const a = k / 64 * Math.PI * 2; for (let d = 6; d < r; d += 6) { const tx = Math.round(x + Math.cos(a) * d), ty = Math.round(y + Math.sin(a) * d); if (tx >= 0 && ty >= 0 && tx < W && ty < H && (G.tiles[ty * W + tx] === TT.WATER)) return true; } }
  return false;
}

/** the best place for a new player's HUB: far from everyone else, in a biome nobody has yet, with resources nearby */
export function pickSpawn(rand: () => number = Math.random): { x: number; y: number } | null {
  const hubs = [...G.ents.values()].filter(e => BLD[e.type].kind === 'hub');
  const land = G.S.size, minSep = land * 0.16;
  const taken = new Set([...MP.info.values()].map(i => (i as any).biome).filter(Boolean));
  let best: { x: number; y: number; s: number } | null = null;
  for (let k = 0; k < 900; k++) {
    const x = Math.floor(rand() * W), y = Math.floor(rand() * H);
    const t = G.tiles[y * W + x];
    if (!isLand(t) || t === TT.ROCK) continue;
    if (!hubOK(x, y)) continue;
    let sep = Infinity;
    for (const h of hubs) sep = Math.min(sep, Math.hypot(h.x - x, h.y - y));
    if (sep < minSep * 0.45) continue;
    const iron = Math.min(3, nodesNear(x, y, 45, 'iron_ore')), cu = Math.min(2, nodesNear(x, y, 45, 'copper_ore')), li = Math.min(2, nodesNear(x, y, 45, 'limestone'));
    const coal = nodesNear(x, y, 160, 'coal') > 0 ? 1 : 0;
    const biome = biomeAtTiles(G.tiles, x + 2, y + 2);
    const s = Math.min(sep, minSep * 2) / minSep * 3 + iron + cu + li + coal + (waterNear(x, y, 60) ? 1 : 0) + (taken.has(biome) ? 0 : 2) + (biome === 'water' ? -5 : 0);
    if (!best || s > best.s) best = { x, y, s };
  }
  return best;
}

/** add a resource node that isn't part of the generated terrain (saved with the world, re-added on load) */
export function addExtraNode(x: number, y: number, res: string, p: number) {
  const S: any = G.S;
  (S.xn = S.xn || []).push([x, y, res, p]);
  applyExtraNode(x, y, res, p);
}
export function applyExtraNode(x: number, y: number, res: string, p: number) {
  const id = G.nodes.length + 1;
  G.nodes.push({ id, x, y, res, p });
  for (let j = -1; j < 3; j++) for (let i = -1; i < 3; i++) { const k = (y + j) * W + x + i; if (k >= 0 && k < W * H) G.trees[k] = 0; }
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) G.nodeGrid[(y + j) * W + x + i] = id;
  if (G.disc && G.disc.length < G.nodes.length) { const d = new Uint8Array(G.nodes.length); d.set(G.disc); G.disc = d; }
}
function nodeSpotOK(x: number, y: number) {
  for (let j = -3; j < 5; j++) for (let i = -3; i < 5; i++) {
    const tx = x + i, ty = y + j;
    if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1) return false;
    const k = ty * W + tx;
    if (G.nodeGrid[k] || G.grid[k]) return false;
    if (i >= 0 && i < 2 && j >= 0 && j < 2 && (!isLand(G.tiles[k]) || G.tiles[k] === TT.ROCK)) return false;
  }
  return true;
}
/** make sure a spawn has the basics within reach (adding nodes if the terrain didn't provide them) */
function ensureStarter(x: number, y: number, rand: () => number) {
  const cx = x + 2, cy = y + 2;
  const want: [string, number, number, number][] = [['iron_ore', 2, 45, 1], ['copper_ore', 1, 45, 1], ['limestone', 1, 45, 1], ['coal', 1, 160, 1]];
  for (const [res, n, r, p] of want) {
    let have = nodesNear(cx, cy, r, res);
    for (let k = 0; k < 400 && have < n; k++) {
      const a = rand() * Math.PI * 2, d = res === 'coal' ? 40 + rand() * 50 : 12 + rand() * 18;
      const nx = Math.round(cx + Math.cos(a) * d), ny = Math.round(cy + Math.sin(a) * d);
      if (nodeSpotOK(nx, ny)) { addExtraNode(nx, ny, res, p); have++; }
    }
  }
}

/** create a new team for a player at the best free spot; returns its info */
export function spawnTeam(id: number, name: string, col: string, leader: number, rand: () => number = Math.random): TeamInfo | null {
  const sp = pickSpawn(rand);
  if (!sp) return null;
  const biome = biomeAtTiles(G.tiles, sp.x + 2, sp.y + 2);
  const info: any = { name, col, leader, hx: sp.x, hy: sp.y, biome };
  const t = addTeam(id, info);
  ensureStarter(sp.x, sp.y, rand);
  const prev = MP.cur;
  MP.cur = id; G.S = t;
  place('hub', sp.x, sp.y, 0, { free: true, quiet: true, owner: id });
  // the area around a new base starts out explored
  t.discN = [];
  G.nodes.forEach((n, i) => { if (Math.hypot(n.x - sp.x, n.y - sp.y) < 70) t.discN.push(i); });
  t.discF = [];
  MP.cur = prev; G.S = MP.teams!.get(prev)!;
  return MP.info.get(id)!;
}
export { HUBW };

// ---------------------------------------------------------------------------
/** player `pid` joins team `to`. If they were alone, their whole base and everything they own joins too. */
export function joinTeam(pid: number, to: number) {
  const p = MP.players.get(pid), T = MP.teams!, dst = T.get(to);
  if (!p || !dst || p.team === to) return false;
  const from = p.team, src = T.get(from);
  const alone = ![...MP.players.values()].some(q => q.id !== pid && q.team === from);
  p.team = to;
  if (!alone || !src) return true;
  // hand over buildings and vehicles
  for (const e of G.ents.values()) if ((e.o || 0) === from) e.o = to;
  for (const v of [...G.trains, ...G.trucks, ...G.ships] as any[]) if ((v.o || 0) === from) v.o = to;
  // pool the two teams' stuff
  for (const k in src.inv) dst.inv[k] = (dst.inv[k] || 0) + src.inv[k];
  for (const k of src.unlocked) dst.unlocked.add(k);
  for (const k of src.done) dst.done.add(k);
  dst.maxTier = Math.max(dst.maxTier, src.maxTier);
  dst.points += src.points; dst.coupons += src.coupons; dst.couponsEarned += src.couponsEarned;
  for (const k in src.shop) dst.shop[k] = Math.max(dst.shop[k] || 0, src.shop[k]);
  for (const k in src.delivered) dst.delivered[k] = (dst.delivered[k] || 0) + src.delivered[k];
  for (const k in src.made) dst.made[k] = (dst.made[k] || 0) + src.made[k];
  for (const k in src.elev) dst.elev[k] = (dst.elev[k] || 0) + (src.elev as any)[k];
  for (const a of src.alts) if (!dst.alts.includes(a)) dst.alts.push(a);
  for (const i of src.discN || []) if (!dst.discN.includes(i)) dst.discN.push(i);
  for (const i of src.discF || []) if (!dst.discF.includes(i)) dst.discF.push(i);
  dst.lines.push(...src.lines);
  if (src.won) dst.won = true;
  T.delete(from); MP.info.delete(from); MP.paused.delete(from);
  G.dirty = { links: true, power: true, fluid: true }; G.rev++;
  return true;
}
/** player `pid` leaves their team and starts over on their own somewhere new */
export function leaveTeam(pid: number, rand: () => number = Math.random) {
  const p = MP.players.get(pid);
  if (!p) return false;
  const mates = [...MP.players.values()].filter(q => q.team === p.team && q.id !== pid);
  if (!mates.length) return false;
  const id = Math.max(0, ...MP.teams!.keys()) + 1;
  const info = spawnTeam(id, p.name, p.col, pid, rand);
  if (!info) return false;
  p.team = id;
  // the team keeps its colour: make sure the leader is still on it
  const old = MP.info.get(mates[0].team);
  if (old && old.leader === pid) old.leader = mates[0].id;
  return true;
}

/** how big an empire is: tiers, milestones, everything it has ever made and what it has built */
export function empireScore(o: number) {
  const t = MP.teams?.get(o);
  if (!t) return { score: 0, tier: 0, built: 0 };
  let made = 0;
  for (const k in t.made) made += (ITEMS[k]?.val || 1) * t.made[k];
  let built = 0;
  for (const e of G.ents.values()) if ((e.o || 0) === o) built++;
  return { score: Math.round(t.maxTier * 1000 + t.done.size * 150 + made / 40 + built * 2), tier: t.maxTier, built };
}

/** no building right next to someone else's HUB (so nobody can wall a rival in) */
export const BASE_BUFFER = 14;
export function nearRivalBase(x: number, y: number, w: number, h: number, me: number): string | null {
  if (!MP.teams) return null;
  for (const inf of MP.info.values()) {
    if (!inf.id || inf.id === me) continue;
    const bx = inf.hx, by = inf.hy;
    if (x + w > bx - BASE_BUFFER && x < bx + HUBW + BASE_BUFFER && y + h > by - BASE_BUFFER && y < by + HUBW + BASE_BUFFER)
      return `Too close to ${inf.name}'s base`;
  }
  return null;
}
