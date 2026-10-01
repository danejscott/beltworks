// Trucks: drive over open ground between Truck Stations (A* on the tile grid, re-planned when blocked).
import { MP, vctx } from './teams';
import { BLD, ITEMS } from './data';
import { H, isLand, TT, W } from './terrain';
import { borderTiles, canAfford, Ent, G, missingText, pay, pierAlong, pierBack, refund, addInv, Truck } from './world';

export const TRUCK_CAP = 800;
const VMAX = 7, ACC = 6;
const DRIVE_OVER = new Set(['belt', 'tunnel', 'pipe', 'ptunnel', 'rail', 'pole']);

/** can a truck drive through this tile? returns step cost or -1 */
function cost(i: number): number {
  const t = G.tiles[i];
  if (!isLand(t) || t === TT.ROCK) return -1;
  const id = G.grid[i];
  if (id) {
    const e = G.ents.get(id);
    if (!e) return 1;
    const k = BLD[e.type].kind;
    if (!DRIVE_OVER.has(k) || e.w > 1) return -1;
    return 1.3;
  }
  if (G.featGrid && G.featGrid[i]) return -1;
  return G.trees[i] ? 1.6 : 1;
}
export const truckPassable = (i: number) => cost(i) >= 0;

function heapPush(h: number[][], v: number[]) { h.push(v); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function heapPop(h: number[][]) {
  const top = h[0], last = h.pop()!;
  if (h.length) { h[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } }
  return top;
}
const D8 = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
/** tiles next to a station a truck can park on */
export function dockTiles(st: Ent): number[] {
  const tiles = BLD[st.type].pier ? pierBack(st).concat(borderTiles(st).filter(([x, y]) => pierAlong(st, x, y) <= 1)) : borderTiles(st);
  const seen = new Set<number>();
  return tiles.map(([x, y]) => y * W + x).filter(i => { if (i < 0 || i >= W * H || seen.has(i)) return false; seen.add(i); return cost(i) >= 0 && !G.grid[i]; });
}
export function findTruckPath(from: number, st: Ent): number[] | null {
  return gridPath(from, new Set(dockTiles(st)), cost, st.x + st.w / 2, st.y + st.h / 2);
}
/** parking tiles of a station that no other truck has claimed */
function freeBays(st: Ent, me: Truck): number[] {
  const taken = new Set<number>();
  for (const o of G.trucks) if (o !== me && (o as any).bay >= 0 && o.sched[o.si] === st.id) taken.add((o as any).bay);
  return dockTiles(st).filter(i => !taken.has(i));
}
/** where to wait when every bay is busy: open ground a few tiles from the station, away from other waiting trucks */
function queueTiles(st: Ent, me: Truck): number[] {
  const busy = new Set<number>();
  for (const o of G.trucks) if (o !== me) { if (o.state !== 'moving') busy.add(Math.floor(o.y) * W + Math.floor(o.x)); if ((o as any).qspot >= 0) busy.add((o as any).qspot); }
  const docks = new Set(dockTiles(st)), out: number[] = [];
  for (let r = 2; r <= 9 && out.length < 40; r++) for (let y = st.y - r; y < st.y + st.h + r; y++) for (let x = st.x - r; x < st.x + st.w + r; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (x > st.x - r && x < st.x + st.w + r - 1 && y > st.y - r && y < st.y + st.h + r - 1) continue;   // only the ring at distance r
    const i = y * W + x;
    if (!docks.has(i) && !busy.has(i) && cost(i) >= 0 && cost(i) < 1.5) out.push(i);
  }
  return out;
}
/** tiles where another truck is standing (moving trucks steer around them) */
function parkedAt(me: Truck): Set<number> {
  const s = new Set<number>();
  for (const o of G.trucks) if (o !== me && o.state !== 'moving') s.add(Math.floor(o.y) * W + Math.floor(o.x));
  return s;
}
/** 8-way A* over the tile grid (shared by trucks on land and ships on water) */
export function gridPath(from: number, goals: Set<number>, cost: (i: number) => number, gx: number, gy: number, greed = 1.02, maxIter = 300000): number[] | null {
  if (!goals.size) return null;
  if (goals.has(from)) return [];
  const hf = (i: number) => { const dx = Math.abs(i % W - gx), dy = Math.abs(Math.floor(i / W) - gy); return (dx + dy - 0.59 * Math.min(dx, dy)) * greed; };
  const g = new Map<number, number>(), prev = new Map<number, number>(), heap: number[][] = [];
  g.set(from, 0); prev.set(from, -1); heapPush(heap, [hf(from), from]);
  let found = -1, iter = 0;
  while (heap.length && iter++ < maxIter) {
    const [f, i] = heapPop(heap);
    const gi = g.get(i)!;
    if (f - hf(i) > gi + 1e-6) continue;
    if (goals.has(i)) { found = i; break; }
    const x = i % W, y = Math.floor(i / W);
    for (let k = 0; k < 8; k++) {
      const nx = x + D8[k][0], ny = y + D8[k][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx, c = cost(ni);
      if (c < 0) continue;
      if (k >= 4 && (cost(y * W + nx) < 0 || cost(ny * W + x) < 0)) continue; // no corner cutting
      const ng = gi + c * (k >= 4 ? 1.414 : 1);
      const og = g.get(ni);
      if (og !== undefined && og <= ng) continue;
      g.set(ni, ng); prev.set(ni, i); heapPush(heap, [ng + hf(ni), ni]);
    }
  }
  if (found < 0) return null;
  const path: number[] = [];
  for (let c = found; c !== from; c = prev.get(c)!) path.push(c);
  return path.reverse();
}

// ---------------------------------------------------------------------------
// Ground wear: tiles trucks drive over slowly turn into dirt tracks, and fade again when unused
export function wearTile(i: number) {
  const v = Math.min(255, (G.wear.get(i) || 0) + 6);
  G.wear.set(i, v);
  G.fx.wear(i, v);
}
let wearT = 0;
export function tickWear(dt: number) {
  wearT += dt;
  if (wearT < 20) return;
  wearT = 0;
  for (const [i, v] of G.wear) { const n = v - 2; if (n <= 0) { G.wear.delete(i); G.fx.wear(i, 0); } else { G.wear.set(i, n); G.fx.wear(i, n); } }
}

/** everywhere a truck can stop: truck stops, harbors and train stations (so cargo can change hands) */
export function truckStations(): Ent[] { return G.L ? [...G.L.tstations, ...G.L.ports.filter((p: Ent) => BLD[p.type].pier), ...G.L.stations, ...(G.L.trades || [])] : []; }
export function buyTruck(home: Ent, target: Ent | null): string | null {
  const docks = dockTiles(home);
  if (!docks.length) return 'No free ground next to this station for a truck to park';
  if (!canAfford(BLD.truck.cost)) return 'Need: ' + missingText(BLD.truck.cost);
  pay(BLD.truck.cost);
  // start on a parking tile nobody is standing on
  const standing = new Set(G.trucks.map(o => Math.floor(o.y) * W + Math.floor(o.x)));
  const d = docks.find(i => !standing.has(i)) ?? docks[0];
  const t: Truck = {
    id: G.nextId++, o: MP.teams ? MP.cur : 0, name: 'Truck ' + (++G.S.truckSeq), x: d % W + 0.5, y: Math.floor(d / W) + 0.5, a: 0,
    sched: target ? [home.id, target.id] : [home.id], si: 0, state: 'idle', cargo: {}, tot: 0, path: [], pi: 0, v: 0, waitT: 0, idleT: 0, retryT: 0,
  };
  if (target && home.mode === target.mode) { home.mode = 'load'; target.mode = 'unload'; }
  G.trucks.push(t);
  G.fx.sfx('place');
  return null;
}
export function removeTruck(t: Truck) {
  refund(BLD.truck.cost);
  for (const k in t.cargo) addInv(k, t.cargo[k]);
  G.trucks = G.trucks.filter(x => x !== t);
  G.fx.sfx('remove');
}
export function truckAt(wx: number, wy: number): Truck | null {
  for (const t of G.trucks) if (Math.hypot(t.x - wx, t.y - wy) < 0.9) return t;
  return null;
}

export function updateTrucks(dt: number) {
  for (const t of G.trucks) {
    if (!vctx(t)) continue;
    if (!t.sched.length) { t.state = 'noschedule'; t.v = 0; continue; }
    if (t.si >= t.sched.length) t.si = 0;
    const st = G.ents.get(t.sched[t.si]);
    if (!st) { t.sched.splice(t.si, 1); continue; }
    switch (t.state) {
      case 'noschedule': case 'idle': case 'nopath': {
        t.retryT -= dt;
        if (t.retryT > 0) break;
        const here = Math.floor(t.y) * W + Math.floor(t.x);
        const T: any = t;
        const bays = freeBays(st, t);
        const parked = parkedAt(t);
        const avoid = (i: number) => parked.has(i) && i !== here ? -1 : cost(i);
        if (bays.length) {
          const p = gridPath(here, new Set(bays), avoid, st.x + st.w / 2, st.y + st.h / 2);
          if (!p) { t.state = 'nopath'; t.retryT = 6; t.v = 0; T.bay = -1; break; }
          T.bay = p.length ? p[p.length - 1] : here; T.qspot = -1;
          t.path = p; t.pi = 0; t.state = p.length ? 'moving' : 'loading'; t.waitT = 0; t.idleT = 0;
        } else {
          // every bay is busy: wait in line nearby and check again shortly
          T.bay = -1;
          const q = queueTiles(st, t);
          if (T.qspot === here || !q.length) { t.state = 'queued'; t.retryT = 1; t.v = 0; T.qspot = here; break; }
          const p = gridPath(here, new Set(q), avoid, st.x + st.w / 2, st.y + st.h / 2);
          if (!p) { t.state = 'nopath'; t.retryT = 3; t.v = 0; break; }
          T.qspot = p.length ? p[p.length - 1] : here;
          t.path = p; t.pi = 0; t.state = 'moving'; T.toQueue = 1;
        }
        break;
      }
      case 'queued': {
        t.retryT -= dt; t.v = 0;
        if (t.retryT <= 0) { t.state = 'idle'; t.retryT = 0; }
        break;
      }
      case 'moving': {
        const T: any = t;
        if (t.pi >= t.path.length) {
          if (T.toQueue) { T.toQueue = 0; t.state = 'queued'; t.retryT = 1; t.v = 0; break; }
          t.state = 'loading'; t.v = 0; t.waitT = 0; t.idleT = 0; break;
        }
        const nxt = t.path[t.pi];
        if (!truckPassable(nxt)) { t.state = 'idle'; t.retryT = 0; t.v = 0; break; }
        // a truck is standing there (parked or waiting): stop and re-plan around it
        if (parkedAt(t).has(nxt)) { t.state = 'idle'; t.retryT = 0.5; t.v = 0; T.toQueue = 0; break; }
        const tx = nxt % W + 0.5, ty = Math.floor(nxt / W) + 0.5;
        const left = t.path.length - t.pi;
        const vAllow = Math.sqrt(2 * 8 * Math.max(0, left - 0.5)) + 0.8;
        t.v = Math.min(VMAX * (G.S.shop.express ? 1.3 : 1), t.v + ACC * dt, vAllow);
        let step = t.v * dt;
        let dx = tx - t.x, dy = ty - t.y, dist = Math.hypot(dx, dy);
        if (dist > 1e-4) {
          const want = Math.atan2(dy, dx);
          let da = want - t.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          t.a += da * Math.min(1, dt * 9);
        }
        while (step > 0 && t.pi < t.path.length) {
          const n2 = t.path[t.pi], x2 = n2 % W + 0.5, y2 = Math.floor(n2 / W) + 0.5;
          dx = x2 - t.x; dy = y2 - t.y; dist = Math.hypot(dx, dy);
          if (dist <= step) { t.x = x2; t.y = y2; step -= dist; t.pi++; wearTile(n2); }
          else { t.x += dx / dist * step; t.y += dy / dist * step; step = 0; }
        }
        break;
      }
      case 'loading': {
        t.waitT += dt;
        const trade = st.type === 'trade_post';
        const moved = trade ? tradeTransfer(t, st, dt) : transfer(t, st, dt);
        t.idleT = moved ? 0 : t.idleT + dt;
        const full = trade || st.mode === 'load' ? t.tot >= TRUCK_CAP : t.tot <= 0;
        if (t.sched.length > 1 && ((t.waitT > 2 && (full || t.idleT > 1.5)) || t.waitT > 60)) {
          t.si = (t.si + 1) % t.sched.length; t.state = 'idle'; t.retryT = 0; (t as any).bay = -1;
        }
        break;
      }
    }
  }
}
/** the trade post: drop off everything that isn't the team's wanted item (earning credits), then pick up the wanted item (paying credits) */
export const tradeVal = (k: string) => Math.max(1, ITEMS[k]?.val || 1);
function tradeTransfer(t: Truck, st: Ent, dt: number): boolean {
  (t as any).xacc = ((t as any).xacc || 0) + dt * 120;
  let n = Math.floor((t as any).xacc);
  if (n <= 0) return true;
  (t as any).xacc -= n;
  const F = G.S.flags, want: string = F.twant || '', cap = BLD[st.type].cap!;
  let moved = 0;
  for (const k of Object.keys(t.cargo)) {
    if (k === want || n <= 0) continue;
    const m = Math.min(n, t.cargo[k], cap - st.tot);
    if (m <= 0) break;
    t.cargo[k] -= m; t.tot -= m; if (!t.cargo[k]) delete t.cargo[k];
    st.store[k] = (st.store[k] || 0) + m; st.tot += m; n -= m; moved += m;
    F.tcr = (F.tcr || 0) + m * tradeVal(k);
    F.tgave = (F.tgave || 0) + m;
  }
  if (want && n > 0 && st.store[want] > 0) {
    const price = tradeVal(want);
    const m = Math.min(n, st.store[want], TRUCK_CAP - t.tot, Math.floor((F.tcr || 0) / price));
    if (m > 0) {
      st.store[want] -= m; st.tot -= m; if (!st.store[want]) delete st.store[want];
      t.cargo[want] = (t.cargo[want] || 0) + m; t.tot += m; moved += m;
      F.tcr -= m * price;
    }
  }
  return moved > 0;
}
function transfer(t: Truck, st: Ent, dt: number): boolean {
  if (!st.pnet || st.pnet.sat < 0.05) return false;
  (t as any).xacc = ((t as any).xacc || 0) + dt * 120;
  let n = Math.floor((t as any).xacc);
  if (n <= 0) return true;
  (t as any).xacc -= n;
  let moved = 0;
  if (st.mode === 'load') {
    while (n > 0 && t.tot < TRUCK_CAP && st.tot > 0) {
      const k = Object.keys(st.store)[0];
      const m = Math.min(n, st.store[k], TRUCK_CAP - t.tot);
      st.store[k] -= m; st.tot -= m; if (!st.store[k]) delete st.store[k];
      t.cargo[k] = (t.cargo[k] || 0) + m; t.tot += m; n -= m; moved += m;
    }
  } else {
    const scap = BLD[st.type].cap!;
    while (n > 0 && st.tot < scap && t.tot > 0) {
      const k = Object.keys(t.cargo)[0];
      const m = Math.min(n, t.cargo[k], scap - st.tot);
      t.cargo[k] -= m; t.tot -= m; if (!t.cargo[k]) delete t.cargo[k];
      st.store[k] = (st.store[k] || 0) + m; st.tot += m; n -= m; moved += m;
    }
    if (moved) G.S.flags.truckDelivered = (G.S.flags.truckDelivered || 0) + moved;
  }
  return moved > 0;
}
