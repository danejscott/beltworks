// Rockets: the Launch Pad. It fills a tank with Rocket Fuel (by pipe) and a payload bay with station parts (by belt);
// with a full tank and parts aboard it counts down and launches. At stage separation the upper stage carries the parts
// to orbit (they count toward the Space Station phase) and the booster flies back to be caught by the tower's arms,
// lowered onto the launch mount, and stacked with a fresh upper stage, ready to fly again.
import { ITEMS, MILESTONES } from './data';
import { curPhase, orbitDeliver } from './progress';
import { creative, Ent, G } from './world';

export const FUEL_PER_LAUNCH = 1200;       // m³ of Rocket Fuel per launch
export const FUEL_CAP = 2400;
export const PAYLOAD_CAP = 30;             // parts per launch
export const FUEL_IN = 600;                // m³ per minute the pad can take
export const COUNTDOWN = 10;               // seconds
// the flight, in seconds after ignition
export const T_LIFT = 3, T_SEP = 28, T_RETURN = 36, T_CATCH = 56, T_LOWERED = 64, T_DONE = 72;

export const PAYLOAD_ITEMS = ['truss_segment', 'solar_array', 'habitat_module'];
export const isPayload = (k: string) => PAYLOAD_ITEMS.includes(k);

/** parts the station still needs, less what's already sitting in pads / flying */
export function stillNeeded(k: string): number {
  const ph = curPhase();
  const p5 = ph && ph.orbit ? ph : null;
  if (!p5 || !p5.req[k]) return creative() && isPayload(k) ? 1e9 : 0;   // creative: launch for fun any time
  let queued = 0;
  for (const e of (G.L && G.L.pads) || []) queued += (e.pay && e.pay[k]) || 0;
  return p5.req[k] - (G.S.elev[k] || 0) - queued;
}
export function orbitPhase() { return MILESTONES.find(m => m.orbit); }

/** belt input: station parts only, while the bay has room and the station still needs them */
export function padAccept(e: Ent, item: string): boolean {
  if (!isPayload(item)) return false;
  initPad(e);
  if (e.ph || e.ptot >= PAYLOAD_CAP) return false;      // no loading while a rocket is away
  if (stillNeeded(item) <= 0) return false;
  e.pay[item] = (e.pay[item] || 0) + 1; e.ptot++;
  return true;
}
export function initPad(e: Ent) { if (!e.pay) { e.pay = {}; e.ptot = 0; } if (e.fuel === undefined) e.fuel = 0; }

/** load parts from the inventory into the pad */
export function loadPadFromInv(e: Ent): number {
  initPad(e);
  if (e.ph) return 0;
  let moved = 0;
  for (const k of PAYLOAD_ITEMS) {
    const n = Math.min(Math.floor(G.S.inv[k] || 0), PAYLOAD_CAP - e.ptot, stillNeeded(k));
    if (n > 0) { G.S.inv[k] -= n; e.pay[k] = (e.pay[k] || 0) + n; e.ptot += n; moved += n; }
  }
  return moved;
}
export const canLaunch = (e: Ent) => !e.ph && e.ptot > 0 && e.fuel >= FUEL_PER_LAUNCH;
export function startCountdown(e: Ent) { if (!canLaunch(e)) return false; e.ph = 'count'; e.lt = -COUNTDOWN; return true; }

/** one sim step for every pad: take fuel, count down, fly */
export function tickPads(dt: number, pullFluid: (e: Ent, k: string, want: number) => number) {
  for (const e of G.L.pads as Ent[]) {
    initPad(e);
    if (e.fuel < FUEL_CAP) e.fuel += pullFluid(e, 'rocket_fuel', Math.min(FUEL_CAP - e.fuel, FUEL_IN / 60 * dt));
    if (!e.ph) {
      // launch by itself once the bay is full, or it holds the last parts the station needs
      const last = PAYLOAD_ITEMS.every(k => stillNeeded(k) <= 0);
      if (e.fuel >= FUEL_PER_LAUNCH && e.ptot > 0 && (e.ptot >= PAYLOAD_CAP || last || e.auto === 0)) startCountdown(e);
      e.st = e.ptot > 0 && e.fuel < FUEL_PER_LAUNCH ? 'nofuel' : 'idle';
      continue;
    }
    const before = e.lt;
    e.lt += dt;
    e.st = 'work';
    if (before < 0 && e.lt >= 0) { G.fx.toast(`${e.name || 'Launch Pad'}: ignition — liftoff!`, 'good'); G.fx.sfx('liftoff'); }
    if (before < T_RETURN + 4 && e.lt >= T_RETURN + 4) G.fx.sfx('boom');
    if (before < T_CATCH - 6 && e.lt >= T_CATCH - 6) G.fx.sfx('landing');
    if (before < T_SEP && e.lt >= T_SEP) {
      // stage separation: the parts are on their way to orbit
      const got = Object.keys(e.pay).filter(k => e.pay[k] > 0).map(k => `${e.pay[k]} ${ITEMS[k].n}`).join(', ');
      for (const k in e.pay) orbitDeliver(k, e.pay[k]);
      e.pay = {}; e.ptot = 0;
      G.S.launches = (G.S.launches || 0) + 1;
      if (got) G.fx.toast(`Stage separation: ${got} heading for orbit. Booster coming home.`, 'good');
    }
    if (before < T_CATCH && e.lt >= T_CATCH) { G.fx.toast('Booster caught by the tower!', 'good'); G.fx.sfx('clank'); }
    if (e.lt >= T_DONE) { e.ph = undefined; e.lt = 0; }
  }
}

// ---------------------------------------------------------------------------
// Where everything is during a flight (pad-local coordinates, y up). Used by the renderer.
export const MOUNT_X = -1.2, MOUNT_H = 2.1, TOWER_X = 2.6, BOOSTER_H = 9, SHIP_H = 6.2, ARM_GRIP = 7.5;
const CATCH_BASE = MOUNT_H + 3.2;
const ease = (p: number) => p < 0 ? 0 : p > 1 ? 1 : p * p * (3 - 2 * p);
export interface Pose { by: number; bx: number; ship: number; bFlame: number; sFlame: number; arms: number; armY: number; tilt: number; smoke: number }
export function padPose(e: Ent): Pose {
  const t = e.ph ? e.lt : -99;
  const P: Pose = { by: MOUNT_H, bx: MOUNT_X, ship: MOUNT_H + BOOSTER_H, bFlame: 0, sFlame: 0, arms: 1, armY: CATCH_BASE + ARM_GRIP, tilt: 0, smoke: 0 };
  if (!e.ph || t < 0) {
    // on the pad; the arms hold the stack until the last seconds of the countdown
    P.arms = e.ph && t > -4 ? ease((t + 4) / 2) : 0; P.armY = MOUNT_H + ARM_GRIP;
    if (e.ph && t > -1.5) { P.bFlame = 0.25; P.smoke = 0.5; }
    return P;
  }
  const up = (s: number) => s < T_LIFT ? 0 : 0.5 * 1.05 * (s - T_LIFT) * (s - T_LIFT);
  if (t < T_SEP) {
    P.by = MOUNT_H + up(t); P.ship = P.by + BOOSTER_H; P.bFlame = t < T_LIFT ? 0.6 + t / T_LIFT * 0.4 : 1; P.smoke = t < T_LIFT + 4 ? 1 : 0;
    P.armY = MOUNT_H + ARM_GRIP; P.tilt = Math.max(0, t - 12) * 0.006;
    return P;
  }
  P.ship = t < T_SEP + 8 ? MOUNT_H + up(t) + BOOSTER_H + (t - T_SEP) * 30 : -999; P.sFlame = 1;
  P.armY = CATCH_BASE + ARM_GRIP;
  if (t < T_RETURN) { P.by = -999; return P; }
  if (t < T_CATCH) {
    const p = (t - T_RETURN) / (T_CATCH - T_RETURN), q = 1 - p;
    P.by = CATCH_BASE + 340 * q * q * q; P.bx = MOUNT_X + 9 * q * q;
    P.tilt = -0.25 * q * q;
    P.bFlame = p > 0.72 ? 1 : 0;
    P.arms = t > T_CATCH - 1.2 ? ease((T_CATCH - t) / 1.2) : 1;
    return P;
  }
  // caught: the arms lower the booster back onto the mount, a new upper stage is stacked, the arms let go
  const lp = ease((t - T_CATCH - 1) / (T_LOWERED - T_CATCH - 1));
  P.by = CATCH_BASE + (MOUNT_H - CATCH_BASE) * lp;
  P.armY = P.by + ARM_GRIP; P.arms = 0;
  P.ship = t > T_LOWERED + 2 ? P.by + BOOSTER_H + Math.max(0, (T_LOWERED + 5 - t)) * 2 : -999;
  if (t > T_DONE - 2) P.arms = 0;
  return P;
}
