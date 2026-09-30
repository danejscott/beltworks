// Depleting fuel: coal, oil and uranium nodes hold a limited amount (worlds created from this version on).
// Coal runs out quickest, oil takes about three times longer, uranium about ten times. On Easy, an emptied
// node slowly fills back up.
import { G } from './world';
import type { ResNode } from './terrain';

/** how much a Normal-purity node holds (Impure half, Pure double) */
export const DEPLETE: Record<string, number> = { coal: 15000, crude_oil: 45000, uranium: 150000 };
const PURE = [0.5, 1, 2];
/** Easy worlds: an empty node refills this long (game seconds) after it ran dry */
const REFILL_S = 3600;

export const depletes = (res: string) => !!(G.S && (G.S as any).depV && DEPLETE[res]);
export const nodeCap = (n: ResNode) => DEPLETE[n.res] * PURE[n.p];
/** what's left in a node, or null if it never runs out */
export function remaining(n: ResNode | null | undefined): number | null {
  if (!n || !depletes(n.res)) return null;
  const d = (G.S as any).dep;
  return d && d[n.id] !== undefined ? d[n.id] : nodeCap(n);
}
export const isDepleted = (n: ResNode | null | undefined) => { const r = remaining(n); return r !== null && r <= 0; };
/** take up to `amt` from a node; returns how much it actually gave */
export function take(n: ResNode, amt: number): number {
  if (!depletes(n.res)) return amt;
  const S: any = G.S;
  const d = S.dep || (S.dep = {});
  const r = d[n.id] !== undefined ? d[n.id] : nodeCap(n);
  const t = Math.min(r, amt);
  d[n.id] = r - t;
  if (r > 0 && d[n.id] <= 0) { (S.depT || (S.depT = {}))[n.id] = Math.round(S.time); G.rev++; G.fx.toast(`⛏ A ${n.res === 'crude_oil' ? 'oil well' : n.res === 'coal' ? 'coal node' : 'uranium node'} has run dry — time to find another.`, 'bad'); }
  return t;
}
/** Easy: refill nodes that have been empty long enough (called about once a second) */
export function tickRefill() {
  const S: any = G.S;
  if (!S || !S.depV || S.mode !== 'easy' || !S.depT) return;
  for (const id in S.depT) if (S.time - S.depT[id] >= REFILL_S) { delete S.depT[id]; delete S.dep[id]; G.rev++; }
}
