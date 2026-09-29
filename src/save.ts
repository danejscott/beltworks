import { ensureFresh, hist, rebuildFluids, resetStats, syncFluidMembers } from './sim';
import { W, H } from './terrain';
import { view } from './view';
import { BLD } from './data';
import { G, place, PORTED, remove, resetWorld, State } from './world';
import { clearTeams, MP, makeTeamState, teamFields, WORLD_KEYS } from './teams';

const KEYS = ['o', 'items', 'pair', 'isExit', 'recipe', 'ib', 'ob', 'prog', 'work', 'clock', 'shards', 'amp', 'tm', 'store', 'tot', 'mode', 'name', 'buf', 'filt', 'slot', 'famt', 'ffluid', 'fuelT', 'fbuf', 'water', 'stored', 'pairs', 'target', 'outbox', 'obTot', 'inbox', 'ibTot', 'dr', 'sunk', 'anyIn', 'sig'];

export function serialize() {
  ensureFresh();
  syncFluidMembers();
  const S = G.S;
  const ents: any[] = [];
  for (const e of G.ents.values()) {
    const o: any = { i: e.id, t: e.type, x: e.x, y: e.y, r: e.rot };
    if (e.z) o.z = e.z;
    for (const k of KEYS) if (e[k] !== undefined && e[k] !== null && e[k] !== 0 && e[k] !== false) o[k] = e[k];
    if (o.items) o.items = e.items.map((it: any) => [it.it, Math.round(it.pos * 1000) / 1000]);
    ents.push(o);
  }
  const floor: number[] = [];
  if (G.floorN) for (let i = 0; i < W * H; i++) if (G.floor[i]) floor.push(i, G.floor[i]);
  const removed: number[] = [];
  for (let i = 0; i < W * H; i++) if (G.trees0[i] && !G.trees[i]) removed.push(i);
  let mp: any;
  if (MP.teams) {
    // team world: the shared world fields, then each team's own state
    mp = {
      teams: [...MP.teams.entries()].map(([id, t]) => [id, teamFields(t)]),
      info: [...MP.info.values()], players: [...MP.players.values()].map(p => ({ ...p })), paused: [...MP.paused],
    };
  }
  const plain = MP.teams ? { ...MP.world, unlocked: [], done: [] } : { ...S, unlocked: [...S.unlocked], done: [...S.done] };
  delete (plain as any).cq;
  return {
    v: 2, mp,
    S: plain,
    ents, removed, floor, hist: hist.s, nextId: G.nextId,
    trains: G.trains.map(t => ({ ...t })),
    ships: G.ships.map((t: any) => ({ ...t, path: [], pi: 0, state: t.state === 'moving' ? 'idle' : t.state })),
    trucks: G.trucks.map(t => ({ ...t, path: [], pi: 0, state: t.state === 'moving' ? 'idle' : t.state })),
    cam: { ...view.cam },
  };
}
export function deserialize(o: any, keepTerrain = false) {
  let S: State = { ...o.S, unlocked: new Set(o.S.unlocked), done: new Set(o.S.done) };
  if (o.mp) {
    // team world: rebuild every team's state around one shared world object
    const world: any = {};
    for (const k of WORLD_KEYS) world[k] = (o.S as any)[k];
    MP.world = world; MP.teams = new Map(); MP.info.clear(); MP.players.clear();
    for (const [id, f] of o.mp.teams) MP.teams.set(id, makeTeamState(world, { ...f, unlocked: new Set(f.unlocked), done: new Set(f.done) }));
    for (const i of o.mp.info || []) MP.info.set(i.id, i);
    for (const p of o.mp.players || []) MP.players.set(p.id, p);
    MP.paused = new Set(o.mp.paused || []);
    const first = MP.teams.has(MP.myTeam) ? MP.myTeam : MP.teams.keys().next().value ?? 0;
    S = MP.teams.get(first)!; MP.cur = first;
  } else clearTeams();
  resetWorld(S.seed, S, keepTerrain);
  for (const i of o.removed || []) G.trees[i] = 0;
  const fl = o.floor || [];
  for (let k = 0; k < fl.length; k += 2) { G.floor[fl[k]] = fl[k + 1]; for (let z = 1; z < 4; z++) if (fl[k + 1] & (1 << z)) G.floorN++; }
  for (const q of o.ents) {
    const e = place(q.t, q.x, q.y, q.r, { free: true, quiet: true, id: q.i, z: q.z || 0 });
    for (const k of KEYS) if (q[k] !== undefined) e[k] = q[k];
    if (q.items) e.items = q.items.map(([it, pos]: any) => ({ it, pos }));
  }
  // worlds saved before biomes existed may have miners where no node exists any more: refund them
  let orphans = 0;
  for (const e of [...G.ents.values()]) {
    const d = BLD[e.type];
    if ((d.kind === 'miner' || (d.on && d.on !== 'water')) && !e.node) {
      e.ob = 0;  // its buffered ore has no known type any more
      try { if (remove(e, { quiet: true })) orphans++; } catch (err) { console.warn('could not remove orphaned miner', err); }
    }
  }
  // worlds built before single input ports: keep their existing machines accepting belts from any side
  if (!S.portsV) {
    for (const e of G.ents.values()) if (PORTED.has(BLD[e.type].kind)) e.anyIn = 1;
    S.portsV = 1;
  }
  if (orphans) setTimeout(() => G.fx.toast(`${orphans} miner${orphans > 1 ? 's' : ''} lost their resource node after the world update and were refunded.`, ''), 1500);
  G.nextId = Math.max(G.nextId, o.nextId || 1);
  G.trains = (o.trains || []).map((t: any) => ({ ...t }));
  G.trucks = (o.trucks || []).map((t: any) => ({ ...t, retryT: 0 }));
  G.ships = (o.ships || []).map((t: any) => ({ ...t, retryT: 0 }));
  if (o.cam) Object.assign(view.cam, o.cam);
  G.dirty = { links: true, power: true, fluid: true };
  G.fnets = []; G.pnets = [];
  resetStats();
  hist.s = Array.isArray(o.hist) ? o.hist.slice(-hist.keep) : [];
  ensureFresh();
  // restore fluid amounts from members
  rebuildFluids();
}

/**
 * A fingerprint of everything the simulation depends on. Every copy of an online world computes it at the
 * same tick; if a copy's fingerprint differs from the server's, that copy has drifted and reloads.
 */
export function stateHash(): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 0x01000193); };
  const mixS = (s: string) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } };
  const mixO = (o: any) => { if (!o) return; for (const k of Object.keys(o).sort()) { mixS(k); mix(+o[k] || 0); } };
  mix(G.ents.size); mix(G.nextId); mix(G.S.time);
  for (const e of G.ents.values()) {
    mix(e.id); mix(e.rot);
    if (e.items) { mix(e.items.length); for (const it of e.items) mix(it.pos); }
    if (e.prog !== undefined) mix(e.prog);
    if (e.tm !== undefined) mix(e.tm);
    if (typeof e.ob === 'number') mix(e.ob); else mixO(e.ob);
    if (e.ib) mixO(e.ib);
    if (e.tot !== undefined) mix(e.tot);
    if (e.famt) mix(e.famt);
    if (e.fuelT) mix(e.fuelT);
    if (e.stored) mix(e.stored);
  }
  for (const t of G.trains) { mix(t.id); mix(t.frac); mix(t.tot); mix(t.cells[0]); }
  for (const t of G.trucks) { mix(t.id); mix(t.x); mix(t.y); mix(t.tot); }
  for (const t of G.ships) { mix(t.id); mix(t.x); mix(t.y); mix(t.tot); }
  const teams = MP.teams ? [...MP.teams.values()] : [G.S];
  for (const t of teams) { mixO(t.inv); mix(t.points); mix(t.done.size); }
  return h >>> 0;
}

// --- IndexedDB storage: one record per world ('saves') plus a small summary ('meta')
export interface WorldMeta { id: string; name: string; mode: string; size: number; tier: number; time: number; updated: number; created: number }
export const slot = { id: null as string | null };
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('beltworks', 3);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('saves')) d.createObjectStore('saves');
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      if (!d.objectStoreNames.contains('frames')) d.createObjectStore('frames');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function req<T>(r: IDBRequest<T>): Promise<T> { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
export const newSlotId = () => 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
function metaNow(id: string, created?: number): WorldMeta {
  const S = G.S;
  return { id, name: S.name || 'My World', mode: S.mode || 'easy', size: S.size || 1024, tier: S.maxTier, time: S.time, updated: Date.now(), created: created || Date.now() };
}
export async function saveGame() {
  if (!slot.id) return false;
  const id = slot.id;
  const data = JSON.stringify(serialize());
  try {
    const d = await db();
    const old: WorldMeta | undefined = await req(d.transaction('meta', 'readonly').objectStore('meta').get(id));
    await new Promise<void>((res, rej) => {
      const tx = d.transaction(['saves', 'meta'], 'readwrite');
      tx.objectStore('saves').put(data, id);
      tx.objectStore('meta').put(metaNow(id, old?.created), id);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch (e) { console.warn('save failed', e); return false; }
}
export async function listWorlds(): Promise<WorldMeta[]> {
  try {
    const d = await db();
    let metas: WorldMeta[] = await req(d.transaction('meta', 'readonly').objectStore('meta').getAll());
    if (!metas.length) {
      // migrate the old single autosave, if any
      const old: string = await req(d.transaction('saves', 'readonly').objectStore('saves').get('auto'));
      if (old) {
        const o = JSON.parse(old);
        const m: WorldMeta = { id: 'auto', name: 'My First World', mode: o.S.mode || 'easy', size: o.S.size || 1024, tier: o.S.maxTier || 0, time: o.S.time || 0, updated: Date.now(), created: Date.now() };
        await new Promise<void>((res) => { const tx = d.transaction('meta', 'readwrite'); tx.objectStore('meta').put(m, 'auto'); tx.oncomplete = () => res(); });
        metas = [m];
      }
    }
    return metas.sort((a, b) => b.updated - a.updated);
  } catch (e) { console.warn(e); return []; }
}
export async function loadWorld(id: string): Promise<boolean> {
  try {
    const d = await db();
    const data: string = await req(d.transaction('saves', 'readonly').objectStore('saves').get(id));
    if (!data) return false;
    const o = JSON.parse(data);
    if (o.S && !o.S.name) {
      const m: WorldMeta = await req(d.transaction('meta', 'readonly').objectStore('meta').get(id));
      if (m) o.S.name = m.name;
    }
    deserialize(o);
    slot.id = id;
    return true;
  } catch (e) { console.warn('load failed', e); return false; }
}
export async function deleteWorld(id: string) {
  try {
    const d = await db();
    await new Promise<void>((res) => { const tx = d.transaction(['saves', 'meta', 'frames'], 'readwrite'); tx.objectStore('saves').delete(id); tx.objectStore('meta').delete(id); tx.objectStore('frames').delete(id); tx.oncomplete = () => res(); });
  } catch { }
}
// ---- timelapse frames: one small image of the factory every few minutes (at most 120, thinned evenly)
export async function addFrame(id: string, url: string) {
  try {
    const d = await db();
    const list: string[] = (await req(d.transaction('frames', 'readonly').objectStore('frames').get(id))) || [];
    list.push(url);
    const thin = list.length > 120 ? list.filter((_, i) => i % 2 === 0 || i === list.length - 1) : list;
    await new Promise<void>((res, rej) => { const tx = d.transaction('frames', 'readwrite'); tx.objectStore('frames').put(thin, id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  } catch (e) { console.warn('timelapse frame not saved', e); }
}
export async function getFrames(id: string): Promise<string[]> {
  try { const d = await db(); return (await req(d.transaction('frames', 'readonly').objectStore('frames').get(id))) || []; } catch { return []; }
}
export function exportSave() {
  const blob = new Blob([JSON.stringify(serialize())], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `beltworks-${(G.S.name || 'world').replace(/[^a-z0-9]+/gi, '-')}-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
/** import a save file as a brand-new world slot */
export function importSave(cb: (ok: boolean) => void) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files?.[0]; if (!f) return;
    f.text().then(async t => {
      try { deserialize(JSON.parse(t)); slot.id = newSlotId(); if (!G.S.name) G.S.name = f.name.replace(/\.json$/i, ''); await saveGame(); cb(true); }
      catch (e) { console.error(e); cb(false); }
    });
  };
  inp.click();
}

// blueprint library (shared across worlds)
export function loadBlueprints(): any[] { try { return JSON.parse(localStorage.getItem('bw-blueprints') || '[]'); } catch { return []; } }
export function storeBlueprints(list: any[]) { try { localStorage.setItem('bw-blueprints', JSON.stringify(list)); } catch { } }
