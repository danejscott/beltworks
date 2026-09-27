// Production planner (Easy & Creative): how many machines of what make N items per minute?
import { BLD, isFluid, ITEMS, mainRecipe, MACHINE_NAMES, RECIPES, Recipe } from './data';

export interface PlanStep { item: string; rate: number; recipe: Recipe; machine: string; count: number; power: number; depth: number }
export interface Plan { steps: PlanStep[]; raw: Record<string, number>; power: number; byproducts: Record<string, number> }

const machineBld = (m: string) => Object.keys(BLD).find(k => BLD[k].machine === m)!;
/** items the planner treats as raw inputs (mined, pumped, or only made as a byproduct) */
export const isRawForPlan = (k: string) => !mainRecipe(k) || k === 'water' || k === 'heavy_oil' || k === 'polymer_resin';
export const plannableItems = () => Object.keys(ITEMS).filter(k => !isFluid(k) && mainRecipe(k) && !['power_shard', 'amplifier', 'hard_drive'].includes(k));

export function plan(item: string, perMin: number): Plan {
  const byKey = new Map<string, PlanStep>();
  const raw: Record<string, number> = {}, by: Record<string, number> = {};
  const need = (k: string, rate: number, depth: number, guard: number) => {
    if (rate <= 1e-9) return;
    if (isRawForPlan(k) || guard > 12) { raw[k] = (raw[k] || 0) + rate; return; }
    const r = mainRecipe(k)!;
    const perMachine = r.out[k] * 60 / r.t;
    const count = rate / perMachine;
    let s = byKey.get(k);
    if (!s) { s = { item: k, rate: 0, recipe: r, machine: r.m, count: 0, power: 0, depth }; byKey.set(k, s); }
    s.rate += rate; s.count += count; s.depth = Math.max(s.depth, depth);
    s.power = s.count * (BLD[machineBld(r.m)].power || 0);
    for (const o in r.out) if (o !== k) by[o] = (by[o] || 0) + r.out[o] * 60 / r.t * count;
    for (const i in r.in) need(i, r.in[i] * 60 / r.t * count, depth + 1, guard + 1);
  };
  need(item, perMin, 0, 0);
  const steps = [...byKey.values()].sort((a, b) => a.depth - b.depth);
  let power = 0; for (const s of steps) power += s.power;
  return { steps, raw, power, byproducts: by };
}
export const machineName = (m: string) => MACHINE_NAMES[m] || m;
export { RECIPES };
