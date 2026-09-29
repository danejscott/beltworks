// One online world, running in its own worker thread (the game code keeps its state in module globals,
// so each world needs its own copy of the modules).
//
// Every 100 ms the world advances 6 ticks. Player commands received in between are applied at the start of
// the next tick, in arrival order, and broadcast with their tick numbers — every player's copy of the game
// applies exactly the same commands at exactly the same ticks, so all copies stay identical.
import { parentPort, workerData } from 'node:worker_threads';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { deserialize, serialize, stateHash } from '../src/save';
import { applyCmd, Cmd } from '../src/cmd';
import { ensureFresh, update } from '../src/sim';
import { MP } from '../src/teams';
import { createServerWorld, joinTeam, leaveTeam, PLAYER_COLS, spawnTeam } from '../src/online';
import { G } from '../src/world';
import { BLD } from '../src/data';

const { code, dir, create } = workerData as { code: string; dir: string; create?: any };
const file = join(dir, code + '.json');
const port = parentPort!;
const send = (to: number | 'all', msg: any) => port.postMessage({ to, msg });
const log = (...a: any[]) => console.log(`[${code}]`, ...a);

const STEP = 1 / 60, PER = 6, HASH_EVERY = 300;
let tick = 0;
const queue: [number, number, Cmd][] = [];          // pid, team, command (waiting for the next tick)
const conns = new Map<number, number>();           // connection id -> player id
let keys: Record<string, number> = {};             // secret player key -> player id (never sent to players)
let dirty = false, idleSince = Date.now();

// ---------------------------------------------------------------------------
// load or create
if (create) {
  createServerWorld((Math.random() * 1e9) | 0, create);
  (G.S as any).created = Date.now();
  log('created', create.name, create.size, create.mode);
  save();
} else {
  const o = JSON.parse(readFileSync(file, 'utf8'));
  deserialize(o.world);
  tick = o.tick || 0;
  keys = o.keys || {};
  log('loaded', G.S.name, 'tick', tick);
}
for (const p of MP.players.values()) p.online = false;
refreshPaused();
ensureFresh();

function refreshPaused() {
  const on = new Set<number>();
  for (const p of MP.players.values()) if (p.online) on.add(p.team);
  MP.paused.clear();
  for (const t of MP.teams!.keys()) if (!on.has(t)) MP.paused.add(t);
}
function snapshot() { return { world: serialize(), tick, paused: [...MP.paused], online: [...MP.players.values()].filter(p => p.online).map(p => p.id) }; }
function save() {
  try {
    mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp';
    writeFileSync(tmp, JSON.stringify({ ...snapshot(), keys }));
    renameSync(tmp, file);
    dirty = false;
    // an hourly backup, keeping the last 24
    const bdir = join(dir, 'backups'); mkdirSync(bdir, { recursive: true });
    const hour = new Date().toISOString().slice(0, 13).replace(/[-T:]/g, '');
    const bfile = join(bdir, `${code}-${hour}.json`);
    if (!existsSync(bfile)) {
      writeFileSync(bfile, readFileSync(file));
      const mine = readdirSync(bdir).filter(f => f.startsWith(code + '-')).sort();
      for (const f of mine.slice(0, Math.max(0, mine.length - 24))) unlinkSync(join(bdir, f));
    }
  } catch (e) { log('save failed', e); }
}
let lastResync = 0, resyncPending = false;
const invites = new Map<number, { team: number; at: number }>();
/** a player's team changed: tell them, then everyone reloads the new state */
function teamChanged(pid: number) {
  const p = MP.players.get(pid)!;
  for (const [c, id] of conns) if (id === pid) send(c, { t: 'you', team: p.team });
  dirty = true;
  refreshPaused();
  lastResync = 0;
  resyncAll();
  send('all', { t: 'players', list: players() });
}
/** everyone (server included) reloads from one snapshot, so all copies are identical from this tick on */
function resyncAll() {
  const now = Date.now();
  if (now - lastResync < 3000) { resyncPending = true; return; }
  lastResync = now; resyncPending = false;
  const snap = snapshot();
  const text = JSON.stringify(snap.world);
  deserialize(JSON.parse(text), true);
  for (const p of MP.players.values()) p.online = snap.online.includes(p.id);
  refreshPaused();
  ensureFresh();
  send('all', { t: 'snap', tick, snap: text, paused: snap.paused, online: snap.online });
}
function players() {
  return [...MP.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, col: MP.info.get(p.team)?.col || p.col, online: p.online }));
}
function presence() {
  // pausing is part of the simulation, so it travels in the command stream like everything else
  const paused = [...MP.teams!.keys()].filter(t => ![...MP.players.values()].some(p => p.online && p.team === t));
  queue.push([0, 0, { k: '_presence', paused, online: [...MP.players.values()].filter(p => p.online).map(p => p.id) }]);
  send('all', { t: 'players', list: players() });
}

// ---------------------------------------------------------------------------
port.on('message', (m: any) => {
  try { onMessage(m); } catch (e) { log('message error', m && m.k, e); }
});
function onMessage(m: any) {
  if (m.k === 'join') {
    const { conn, key, name, col } = m;
    let p = keys[key] ? MP.players.get(keys[key]) : undefined;
    if (!p) {
      const id = Math.max(0, ...MP.players.keys()) + 1;
      const team = Math.max(0, ...MP.teams!.keys()) + 1;
      // every team gets its own colour: if the one asked for is taken, use the first free one
      const used = new Set([...MP.info.values()].filter(i => i.id).map(i => i.col.toLowerCase()));
      const want = /^#[0-9a-f]{6}$/i.test(col) ? col.toLowerCase() : '';
      const c = want && !used.has(want) ? want : PLAYER_COLS.find(q => !used.has(q.toLowerCase())) || PLAYER_COLS[id % PLAYER_COLS.length];
      const info = spawnTeam(team, String(name).slice(0, 24) || 'Player', c, id);
      if (!info) { send(conn, { t: 'err', msg: 'This world is full — no room left to start a new base.' }); return; }
      p = { id, name: String(name).slice(0, 24) || 'Player', team, col: c, online: true } as any;
      keys[key] = id;
      MP.players.set(id, p!);
      log('new player', p!.name, 'team', team, 'at', info.hx, info.hy);
    } else {
      p.online = true;
      if (name) p.name = String(name).slice(0, 24);
    }
    conns.set(conn, p!.id);
    idleSince = 0;
    dirty = true;
    send(conn, { t: 'welcome', code, pid: p!.id, team: p!.team, tick });
    refreshPaused();
    resyncAll();
    send('all', { t: 'players', list: players() });
  } else if (m.k === 'leave') {
    const pid = conns.get(m.conn);
    conns.delete(m.conn);
    const p = pid ? MP.players.get(pid) : null;
    if (p && ![...conns.values()].includes(p.id)) { p.online = false; presence(); }
    if (!conns.size) idleSince = Date.now();
  } else if (m.k === 'cmd') {
    const pid = conns.get(m.conn), p = pid ? MP.players.get(pid) : null;
    if (!p || !m.c || typeof m.c.k !== 'string' || m.c.k[0] === '_') return;
    queue.push([p.id, p.team, m.c]);
  } else if (m.k === 'resync') {
    resyncAll();
  } else if (m.k === 'chat') {
    const pid = conns.get(m.conn), p = pid ? MP.players.get(pid) : null;
    if (p) send('all', { t: 'chat', from: p.name, col: MP.info.get(p.team)?.col, text: String(m.text).slice(0, 200) });
  } else if (m.k === 'team') {
    const pid = conns.get(m.conn), p = pid ? MP.players.get(pid) : null;
    if (!p) return;
    if (m.op === 'invite') {
      const q = MP.players.get(+m.pid);
      if (!q || q.team === p.team || !q.online) return;
      invites.set(q.id, { team: p.team, at: Date.now() });
      for (const [c, id] of conns) if (id === q.id) send(c, { t: 'invite', from: p.name, team: p.team, col: MP.info.get(p.team)?.col || p.col });
    } else if (m.op === 'accept') {
      const inv = invites.get(p.id);
      if (!inv || inv.team !== +m.team || Date.now() - inv.at > 120_000 || !MP.teams!.has(inv.team)) { send(m.conn, { t: 'err-soft', msg: 'That invitation has expired' }); return; }
      invites.delete(p.id);
      if (joinTeam(p.id, inv.team)) { teamChanged(p.id); log(p.name, 'joined team', inv.team); }
    } else if (m.op === 'leave') {
      if (leaveTeam(p.id)) { teamChanged(p.id); log(p.name, 'left their team'); }
    }
  } else if (m.k === 'stop') {
    save(); process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// the clock: 6 ticks every 100 ms, commands applied at the start of the next tick
let last = Date.now(), acc = 0, saveT = Date.now();
setInterval(() => {
  const now = Date.now();
  acc += now - last; last = now;
  if (acc > 2000) acc = 2000;          // after a stall, don't try to catch up forever
  if (acc < 100) return;
  acc -= 100;
  const out: [number, number, number, Cmd][] = [];
  for (let s = 0; s < PER; s++) {
    if (s === 0 && queue.length) {
      for (const [pid, team, c] of queue.splice(0)) {
        applyCmd(c, false, team);
        out.push([tick, pid, team, c]);
      }
      dirty = true;
    }
    try { update(STEP); } catch (e) { log('simulation error', e); }
    tick++;
    if (tick % HASH_EVERY === 0) send('all', { t: 'hash', tick, h: stateHash() });
  }
  send('all', { t: 'tick', n: tick, cmds: out });
  if (resyncPending && now - lastResync >= 3000) resyncAll();
  if (now - saveT > 60_000 && (dirty || conns.size)) { saveT = now; save(); }
  // nobody here for 10 minutes: save and shut this world down (it's paused anyway)
  if (!conns.size && idleSince && now - idleSince > 10 * 60_000) { save(); log('unloading'); port.postMessage({ unload: true }); process.exit(0); }
}, 25);

void BLD;
