// The world relay in Node (for local testing or self-hosting). Same protocol as the Cloudflare worker.
//   node server/dist/relay-node.mjs [--port 8787] [--data ./data]
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { PROTO, RelayStore, WorldRelay } from './relay';
import { newCode, normCode } from '../src/codes';
import { handleBP } from './bpstore';

const arg = (k: string, d: string) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('port', '8787'), DATA = resolve(arg('data', './data'));
mkdirSync(DATA, { recursive: true });
const SIZES = new Set([512, 1024, 2304, 4608]);

function fileStore(code: string): RelayStore {
  const dir = join(DATA, code);
  mkdirSync(dir, { recursive: true });
  const f = (k: string) => join(dir, k);
  return {
    async get(k) {
      if (existsSync(f(k) + '.bin')) return new Uint8Array(readFileSync(f(k) + '.bin'));
      if (existsSync(f(k) + '.json')) return JSON.parse(readFileSync(f(k) + '.json', 'utf8'));
      return undefined;
    },
    async put(k, v) { if (v instanceof Uint8Array) writeFileSync(f(k) + '.bin', v); else writeFileSync(f(k) + '.json', JSON.stringify(v)); },
    async del(k) { rmSync(f(k) + '.bin', { force: true }); rmSync(f(k) + '.json', { force: true }); },
  };
}
const worlds = new Map<string, WorldRelay>();
const world = (code: string) => { let w = worlds.get(code); if (!w) worlds.set(code, w = new WorldRelay(fileStore(code), (...a) => console.log(new Date().toISOString(), ...a))); return w; };
const exists = (code: string) => worlds.has(code) || existsSync(join(DATA, code, 'meta.json'));

const BPDIR = join(DATA, '_blueprints');
mkdirSync(BPDIR, { recursive: true });
const http = createServer((q, r) => {
  const path = (q.url || '/').split('?')[0];
  if (path.startsWith('/bp')) {
    let body = '';
    q.on('data', d => { body += d; if (body.length > 500_000) q.destroy(); });
    q.on('end', async () => {
      const f = (c: string) => join(BPDIR, c + '.json');
      const res = await handleBP(q.method || 'GET', path, body, { get: async c => existsSync(f(c)) ? readFileSync(f(c), 'utf8') : undefined, put: async (c, v) => writeFileSync(f(c), v) });
      r.writeHead(res.status, res.headers); r.end(res.body);
    });
    return;
  }
  r.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' }); r.end('Beltworks relay is running.');
});
const wss = new WebSocketServer({ server: http, perMessageDeflate: { threshold: 1024 }, maxPayload: 64 * 1024 * 1024 });
let nextId = 1;
wss.on('connection', ws => {
  const id = nextId++;
  let w: WorldRelay | null = null;
  const conn = { id, send: (m: string | Uint8Array) => { if (ws.readyState === 1) ws.send(m); }, close: () => ws.close() };
  const err = (msg: string) => { ws.send(JSON.stringify({ t: 'err', msg })); ws.close(); };
  ws.on('message', async (data, isBinary) => {
    if (w) { w.onMessage(id, isBinary ? new Uint8Array(data as Buffer) : String(data)); return; }
    let m: any; try { m = JSON.parse(String(data)); } catch { return; }
    if (m.t !== 'hello') return;
    if (m.v !== PROTO) return err('Your game is a different version from this server — reload the page to update.');
    if (String(m.key || '').length < 16) return err('Missing player key');
    let code: string;
    if (m.create) {
      do code = newCode(); while (exists(code));
      const o = m.create;
      w = world(code);
      await w.create({ code, name: String(o.name || 'Online World').slice(0, 40), size: SIZES.has(+o.size) ? +o.size : 1024, mode: ['easy', 'normal', 'hard', 'creative'].includes(o.mode) ? o.mode : 'normal', dayNight: o.dayNight !== false });
    } else {
      code = normCode(String(m.code || ''));
      if (!code) return err('That code doesn\'t look right — it\'s 8 letters and numbers, like K7QM-2XRP.');
      if (!exists(code)) return err('No world has that code. Check it with whoever shared it.');
      w = world(code);
    }
    await w.join(conn, m);
  });
  ws.on('close', () => { if (w) w.leave(id); });
  ws.on('error', () => { });
});
setInterval(() => { for (const c of wss.clients) if (c.readyState === 1) c.ping(); }, 25_000);
http.listen(PORT, () => console.log(`Beltworks relay on port ${PORT}, data in ${DATA} (${readdirSync(DATA).length} worlds)`));
