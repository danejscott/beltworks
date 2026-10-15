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
    label: 'Easy', icon: '🌱', hours: '10–15 h', desc: 'Resources are spread out and mostly impure — plan your expansion. A small starting kit; trees grow back quickly and fuel nodes refill.',
    kit: { iron_plate: 80, iron_rod: 50, wood: 10 }, regrow: 150, pureBias: 0.15, impure: 0.18, rich: 1.5, lateMult: 0.75,
  },
  normal: {
    label: 'Normal', icon: '⚙️', hours: '15–30 h', desc: 'Scarce resources, few pure nodes and a very small starting kit. Every good node is worth fighting your way to.',
    kit: { iron_plate: 60, iron_rod: 35, wood: 8 }, regrow: 450, pureBias: 0.05, impure: 0.32, rich: 1.1, lateMult: 2.25,
  },
  hard: {
    label: 'Hard', icon: '⛏️', hours: '30–50 h', desc: 'Very scarce, almost all impure nodes and a bare starting kit. Trees take ages to grow back.',
    kit: { iron_plate: 40, iron_rod: 25, wood: 5 }, regrow: 1200, pureBias: -0.04, impure: 0.5, rich: 0.7, lateMult: 3.75,
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
