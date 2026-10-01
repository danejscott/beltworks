// Online play (client side). There is no game server: every player's browser runs the world. A small relay
// (Cloudflare, or Node for testing) puts everyone's actions in order and tags each with the tick it applies at;
// this copy runs exactly those ticks with exactly those actions, so all copies stay identical. The relay keeps
// the latest save (uploaded by a player's game every couple of minutes) and the actions since, so anyone can
// start or join the world at any time — whoever is online "hosts" it together.
import { applyCmd, Cmd, setSender } from './cmd';
import { deserialize, serialize, stateHash } from './save';
import { createServerWorld, ensureTradePost } from './online';
import { MP } from './teams';
import { G } from './world';

export const PROTO = 2;
/** when this copy of the game was built (online worlds require everyone on the newest build) */
export const BUILD: number = typeof __BUILD__ !== 'undefined' ? +__BUILD__ : 0;
/** the public relay (Cloudflare Workers) */
export const DEFAULT_SERVER = 'wss://beltworks-relay.beltworks.workers.dev';

export const NET = {
  on: false,            // connected to a world
  ready: false,         // world loaded and caught up
  loading: false,
  code: '',
  meta: null as any,
  tick: 0,              // ticks simulated here
  n: 0,                 // ticks the relay has finished (we may run up to this)
  pending: [] as [number, number, number, Cmd][],   // tick, player, team, command
  players: [] as { id: number; name: string; team: number; col: string; online: boolean; cap?: boolean }[],
  tcode: '',            // my team's join code (captains only)
  chat: [] as { from: string; col: string; text: string; t: number }[],
  ping: 0,
  drift: 0,
  snapWanted: false,
  outdated: false,       // a newer version of the game is out: reload the page
};
let ws: WebSocket | null = null;
let H: NetHandlers;
let expectBase: null | { kind: 'welcome' | 'reload'; baseTick: number } = null;
let reconnecting = false;
export interface NetHandlers {
  progress: (msg: string) => void;   // loading screen text
  ready: () => void;                 // world loaded and caught up: enter the game
  reloaded: () => void;              // a later save replaced the world (drift fix)
  error: (msg: string) => void;
  players: () => void;
  chat: (m: { from: string; col: string; text: string }) => void;
  invite: (m: { from: string; team: number; col: string }) => void;
  joinreq: (m: { pid: number; name: string; col: string }) => void;
}

export function serverURL() {
  try { const o = localStorage.getItem('bw-server'); if (o) return o; } catch { }
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' ? 'ws://localhost:8787' : DEFAULT_SERVER;
}
export function setServerURL(u: string) { try { if (u) localStorage.setItem('bw-server', u); else localStorage.removeItem('bw-server'); } catch { } }

/** who you are online: a secret key (so the world knows you when you come back), a name and a colour */
export function me(): { key: string; name: string; col: string } {
  let o: any = {};
  try { o = JSON.parse(localStorage.getItem('bw-player') || '{}'); } catch { }
  if (!o.key) { const a = new Uint8Array(16); crypto.getRandomValues(a); o.key = [...a].map(b => b.toString(16).padStart(2, '0')).join(''); }
  o.name = o.name || ''; o.col = o.col || '';
  try { localStorage.setItem('bw-player', JSON.stringify(o)); } catch { }
  return o;
}
export function saveMe(name: string, col: string) { const o = me(); o.name = name; o.col = col; try { localStorage.setItem('bw-player', JSON.stringify(o)); } catch { } }
export function recentServers(): { code: string; name: string; last: number }[] { try { return JSON.parse(localStorage.getItem('bw-servers') || '[]'); } catch { return []; } }
function rememberServer(code: string, name: string) {
  const l = recentServers().filter(s => s.code !== code);
  l.unshift({ code, name, last: Date.now() });
  try { localStorage.setItem('bw-servers', JSON.stringify(l.slice(0, 12))); } catch { }
}

// ---------------------------------------------------------------------------
async function gzip(text: string): Promise<Uint8Array> {
  const s = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function gunzip(b: Uint8Array): Promise<string> {
  const s = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(s).text();
}

export function connect(hello: { code?: string; create?: any }, h: NetHandlers, again = false) {
  const wasReady = again && NET.ready;
  disconnect();
  H = h;
  const p = me();
  Object.assign(NET, { on: false, ready: wasReady, loading: false, code: '', meta: null, tick: 0, n: 0, pending: [], players: [], chat: [], drift: 0, snapWanted: false, outdated: false });
  expectBase = null;
  let sock: WebSocket;
  const q = hello.create ? 'create=1' : 'code=' + encodeURIComponent(hello.code || '');
  try { sock = new WebSocket(serverURL().replace(/\/$/, '') + '/ws?' + q); } catch { h.error('Could not reach the Beltworks relay.'); return; }
  sock.binaryType = 'arraybuffer';
  ws = sock;
  let opened = false;
  sock.onopen = () => { opened = true; sock.send(JSON.stringify({ t: 'hello', v: PROTO, build: BUILD, key: p.key, name: p.name, col: p.col, ...hello })); };
  sock.onmessage = ev => {
    if (typeof ev.data !== 'string') { onBinary(new Uint8Array(ev.data)); return; }
    try { onMsg(JSON.parse(ev.data)); } catch (e) { console.error('bad message', e); }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    const was = NET.on;
    ws = null; NET.on = false; setSender(null);
    h.error(!opened ? 'Could not reach the Beltworks relay — check your connection and try again.' : was ? 'Lost connection to the world.' : 'The connection was closed.');
  };
}
export function disconnect() {
  if (ws) { const s = ws; ws = null; try { s.close(); } catch { } }
  NET.on = false; NET.ready = false; setSender(null);
}
export const send = (m: any) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
export function sendChat(text: string) { if (text.trim()) send({ t: 'chat', text: text.trim().slice(0, 200) }); }

function onMsg(m: any) {
  switch (m.t) {
    case 'welcome':
      if (NET.ready) reconnecting = true;
      MP.me = m.pid; NET.code = m.code; NET.meta = m.meta; NET.on = true; NET.loading = true;
      NET.pending = m.log.slice(); NET.n = m.tick;
      if (m.hasBase) { expectBase = { kind: 'welcome', baseTick: m.baseTick }; H.progress('Downloading the world…'); }
      else startFrom(null, 0);
      break;
    case 'reload':
      // we drifted from everyone else: reload from a fresh save and catch up
      NET.drift++;
      NET.pending = m.log.slice(); NET.n = Math.max(NET.n, m.tick);
      expectBase = { kind: 'reload', baseTick: m.baseTick };
      break;
    case 'tick':
      NET.n = m.n;
      for (const c of m.cmds) NET.pending.push(c);
      break;
    case 'snapreq': NET.snapWanted = true; if (NET.ready && !NET.loading) uploadSave(); break;
    case 'players': NET.players = m.list; NET.tcode = m.tcode || ''; H.players(); break;
    case 'chat': { const c = { from: m.from, col: m.col || '#ccc', text: m.text, t: Date.now() }; NET.chat.push(c); if (NET.chat.length > 50) NET.chat.shift(); H.chat(c); break; }
    case 'pong': NET.ping = Date.now() - m.at; break;
    case 'invite': H.invite(m); break;
    case 'joinreq': H.joinreq(m); break;
    case 'info': G.fx.toast(m.msg, 'good'); break;
    case 'err-soft': G.fx.toast(m.msg, 'bad'); break;
    case 'err': H.error(m.msg); disconnect(); break;
    case 'update': NET.outdated = true; H.error(m.msg); disconnect(); break;
  }
}
async function onBinary(b: Uint8Array) {
  const e = expectBase; expectBase = null;
  if (!e) return;
  try {
    if (e.kind === 'welcome') H.progress('Unpacking the world…');
    const text = await gunzip(b);
    startFrom(JSON.parse(text), e.baseTick);
  } catch (err) { console.error(err); H.error('Could not load the world save.'); disconnect(); }
}
/** load a save (or build the world fresh from its seed), then replay the actions since and catch up */
function startFrom(save: any, baseTick: number) {
  const first = !NET.ready;
  NET.loading = true;
  const run = () => {
    if (save) { deserialize(save, !first); ensureTradePost(); }
    else createServerWorld(NET.meta.seed, NET.meta);
    NET.tick = baseTick;
    NET.pending = NET.pending.filter(c => c[0] >= baseTick);
    G.dirty.links = true;
    catchUp(first);
  };
  if (first) { H.progress(save ? 'Building the world…' : 'Generating the world… (big maps take a little while)'); setTimeout(run, 30); }
  else run();
}
/** run the ticks since the save as fast as possible (in slices, so the page stays responsive) */
function catchUp(first: boolean) {
  const total = Math.max(1, NET.n - NET.tick);
  const slice = () => {
    const t0 = performance.now();
    while (NET.tick < NET.n && performance.now() - t0 < 40) netStep(stepFn);
    if (NET.tick < NET.n - 6) {
      if (first) H.progress(`Catching up with the world… ${Math.round((1 - (NET.n - NET.tick) / total) * 100)}%`);
      setTimeout(slice, 0);
      return;
    }
    syncMyTeam();
    setSender(c => send({ t: 'cmd', c }));
    NET.loading = false;
    if (first) { NET.ready = true; rememberServer(NET.code, G.S.name); H.ready(); } else if (reconnecting) { reconnecting = false; H.ready(); } else H.reloaded();
    if (NET.snapWanted) uploadSave();
  };
  slice();
}
let stepFn: (dt: number) => void = () => { };
/** the simulation's update function (set by main) */
export function setStepper(f: (dt: number) => void) { stepFn = f; }

/** the relay wants a fresh save: upload this copy (taken between ticks, so it's exact) */
async function uploadSave() {
  NET.snapWanted = false;
  const tick = NET.tick;
  const text = JSON.stringify(serialize());
  const z = await gzip(text);
  const out = new Uint8Array(8 + z.length);
  new DataView(out.buffer).setFloat64(0, tick, true);
  out.set(z, 8);
  if (ws && ws.readyState === 1) ws.send(out);
}
export function syncMyTeam() {
  const p = MP.players.get(MP.me);
  if (p && p.team !== MP.myTeam) { MP.myTeam = p.team; G.dirty.links = true; }
}

/** how many ticks we could run right now */
export const ticksAvailable = () => (NET.ready && !NET.loading) ? NET.n - NET.tick : 0;
/** run one tick exactly as everyone else does: its actions first, then the simulation */
export function netStep(update: (dt: number) => void) {
  if (NET.tick >= NET.n) return false;
  let k = 0;
  while (k < NET.pending.length && NET.pending[k][0] <= NET.tick) {
    const [, pid, team, c] = NET.pending[k++];
    applyCmd(c, pid === MP.me && !NET.loading, team);
  }
  if (k) { NET.pending.splice(0, k); syncMyTeam(); }
  update(1 / 60);
  NET.tick++;
  if (NET.tick % 300 === 0 && !NET.loading) send({ t: 'hash', tick: NET.tick, h: stateHash() });
  return true;
}
setInterval(() => { if (NET.on) send({ t: 'ping', at: Date.now() }); }, 5000);
