// Difficulty settings in one place: starting kit, resource richness, tree regrowth and game length.
import type { Cost } from './data';

export interface Diff {
  label: string; icon: string; desc: string; hours: string;
  kit: Cost;            // starting inventory
  regrow: number;       // mean seconds for a chopped tree to grow back
  pureBias: number;     // more (or fewer) pure nodes
  impure: number;       // share of impure nodes
  rich: number;         // how many resource nodes the world gets
  lateMult: number;     // milestone / Space Elevator amounts at Tier 5+ (early tiers ramp up to it).
                        // Tuned with a production/building-time model to hit the target play times above.
}
export const DIFF: Record<string, Diff> = {
  easy: {
    label: 'Easy', icon: '🌱', hours: '10–15 h', desc: 'Rich resources, lots of pure nodes, a generous starting kit. Trees grow back quickly.',
    kit: { iron_plate: 200, iron_rod: 140, wood: 60 }, regrow: 150, pureBias: 0.15, impure: 0.18, rich: 1.5, lateMult: 0.75,
  },
  normal: {
    label: 'Normal', icon: '⚙️', hours: '15–30 h', desc: 'The intended experience: a fair mix of node quality and a modest starting kit.',
    kit: { iron_plate: 120, iron_rod: 80, wood: 30 }, regrow: 450, pureBias: 0.05, impure: 0.32, rich: 1.1, lateMult: 2.25,
  },
  hard: {
    label: 'Hard', icon: '⛏️', hours: '30–50 h', desc: 'Scarce, mostly impure nodes and a small starting kit. Trees take ages to grow back.',
    kit: { iron_plate: 80, iron_rod: 50, wood: 10 }, regrow: 1200, pureBias: -0.04, impure: 0.5, rich: 0.7, lateMult: 3.75,
  },
  creative: {
    label: 'Creative', icon: '🎨', hours: 'no limit', desc: 'Everything unlocked, unlimited materials, trees regrow fast. Just build.',
    kit: {}, regrow: 60, pureBias: 0.08, impure: 0.3, rich: 1.2, lateMult: 1,
  },
};
export const diffOf = (mode?: string) => DIFF[mode || 'easy'] || DIFF.easy;
/** requirement multiplier for a tier: Tier 0 stays as-is (tutorial), then ramps to lateMult by Tier 5 */
export function tierMult(mode: string | undefined, tier: number) {
  const L = diffOf(mode).lateMult;
  return 1 + (L - 1) * Math.min(1, tier / 5);
}
