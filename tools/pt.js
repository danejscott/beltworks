// Playthrough helpers (dev tool): builds factories through the same commands the mouse sends (BW.CMD.run).
// Loaded in the dev page with: const P = await import('/tools/pt.js')
const BW = () => window.BW;
export const log = [];
const note = (s) => { log.push(s); };

export const W = () => BW().TER.W;
export function tileOK(x, y) {
  const { G } = BW(), w = W();
  if (x < 3 || y < 3 || x > w - 4 || y > w - 4) return false;
  const i = y * w + x, t = G.tiles[i];
  return !G.grid[i] && !G.nodeGrid[i] && !(G.featGrid && G.featGrid[i]) && (t === 0 || t === 1 || t === 2 || t === 3);
}
export function areaOK(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!tileOK(x + i, y + j)) return false; return true; }
export function findArea(w, h, cx, cy, minR = 0, maxR = 450, avoid = []) {
  for (let r = minR; r < maxR; r += 2) for (let a = 0; a < Math.max(8, r * 2); a++) {
    const ang = a / Math.max(8, r * 2) * Math.PI * 2, x = Math.round(cx + Math.cos(ang) * r - w / 2), y = Math.round(cy + Math.sin(ang) * r - h / 2);
    if (avoid.some(b => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y)) continue;
    if (areaOK(x, y, w, h)) return { x, y, w, h };
  }
  return null;
}
export function put(type, x, y, rot = 0, o = {}) {
  const { CMD, W: WP } = BW();
  CMD.run({ k: 'place', type, x, y, rot, z: o.z || 0, recipe: o.recipe, loud: false });
  const e = WP.entAt(x, y, o.z || 0);
  if (!e || e.type !== type) { note(`FAILED to place ${type} at ${x},${y}: ${WP.canPlace(type, x, y, rot, { z: o.z || 0 })}`); return null; }
  if (o.recipe && e.recipe !== o.recipe) CMD.run({ k: 'recipe', id: e.id, r: o.recipe });
  return e;
}
/** belts along a list of [x, y, dir] */
export function belts(path, type = 'belt4') { BW().CMD.run({ k: 'drag', type, z: 0, path }); }
/** a straight belt from (x0,y) to (x1,y) heading dir (0 east / 2 west), or vertical with dir 1/3 */
export function run(x0, y0, x1, y1, d, type) {
  const p = []; const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0); let x = x0, y = y0;
  for (let k = 0; k < 2000; k++) { p.push([x, y, d]); if (x === x1 && y === y1) break; x += dx; y += dy; }
  belts(p, type);
}
const kOf = (type) => { const d = BW().DATA.BLD[type]; return d.h & 1 ? (d.h - 1) / 2 : d.h / 2 - 1; };
/**
 * A production row, left to right along belt line yr. stages: { t: type, r?: recipe, fill?: {item: n}, sink?: true }
 * Each stage's output runs by belt into the next stage's input. Returns the placed buildings.
 */
export function row(x, yr, stages, gap = 2, beltType = 'belt4') {
  const { DATA } = BW(); const out = []; let cx = x;
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i], d = DATA.BLD[s.t];
    const y = s.t === 'elevator' || s.t === 'hub' ? yr - 2 : yr - kOf(s.t);
    const e = put(s.t, cx, y, 0, { recipe: s.r });
    if (!e) return out;
    if (s.fill) { e.store = { ...s.fill }; e.tot = Object.values(s.fill).reduce((a, b) => a + b, 0); }
    if (s.mode) BW().CMD.run({ k: 'mode', id: e.id, m: s.mode });
    out.push(e);
    if (i + 1 < stages.length) { run(cx + d.w, yr, cx + d.w + gap - 1, yr, 0, beltType); cx += d.w + gap; }
  }
  return out;
}
/** power poles (Mk2) every `sp` tiles over an area, where the ground is free */
export function poles(x0, y0, x1, y1, sp = 8) {
  let n = 0;
  for (let y = y0; y <= y1; y += sp) for (let x = x0; x <= x1; x += sp) {
    let done = false;
    for (let r = 0; r < 3 && !done; r++) for (let j = -r; j <= r && !done; j++) for (let i = -r; i <= r && !done; i++)
      if (tileOK(x + i, y + j)) { if (put('pole2', x + i, y + j)) { n++; done = true; } }
  }
  return n;
}
export function nodesOf(res, cx, cy, maxD = 1e9) {
  const { G } = BW();
  return G.nodes.filter(n => n.res === res && !G.grid[n.y * W() + n.x] && Math.hypot(n.x - cx, n.y - cy) < maxD).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
}
export function sim(seconds) { const S = BW().SIM; const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) S.update(1 / 60); }
export function states(list) { const c = {}; for (const e of list) if (e) c[e.st || 'n/a'] = (c[e.st || 'n/a'] || 0) + 1; return c; }

// ---- ports and an automatic belt router
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
/** output port: [x, y, dir items leave in] */
export function outP(e) { const W_ = BW().W; const [x, y] = W_.frontTiles(e)[0]; return [x, y, BW().DATA.BLD[e.type].pier || e.plat ? (e.rot + 2) & 3 : e.rot]; }
/** main input port (back): [x, y, dir the belt must point] */
export function inP(e) { const [x, y] = BW().W.inPort(e); return [x, y, e.rot]; }
/** side input of a multi-ingredient machine: s = 'L' or 'R' */
export function sideP(e, s) {
  const r = e.rot, side = s === 'L' ? (r + 3) & 3 : (r + 1) & 3, w = e.w, h = e.h;
  const x = side === 0 ? e.x + w : side === 2 ? e.x - 1 : e.x + ((w - 1) >> 1), y = side === 1 ? e.y + h : side === 3 ? e.y - 1 : e.y + ((h - 1) >> 1);
  return [x, y, (side + 2) & 3];
}
/** route a belt from port a ([x,y,dirOut]) to port b ([x,y,dirIn]) over free ground. Where other belts are in the
 *  way it hops under them with a Belt Tunnel pair (entrance + exit up to 8 tiles on), like a player would. */
export function connect(a, b, type = 'belt3', avoid = null) {
  const w = W(), key = (x, y) => y * w + x, { G, DATA } = BW();
  const [sx, sy] = a, [tx, ty, td] = b;
  const free = (x, y) => (x === tx && y === ty) || (tileOK(x, y) && !(avoid && avoid.has(key(x, y))));
  const isTunnel = (x, y) => { const id = G.grid[key(x, y)], e = id && G.ents.get(id); return !!e && (DATA.BLD[e.type].kind === 'tunnel' || DATA.BLD[e.type].kind === 'ptunnel'); };
  const land = (x, y) => { const t = G.tiles[key(x, y)]; return t !== 4 && t !== 5; };
  if (!free(sx, sy)) { note(`connect: start ${sx},${sy} blocked`); return false; }
  const heap = [], push = (v) => { heap.push(v); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a2 = i * 2 + 1, b2 = a2 + 1; let m = i; if (a2 < heap.length && heap[a2][0] < heap[m][0]) m = a2; if (b2 < heap.length && heap[b2][0] < heap[m][0]) m = b2; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
  const best = new Map(), prev = new Map();
  const k0 = key(sx, sy) * 4 + a[2]; best.set(k0, 0); push([0, sx, sy, a[2], 0]);
  let found = -1, it = 0;
  while (heap.length && it++ < 300000) {
    const [, x, y, d, g] = pop();
    const ck = key(x, y) * 4 + d;
    if ((best.get(ck) ?? 1e9) < g) continue;
    if (x === tx && y === ty) { found = ck; break; }
    const viaJump = !!(prev.get(ck) || [0, 0])[1];
    for (let nd = 0; nd < 4; nd++) {
      if (nd === ((d + 2) & 3)) continue;
      if (viaJump && nd !== d) continue;   // a tunnel exit only sends items straight on
      const nx = x + DX[nd], ny = y + DY[nd];
      if (free(nx, ny)) {
        const ng = g + 1 + (nd !== d ? 0.4 : 0), k = key(nx, ny) * 4 + nd;
        if ((best.get(k) ?? 1e9) > ng) { best.set(k, ng); prev.set(k, [ck, 0]); push([ng + Math.abs(tx - nx) + Math.abs(ty - ny), nx, ny, nd, ng]); }
      } else if (nd === d && !(x === tx && y === ty)) {
        // tunnel: this tile becomes the entrance, the exit lands 2..8 tiles on (over whatever is between)
        for (let j = 2; j <= 8; j++) {
          const ex = x + DX[nd] * j, ey = y + DY[nd] * j;
          let ok = true; for (let q = 1; q < j; q++) { const mx = x + DX[nd] * q, my = y + DY[nd] * q; if (isTunnel(mx, my) || !land(mx, my) || mx < 3 || my < 3 || mx > w - 4 || my > w - 4) { ok = false; break; } }
          if (!ok) break;
          if (!free(ex, ey)) continue;
          if (ex === tx && ey === ty && td !== nd) continue;
          const ng = g + j + 4, k = key(ex, ey) * 4 + nd;
          if ((best.get(k) ?? 1e9) > ng) { best.set(k, ng); prev.set(k, [ck, 1]); push([ng + Math.abs(tx - ex) + Math.abs(ty - ey), ex, ey, nd, ng]); }
          break;
        }
      }
    }
  }
  if (found < 0) { note(`connect: no path ${sx},${sy} -> ${tx},${ty}`); return false; }
  // walk back: list of [x, y, dirOut, kind] where kind 0 = belt, 1 = tunnel entrance, 2 = tunnel exit
  const seq = []; let k = found, lastDir = td, kindNext = 0;
  for (;;) {
    const t = Math.floor(k / 4), x = t % w, y = Math.floor(t / w), p = prev.get(k);
    seq.push({ x, y, dout: lastDir, kind: kindNext });
    if (!p) break;
    lastDir = k % 4;            // the move that brought us here is the direction the previous tile sends things
    kindNext = p[1] ? 1 : 0;    // previous tile is a tunnel entrance if we jumped here
    if (p[1]) seq[seq.length - 1].kind = seq[seq.length - 1].kind || 2;
    k = p[0];
  }
  seq.reverse();
  const beltPath = seq.filter(q => q.kind === 0).map(q => [q.x, q.y, q.dout]);
  if (beltPath.length) belts(beltPath, type);
  // entrance then its exit, pair by pair in order (an exit pairs with the nearest open entrance behind it)
  const tun = type.startsWith('pipe') ? 'ptunnel' : 'tunnel';
  for (const q of seq.filter(q => q.kind === 1 || q.kind === 2)) put(tun, q.x, q.y, q.dout);
  return seq.length;
}
