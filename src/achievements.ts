// 25 achievements, checked every couple of seconds.
import { BLD } from './data';
import { isNight } from './daynight';
import { discoveredCount } from './explore';
import { G } from './world';

export interface Ach { id: string; n: string; d: string; i: string; test: () => boolean }
const cnt = (kind: string) => { let n = 0; if (!G.L) return 0; for (const t in G.L.cnt) if (BLD[t] && BLD[t].kind === kind) n += G.L.cnt[t]; return n; };
const made = (k: string) => (G.S.made[k] || 0);
const totalCap = () => { let c = 0; for (const n of G.pnets) c += n.cap; return c; };

export const ACHS: Ach[] = [
  { id: 'first_steps', n: 'First Steps', d: 'Hand-mine your first ore.', i: '⛏️', test: () => !!G.S.flags.mined },
  { id: 'automation', n: 'Automation!', d: 'Place your first Miner.', i: '🤖', test: () => cnt('miner') > 0 },
  { id: 'hot_stuff', n: 'Hot Stuff', d: 'Smelt your first ingot in a Smelter.', i: '🔥', test: () => made('iron_ingot') + made('copper_ingot') > 0 },
  { id: 'belt_it_out', n: 'Belt It Out', d: 'Have 100 conveyor belts.', i: '➰', test: () => cnt('belt') >= 100 },
  { id: 'conveyor_king', n: 'Conveyor King', d: 'Have 1,000 conveyor belts.', i: '👑', test: () => cnt('belt') >= 1000 },
  { id: 'milestone_maker', n: 'Milestone Maker', d: 'Complete 5 milestones.', i: '📋', test: () => G.S.done.size >= 5 },
  { id: 'tier_climber', n: 'Tier Climber', d: 'Reach Tier 4.', i: '🧗', test: () => G.S.maxTier >= 4 },
  { id: 'liftoff', n: 'Liftoff', d: 'Complete Space Elevator Phase 1.', i: '🛗', test: () => G.S.done.has('p1') },
  { id: 'project_assembly', n: 'Project Assembly', d: 'Launch Project Assembly and win the game.', i: '🚀', test: () => !!G.S.won },
  { id: 'lumberjack', n: 'Lumberjack', d: 'Chop 500 trees (by hand or with harvesters).', i: '🪓', test: () => (G.S.flags.chops || 0) >= 500 },
  { id: 'power_up', n: 'Power Up', d: 'Produce 100 MW of power capacity.', i: '⚡', test: () => totalCap() >= 100 },
  { id: 'megawatt_mogul', n: 'Megawatt Mogul', d: 'Produce 1,000 MW of power capacity.', i: '🏭', test: () => totalCap() >= 1000 },
  { id: 'explorer', n: 'Explorer', d: 'Discover 100 resource nodes.', i: '🧭', test: () => discoveredCount() >= 100 },
  { id: 'choo_choo', n: 'Choo Choo', d: 'Deliver cargo by train.', i: '🚂', test: () => (G.S.flags.trainDelivered || 0) > 0 },
  { id: 'rail_baron', n: 'Rail Baron', d: 'Run 5 trains at once.', i: '🎩', test: () => G.trains.length >= 5 },
  { id: 'keep_truckin', n: 'Keep on Truckin\'', d: 'Deliver cargo by truck.', i: '🚚', test: () => (G.S.flags.truckDelivered || 0) > 0 },
  { id: 'fluid_dynamics', n: 'Fluid Dynamics', d: 'Pump 10,000 units of water.', i: '💧', test: () => made('water') >= 10000 },
  { id: 'black_gold', n: 'Black Gold', d: 'Refine your first Plastic.', i: '🛢️', test: () => made('plastic') > 0 },
  { id: 'scavenger', n: 'Scavenger', d: 'Loot 5 crash sites.', i: '🛸', test: () => (G.S.flags.sites || 0) >= 5 },
  { id: 'mad_scientist', n: 'Mad Scientist', d: 'Research 5 alternate recipes.', i: '🧪', test: () => G.S.alts.length >= 5 },
  { id: 'shard_collector', n: 'Shard Collector', d: 'Collect 10 power crystals.', i: '💎', test: () => (G.S.flags.crystals || 0) >= 10 },
  { id: 'overclocked', n: 'Overclocked', d: 'Run a machine above 200% clock speed.', i: '⏱️', test: () => G.L && [...G.L.machines, ...G.L.miners].some((e: any) => e.clock > 2.001) },
  { id: 'recycler', n: 'Recycler', d: 'Earn 10 coupons from the Resource Sink.', i: '♻️', test: () => (G.S.couponsEarned || 0) >= 10 },
  { id: 'industrial_complex', n: 'Industrial Complex', d: 'Build 100 production machines.', i: '🏗️', test: () => G.L && G.L.machines.length >= 100 },
  { id: 'night_shift', n: 'Night Shift', d: 'Have 20 machines working at night.', i: '🌙', test: () => isNight() && G.L && G.L.machines.filter((e: any) => e.st === 'work').length >= 20 },
];

let t = 0;
/** checks achievements; calls onUnlock for each new one */
export function tickAchievements(dt: number, onUnlock: (a: Ach) => void) {
  t += dt;
  if (t < 2) return;
  t = 0;
  const S = G.S;
  for (const a of ACHS) {
    if (S.ach[a.id]) continue;
    let ok = false;
    try { ok = a.test(); } catch { ok = false; }
    if (ok) { S.ach[a.id] = Math.max(1, Math.round(S.time)); onUnlock(a); }
  }
}
