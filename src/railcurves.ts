// Sweeping rail curves (visual + train motion). Track is still laid on the (2-tile) rail grid (that's what routing, signals and
// stations use), but every plain stretch of track — a chain of tiles with one route each, no junctions — is drawn,
// and ridden, as one smooth line: the path through the points where the track crosses from tile to tile is made of
// straight runs and clean 45° diagonals, and every bend is replaced by a true circular arc — as wide as fits without
// leaving the track's own tiles or reaching over neighbouring track — sampled finely so it looks round.
import { DX, DY } from './util';
import { G, PAIRS } from './world';
import { W } from './terrain';
import { RS, rStep } from './railgrid';

export interface RChain { tiles: number[]; curve: [number, number][]; centers: [number, number][]; loop: boolean }
let cacheRev = -1;
let chains: RChain[] = [];
let byTile = new Map<number, { c: RChain; j: number }>();

/** widest bend radius (tiles) */
const R_MAX = 9 * RS;
/** how far (tiles) a bend may cut inside the track's path: in open ground / right beside other track */
const CUT = 0.45 * RS, CUT_NEAR = 0.14 * RS;

const bits = (p: number) => { let n = 0; for (let i = 0; i < 6; i++) if (p & (1 << i)) n++; return n; };
function rail(i: number) {
  const id = G.grid[i];
  const e = id ? G.ents.get(id) : null;
  return e && e.type === 'rail' ? e : null;
}
/** a tile with exactly one route through it: its two sides */
function sidesOf(i: number): [number, number] | null {
  const r = rail(i);
  if (!r || bits(r.pairs) !== 1) return null;
  for (let b = 0; b < 6; b++) if (r.pairs & (1 << b)) return [PAIRS[b][0], PAIRS[b][1]];
  return null;
}
const step = rStep;
/** does the neighbouring tile's track connect back through side s? */
function connects(i: number, s: number) {
  const n = rail(step(i, s));
  if (!n) return false;
  const back = (s + 2) & 3;
  for (let b = 0; b < 6; b++) if (n.pairs & (1 << b) && (PAIRS[b][0] === back || PAIRS[b][1] === back)) return true;
  return false;
}
const cx = (i: number) => i % W + RS / 2, cy = (i: number) => Math.floor(i / W) + RS / 2;

type Pt = [number, number];
/** replace every bend of a polyline with a circular arc and sample it finely. cut(i) = how far the arc at input point
 *  i may cut inside the corner. The ends of an open line stay exactly where they are. */
export function filletLine(P: Pt[], loop: boolean, cut: (i: number) => number): Pt[] {
  // drop repeated and in-line points: what's left are the real bends
  const V: Pt[] = [], vi: number[] = [];
  P.forEach((p, i) => { const l = V[V.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 1e-6) { V.push(p); vi.push(i); } });
  const keep: Pt[] = [], src: number[] = [];
  const n0 = V.length;
  for (let i = 0; i < n0; i++) {
    if (!loop && (i === 0 || i === n0 - 1)) { keep.push(V[i]); src.push(vi[i]); continue; }
    const a = V[(i - 1 + n0) % n0], b = V[i], c = V[(i + 1) % n0];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) > 1e-6) { keep.push(b); src.push(vi[i]); }
  }
  const n = keep.length;
  if (n < 3) return loop ? [...V, V[0]] : keep;
  const isEnd = (i: number) => !loop && (i === 0 || i === n - 1);
  // per bend: turn angle and tangent length (how far back from the corner the arc starts)
  const t: number[] = new Array(n).fill(0), th: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (isEnd(i)) continue;
    const a = keep[(i - 1 + n) % n], b = keep[i], c = keep[(i + 1) % n];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const cosT = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    th[i] = Math.acos(Math.max(-1, Math.min(1, cosT)));
    // the widest radius that keeps the middle of the arc within `cut` of the corner
    const rCut = cut(src[i]) / Math.max(1e-6, 1 / Math.cos(th[i] / 2) - 1);
    t[i] = Math.min(R_MAX, rCut) * Math.tan(th[i] / 2);
  }
  // neighbouring bends share the straight between them
  for (let i = 0; i < (loop ? n : n - 1); i++) {
    const j = (i + 1) % n, a = keep[i], b = keep[j], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const need = t[i] + t[j];
    if (need > L) { const k = L / need; t[i] *= k; t[j] *= k; }
  }
  // sample: the arcs in small steps, straight between them
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const b = keep[i];
    if (isEnd(i) || t[i] < 1e-4) { out.push(b); continue; }
    const a = keep[(i - 1 + n) % n], c = keep[(i + 1) % n];
    const ul = Math.hypot(b[0] - a[0], b[1] - a[1]), vl = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const u: Pt = [(b[0] - a[0]) / ul, (b[1] - a[1]) / ul], v: Pt = [(c[0] - b[0]) / vl, (c[1] - b[1]) / vl];
    const A: Pt = [b[0] - u[0] * t[i], b[1] - u[1] * t[i]];
    const r = t[i] / Math.tan(th[i] / 2);
    const side = Math.sign(u[0] * v[1] - u[1] * v[0]);              // which way it turns
    const ox = A[0] - u[1] * r * side, oy = A[1] + u[0] * r * side;   // centre of the arc
    const a0 = Math.atan2(A[1] - oy, A[0] - ox);
    const steps = Math.max(2, Math.ceil(th[i] * r / 0.25));
    for (let k = 0; k <= steps; k++) { const an = a0 + side * th[i] * k / steps; out.push([ox + Math.cos(an) * r, oy + Math.sin(an) * r]); }
  }
  if (loop && out.length) out.push(out[0]);
  return out;
}
/** nearest point of a sampled curve to p (searching from index hint onward) */
function nearestOn(curve: Pt[], p: Pt, hint: number): [Pt, number] {
  let best: Pt = curve[0], bi = 0, bd = 1e9;
  const lo = Math.max(0, hint - 8), hi = Math.min(curve.length - 1, hint + 80);
  for (let i = lo; i < hi; i++) {
    const a = curve[i], b = curve[i + 1], vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy || 1;
    let k = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L; k = Math.max(0, Math.min(1, k));
    const q: Pt = [a[0] + vx * k, a[1] + vy * k], d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
    if (d < bd) { bd = d; best = q; bi = i; }
  }
  return [best, bi];
}

function rebuild() {
  cacheRev = G.railRev;
  chains = []; byTile = new Map();
  if (!G.L) return;
  const seen = new Set<number>();
  for (const r of G.L.rails) {
    const start = r.y * W + r.x;
    if (seen.has(start) || !sidesOf(start)) continue;
    // walk back to the start of this chain (or all the way round a loop)
    let cur = start, from = -1, loop = false, endSide = -1;
    for (let guard = 0; guard < 200000; guard++) {
      const sd = sidesOf(cur)!;
      const s = sd[0] === from ? sd[1] : sd[0];   // keep going away from where we came from
      if (!connects(cur, s) || !sidesOf(step(cur, s))) { endSide = s; break; }   // dead end or junction: the chain starts here
      const nx = step(cur, s);
      if (nx === start) { loop = true; endSide = (s + 2) & 3; cur = start; break; }
      from = (s + 2) & 3; cur = nx;
    }
    // now walk forward from that end, collecting the chain
    const tiles: number[] = [];
    let prevSide = endSide;
    let t = cur;
    for (let guard = 0; guard < 200000; guard++) {
      tiles.push(t); seen.add(t);
      const sd = sidesOf(t)!;
      const s = sd[0] === prevSide ? sd[1] : sd[0];
      if (!connects(t, s)) break;
      const nx = step(t, s);
      if (!sidesOf(nx) || seen.has(nx)) break;
      prevSide = (s + 2) & 3; t = nx;
    }
    const tileSet = new Set(tiles);
    const n = tiles.length;
    // the path through the points where the track crosses from tile to tile (straight runs and 45° diagonals)
    const mid = (i: number, j: number): Pt => [(cx(i) + cx(j)) / 2, (cy(i) + cy(j)) / 2];
    let P: Pt[];
    if (loop) P = tiles.map((tt, j) => mid(tiles[(j - 1 + n) % n], tt));
    else {
      const a = tiles[0], sa = sidesOf(a)!, na = n > 1 ? tiles[1] : -1;
      const outA = step(a, sa[0]) === na ? sa[1] : sa[0];
      const b = tiles[n - 1], sb = sidesOf(b)!, nb = n > 1 ? tiles[n - 2] : -1;
      const outB = n === 1 ? (outA === sb[0] ? sb[1] : sb[0]) : (step(b, sb[0]) === nb ? sb[1] : sb[0]);
      P = [[cx(a) + DX[outA] * RS / 2, cy(a) + DY[outA] * RS / 2]];
      for (let j = 0; j + 1 < n; j++) P.push(mid(tiles[j], tiles[j + 1]));
      P.push([cx(b) + DX[outB] * RS / 2, cy(b) + DY[outB] * RS / 2]);
    }
    // bends beside other track get only a little room, so curves never reach over it
    const cutAt = (k: number) => {
      const ti = tiles[Math.max(0, Math.min(n - 1, loop ? k : k - 1))], x = ti % W, y = (ti / W) | 0;
      for (let dy = -RS; dy <= RS; dy += RS) for (let dx = -RS; dx <= RS; dx += RS) {
        const ni = (y + dy) * W + x + dx;
        if ((dx || dy) && rail(ni) && !tileSet.has(ni)) return CUT_NEAR;
      }
      return CUT;
    };
    const curve = filletLine(P, loop, cutAt);
    // where each tile's track is (for trains): the curve point nearest the middle of that tile's piece of path
    const centers: Pt[] = [];
    let hint = 0;
    for (let j = 0; j < n; j++) {
      const a = P[j], b = loop ? P[(j + 1) % n] : P[j + 1];
      const [q, i] = nearestOn(curve, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], hint);
      centers.push(q); hint = i;
    }
    const c: RChain = { tiles, curve, centers, loop };
    chains.push(c);
    tiles.forEach((ti, j) => byTile.set(ti, { c, j }));
  }
}
export function railChains() {
  if (cacheRev !== G.railRev) rebuild();
  return { chains, byTile };
}
/** where the (smoothed) track passes through tile i */
export function railCenter(i: number): [number, number] {
  const h = railChains().byTile.get(i);
  return h ? h.c.centers[h.j] : [cx(i), cy(i)];
}
/** a point fraction f of the way from tile a's track to tile b's (for trains) */
export function railPos(a: number, b: number, f: number): [number, number] {
  const A = railCenter(a), B = a === b ? A : railCenter(b);
  return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
}
/** the smooth line a planned stretch of track will have (placement preview): tile centres from start to end, and
 *  the directions the track continues straight past each end */
export function previewLine(pts: Pt[], dirA: number, dirB: number): Pt[] {
  if (pts.length < 2) return pts;
  const P: Pt[] = [[pts[0][0] + DX[dirA] * RS / 2, pts[0][1] + DY[dirA] * RS / 2]];
  for (let j = 0; j + 1 < pts.length; j++) P.push([(pts[j][0] + pts[j + 1][0]) / 2, (pts[j][1] + pts[j + 1][1]) / 2]);
  P.push([pts[pts.length - 1][0] + DX[dirB] * RS / 2, pts[pts.length - 1][1] + DY[dirB] * RS / 2]);
  return filletLine(P, false, () => CUT);
}
