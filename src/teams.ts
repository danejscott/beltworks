// Teams: online worlds hold several players who compete. Each team has its own inventory, milestones, research,
// shop upgrades, stats and crafting queue; the terrain, clock and ID counters belong to the world.
// Single-player worlds never create teams: G.teams stays null and G.S is the one and only state.
import { START_UNLOCKS } from './data';
import { diffOf } from './difficulty';
import { hist, stats } from './sim';
import { G, State } from './world';

/** fields that belong to the whole world (shared by every team's view of the state) */
export const WORLD_KEYS = ['seed', 'time', 'speed', 'stationSeq', 'trainSeq', 'truckSeq', 'lineSeq', 'shipSeq', 'name', 'mode', 'size', 'regrow', 'dayNight', 'looted', 'genV', 'portsV', 'lenV', 'rngS', 'xn', 'depV', 'dep', 'depT', 'season', 'seasons'] as const;

export interface Player { id: number; name: string; team: number; col: string; online: boolean }
export interface TeamInfo { id: number; name: string; col: string; leader: number; hx: number; hy: number }

interface TeamExtra { P: any; C: any; D: any; hist: any[] }
const extra = new Map<number, TeamExtra>();

export const MP = {
  teams: null as Map<number, State> | null,   // team id -> that team's state (null = single-player)
  info: new Map<number, TeamInfo>(),
  players: new Map<number, Player>(),
  world: null as any,                         // the shared world fields
  cur: 0,                                     // whose context the simulation is running in
  me: 0,                                      // the local player's id
  myTeam: 0,
  paused: new Set<number>(),                  // teams with nobody online: their factories stand still
};

/** a team state whose world fields read and write the shared world object */
export function makeTeamState(world: any, base: Partial<State>): State {
  const t: any = {};
  for (const k of WORLD_KEYS) Object.defineProperty(t, k, { get: () => world[k], set: v => { world[k] = v; }, enumerable: false });
  Object.assign(t, {
    inv: { ...diffOf(world.mode).kit }, unlocked: new Set(START_UNLOCKS), done: new Set(), maxTier: 0, elev: {}, won: false,
    flags: {}, delivered: {}, points: 0, coupons: 0, couponsEarned: 0, shop: {}, lines: [], alts: [], altOffer: null,
    ach: {}, made: {}, discN: [], discF: [], playT: 0, msT: {}, tierT: {},
  }, base);
  return t as State;
}
/** the plain per-team fields of a team state (for saving) */
export function teamFields(t: State) {
  const o: any = {};
  for (const k of Object.keys(t)) o[k] = (t as any)[k];
  o.unlocked = [...t.unlocked]; o.done = [...t.done];
  delete o.cq;
  return o;
}

/** state of the team that owns something (single-player: the one state) */
export function TS(o: number | undefined): State {
  if (!MP.teams) return G.S;
  return MP.teams.get(o || 0) || G.S;
}
/** switch the simulation context to team o (stats, inventory, etc.) */
export function useTeam(o: number) {
  if (!MP.teams || o === MP.cur) return;
  const t = MP.teams.get(o);
  if (!t) return;
  // park the current team's stats
  let x = extra.get(MP.cur);
  if (!x) extra.set(MP.cur, x = { P: null, C: null, D: null, hist: [] });
  x.P = stats.P; x.C = stats.C; x.D = stats.D; x.hist = hist.s;
  let y = extra.get(o);
  if (!y) extra.set(o, y = { P: {}, C: {}, D: {}, hist: [] });
  stats.P = y.P; stats.C = y.C; stats.D = y.D; hist.s = y.hist;
  MP.cur = o; G.S = t;
}
/** run f in team o's context, then return to the previous one */
export function asTeam<T>(o: number, f: () => T): T {
  if (!MP.teams) return f();
  const prev = MP.cur;
  useTeam(o);
  try { return f(); } finally { useTeam(prev); }
}
/** is the current simulation context the local player's team? (feedback like toasts only shows for them) */
export const isMine = () => !MP.teams || MP.cur === MP.myTeam;
export const teamOf = (e: { o?: number }) => e.o || 0;
export const isPaused = (o: number | undefined) => MP.paused.size > 0 && MP.paused.has(o || 0);
/** vehicles and drone ports: switch to their owner's context; false = paused (skip it) */
export function vctx(v: { o?: number }): boolean {
  if (!MP.teams) return true;
  const o = v.o || 0;
  if (MP.paused.has(o)) return false;
  if (o !== MP.cur) useTeam(o);
  return true;
}
export const teamCol = (o: number | undefined) => MP.info.get(o || 0)?.col || '#f39c12';

/** leave team mode (back to single-player) */
export function clearTeams() {
  MP.teams = null; MP.info.clear(); MP.players.clear(); MP.world = null; MP.cur = 0; MP.me = 0; MP.myTeam = 0; MP.paused.clear(); extra.clear();
}
/** turn the current world into a team world; what the single player had becomes team `id` */
export function enableTeams(id = 0) {
  extra.clear();
  const S: any = G.S, world: any = {};
  for (const k of WORLD_KEYS) world[k] = S[k];
  const base: any = {};
  for (const k of Object.keys(S)) if (!(WORLD_KEYS as readonly string[]).includes(k)) base[k] = S[k];
  MP.world = world; MP.teams = new Map();
  const t = makeTeamState(world, base);
  MP.teams.set(id, t);
  MP.cur = id; MP.myTeam = id; G.S = t;
  for (const e of G.ents.values()) if (!e.o && id) e.o = id;
  return t;
}
/** a new team with a fresh start (starting kit, nothing unlocked beyond the basics) */
export function addTeam(id: number, info: Omit<TeamInfo, 'id'>, base: Partial<State> = {}) {
  const t = makeTeamState(MP.world, base);
  if (MP.world.mode === 'creative') {
    // creative servers: everything unlocked for everyone
    for (const k of (G.S.unlocked as Set<string>)) t.unlocked.add(k);
    t.maxTier = 7; t.flags.tutDone = 1;
  }
  MP.teams!.set(id, t);
  MP.info.set(id, { id, ...info });
  return t;
}

// ---------------------------------------------------------------------------
// Deterministic randomness: every copy of the simulation must roll the same numbers
/** a random number from the world's own generator (mulberry32 on a saved seed) */
export function wrand(): number {
  const S: any = G.S;
  let a = (S.rngS = ((S.rngS ?? (S.seed * 2654435761)) + 0x6D2B79F5) | 0);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}
