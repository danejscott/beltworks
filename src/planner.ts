// Production planner: how many machines of what make these items at these rates? Several products can be planned
// together (shared intermediates are added up), optionally with the alternate recipes you've researched.
import { BLD, isFluid, ITEMS, mainRecipe, MACHINE_NAMES, RECIPES, Recipe } from './data';

export interface PlanStep { item: string; rate: number; recipe: Recipe; machine: string; count: number; power: number; depth: number }
export interface PlanEdge { from: string; to: string; item: string; rate: number }
export interface Plan { steps: PlanStep[]; raw: Record<string, number>; power: number; byproducts: Record<string, number>; edges: PlanEdge[] }
export interface Target { item: string; rate: number }

const machineBld = (m: string) => Object.keys(BLD).find(k => BLD[k].machine === m)!;
/** items the planner treats as raw inputs (mined, pumped, or only made as a byproduct) */
export const isRawForPlan = (k: string) => !mainRecipe(k) || k === 'water' || k === 'heavy_oil' || k === 'polymer_resin';
export const plannableItems = () => Object.keys(ITEMS).filter(k => mainRecipe(k) && !['power_shard', 'amplifier', 'hard_drive'].includes(k) && (!isFluid(k) || k === 'fuel' || k === 'turbofuel' || k === 'rocket_fuel'));

/** the recipe used for an item: a researched alternate if allowed, otherwise the standard one */
export function recipeFor(k: string, alts: string[] | null): Recipe | null {
  if (alts) for (const id of alts) { const r = RECIPES[id]; if (r && r.alt && Object.keys(r.out)[0] === k) return r; }
  return mainRecipe(k);
}

export function plan(targets: Target[] | string, perMin?: number, alts: string[] | null = null): Plan {
  const list: Target[] = typeof targets === 'string' ? [{ item: targets, rate: perMin || 0 }] : targets;
  const byKey = new Map<string, PlanStep>();
  const raw: Record<string, number> = {}, by: Record<string, number> = {};
  const flow = new Map<string, PlanEdge>();
  const edge = (from: string, to: string, item: string, rate: number) => { if (!to) return; const key = from + '>' + to; const e = flow.get(key); if (e) e.rate += rate; else flow.set(key, { from, to, item, rate }); };
  const need = (k: string, rate: number, depth: number, guard: number, to = '') => {
    if (rate <= 1e-9) return;
    if (isRawForPlan(k) || guard > 12) { raw[k] = (raw[k] || 0) + rate; edge('raw:' + k, to, k, rate); return; }
    edge(k, to, k, rate);
    const r = recipeFor(k, alts)!;
    const perMachine = r.out[k] * 60 / r.t;
    const count = rate / perMachine;
    let s = byKey.get(k);
    if (!s) { s = { item: k, rate: 0, recipe: r, machine: r.m, count: 0, power: 0, depth }; byKey.set(k, s); }
    s.rate += rate; s.count += count; s.depth = Math.max(s.depth, depth);
    s.power = s.count * (BLD[machineBld(r.m)].power || 0);
    for (const o in r.out) if (o !== k) by[o] = (by[o] || 0) + r.out[o] * 60 / r.t * count;
    for (const i in r.in) need(i, r.in[i] * 60 / r.t * count, depth + 1, guard + 1, k);
  };
  for (const t of list) need(t.item, t.rate, 0, 0);
  // depths so every producer sits left of everything it feeds
  for (let pass = 0; pass < 12; pass++) for (const e of flow.values()) {
    const a = byKey.get(e.from), b = byKey.get(e.to);
    if (a && b && a.depth <= b.depth) a.depth = b.depth + 1;
  }
  const steps = [...byKey.values()].sort((a, b) => a.depth - b.depth);
  let power = 0; for (const s of steps) power += s.power;
  return { steps, raw, power, byproducts: by, edges: [...flow.values()] };
}
export const machineName = (m: string) => MACHINE_NAMES[m] || m;
export const machineType = machineBld;
export { RECIPES };
