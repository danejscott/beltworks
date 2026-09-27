// Day/night cycle: pure logic (the renderer reads these values to light the scene).
import { G } from './world';

export const DAY_LEN = 720; // seconds of game time per full day (12 minutes at 1x speed)
const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const cycleOn = () => !!(G.S && G.S.dayNight !== false);
/** 0..1 through the day: 0.25 sunrise, 0.5 noon, 0.75 sunset, 0 / 1 midnight */
export function dayPhase() { return cycleOn() ? (G.S.time / DAY_LEN + 0.3) % 1 : 0.42; }
/** sun elevation, -1..1 */
export function sunElev(p = dayPhase()) { return Math.sin((p - 0.25) * TAU); }
/** 0 at night .. 1 in full daylight */
export function daylight() { return cycleOn() ? smooth(-0.08, 0.28, sunElev()) : 1; }
/** how strongly things should glow (0 by day, 1 at night) */
export const nightness = () => 1 - daylight();
export const isNight = () => nightness() > 0.7;
/** solar panel output factor */
export const solarFactor = () => cycleOn() ? smooth(0.0, 0.45, sunElev()) : 1;
export function clockText() {
  const p = dayPhase(), mins = Math.floor(p * 24 * 60), h = Math.floor(mins / 60), m = mins % 60;
  return `${nightness() > 0.5 ? '🌙' : '☀️'} ${String(h).padStart(2, '0')}:${String(m - (m % 10)).padStart(2, '0')}`;
}
