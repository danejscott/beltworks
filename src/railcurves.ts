// Smooth rail curves (visual): a simple corner with straight track on both sides is drawn — and ridden — as
// one wide arc (radius 1.5 tiles) instead of a tight quarter-tile turn. Placement and routing stay on the grid.
import { DX, DY } from './util';
import { G, PAIRS } from './world';
import { W } from './terrain';

export interface Curve { cx: number; cy: number; a: number; b: number; ox: number; oy: number }
let cacheRev = -1;
let byTile = new Map<number, Curve>();      // every tile a curve covers -> the curve
let corners: Curve[] = [];

const bitsOf = (p: number) => { let n = 0; for (let i = 0; i < 6; i++) if (p & (1 << i)) n++; return n; };
function railAtXY(x: number, y: number) {
  const id = G.grid[y * W + x];
  const e = id ? G.ents.get(id) : null;
  return e && e.type === 'rail' ? e : null;
}
/** is this rail tile a plain straight along the axis of side s (and nothing else)? */
function plainStraight(x: number, y: number, s: number) {
  const r = railAtXY(x, y);
  if (!r || r.sig || bitsOf(r.pairs) !== 1) return false;
  return !!(r.pairs & (1 << (s & 1 ? 1 : 0)));   // bit 0 = E-W straight, bit 1 = N-S straight
}
function rebuild() {
  cacheRev = G.railRev;
  byTile = new Map(); corners = [];
  if (!G.L) return;
  for (const r of G.L.rails) {
    if (r.sig || bitsOf(r.pairs) !== 1) continue;
    let bit = -1; for (let i = 2; i < 6; i++) if (r.pairs & (1 << i)) bit = i;
    if (bit < 0) continue;
    const [a, b] = PAIRS[bit];
    const ax = r.x + DX[a], ay = r.y + DY[a], bx = r.x + DX[b], by = r.y + DY[b];
    const ti = r.y * W + r.x, ta = ay * W + ax, tb = by * W + bx;
    if (byTile.has(ti) || byTile.has(ta) || byTile.has(tb)) continue;
    if (!plainStraight(ax, ay, a) || !plainStraight(bx, by, b)) continue;
    const c: Curve = { cx: r.x + 0.5, cy: r.y + 0.5, a, b, ox: r.x + 0.5 + 1.5 * (DX[a] + DX[b]), oy: r.y + 0.5 + 1.5 * (DY[a] + DY[b]) };
    corners.push(c);
    byTile.set(ti, c); byTile.set(ta, c); byTile.set(tb, c);
  }
}
export function railCurves(): { corners: Curve[]; byTile: Map<number, Curve> } {
  if (cacheRev !== G.railRev) rebuild();
  return { corners, byTile };
}
/** move a point riding the grid onto the smooth arc (for trains) */
export function onCurve(x: number, y: number): [number, number] {
  const { byTile } = railCurves();
  const c = byTile.get(Math.floor(y) * W + Math.floor(x));
  if (!c) return [x, y];
  const dx = x - c.ox, dy = y - c.oy, d = Math.hypot(dx, dy) || 1;
  return [c.ox + dx / d * 1.5, c.oy + dy / d * 1.5];
}
