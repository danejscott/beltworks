// Smoke test: create a world, join it with a second player, and watch ticks/hashes arrive.
//   node server/smoke.mjs [ws://localhost:8787]
import { WebSocket } from 'ws';
const url = process.argv[2] || 'ws://localhost:8787';
const key = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + 'xxxxxxxx';
function client(hello, label) {
  return new Promise(res => {
    const ws = new WebSocket(url);
    const st = { label, ticks: 0, lastN: 0, hashes: 0, snaps: 0, snapBytes: 0, welcome: null, errs: [], players: null, ws };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 1, key: key(), ...hello })));
    ws.on('message', raw => {
      const m = JSON.parse(String(raw));
      if (m.t === 'welcome') { st.welcome = m; }
      else if (m.t === 'snap') { st.snaps++; st.snapBytes = m.snap.length; }
      else if (m.t === 'tick') { st.ticks++; st.lastN = m.n; }
      else if (m.t === 'hash') st.hashes++;
      else if (m.t === 'players') st.players = m.list;
      else if (m.t === 'err') st.errs.push(m.msg);
    });
    setTimeout(() => res(st), 100);
  });
}
const a = await client({ name: 'Alice', col: '#e8543f', create: { name: 'Smoke World', size: 512, mode: 'normal' } }, 'A');
await new Promise(r => setTimeout(r, 4000));
const code = a.welcome && a.welcome.code;
console.log('A welcome', a.welcome, 'snaps', a.snaps, 'bytes', a.snapBytes, 'ticks', a.ticks, 'n', a.lastN, 'errs', a.errs);
const b = await client({ name: 'Bob', col: '#3a7bd5', code }, 'B');
await new Promise(r => setTimeout(r, 7000));
console.log('B welcome', b.welcome, 'snaps', b.snaps, 'ticks', b.ticks, 'n', b.lastN, 'hashes', b.hashes, 'errs', b.errs);
console.log('A after B: snaps', a.snaps, 'n', a.lastN, 'players', JSON.stringify(a.players));
const bad = await client({ name: 'Eve', code: 'ZZZZZZZZ' }, 'E');
await new Promise(r => setTimeout(r, 800));
console.log('bad code errs', bad.errs);
a.ws.close(); b.ws.close(); bad.ws.close();
setTimeout(() => process.exit(0), 300);
