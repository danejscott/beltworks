// Sweeping rail curves (visual + train motion). Track is still laid on the tile grid (that's what routing, signals and
// stations use), but every plain stretch of track — a chain of tiles with one route each, no junctions — is drawn,
// and ridden, as one smooth line through its tiles: hard 90° corners become wide arcs, and "staircase" diagonals become
// clean 45° lines. The ends of a chain stay pinned where it meets a junction, station or the end of the track.
import { DX, DY } from './util';
import { G, PAIRS } from './world';
import { W } from './terrain';

export interface RChain { tiles: number[]; P: [number, number][]; loop: boolean; off: number }
let cacheRev = -1;
let chains: RChain[] = [];
let byTile = new Map<number, { c: RChain; j: number }>();

/** how smooth: more passes = wider curves (each pass spreads a corner over more tiles) */
const PASSES = 12;
/** never let the drawn line stray further than this from its tile's centre (keeps it on its own tiles) */
const MAX_OFF = 1.0;
/** pinned points past each end of a stretch (keeps the curve in line with the track it joins) */
const PAD = 3;

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
const step = (i: number, s: number) => i + DY[s] * W + DX[s];
/** does the neighbouring tile's track connect back through side s? */
function connects(i: number, s: number) {
  const n = rail(step(i, s));
  if (!n) return false;
  const back = (s + 2) & 3;
  for (let b = 0; b < 6; b++) if (n.pairs & (1 << b) && (PAIRS[b][0] === back || PAIRS[b][1] === back)) return true;
  return false;
}
const cx = (i: number) => i % W + 0.5, cy = (i: number) => Math.floor(i / W) + 0.5;

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
    // the points: (pinned end) + tile centres + (pinned end)
    const P: [number, number][] = tiles.map(i => [cx(i), cy(i)]);
    const fixed: boolean[] = tiles.map(() => false);
    let off = 0;
    if (!loop) {
      const a = tiles[0], sa = sidesOf(a)!, na = tiles.length > 1 ? tiles[1] : -1;
      const outA = step(a, sa[0]) === na ? sa[1] : sa[0];
      const b = tiles[tiles.length - 1], sb = sidesOf(b)!, nb = tiles.length > 1 ? tiles[tiles.length - 2] : -1;
      const outB = tiles.length === 1 ? (outA === sb[0] ? sb[1] : sb[0]) : (step(b, sb[0]) === nb ? sb[1] : sb[0]);
      P.unshift([cx(a) + DX[outA] * 0.5, cy(a) + DY[outA] * 0.5]); fixed.unshift(true);
      P.push([cx(b) + DX[outB] * 0.5, cy(b) + DY[outB] * 0.5]); fixed.push(true);
      // a few pinned points continuing straight past each end, so the curve leaves the end in line with the track there
      for (let k = 1; k <= PAD; k++) {
        P.unshift([P[0][0] + DX[outA], P[0][1] + DY[outA]]); fixed.unshift(true);
        P.push([P[P.length - 1][0] + DX[outB], P[P.length - 1][1] + DY[outB]]); fixed.push(true);
      }
      off = 1 + PAD;
    }
    const n = P.length;
    if (n >= 4) {
      const orig = P.map(p => [p[0], p[1]] as [number, number]);
      let A = P.map(p => [p[0], p[1]] as [number, number]);
      for (let k = 0; k < PASSES; k++) {
        const B = A.map(p => [p[0], p[1]] as [number, number]);
        for (let i = 0; i < n; i++) {
          if (fixed[i]) continue;
          // 5-point binomial blur: wide enough to see past a pinned end, so curves leave ends in line with the track
          const at = (k: number) => A[loop ? ((k % n) + n) % n : Math.max(0, Math.min(n - 1, k))];
          const p2 = at(i - 2), p1 = at(i - 1), n1 = at(i + 1), n2 = at(i + 2);
          B[i][0] = (p2[0] + 4 * p1[0] + 6 * A[i][0] + 4 * n1[0] + n2[0]) / 16;
          B[i][1] = (p2[1] + 4 * p1[1] + 6 * A[i][1] + 4 * n1[1] + n2[1]) / 16;
        }
        // stop at the widest curve that still stays on the track's own tiles (clamping instead would put kinks back in)
        let worst = 0;
        for (let i = 0; i < n; i++) if (!fixed[i]) worst = Math.max(worst, Math.hypot(B[i][0] - orig[i][0], B[i][1] - orig[i][1]));
        if (worst > MAX_OFF) break;
        A = B;
      }
      for (let i = 0; i < n; i++) P[i] = A[i];
    }
    if (!loop) { P.splice(0, PAD); P.splice(P.length - PAD, PAD); off = 1; }
    const c: RChain = { tiles, P, loop, off };
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
  if (!h) return [cx(i), cy(i)];
  return h.c.P[h.j + h.c.off];
}
/** a point fraction f of the way from tile a's track to tile b's (for trains) */
export function railPos(a: number, b: number, f: number): [number, number] {
  const A = railCenter(a), B = a === b ? A : railCenter(b);
  return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
}
