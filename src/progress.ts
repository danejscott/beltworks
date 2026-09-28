import { BLD, MILESTONES, Milestone, RECIPES, SHOP, TIER_NAMES } from './data';
import { stat, stats } from './sim';
import { addInv, canAfford, count, Ent, G, missingText, pay } from './world';

export function curPhase(): Milestone | undefined {
  return MILESTONES.find(m => m.phase && !G.S.done.has(m.id) && m.tier <= G.S.maxTier);
}
export function delivered(e: Ent, item: string) {
  const S = G.S;
  S.delivered[item] = (S.delivered[item] || 0) + 1;
  stat(stats.D, item, 1);
  deliverFx(e, item);
}
export let deliverFx = (_e: Ent, _item: string) => { };
export function setDeliverFx(f: (e: Ent, item: string) => void) { deliverFx = f; }

export function elevatorAccept(item: string) {
  const S = G.S, ph = curPhase();
  if (ph && ph.req[item] && (S.elev[item] || 0) < ph.req[item]) { S.elev[item] = (S.elev[item] || 0) + 1; checkPhase(ph); }
  else addInv(item, 1);
}
function checkPhase(ph: Milestone) {
  for (const k in ph.req) if ((G.S.elev[k] || 0) < ph.req[k]) return;
  G.S.elev = {};
  completeMilestone(ph);
}
export function loadElevator() {
  const S = G.S, ph = curPhase();
  if (!ph) return;
  if (!count('elevator')) { G.fx.toast('Build the Space Elevator first (Special tab)', 'bad'); G.fx.sfx('err'); return; }
  let moved = 0;
  for (const k in ph.req) {
    const n = Math.min(Math.floor(S.inv[k] || 0), ph.req[k] - (S.elev[k] || 0));
    if (n > 0) { S.inv[k] -= n; S.elev[k] = (S.elev[k] || 0) + n; moved += n; }
  }
  if (moved) { G.fx.sfx('click'); G.fx.toast(`Loaded ${moved} parts into the Space Elevator`, 'good'); checkPhase(ph); }
  else { G.fx.toast('Nothing in your inventory that this phase needs', 'bad'); G.fx.sfx('err'); }
}
export function milestoneReady(m: Milestone) {
  if (m.tier > G.S.maxTier || G.S.done.has(m.id) || m.phase) return false;
  return canAfford(m.req);
}
export function submitMilestone(id: string) {
  const m = MILESTONES.find(x => x.id === id);
  if (!m) return;
  if (m.phase) { loadElevator(); return; }
  if (!milestoneReady(m)) { G.fx.sfx('err'); G.fx.toast('Need: ' + missingText(m.req), 'bad'); return; }
  pay(m.req);
  completeMilestone(m);
}
export let onMilestone = (_m: Milestone) => { };
export function setOnMilestone(f: (m: Milestone) => void) { onMilestone = f; }

export function completeMilestone(m: Milestone) {
  const S = G.S;
  S.done.add(m.id);
  const pt = Math.round(S.playT ?? S.time);
  (S.msT = S.msT || {})[m.id] = pt;
  const tierBefore = S.maxTier;
  if (m.un) for (const k of m.un) S.unlocked.add(k);
  if (m.unlockTiers) for (const t of m.unlockTiers) if (t > S.maxTier) S.maxTier = t;
  if (S.maxTier === 0 && MILESTONES.filter(x => x.tier === 0).every(x => S.done.has(x.id))) S.maxTier = 2;
  if (S.maxTier > tierBefore) (S.tierT = S.tierT || {})[S.maxTier] = pt;
  if (m.win && !S.won) { S.won = true; S.wonT = pt; recordBest(); }
  onMilestone(m);
}
export const tierName = (t: number) => TIER_NAMES[t] || '';
/** personal bests per difficulty + map size, kept in this browser */
export function loadRecords(): Record<string, { t: number; name: string; date: number }> { try { return JSON.parse(localStorage.getItem('bw-records') || '{}'); } catch { return {}; } }
function recordBest() {
  const S = G.S, key = `${S.mode}|${S.size}`, rec = loadRecords(), t = Math.round(S.playT ?? S.time);
  if (S.mode === 'creative') return;
  if (!rec[key] || t < rec[key].t) { rec[key] = { t, name: S.name, date: Date.now() }; S.flags.pbNew = 1; try { localStorage.setItem('bw-records', JSON.stringify(rec)); } catch { } }
}

// ---------------------------------------------------------------------------
// Points, coupons, shop
export const couponCost = () => Math.round(400 * Math.pow(1.12, G.S.couponsEarned) / 50) * 50;
export function addPoints(n: number) {
  const S = G.S;
  S.points += n;
  let c = couponCost();
  while (S.points >= c) {
    S.points -= c; S.coupons++; S.couponsEarned++;
    G.fx.toast(`🎟 Coupon earned! You have ${S.coupons} — spend them in the Shop (K)`, 'good');
    G.fx.sfx('coupon');
    c = couponCost();
  }
}
export function buyShop(id: string) {
  const S = G.S, it = SHOP.find(s => s.id === id);
  if (!it) return;
  if (!it.repeat && S.shop[id]) return;
  if (S.coupons < it.cost) { G.fx.toast(`Need ${it.cost} coupons`, 'bad'); G.fx.sfx('err'); return; }
  S.coupons -= it.cost;
  S.shop[id] = (S.shop[id] || 0) + 1;
  if (it.give) for (const k in it.give) addInv(k, it.give[k]);
  if (it.unlock) S.unlocked.add(it.unlock);
  if (id === 'wires') G.dirty.power = true;
  G.fx.sfx('milestone');
  G.fx.toast(`Bought: <b>${it.n}</b>`, 'good');
}
export function unlockName(k: string) { return Object.hasOwn(BLD, k) ? BLD[k].n : RECIPES[k] ? RECIPES[k].n + ' recipe' : k; }
