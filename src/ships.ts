// Ships: sail over lakes and the sea between Ship Ports you choose (like trains, but on water).
import { MP, vctx } from './teams';
import { BLD } from './data';
import { isWater, W } from './terrain';
import { gridPath } from './trucks';
import { addInv, borderTiles, canAfford, Ent, G, missingText, pay, pierAlong, refund } from './world';

export const SHIP_CAP = 2400;
const VMAX = 6, ACC = 2.5;
const SAIL_UNDER = new Set(['belt', 'tunnel', 'pipe', 'ptunnel', 'rail', 'pole']);   // ships pass under bridges

export interface Ship {
  id: number; o?: number; name: string; x: number; y: number; a: number; sched: number[]; si: number; state: string;
  cargo: Record<string, number>; tot: number; path: number[]; pi: number; v: number; waitT: number; idleT: number; retryT: number;
}

/** can a ship sail through this tile? returns step cost or -1 */
function cost(i: number): number {
  if (!isWater(G.tiles[i])) return -1;
  const id = G.grid[i];
  if (id) { const e = G.ents.get(id); if (e && !(SAIL_UNDER.has(BLD[e.type].kind) && e.w === 1)) return -1; }
  return G.tiles[i] === 5 ? 1 : 1.15;   // deep water is a little faster
}
export const shipPassable = (i: number) => cost(i) >= 0;
/** water tiles next to a port where a ship can moor */
export function berths(p: Ent): number[] {
  const t = BLD[p.type].pier ? borderTiles(p).filter(([x, y]) => pierAlong(p, x, y) >= 3) : borderTiles(p);
  return t.map(([x, y]) => y * W + x).filter(i => i >= 0 && i < G.tiles.length && cost(i) >= 0);
}
/** berths no other ship has claimed */
function freeBerths(p: Ent, me: Ship): number[] {
  const taken = new Set<number>();
  for (const o of G.ships) if (o !== me && (o as any).bay >= 0 && o.sched[o.si] === p.id) taken.add((o as any).bay);
  // keep ships a tile apart along the pier
  return berths(p).filter(i => !taken.has(i) && !taken.has(i - 1) && !taken.has(i + 1) && !taken.has(i - W) && !taken.has(i + W));
}
/** where to wait at anchor when every berth is busy */
function anchorage(p: Ent, me: Ship): number[] {
  const busy = new Set<number>();
  for (const o of G.ships) if (o !== me) { busy.add(Math.floor(o.y) * W + Math.floor(o.x)); if ((o as any).qspot >= 0) busy.add((o as any).qspot); }
  const out: number[] = [];
  for (let r = 4; r <= 14 && out.length < 30; r += 2) for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, x = Math.round(p.x + p.w / 2 + Math.cos(a) * r), y = Math.round(p.y + p.h / 2 + Math.sin(a) * r);
    if (x < 1 || y < 1 || x >= W - 1 || y >= G.tiles.length / W - 1) continue;
    const i = y * W + x;
    if (cost(i) >= 0 && !busy.has(i) && !busy.has(i + 1) && !busy.has(i - 1) && !busy.has(i + W) && !busy.has(i - W)) out.push(i);
  }
  return out;
}
/** how many water tiles touch a would-be port (it has to sit on the shore) */
export function shoreTiles(x: number, y: number, w: number, h: number) {
  return borderTiles({ x, y, w, h }).filter(([bx, by]) => bx >= 0 && by >= 0 && bx < W && by < W && isWater(G.tiles[by * W + bx])).length;
}
export function findShipPath(from: number, p: Ent) { return gridPath(from, new Set(berths(p)), cost, p.x + p.w / 2, p.y + p.h / 2, 1.3, 2000000); }
const route = (from: number, goals: number[], p: Ent) => gridPath(from, new Set(goals), cost, p.x + p.w / 2, p.y + p.h / 2, 1.3, 2000000);
export const shipPorts = (): Ent[] => (G.L ? G.L.ports : []);

export function buyShip(home: Ent, target: Ent | null): string | null {
  const b = berths(home);
  if (!b.length) return 'No open water next to this port for a ship to moor';
  if (!canAfford(BLD.ship.cost)) return 'Need: ' + missingText(BLD.ship.cost);
  if (target && !findShipPath(b[0], target)) return `No water route from here to ${target.name} — ports must share a lake or the sea`;
  pay(BLD.ship.cost);
  const s: Ship = {
    id: G.nextId++, o: MP.teams ? MP.cur : 0, name: 'Ship ' + (++G.S.shipSeq), x: b[0] % W + 0.5, y: Math.floor(b[0] / W) + 0.5, a: 0,
    sched: target ? [home.id, target.id] : [home.id], si: 0, state: 'idle', cargo: {}, tot: 0, path: [], pi: 0, v: 0, waitT: 0, idleT: 0, retryT: 0,
  };
  if (target && home.mode === target.mode) { home.mode = 'load'; target.mode = 'unload'; }
  G.ships.push(s);
  G.fx.sfx('place');
  return null;
}
export function removeShip(s: Ship) {
  refund(BLD.ship.cost);
  for (const k in s.cargo) addInv(k, s.cargo[k]);
  G.ships = G.ships.filter(x => x !== s);
  G.fx.sfx('remove');
}
export function shipAt(wx: number, wy: number): Ship | null {
  for (const s of G.ships) if (Math.hypot(s.x - wx, s.y - wy) < 1.3) return s;
  return null;
}

export function updateShips(dt: number) {
  for (const s of G.ships) {
    if (!vctx(s)) continue;
    if (!s.sched.length) { s.state = 'noschedule'; s.v = 0; continue; }
    if (s.si >= s.sched.length) s.si = 0;
    const p = G.ents.get(s.sched[s.si]);
    if (!p) { s.sched.splice(s.si, 1); continue; }
    switch (s.state) {
      case 'noschedule': case 'idle': case 'nopath': {
        s.retryT -= dt;
        if (s.retryT > 0) break;
        const here = Math.floor(s.y) * W + Math.floor(s.x);
        const S: any = s;
        const free = freeBerths(p, s);
        if (free.length) {
          const path = route(here, free, p);
          if (!path) { s.state = 'nopath'; s.retryT = 6; s.v = 0; S.bay = -1; break; }
          S.bay = path.length ? path[path.length - 1] : here; S.qspot = -1;
          s.path = path; s.pi = 0; s.state = path.length ? 'moving' : 'loading'; s.waitT = 0; s.idleT = 0;
        } else {
          // every berth is taken: wait at anchor nearby and try again shortly
          S.bay = -1;
          if (S.qspot === here) { s.state = 'queued'; s.retryT = 2; s.v = 0; break; }
          const q = anchorage(p, s);
          const path = q.length ? route(here, q, p) : null;
          if (!path) { s.state = 'queued'; s.retryT = 3; s.v = 0; S.qspot = here; break; }
          S.qspot = path.length ? path[path.length - 1] : here;
          s.path = path; s.pi = 0; s.state = 'moving'; S.toQueue = 1;
        }
        break;
      }
      case 'queued': {
        s.retryT -= dt; s.v = 0;
        if (s.retryT <= 0) { s.state = 'idle'; s.retryT = 0; }
        break;
      }
      case 'moving': {
        if (s.pi >= s.path.length) {
          if ((s as any).toQueue) { (s as any).toQueue = 0; s.state = 'queued'; s.retryT = 2; s.v = 0; break; }
          s.state = 'loading'; s.v = 0; s.waitT = 0; s.idleT = 0; break;
        }
        const nxt = s.path[s.pi];
        if (!shipPassable(nxt)) { s.state = 'idle'; s.retryT = 0; s.v = 0; break; }
        const left = s.path.length - s.pi;
        s.v = Math.min(VMAX, s.v + ACC * dt, Math.sqrt(2 * 3 * Math.max(0, left - 0.5)) + 0.6);
        let step = s.v * dt;
        const tx = nxt % W + 0.5, ty = Math.floor(nxt / W) + 0.5;
        if (Math.hypot(tx - s.x, ty - s.y) > 1e-4) {
          let da = Math.atan2(ty - s.y, tx - s.x) - s.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          s.a += da * Math.min(1, dt * 3);   // ships turn slowly
        }
        while (step > 0 && s.pi < s.path.length) {
          const n2 = s.path[s.pi], x2 = n2 % W + 0.5, y2 = Math.floor(n2 / W) + 0.5, dx = x2 - s.x, dy = y2 - s.y, dist = Math.hypot(dx, dy);
          if (dist <= step) { s.x = x2; s.y = y2; step -= dist; s.pi++; }
          else { s.x += dx / dist * step; s.y += dy / dist * step; step = 0; }
        }
        break;
      }
      case 'loading': {
        s.waitT += dt;
        // moored: swing round to lie alongside the pier
        if (BLD[p.type].pier) { let da = p.rot * Math.PI / 2 - s.a; while (da > Math.PI / 2) da -= Math.PI; while (da < -Math.PI / 2) da += Math.PI; s.a += da * Math.min(1, dt * 1.5); }
        const moved = transfer(s, p, dt);
        s.idleT = moved ? 0 : s.idleT + dt;
        const full = p.mode === 'load' ? s.tot >= SHIP_CAP : s.tot <= 0;
        if (s.sched.length > 1 && ((s.waitT > 3 && (full || s.idleT > 2)) || s.waitT > 90)) { s.si = (s.si + 1) % s.sched.length; s.state = 'idle'; s.retryT = 0; (s as any).bay = -1; }
        break;
      }
    }
  }
}
function transfer(s: Ship, p: Ent, dt: number): boolean {
  if (!p.pnet || p.pnet.sat < 0.05) return false;
  (s as any).xacc = ((s as any).xacc || 0) + dt * 200;
  let n = Math.floor((s as any).xacc);
  if (n <= 0) return true;
  (s as any).xacc -= n;
  let moved = 0;
  if (p.mode === 'load') {
    while (n > 0 && s.tot < SHIP_CAP && p.tot > 0) {
      const k = Object.keys(p.store)[0], m = Math.min(n, p.store[k], SHIP_CAP - s.tot);
      p.store[k] -= m; p.tot -= m; if (!p.store[k]) delete p.store[k];
      s.cargo[k] = (s.cargo[k] || 0) + m; s.tot += m; n -= m; moved += m;
    }
  } else {
    const cap = BLD[p.type].cap!;
    while (n > 0 && p.tot < cap && s.tot > 0) {
      const k = Object.keys(s.cargo)[0], m = Math.min(n, s.cargo[k], cap - p.tot);
      s.cargo[k] -= m; s.tot -= m; if (!s.cargo[k]) delete s.cargo[k];
      p.store[k] = (p.store[k] || 0) + m; p.tot += m; n -= m; moved += m;
    }
    if (moved) G.S.flags.shipDelivered = (G.S.flags.shipDelivered || 0) + moved;
  }
  return moved > 0;
}
