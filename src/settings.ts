// Player settings kept in this browser: interface size, colour-blind palette, reduced motion and key bindings.
export interface Settings { ui: number; cb: boolean; calm: boolean; keys: Record<string, string> }
const DEF: Settings = { ui: 1, cb: false, calm: false, keys: {} };
export const SET: Settings = load();
function load(): Settings { try { return { ...DEF, ...JSON.parse(localStorage.getItem('bw-settings') || '{}') }; } catch { return { ...DEF }; } }
export function saveSettings() { try { localStorage.setItem('bw-settings', JSON.stringify(SET)); } catch { } applySettings(); }

/** status colours (machines' lamps, the bottleneck pins, the status dots) — normal and colour-blind safe (Okabe–Ito) */
const NORMAL = { work: '#4cc38a', starve: '#f2c94c', block: '#ef5b5b', idle: '#6b7482', nopower: '#9a7aff', lowpower: '#ff9a3a', noout: '#ef5b5b', depleted: '#8a8f99' };
const CB = { work: '#56b4e9', starve: '#f0e442', block: '#d55e00', idle: '#8a8f99', nopower: '#cc79a7', lowpower: '#e69f00', noout: '#d55e00', depleted: '#8a8f99' };
export const palette = () => SET.cb ? CB : NORMAL;
const hooks: (() => void)[] = [];
export function onSettings(f: () => void) { hooks.push(f); f(); }

export function applySettings() {
  const r = document.documentElement;
  r.style.setProperty('--ui', String(SET.ui));
  document.body.classList.toggle('cb', SET.cb);
  document.body.classList.toggle('calm', SET.calm);
  for (const f of hooks) f();
}

// ---- key bindings: a thin layer in front of the game's keys. keys maps a default key to the player's key.
export const BINDABLE: [string, string][] = [
  ['i', 'Inventory'], ['h', 'Milestones'], ['c', 'Craft'], ['p', 'Stats'], ['k', 'Shop'], ['m', 'Map'], ['t', 'Vehicles'], ['n', 'Scanner'],
  ['u', 'Research'], ['j', 'Achievements'], ['l', 'Production planner'], ['y', 'Players (online)'], ['f', 'Belt'], ['q', 'Copy building'],
  ['r', 'Rotate'], ['x', 'Deconstruct'], ['b', 'Blueprints'], ['v', 'Power view'], ['g', 'Go to HUB'], ['o', 'Fast travel'],
];
/** what the game should see for a pressed key ('' = ignore it: its default action moved to another key) */
export function mapKey(k: string): string {
  for (const d in SET.keys) if (SET.keys[d] === k) return d;
  if (SET.keys[k] && SET.keys[k] !== k) return '';
  return k;
}
export const keyFor = (d: string) => SET.keys[d] || d;
export let rebinding = '';
export function startRebind(d: string) { rebinding = d; }
/** called first on every keydown: finishes a rebind if one is waiting */
export function rebindKey(ev: KeyboardEvent): boolean {
  if (!rebinding) return false;
  ev.preventDefault(); ev.stopImmediatePropagation();
  const k = ev.key.toLowerCase();
  if (k !== 'escape' && k.length === 1 && /[a-z0-9]/.test(k)) {
    for (const d in SET.keys) if (SET.keys[d] === k) delete SET.keys[d];     // a key does one thing
    if (k === rebinding) delete SET.keys[rebinding]; else SET.keys[rebinding] = k;
    saveSettings();
  }
  rebinding = '';
  return true;
}
