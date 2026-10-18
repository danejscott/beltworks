import { MP, vctx } from './teams';
import { railPos } from './railcurves';
import { BLD } from './data';
import { H, W } from './terrain';
import { DX, DY, opp } from './util';
import { addInv, borderTiles, canAfford, Ent, entAt, G, Line, markDirty, missingText, pairBit, pay, place, platformTiles, railAt, railExits, railSides, refund, Train } from './world';
import { TT } from './terrain';
import { railPairsForPath, smartJunction } from './cmd';
import { RS, rOrigin, rStep, rTiles } from './railgrid';

export const WAGON_CAP = 120;
// speeds are in rail blocks (2 tiles) per second
const ACC = 5 / RS, DEC = 7 / RS;
export const trainMax = () => 18 / RS * (G.S.shop.express ? 1.5 : 1);
export const wagonsOf = (t: Train) => t.cars.filter(c => c === 'wagon').length;
export const trainCap = (t: Train) => wagonsOf(t) * WAGON_CAP;

const tx = (i: number) => i % W, ty = (i: number) => Math.floor(i / W);
function sideToward(a: number, b: number) {
  const dx = (tx(b) - tx(a)) / RS, dy = (ty(b) - ty(a)) / RS;
  for (let d = 0; d < 4; d++) if (DX[d] === dx && DY[d] === dy) return d;
  return -1;
}

/** walk n blocks along the track from block `start` leaving via side `exit` */
function walk(start: number, exit: number, n: number, prefer = true): number[] | null {
  const out: number[] = [];
  let cur = start, ex = exit;
  for (let k = 0; k < n; k++) {
    const ni = rStep(cur, ex);
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
  const i = rOrigin(x, y), r = railAt(i);
  if (!r || r.y * W + r.x !== i) return { err: 'Place the locomotive on a railway' };
  const sides = railSides(r.pairs);
  let back = opp(rot);
  if (!(sides & (1 << back))) { back = -1; for (let s = 0; s < 4; s++) if (sides & (1 << s)) { back = s; break; } }
  if (back < 0) return { err: 'Bad track' };
  const rest = walk(i, back, 3);
  if (!rest) return { err: 'Needs 4 pieces of connected track (loco + 1 wagon)' };
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
/** longest train (locomotive + wagons), by map size */
export const maxCars = () => { const s = G.S.size || 1024; return s <= 512 ? 20 : s <= 1024 ? 24 : s <= 2304 ? 27 : 30; };
export function addWagon(t: Train) {
  if (t.v > 0.01) { G.fx.toast('Stop the train first (or wait for it to arrive)', 'bad'); return; }
  if (t.cars.length >= maxCars()) { G.fx.toast(`Trains can be at most ${maxCars()} cars long on this map size`, 'bad'); return; }
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
/** add a wagon at no cost if there's free track behind (rebuilding old worlds' trains) */
export function addWagonFree(t: Train): boolean {
  const n = t.cells.length, tail = t.cells[n - 1], prev = t.cells[n - 2];
  const entry = sideToward(tail, prev), r = railAt(tail);
  if (!r || entry < 0) return false;
  const exits = railExits(r.pairs, entry);
  if (!exits.length) return false;
  const more = walk(tail, exits.includes(opp(entry)) ? opp(entry) : exits[0], 2);
  if (!more || more.some(c => occupiedByTrain(c) || t.cells.includes(c))) return false;
  t.cells.push(...more); t.cars.push('wagon');
  return true;
}
export function removeWagon(t: Train) {
  if (wagonsOf(t) <= 0) return;
  if (t.v > 0.01) { G.fx.toast('Stop the train first', 'bad'); return; }
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
  const i = rOrigin(Math.floor(wx), Math.floor(wy));
  for (const t of G.trains) if (t.cells.includes(i)) return t;
  return null;
}

// ---------------------------------------------------------------------------
/** the tiles around a building, up to r tiles out */
function ringTiles(e: Ent, r: number): number[][] {
  const out: number[][] = [];
  for (let y = e.y - r; y < e.y + e.h + r; y++) for (let x = e.x - r; x < e.x + e.w + r; x++) if (x < e.x || x >= e.x + e.w || y < e.y || y >= e.y + e.h) out.push([x, y]);
  return out;
}
function stationGoals(st: Ent): Set<number> {
  const s = new Set<number>();
  // stations with a platform: trains stop on the platform track only (connect your rails to its ends)
  if (st.plat) { for (const [x, y] of platformTiles(st)) { const i = y * W + x, r = railAt(i); if (r && r.x === x && r.y === y) s.add(i); } return s; }
  // (stations from before platforms: any track touching them, or with a one-tile gap — 2-wide track often can't
  // squeeze right up against a station that was built for 1-wide track)
  for (const [x, y] of ringTiles(st, 2)) { const r = railAt(y * W + x); if (r) s.add(r.y * W + r.x); }
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
      const ni = rStep(i, ex);
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
/** a route that reaches a station's platform carries on to its far end, so the whole train pulls in alongside it */
function alongPlatform(p: number[], goals: Set<number>, blk: Set<number> | null): number[] {
  const out = [...p];
  for (let guard = 0; guard < 64 && out.length >= 1; guard++) {
    const cur = out[out.length - 1], prev = out.length > 1 ? out[out.length - 2] : -1;
    if (prev < 0) break;
    const s = sideToward(prev, cur), r = railAt(cur);
    if (s < 0 || !r || !railExits(r.pairs, opp(s)).includes(s)) break;
    const nx = rStep(cur, s), nr = railAt(nx);
    if (!goals.has(nx) || !nr || !(railSides(nr.pairs) & (1 << opp(s))) || (blk && blk.has(nx))) break;
    out.push(nx);
  }
  return out;
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
    const p = bfs(cells[0], entry, goals, blk);
    return p && st.plat ? alongPlatform(p, goals, blk) : p;
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

/** is another train using station st ahead of t? (loading there, or heading there and closer) — then t waits in line */
const QGAP = 2;
function stationBusy(st: Ent, t: Train) {
  for (const o of G.trains) {
    if (o === t || o.sched[o.si] !== st.id) continue;
    if (o.state === 'loading') return true;
    if (o.state === 'moving' && (o.route.length < t.route.length || (o.route.length === t.route.length && o.id < t.id))) return true;
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
        const tt = t as any;
        // the station is in use: wait in line a few tiles before it instead of pushing up behind
        if (t.frac === 0 && t.route.length <= QGAP && stationBusy(st, t)) { t.v = 0; tt.queued = true; t.blockT = 0; break; }
        const nxt = t.route[0], who = occ.get(nxt);
        if (who !== undefined && who !== t.id) {
          t.v = 0;
          // stuck behind a train going to the same station: that's the queue, just wait
          const o = G.trains.find(x => x.id === who);
          if (o && o.sched[o.si] === st.id) { tt.queued = true; t.blockT = 0; break; }
          t.blockT += dt;
          if (t.blockT > 4) { t.blockT = 0; t.state = 'idle'; t.waitT = 99; }
          break;
        }
        t.blockT = 0; tt.queued = false;
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
        const TT: any = t;
        if (t.waitT === 0) TT.got = 0;
        t.waitT += dt;
        const before = t.tot, ord = stopOrders(t, t.si, st);
        const moved = transfer(t, st, dt, ord);
        if (moved) TT.got = (TT.got || 0) + 1;
        if (t.tot !== before) TT.cnt = (TT.cnt || 0) + Math.abs(t.tot - before);
        t.idleT = moved ? 0 : t.idleT + dt;
        // done when there's nothing left to drop off and nothing more to pick up (full, or nothing arriving for a while)
        const canDrop = Object.keys(t.cargo).some(k => t.cargo[k] > 0 && wants(ord.u, k)) && dropRoom(st) > 0;
        const full = t.tot >= trainCap(t);
        const leave = !canDrop && (!ord.l.length || full) ? t.waitT > 2
          : (t.idleT > 4 && (TT.got > 0 || t.waitT > 20)) || t.waitT > 120;
        if (leave) {
          t.si = (t.si + 1) % t.sched.length;
          t.state = 'idle'; t.waitT = 99;
        }
        break;
      }
    }
  }
}
/** a train on (or heading onto) rail block i: which route through the block it uses. 'on' = it's on it now (everything
 *  else through this block has to wait), 'coming' = it will be within the next few blocks */
export function railUse(i: number): { t: Train; pair: number; state: 'on' | 'coming' } | null {
  const pairOf = (a: number, b: number) => {
    const sa = a >= 0 ? sideToward(i, a) : -1, sb = b >= 0 ? sideToward(i, b) : -1;
    if (sa >= 0 && sb >= 0) return pairBit(sa, sb);
    const s = sa >= 0 ? sa : sb; return s >= 0 ? pairBit(s, opp(s)) : 0;
  };
  for (const t of G.trains) {
    const k = t.cells.indexOf(i);
    if (k >= 0) return { t, pair: pairOf(k > 0 ? t.cells[k - 1] : t.route[0] ?? -1, t.cells[k + 1] ?? -1), state: 'on' };
  }
  for (const t of G.trains) {
    if (t.state !== 'moving') continue;
    const k = t.route.indexOf(i);
    if (k >= 0 && k < 6) return { t, pair: pairOf(t.route[k + 1] ?? -1, k > 0 ? t.route[k - 1] : t.cells[0]), state: 'coming' };
  }
  return null;
}
/** does an order list take item k? */
const wants = (list: string[], k: string) => list.includes('*') || list.includes(k);
/** a stop's orders: the train's own, or the station's mode (load / unload / both) */
export function stopOrders(t: Train, i: number, st: Ent): { u: string[]; l: string[] } {
  const o = t.orders && t.orders[i];
  const du = st.mode === 'unload' || st.mode === 'both' ? ['*'] : [], dl = st.mode === 'load' || st.mode === 'both' ? ['*'] : [];
  return { u: o && o.u ? o.u : du, l: o && o.l ? o.l : dl };
}
/** where dropped-off cargo goes: a pick-up-and-drop-off station keeps it apart (it goes out by belt) */
const dropRoom = (st: Ent) => BLD.station.cap - (st.mode === 'both' ? st.dtot || 0 : st.tot);
function transfer(t: Train, st: Ent, dt: number, ord: { u: string[]; l: string[] }): boolean {
  if (!st.pnet || st.pnet.sat < 0.05) return false;
  t['xacc'] = (t['xacc'] || 0) + dt * 150 * Math.max(1, wagonsOf(t));
  let n = Math.floor(t['xacc']);
  if (n <= 0) return true;
  t['xacc'] -= n;
  const cap = trainCap(t);
  let moved = 0;
  // drop off first
  const both = st.mode === 'both';
  if (both && !st.drop) { st.drop = {}; st.dtot = 0; }
  for (const k of Object.keys(t.cargo)) {
    if (n <= 0) break;
    if (!wants(ord.u, k)) continue;
    const m = Math.min(n, t.cargo[k], dropRoom(st));
    if (m <= 0) continue;
    t.cargo[k] -= m; t.tot -= m; if (!t.cargo[k]) delete t.cargo[k];
    if (both) { st.drop[k] = (st.drop[k] || 0) + m; st.dtot += m; }
    else { st.store[k] = (st.store[k] || 0) + m; st.tot += m; }
    n -= m; moved += m;
    G.S.flags.trainDelivered = (G.S.flags.trainDelivered || 0) + m;
  }
  // then pick up (never something this stop drops off, so nothing goes round in circles)
  for (const k of Object.keys(st.store)) {
    if (n <= 0 || t.tot >= cap) break;
    if (!wants(ord.l, k) || wants(ord.u, k) || !st.store[k]) continue;
    const m = Math.min(n, st.store[k], cap - t.tot);
    st.store[k] -= m; st.tot -= m; if (!st.store[k]) delete st.store[k];
    t.cargo[k] = (t.cargo[k] || 0) + m; t.tot += m; n -= m; moved += m;
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
    pts.push(railPos(a, b, f));
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
  // a rail block (2 x 2 tiles, i = its top-left tile): step cost, or -1 if blocked
  if (i < 0 || i >= W * H || (avoid && avoid.has(i))) return -1;
  const x = tx(i), y = ty(i);
  if (x < 1 || y < 1 || x >= W - RS - 1 || y >= H - RS - 1) return -1;
  let c = 1;
  for (const k of rTiles(i)) {
    if (G.nodeGrid[k] || (G.featGrid && G.featGrid[k])) return -1;
    const id = G.grid[k];
    if (id) { const e = G.ents.get(id); if (!e || e.type !== 'rail' || e.y * W + e.x !== i) return -1; c = Math.min(c, railCost); continue; }
    const t = G.tiles[k];
    c = Math.max(c, t === TT.WATER || t === TT.DEEP ? 2.2 : t === TT.ROCK ? 1.4 : 1); // tunnels are allowed, slightly pricier than open ground
  }
  return c;
}
/** the rail blocks just outside a station (for routing out of / into it) */
const borderBlocks = (e: Ent) => [...new Set(ringTiles(e, e.plat ? 1 : 2).map(([x, y]) => rOrigin(x, y)))].filter(i => routable(i) >= 0);
export function findRailPath(a: Ent, b: Ent, startTiles?: number[], goalTiles?: number[]): number[] | null {
  const starts = startTiles || borderBlocks(a);
  const goals = new Set(goalTiles || borderBlocks(b));
  if (!starts.length || !goals.size) return null;
  const gx = b.x + b.w / 2, gy = b.y + b.h / 2;
  const hf = (i: number) => (Math.abs(i % W + RS / 2 - gx) + Math.abs(Math.floor(i / W) + RS / 2 - gy)) / RS * 1.05;
  const g = new Map<number, number>(), from = new Map<number, number>(), dirOf = new Map<number, number>();
  const heap: number[][] = [];
  for (const s of starts) { g.set(s, 0); from.set(s, -1); dirOf.set(s, -1); heapPush(heap, [hf(s), s]); }
  let found = -1, iter = 0;
  while (heap.length && iter++ < 1500000) {
    const [, i] = heapPop(heap);
    if (goals.has(i)) { found = i; break; }
    const gi = g.get(i)!, x = i % W, y = Math.floor(i / W), di = dirOf.get(i)!;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d] * RS, ny = y + DY[d] * RS;
      if (nx < 1 || ny < 1 || nx >= W - RS - 1 || ny >= H - RS - 1) continue;
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
let FREE = false;   // building for free (rebuilding old worlds' loops)
function layRails(path: number[]) {
  const pts = path.map((i, k) => {
    const x = i % W, y = Math.floor(i / W);
    const nxt = path[k + 1] ?? null, prv = path[k - 1];
    let d = 0;
    const from = nxt !== null ? i : prv, to = nxt !== null ? nxt : i;
    for (let dd = 0; dd < 4; dd++) if (rStep(from, dd) === to) d = dd;
    return { x, y, d };
  });
  const pairs = railPairsForPath(pts);
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], e = railAt(p.y * W + p.x);
    if (e) { if (e.x === p.x && e.y === p.y) e.pairs = e.pairs | smartJunction(e.pairs, pairs[k], pts, k); }
    else { const r = place('rail', p.x, p.y, 0, { quiet: true, free: FREE }); r.pairs = pairs[k]; }
  }
}
function addPair(i: number, a: number, b: number) { const r = railAt(i); if (r) r.pairs |= pairBit(sideToward(i, a), sideToward(i, b)); }
export const MAX_LINE_TRAINS = 12;
export const lineOf = (id?: number) => (G.S.lines || []).find(l => l.id === id) || null;
export const lineTrains = (l: Line) => G.trains.filter(t => t.line === l.id);
const nb4 = (i: number) => { const x = i % W, y = Math.floor(i / W); const o: number[] = []; for (let d = 0; d < 4; d++) { const nx = x + DX[d] * RS, ny = y + DY[d] * RS; if (nx >= 0 && ny >= 0 && nx < W - 1 && ny < H - 1) o.push(ny * W + nx); } return o; };

/**
 * Quick Route: lays a one-way LOOP between two stations (out on one track, back on another),
 * so any number of trains can follow each other around it without ever meeting head-on.
 */
export function buildRoute(a: Ent, b: Ent, withTrain: boolean, free = false): string | null {
  FREE = free;
  try { return buildRouteX(a, b, withTrain); } finally { FREE = false; }
}
function buildRouteX(a: Ent, b: Ent, withTrain: boolean): string | null {
  if (a === b) return 'Pick a different station';
  if (a.plat && b.plat) return buildPlatformRoute(a, b, withTrain);
  railCost = 3; avoid = null;
  const out = findRailPath(a, b);
  railCost = 0.35;
  if (!out) return 'No route found (blocked by rock or buildings). Try moving a station.';
  if (out.length < 4) return 'The stations are too close together for a train';
  const endN = out[out.length - 1], startN = out[0];
  const onOut = new Set(out);
  // the return track: from the end of the outbound line back to its start, keeping a one-tile gap
  avoid = new Set<number>();
  for (const i of out) avoid.add(i);   // the return track may run right alongside (double track)
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
  if (!FREE && !canAfford(total)) return 'Not enough materials: ' + missingText(total);
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
/** a station's platform as tile indices (left to right) plus the tile just past each end */
function platformOf(st: Ent) {
  const P = platformTiles(st).map(([x, y]) => y * W + x);
  const step = P[1] - P[0];
  return { P, ends: [P[0] - step, P[P.length - 1] + step] };
}
/** Quick Route between two platform stations: one loop that runs through both platforms */
function buildPlatformRoute(a: Ent, b: Ent, withTrain: boolean): string | null {
  const A = platformOf(a), B = platformOf(b);
  const okEnd = (i: number) => i >= 0 && i < W * H && routable(i) >= 0;
  const platSet = new Set([...A.P, ...B.P]);
  railCost = 3; avoid = new Set(platSet);
  const out = findRailPath(a, b, A.ends.filter(okEnd), B.ends.filter(okEnd));
  railCost = 0.35;
  if (!out) { avoid = null; return 'No route found between the platforms (blocked by rock or buildings). Leave the ends of each platform open.'; }
  const sA = out[0], gB = out[out.length - 1];
  const oA = A.ends[0] === sA ? A.ends[1] : A.ends[0], oB = B.ends[0] === gB ? B.ends[1] : B.ends[0];
  if (!okEnd(oA) || !okEnd(oB)) { avoid = null; return 'Found a way there, but the far end of a platform is blocked — the loop runs through both platforms.'; }
  const onOut = new Set(out);
  avoid = new Set(platSet);
  for (const i of out) avoid.add(i);   // the return track may run right alongside (double track)
  avoid.delete(oA); avoid.delete(oB);
  railCost = 3;
  const back = findRailPath(b, a, [oB], [oA]);
  railCost = 0.35; avoid = null;
  if (!back) return 'Found a way there, but no room for the return track of a loop. Leave some space around the stations.';
  // A's platform runs toward sA, B's away from gB
  const PA = A.ends[1] === sA ? A.P : [...A.P].reverse();
  const PB = B.ends[0] === gB ? B.P : [...B.P].reverse();
  const loop = [...PA, ...out, ...PB, ...back];
  if (new Set(loop).size !== loop.length) return 'The route crosses itself — try moving a station.';
  const { cost } = routeCost(loop);
  const total: Record<string, number> = { ...cost };
  if (withTrain) for (const src of [BLD.locomotive.cost, BLD.wagon.cost]) for (const k in src) total[k] = (total[k] || 0) + src[k];
  if (!FREE && !canAfford(total)) return 'Not enough materials: ' + missingText(total);
  layRails(loop);
  const n = loop.length;
  addPair(loop[0], loop[n - 1], loop[1]);
  addPair(loop[n - 1], loop[n - 2], loop[0]);
  markDirty('rail');
  const line: Line = { id: ++G.S.lineSeq, a: a.id, b: b.id, cells: loop, split: PA.length + out.length };
  G.S.lines.push(line);
  if (a.mode === b.mode) { a.mode = 'load'; b.mode = 'unload'; }
  if (withTrain) { const err = addTrainToLine(line, true); if (err) return 'Track built, but ' + err; }
  return null;
}
/** put another train on a looped line, as far as possible from the trains already on it */
export function addTrainToLine(line: Line, skipCountCheck = false, free = false): string | null {
  const fr = free || FREE;
  const a = G.ents.get(line.a), b = G.ents.get(line.b);
  if (!a || !b) return 'one of this line\'s stations is gone';
  if (!skipCountCheck && lineTrains(line).length >= MAX_LINE_TRAINS) return `a line can hold at most ${MAX_LINE_TRAINS} trains`;
  const cost = { ...BLD.locomotive.cost };
  for (const k in BLD.wagon.cost) cost[k] = (cost[k] || 0) + BLD.wagon.cost[k];
  if (!fr && !canAfford(cost)) return 'need ' + missingText(cost);
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
  if (!fr) pay(cost);
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
        const n = rStep(c, s), rn = railAt(n);
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
    const b = blocks.get(rStep(i, s));
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
