// Exploration: node discovery, the resource scanner, crash sites / power crystals, and hard-drive research.
import { wrand } from './teams';
import { isDepleted } from './deplete';
import { ALT_IDS, BLD, ITEMS, MACHINE_NAMES, RECIPES } from './data';
import { H, HX, HY, W } from './terrain';
import { view } from './view';
import { addInv, canAfford, G, missingText, pay } from './world';
import type { Feat } from './features';

// ---------------------------------------------------------------------------
// Discovery: nodes and features show up on the map once you have seen them (or scanned for them)
export function initDiscovery() {
  const S = G.S;
  G.disc = new Uint8Array(G.nodes.length); G.fdisc = new Uint8Array(G.feats.length);
  if (!S.discN) {
    S.discN = []; S.discF = [];
    G.nodes.forEach((n, i) => { if (Math.hypot(n.x - HX, n.y - HY) < 60 || G.grid[n.y * W + n.x]) S.discN.push(i); });
  }
  for (const i of S.discN) G.disc[i] = 1;
  for (const i of S.discF || []) G.fdisc[i] = 1;
  if (!S.discF) S.discF = [];
}
export function discoverNode(i: number) { if (!G.disc[i]) { G.disc[i] = 1; G.S.discN.push(i); return true; } return false; }
export function discoverFeat(i: number) { if (!G.fdisc[i]) { G.fdisc[i] = 1; G.S.discF.push(i); return true; } return false; }
let discT = 0;
/** reveal everything close to where the camera is looking */
export function tickExplore(dt: number, camDist: number) {
  discT += dt;
  if (discT < 0.5) return;
  discT = 0;
  const R = Math.min(140, camDist * 1.1 + 18), cx = view.cam.x, cy = view.cam.y;
  for (let i = 0; i < G.nodes.length; i++) { const n = G.nodes[i]; if (!G.disc[i] && Math.abs(n.x - cx) < R && Math.abs(n.y - cy) < R) discoverNode(i); }
  for (let i = 0; i < G.feats.length; i++) { const f = G.feats[i]; if (!G.fdisc[i] && Math.abs(f.x - cx) < R && Math.abs(f.y - cy) < R) discoverFeat(i); }
  const now = G.realNow;
  G.pings = G.pings.filter(p => p.t > now);
}
export const discoveredCount = () => G.S.discN ? G.S.discN.length : 0;

// ---------------------------------------------------------------------------
// Scanner
export const scanRange = () => 180 + 70 * G.S.maxTier;
export const SCAN_TARGETS = ['iron_ore', 'copper_ore', 'limestone', 'coal', 'caterium_ore', 'raw_quartz', 'bauxite', 'sulfur', 'uranium', 'crude_oil', 'geyser', 'site', 'crystal'];
export const scanName = (k: string) => k === 'site' ? 'Crash Sites' : k === 'crystal' ? 'Power Crystals' : k === 'geyser' ? 'Geysers' : k === 'crude_oil' ? 'Oil' : ITEMS[k].n;
const SCAN_COL: Record<string, string> = { geyser: '#ff7040', crude_oil: '#b080e0', site: '#ffb347', crystal: '#6ec8ff' };
export const scanCol = (k: string) => SCAN_COL[k] || ITEMS[k].c;
/** ping the closest few targets of a type around the camera; returns a message */
export function scan(kind: string): string {
  const R = scanRange(), cx = view.cam.x, cy = view.cam.y;
  const hits: [number, number, number, number][] = []; // dist, x, y, index
  if (kind === 'site' || kind === 'crystal') {
    G.feats.forEach((f, i) => { if (f.kind === kind && !G.S.looted.includes(f.id)) { const d = Math.hypot(f.x - cx, f.y - cy); if (d < R) hits.push([d, f.x + f.w / 2, f.y + f.w / 2, i]); } });
  } else {
    G.nodes.forEach((n, i) => { if (n.res === kind && !G.grid[n.y * W + n.x] && !isDepleted(n)) { const d = Math.hypot(n.x - cx, n.y - cy); if (d < R) hits.push([d, n.x + 1, n.y + 1, i]); } });
  }
  hits.sort((a, b) => a[0] - b[0]);
  const top = hits.slice(0, kind === 'site' || kind === 'crystal' ? 3 : 5);
  G.S.flags.scans = (G.S.flags.scans || 0) + 1;
  if (!top.length) return `No ${scanName(kind)} within ${R} tiles of here. Try scanning somewhere else (or reach a higher tier for more range).`;
  const until = G.realNow + 45;
  for (const [d, x, y, i] of top) {
    if (kind === 'site' || kind === 'crystal') discoverFeat(i); else discoverNode(i);
    G.pings.push({ x, y, t: until, col: scanCol(kind), label: `${scanName(kind).replace(/s$/, '')} · ${Math.round(d)} m` });
  }
  const [d, x, y] = top[0];
  const dir = compass(x - cx, y - cy);
  return `📡 Found ${top.length} ${scanName(kind)}. Nearest: <b>${Math.round(d)} tiles ${dir}</b>. Look for the light beams (also on the map).`;
}
export function compass(dx: number, dy: number) {
  const a = Math.atan2(dy, dx) * 180 / Math.PI; // 0 = east (+x), 90 = south (+y)
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  return names[((Math.round(a / 45) % 8) + 8) % 8];
}

/** fly back to the HUB and mark it with a beacon (hotkey G) */
export function locateHome(flyTo: (x: number, y: number) => void) {
  const h = G.L && G.L.hub;
  if (!h) return;
  const hx = h.x + 2, hy = h.y + 2, d = Math.round(Math.hypot(hx - view.cam.x, hy - view.cam.y));
  G.pings = G.pings.filter(p => p.label !== '🏠 HUB');
  G.pings.push({ x: hx, y: hy, t: G.realNow + 8, col: '#f5a524', label: '🏠 HUB' });
  G.fx.toast(d > 6 ? `🏠 Your HUB is <b>${d} tiles ${compass(hx - view.cam.x, hy - view.cam.y)}</b> — flying you home` : '🏠 You\'re at your HUB', '');
  G.fx.sfx('click');
  flyTo(hx, hy);
}

// ---------------------------------------------------------------------------
// Crash sites & crystals
export function featNear(wx: number, wy: number): Feat | null {
  let best: Feat | null = null, bd = 1.3;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    const x = Math.floor(wx) + i, y = Math.floor(wy) + j;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const id = G.featGrid[y * W + x];
    if (!id) continue;
    const f = G.feats[id - 1], d = Math.hypot(f.x + f.w / 2 - wx, f.y + f.w / 2 - wy);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}
function clearFeat(f: Feat) {
  G.S.looted.push(f.id);
  for (let j = 0; j < f.w; j++) for (let i = 0; i < f.w; i++) G.featGrid[(f.y + j) * W + f.x + i] = 0;
  G.pings = G.pings.filter(p => Math.hypot(p.x - (f.x + f.w / 2), p.y - (f.y + f.w / 2)) > 1.5);
  G.rev++;
}
export const CRYSTAL_NAMES = ['Blue', 'Yellow', 'Purple'];
export function collectCrystal(f: Feat) {
  addInv('power_shard', f.shards);
  clearFeat(f);
  G.S.flags.crystals = (G.S.flags.crystals || 0) + 1;
  G.fx.toast(`💎 ${CRYSTAL_NAMES[f.tier]} power crystal: <b>+${f.shards} Power Shard${f.shards > 1 ? 's' : ''}</b>. Use them to overclock machines.`, 'good');
  G.fx.sfx('tier');
}
export function lootSite(f: Feat): string | null {
  if (!canAfford(f.cost)) return 'To pry it open you need: ' + missingText(f.cost);
  pay(f.cost);
  addInv('hard_drive', 1);
  if (f.shards) addInv('power_shard', f.shards);
  clearFeat(f);
  G.S.flags.sites = (G.S.flags.sites || 0) + 1;
  G.fx.sfx('tier');
  return null;
}

// ---------------------------------------------------------------------------
// Research: analyse a hard drive, pick one of three alternate recipes
export const altMachineOK = (id: string) => { const m = RECIPES[id].m; for (const k in BLD) if (BLD[k].machine === m && G.S.unlocked.has(k)) return true; return false; };
export function altPool() { return ALT_IDS.filter(id => !G.S.alts.includes(id)); }
export function analyseDrive(): string | null {
  const S = G.S;
  if (S.altOffer && S.altOffer.length) return 'Pick one of the recipes on offer first';
  if ((S.inv.hard_drive || 0) < 1 && S.mode !== 'creative') return 'You need a Hard Drive — find one at a crash site (use the Scanner, N)';
  const pool = altPool();
  if (!pool.length) return 'You have researched every alternate recipe!';
  if (S.mode !== 'creative') S.inv.hard_drive--;
  // prefer recipes you can actually build a machine for
  const usable = pool.filter(altMachineOK), rest = pool.filter(id => !altMachineOK(id));
  const shuffle = (a: string[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(wrand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  S.altOffer = [...shuffle(usable), ...shuffle(rest)].slice(0, 3);
  return null;
}
export function pickAlt(id: string) {
  const S = G.S;
  if (!S.altOffer || !S.altOffer.includes(id)) return;
  S.alts.push(id); S.unlocked.add(id); S.altOffer = null;
  G.fx.toast(`🧪 New alternate recipe: <b>${RECIPES[id].n}</b> (${MACHINE_NAMES[RECIPES[id].m]}). Pick it in the machine's recipe list.`, 'big');
  G.fx.sfx('tier');
}
