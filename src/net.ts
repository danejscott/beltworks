// Online play (client side). The server sends every player's commands tagged with the tick they apply at;
// this copy of the world runs exactly those ticks, applying exactly those commands, so it stays identical to
// the server's. Snapshots (on joins, or if a copy ever drifts) reload everyone from the same state.
import { applyCmd, Cmd, setSender } from './cmd';
import { deserialize, stateHash } from './save';
import { MP } from './teams';
import { G } from './world';

export const PROTO = 1;
/** the public server (Oracle Cloud, Always Free) — set when it's deployed */
export const DEFAULT_SERVER = 'wss://beltworks.duckdns.org';

export const NET = {
  on: false,            // connected to a world
  ready: false,         // first snapshot loaded
  code: '',
  tick: 0,              // ticks simulated here
  n: 0,                 // ticks the server has finished (we may run up to this)
  pending: [] as [number, number, number, Cmd][],   // tick, player, team, command
  mine: new Map<number, number>(),                  // our fingerprints by tick
  theirs: new Map<number, number>(),                // the server's
  players: [] as { id: number; name: string; team: number; col: string; online: boolean }[],
  chat: [] as { from: string; col: string; text: string; t: number }[],
  ping: 0,
  drift: 0,             // resyncs asked for
};
let ws: WebSocket | null = null;
let H: NetHandlers;
export interface NetHandlers {
  ready: () => void;                 // first world loaded: enter the game
  reloaded: () => void;              // a later snapshot replaced the world
  error: (msg: string) => void;      // couldn't join / lost connection
  players: () => void;
  chat: (m: { from: string; col: string; text: string }) => void;
  invite: (m: { from: string; team: number; col: string }) => void;
}

export function serverURL() {
  try { const o = localStorage.getItem('bw-server'); if (o) return o; } catch { }
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' ? 'ws://localhost:8787' : DEFAULT_SERVER;
}
export function setServerURL(u: string) { try { if (u) localStorage.setItem('bw-server', u); else localStorage.removeItem('bw-server'); } catch { } }

/** who you are online: a secret key (so the server knows you when you come back), a name and a colour */
export function me(): { key: string; name: string; col: string } {
  let o: any = {};
  try { o = JSON.parse(localStorage.getItem('bw-player') || '{}'); } catch { }
  if (!o.key) {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    o.key = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  }
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

export function connect(hello: { code?: string; create?: any }, h: NetHandlers) {
  disconnect();
  H = h;
  const p = me();
  Object.assign(NET, { on: false, ready: false, code: '', tick: 0, n: 0, pending: [], players: [], chat: [], drift: 0 });
  NET.mine.clear(); NET.theirs.clear();
  let sock: WebSocket;
  try { sock = new WebSocket(serverURL()); } catch { h.error('Could not reach the Beltworks server.'); return; }
  ws = sock;
  let opened = false;
  sock.onopen = () => { opened = true; sock.send(JSON.stringify({ t: 'hello', v: PROTO, key: p.key, name: p.name, col: p.col, ...hello })); };
  sock.onmessage = ev => { try { onMsg(JSON.parse(ev.data)); } catch (e) { console.error('bad message', e); } };
  sock.onclose = () => {
    if (ws !== sock) return;
    const was = NET.on;
    ws = null; NET.on = false; setSender(null);
    h.error(!opened ? 'Could not reach the Beltworks server — it may be offline. Try again in a minute.' : was ? 'Lost connection to the server.' : 'The server closed the connection.');
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
      MP.me = m.pid; MP.myTeam = m.team; NET.code = m.code; NET.on = true;
      break;
    case 'snap': {
      const first = !NET.ready;
      const o = JSON.parse(m.snap);
      deserialize(o, !first);
      MP.paused = new Set(m.paused);
      for (const p of MP.players.values()) p.online = m.online.includes(p.id);
      NET.tick = m.tick; NET.n = Math.max(NET.n, m.tick);
      NET.pending = NET.pending.filter(c => c[0] >= m.tick);
      NET.mine.clear();
      G.dirty.links = true;
      setSender(c => send({ t: 'cmd', c }));
      if (first) { NET.ready = true; rememberServer(NET.code, G.S.name); H.ready(); } else H.reloaded();
      break;
    }
    case 'tick':
      NET.n = m.n;
      for (const c of m.cmds) NET.pending.push(c);
      break;
    case 'hash':
      NET.theirs.set(m.tick, m.h);
      check(m.tick);
      break;
    case 'players': NET.players = m.list; H.players(); break;
    case 'chat': { const c = { from: m.from, col: m.col || '#ccc', text: m.text, t: Date.now() }; NET.chat.push(c); if (NET.chat.length > 50) NET.chat.shift(); H.chat(c); break; }
    case 'pong': NET.ping = Date.now() - m.at; break;
    case 'invite': H.invite(m); break;
    case 'err-soft': G.fx.toast(m.msg, 'bad'); break;
    case 'you': MP.myTeam = m.team; G.dirty.links = true; break;
    case 'err': H.error(m.msg); disconnect(); break;
  }
}
function check(t: number) {
  const a = NET.mine.get(t), b = NET.theirs.get(t);
  if (a === undefined || b === undefined) return;
  NET.mine.delete(t); NET.theirs.delete(t);
  if (a !== b) { NET.drift++; console.warn(`world drifted from the server at tick ${t} — reloading`); send({ t: 'resync' }); }
}

/** how many ticks we could run right now */
export const ticksAvailable = () => NET.ready ? NET.n - NET.tick : 0;
/** run one tick exactly as the server did: its commands first, then the simulation */
export function netStep(update: (dt: number) => void) {
  if (NET.tick >= NET.n) return false;
  let k = 0;
  while (k < NET.pending.length && NET.pending[k][0] <= NET.tick) {
    const [, pid, team, c] = NET.pending[k++];
    applyCmd(c, pid === MP.me, team);
  }
  if (k) NET.pending.splice(0, k);
  update(1 / 60);
  NET.tick++;
  if (NET.tick % 300 === 0) { NET.mine.set(NET.tick, stateHash()); check(NET.tick); }
  return true;
}
setInterval(() => { if (NET.on) send({ t: 'ping', at: Date.now() }); }, 5000);
