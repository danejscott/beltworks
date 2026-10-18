import { ensureFresh, hist, rebuildFluids, resetStats, syncFluidMembers } from './sim';
import { W, H, TT } from './terrain';
import { view } from './view';
import { BLD } from './data';
import { G, place, PORTED, refund, remove, resetWorld, State } from './world';
import { clearTeams, MP, makeTeamState, teamFields, useTeam, WORLD_KEYS } from './teams';
import { convertOldRails } from './railconvert';
import { deleteWorldFile, folderReady, listFolderWorlds, readWorldFile, writeWorldFile } from './filesaves';

const KEYS = ['o', 'items', 'pair', 'isExit', 'recipe', 'ib', 'ob', 'prog', 'work', 'clock', 'shards', 'amp', 'tm', 'store', 'tot', 'mode', 'name', 'buf', 'filt', 'slot', 'famt', 'ffluid', 'fuelT', 'fbuf', 'water', 'stored', 'pairs', 'target', 'outbox', 'obTot', 'inbox', 'ibTot', 'dr', 'drs', 'sunk', 'anyIn', 'sig', 'plat', 'big', 'sv2', 'drop', 'dtot'];

const treeCache = { arr: null as any, rev: -1, list: [] as number[] };
const floorCache = { arr: null as any, rev: -1, list: [] as number[] };
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
  // foundation decks and chopped trees mean scanning every tile of the map (millions on big maps), so the lists are
  // kept between saves and only rebuilt when floors or trees actually changed (autosaves no longer stutter)
  if (floorCache.arr !== G.floor || floorCache.rev !== (G as any).floorRev) {
    const floor: number[] = [];
    if (G.floorN) for (let i = 0; i < W * H; i++) if (G.floor[i]) floor.push(i, G.floor[i]);
    floorCache.arr = G.floor; floorCache.rev = (G as any).floorRev; floorCache.list = floor;
  }
  const floor = floorCache.list;
  if (treeCache.arr !== G.trees || treeCache.rev !== G.treeRev) {
    const removed: number[] = [];
    // chopped trees: compare four tiles at a time
    const t0 = G.trees0, t1 = G.trees, n4 = (W * H) >> 2;
    const a4 = new Uint32Array(t0.buffer, t0.byteOffset, n4), b4 = new Uint32Array(t1.buffer, t1.byteOffset, n4);
    for (let q = 0; q < n4; q++) if (a4[q] & ~b4[q]) for (let i = q * 4; i < q * 4 + 4; i++) if (t0[i] && !t1[i]) removed.push(i);
    for (let i = n4 * 4; i < W * H; i++) if (t0[i] && !t1[i]) removed.push(i);
    treeCache.arr = G.trees; treeCache.rev = G.treeRev; treeCache.list = removed;
  }
  const removed = treeCache.list;
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
    ents, removed, floor, hist: hist.s, nextId: G.nextId, railV: 2,
    trains: G.trains.map(t => ({ ...t })),
    ships: G.ships.map((t: any) => ({ ...t, path: [], pi: 0, bay: -1, qspot: -1, toQueue: 0, state: t.state === 'moving' || t.state === 'queued' ? 'idle' : t.state })),
    trucks: G.trucks.map(t => ({ ...t, path: [], pi: 0, bay: -1, qspot: -1, toQueue: 0, state: t.state === 'moving' || t.state === 'queued' ? 'idle' : t.state })),
    wear: [...G.wear],
    slabs: [...G.slabs],
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
  for (const t of MP.teams ? MP.teams.values() : [S]) { if (t.unlocked.has('ship_port')) t.unlocked.add('harbor'); if (t.unlocked.has('harbor')) t.unlocked.add('slab'); }
  G.slabs = new Map();
  for (const [i, t] of o.slabs || []) { G.slabs.set(i, t); G.tiles[i] = TT.DIRT; }
  for (const i of o.removed || []) G.trees[i] = 0;
  G.treeRev++;
  // floors were removed from the game: worlds that had upper floors get their foundations' concrete back
  const fl = o.floor || [];
  let decks = 0;
  for (let k = 0; k < fl.length; k += 2) for (let z = 1; z < 4; z++) if (fl[k + 1] & (1 << z)) decks++;
  (G as any).floorRev = ((G as any).floorRev || 0) + 1;
  // worlds from before 2-wide railways: their track is rebuilt once everything else is in place (see railconvert.ts)
  const oldRails: any[] | null = o.railV !== 2 ? o.ents.filter((q: any) => q.t === 'rail') : null;
  for (const q of o.ents) {
    if (oldRails && q.t === 'rail') continue;
    // harbors built before the bigger pier keep their old 7 x 4 footprint, stations from before 2-wide track their 3 x 3
    let wh: [number, number] | undefined = q.t === 'harbor' && !q.big ? (q.r & 1 ? [4, 7] : [7, 4]) : undefined;
    if (q.t === 'station' && !q.sv2) { wh = [3, 3]; delete q.plat; }
    if (q.t === 'elevator' && !q.big) wh = [5, 5];   // (elevators are 9 x 9 now)
    const e = place(q.t, q.x, q.y, q.r, { free: true, quiet: true, id: q.i, z: q.z || 0, wh });
    for (const k of KEYS) if (q[k] !== undefined) e[k] = q[k];
    if (q.items) e.items = q.items.map(([it, pos]: any) => ({ it, pos }));
  }
  // ...and everything built on an upper floor (plus lifts) comes down: refunded with whatever it was holding
  let upper = 0;
  const cur0 = MP.cur;
  for (const e of [...G.ents.values()]) {
    if (!(e.z || 0) && BLD[e.type].kind !== 'lift' && e.type !== 'pipe_lift' && e.type !== 'foundation') continue;
    useTeam(e.o || 0);
    if (!remove(e, { quiet: true })) { for (const g of [G.grid, ...(G.up || [])]) if (g) for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++) if (g[(e.y + j) * W + e.x + i] === e.id) g[(e.y + j) * W + e.x + i] = 0; G.ents.delete(e.id); }
    upper++;
  }
  if (decks) { useTeam(0); refund(BLD.foundation.cost, decks); }
  useTeam(cur0);
  if (upper || decks) { G.floor.fill(0); G.floorN = 0; G.dirty.power = G.dirty.fluid = G.dirty.links = true; setTimeout(() => G.fx.toast(`Floors were removed from Beltworks: ${upper} upper-floor building${upper === 1 ? '' : 's'} and ${decks} foundation${decks === 1 ? '' : 's'} were refunded to your inventory.`, ''), 1600); }
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
  G.wear = new Map(o.wear || []);
  G.ships = (o.ships || []).map((t: any) => ({ ...t, retryT: 0 }));
  if (oldRails && (oldRails.length || G.trains.length)) {
    const r = convertOldRails(oldRails);
    const bits = [`${r.pieces} pieces of 2-wide track`];
    if (r.lost) bits.push(`${r.lost} old track tiles didn't fit (refunded)`);
    if (r.trainsLost) bits.push(`${r.trainsLost} train${r.trainsLost > 1 ? 's' : ''} had no room and went back to your inventory`);
    if (r.rebuilt) bits.push(`${r.rebuilt} Quick Route loop${r.rebuilt > 1 ? 's were' : ' was'} rebuilt 2-wide (free)`);
    if (r.linesLost) bits.push(`${r.linesLost} Quick Route loop${r.linesLost > 1 ? 's' : ''} couldn't be rebuilt — use Quick Route again`);
    setTimeout(() => G.fx.toast(`🚂 Railways are 2 tiles wide now — your track was rebuilt: ${bits.join(' · ')}.`, ''), 2200);
  }
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
    // (saves leave out zeros, so 0 and 'not set' must fingerprint the same)
    if (e.prog) mix(e.prog);
    if (e.tm) mix(e.tm);
    if (typeof e.ob === 'number') { if (e.ob) mix(e.ob); } else mixO(e.ob);
    if (e.ib) mixO(e.ib);
    if (e.tot) mix(e.tot);
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
// one connection kept open, so a save started as the tab closes can write straight away
let dbP: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbP) { dbP = openDb(); dbP.then(d => { d.onclose = () => { dbP = null; }; d.onversionchange = () => { d.close(); dbP = null; }; }, () => { dbP = null; }); }
  return dbP;
}
// ask the browser not to clear saved worlds when the disk gets full
try { (navigator as any).storage?.persist?.(); } catch { }
// ---- the same world open in two tabs would overwrite each other's progress: the newest tab wins, older ones stop saving
const TAB = Math.random().toString(36).slice(2);
let chan: BroadcastChannel | null = null;
export const saveState = { blocked: '', lastOK: 0, failed: 0, fileOK: 0, fileFailed: 0 };
try {
  chan = new BroadcastChannel('beltworks-saves');
  chan.onmessage = ev => {
    const m = ev.data;
    if (m && m.t === 'open' && m.tab !== TAB && m.id && m.id === slot.id) {
      saveState.blocked = m.id;
      G.fx.toast('⚠ This world was opened in another tab or window. This one has stopped saving so it cannot overwrite that progress — keep playing over there.', 'bad');
    }
  };
} catch { }
/** this tab is now playing world id: tell any other tab with it open to stop saving it */
export function claimSlot(id: string) { saveState.blocked = ''; try { chan?.postMessage({ t: 'open', id, tab: TAB }); } catch { } }
function openDb(): Promise<IDBDatabase> {
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
  if (saveState.blocked === id) return false;
  try {
    const data = JSON.stringify(serialize());
    const d = await db();
    const old: WorldMeta | undefined = await req(d.transaction('meta', 'readonly').objectStore('meta').get(id));
    const meta = metaNow(id, old?.created);
    await new Promise<void>((res, rej) => {
      const tx = d.transaction(['saves', 'meta'], 'readwrite');
      tx.objectStore('saves').put(data, id);
      tx.objectStore('meta').put(meta, id);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('save aborted'));
    });
    saveState.lastOK = Date.now(); saveState.failed = 0;
    // and the copy in the save folder (survives clearing the browser's data)
    if (folderReady()) writeWorldFile(meta, data).then(() => { saveState.fileOK = Date.now(); saveState.fileFailed = 0; }, e => {
      console.warn('save file failed', e);
      if (saveState.fileFailed++ % 10 === 0) G.fx.toast(`⚠ Couldn't write the save file to your save folder (${String(e?.name || e).slice(0, 50)}). Your world is still saved in the browser.`, 'bad');
    });
    return true;
  } catch (e) {
    console.warn('save failed', e);
    // say so (once in a while) instead of failing quietly
    if (saveState.failed++ % 10 === 0) G.fx.toast(`⚠ Couldn't save your world (${String((e as any)?.name || e).slice(0, 60)}). Use Menu → Export save to keep a copy.`, 'bad');
    return false;
  }
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
    // plus the worlds in the save folder (newest copy wins; worlds only in the folder show up too)
    const byId = new Map(metas.map(m => [m.id, m]));
    for (const f of await listFolderWorlds()) {
      const have = byId.get(f.id);
      if (!have || f.updated > have.updated) byId.set(f.id, { id: f.id, name: f.name, mode: f.mode, size: f.size, tier: f.tier, time: f.time, updated: f.updated, created: f.created, fromFile: true } as any);
    }
    return [...byId.values()].sort((a, b) => b.updated - a.updated);
  } catch (e) { console.warn(e); return []; }
}
/** copy every world kept in the browser into the save folder (when a folder is first chosen) */
export async function copyAllToFolder(): Promise<number> {
  if (!folderReady()) return 0;
  let n = 0;
  try {
    const d = await db();
    const metas: WorldMeta[] = await req(d.transaction('meta', 'readonly').objectStore('meta').getAll());
    for (const m of metas) {
      const data: string = await req(d.transaction('saves', 'readonly').objectStore('saves').get(m.id));
      if (data) { await writeWorldFile(m, data); n++; }
    }
  } catch (e) { console.warn(e); }
  return n;
}
export async function loadWorld(id: string): Promise<boolean> {
  try {
    const d = await db();
    let data: string | undefined = await req(d.transaction('saves', 'readonly').objectStore('saves').get(id));
    // the save folder's copy is newer (or the browser's copy was cleared): use the file
    const m0: WorldMeta | undefined = await req(d.transaction('meta', 'readonly').objectStore('meta').get(id));
    const fileMeta = (await listFolderWorlds()).find(f => f.id === id);
    let o: any = null;
    if (fileMeta && (!data || !m0 || fileMeta.updated > m0.updated)) o = await readWorldFile(id);
    if (!o) { if (!data) return false; o = JSON.parse(data); }
    if (o.S && !o.S.name) {
      const m: WorldMeta = await req(d.transaction('meta', 'readonly').objectStore('meta').get(id));
      if (m) o.S.name = m.name;
    }
    deserialize(o);
    slot.id = id;
    claimSlot(id);
    return true;
  } catch (e) { console.warn('load failed', e); return false; }
}
export async function deleteWorld(id: string) {
  try {
    const d = await db();
    await new Promise<void>((res) => { const tx = d.transaction(['saves', 'meta', 'frames'], 'readwrite'); tx.objectStore('saves').delete(id); tx.objectStore('meta').delete(id); tx.objectStore('frames').delete(id); tx.oncomplete = () => res(); });
  } catch { }
  await deleteWorldFile(id).catch(() => { });
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
      try { deserialize(JSON.parse(t)); slot.id = newSlotId(); claimSlot(slot.id); if (!G.S.name) G.S.name = f.name.replace(/\.json$/i, ''); await saveGame(); cb(true); }
      catch (e) { console.error(e); cb(false); }
    });
  };
  inp.click();
}

// blueprint library (shared across worlds)
export function loadBlueprints(): any[] { try { return JSON.parse(localStorage.getItem('bw-blueprints') || '[]'); } catch { return []; } }
export function storeBlueprints(list: any[]) { try { localStorage.setItem('bw-blueprints', JSON.stringify(list)); } catch { } }
