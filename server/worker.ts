// The world relay on Cloudflare Workers: one Durable Object per world (named by its join code) runs WorldRelay.
// Connect with  wss://<worker>/ws?code=K7QM2XRP   or   wss://<worker>/ws?create=1   then send the usual 'hello'.
import { PROTO, RelayStore, WorldRelay } from './relay';
import { newCode, normCode } from '../src/codes';

interface Env { WORLD: DurableObjectNamespace }
const SIZES = new Set([512, 1024, 2304, 4608]);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Beltworks relay is running.', { headers: { 'access-control-allow-origin': '*' } });
    let code = normCode(url.searchParams.get('code') || '');
    const create = url.searchParams.get('create') === '1';
    if (create) code = newCode();
    if (!code) return new Response('bad code', { status: 400 });
    const stub = env.WORLD.get(env.WORLD.idFromName(code));
    const fwd = new Request(req.url, req);
    fwd.headers.set('x-bw-code', code);
    fwd.headers.set('x-bw-create', create ? '1' : '0');
    return stub.fetch(fwd);
  },
};

export class World {
  relay: WorldRelay;
  nextConn = 1;
  constructor(public state: DurableObjectState, _env: Env) {
    const st = state.storage;
    const store: RelayStore = { get: k => st.get(k), put: (k, v) => st.put(k, v), del: async k => { await st.delete(k); } };
    this.relay = new WorldRelay(store, (...a) => console.log(...a));
  }
  async fetch(req: Request): Promise<Response> {
    const code = req.headers.get('x-bw-code')!, create = req.headers.get('x-bw-create') === '1';
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    const id = this.nextConn++;
    const conn = { id, send: (m: string | Uint8Array) => { try { server.send(m); } catch { } }, close: () => { try { server.close(1000, 'bye'); } catch { } } };
    let joined = false;
    const err = (msg: string) => { conn.send(JSON.stringify({ t: 'err', msg })); conn.close(); };
    server.addEventListener('message', async ev => {
      const data = ev.data;
      if (joined) { this.relay.onMessage(id, typeof data === 'string' ? data : new Uint8Array(data as ArrayBuffer)); return; }
      if (typeof data !== 'string') return;
      let m: any; try { m = JSON.parse(data); } catch { return; }
      if (m.t !== 'hello') return;
      if (m.v !== PROTO) return err('Your game is a different version from this server — reload the page to update.');
      if (String(m.key || '').length < 16) return err('Missing player key');
      await this.relay.load();
      if (create) {
        if (this.relay.meta) return err('Please try again');   // (a code collision — astronomically unlikely)
        const o = m.create || {};
        await this.relay.create({ code, name: String(o.name || 'Online World').slice(0, 40), size: SIZES.has(+o.size) ? +o.size : 1024, mode: ['easy', 'normal', 'hard', 'creative'].includes(o.mode) ? o.mode : 'normal', dayNight: o.dayNight !== false });
      } else if (!this.relay.meta) return err('No world has that code. Check it with whoever shared it.');
      joined = true;
      await this.relay.join(conn, m);
    });
    const bye = () => { if (joined) this.relay.leave(id); };
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: client });
  }
}
