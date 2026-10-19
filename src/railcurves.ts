// Sweeping rail curves (visual + train motion). Track is still laid on the (2-tile) rail grid (that's what routing, signals and
// stations use), but every plain stretch of track — a chain of tiles with one route each, no junctions — is drawn,
// and ridden, as one smooth line: the path through the points where the track crosses from tile to tile is made of
// straight runs and clean 45° diagonals, and every bend is replaced by a true circular arc — as wide as fits without
// leaving the track's own tiles or reaching over neighbouring track — sampled finely so it looks round.
import { DX, DY } from './util';
import { G, PAIRS } from './world';
import { W } from './terrain';
import { RS, rStep } from './railgrid';

export interface RChain { tiles: number[]; curve: [number, number][]; centers: [number, number][]; loop: boolean; pairs: number[] }
let cacheRev = -1;
let chains: RChain[] = [];
let byTile = new Map<number, { c: RChain; j: number }[]>();

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

// Every route through a block (a junction has several) is a node; nodes join up into chains wherever a side is used
// by exactly one route on both blocks either side of it. So a junction's every route is smoothed together with the
// track leading into it, and chains only break at switch points (where routes split), never at a sharp corner.
const sidesOfPair = (k: number): [number, number] => [PAIRS[k][0], PAIRS[k][1]];
/** the one route of block i that uses side s (or -1 if none / several: a switch point) */
function routeOn(i: number, s: number): number {
  const r = rail(i);
  if (!r || r.x + r.y * W !== i) return -1;
  let found = -1;
  for (let k = 0; k < 6; k++) if (r.pairs & (1 << k) && (PAIRS[k][0] === s || PAIRS[k][1] === s)) { if (found >= 0) return -1; found = k; }
  return found;
}
function rebuild() {
  cacheRev = G.railRev;
  chains = []; byTile = new Map();
  if (!G.L) return;
  const seen = new Set<number>();
  /** the node through side s of node (i, k), if the track carries straight on into exactly one route there */
  const next = (i: number, k: number, s: number): [number, number] | null => {
    if (routeOn(i, s) !== k) return null;
    const n = step(i, s), k2 = routeOn(n, (s + 2) & 3);
    return k2 >= 0 ? [n, k2] : null;
  };
  const mid = (i: number, s: number): Pt => [cx(i) + DX[s] * RS / 2, cy(i) + DY[s] * RS / 2];
  for (const r of G.L.rails) {
    const i0 = r.y * W + r.x;
    for (let k0 = 0; k0 < 6; k0++) {
      if (!(r.pairs & (1 << k0)) || seen.has(i0 * 8 + k0)) continue;
      // walk back to the start of this chain (or all the way round a loop)
      let ci = i0, ck = k0, out = sidesOfPair(k0)[0], loop = false;
      for (let guard = 0; guard < 200000; guard++) {
        const nx = next(ci, ck, out);
        if (!nx) break;
        if (nx[0] === i0 && nx[1] === k0) { loop = true; break; }
        const [a, b] = sidesOfPair(nx[1]), into = (out + 2) & 3;
        ci = nx[0]; ck = nx[1]; out = a === into ? b : a;
      }
      // now walk forward from that end, collecting the chain: nodes and the side each is entered by
      const tiles: number[] = [], pairs: number[] = [], entries: number[] = [];
      let ti = ci, tk = ck, ent = out;
      for (let guard = 0; guard < 200000; guard++) {
        tiles.push(ti); pairs.push(tk); entries.push(ent); seen.add(ti * 8 + tk);
        const [a, b] = sidesOfPair(tk), ex = a === ent ? b : a;
        const nx = next(ti, tk, ex);
        if (!nx || seen.has(nx[0] * 8 + nx[1])) break;
        ti = nx[0]; tk = nx[1]; ent = (ex + 2) & 3;
      }
      const tileSet = new Set(tiles);
      const n = tiles.length;
      const exitOf = (j: number) => { const [a, b] = sidesOfPair(pairs[j]); return a === entries[j] ? b : a; };
      // the path through the points where the track crosses from block to block (straight runs and 45° diagonals)
      const P: Pt[] = loop ? tiles.map((t, j) => mid(t, entries[j])) : [mid(tiles[0], entries[0]), ...tiles.map((t, j) => mid(t, exitOf(j)))];
      // bends beside other track get only a little room, so curves never reach over it
      const cutAt = (q: number) => {
        const t = tiles[Math.max(0, Math.min(n - 1, loop ? q : q - 1))], x = t % W, y = (t / W) | 0;
        for (let dy = -RS; dy <= RS; dy += RS) for (let dx = -RS; dx <= RS; dx += RS) {
          const ni = (y + dy) * W + x + dx;
          if ((dx || dy) && rail(ni) && !tileSet.has(ni)) return CUT_NEAR;
        }
        return CUT;
      };
      const curve = filletLine(P, loop, cutAt);
      // where each node's track is (for trains): the curve point nearest the middle of that node's piece of path
      const centers: Pt[] = [];
      let hint = 0;
      for (let j = 0; j < n; j++) {
        const a = P[j], b = loop ? P[(j + 1) % n] : P[j + 1];
        const [q, h] = nearestOn(curve, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], hint);
        centers.push(q); hint = h;
      }
      const c: RChain = { tiles, curve, centers, loop, pairs };
      chains.push(c);
      tiles.forEach((t, j) => { let l = byTile.get(t); if (!l) byTile.set(t, l = []); l.push({ c, j }); });
    }
  }
}
export function railChains() {
  if (cacheRev !== G.railRev) rebuild();
  return { chains, byTile };
}
/** where the (smoothed) track passes through block i — on the route that leads toward block `toward`, if given */
export function railCenter(i: number, toward = -1): [number, number] {
  const l = railChains().byTile.get(i);
  if (!l || !l.length) return [cx(i), cy(i)];
  if (toward >= 0 && l.length > 1) {
    for (let s = 0; s < 4; s++) if (step(i, s) === toward) {
      for (const h of l) { const k = h.c.pairs[h.j]; if (PAIRS[k][0] === s || PAIRS[k][1] === s) return h.c.centers[h.j]; }
    }
  }
  return l[0].c.centers[l[0].j];
}
/** a point fraction f of the way from block a's track to block b's (for trains) */
export function railPos(a: number, b: number, f: number): [number, number] {
  const A = railCenter(a, b), B = a === b ? A : railCenter(b, a);
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
