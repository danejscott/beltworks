import { MP, vctx } from './teams';
import { BLD } from './data';
import { H, W } from './terrain';
import { DX, DY, opp } from './util';
import { addInv, borderTiles, canAfford, Ent, entAt, G, Line, markDirty, missingText, pairBit, pay, place, railAt, railExits, railSides, refund, Train } from './world';
import { TT } from './terrain';
import { railPairsForPath, smartJunction } from './cmd';

export const WAGON_CAP = 2000;
const ACC = 5, DEC = 7;
export const trainMax = () => 18 * (G.S.shop.express ? 1.5 : 1);
export const wagonsOf = (t: Train) => t.cars.filter(c => c === 'wagon').length;
export const trainCap = (t: Train) => wagonsOf(t) * WAGON_CAP;

const tx = (i: number) => i % W, ty = (i: number) => Math.floor(i / W);
function sideToward(a: number, b: number) {
  const dx = tx(b) - tx(a), dy = ty(b) - ty(a);
  for (let d = 0; d < 4; d++) if (DX[d] === dx && DY[d] === dy) return d;
  return -1;
}

/** walk n tiles along the track from tile `start` leaving via side `exit` */
function walk(start: number, exit: number, n: number, prefer = true): number[] | null {
  const out: number[] = [];
  let cur = start, ex = exit;
  for (let k = 0; k < n; k++) {
    const nx = tx(cur) + DX[ex], ny = ty(cur) + DY[ex];
    const ni = ny * W + nx;
    const r = railAt(ni);
    if (!r) return null;
    const entry = opp(ex);
    const exits = railExits(r.pairs, entry);
    if (!exits.length && k < n - 1) return null;
    if (!(railSides(r.pairs) & (1 << entry))) return null;
    out.push(ni);
    cur = ni;
    ex = prefer && exits.includes(opp(entry)) ? opp(entry) : exits[0];
    if (ex === undefined) { if (k < n - 1) return null; }
  }
  return out;
}
function occupiedByTrain(i: number, except?: Train) {
  for (const t of G.trains) if (t !== except && t.cells.includes(i)) return true;
  return false;
}

export function canPlaceTrain(x: number, y: number, rot: number): { cells?: number[]; err?: string } {
  const i = y * W + x, r = railAt(i);
  if (!r) return { err: 'Place the locomotive on a railway' };
  const sides = railSides(r.pairs);
  let back = opp(rot);
  if (!(sides & (1 << back))) { back = -1; for (let s = 0; s < 4; s++) if (sides & (1 << s)) { back = s; break; } }
  if (back < 0) return { err: 'Bad track' };
  const rest = walk(i, back, 3);
  if (!rest) return { err: 'Needs 4 tiles of connected track (loco + 1 wagon)' };
  const cells = [i, ...rest];
  for (const c of cells) if (occupiedByTrain(c)) return { err: 'Another train is in the way' };
  return { cells };
}
export function placeTrain(x: number, y: number, rot: number): Train | null {
  const { cells, err } = canPlaceTrain(x, y, rot);
  if (err) { G.fx.toast(err, 'bad'); G.fx.sfx('err'); return null; }
  const cost = { ...BLD.locomotive.cost };
  for (const k in BLD.wagon.cost) cost[k] = (cost[k] || 0) + BLD.wagon.cost[k];
  if (!canAfford(cost)) { G.fx.toast('Need: ' + missingText(cost), 'bad'); G.fx.sfx('err'); return null; }
  pay(cost);
  const t: Train = {
    id: G.nextId++, o: MP.teams ? MP.cur : 0, name: 'Train ' + (++G.S.trainSeq), cars: ['loco', 'wagon'], cells, frac: 0, route: [], v: 0,
    sched: [], si: 0, state: 'idle', cargo: {}, tot: 0, waitT: 0, idleT: 0, blockT: 0, running: true,
  };
  G.trains.push(t);
  G.fx.sfx('place');
  return t;
}
export function addWagon(t: Train) {
  if (t.frac > 0 || t.v > 0) { G.fx.toast('Stop the train first (or wait for it to arrive)', 'bad'); return; }
  const n = t.cells.length, tail = t.cells[n - 1], prev = t.cells[n - 2];
  const entry = sideToward(tail, prev);
  const r = railAt(tail);
  const exits = railExits(r.pairs, entry);
  if (!exits.length) { G.fx.toast('No track behind the train', 'bad'); G.fx.sfx('err'); return; }
  const ex = exits.includes(opp(entry)) ? opp(entry) : exits[0];
  const more = walk(tail, ex, 2);
  if (!more || more.some(c => occupiedByTrain(c) || t.cells.includes(c))) { G.fx.toast('Not enough free track behind the train', 'bad'); G.fx.sfx('err'); return; }
  if (!canAfford(BLD.wagon.cost)) { G.fx.toast('Need: ' + missingText(BLD.wagon.cost), 'bad'); G.fx.sfx('err'); return; }
  pay(BLD.wagon.cost);
  t.cells.push(...more); t.cars.push('wagon');
  G.fx.sfx('place');
}
export function removeWagon(t: Train) {
  if (wagonsOf(t) <= 0) return;
  if (t.frac > 0 || t.v > 0) { G.fx.toast('Stop the train first', 'bad'); return; }
  t.cars.pop(); t.cells.splice(t.cells.length - 2, 2);
  refund(BLD.wagon.cost);
  const cap = trainCap(t);
  while (t.tot > cap) { const k = Object.keys(t.cargo)[0]; const m = Math.min(t.cargo[k], t.tot - cap); t.cargo[k] -= m; t.tot -= m; addInv(k, m); if (!t.cargo[k]) delete t.cargo[k]; }
  G.fx.sfx('remove');
}
export function removeTrain(t: Train) {
  refund(BLD.locomotive.cost);
  refund(BLD.wagon.cost, wagonsOf(t));
  for (const k in t.cargo) addInv(k, t.cargo[k]);
  G.trains = G.trains.filter(x => x !== t);
  G.fx.sfx('remove');
}
export function trainAt(wx: number, wy: number): Train | null {
  const i = Math.floor(wy) * W + Math.floor(wx);
  for (const t of G.trains) if (t.cells.includes(i)) return t;
  return null;
}

// ---------------------------------------------------------------------------
function stationGoals(st: Ent): Set<number> {
  const s = new Set<number>();
  for (const [x, y] of borderTiles(st)) { const i = y * W + x; if (railAt(i)) s.add(i); }
  return s;
}
function bfs(start: number, entry: number, goals: Set<number>, blocked: Set<number> | null): number[] | null {
  const key = (i: number, s: number) => i * 4 + s;
  const prev = new Map<number, number>();
  const q: number[] = [key(start, entry)];
  prev.set(q[0], -1);
  let head = 0;
  while (head < q.length) {
    const k = q[head++], i = k >> 2, s = k & 3;
    if (i !== start && goals.has(i)) {
      const path: number[] = [];
      let c = k;
      while (c !== -1 && (c >> 2) !== start) { path.push(c >> 2); c = prev.get(c); }
      return path.reverse();
    }
    const r = railAt(i);
    if (!r) continue;
    for (const ex of railExits(r.pairs, s)) {
      const nx = tx(i) + DX[ex], ny = ty(i) + DY[ex], ni = ny * W + nx;
      const nr = railAt(ni);
      if (!nr) continue;
      const ne = opp(ex);
      if (!(railSides(nr.pairs) & (1 << ne))) continue;
      if (blocked && blocked.has(ni)) continue;
      const nk = key(ni, ne);
      if (prev.has(nk)) continue;
      prev.set(nk, k); q.push(nk);
      if (q.length > 400000) return null;
    }
  }
  return null;
}
function planRoute(t: Train, st: Ent): boolean {
  const goals = stationGoals(st);
  if (!goals.size) return false;
  if (goals.has(t.cells[0])) { t.route = []; return true; }
  if (!t.oneWay && goals.has(t.cells[t.cells.length - 1])) { t.cells.reverse(); t.frac = 0; t.route = []; return true; }
  const blocked = new Set<number>();
  for (const o of G.trains) if (o !== t) for (const c of o.cells) blocked.add(c);
  const tryFrom = (rev: boolean, blk: Set<number> | null) => {
    const cells = rev ? [...t.cells].reverse() : t.cells;
    const entry = sideToward(cells[0], cells[1]);
    return bfs(cells[0], entry, goals, blk);
  };
  for (const blk of [blocked, null]) {
    let p = tryFrom(false, blk);
    if (p) { t.route = p; return true; }
    if (t.oneWay) continue; // loop trains never reverse
    p = tryFrom(true, blk);
    if (p) { t.cells.reverse(); t.frac = 0; t.route = p; return true; }
  }
  return false;
}

export function updateTrains(dt: number) {
  const occ = G.trainOcc;
  occ.clear();
  for (const t of G.trains) { for (const c of t.cells) occ.set(c, t.id); if (t.route.length && t.frac > 0) occ.set(t.route[0], t.id); }
  if (G.railRev !== blocksRev && G.L) computeBlocks();
  blockOcc.clear();
  for (const [c, id] of occ) { const b = blocks.get(c); if (b !== undefined) { let st = blockOcc.get(b); if (!st) blockOcc.set(b, st = new Set()); st.add(id); } }
  releaseReservations();
  for (const t of G.trains) {
    if (!vctx(t)) continue;
    if (!t.running) { t.v = 0; if (t.frac === 0) t.state = 'stopped'; }
    if (!t.sched.length) { t.state = t.running ? 'noschedule' : 'stopped'; continue; }
    if (t.si >= t.sched.length) t.si = 0;
    const st = G.ents.get(t.sched[t.si]);
    if (!st) { t.sched.splice(t.si, 1); continue; }
    switch (t.state) {
      case 'stopped': case 'noschedule': case 'idle': case 'nopath':
        if (!t.running) break;
        t.waitT += dt;
        if (t.state === 'nopath' && t.waitT < 2) break;
        t.waitT = 0;
        t.state = planRoute(t, st) ? (t.route.length ? 'moving' : 'loading') : 'nopath';
        t.idleT = 0;
        break;
      case 'moving': {
        if (!t.route.length) { t.state = 'loading'; t.v = 0; t.frac = 0; t.waitT = 0; t.idleT = 0; break; }
        const nxt = t.route[0], who = occ.get(nxt);
        if (who !== undefined && who !== t.id) {
          t.v = 0; t.blockT += dt;
          if (t.blockT > 4) { t.blockT = 0; t.state = 'idle'; t.waitT = 99; }
          break;
        }
        t.blockT = 0;
        const tt = t as any;
        if (t.frac === 0 && !canEnter(t)) {   // red signal ahead
          t.v = 0; tt.sigWait = true; tt.sigT = (tt.sigT || 0) + dt;
          if (tt.sigT > 45) { tt.sigT = 0; t.state = 'idle'; t.waitT = 99; }
          break;
        }
        tt.sigWait = false; tt.sigT = 0;
        if (!t.running) { t.v = Math.max(0, t.v - DEC * 2 * dt); if (t.v === 0) break; }
        occ.set(nxt, t.id);
        const left = t.route.length - t.frac;
        const vAllow = Math.sqrt(2 * DEC * Math.max(0, left - 0.02)) + 0.3;
        if (t.running) t.v = Math.min(trainMax(), t.v + ACC * dt, vAllow);
        t.frac += t.v * dt;
        while (t.frac >= 1 && t.route.length) {
          const n = t.route.shift();
          t.cells.unshift(n); t.cells.pop();
          t.frac -= 1;
          if (t.route.length) {
            const w2 = occ.get(t.route[0]);
            if (w2 !== undefined && w2 !== t.id) { t.frac = 0; t.v = 0; break; }
            if (!canEnter(t)) { t.frac = 0; t.v = 0; break; }
            occ.set(t.route[0], t.id);
          }
        }
        if (!t.route.length) { t.frac = 0; t.v = 0; t.state = 'loading'; t.waitT = 0; t.idleT = 0; }
        break;
      }
      case 'loading': {
        t.waitT += dt;
        const moved = transfer(t, st, dt);
        t.idleT = moved ? 0 : t.idleT + dt;
        if ((t.waitT > 3 && t.idleT > 1.5) || t.waitT > 90) {
          t.si = (t.si + 1) % t.sched.length;
          t.state = 'idle'; t.waitT = 99;
        }
        break;
      }
    }
  }
}
function transfer(t: Train, st: Ent, dt: number): boolean {
  if (!st.pnet || st.pnet.sat < 0.05) return false;
  t['xacc'] = (t['xacc'] || 0) + dt * 150 * Math.max(1, wagonsOf(t));
  let n = Math.floor(t['xacc']);
  if (n <= 0) return true;
  t['xacc'] -= n;
  const cap = trainCap(t);
  let moved = 0;
  if (st.mode === 'load') {
    while (n > 0 && t.tot < cap && st.tot > 0) {
      const k = Object.keys(st.store)[0];
      const m = Math.min(n, st.store[k], cap - t.tot);
      st.store[k] -= m; st.tot -= m; if (!st.store[k]) delete st.store[k];
      t.cargo[k] = (t.cargo[k] || 0) + m; t.tot += m; n -= m; moved += m;
    }
  } else {
    const scap = BLD.station.cap;
    while (n > 0 && st.tot < scap && t.tot > 0) {
      const k = Object.keys(t.cargo)[0];
      const m = Math.min(n, t.cargo[k], scap - st.tot);
      t.cargo[k] -= m; t.tot -= m; if (!t.cargo[k]) delete t.cargo[k];
      st.store[k] = (st.store[k] || 0) + m; st.tot += m; n -= m; moved += m;
    }
    if (moved) G.S.flags.trainDelivered = (G.S.flags.trainDelivered || 0) + moved;
  }
  return moved > 0;
}
/** interpolated world positions for rendering: point k = position of cell k moving toward cell k-1 */
export function trainPoints(t: Train): number[][] {
  const pts: number[][] = [];
  const f = t.frac;
  for (let k = 0; k < t.cells.length; k++) {
    const a = t.cells[k];
    const b = k === 0 ? (t.route.length && f > 0 ? t.route[0] : a) : t.cells[k - 1];
    pts.push([tx(a) + 0.5 + (tx(b) - tx(a)) * f, ty(a) + 0.5 + (ty(b) - ty(a)) * f]);
  }
  return pts;
}


// ---------------------------------------------------------------------------
// Quick Route: find a path for track between two stations, lay it, and optionally add a train.
function heapPush(h: number[][], v: number[]) { h.push(v); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function heapPop(h: number[][]) {
  const top = h[0], last = h.pop()!;
  if (h.length) { h[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } }
  return top;
}
let railCost = 0.35, avoid: Set<number> | null = null;
function routable(i: number): number {
  // returns step cost or -1 if blocked
  const t = G.tiles[i];
  if (G.nodeGrid[i] || (G.featGrid && G.featGrid[i]) || (avoid && avoid.has(i))) return -1;
  const id = G.grid[i];
  if (id) { const e = G.ents.get(id); return e && e.type === 'rail' ? railCost : -1; }
  return t === TT.WATER || t === TT.DEEP ? 2.2 : t === TT.ROCK ? 1.4 : 1; // tunnels are allowed, slightly pricier than open ground
}
export function findRailPath(a: Ent, b: Ent, startTiles?: number[], goalTiles?: number[]): number[] | null {
  const starts = startTiles || borderTiles(a).map(([x, y]) => y * W + x).filter(i => i >= 0 && i < W * H && routable(i) >= 0);
  const goals = new Set(goalTiles || borderTiles(b).map(([x, y]) => y * W + x).filter(i => i >= 0 && i < W * H && routable(i) >= 0));
  if (!starts.length || !goals.size) return null;
  const gx = b.x + b.w / 2, gy = b.y + b.h / 2;
  const hf = (i: number) => (Math.abs(i % W - gx) + Math.abs(Math.floor(i / W) - gy)) * 1.05;
  const g = new Map<number, number>(), from = new Map<number, number>(), dirOf = new Map<number, number>();
  const heap: number[][] = [];
  for (const s of starts) { g.set(s, 0); from.set(s, -1); dirOf.set(s, -1); heapPush(heap, [hf(s), s]); }
  let found = -1, iter = 0;
  while (heap.length && iter++ < 1500000) {
    const [, i] = heapPop(heap);
    if (goals.has(i)) { found = i; break; }
    const gi = g.get(i)!, x = i % W, y = Math.floor(i / W), di = dirOf.get(i)!;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      const ni = ny * W + nx, c = routable(ni);
      if (c < 0) continue;
      const turn = di >= 0 && di !== d ? 0.8 : 0;
      const ng = gi + c + turn;
      const og = g.get(ni);
      if (og !== undefined && og <= ng) continue;
      g.set(ni, ng); from.set(ni, i); dirOf.set(ni, d);
      heapPush(heap, [ng + hf(ni), ni]);
    }
  }
  if (found < 0) return null;
  const path: number[] = [];
  for (let c = found; c !== -1; c = from.get(c)!) path.push(c);
  return path.reverse();
}
export function routeCost(path: number[]) {
  let n = 0;
  for (const i of path) if (!railAt(i)) n++;
  const c: Record<string, number> = {};
  for (const k in BLD.rail.cost) c[k] = BLD.rail.cost[k] * n;
  return { tiles: n, cost: c };
}
function layRails(path: number[]) {
  const pts = path.map((i, k) => {
    const x = i % W, y = Math.floor(i / W);
    const nxt = path[k + 1] ?? null, prv = path[k - 1];
    let d = 0;
    const from = nxt !== null ? i : prv, to = nxt !== null ? nxt : i;
    for (let dd = 0; dd < 4; dd++) if ((from % W) + DX[dd] === to % W && Math.floor(from / W) + DY[dd] === Math.floor(to / W)) d = dd;
    return { x, y, d };
  });
  const pairs = railPairsForPath(pts);
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], e = entAt(p.x, p.y);
    if (e) { if (e.type === 'rail') e.pairs = e.pairs | smartJunction(e.pairs, pairs[k], pts, k); }
    else { const r = place('rail', p.x, p.y, 0, { quiet: true }); r.pairs = pairs[k]; }
  }
}
function addPair(i: number, a: number, b: number) { const r = railAt(i); if (r) r.pairs |= pairBit(sideToward(i, a), sideToward(i, b)); }
export const MAX_LINE_TRAINS = 12;
export const lineOf = (id?: number) => (G.S.lines || []).find(l => l.id === id) || null;
export const lineTrains = (l: Line) => G.trains.filter(t => t.line === l.id);
const nb4 = (i: number) => { const x = i % W, y = Math.floor(i / W); const o: number[] = []; for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (nx >= 0 && ny >= 0 && nx < W && ny < H) o.push(ny * W + nx); } return o; };

/**
 * Quick Route: lays a one-way LOOP between two stations (out on one track, back on another),
 * so any number of trains can follow each other around it without ever meeting head-on.
 */
export function buildRoute(a: Ent, b: Ent, withTrain: boolean): string | null {
  if (a === b) return 'Pick a different station';
  railCost = 3; avoid = null;
  const out = findRailPath(a, b);
  railCost = 0.35;
  if (!out) return 'No route found (blocked by rock or buildings). Try moving a station.';
  if (out.length < 4) return 'The stations are too close together for a train';
  const endN = out[out.length - 1], startN = out[0];
  const onOut = new Set(out);
  // the return track: from the end of the outbound line back to its start, keeping a one-tile gap
  avoid = new Set<number>();
  for (const i of out) { avoid.add(i); for (const n of nb4(i)) if (!onOut.has(n)) avoid.add(n); }
  const firstStep = nb4(endN).filter(n => !onOut.has(n));
  const lastStep = nb4(startN).filter(n => !onOut.has(n));
  for (const n of [...firstStep, ...lastStep]) avoid.delete(n);
  railCost = 3;
  const back = firstStep.length && lastStep.length ? findRailPath(b, a, firstStep.filter(n => routable(n) >= 0), lastStep) : null;
  railCost = 0.35; avoid = null;
  if (!back || back.length < 2) return 'Found a way there, but no room for the return track of a loop. Leave some space around the stations.';
  const loop = [...out, ...back]; // closed: back ends next to out[0]
  const { cost } = routeCost([...new Set(loop)]);
  const total: Record<string, number> = { ...cost };
  if (withTrain) for (const src of [BLD.locomotive.cost, BLD.wagon.cost]) for (const k in src) total[k] = (total[k] || 0) + src[k];
  if (!canAfford(total)) return 'Not enough materials: ' + missingText(total);
  layRails(out);
  layRails([endN, ...back, startN]);
  // turn-around joints at each end
  addPair(endN, out[out.length - 2], back[0]);
  addPair(startN, back[back.length - 1], out[1]);
  markDirty('rail');
  const line: Line = { id: ++G.S.lineSeq, a: a.id, b: b.id, cells: loop, split: out.length };
  G.S.lines.push(line);
  if (a.mode === b.mode) { a.mode = 'load'; b.mode = 'unload'; }
  if (withTrain) { const err = addTrainToLine(line, true); if (err) return 'Track built, but ' + err; }
  return null;
}
/** put another train on a looped line, as far as possible from the trains already on it */
export function addTrainToLine(line: Line, skipCountCheck = false): string | null {
  const a = G.ents.get(line.a), b = G.ents.get(line.b);
  if (!a || !b) return 'one of this line\'s stations is gone';
  if (!skipCountCheck && lineTrains(line).length >= MAX_LINE_TRAINS) return `a line can hold at most ${MAX_LINE_TRAINS} trains`;
  const cost = { ...BLD.locomotive.cost };
  for (const k in BLD.wagon.cost) cost[k] = (cost[k] || 0) + BLD.wagon.cost[k];
  if (!canAfford(cost)) return 'need ' + missingText(cost);
  const L = line.cells, n = L.length;
  for (const c of L) if (!railAt(c)) return 'the track has a gap — rebuild the missing rails';
  const occ = new Set<number>(); for (const t of G.trains) for (const c of t.cells) occ.add(c);
  const occIdx: number[] = []; L.forEach((c, i) => { if (occ.has(c)) occIdx.push(i); });
  let best = -1, bestD = -1;
  for (let k = 3; k < n; k++) {
    if ([L[k], L[k - 1], L[k - 2], L[k - 3]].some(c => occ.has(c))) continue;
    if (k >= line.split - 2 && k <= line.split + 3) continue; // not right on the turn-around
    let dmin = n;
    for (const o of occIdx) { const d = Math.min(Math.abs(o - k), n - Math.abs(o - k)); if (d < dmin) dmin = d; }
    if (dmin > bestD) { bestD = dmin; best = k; }
  }
  if (best < 0 || (occIdx.length && bestD < 8)) return 'there is no free stretch of track left on this line';
  pay(cost);
  const t: Train = {
    id: G.nextId++, o: MP.teams ? MP.cur : 0, name: 'Train ' + (++G.S.trainSeq), cars: ['loco', 'wagon'], cells: [L[best], L[best - 1], L[best - 2], L[best - 3]],
    frac: 0, route: [], v: 0, sched: [line.a, line.b], si: best < line.split ? 1 : 0, state: 'idle', cargo: {}, tot: 0, waitT: 99, idleT: 0, blockT: 0,
    running: true, oneWay: true, line: line.id,
  };
  G.trains.push(t);
  G.fx.sfx('place');
  return null;
}

// ---------------------------------------------------------------------------
// Signals. A rail tile can carry a signal (rail.sig: 1 = block signal, 2 = path signal). Signal tiles split
// the track into blocks. Before a train passes a signal it must reserve what lies beyond it:
//  - block signal: the whole next block, which must be empty;
//  - path signal: just the tiles its route uses in that block, so trains can cross a junction together.
let blocks = new Map<number, number>(), blocksRev = -1;
const blockRes = new Map<number, { t: number; entered: boolean; since: number }>();
const tileRes = new Map<number, { t: number; entered: boolean; since: number }>();
const blockOcc = new Map<number, Set<number>>();
function computeBlocks() {
  blocks = new Map(); blocksRev = G.railRev; blockRes.clear(); tileRes.clear();
  let id = 0;
  for (const r of G.L.rails) {
    const s0 = r.y * W + r.x;
    if (r.sig || blocks.has(s0)) continue;
    id++; blocks.set(s0, id);
    const st = [s0];
    while (st.length) {
      const c = st.pop()!, rc = railAt(c);
      if (!rc) continue;
      const sides = railSides(rc.pairs);
      for (let s = 0; s < 4; s++) {
        if (!(sides & (1 << s))) continue;
        const n = (ty(c) + DY[s]) * W + tx(c) + DX[s], rn = railAt(n);
        if (!rn || rn.sig || blocks.has(n) || !(railSides(rn.pairs) & (1 << opp(s)))) continue;
        blocks.set(n, id); st.push(n);
      }
    }
  }
}
export const blockAt = (i: number) => blocks.get(i);
/** red if the track next to this signal is taken */
export function signalRed(i: number): boolean {
  for (let s = 0; s < 4; s++) {
    const b = blocks.get((ty(i) + DY[s]) * W + tx(i) + DX[s]);
    if (b !== undefined && (blockOcc.has(b) || blockRes.has(b))) return true;
  }
  return false;
}
/** may train t move onto its next tile? (reserves what it needs when it may) */
function canEnter(t: Train): boolean {
  const tile = t.route[0], r = railAt(tile);
  if (!r || !r.sig) return true;
  const after = t.route[1];
  if (after === undefined) return true;
  const B = blocks.get(after);
  if (B === undefined) return true;
  const mine = (x?: { t: number }) => !x || x.t === t.id;
  const now = G.S.time;
  const otherIn = [...(blockOcc.get(B) || [])].some(id => id !== t.id);
  if (r.sig === 1) {
    if (otherIn || !mine(blockRes.get(B))) return false;
    for (const [ti, v] of tileRes) if (v.t !== t.id && blocks.get(ti) === B) return false;
    if (!blockRes.has(B)) blockRes.set(B, { t: t.id, entered: false, since: now });
    return true;
  }
  // path signal: only the tiles on our route inside this block
  if (!mine(blockRes.get(B))) return false;
  const path: number[] = [];
  for (let k = 1; k < t.route.length && blocks.get(t.route[k]) === B; k++) path.push(t.route[k]);
  for (const c of path) {
    const o = G.trainOcc.get(c);
    if ((o !== undefined && o !== t.id) || !mine(tileRes.get(c))) return false;
  }
  for (const c of path) if (!tileRes.has(c)) tileRes.set(c, { t: t.id, entered: false, since: now });
  return true;
}
/** drop reservations once a train has passed through (or never came) */
function releaseReservations() {
  const cellsOf = new Map<number, Set<number>>();
  for (const t of G.trains) cellsOf.set(t.id, new Set(t.cells));
  const now = G.S.time;
  for (const [b, v] of blockRes) {
    const cells = cellsOf.get(v.t);
    if (!cells) { blockRes.delete(b); continue; }
    let inside = false; for (const c of cells) if (blocks.get(c) === b) { inside = true; break; }
    if (inside) v.entered = true;
    else if (v.entered || now - v.since > 60) blockRes.delete(b);
  }
  for (const [c, v] of tileRes) {
    const cells = cellsOf.get(v.t);
    if (!cells) { tileRes.delete(c); continue; }
    if (cells.has(c)) v.entered = true;
    else if (v.entered || now - v.since > 60) tileRes.delete(c);
  }
}
