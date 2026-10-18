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
  tiles: { x: number; y: number; p: number }[];      // new track: tile and its route bits
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
  const T = (q: { x: number; y: number; p: number }) => ({ x: q.x * RS, y: q.y * RS, p: q.p });
  return { ...p, tiles: p.tiles.map(T), junc: p.junc.map(T), pts: p.pts.map(([x, y]) => [x * RS, y * RS] as [number, number]), snapEnd: p.snapEnd && { x: p.snapEnd.x * RS, y: p.snapEnd.y * RS } };
}
function planB(sx: number, sy: number, ex: number, ey: number): RailPlan {
  // starting near the end of some track (not on track): start from that end, so it joins on
  if (!rail(sx, sy)) { const sn = snapEndB(sx, sy); if (sn && Math.abs(sn.x - sx) + Math.abs(sn.y - sy) <= 2) { sx = sn.x; sy = sn.y; } }
  M = 2;
  const p = planM(sx, sy, ex, ey, false);
  if (p.ok || !p.why) return p;
  // nothing smooth fits: allow tighter bends and a shorter straight run onto the end
  M = 1;
  const q = planM(sx, sy, ex, ey, true);
  M = 2;
  return q.ok ? q : p;
}
function planM(sx: number, sy: number, ex: number, ey: number, tight: boolean): RailPlan {
  const dd = Math.abs(ex - sx) >= Math.abs(ey - sy) ? (ex >= sx ? 0 : 2) : (ey >= sy ? 1 : 3);
  const fail = (why: string): RailPlan => ({ tiles: [], junc: [], pts: why ? [[sx + 0.5, sy + 0.5], [ex + 0.5, ey + 0.5]] : [], dirA: (dd + 2) & 3, dirB: dd, snapEnd: null, ok: false, why });
  const sidesAt = (x: number, y: number) => { const r = rail(x, y); return r ? sidesOf(r.pairs) : 0; };
  // ---- where it starts: open ground, an open end (carry straight on), or anywhere on existing track (branch off it)
  const startEnd = openEndB(sx, sy);
  const startOnTrack = !!rail(sx, sy);
  // ---- where it ends: a nearby open end (snaps), any existing track (joins it), or open ground
  let goal: { x: number; y: number; arrive: number; kind: 'end' | 'join' | 'free' };
  const sn = snapEndB(ex, ey, { x: sx, y: sy });
  if (sn) goal = { x: sn.x, y: sn.y, arrive: (sn.side + 2) & 3, kind: 'end' };
  else if (rail(ex, ey) && !(ex === sx && ey === sy)) goal = { x: ex, y: ey, arrive: -1, kind: 'join' };
  else goal = { x: ex, y: ey, arrive: -1, kind: 'free' };
  if (goal.x === sx && goal.y === sy) return fail('');

  // ---- search: state = block, heading, blocks since the last bend (capped), phase on diagonals. Existing track can be
  // driven along (cheap — it's reused), branched off or crossed; every place the new route meets it gets the missing
  // connection added (a junction or a level crossing).
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
  if (startEnd >= 0) push(hf(sx, sy), { x: sx, y: sy, h: startEnd * 2, n: 1, ph: 0, g: 0, last: -1, prev: null, side: startEnd });
  else if (startOnTrack) for (let s2 = 0; s2 < 4; s2++) push(hf(sx, sy), { x: sx, y: sy, h: s2 * 2, n: M, ph: 0, g: 0, last: -1, prev: null, side: s2 });
  else for (let h = 0; h < 8; h++) push(hf(sx, sy), { x: sx, y: sy, h, n: M, ph: 0, g: 0, last: -1, prev: null, side: -1 });
  let found: S | null = null, iter = 0;
  while (open.length && iter++ < 220000) {
    const [, s] = pop();
    const k = key(s.x, s.y, s.h, s.n, s.ph);
    if ((best.get(k) ?? 1e9) < s.g) continue;
    for (const dh of [0, -1, 1]) {
      if (dh && s.n < M) continue;
      const h = (s.h + dh + 8) & 7;
      // the next move: along the heading, or (diagonal) alternating its two directions — starting with the turn
      let mv: number, ph = 0;
      if (!(h & 1)) mv = h >> 1;
      else { const c = comps(h); if (dh || s.last < 0) { mv = c[0] === s.last ? c[1] : c[0]; ph = mv === c[0] ? 1 : 0; } else { mv = c[s.ph]; ph = s.ph ^ 1; } }
      if (s.last >= 0 && mv === ((s.last + 2) & 3)) continue;   // never double back
      if (!s.prev && s.side >= 0 && mv !== s.side) continue;      // leave the start through its chosen side
      const nx = s.x + DX[mv], ny = s.y + DY[mv];
      const onRail = !!rail(nx, ny), entry = (mv + 2) & 3;
      let step = 1;
      if (onRail) step = sidesAt(nx, ny) & (1 << entry) ? 0.8 : 1.7;   // following existing track is cheap; cutting across it less so
      else {
        // keep a little space from other track (except where it starts and where it joins)
        if (Math.abs(nx - sx) + Math.abs(ny - sy) > 2 && Math.abs(nx - goal.x) + Math.abs(ny - goal.y) > 2)
          for (let dy = -1; dy <= 1 && step === 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && rail(nx + dx, ny + dy)) { step = 1.6; break; }
      }
      const g = s.g + step + (dh ? (tight ? 0.5 : 1.1) + (s.n < M + 2 ? 0.7 : 0) : 0);
      const n = dh ? 1 : Math.min(M, s.n + 1);
      const ns: S = { x: nx, y: ny, h, n, ph, g, last: mv, prev: s, side: -1 };
      // reaching the goal
      if (nx === goal.x && ny === goal.y) {
        if (goal.kind === 'end' && (mv !== goal.arrive || h !== goal.arrive * 2 || n < M)) continue;   // come in straight, not off a bend
        if (goal.kind === 'join' && h !== mv * 2) continue;                                               // meet it on a straight
        found = ns; break;
      }
      if (!inBox(nx, ny) || (!onRail && !blockFree(nx, ny))) continue;
      const nk = key(nx, ny, h, n, ph);
      if ((best.get(nk) ?? 1e9) <= ns.g) continue;
      best.set(nk, ns.g);
      push(ns.g + hf(nx, ny), ns);
    }
    if (found) break;
  }
  if (!found) return fail('No route there — try a bit further away, or around obstacles');
  // ---- turn the search result into track: new pieces, plus connections added to existing pieces it meets
  const steps: { x: number; y: number; mv: number }[] = [];
  for (let s: S | null = found; s && s.prev; s = s.prev) steps.push({ x: s.x, y: s.y, mv: s.last });
  steps.reverse();   // steps[i] = the block reached by move steps[i].mv
  const tiles: RailPlan['tiles'] = [], junc: RailPlan['junc'] = [];
  const addJ = (x: number, y: number, p: number) => { const r = rail(x, y); if (r && (r.pairs & p) !== p) junc.push({ x, y, p }); };
  const first = steps[0].mv;
  // the start: new ground, an open end (already points this way), or a branch off the piece it starts on
  if (!startOnTrack) tiles.push({ x: sx, y: sy, p: pairBit((first + 2) & 3, first) });
  else if (startEnd < 0) {
    const sd = sidesAt(sx, sy), back = (first + 2) & 3;
    const from = sd & (1 << back) ? back : [0, 1, 2, 3].find(q => q !== first && sd & (1 << q))!;   // straight through if it can
    if (from !== undefined) addJ(sx, sy, pairBit(from, first));
  }
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i], last = i === steps.length - 1, entry = (st.mv + 2) & 3;
    if (last && goal.kind === 'end') break;
    let exit: number;
    if (!last) exit = steps[i + 1].mv;
    else if (goal.kind === 'join') { const sd = sidesAt(st.x, st.y); exit = sd & (1 << st.mv) ? st.mv : [0, 1, 2, 3].find(q => q !== entry && sd & (1 << q))!; }
    else exit = st.mv;
    if (exit === undefined || exit === entry) continue;
    if (rail(st.x, st.y)) addJ(st.x, st.y, pairBit(entry, exit));
    else tiles.push({ x: st.x, y: st.y, p: pairBit(entry, exit) });
  }
  const pts: [number, number][] = [[sx + 0.5, sy + 0.5], ...steps.map(s => [s.x + 0.5, s.y + 0.5] as [number, number])];   // (block units; planRail scales them)
  const dirA = (first + 2) & 3, dirB = steps[steps.length - 1].mv;
  return { tiles, junc, pts, dirA, dirB, snapEnd: goal.kind === 'free' ? null : { x: goal.x, y: goal.y }, ok: true };
}
