import { BLD } from './data';
import { pushOut } from './sim';
import { Ent, G } from './world';

export const DRONE_LOAD = 400, DRONE_SPEED = 30;
const center = (e: Ent) => [e.x + e.w / 2, e.y + e.h / 2];

export function updateDrones(dt: number) {
  for (const p of G.L.drones) {
    const cap = BLD.drone_port.cap;
    p.req = p.target ? BLD.drone_port.power : 0;
    if (p.pnet) p.pnet.demand += p.req;
    const sat = p.pnet ? p.pnet.sat : 0;
    // inbox -> belts
    if (p.ibTot > 0) {
      const keys = Object.keys(p.inbox);
      const k = keys[(p.kr || 0) % keys.length];
      if (k && pushOut(p, k)) { p.inbox[k]--; p.ibTot--; p.kr = (p.kr || 0) + 1; if (!p.inbox[k]) delete p.inbox[k]; }
    }
    const dr = p.dr;
    const tgt: Ent = p.target ? G.ents.get(p.target) : null;
    if (dr.s === 'home') {
      if (!tgt || sat <= 0.01 || p.obTot <= 0 || tgt.ibTot >= cap) continue;
      let room = Math.min(DRONE_LOAD, cap - tgt.ibTot);
      for (const k of Object.keys(p.outbox)) {
        if (room <= 0) break;
        const m = Math.min(room, p.outbox[k]);
        p.outbox[k] -= m; p.obTot -= m; room -= m;
        dr.cargo[k] = (dr.cargo[k] || 0) + m; dr.n += m;
        if (!p.outbox[k]) delete p.outbox[k];
      }
      const [ax, ay] = center(p), [bx, by] = center(tgt);
      dr.dist = Math.max(1, Math.hypot(bx - ax, by - ay));
      dr.s = 'out'; dr.t = 0; dr.to = tgt.id;
    } else {
      dr.t += dt * DRONE_SPEED * Math.max(0.2, sat) / dr.dist;
      if (dr.t >= 1) {
        if (dr.s === 'out') {
          const d2 = G.ents.get(dr.to);
          if (d2) {
            for (const k of Object.keys(dr.cargo)) {
              const m = Math.min(dr.cargo[k], cap - d2.ibTot);
              if (m <= 0) continue;
              d2.inbox[k] = (d2.inbox[k] || 0) + m; d2.ibTot += m; dr.cargo[k] -= m; dr.n -= m;
              if (!dr.cargo[k]) delete dr.cargo[k];
            }
          }
          dr.s = 'back'; dr.t = 0;
        } else {
          for (const k in dr.cargo) { p.outbox[k] = (p.outbox[k] || 0) + dr.cargo[k]; p.obTot += dr.cargo[k]; }
          dr.cargo = {}; dr.n = 0; dr.s = 'home'; dr.t = 0;
        }
      }
    }
  }
}
export function dronePos(p: Ent): number[] | null {
  const dr = p.dr;
  if (dr.s === 'home') return null;
  const tgt = G.ents.get(dr.to);
  if (!tgt) return null;
  const [ax, ay] = center(p), [bx, by] = center(tgt);
  const t = dr.s === 'out' ? dr.t : 1 - dr.t;
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return [ax + (bx - ax) * e, ay + (by - ay) * e, Math.atan2(by - ay, bx - ax) + (dr.s === 'back' ? Math.PI : 0), Math.sin(t * Math.PI)];
}
