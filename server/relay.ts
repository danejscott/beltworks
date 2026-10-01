// The world relay: one per online world. It does NOT run the game — every player's browser does. The relay:
//  - keeps the world's settings, its players (and their secret keys), the latest save and the actions since it
//  - runs the tick clock while anyone is connected, stamping each player's action with the tick it applies at
//  - asks the longest-connected player for a fresh (compressed) save every couple of minutes
//  - hands a joiner the latest save plus the actions since, so they catch up and then play in lockstep
//  - compares the players' world fingerprints and reloads anyone who has drifted
// It runs on Cloudflare (a Durable Object per world) or in Node for local testing — see relay-node.ts / worker.ts.

export interface RelayStore {
  get(k: string): Promise<any>;
  put(k: string, v: any): Promise<void>;
  del(k: string): Promise<void>;
}
export interface RelayConn { id: number; send(m: string | Uint8Array): void; close(): void }
type Cmd = { k: string; [x: string]: any };
type Entry = [number, number, number, Cmd];   // tick, player, team, command

import { CODE_ABC } from '../src/codes';

export const PROTO = 2;
const PLAYER_COLS = ['#e8543f', '#3a7bd5', '#2fb86b', '#f2c12e', '#9b59d6', '#1fb5b5', '#ff7fb0', '#8d6e4f', '#e67e22', '#d0d4dc', '#6a8f2f', '#2c3e8f'];
const PER = 6, STEP_MS = 100, SNAP_EVERY = 120_000, CHUNK = 1_000_000;

interface Meta { code: string; name: string; size: number; mode: string; dayNight: boolean; seed: number; created: number }
interface Player { id: number; name: string; col: string; team: number; key: string }

export class WorldRelay {
  meta: Meta | null = null;
  players = new Map<number, Player>();
  tick = 0;
  base: { tick: number; data: Uint8Array } | null = null;
  log: Entry[] = [];
  queue: [number, number, Cmd][] = [];
  conns = new Map<number, { c: RelayConn; pid: number; at: number; budget: number; last: number }>();
  hashes = new Map<number, Map<number, number>>();   // tick -> conn -> hash
  invites = new Map<number, { team: number; at: number }>();
  reqs = new Map<number, { team: number; at: number }>();      // join requests made with a team code (pid -> team)
  caps: Record<number, number> = {};                           // team -> its captain
  tcodes: Record<number, string> = {};                         // team -> its join code
  loaded = false;
  timer: any = null;
  lastSnapReq = 0; snapWaiters: number[] = []; snapPending = false;
  dirty = false; lastSave = 0;
  build = 0;   // newest game build seen in this world
  season = '';  // the current ranking season (a month, UTC)

  constructor(public store: RelayStore, public log_ = (..._a: any[]) => { }) { }

  // ---------------------------------------------------------------------------
  async load() {
    if (this.loaded) return;
    this.loaded = true;
    this.meta = (await this.store.get('meta')) || null;
    if (!this.meta) return;
    const st = (await this.store.get('state')) || {};
    this.tick = st.tick || 0;
    this.build = st.build || 0;
    this.log = st.log || [];
    for (const p of st.players || []) this.players.set(p.id, p);
    this.caps = st.caps || {}; this.tcodes = st.tcodes || {}; this.season = st.season || '';
    const bm = await this.store.get('base');
    if (bm) {
      const parts: Uint8Array[] = [];
      for (let i = 0; i < bm.chunks; i++) parts.push(new Uint8Array(await this.store.get('base' + i)));
      const data = new Uint8Array(bm.size); let o = 0;
      for (const p of parts) { data.set(p, o); o += p.length; }
      this.base = { tick: bm.tick, data };
    }
    // the clock must never run behind the newest save (it's only persisted every few seconds)
    if (this.base && this.base.tick > this.tick) this.tick = this.base.tick;
    for (const e of this.log) if (e[0] >= this.tick) this.tick = e[0] + PER;
  }
  async create(m: Omit<Meta, 'seed' | 'created'>) {
    this.meta = { ...m, seed: (Math.random() * 1e9) | 0, created: Date.now() };
    this.loaded = true;
    await this.store.put('meta', this.meta);
    await this.persist(true);
  }
  async persist(force = false) {
    if (!this.meta || (!this.dirty && !force)) return;
    this.dirty = false; this.lastSave = Date.now();
    await this.store.put('state', { tick: this.tick, log: this.log, players: [...this.players.values()], build: this.build, caps: this.caps, tcodes: this.tcodes, season: this.season });
  }
  async saveBase() {
    if (!this.base) return;
    const d = this.base.data, n = Math.ceil(d.length / CHUNK);
    for (let i = 0; i < n; i++) await this.store.put('base' + i, d.slice(i * CHUNK, (i + 1) * CHUNK));
    await this.store.put('base', { tick: this.base.tick, size: d.length, chunks: n });
  }

  // ---------------------------------------------------------------------------
  /** a player connects: who are they, and do they get a new base? */
  async join(c: RelayConn, hello: any) {
    await this.load();
    if (!this.meta) { c.send(JSON.stringify({ t: 'err', msg: 'No world has that code. Check it with whoever shared it.' })); c.close(); return; }
    // everyone in a world must run the same version of the game (every copy runs the simulation)
    const build = +hello.build || 0;
    const OLD = 'Beltworks was updated. Reload the page (press Ctrl+F5) to get the new version, then rejoin — your base is safe.';
    if (build < this.build) { c.send(JSON.stringify({ t: 'update', msg: OLD })); c.close(); return; }
    if (build > this.build) {
      this.build = build; this.dirty = true;
      for (const [id, k] of [...this.conns]) { k.c.send(JSON.stringify({ t: 'update', msg: OLD })); k.c.close(); this.leave(id); }
    }
    const key = String(hello.key || '').slice(0, 64);
    const name = String(hello.name || '').trim().slice(0, 24) || 'Player';
    let p = [...this.players.values()].find(q => q.key === key);
    let isNew = false;
    if (!p) {
      const id = Math.max(0, ...this.players.keys()) + 1;
      const team = Math.max(0, ...[...this.players.values()].map(q => q.team)) + 1;
      const used = new Set([...this.players.values()].map(q => q.col.toLowerCase()));
      const want = /^#[0-9a-f]{6}$/i.test(hello.col || '') ? String(hello.col).toLowerCase() : '';
      const col = want && !used.has(want) ? want : PLAYER_COLS.find(q => !used.has(q.toLowerCase())) || PLAYER_COLS[id % PLAYER_COLS.length];
      p = { id, name, col, team, key };
      this.players.set(id, p);
      isNew = true;
    } else p.name = name;
    this.conns.set(c.id, { c, pid: p.id, at: Date.now(), budget: 200, last: Date.now() });
    // the joiner gets the world so far: settings, the latest save (if any) and every action since it
    c.send(JSON.stringify({ t: 'welcome', code: this.meta.code, pid: p.id, meta: this.meta, baseTick: this.base ? this.base.tick : 0, hasBase: !!this.base, log: this.log, tick: this.tick }));
    if (this.base) c.send(this.base.data);
    // everyone (including the joiner, once caught up) spawns / welcomes them at the next tick
    this.queue.push([0, 0, { k: '_join', pid: p.id, team: p.team, name: p.name, col: p.col, isNew }]);
    this.queuePresence();
    this.dirty = true;
    this.start();
    this.broadcastPlayers();
    this.log_('join', this.meta.code, name, isNew ? '(new)' : '', `${this.conns.size} here`);
  }
  leave(connId: number) {
    const k = this.conns.get(connId);
    if (!k) return;
    this.conns.delete(connId);
    this.queuePresence();
    this.broadcastPlayers();
    if (!this.conns.size) this.stop();
  }
  onlinePids() { return new Set([...this.conns.values()].map(k => k.pid)); }
  queuePresence() {
    const on = this.onlinePids();
    const teams = new Set([...this.players.values()].map(p => p.team));
    const paused = [0, ...[...teams].filter(t => ![...this.players.values()].some(p => p.team === t && on.has(p.id)))];
    this.queue.push([0, 0, { k: '_presence', paused, online: [...on] }]);
  }
  broadcastPlayers() {
    const on = this.onlinePids();
    const list = [...this.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, col: p.col, online: on.has(p.id), cap: this.captain(p.team) === p.id }));
    // captains also get their team's join code
    for (const k of this.conns.values()) {
      const p = this.players.get(k.pid);
      const tcode = p && this.captain(p.team) === p.id ? this.teamCode(p.team) : '';
      k.c.send(JSON.stringify({ t: 'players', list, tcode }));
    }
  }
  members(team: number) { return [...this.players.values()].filter(p => p.team === team).sort((a, b) => a.id - b.id); }
  /** a team's captain (the first member, unless it was handed over) */
  captain(team: number) {
    const c = this.caps[team], m = this.members(team);
    if (c && m.some(p => p.id === c)) return c;
    if (!m.length) return 0;
    this.caps[team] = m[0].id; this.dirty = true;
    return m[0].id;
  }
  teamCode(team: number, fresh = false) {
    if (!this.tcodes[team] || fresh) {
      const used = new Set(Object.values(this.tcodes));
      let c = '';
      do { c = ''; for (let i = 0; i < 6; i++) c += CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]; } while (used.has(c));
      this.tcodes[team] = c; this.dirty = true;
    }
    return this.tcodes[team];
  }
  /** p joins `team` (their base joins too if they were alone) */
  doJoin(p: Player, team: number) {
    const to = this.members(team)[0];
    if (!to || p.team === team) return;
    const from = p.team;
    p.team = team; p.col = to.col;
    if (!this.members(from).length) { delete this.caps[from]; delete this.tcodes[from]; }
    this.invites.delete(p.id); this.reqs.delete(p.id);
    this.queue.push([0, 0, { k: '_team', pid: p.id, to: team }]);
    this.queuePresence(); this.broadcastPlayers(); this.dirty = true;
  }
  /** p leaves their team and starts over with a new base (they captain it) */
  doLeave(p: Player) {
    if (!this.members(p.team).some(q => q.id !== p.id)) return false;
    const old = p.team;
    const team = Math.max(0, ...[...this.players.values()].map(q => q.team)) + 1;
    p.team = team;
    const used = new Set([...this.players.values()].filter(q => q.id !== p.id).map(q => q.col.toLowerCase()));
    p.col = PLAYER_COLS.find(q => !used.has(q.toLowerCase())) || p.col;
    this.caps[team] = p.id;
    if (this.caps[old] === p.id) this.caps[old] = this.members(old)[0].id;
    this.queue.push([0, 0, { k: '_leave', pid: p.id, team, col: p.col }]);
    this.queuePresence(); this.broadcastPlayers(); this.dirty = true;
    return true;
  }
  broadcast(m: any) { const s = JSON.stringify(m); for (const k of this.conns.values()) k.c.send(s); }
  sendTo(pid: number, m: any) { const s = JSON.stringify(m); for (const k of this.conns.values()) if (k.pid === pid) k.c.send(s); }
  /** the player whose copy we trust for saves: the one connected longest */
  provider() { let best: any = null; for (const [id, k] of this.conns) if (!best || k.at < best.at) best = { id, at: k.at }; return best ? best.id : 0; }

  // ---------------------------------------------------------------------------
  onMessage(connId: number, raw: string | Uint8Array) {
    const k = this.conns.get(connId);
    if (!k) return;
    if (typeof raw !== 'string') { this.onSnapshot(connId, raw); return; }
    let m: any; try { m = JSON.parse(raw); } catch { return; }
    const p = this.players.get(k.pid)!;
    switch (m.t) {
      case 'cmd': {
        const now = Date.now();
        k.budget = Math.min(200, k.budget + (now - k.last) * 0.06); k.last = now;   // bursts of 200, then 60 a second
        if (k.budget < 1 || !m.c || typeof m.c.k !== 'string' || m.c.k[0] === '_') return;
        k.budget--;
        this.queue.push([p.id, p.team, m.c]);
        return;
      }
      case 'hash': this.onHash(connId, +m.tick, +m.h); return;
      case 'chat': this.broadcast({ t: 'chat', from: p.name, col: p.col, text: String(m.text || '').slice(0, 200) }); return;
      case 'ping': k.c.send(JSON.stringify({ t: 'pong', at: m.at })); return;
      case 'resync': this.requestSnap(connId); return;
      case 'team': {
        const soft = (msg: string) => k.c.send(JSON.stringify({ t: 'err-soft', msg }));
        const isCap = this.captain(p.team) === p.id;
        if (m.op === 'invite') {
          const q = this.players.get(+m.pid);
          if (!q || q.team === p.team || !this.onlinePids().has(q.id)) return;
          if (!isCap) { soft('Only your team captain can invite players'); return; }
          this.invites.set(q.id, { team: p.team, at: Date.now() });
          this.sendTo(q.id, { t: 'invite', from: p.name, team: p.team, col: p.col });
        } else if (m.op === 'accept') {
          const inv = this.invites.get(p.id);
          if (!inv || inv.team !== +m.team || Date.now() - inv.at > 120_000) { soft('That invitation has expired'); return; }
          this.doJoin(p, inv.team);
        } else if (m.op === 'leave') {
          this.doLeave(p);
        } else if (m.op === 'request') {   // "I have a team code": ask that team's captain
          const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const team = +(Object.keys(this.tcodes).find(t => this.tcodes[+t] === code) ?? NaN);
          if (!(team >= 0) || !this.members(team).length) { soft('No team has that code'); return; }
          if (team === p.team) { soft("You're already on that team"); return; }
          const cap = this.players.get(this.captain(team))!;
          if (!this.onlinePids().has(cap.id)) { soft(`${cap.name} (the captain) is offline — try again when they're on`); return; }
          this.reqs.set(p.id, { team, at: Date.now() });
          this.sendTo(cap.id, { t: 'joinreq', pid: p.id, name: p.name, col: p.col });
          k.c.send(JSON.stringify({ t: 'info', msg: `Asked ${cap.name} (the captain) to let you join — wait for them to approve` }));
        } else if (m.op === 'approve' || m.op === 'deny') {
          const q = this.players.get(+m.pid), r = q && this.reqs.get(q.id);
          if (!q || !r || !isCap || r.team !== p.team) return;
          this.reqs.delete(q.id);
          if (m.op === 'deny') { this.sendTo(q.id, { t: 'err-soft', msg: `${p.name} declined your request to join` }); return; }
          if (Date.now() - r.at > 300_000) { soft('That request has expired'); return; }
          this.doJoin(q, p.team);
        } else if (m.op === 'kick') {
          const q = this.players.get(+m.pid);
          if (!q || !isCap || q.id === p.id || q.team !== p.team) return;
          if (this.doLeave(q)) this.sendTo(q.id, { t: 'err-soft', msg: `${p.name} removed you from the team — you have a new base of your own` });
        } else if (m.op === 'promote') {
          const q = this.players.get(+m.pid);
          if (!q || !isCap || q.id === p.id || q.team !== p.team) return;
          this.caps[p.team] = q.id; this.dirty = true;
          this.broadcastPlayers();
        } else if (m.op === 'newcode') {
          if (!isCap) return;
          this.teamCode(p.team, true);
          this.broadcastPlayers();
        }
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // the clock
  start() {
    if (this.timer) return;
    let last = Date.now(), acc = 0;
    this.timer = setInterval(() => {
      const now = Date.now();
      acc += now - last; last = now;
      if (acc > 1000) acc = 1000;
      while (acc >= STEP_MS) { acc -= STEP_MS; this.step(); }
      if (now - this.lastSnapReq > SNAP_EVERY) this.requestSnap(0);
      if (now - this.lastSave > 4_000) this.persist();
    }, 25);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.persist(true);
  }
  step() {
    // a new month starts a new ranking season
    const d = new Date(), sid = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (sid !== this.season) { this.season = sid; this.dirty = true; this.queue.push([0, 0, { k: '_season', id: sid }]); }
    const out: Entry[] = [];
    for (const [pid, team, c] of this.queue.splice(0)) out.push([this.tick, pid, team, c]);
    this.tick += PER;
    if (out.length) { this.log.push(...out); this.dirty = true; }
    this.broadcast({ t: 'tick', n: this.tick, cmds: out });
    // keep memory in check if nobody uploads a save for a long time
    if (this.log.length > 200_000) this.log.splice(0, this.log.length - 200_000);
  }

  // ---------------------------------------------------------------------------
  // saves from players
  requestSnap(forConn: number) {
    if (forConn) this.snapWaiters.push(forConn);
    const prov = this.provider();
    if (!prov || (this.snapPending && Date.now() - this.lastSnapReq < 20_000)) return;
    this.snapPending = true; this.lastSnapReq = Date.now();
    this.conns.get(prov)!.c.send(JSON.stringify({ t: 'snapreq' }));
  }
  async onSnapshot(connId: number, buf: Uint8Array) {
    if (buf.length < 8) return;
    const tick = new DataView(buf.buffer, buf.byteOffset, 8).getFloat64(0, true);
    if (!(tick >= 0) || tick > this.tick || (this.base && tick < this.base.tick)) return;
    this.snapPending = false;
    this.base = { tick, data: buf.slice(8) };
    this.log = this.log.filter(e => e[0] >= tick);
    this.dirty = true;
    await this.saveBase(); await this.persist(true);
    // anyone who drifted (or asked) reloads from this save
    for (const id of this.snapWaiters.splice(0)) {
      const k = this.conns.get(id);
      if (!k || id === connId) continue;
      k.c.send(JSON.stringify({ t: 'reload', baseTick: tick, log: this.log, tick: this.tick }));
      k.c.send(this.base.data);
    }
  }
  /** fingerprints: the majority is right; anyone else reloads */
  onHash(connId: number, tick: number, h: number) {
    let m = this.hashes.get(tick);
    if (!m) { this.hashes.set(tick, m = new Map()); for (const t of this.hashes.keys()) if (t < tick - 3000) this.hashes.delete(t); }
    m.set(connId, h);
    if (m.size < Math.min(2, this.conns.size)) return;
    const count = new Map<number, number>();
    for (const v of m.values()) count.set(v, (count.get(v) || 0) + 1);
    const prov = this.provider();
    let good = m.get(prov) ?? [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top[1] > (count.get(good) || 0)) good = top[0];
    for (const [id, v] of m) if (v !== good) { this.log_('drift', id, tick); this.requestSnap(id); }
  }
}
