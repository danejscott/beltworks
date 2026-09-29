// Beltworks online server: accepts WebSocket connections, creates worlds with permanent join codes and
// hands each connection to its world's worker thread. Worlds are saved to disk and live forever; a world
// with nobody connected is saved and unloaded after a while, and loaded again when someone joins.
//
//   node server.mjs [--port 8787] [--data ./data]
import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { newCode, normCode } from '../src/online';

const arg = (k: string, d: string) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : process.env['BW_' + k.toUpperCase()] || d; };
const PORT = +arg('port', '8787');
const DATA = resolve(arg('data', './data'));
const HERE = dirname(fileURLToPath(import.meta.url));
const PROTO = 1;
const MAX_WORLDS = +arg('max-worlds', '200');          // total saved worlds
const SIZES = new Set([512, 1024, 2304, 4608]);
mkdirSync(DATA, { recursive: true });

interface Conn { id: number; ws: WebSocket; code: string | null; lastCmd: number; cmdBudget: number }
const conns = new Map<number, Conn>();
const worlds = new Map<string, { w: Worker; conns: Set<number> }>();
let nextConn = 1;
const log = (...a: any[]) => console.log(new Date().toISOString(), ...a);

function savedCodes() { return readdirSync(DATA).filter(f => /^[A-Z0-9]{8}\.json$/.test(f)).map(f => f.slice(0, 8)); }

function openWorld(code: string, create?: any) {
  let rec = worlds.get(code);
  if (rec) return rec;
  const w = new Worker(join(HERE, 'world.mjs'), { workerData: { code, dir: DATA, create } });
  rec = { w, conns: new Set() };
  worlds.set(code, rec);
  w.on('message', (m: any) => {
    if (m.unload) return;
    const text = JSON.stringify(m.msg);
    if (m.to === 'all') { for (const id of rec!.conns) conns.get(id)?.ws.send(text); }
    else conns.get(m.to)?.ws.send(text);
  });
  w.on('error', e => log('world crashed', code, e));
  w.on('exit', () => {
    worlds.delete(code);
    // anyone still connected gets told (their client will offer to reconnect)
    for (const id of rec!.conns) { const c = conns.get(id); if (c) { c.ws.send(JSON.stringify({ t: 'err', msg: 'The world restarted — reconnect to keep playing.' })); c.ws.close(); } }
    log('world closed', code);
  });
  log(create ? 'world created' : 'world loaded', code);
  return rec;
}

const http = createServer((req, res) => {
  // a tiny health check (and a friendly message for anyone who opens the address in a browser)
  res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
  res.end(req.url === '/health' ? JSON.stringify({ ok: true, worlds: worlds.size, players: conns.size }) : 'Beltworks server is running. Open the game and choose Play Online.');
});
const wss = new WebSocketServer({ server: http, perMessageDeflate: { threshold: 1024 }, maxPayload: 4 * 1024 * 1024 });

wss.on('connection', ws => {
  const c: Conn = { id: nextConn++, ws, code: null, lastCmd: Date.now(), cmdBudget: 60 };
  conns.set(c.id, c);
  const err = (msg: string) => { ws.send(JSON.stringify({ t: 'err', msg })); ws.close(); };
  ws.on('message', raw => {
    let m: any;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (!c.code) {
      // the first message says who you are and which world you want
      if (m.t !== 'hello') return;
      if (m.v !== PROTO) return err('Your game is a different version from this server — reload the page to update.');
      const name = String(m.name || '').trim().slice(0, 24) || 'Player';
      const key = String(m.key || '').slice(0, 64);
      if (key.length < 16) return err('Missing player key');
      let code: string;
      if (m.create) {
        const o = m.create;
        if (savedCodes().length >= MAX_WORLDS) return err('This server has reached its world limit.');
        const size = SIZES.has(+o.size) ? +o.size : 1024;
        const mode = ['easy', 'normal', 'hard', 'creative'].includes(o.mode) ? o.mode : 'normal';
        do code = newCode(); while (existsSync(join(DATA, code + '.json')) || worlds.has(code));
        openWorld(code, { name: String(o.name || 'Online World').slice(0, 40), size, mode, dayNight: o.dayNight !== false });
      } else {
        code = normCode(String(m.code || ''));
        if (!code) return err('That code doesn\'t look right — it\'s 8 letters and numbers, like K7QM-2XRP.');
        if (!worlds.has(code) && !existsSync(join(DATA, code + '.json'))) return err('No world has that code. Check it with whoever shared it.');
        openWorld(code);
      }
      c.code = code;
      const rec = worlds.get(code)!;
      rec.conns.add(c.id);
      rec.w.postMessage({ k: 'join', conn: c.id, key, name, col: String(m.col || '') });
      log('join', code, name, `(${rec.conns.size} here)`);
      return;
    }
    const rec = worlds.get(c.code);
    if (!rec) return;
    if (m.t === 'cmd') {
      // a generous rate limit: 60 commands, refilling 30 per second
      const now = Date.now();
      c.cmdBudget = Math.min(60, c.cmdBudget + (now - c.lastCmd) * 0.03); c.lastCmd = now;
      if (c.cmdBudget < 1) return;
      c.cmdBudget--;
      rec.w.postMessage({ k: 'cmd', conn: c.id, c: m.c });
    } else if (m.t === 'resync') rec.w.postMessage({ k: 'resync', conn: c.id });
    else if (m.t === 'chat') rec.w.postMessage({ k: 'chat', conn: c.id, text: m.text });
    else if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', at: m.at }));
  });
  ws.on('close', () => {
    conns.delete(c.id);
    if (c.code) { const rec = worlds.get(c.code); if (rec) { rec.conns.delete(c.id); rec.w.postMessage({ k: 'leave', conn: c.id }); } }
  });
  ws.on('error', () => { });
});

// keep connections alive through proxies
setInterval(() => { for (const c of conns.values()) if (c.ws.readyState === WebSocket.OPEN) c.ws.ping(); }, 25_000);

async function shutdown() {
  log('shutting down: saving worlds');
  for (const [, rec] of worlds) rec.w.postMessage({ k: 'stop' });
  setTimeout(() => process.exit(0), 3000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

http.listen(PORT, () => log(`Beltworks server on port ${PORT}, data in ${DATA} (${savedCodes().length} saved worlds)`));
