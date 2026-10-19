// Railway placement, Satisfactory / Planet Coaster style: drag from a track end (or anywhere) toward where you want
// to go. The planner finds a route that only bends 45° at a time, with a few tiles of straight track between bends,
// so finished track sweeps instead of turning on the spot. Near another track's open end it snaps on and joins it
// head-on; starting or ending on the middle of a straight piece makes a junction there. It never paints over track.
import { DX, DY } from './util';
import { G, PAIRS, pairBit } from './world';
import { W, H } from './terrain';
import { tileFree } from './cmd';
import { RS } from './railgrid';
// Everything below works in rail-grid blocks (2 x 2 tiles): block (x, y) covers tiles (x*RS .. x*RS+1, y*RS .. y*RS+1).
// The exported functions take and return tile coordinates (a block's top-left tile).

export interface RailPlan {
  tiles: { x: number; y: number; p: number; w?: number }[];   // new track: tile and its route bits (w: part of a wye junction)
  junc: { x: number; y: number; p: number }[];       // existing track to add a route to (branch / merge)
  pts: [number, number][];                           // tile centres along the plan (start…end) for the preview
  dirA: number; dirB: number;                        // straight-on directions past each end (preview curve)
  snapEnd: { x: number; y: number } | null;          // joined another track's end / side
  ok: boolean; why?: string;
}

let M = 2;   // blocks of straight (or diagonal) track before the next 45° bend (1 when nothing smoother fits)
const CW = () => Math.floor(W / RS), CH = () => Math.floor(H / RS);
const rail = (x: number, y: number) => {
  if (x < 0 || y < 0 || x >= CW() || y >= CH()) return null;
  const id = G.grid[y * RS * W + x * RS], e = id ? G.ents.get(id) : null;
  return e && e.type === 'rail' && e.x === x * RS && e.y === y * RS ? e : null;
};
/** a block of open ground track can go on */
const blockFree = (x: number, y: number) => {
  for (let j = 0; j < RS; j++) for (let i = 0; i < RS; i++) { const tx = x * RS + i, ty = y * RS + j; if (G.grid[ty * W + tx] || !tileFree(tx, ty, 'rail', 0)) return false; }
  return true;
};
const toB = (v: number) => Math.floor(v / RS);
const bitsCount = (p: number) => { let n = 0; for (let i = 0; i < 6; i++) if (p & (1 << i)) n++; return n; };
function sidesOf(p: number) { let s = 0; for (let i = 0; i < 6; i++) if (p & (1 << i)) s |= (1 << PAIRS[i][0]) | (1 << PAIRS[i][1]); return s; }
/** does the track on (x,y) connect out through side s to track next door? */
function linked(x: number, y: number, s: number) {
  const n = rail(x + DX[s], y + DY[s]);
  return !!n && !!(sidesOf(n.pairs) & (1 << ((s + 2) & 3)));
}
/** an open end: a one-route block with a side that leads nowhere — returns that side (tile coordinates in) */
export function openEnd(x: number, y: number): number { return openEndB(toB(x), toB(y)); }
function openEndB(x: number, y: number): number {
  const r = rail(x, y);
  if (!r || bitsCount(r.pairs) !== 1 || r.sig) return -1;
  const sd = sidesOf(r.pairs);
  for (let s = 0; s < 4; s++) if (sd & (1 << s) && !linked(x, y, s)) return s;
  return -1;
}
/** a plain straight piece (somewhere a branch can come off): its axis (0 = east-west, 1 = north-south) */
function straightAxis(x: number, y: number): number {
  const r = rail(x, y);
  if (!r || r.sig || bitsCount(r.pairs) !== 1) return -1;
  return r.pairs & 1 ? 0 : r.pairs & 2 ? 1 : -1;
}
/** the nearest open end within a few blocks of the pointer (so the drag snaps on); tile coordinates in and out */
export function snapEnd(x: number, y: number, not?: { x: number; y: number }): { x: number; y: number; side: number } | null {
  const b = snapEndB(toB(x), toB(y), not && { x: toB(not.x), y: toB(not.y) });
  return b && { x: b.x * RS, y: b.y * RS, side: b.side };
}
function snapEndB(x: number, y: number, not?: { x: number; y: number }): { x: number; y: number; side: number } | null {
  let best: any = null, bd = 1e9;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const nx = x + dx, ny = y + dy;
    if (not && nx === not.x && ny === not.y) continue;
    const s = openEndB(nx, ny);
    if (s < 0) continue;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = { x: nx, y: ny, side: s }; }
  }
  return best;
}

// heading h: 0..7 = E, SE, S, SW, W, NW, N, NE. Axis headings move along one direction; diagonal ones alternate two.
const comps = (h: number): [number, number] => [((h - 1) >> 1) & 3, ((h + 1) >> 1) & 3];
const dirOfHeading = (d: number) => d * 2;

/** plan track from tile (sx,sy) to the pointer at (ex,ey) */
export function planRail(tsx: number, tsy: number, tex: number, tey: number): RailPlan {
  const p = planB(toB(tsx), toB(tsy), toB(tex), toB(tey));
  const T = (q: { x: number; y: number; p: number; w?: number }) => ({ x: q.x * RS, y: q.y * RS, p: q.p, w: q.w });
  return { ...p, tiles: p.tiles.map(T), junc: p.junc.map(T), pts: p.pts.map(([x, y]) => [x * RS, y * RS] as [number, number]), snapEnd: p.snapEnd && { x: p.snapEnd.x * RS, y: p.snapEnd.y * RS } };
}
function planB(sx: number, sy: number, ex: number, ey: number): RailPlan {
  // starting near the end of some track (not on track): start from that end, so it joins on
  if (!rail(sx, sy)) { const sn = snapEndB(sx, sy); if (sn && Math.abs(sn.x - sx) + Math.abs(sn.y - sy) <= 2) { sx = sn.x; sy = sn.y; } }
  // the gentlest curves that fit: 3 blocks of straight between 45° bends, else 2 (never tighter, so nothing turns
  // sharper than a train can take)
  let p: RailPlan | null = null;
  for (const m of [3, 2]) { M = m; const q = planM(sx, sy, ex, ey); if (q.ok || !q.why || q.final) { M = 2; return q; } if (!p) p = q; }
  M = 2;
  return p!;
}

/** A wye: where new track meets a straight line square-on, it splits into two 45° legs, one merging each way along
 *  the line — so trains can turn either way, and nothing is sharper than 45°. G = the line block, a = the line's axis
 *  (0 = east-west), u = the side the new track comes from (pointing away from the line), L = blocks of diagonal per leg.
 *  Returns the stem block (where the new track carries on) and the pieces, or null if it doesn't fit. */
function wye(gx: number, gy: number, u: number, L: number): { px: number; py: number; tiles: { x: number; y: number; p: number; w?: number }[]; junc: { x: number; y: number; p: number }[] } | null {
  const back = (u + 2) & 3, tiles: { x: number; y: number; p: number; w?: number }[] = [], junc: { x: number; y: number; p: number }[] = [];
  const px = gx + DX[u] * L, py = gy + DY[u] * L;
  if (!blockFree(px, py) || rail(px, py)) return null;
  let pp = 0;
  for (const e of [(u + 1) & 3, (u + 3) & 3]) {      // the two directions along the line
    pp |= pairBit(u, e);
    let x = px, y = py;
    for (let k = 0; k < 2 * L; k++) {
      const mv = k % 2 === 0 ? e : back, nmv = k + 1 < 2 * L ? ((k + 1) % 2 === 0 ? e : back) : e;
      x += DX[mv]; y += DY[mv];
      const pair = pairBit((mv + 2) & 3, nmv);
      if (k === 2 * L - 1) {
        // the merge onto the line: a plain straight piece of the same line
        const r = rail(x, y);
        if (!r || r.sig || r.pairs !== (e & 1 ? 2 : 1)) return null;
        junc.push({ x, y, p: pair });
      } else {
        if (rail(x, y) || !blockFree(x, y)) return null;
        tiles.push({ x, y, p: pair, w: 1 });
      }
    }
  }
  tiles.push({ x: px, y: py, p: pp, w: 1 });
  return { px, py, tiles, junc };
}

function planM(sx: number, sy: number, ex: number, ey: number): RailPlan & { final?: boolean } {
  const dd = Math.abs(ex - sx) >= Math.abs(ey - sy) ? (ex >= sx ? 0 : 2) : (ey >= sy ? 1 : 3);
  const fail = (why: string, final = false): RailPlan & { final?: boolean } => ({ tiles: [], junc: [], pts: why ? [[sx + 0.5, sy + 0.5], [ex + 0.5, ey + 0.5]] : [], dirA: (dd + 2) & 3, dirB: dd, snapEnd: null, ok: false, why, final });
  const sidesAt = (x: number, y: number) => { const r = rail(x, y); return r ? sidesOf(r.pairs) : 0; };
  const extraTiles: { x: number; y: number; p: number; w?: number }[] = [], extraJunc: { x: number; y: number; p: number }[] = [];
  // ---- where it starts: open ground, an open end (carries straight on), or a straight piece of a line (a wye
  // branches off it, so trains can come and go both ways)
  let startEnd = openEndB(sx, sy), startOnTrack = !!rail(sx, sy), startSide = -1, startFromWye = false;
  if (startOnTrack && startEnd < 0) {
    const ax = straightAxis(sx, sy);
    if (ax < 0) return fail('Branch off a straight stretch of track (or drag from a track end)', true);
    const u = ax === 0 ? (ey >= sy ? 1 : 3) : (ex >= sx ? 0 : 2);
    const w = wye(sx, sy, u, 2) || wye(sx, sy, u, 1);
    if (!w) return fail('No room here for a smooth junction — leave a few blocks clear beside the track', true);
    extraTiles.push(...w.tiles); extraJunc.push(...w.junc);
    const ox = sx, oy = sy;
    sx = w.px + DX[u]; sy = w.py + DY[u];     // the new track carries on from the stem of the wye, straight out
    if (!blockFree(sx, sy) || rail(sx, sy)) return fail('No room here for a smooth junction — leave a few blocks clear beside the track', true);
    extraTiles.push({ x: sx, y: sy, p: 0 });  // (placeholder: its route is set once the way on is known)
    startOnTrack = false; startEnd = -1; startSide = u; startFromWye = true;
    void ox; void oy;
  }
  // ---- where it ends: a nearby open end (snaps), a straight piece of a line (joins it with a wye), or open ground
  let goal: { x: number; y: number; arrive: number; kind: 'end' | 'stem' | 'free' };
  const sn = snapEndB(ex, ey, { x: sx, y: sy });
  if (sn) goal = { x: sn.x, y: sn.y, arrive: (sn.side + 2) & 3, kind: 'end' };
  else if (rail(ex, ey) && !(ex === sx && ey === sy)) {
    const ax = straightAxis(ex, ey);
    if (ax < 0) return fail('Join onto a straight stretch of track (or onto a track end)', true);
    const u = ax === 0 ? (sy <= ey ? 3 : 1) : (sx <= ex ? 2 : 0);   // the side we come from
    const w = wye(ex, ey, u, 2) || wye(ex, ey, u, 1);
    if (!w) return fail('No room here for a smooth junction — leave a few blocks clear beside the track', true);
    extraTiles.push(...w.tiles); extraJunc.push(...w.junc);
    // arrive at the block just outside the wye's stem, heading straight at the line
    goal = { x: w.px + DX[u], y: w.py + DY[u], arrive: (u + 2) & 3, kind: 'stem' };
    if (rail(goal.x, goal.y) || !blockFree(goal.x, goal.y)) return fail('No room here for a smooth junction — leave a few blocks clear beside the track', true);
  } else goal = { x: ex, y: ey, arrive: -1, kind: 'free' };
  if (goal.x === sx && goal.y === sy && goal.kind !== 'stem') return fail('');
  const wyeCells = new Set([...extraTiles, ...extraJunc].map(t => t.y * CW() + t.x));

  // ---- search: state = block, heading, blocks since the last bend (capped), phase on diagonals. Existing straight
  // track can be crossed or followed straight through (it's reused); new track never turns inside existing track.
  const x0 = Math.max(1, Math.min(sx, goal.x) - 40), x1 = Math.min(CW() - 2, Math.max(sx, goal.x) + 40);
  const y0 = Math.max(1, Math.min(sy, goal.y) - 40), y1 = Math.min(CH() - 2, Math.max(sy, goal.y) + 40);
  const inBox = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const key = (x: number, y: number, h: number, n: number, ph: number) => ((((y * CW() + x) * 8 + h) * (M + 1) + n) * 2 + ph);
  type S = { x: number; y: number; h: number; n: number; ph: number; g: number; last: number; prev: S | null; side: number };
  const open: [number, S][] = [];
  const push = (f: number, s: S) => { open.push([f, s]); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
  const pop = () => { const t = open[0], l = open.pop()!; if (open.length) { open[0] = l; let i = 0; for (;;) { const a = i * 2 + 1, b = a + 1; let m = i; if (a < open.length && open[a][0] < open[m][0]) m = a; if (b < open.length && open[b][0] < open[m][0]) m = b; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return t; };
  const hf = (x: number, y: number) => (Math.abs(goal.x - x) + Math.abs(goal.y - y)) * 0.85;
  const best = new Map<number, number>();
  const straightRail = (x: number, y: number) => { const r = rail(x, y); return !!r && !r.sig && (r.pairs & ~3) === 0; };
  if (goal.kind === 'stem' && goal.x === sx && goal.y === sy) {
    // already right at the wye's stem
  } else if (startEnd >= 0) push(hf(sx, sy), { x: sx, y: sy, h: startEnd * 2, n: 1, ph: 0, g: 0, last: -1, prev: null, side: startEnd });
  else if (startSide >= 0) push(hf(sx, sy), { x: sx, y: sy, h: startSide * 2, n: 1, ph: 0, g: 0, last: -1, prev: null, side: startSide });
  else for (let h = 0; h < 8; h++) push(hf(sx, sy), { x: sx, y: sy, h, n: M, ph: 0, g: 0, last: -1, prev: null, side: -1 });
  let found: S | null = null, iter = 0;
  while (open.length && iter++ < 220000) {
    const [, s] = pop();
    const k = key(s.x, s.y, s.h, s.n, s.ph);
    if ((best.get(k) ?? 1e9) < s.g) continue;
    const onRailNow = !!s.prev && !!rail(s.x, s.y);
    for (const dh of [0, -1, 1]) {
      if (dh && (s.n < M || onRailNow)) continue;          // no bending inside existing track
      const h = (s.h + dh + 8) & 7;
      // the next move: along the heading, or (diagonal) alternating its two directions — starting with the turn
      let mv: number, ph = 0;
      if (!(h & 1)) mv = h >> 1;
      else { const c = comps(h); if (dh || s.last < 0) { mv = c[0] === s.last ? c[1] : c[0]; ph = mv === c[0] ? 1 : 0; } else { mv = c[s.ph]; ph = s.ph ^ 1; } }
      if (s.last >= 0 && mv === ((s.last + 2) & 3)) continue;   // never double back
      if (!s.prev && s.side >= 0 && mv !== s.side) continue;      // leave the start through its chosen side
      if (onRailNow && mv !== s.last) continue;                    // straight through existing track
      const nx = s.x + DX[mv], ny = s.y + DY[mv];
      const onRail = !!rail(nx, ny);
      const n = dh ? 1 : Math.min(M, s.n + 1);
      // reaching the goal
      if (nx === goal.x && ny === goal.y) {
        if (goal.kind === 'end' && (mv !== goal.arrive || h !== goal.arrive * 2 || n < M)) continue;   // come in straight, not off a bend
        if (goal.kind === 'stem' && (mv !== goal.arrive || h !== goal.arrive * 2 || n < 2)) continue;  // straight at the wye
        found = { x: nx, y: ny, h, n, ph, g: s.g + 1, last: mv, prev: s, side: -1 }; break;
      }
      if (!inBox(nx, ny) || wyeCells.has(ny * CW() + nx)) continue;
      let step = 1;
      if (onRail) {
        // only straight over (or along) plain straight track, square-on
        if (!straightRail(nx, ny) || h !== mv * 2) continue;
        step = sidesAt(nx, ny) & (1 << ((mv + 2) & 3)) ? 0.8 : 1.7;
      } else {
        if (!blockFree(nx, ny)) continue;
        // keep a little space from other track (except where it starts and where it joins)
        if (Math.abs(nx - sx) + Math.abs(ny - sy) > 2 && Math.abs(nx - goal.x) + Math.abs(ny - goal.y) > 2)
          for (let dy = -1; dy <= 1 && step === 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && rail(nx + dx, ny + dy)) { step = 1.6; break; }
      }
      const g = s.g + step + (dh ? 1.1 + (s.n < M + 2 ? 0.7 : 0) : 0);
      const ns: S = { x: nx, y: ny, h, n, ph, g, last: mv, prev: s, side: -1 };
      const nk = key(nx, ny, h, n, ph);
      if ((best.get(nk) ?? 1e9) <= ns.g) continue;
      best.set(nk, ns.g);
      push(ns.g + hf(nx, ny), ns);
    }
    if (found) break;
  }
  const trivial = goal.kind === 'stem' && goal.x === sx && goal.y === sy;
  if (!found && !trivial) return fail('No smooth route there — try a bit further away, or around obstacles');
  // ---- turn the search result into track: new pieces, plus connections added to existing pieces it passes over
  const steps: { x: number; y: number; mv: number }[] = [];
  for (let s: S | null = found; s && s.prev; s = s.prev) steps.push({ x: s.x, y: s.y, mv: s.last });
  steps.reverse();   // steps[i] = the block reached by move steps[i].mv
  const tiles: RailPlan['tiles'] = [...extraTiles.filter(t => t.p)], junc: RailPlan['junc'] = [...extraJunc];
  const addJ = (x: number, y: number, p: number) => { const r = rail(x, y); if (r && (r.pairs & p) !== p) junc.push({ x, y, p }); };
  const first = steps.length ? steps[0].mv : goal.arrive;
  // the start: new ground (or the block just out of a wye's stem), or an open end (already points this way)
  if (!startOnTrack) tiles.push({ x: sx, y: sy, p: pairBit(startFromWye ? (startSide + 2) & 3 : (first + 2) & 3, first) });
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i], last = i === steps.length - 1, entry = (st.mv + 2) & 3;
    if (last && goal.kind === 'end') break;
    const exit = last ? st.mv : steps[i + 1].mv;
    if (rail(st.x, st.y)) addJ(st.x, st.y, pairBit(entry, exit));
    else tiles.push({ x: st.x, y: st.y, p: pairBit(entry, exit) });
  }
  const pts: [number, number][] = [[sx + 0.5, sy + 0.5], ...steps.map(s => [s.x + 0.5, s.y + 0.5] as [number, number])];   // (block units; planRail scales them)
  for (const t of extraTiles) if (t.p) pts.push([t.x + 0.5, t.y + 0.5]);
  const dirA = (first + 2) & 3, dirB = steps.length ? steps[steps.length - 1].mv : goal.arrive;
  return { tiles, junc, pts: [[sx + 0.5, sy + 0.5], ...steps.map(s => [s.x + 0.5, s.y + 0.5] as [number, number])], dirA, dirB, snapEnd: goal.kind === 'free' ? null : { x: goal.x, y: goal.y }, ok: true, wye: extraTiles.filter(t => t.p).map(t => [t.x + 0.5, t.y + 0.5]) } as any;
}

/** Smooth a stretch of existing track: the plain pieces between two points on one line are taken up and the line
 *  is re-laid there as gentle curves (if the new route fits). Tile coordinates in. Returns the blocks that would be
 *  taken up and the plan to lay instead. The world is left exactly as it was. */
export function planSmooth(tax: number, tay: number, tbx: number, tby: number): { remove: { x: number; y: number }[]; plan: RailPlan } | { why: string } {
  const ax = toB(tax), ay = toB(tay), bx = toB(tbx), by = toB(tby);
  if (!rail(ax, ay) || !rail(bx, by)) return { why: 'Pick two points on the same line of track' };
  if (ax === bx && ay === by) return { why: '' };
  // the track between them (breadth-first along routes), only through plain pieces
  const key = (x: number, y: number) => y * CW() + x;
  const prev = new Map<number, number>(), q: [number, number][] = [[ax, ay]];
  prev.set(key(ax, ay), -1);
  let ok = false;
  for (let h = 0; h < q.length && q.length < 4000; h++) {
    const [x, y] = q[h];
    if (x === bx && y === by) { ok = true; break; }
    const r = rail(x, y)!, sd = sidesOf(r.pairs);
    if (h > 0 && (bitsCount(r.pairs) !== 1 || r.sig)) continue;   // don't smooth through junctions or signals
    for (let s2 = 0; s2 < 4; s2++) {
      if (!(sd & (1 << s2))) continue;
      const nx = x + DX[s2], ny = y + DY[s2], n = rail(nx, ny);
      if (!n || !(sidesOf(n.pairs) & (1 << ((s2 + 2) & 3))) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
    }
  }
  if (!ok) return { why: 'Those two points are not on one plain stretch of track' };
  const path: { x: number; y: number }[] = [];
  for (let c = key(bx, by); c !== -1; c = prev.get(c)!) path.push({ x: c % CW(), y: Math.floor(c / CW()) });
  path.reverse();
  const inner = path.slice(1, -1);
  if (!inner.length) return { why: 'Pick points further apart' };
  for (const b of inner) for (const t of G.trains) for (const c of t.cells) if (c === b.y * RS * W + b.x * RS) return { why: 'A train is on that stretch' };
  // take the inner pieces up (just from the grid, for planning), plan, then put everything back
  const saved: [number, number][] = [];
  for (const b of inner) for (let j = 0; j < RS; j++) for (let i2 = 0; i2 < RS; i2++) { const t = (b.y * RS + j) * W + b.x * RS + i2; saved.push([t, G.grid[t]]); G.grid[t] = 0; }
  let plan: RailPlan;
  try { plan = planRail(ax * RS, ay * RS, bx * RS, by * RS); }
  finally { for (const [t, id] of saved) G.grid[t] = id; }
  if (!plan.ok) return { why: plan.why || 'No smoother route fits there' };
  return { remove: inner.map(b => ({ x: b.x * RS, y: b.y * RS })), plan };
}
