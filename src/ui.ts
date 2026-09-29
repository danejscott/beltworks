import { buildingIconURL, itemIconURL } from './atlas';
import { online, run } from './cmd';
import { audio, setVolume, sfx, setSound, vol } from './audio';
import { BLD, CATS, Cost, HANDCRAFT, isFluid, ITEM_KEYS, ITEMS, MACHINE_NAMES, MAX_TIER, MILESTONES, RECIPES, SHOP, TIER_NAMES } from './data';
import { DRONE_LOAD } from './drones';
import { BP, bestOf, bpCost, captureBP, clipboard, curCat, dragInfo, selectSlot, setCat, setLevel, setTool, tool } from './input';
import { buyShop, couponCost, curPhase, loadElevator, milestoneReady, submitMilestone, unlockName } from './progress';
import { exportSave, importSave, loadBlueprints, saveGame, storeBlueprints } from './save';
import { clockPow, myCraft, ensureFresh, flushNet, handTime, hist, inCap, outCap, PURITY, rate, setRecipe, stats } from './sim';
import { BIOME_NAMES, biomeAtTiles, H, HX, HY, isWater, RES_BIOMES, TILE_NAMES, TT, W } from './terrain';
import { addWagon, buildRoute, removeTrain, removeWagon, trainCap, wagonsOf } from './trains';
import { $, clamp, DX, DY, esc, fmt, fmtR } from './util';
import { s2w, view } from './view';
import { pickAt } from './r3/world3d';
import { addInv, canAfford, count, def, Ent, entAt, G, hasFloor, missingText, nodeAt, remove, rotateEnt, Train, Truck } from './world';
import { portDyn, portStatic, shipDyn, shipStatic } from './ui2';
import { fmtTime, recapHTML, showTimer, startTimelapse } from './ui2';
import { EXTRA_MODALS, extraAct, extraInput, LIVE_MODALS, outpostStatic, plannerAllowed, setRerender, stationExtra, travelPoints, truckDyn, truckStatic, tstationDyn, tstationStatic } from './ui2';
import { clockText, cycleOn, solarFactor } from './daynight';
import { locateHome, scanCol } from './explore';

export const ic = (k: string, s = 18) => `<img class="ic" src="${itemIconURL(k)}" width="${s}" height="${s}" alt="">`;
export const costHTML = (c: Cost, mult = 1) => Object.keys(c).map(k => { const have = G.S.inv[k] || 0, need = c[k] * mult; return `<span class="cost ${have >= need ? '' : 'short'}">${ic(k, 16)}${fmt(need)}</span>`; }).join(' ');
const ST_TXT: Record<string, string> = { work: 'Working', starve: 'Waiting for input', block: 'Output backed up', idle: 'Idle', nopower: 'No power — build a Power Pole nearby', lowpower: 'Not enough power (running slow)', noout: 'Connect a pipe!' };
const ST_HEX: Record<string, string> = { work: '#4cc38a', starve: '#f2c94c', block: '#ef5b5b', idle: '#6b7482', nopower: '#9a7aff', lowpower: '#ff9a3a', noout: '#ef5b5b' };
export const status = (st: string, txt?: string) => `<span class="stat"><span class="led" style="background:${ST_HEX[st]};color:${ST_HEX[st]}"></span>${txt || ST_TXT[st] || st}</span>`;

// ---------------------------------------------------------------------------
export function toast(html: string, kind = '') {
  const box = $('#toasts');
  const d = document.createElement('div'); d.className = 'toast ' + kind; d.innerHTML = `<span>${html}</span>`; box.appendChild(d);
  while (box.children.length > 6) box.firstChild!.remove();
  setTimeout(() => { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 400); }, kind === 'big' ? 4500 : 3200);
}

// ---------------------------------------------------------------------------
// Top bar
const chipEls: Record<string, HTMLElement> = {}, chipPrev: Record<string, number> = {};
function renderInv() {
  const box = $('#inv');
  for (const k of ITEM_KEYS) {
    if (isFluid(k)) continue;
    const n = Math.floor(G.S.inv[k] || 0);
    let el = chipEls[k];
    if (n <= 0) { if (el && el.parentNode) el.remove(); chipPrev[k] = 0; continue; }
    if (!el) { el = chipEls[k] = document.createElement('span'); el.className = 'chip'; el.dataset.tip = 'item:' + k; el.innerHTML = ic(k, 18) + '<span></span>'; }
    if (!el.parentNode) {
      let next: HTMLElement | null = null;
      for (const k2 of ITEM_KEYS.slice(ITEM_KEYS.indexOf(k) + 1)) if (chipEls[k2] && chipEls[k2].parentNode) { next = chipEls[k2]; break; }
      box.insertBefore(el, next);
    }
    (el.lastChild as HTMLElement).textContent = fmt(n);
    if (n > (chipPrev[k] || 0)) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    chipPrev[k] = n;
  }
  const S = G.S;
  let cap = 0, dem = 0, short = false;
  for (const n of G.pnets) { cap += n.cap; dem += n.lastDemand; if (n.sat < 0.999 && n.lastDemand > 0) short = true; }
  $('#pwr').innerHTML = `${showTimer() ? `<span class="clock" title="Play time (hide it in the ☰ menu)">⏱ ${fmtTime(S.playT ?? S.time)}</span> ` : ''}${cycleOn() ? `<span class="clock" title="Time of day (toggle in the ☰ menu)">${clockText()}</span> ` : ''}<span class="${short ? 'neg' : ''}">⚡ ${fmtR(dem)} / ${fmtR(cap)} MW</span>`;
  $('#pwr').dataset.tip = 'power';
  // floor switcher
  const fh = `<div class="fl">FLOOR</div>${[0, 1, 2, 3].map(z => `<button class="${view.level === z ? 'sel' : ''}" data-act="floor:${z}" title="${z ? 'Floor ' + z : 'Ground floor'} (PageUp / PageDown)">${z || 'G'}</button>`).join('')}`;
  const fe = $('#floors'); if (fe.dataset.h !== fh) { fe.innerHTML = fh; fe.dataset.h = fh; }
  const pb = document.getElementById('plannerBtn'); if (pb) pb.style.display = plannerAllowed() ? '' : 'none';
  $('#cpn').innerHTML = `🎟 ${S.coupons} <span class="dim">(${Math.floor(S.points / couponCost() * 100)}%)</span>`;
  $('#tierlbl').textContent = `Tier ${S.maxTier} · ${TIER_NAMES[S.maxTier]}`;
}

// ---------------------------------------------------------------------------
// Hotbar
export function renderHotbar() {
  let h = '<div class="tabs">';
  CATS.forEach((c, i) => { h += `<button class="tab ${i === curCat ? 'sel' : ''}" data-act="cat:${i}">${c.n}</button>`; });
  h += '<span class="tabhint"><kbd>Tab</kbd> switch</span></div><div class="slots">';
  CATS[curCat].types.forEach((entry, i) => {
    const type = bestOf(entry), d = BLD[type];
    const locked = !G.S.unlocked.has(type);
    const sel = tool.t && tool.t.k === 'build' && tool.t.type === type;
    const cant = !locked && !canAfford(d.cost);
    h += `<div class="slot ${locked ? 'locked' : ''} ${sel ? 'sel' : ''} ${cant ? 'cant' : ''}" data-act="slot:${i}" data-tip="bld:${type}"><span class="k">${i === 9 ? 0 : i + 1}</span><img src="${buildingIconURL(type)}" width="44" height="44" alt="">${locked ? '<span class="lk">🔒</span>' : ''}</div>`;
  });
  const tk = tool.t && tool.t.k;
  h += `<div class="sep"></div><div class="slot tool ${tk === 'decon' ? 'sel' : ''}" data-act="decon" data-tip="tool:decon"><span class="k">X</span><span class="big" style="color:#ef5b5b">✖</span></div>`;
  h += `<div class="slot tool ${tk === 'bpsel' || tk === 'paste' ? 'sel' : ''}" data-act="copy" data-tip="tool:copy"><span class="k">^C</span><span class="big" style="color:#8ad0ff">⧉</span></div>`;
  h += `<div class="slot tool" data-act="open:bp" data-tip="tool:bp"><span class="k">B</span><span class="big" style="color:#8ad0ff">▦</span></div>`;
  h += '</div>';
  const el = $('#hotbar'); if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; }
}
function bldTip(type: string) {
  const d = BLD[type];
  if (!G.S.unlocked.has(type)) { const m = MILESTONES.find(m => m.un && m.un.includes(type)); return `<b>${d.n}</b> 🔒<div class="sm">Unlocks with "${m ? m.n : 'the Shop'}"${m ? ` (Tier ${m.tier})` : ''}</div>`; }
  let h = `<b>${d.n}</b> <span class="dim">${d.w}×${d.h}${d.power ? ` · ${d.power} MW` : ''}${d.mw && d.kind !== 'battery' ? ` · makes ${d.mw} MW` : ''}</span><div class="sm" style="margin:4px 0">${d.desc}</div>`;
  h += Object.keys(d.cost).map(k => { const have = G.S.inv[k] || 0; return `<div>${ic(k, 16)} <span style="color:${have >= d.cost[k] ? '#cfd5de' : '#ef5b5b'}">${d.cost[k]} ${ITEMS[k].n}</span> <span class="dim">(have ${fmt(have)})</span></div>`; }).join('');
  return h;
}

// ---------------------------------------------------------------------------
export function updateHint() {
  const t = tool.t;
  let h: string;
  if (!t) h = '<b>Drag</b> pan · <b>Wheel</b> zoom · <b>Click</b> ore to mine, trees to chop, buildings to inspect · <b>1–0</b> build · <b>F</b> belt · <b>Q</b> copy building · <b>M</b> map';
  else if (t.k === 'decon') h = '<b>Deconstruct:</b> click one thing, or drag a box (also clears trees). 100% refund · <b>X</b>/<b>Right-click</b> exit';
  else if (t.k === 'bpsel') h = '<b>Blueprint:</b> drag a box around what you want to copy · <b>Esc</b> cancel';
  else if (t.k === 'paste') h = `<b>Pasting ${esc(t.bp.name || 'copy')}</b> (${t.bp.ents.length} pieces) · click to place · <b>R</b> rotate · cost ${costHTML(bpCost(t.bp))} · <b>Right-click</b> done`;
  else {
    const d = BLD[t.type], di = dragInfo();
    if (di) h = `Laying <b>${di.n}</b> × ${d.n} · ${costHTML(di.cost) || 'free'} · <b>R</b> flip corner · release to build`;
    else if (d.kind === 'belt' || d.kind === 'pipe' || d.kind === 'rail') h = `<b>${d.n}</b> · click-drag to lay a line · <b>R</b> rotate · ${d.kind === 'rail' ? 'drag off an existing track to make a junction' : 'drag over old ones to upgrade'} · <b>Right-click</b> cancel`;
    else if (d.kind === 'train') h = '<b>Locomotive</b> · click a railway (needs 4 connected tiles) · <b>R</b> flip direction';
    else {
      const gh = view.ghosts[0];
      h = `<b>${d.n}</b>${t.recipe ? ' (' + RECIPES[t.recipe].n + ')' : ''} · <b>R</b> rotate (orange = output) · drag for a row · <b>Right-click</b> cancel`;
      if (gh && gh.reason && gh.reason !== 'Locked') h += ` · <span class="neg">${esc(gh.reason)}</span>`;
      else if (d.kind === 'pole' && view.powerPreview) {
        const pp: any = view.powerPreview;
        h += pp.ok ? ` · <span class="pos">🔌 Connects to ${pp.links.length} pole${pp.links.length === 1 ? '' : 's'}</span> (wire reach ${Math.round(pp.reach)} tiles)`
          : ` · <span class="neg">⚠ Out of range of your grid — move ${pp.tooFar} tile${pp.tooFar === 1 ? '' : 's'} closer, inside a yellow ring</span>`;
      }
      else if (gh && (d.power || d.kind === 'gen')) { if (!coveredByPower(gh.x, gh.y, d)) h += ' · <span class="warn">⚡ no power here — add a pole</span>'; }
    }
  }
  if (view.level > 0) h = `<b style="color:#f5a524">Floor ${view.level}</b> · ` + h;
  const el = $('#hint'); if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; }
}
function coveredByPower(x: number, y: number, d: any) {
  ensureFresh();
  const cov = G.covGrid; if (!cov) return false;
  for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) { const tx = x + i, ty = y + j; if (tx >= 0 && ty >= 0 && tx < W && ty < H && cov[ty * W + tx]) return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Tracker (left)
function nearestNode(res: string) {
  const h = G.L && G.L.hub; if (!h) return null;
  let best: any = null, bd = 1e9;
  for (const n of G.nodes) { if (n.res !== res) continue; const d = Math.hypot(n.x - h.x, n.y - h.y); if (d < bd) { bd = d; best = n; } }
  return best;
}
const firstOf = (t: string) => { for (const e of G.ents.values()) if (e.type === t) return e; return null; };
const TUT: { t: string; d: string; done: () => boolean; at?: () => number[] | null }[] = [
  { t: 'Look around', d: 'Drag the ground (or use <kbd>WASD</kbd>) to move, scroll to zoom, middle-drag or <kbd>[</kbd> <kbd>]</kbd> to rotate the camera.', done: () => !!G.S.flags.looked },
  { t: 'Hand-mine some Iron Ore', d: 'Click the reddish iron deposit a few times. Every resource comes from nodes like this. Later, machines will do the mining.', done: () => !!G.S.flags.mined, at: () => { const n = nearestNode('iron_ore'); return n ? [n.x + 1, n.y + 1, 1.2] : null; } },
  { t: 'Put a Miner on the iron node', d: 'Press <kbd>1</kbd> (Production, Miner) and click the node. It digs 120 ore per minute, forever. The orange arrows show where its output comes out.', done: () => count('miner1') + count('miner2') > 0, at: () => { const n = nearestNode('iron_ore'); return n ? [n.x + 1, n.y + 1, 1.2] : null; } },
  { t: 'Place a Smelter nearby', d: 'Press <kbd>2</kbd> and place it a few tiles in front of the miner. Machines close to the HUB get free power (the HUB makes 30 MW).', done: () => count('smelter') > 0, at: () => { const m = firstOf('miner1'); return m ? [m.x + 1 + DX[m.rot] * 4, m.y + 1 + DY[m.rot] * 4, 0.5] : null; } },
  { t: 'Connect them with a conveyor belt', d: 'Press <kbd>F</kbd>, then click-drag from the miner&#39;s <b style="color:#ffb347">orange output arrow</b> to the smelter&#39;s <b style="color:#6ec8ff">blue input arrow</b>. Ore rides the belt and gets melted into ingots.', done: () => (stats.P.iron_ingot ? true : false) || !!G.S.flags.smelted, at: () => { const m = firstOf('miner1'); return m ? [m.x + 1 + DX[m.rot] * 1.6, m.y + 1 + DY[m.rot] * 1.6, 0.6] : null; } },
  { t: 'Belt the ingots into the HUB', d: 'Drag a belt from the Smelter&#39;s orange output arrow into any side of the HUB. Whatever reaches the HUB goes into your inventory (top bar).', done: () => (G.S.delivered.iron_ingot || 0) > 0, at: () => { const h = G.L.hub; return h ? [h.x + 2, h.y + 2, 3] : null; } },
  { t: 'Submit your first milestone', d: 'Milestones unlock new machines. When "HUB Online" shows Submit, press it (or open Milestones with <kbd>H</kbd>).', done: () => G.S.done.has('t0a') },
  { t: 'Make Iron Plates', d: 'Place a Constructor (<kbd>3</kbd>) and belt ingots into it. It picks a recipe automatically (click it to change). Deliver plates to the HUB for "Basic Parts".', done: () => (G.S.delivered.iron_plate || 0) > 0 },
  { t: 'Check your production', d: 'Press <kbd>P</kbd> for Stats. Yellow lights mean starved, red means backed up. Balancing machines so nothing is yellow or red is the heart of the game!', done: () => !!G.S.flags.openedStats },
];
let markerFlyTo: ((x: number, y: number) => void) | null = null;
export function setFlyTo(f: (x: number, y: number) => void) { markerFlyTo = f; }
function tutStep() { return G.S.flags.tutDone ? -1 : TUT.findIndex(s => !s.done()); }
/** called every UI tick: puts the 3D marker over the current tutorial target */
function updateMarker() {
  const i = tutStep();
  const at = i >= 0 && TUT[i].at ? TUT[i].at!() : null;
  view.marker = at ? { x: at[0], y: at[1], z: at[2] } : null;
}
export function startOnboarding() {
  if (G.S.mode === 'creative') G.S.flags.tutDone = 1;
  openModal('intro');
}
function reqRows(req: Cost, have: (k: string) => number) {
  let h = '';
  for (const k in req) {
    const hv = Math.min(have(k), req[k]), p = hv / req[k] * 100;
    h += `<div class="req" data-tip="item:${k}">${ic(k, 18)}<div class="bar ${p >= 100 ? 'full' : ''}"><i style="width:${p}%"></i></div><span class="num">${fmt(hv)}/${fmt(req[k])}</span></div>`;
  }
  return h;
}
function renderTracker() {
  const S = G.S;
  let h = '';
  if (!S.flags.tutDone) {
    const first = TUT.findIndex(s => !s.done());
    if (first < 0) { S.flags.tutDone = 1; view.marker = null; toast('🎉 Tutorial complete. The factory must grow!', 'big'); sfx('tier'); }
    else {
      h += `<div class="tbox tut"><div class="th"><span>Getting Started <span class="dim">${first + 1}/${TUT.length}</span></span><button class="mini" data-act="skiptut" title="Skip the tutorial">Skip</button></div>`;
      TUT.forEach((s, i) => {
        const cls = s.done() ? 'done' : i === first ? 'cur' : '';
        h += `<div class="step ${cls}">${s.t}</div>`;
        if (i === first) h += `<div class="stepd">${s.d}${s.at ? ' <button class="mini" data-act="showme">📍 Show me</button>' : ''}</div>`;
      });
      h += '</div>';
    }
  }
  const goals = MILESTONES.filter(m => m.tier <= S.maxTier && !S.done.has(m.id));
  if (goals.length) {
    h += `<div class="tbox"><div class="th"><span>Goals · Tier ${S.maxTier}</span><button class="mini" data-act="open:hub">All <kbd>H</kbd></button></div>`;
    for (const m of goals.slice(0, 4)) {
      const ready = milestoneReady(m);
      h += `<div class="goal"><div class="gname"><span>${m.phase ? '🚀 ' : ''}${m.n} <span class="dim">T${m.tier}</span></span>`;
      h += m.phase ? `<button class="mini" data-act="submit:${m.id}">Load</button>` : `<button class="mini ${ready ? 'go' : ''}" data-act="submit:${m.id}" ${ready ? '' : 'disabled'}>Submit</button>`;
      h += '</div>' + reqRows(m.req, k => m.phase ? (S.elev[k] || 0) : (S.inv[k] || 0));
      if (m.phase) h += `<div class="sm">Belt these into the Space Elevator${count('elevator') ? '' : ' (build it first — Special tab)'}.</div>`;
      else if (m.un) h += `<div class="sm">Unlocks: ${m.un.slice(0, 5).map(unlockName).join(', ')}${m.un.length > 5 ? '…' : ''}</div>`;
      h += '</div>';
    }
    h += '</div>';
  } else if (S.won) h += '<div class="tbox"><div class="th">🏆 Project Assembly launched!</div><div class="sm">Everything is unlocked. Keep building — the factory must grow.</div></div>';
  const craft = myCraft();
  if (craft.q.length) {
    const r = RECIPES[craft.q[0]], p = craft.active ? craft.t / handTime(r) * 100 : 0;
    h += `<div class="tbox"><div class="th"><span>Crafting</span><span class="sm">${craft.q.length} queued</span></div><div class="req">${ic(Object.keys(r.out)[0], 20)}<div class="bar"><i style="width:${p}%;transition:none"></i></div><button class="mini" data-act="clearq">✕</button></div></div>`;
  }
  // power warnings
  const bad = G.pnets.filter(n => n.sat < 0.98 && n.lastDemand > 0);
  if (bad.length) h += `<div class="tbox warnbox">⚡ Power shortage: ${fmtR(bad[0].lastDemand)} MW needed, ${fmtR(bad[0].cap)} MW available. Machines run at ${Math.round(bad[0].sat * 100)}%. Build more generators!</div>`;
  const el = $('#tracker'); if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; }
}

// ---------------------------------------------------------------------------
// Inspector
let inspKey = '';
export function openInspect(e: Ent) { view.inspect = e; view.inspectTrain = null; view.inspectTruck = null; view.inspectShip = null; inspKey = ''; renderInspect(); }
export function openTrain(t: Train) { view.inspectTrain = t; view.inspect = null; view.inspectTruck = null; view.inspectShip = null; inspKey = ''; renderInspect(); }
export function openTruck(t: Truck) { view.inspectTruck = t; view.inspect = null; view.inspectTrain = null; view.inspectShip = null; inspKey = ''; renderInspect(); }
export function openShip(s: any) { view.inspectShip = s; view.inspect = null; view.inspectTrain = null; view.inspectTruck = null; inspKey = ''; renderInspect(); }
export function closeInspect() { view.inspect = null; view.inspectTrain = null; view.inspectTruck = null; view.inspectShip = null; $('#insp').classList.add('hidden'); inspKey = ''; }
export function flyTo(x: number, y: number) { if (markerFlyTo) markerFlyTo(x, y); }
function stationList() { return G.L ? G.L.stations : []; }

function inspStatic(e: Ent): string {
  const d = def(e);
  let h = `<div class="ih"><div class="it">${d.n}</div><button class="x" data-act="closeInsp">✕</button></div><div id="idyn"></div>`;
  const clockable = d.kind === 'machine' || d.kind === 'miner' || d.kind === 'extractor' || (d.kind === 'gen' && e.type !== 'biomass_burner');
  if (d.kind === 'machine') {
    const rs = Object.values(RECIPES).filter(r => r.m === d.machine), un = rs.filter(r => G.S.unlocked.has(r.id));
    h += '<div class="sec">Recipe</div><div class="rlist">';
    for (const r of un) {
      const outs = Object.keys(r.out);
      h += `<div class="rbtn ${e.recipe === r.id ? 'sel' : ''}" data-act="recipe:${r.id}">${ic(outs[0], 28)}<div><b>${r.n}</b>${outs.length > 1 ? ` <span class="dim">+ ${ITEMS[outs[1]].n}</span>` : ''}<div class="sm">${Object.keys(r.in).map(i => `${ic(i, 14)}${fmtR(r.in[i] * 60 / r.t)}`).join(' + ')} → ${outs.map(o => `${ic(o, 14)}${fmtR(r.out[o] * 60 / r.t)}`).join(' + ')} /min</div></div></div>`;
    }
    if (!un.length) h += '<div class="sm">No recipes unlocked yet.</div>';
    if (rs.length > un.length) h += `<div class="sm">🔒 ${rs.length - un.length} more recipe${rs.length - un.length > 1 ? 's' : ''} unlock later</div>`;
    h += '</div>';
  }
  if (clockable) {
    const max = 100 + 50 * (e.shards || 0);
    h += `<div class="sec">Clock speed <span id="clkv" class="dim"></span></div><input type="range" min="1" max="${max}" step="1" value="${Math.round(e.clock * 100)}" data-input="clock" style="width:100%">`;
    h += `<div class="row">${ic('power_shard', 18)} Power Shards: <b>${e.shards || 0}</b>/3 <button class="mini" data-act="shard:1" ${(G.S.inv.power_shard || 0) > 0 && (e.shards || 0) < 3 ? '' : 'disabled'}>+</button><button class="mini" data-act="shard:-1" ${(e.shards || 0) > 0 ? '' : 'disabled'}>−</button> <span class="sm">(have ${fmt(G.S.inv.power_shard || 0)})</span></div>`;
    if (d.kind === 'machine') h += `<div class="row">${ic('amplifier', 18)} Output Amplifier: <b>${e.amp ? 'installed' : 'none'}</b> <button class="mini" data-act="amp" ${e.amp || (G.S.inv.amplifier || 0) > 0 ? '' : 'disabled'}>${e.amp ? 'Remove' : 'Install'}</button></div>`;
  }
  if (d.kind === 'sorter') {
    const opts = (sel: string) => ['any', 'overflow', 'none', ...ITEM_KEYS.filter(k => !isFluid(k))].map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${k === 'any' ? 'Any' : k === 'overflow' ? 'Overflow' : k === 'none' ? 'None' : ITEMS[k].n}</option>`).join('');
    h += '<div class="sec">Output filters</div>';
    ['Front', 'Left', 'Right'].forEach((n, i) => { h += `<div class="row"><span style="width:50px">${n}</span><select data-input="filt:${i}">${opts(e.filt[i])}</select></div>`; });
    h += '<div class="sm">An item goes to outputs set to it; otherwise to "Any"; "Overflow" catches whatever can\'t go elsewhere.</div>';
  }
  if (d.kind === 'station') {
    h += `<div class="sec">Name</div><input type="text" value="${esc(e.name)}" data-input="name" maxlength="24" style="width:100%">`;
    h += `<div class="sec">Mode</div><div class="row"><button class="${e.mode === 'load' ? 'go' : ''}" data-act="mode:load">⬆ Load trains</button><button class="${e.mode === 'unload' ? 'go' : ''}" data-act="mode:unload">⬇ Unload trains</button></div>`;
    h += '<div class="sm">Trains stop on any rail tile touching the station.</div>';
    const others = stationList().filter((o: Ent) => o !== e);
    h += '<div class="sec">🚆 Quick Route</div>';
    if (!others.length) h += '<div class="sm">Place a second Train Station anywhere (even far away), then come back here to connect them automatically.</div>';
    else {
      const sel = e.routeTo && others.some((o: Ent) => o.id === e.routeTo) ? e.routeTo : others[0].id;
      h += `<select data-input="routeTo" style="width:100%">${others.map((o: Ent) => `<option value="${o.id}" ${o.id === sel ? 'selected' : ''}>${esc(o.name)} (${Math.round(Math.hypot(o.x - e.x, o.y - e.y))} tiles away)</option>`).join('')}</select>`;
      h += '<div class="row" style="margin-top:6px"><button class="go" data-act="route:1">Build track + train</button><button data-act="route:0">Track only</button></div>';
      h += '<div class="sm">Lays a one-way <b>loop</b> (out on one track, back on another) around rock and over water, and sets this station to Load and the other to Unload. Add more trains to the loop any time.</div>';
    }
    h += stationExtra(e);
  }
  if (d.kind === 'tstation') h += tstationStatic(e);
  if (d.kind === 'port') h += portStatic(e);
  if (d.kind === 'outpost') h += outpostStatic(e);
  if (d.kind === 'drone') {
    const ports = G.L.drones.filter((p: Ent) => p !== e);
    h += `<div class="sec">Name</div><input type="text" value="${esc(e.name)}" data-input="name" maxlength="24" style="width:100%">`;
    h += `<div class="sec">Send to</div><select data-input="target" style="width:100%"><option value="0">— nowhere —</option>${ports.map((p: Ent) => `<option value="${p.id}" ${p.id === e.target ? 'selected' : ''}>${esc(p.name)} (${Math.round(Math.hypot(p.x - e.x, p.y - e.y))} tiles)</option>`).join('')}</select>`;
    h += `<div class="sm">Items belted in fly to the target (${DRONE_LOAD} per trip) and come out of its front.</div>`;
  }
  if (d.kind === 'storage') h += '<div class="ibtns"><button class="go" data-act="collect">Move all to inventory</button></div>';
  if (d.kind === 'elevator') h += '<div class="ibtns"><button class="go" data-act="loadElev">Load parts from inventory</button></div>';
  if (d.kind === 'gen' && d.fuels && !Object.keys(d.fuels).some(isFluid)) h += `<div class="ibtns"><button class="go" data-act="fuel">Load fuel from inventory</button></div>`;
  if (d.kind === 'pipe' || d.kind === 'tank' || d.kind === 'ptunnel') h += '<div class="ibtns"><button class="danger" data-act="flush">Flush network (empty it)</button></div>';
  h += `<div class="ibtns">${!d.noRotate && d.kind !== 'pipe' && d.kind !== 'ptunnel' && e.w === e.h ? '<button data-act="rot">Rotate <kbd>R</kbd></button>' : ''}${d.kind !== 'hub' ? '<button data-act="copyEnt">Copy <kbd>Q</kbd></button><button class="danger" data-act="del">Deconstruct</button>' : ''}</div>`;
  h += `<div class="sm" style="margin-top:10px">${d.desc}</div>`;
  return h;
}
function netHTML(n: any) {
  if (!n) return `<div>${status('nopower', 'Not connected to power')}</div>`;
  let h = `<div class="sec">Power network</div><div class="row">Production <b>${fmtR(n.cap)} MW</b> · Use <b>${fmtR(n.lastDemand)} MW</b></div>`;
  if (n.bats.length) { let s = 0; for (const b of n.bats) s += b.stored; h += `<div class="row">Batteries: ${Math.round(s / (n.bats.length * BLD.battery.cap) * 100)}% ${n.batFlow > 0 ? '(charging)' : n.batFlow < 0 ? '(draining)' : ''}</div>`; }
  if (n.sat < 0.999 && n.lastDemand > 0) h += `<div class="neg">Overloaded! Machines at ${Math.round(n.sat * 100)}%</div>`;
  h += `<canvas class="graph" id="pgraph" width="290" height="60"></canvas><div class="sm"><span style="color:#f5a524">■</span> capacity <span style="color:#4ea1ff">■</span> usage</div>`;
  return h;
}
function drawGraph(n: any) {
  const c = document.getElementById('pgraph') as HTMLCanvasElement;
  if (!c || !n) return;
  const g = c.getContext('2d')!, hist = n.hist;
  g.clearRect(0, 0, c.width, c.height);
  if (!hist.length) return;
  let mx = 1; for (const [a, b] of hist) mx = Math.max(mx, a, b);
  const line = (idx: number, col: string) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); hist.forEach((v: number[], i: number) => { const x = i / Math.max(1, hist.length - 1) * c.width, y = c.height - 4 - v[idx] / mx * (c.height - 8); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
  line(0, '#f5a524'); line(1, '#4ea1ff');
}
function inspDyn(e: Ent): string {
  const d = def(e);
  let h = '';
  switch (d.kind) {
    case 'machine': {
      h += `<div class="row between">${status(e.st)}<span class="dim">Productivity ${Math.round(e.eff * 100)}%</span></div>`;
      if (e.wrongFeed) h += `<div class="sm neg">⚠ A belt is pointing at the wrong part of this machine (red arrow). Items only go in at the <b style="color:#6ec8ff">blue input arrow</b> — move that belt's end there, or rotate the machine (R).</div>`;
      if (e.recipe) {
        const r = RECIPES[e.recipe], sp = e.clock * (e.amp ? 2 : 1);
        h += '<div class="sec">Inputs</div>';
        for (const k in r.in) { const have = e.ib[k] || 0, cap = inCap(r, k); h += `<div class="bufrow" data-tip="item:${k}">${ic(k, 20)}<span class="bn">${ITEMS[k].n}</span><div class="bar"><i style="width:${Math.min(100, have / cap * 100)}%"></i></div><span class="num">${fmtR(have)}/${cap}</span></div><div class="sm ind">needs ${fmtR(r.in[k] * 60 / r.t * e.clock)}/min</div>`; }
        h += '<div class="sec">Output</div>';
        for (const k in r.out) { const have = e.ob[k] || 0, cap = outCap(r, k) * (e.amp ? 2 : 1); h += `<div class="bufrow" data-tip="item:${k}">${ic(k, 20)}<span class="bn">${ITEMS[k].n}</span><div class="bar"><i style="width:${Math.min(100, have / cap * 100)}%"></i></div><span class="num">${fmtR(have)}/${cap}</span></div><div class="sm ind">makes ${fmtR(r.out[k] * 60 / r.t * sp)}/min${isFluid(k) ? ' (via pipe)' : ''}</div>`; }
        h += `<div class="bar thick"><i style="width:${e.prog * 100}%;transition:none"></i></div>`;
        if (e.st === 'starve' && e.wrongItem && !r.in[e.wrongItem]) h += `<div class="sm neg">⚠ ${ITEMS[e.wrongItem].n} is arriving, but this machine is set to <b>${r.n}</b>. Pick a matching recipe below.</div>`;
        if (e.st === 'starve') h += `<div class="sm warn">Tip: feed ${Object.keys(r.in).filter(k => !isFluid(k)).length ? 'items by belt into the blue input arrow' + (Object.keys(r.in).filter(k => !isFluid(k)).length > 1 ? ' (merge the ingredient belts with a Merger)' : '') : ''}${Object.keys(r.in).some(isFluid) ? ' and fluids by pipe' : ''}.</div>`;
        if (e.st === 'block') h += `<div class="sm neg">Tip: the output${Object.keys(r.out).length > 1 ? 's (including the byproduct!)' : ''} need somewhere to go.</div>`;
      } else h += '<div class="sm">Pick a recipe below — or belt an ingredient in and it chooses automatically.</div>';
      h += `<div class="sm">Power: ${fmtR(d.power * clockPow(e.clock) * (e.amp ? 4 : 1))} MW when running</div>`;
      break;
    }
    case 'miner': case 'extractor': {
      const res = d.on === 'water' ? 'water' : d.on === 'oil' ? 'crude_oil' : e.node.res;
      const pm = d.on === 'water' ? 1 : PURITY[e.node.p].m;
      h += `${status(e.st)}<div class="bufrow" style="margin-top:8px">${ic(res, 22)}<b>${ITEMS[res].n}</b>${d.on !== 'water' ? `<span class="dim">· ${PURITY[e.node.p].n} node</span>` : ''}</div>`;
      h += `<div>Output: <b>${fmtR(d.rate * pm * e.clock)}/min</b> · Power ${fmtR(d.power * clockPow(e.clock))} MW</div>`;
      if (d.kind === 'miner') h += `<div class="sm">That feeds ≈ ${fmtR(d.rate * pm * e.clock / 60)} smelter(s).</div>`;
      break;
    }
    case 'harvester': h += `${status(e.st, e.st === 'idle' ? 'No trees in range — move me!' : undefined)}<div>Trees left in range: ${e.targets ? e.targets.filter((i: number) => G.trees[i]).length : '?'}</div><div class="sm">~120 Wood/min</div>`; break;
    case 'gen': {
      const n = e.pnet;
      h += `${status(e.st, e.st === 'starve' ? 'Out of fuel' : d.solar && e.st === 'idle' ? 'Waiting for the sun' : undefined)}<div>Output <b>${fmtR(e.out || 0)}</b> / ${fmtR(e.avail || 0)} MW</div>`;
      if (d.solar) h += `<div class="sm">Sunlight: ${Math.round(solarFactor() * 100)}%${cycleOn() ? '' : ' (day/night cycle is off)'}</div>`;
      if (d.fuels) {
        h += '<div class="sec">Fuel</div>';
        for (const k in d.fuels) h += `<div class="bufrow">${ic(k, 20)}<span class="bn">${ITEMS[k].n}</span><span class="num">${fmtR(e.fbuf[k] || 0)}</span><span class="sm">(${fmtR(60 / d.fuels[k])}/min at full load)</span></div>`;
      }
      if (d.waste && e.ob) for (const wk in e.ob) h += `<div class="bufrow">${ic(wk, 20)}<span class="bn">${ITEMS[wk].n}</span><div class="bar ${e.ob[wk] >= 70 ? 'full' : ''}"><i style="width:${Math.min(100, e.ob[wk])}%"></i></div><span class="num">${fmtR(e.ob[wk])}/100</span></div><div class="sm ind ${e.ob[wk] >= 70 ? 'neg' : ''}">Belt the waste out of the orange arrow into storage, or the plant shuts down at 100.</div>`;
      if (d.water) h += `<div class="bufrow">${ic('water', 20)}<span class="bn">Water</span><div class="bar"><i style="width:${e.water / 60 * 100}%"></i></div><span class="num">${fmtR(e.water)}</span></div><div class="sm ind">${d.water}/min at full load via pipe</div>`;
      h += netHTML(n);
      break;
    }
    case 'battery': h += `<div>Stored: <b>${fmtR(e.stored)}</b> / ${d.cap} MJ (${Math.round(e.stored / d.cap * 100)}%)</div>` + netHTML(e.pnet); break;
    case 'pole': case 'hub': case 'outpost':
      if (d.kind === 'hub') {
        h += '<div class="sm">Delivered per minute:</div>';
        const ks = ITEM_KEYS.filter(k => rate(stats.D, k) > 0);
        h += ks.length ? ks.slice(0, 12).map(k => `<div class="bufrow">${ic(k, 18)}${ITEMS[k].n}<span class="num" style="margin-left:auto">${fmtR(rate(stats.D, k))}/min</span></div>`).join('') : '<div class="dim">Nothing yet — belt something in!</div>';
      }
      h += netHTML(e.pnet);
      break;
    case 'pipe': case 'tank': case 'ptunnel': {
      const n = e.fnet;
      if (n) h += `<div class="bufrow">${n.fluid ? ic(n.fluid, 22) + `<b>${ITEMS[n.fluid].n}</b>` : '<span class="dim">Empty network</span>'}</div><div class="bar"><i style="width:${n.amount / n.cap * 100}%"></i></div><div class="row">${fmtR(n.amount)} / ${fmtR(n.cap)} · flow ${fmtR(n.flowEMA * 60)}/min · max ${fmtR(n.rate * 60)}/min</div><div class="sm">${n.members.length} pipe pieces</div>`;
      break;
    }
    case 'storage': case 'station': case 'tstation': case 'port': {
      if (e.wrongFeed) h += `<div class="sm neg">⚠ A belt is pointing at the wrong side (red arrow). Items only go in at the <b style="color:#6ec8ff">blue input arrow</b>.</div>`;
      h += `<div>${fmt(e.tot)} / ${fmt(d.cap)} items</div><div class="chips">`;
      for (const k in e.store) if (e.store[k]) h += `<span class="chip" data-tip="item:${k}">${ic(k, 18)}${fmt(e.store[k])}</span>`;
      h += '</div>';
      if (d.kind === 'station') {
        const tr = G.trains.filter(t => t.sched.includes(e.id));
        h += `<div class="sm">${tr.length ? 'Served by ' + tr.map(t => esc(t.name)).join(', ') : 'No trains visit this station yet. Click a train to add it to its schedule.'}</div>`;
        if (!e.pnet) h += `<div class="neg sm">Needs power to load/unload.</div>`;
      }
      if (d.kind === 'tstation') h += tstationDyn(e);
      if (d.kind === 'port') h += portDyn(e);
      break;
    }
    case 'drone': {
      const dr = e.dr;
      h += `${status(e.pnet ? (e.target ? 'work' : 'idle') : 'nopower', e.pnet ? (e.target ? (dr.s === 'home' ? 'Waiting for cargo' : dr.s === 'out' ? `Delivering ${dr.n} items` : 'Returning') : 'No destination') : undefined)}`;
      h += `<div class="row">Outgoing: <b>${fmt(e.obTot)}</b> · Incoming: <b>${fmt(e.ibTot)}</b></div>`;
      break;
    }
    case 'sink': h += `<div>Items sunk: <b>${fmt(e.sunk)}</b></div><div>Points: <b>${fmt(G.S.points)}</b> / ${fmt(couponCost())} for the next coupon</div><div class="bar"><i style="width:${G.S.points / couponCost() * 100}%"></i></div><div class="sm">Coupons: ${G.S.coupons} — spend them in the Shop (<kbd>K</kbd>).</div>`; break;
    case 'elevator': {
      const ph = curPhase();
      h += ph ? `<div class="sec">${ph.n}</div>` + reqRows(ph.req, k => G.S.elev[k] || 0) : (G.S.won ? '<div>🏆 Project Assembly launched!</div>' : '<div class="dim">No phase available yet — finish this tier\'s milestones.</div>');
      break;
    }
    case 'splitter': h += '<div class="sm">Items in from the back → split evenly out front / left / right (only to sides that can take them).</div>'; break;
    case 'merger': h += '<div class="sm">Belts in from back / left / right → one belt out the front, taking turns fairly.</div>'; break;
  }
  return h;
}
function trainStatic(t: Train) {
  const sts = stationList();
  let h = `<div class="ih"><div class="it">🚂 Train</div><button class="x" data-act="closeInsp">✕</button></div>`;
  h += `<input type="text" value="${esc(t.name)}" data-input="tname" maxlength="24" style="width:100%"><div id="idyn"></div>`;
  h += `<div class="sec">Schedule</div>`;
  if (!t.sched.length) h += '<div class="sm">Add at least two stations. The train loops through them in order.</div>';
  t.sched.forEach((sid, i) => { const s = G.ents.get(sid); h += `<div class="stop"><span class="sn">${i + 1}. ${s ? esc(s.name) + (s.mode === 'load' ? ' ⬆' : ' ⬇') : '?'}</span><button class="mini" data-act="tup:${i}">▲</button><button class="mini" data-act="tdel:${i}">✕</button></div>`; });
  h += `<select data-input="addstop" style="width:100%;margin-top:4px"><option value="">+ Add a station…</option>${sts.map((s: Ent) => `<option value="${s.id}">${esc(s.name)} (${s.mode})</option>`).join('')}</select>`;
  if (t.oneWay) h += `<div class="sm">🛤 Runs one way around a Quick Route loop. <button class="mini go" data-act="lineadd:${t.line}">+ Another train on this line</button></div>`;
  h += `<div class="sec">Wagons: ${wagonsOf(t)}</div><div class="row"><button data-act="wagon:1">+ Wagon</button><button data-act="wagon:-1" ${wagonsOf(t) ? '' : 'disabled'}>− Wagon</button><span class="sm">${costHTML(BLD.wagon.cost)}</span></div>`;
  h += `<div class="ibtns"><button class="${t.running ? '' : 'go'}" data-act="trun">${t.running ? '⏸ Stop' : '▶ Run'}</button><button class="danger" data-act="tremove">Remove train</button></div>`;
  return h;
}
function trainDyn(t: Train) {
  const stTxt: Record<string, string> = { moving: 'Driving', loading: 'At station', nopath: 'No route! Check the track connects', noschedule: 'No schedule', stopped: 'Stopped', idle: 'Planning route' };
  const st = G.ents.get(t.sched[t.si]);
  let h = `<div class="row">${status(t.state === 'nopath' ? 'block' : (t as any).sigWait ? 'starve' : t.state === 'moving' || t.state === 'loading' ? 'work' : 'idle', (t as any).sigWait ? 'Waiting at a red signal' : stTxt[t.state] || t.state)}</div>`;
  if (st) h += `<div class="sm">Next: ${esc(st.name)} · ${fmtR(t.v)} tiles/s</div>`;
  h += `<div class="row">Cargo ${fmt(t.tot)} / ${fmt(trainCap(t))}</div><div class="bar"><i style="width:${trainCap(t) ? t.tot / trainCap(t) * 100 : 0}%"></i></div><div class="chips">`;
  for (const k in t.cargo) h += `<span class="chip">${ic(k, 18)}${fmt(t.cargo[k])}</span>`;
  return h + '</div>';
}
function renderInspect() {
  const e = view.inspect, t = view.inspectTrain, k = view.inspectTruck as Truck | null, sh = view.inspectShip, box = $('#insp');
  if (sh) { if (!G.ships.includes(sh)) { closeInspect(); return; } box.classList.remove('hidden'); const sk = ['S', sh.id, sh.sched.join(','), G.L.ports.length].join('|'); if (sk !== inspKey) { box.innerHTML = shipStatic(sh); inspKey = sk; } const dyn = document.getElementById('idyn'); if (dyn) { const hh = shipDyn(sh); if (dyn.dataset.h !== hh) { dyn.innerHTML = hh; dyn.dataset.h = hh; } } return; }
  if (e && !G.ents.has(e.id)) { closeInspect(); return; }
  if (t && !G.trains.includes(t)) { closeInspect(); return; }
  if (k && !G.trucks.includes(k)) { closeInspect(); return; }
  if (!e && !t && !k) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const key = e ? [e.id, e.type, e.recipe, G.S.unlocked.size, e.shards, e.amp, e.mode, e.target, e.rot, G.L.drones.length, G.S.inv.power_shard > 0, G.S.inv.amplifier > 0, G.L.tstations.length, G.S.lines.length, G.trains.length].join('|')
    : t ? ['T', t.id, t.sched.join(','), t.cars.length, t.running, stationList().length].join('|')
    : ['K', k!.id, k!.sched.join(','), G.L.tstations.length].join('|');
  if (key !== inspKey) { box.innerHTML = e ? inspStatic(e) : t ? trainStatic(t) : truckStatic(k!); inspKey = key; }
  const dyn = document.getElementById('idyn');
  if (dyn) { const h = e ? inspDyn(e) : t ? trainDyn(t) : truckDyn(k!); if (dyn.dataset.h !== h) { dyn.innerHTML = h; dyn.dataset.h = h; } }
  if (e) { const cv = document.getElementById('clkv'); if (cv) cv.textContent = `${Math.round(e.clock * 100)}%`; }
  const n = e && (e.pnet || (def(e).kind === 'pole' ? e.pnet : null));
  if (n) drawGraph(n);
}

// ---------------------------------------------------------------------------
// Modals
let modalKind: string | null = null;
const unlockQueue: any[] = [];
/** queue a "you unlocked..." popup for a completed milestone */
export function showUnlocks(m: any, tierUp: boolean) {
  if (G.S.mode === 'creative') return;
  unlockQueue.push({ ...m, tierUp });
  if (modalKind !== 'unlock') openModal('unlock');
  else { ($('#mbody') as any).dataset.h = ''; renderModal(); }
}
let bpPending: BP | null = null;
export const modalOpen = () => !!modalKind;
export const currentModal = () => modalKind;
export function travelTo(i: number) { act('travel', String(i), ''); }
export function openModal(k: string) { if (k === 'stats' && G.S) G.S.flags.openedStats = 1; modalKind = k; $('#modal').classList.remove('hidden'); ($('#mbody') as any).dataset.h = ''; renderModal(); }
export function closeModal() { modalKind = null; $('#modal').classList.add('hidden'); }
export function toggleModal(k: string) { if (modalKind === k) closeModal(); else openModal(k); }
export function nameBlueprint(bp: BP) { bpPending = bp; openModal('bpname'); setTimeout(() => (document.getElementById('bpn') as HTMLInputElement)?.focus(), 50); }

function renderModal() {
  const k = modalKind, S = G.S;
  let t = '', h = '';
  if (k === 'hub') {
    t = 'Milestones & Space Elevator';
    for (let tier = 0; tier <= MAX_TIER; tier++) {
      const locked = tier > S.maxTier;
      h += `<div class="tier ${locked ? 'locked' : ''}"><h3>Tier ${tier} · ${TIER_NAMES[tier]} ${locked ? '🔒' : ''}</h3><div class="cards">`;
      for (const m of MILESTONES.filter(m => m.tier === tier)) {
        const done = S.done.has(m.id), ready = milestoneReady(m);
        h += `<div class="card ${done ? 'done' : ''} ${m.phase ? 'phase' : ''} ${locked ? 'locked' : ''}"><div class="cn">${m.phase ? '🚀 ' : ''}${m.n} ${done ? '✔' : ''}</div>`;
        h += done ? `<div class="sm">${Object.keys(m.req).map(k => `${ic(k, 14)}${fmt(m.req[k])}`).join(' ')}</div>` : reqRows(m.req, k => m.phase ? (S.elev[k] || 0) : (S.inv[k] || 0));
        if (m.un) h += `<div class="unl">${m.un.map(u => `<span class="tag">${BLD[u] ? `<img class="ic" src="${buildingIconURL(u)}" width="16" height="16">` : ic(Object.keys(RECIPES[u].out)[0], 14)} ${unlockName(u)}</span>`).join('')}</div>`;
        if (m.unlockTiers) h += `<div class="unl"><span class="tag">⬆ Unlocks Tier ${m.unlockTiers.join(' & ')}</span></div>`;
        if (m.win) h += '<div class="unl"><span class="tag">🏆 Win the game</span></div>';
        if (!done && !locked) h += m.phase ? `<div class="sm">Belt parts into the Space Elevator, or</div><button data-act="submit:${m.id}">Load from inventory</button>` : `<button class="${ready ? 'go' : ''}" data-act="submit:${m.id}" ${ready ? '' : 'disabled'}>Submit</button>`;
        h += '</div>';
      }
      h += '</div></div>';
    }
  } else if (k === 'craft') {
    t = 'Craft Bench';
    h = `<p class="sm" style="margin-top:0">Hand crafting is slow — automate anything you need lots of. Foundry, Refinery and Manufacturer recipes can't be hand-crafted.${S.shop.hands ? ' (Nimble Hands: 3× speed)' : ''}</p>`;
    for (const m of ['smelter', 'constructor', 'assembler']) {
      const rs = Object.values(RECIPES).filter(r => r.m === m && S.unlocked.has(r.id) && HANDCRAFT.has(r.m));
      if (!rs.length) continue;
      h += `<h3 class="ch">${MACHINE_NAMES[m]} recipes</h3><div class="cgrid">`;
      for (const r of rs) {
        const ok = canAfford(r.in), o = Object.keys(r.out)[0];
        h += `<div class="ccard">${ic(o, 34)}<div><b>${r.n}</b> ×${r.out[o]}<div class="sm">${Object.keys(r.in).map(i => `${ic(i, 14)}${r.in[i]}`).join(' ')} · ${fmtR(handTime(r))}s</div></div><div class="cb"><button data-act="craft:${r.id}:1" ${ok ? '' : 'disabled'}>1</button><button data-act="craft:${r.id}:5" ${ok ? '' : 'disabled'}>5</button><button data-act="craft:${r.id}:25" ${ok ? '' : 'disabled'}>25</button></div></div>`;
      }
      h += '</div>';
    }
  } else if (k === 'stats') {
    t = 'Production Stats (per minute, last 60s)';
    const cnt: Record<string, number> = {};
    for (const e of [...G.L.machines, ...G.L.miners, ...G.L.extractors]) cnt[e.st] = (cnt[e.st] || 0) + 1;
    h = `<div class="row wrap" style="gap:16px;margin-bottom:8px">${['work', 'starve', 'block', 'lowpower', 'nopower', 'idle'].map(s => `${status(s, ST_TXT[s].split(' —')[0])} <b>${cnt[s] || 0}</b>`).join(' ')}</div>`;
    h += '<p class="sm">Yellow = starved (upstream too slow). Red = backed up (downstream too slow or nothing takes the output). Balancing these is the whole game.</p>';
    let cap = 0, dem = 0; for (const n of G.pnets) { cap += n.cap; dem += n.lastDemand; }
    h += `<p>⚡ Power: <b>${fmtR(dem)}</b> MW used of <b>${fmtR(cap)}</b> MW across ${G.pnets.length} grid${G.pnets.length === 1 ? '' : 's'}. 🎟 Sink points: ${fmt(S.points)}.</p>`;
    h += `<h3 class="ch">📈 Last hour <span class="sm dim">(click items in the table below to add or remove them)</span></h3><canvas class="histg" id="gItems" width="900" height="190"></canvas><div class="glegend" id="gLegend"></div><canvas class="histg" id="gPower" width="900" height="110"></canvas><div class="sm"><span style="color:#f5a524">■</span> power capacity <span style="color:#4ea1ff">■</span> power used · <span class="pos">solid</span> = produced, <span class="neg">dashed</span> = used, per minute</div>`;
    h += '<table class="st"><tr><th>Item</th><th>Produced</th><th>Consumed</th><th>Net</th><th>Delivered</th><th>Inventory</th></tr>';
    for (const k of ITEM_KEYS) {
      const p = rate(stats.P, k), c = rate(stats.C, k), dl = rate(stats.D, k), inv = S.inv[k] || 0;
      if (!p && !c && !dl && !inv) continue;
      const net = p - c;
      h += `<tr class="grow ${graphSel().has(k) ? 'gsel' : ''}" data-act="gsel:${k}"><td>${ic(k, 18)} ${ITEMS[k].n}</td><td class="${p ? 'pos' : ''}">${fmtR(p)}</td><td class="${c ? 'neg' : ''}">${fmtR(c)}</td><td class="${net > 0.05 ? 'pos' : net < -0.05 ? 'neg' : ''}">${net > 0 ? '+' : ''}${fmtR(net)}</td><td>${fmtR(dl)}</td><td>${fmt(inv)}</td></tr>`;
    }
    h += '</table>';
  } else if (k === 'shop') {
    t = '🎟 Coupon Shop';
    h = `<p>You have <b>${S.coupons}</b> coupon${S.coupons === 1 ? '' : 's'}. Next coupon: ${fmt(S.points)} / ${fmt(couponCost())} points.</p><div class="bar" style="max-width:400px"><i style="width:${S.points / couponCost() * 100}%"></i></div><p class="sm">Earn points by feeding items into a Resource Sink (Logistics tab). Fancier items are worth far more.</p><div class="cgrid">`;
    for (const it of SHOP) {
      const owned = !it.repeat && S.shop[it.id];
      h += `<div class="ccard ${owned ? 'owned' : ''}"><div><b>${it.n}</b>${it.repeat && S.shop[it.id] ? ` <span class="dim">(bought ${S.shop[it.id]})</span>` : ''}<div class="sm">${it.desc}</div></div><div class="cb">${owned ? '<span class="pos">Owned ✔</span>' : `<button class="${S.coupons >= it.cost ? 'go' : ''}" data-act="buy:${it.id}" ${S.coupons >= it.cost ? '' : 'disabled'}>🎟 ${it.cost}</button>`}</div></div>`;
    }
    h += '</div>';
  } else if (k === 'bp') {
    t = 'Blueprints';
    const list = loadBlueprints();
    h = `<p class="sm" style="margin-top:0">Copy any part of your factory and paste it again anywhere. Recipes, directions and filters come along. <b>Ctrl+C</b> = quick copy, <b>Ctrl+V</b> = paste again.</p><div class="row"><button class="go" data-act="bpnew">⧉ New blueprint (drag a box)</button>${clipboard ? `<button data-act="bpclip">Paste clipboard (${clipboard.ents.length})</button><button data-act="bpsaveclip">Save clipboard…</button>` : ''}</div><div class="cgrid" style="margin-top:10px">`;
    if (!list.length) h += '<div class="dim">No saved blueprints yet.</div>';
    list.forEach((bp, i) => { h += `<div class="ccard"><div><b>${esc(bp.name)}</b><div class="sm">${bp.w}×${bp.h} · ${bp.ents.length} pieces</div><div class="sm">${costHTML(bpCost(bp))}</div></div><div class="cb" style="flex-direction:column"><button class="go" data-act="bpuse:${i}">Place</button><button class="danger" data-act="bpdel:${i}">Delete</button></div></div>`; });
    h += '</div>';
  } else if (k === 'bpname') {
    t = 'Save blueprint';
    const bp = bpPending;
    h = bp ? `<p>${bp.w}×${bp.h} area · ${bp.ents.length} pieces · costs ${costHTML(bpCost(bp))}</p><input id="bpn" type="text" maxlength="30" placeholder="Name (e.g. Iron Plate Line)" style="width:100%;font-size:15px"><div class="row" style="margin-top:10px"><button class="go" data-act="bpsave">Save & place</button><button data-act="bpjust">Just place it</button></div>` : '';
  } else if (k === 'inv') {
    t = '🎒 Inventory';
    h = inventoryHTML();
  } else if (k === 'map') {
    t = 'World Map';
    h = `<div class="maprow"><canvas id="bigmap" width="760" height="760"></canvas><div class="legend">${['iron_ore', 'copper_ore', 'limestone', 'coal', 'caterium_ore', 'raw_quartz', 'bauxite', 'sulfur', 'uranium', 'crude_oil', 'geyser'].map(r => `<label><input type="checkbox" data-input="mapf:${r}" ${mapFilter[r] !== false ? 'checked' : ''}> ${r === 'geyser' ? '<span class="dot" style="background:#ff7040"></span>Geyser' : ic(r, 16) + ITEMS[r].n}</label>`).join('')}<button class="go" data-act="home" style="width:100%;margin-bottom:8px">🏠 Locate my HUB <kbd>G</kbd></button>${travelPoints().length > 1 ? '<button data-act="open:travel" style="width:100%;margin-bottom:8px">🧭 Fast travel to an Outpost <kbd>O</kbd></button>' : ''}<p class="sm">Click the map to fly there. Better (gold ring = pure) nodes are further from the HUB. Only nodes you have <b>discovered</b> are shown — explore, or use the Scanner (<kbd>N</kbd>). 🛸 crash site · 💎 power crystal.</p></div></div>`;
  } else if (k === 'help') {
    t = 'How to play Beltworks';
    h = HELP;
  } else if (k === 'menu') {
    t = 'Menu';
    h = `<div class="menu"><button data-act="save">💾 Save now <span class="dim">(auto-saves every 30s)</span></button><button data-act="export">⬇ Export save file</button><button data-act="import">⬆ Import save file</button><button data-act="sound">${audio.on ? '🔊 Sound: on' : '🔇 Sound: off'}</button><div class="vols">${([['music', '🎵 Music'], ['amb', '🌲 Ambience'], ['sfx', '🔨 Effects']] as [string, string][]).map(([k, l]) => `<label>${l}<input type="range" min="0" max="100" value="${Math.round((vol as any)[k] * 100)}" data-input="vol:${k}"></label>`).join('')}</div><button data-act="speed">⏩ Game speed: ${S.speed}×</button><button data-act="dn">${S.dayNight !== false ? '🌙 Day/night cycle: on' : '☀️ Day/night cycle: off'}</button><button data-act="open:recap">📊 Run recap & timelapse</button><button data-act="timer">⏱ Run timer: ${showTimer() ? 'shown' : 'hidden'}</button><button class="go" data-act="newgame">🏠 Save & return to title screen</button><p class="sm"><b>${esc(S.name || '')}</b> · ${S.mode || 'easy'} · ${S.size || 1024}² · played ${Math.floor(S.time / 60)} min · seed ${S.seed}</p></div>`;
  } else if (k === 'intro') {
    t = `Welcome to ${esc(S.name || 'your world')}`;
    const mode = S.mode || 'easy';
    h = `<div class="intro"><div class="ibig">🏭</div>
      <p class="lead">You have landed on an uncharted planet with a <b>HUB</b>, a few starter materials and one job: <b>build an automated factory</b> big enough to launch <b>Project Assembly</b> from the Space Elevator.</p>
      <div class="icards">
        <div class="icard"><b>1 · Extract</b><span>Miners on ore nodes, pumps on lakes and oil, harvesters in forests.</span></div>
        <div class="icard"><b>2 · Process</b><span>Smelters, constructors and assemblers turn raw resources into parts.</span></div>
        <div class="icard"><b>3 · Connect</b><span>Conveyor belts, pipes, power lines, and trains for long distances.</span></div>
        <div class="icard"><b>4 · Unlock</b><span>Deliver parts to the HUB and submit Milestones to unlock new tech.</span></div>
      </div>
      <p class="sm">Your HUB sits on quiet <b>plains</b> with iron, copper and limestone. Further out, three big regions lie in different directions: a <b>forest</b> (coal, lots of trees), a <b>desert</b> (oil, quartz, caterium, sulfur) and rocky <b>highlands</b> (caterium, sulfur, geysers). The rarest resources, like <b>bauxite</b>, sit near the edges of the map, and the best (pure) nodes are further out too. Growing your factory means reaching across the whole map. The Scanner (<kbd>N</kbd>) helps you find things. Chopped trees grow back ${mode === 'hard' ? 'slowly' : 'over time'}.</p>
      <p class="sm">Difficulty: <b>${mode}</b>${mode === 'creative' ? '. Everything is unlocked and free, so the tutorial is skipped. Have fun!' : '. A short guided tutorial will walk you through your first production line.'}</p>
      <button class="go big" data-act="closeModal">Start building 🚀</button></div>`;
  } else if (k === 'unlock') {
    const m = unlockQueue[0];
    if (!m) { closeModal(); return; }
    t = '✔ Milestone complete!';
    h = `<div class="unlock"><div class="ubig">${esc(m.n)}</div>`;
    if (m.tierUp) h += `<div class="ubanner">🚀 Tier ${S.maxTier} unlocked: ${TIER_NAMES[S.maxTier]}!</div>`;
    if (m.un && m.un.length) {
      h += '<h3>You can now build and make:</h3><div class="ugrid">';
      for (const u of m.un) {
        if (BLD[u]) {
          const cat = CATS.findIndex(c => c.types.some(ty => ty === u || (Array.isArray(ty) && ty.includes(u))));
          const slotI = cat >= 0 ? CATS[cat].types.findIndex(ty => ty === u || (Array.isArray(ty) && ty.includes(u))) : -1;
          h += `<div class="ucard"><img src="${buildingIconURL(u)}" width="64" height="64"><div><b>${BLD[u].n}</b><div class="sm">${BLD[u].desc}</div>${cat >= 0 ? `<div class="sm">Build menu: <b>${CATS[cat].n}</b>, key <kbd>${slotI === 9 ? 0 : slotI + 1}</kbd></div>` : ''}</div></div>`;
        } else if (RECIPES[u]) {
          const r = RECIPES[u], o = Object.keys(r.out);
          h += `<div class="ucard">${ic(o[0], 48)}<div><b>${r.n}</b> <span class="dim">recipe</span><div class="sm">${Object.keys(r.in).map(i => `${ic(i, 14)}${r.in[i]}`).join(' + ')} → ${o.map(i => `${ic(i, 14)}${r.out[i]}`).join(' + ')}</div><div class="sm">Made in a <b>${MACHINE_NAMES[r.m]}</b>${HANDCRAFT.has(r.m) ? ' (or hand-craft with C)' : ''}</div></div></div>`;
        }
      }
      h += '</div>';
    }
    if (m.tip) h += `<p class="utip">💡 ${m.tip}</p>`;
    const next = MILESTONES.filter(x => x.tier <= S.maxTier && !S.done.has(x.id)).slice(0, 3);
    if (next.length) h += `<h3>Next goals</h3><div class="unext">${next.map(x => `<div class="tag">${x.phase ? '🚀 ' : ''}${x.n}: ${Object.keys(x.req).map(k2 => `${ic(k2, 14)}${fmt(x.req[k2])}`).join(' ')}</div>`).join('')}</div>`;
    h += `<button class="go big" data-act="unlockok">${unlockQueue.length > 1 ? 'Next ▶' : 'Awesome, let&#39;s build!'}</button></div>`;
  } else if (k && EXTRA_MODALS[k]) {
    [t, h] = EXTRA_MODALS[k]();
  } else if (k === 'win' || k === 'recap') {
    [t, h] = recapHTML(k === 'win');
  } else if (k === 'winOld') {
    t = '🏆 Project Assembly launched!';
    let tot = 0; for (const kk in S.delivered) tot += S.delivered[kk];
    h = `<div style="text-align:center;padding:20px"><div style="font-size:54px">🚀</div><h2>You did it.</h2><p>Your factory built and launched Project Assembly in <b>${Math.floor(S.time / 60)} minutes</b>, delivering <b>${fmt(tot)}</b> items along the way.</p><p class="dim">Everything is unlocked. Keep building — optimize, go bigger, make it beautiful.</p><button class="go" data-act="closeModal">Keep building</button></div>`;
  }
  $('#mtitle').textContent = t;
  const mb = $('#mbody'); if (mb.dataset.h !== h) { mb.innerHTML = h; mb.dataset.h = h; if (k === 'inv') filterInventory(); }
  if (k === 'map') drawBigMap();
  if (k === 'stats') drawHistory();
  if (k === 'win' || k === 'recap') startTimelapse(mapBase);
}

// ---------------------------------------------------------------------------
// Inventory screen: what you have, grouped, with rates and what your goals still need
const RAW = new Set(['iron_ore', 'copper_ore', 'limestone', 'coal', 'caterium_ore', 'raw_quartz', 'bauxite', 'sulfur', 'uranium', 'wood']);
const SPECIAL = new Set(['power_shard', 'amplifier', 'hard_drive']);
function itemGroup(k: string) {
  if (RAW.has(k)) return 0;
  if (SPECIAL.has(k)) return 4;
  const i = ITEM_KEYS.indexOf(k);
  if (i < ITEM_KEYS.indexOf('reinforced_plate') || ['compacted_coal', 'empty_canister', 'packaged_water', 'packaged_fuel', 'packaged_oil'].includes(k)) return k.endsWith('_ingot') ? 1 : 2;
  if (i < ITEM_KEYS.indexOf('heavy_modular_frame') || k === 'heat_sink' || k === 'cooling_system') return 3;
  return 5;
}
const GROUP_NAMES = ['⛏ Raw resources', '🔥 Ingots', '🔩 Basic parts', '⚙️ Components', '💎 Special', '🚀 High-tech'];
const GROUP_ORDER = [0, 1, 2, 3, 5, 4];
let invQuery = '';
function inventoryHTML() {
  const S = G.S;
  // everything the current goals still need
  const need: Record<string, number> = {};
  for (const m of MILESTONES) if (m.tier <= S.maxTier && !S.done.has(m.id)) for (const kk in m.req) need[kk] = (need[kk] || 0) + m.req[kk] - (m.phase ? (S.elev[kk] || 0) : 0);
  let total = 0, kinds = 0;
  for (const kk of ITEM_KEYS) { const n = Math.floor(S.inv[kk] || 0); if (n > 0 && !isFluid(kk)) { total += n; kinds++; } }
  let h = `<div class="row wrap" style="gap:10px;margin-bottom:10px"><input type="search" data-input="invq" placeholder="🔍 Search items…" value="${esc(invQuery)}" style="flex:1;min-width:180px"><span class="dim">${fmt(total)} items · ${kinds} kinds · <kbd>I</kbd> to close</span></div>`;
  const needKeys = Object.keys(need).filter(kk => need[kk] > 0);
  if (needKeys.length) {
    h += '<h3 class="ch">🎯 Needed for your current goals</h3><div class="invneed">';
    for (const kk of needKeys) { const have = Math.floor(S.inv[kk] || 0), p = Math.min(100, have / need[kk] * 100); h += `<div class="req" data-tip="item:${kk}" data-name="${esc(ITEMS[kk].n.toLowerCase())}">${ic(kk, 18)}<span class="bn">${ITEMS[kk].n}</span><div class="bar ${p >= 100 ? 'full' : ''}"><i style="width:${p}%"></i></div><span class="num">${fmt(have)}/${fmt(need[kk])}</span></div>`; }
    h += '</div>';
  }
  const groups: string[][] = [[], [], [], [], [], []];
  for (const kk of ITEM_KEYS) { if (isFluid(kk)) continue; if ((S.inv[kk] || 0) >= 1 || need[kk]) groups[itemGroup(kk)].push(kk); }
  let any = false;
  for (const gi of GROUP_ORDER) {
    const list = groups[gi];
    if (!list.length) continue;
    any = true;
    h += `<h3 class="ch">${GROUP_NAMES[gi]}</h3><div class="invgrid">`;
    for (const kk of list) {
      const n = Math.floor(S.inv[kk] || 0), made = rate(stats.P, kk), used = rate(stats.C, kk);
      h += `<div class="invc ${n < 1 ? 'empty' : ''} ${need[kk] > 0 ? 'needed' : ''}" data-tip="item:${kk}" data-name="${esc(ITEMS[kk].n.toLowerCase())}">${ic(kk, 36)}<b>${fmt(n)}</b><span class="sm">${ITEMS[kk].n}</span>${made || used ? `<span class="sm dim">${made ? `<span class="pos">+${fmtR(made)}</span>` : ''}${made && used ? ' / ' : ''}${used ? `<span class="neg">−${fmtR(used)}</span>` : ''} /min</span>` : ''}${need[kk] > 0 ? `<span class="needtag">goal ${fmt(need[kk])}</span>` : ''}</div>`;
    }
    h += '</div>';
  }
  if (!any) h += '<p class="dim">Your inventory is empty. Belt things into the HUB, or hand-mine ore, to fill it.</p>';
  return h + '<p class="sm dim">Anything belted into the HUB lands here. Building costs are paid from here.</p>';
}
/** hide inventory cards that don't match the search box (no re-render, so typing isn't interrupted) */
function filterInventory() {
  const q = invQuery.trim().toLowerCase();
  document.querySelectorAll('#mbody [data-name]').forEach(el => { (el as HTMLElement).style.display = !q || (el as HTMLElement).dataset.name!.includes(q) ? '' : 'none'; });
  // hide section headings with nothing left in them
  document.querySelectorAll('#mbody .invgrid, #mbody .invneed').forEach(box => {
    const any = [...box.children].some(c => (c as HTMLElement).style.display !== 'none');
    (box as HTMLElement).style.display = any ? '' : 'none';
    const hd = box.previousElementSibling as HTMLElement | null;
    if (hd && hd.tagName === 'H3') hd.style.display = any ? '' : 'none';
  });
}

// ---------------------------------------------------------------------------
// History graphs (Stats screen)
let gSel: Set<string> | null = null;
/** items shown on the graph: your picks, or the three busiest by default */
function graphSel(): Set<string> {
  if (gSel) return gSel;
  const last = hist.s[hist.s.length - 1];
  const top = last ? Object.keys(last.p).sort((a, b) => last.p[b] - last.p[a]).slice(0, 3) : [];
  return new Set(top);
}
function toggleGraph(k: string) { const s = new Set(graphSel()); if (s.has(k)) s.delete(k); else s.add(k); gSel = s; }
const GCOL = ['#f5a524', '#4cc38a', '#4ea1ff', '#e05ab4', '#c7ccd8', '#ff7a5a', '#9a7aff', '#6ae0e0'];
function drawHistory() {
  const S = hist.s;
  const draw = (id: string, series: { v: number[]; col: string; dash?: boolean }[], unit: string) => {
    const c = document.getElementById(id) as HTMLCanvasElement | null; if (!c) return;
    const g = c.getContext('2d')!, Wc = c.width, Hc = c.height, L = 46, B = 18;
    g.clearRect(0, 0, Wc, Hc);
    let mx = 1; for (const s of series) for (const v of s.v) mx = Math.max(mx, v);
    g.strokeStyle = '#2a3140'; g.fillStyle = '#7a8494'; g.font = '11px Segoe UI'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = 6 + (Hc - B - 6) * i / 4; g.beginPath(); g.moveTo(L, y); g.lineTo(Wc - 4, y); g.stroke(); g.fillText(fmtR(mx * (1 - i / 4)) + unit, 2, y + 4); }
    const tNow = S.length ? S[S.length - 1].t : 0;
    for (const m of [60, 45, 30, 15, 0]) { const x = L + (Wc - L - 4) * (1 - m / 60); g.fillText(m ? `-${m}m` : 'now', x - 10, Hc - 4); }
    if (S.length < 2) { g.fillStyle = '#9aa4b2'; g.fillText('Collecting data… a point is added every 30 seconds.', L + 20, Hc / 2); return; }
    for (const s of series) {
      g.strokeStyle = s.col; g.lineWidth = 2; g.setLineDash(s.dash ? [5, 4] : []); g.beginPath();
      S.forEach((smp, i) => { const x = L + (Wc - L - 4) * (1 - (tNow - smp.t) / 3600), y = 6 + (Hc - B - 6) * (1 - s.v[i] / mx); if (x < L) return; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    }
    g.setLineDash([]);
  };
  const sel = [...graphSel()], ser: { v: number[]; col: string; dash?: boolean }[] = [];
  sel.forEach((k, i) => { const col = GCOL[i % GCOL.length]; ser.push({ v: S.map(s => s.p[k] || 0), col }); if (S.some(s => s.c[k])) ser.push({ v: S.map(s => s.c[k] || 0), col, dash: true }); });
  draw('gItems', ser, '');
  draw('gPower', [{ v: S.map(s => s.cap), col: '#f5a524' }, { v: S.map(s => s.dem), col: '#4ea1ff' }], ' MW');
  const lg = document.getElementById('gLegend');
  if (lg) lg.innerHTML = sel.length ? sel.map((k, i) => `<span class="chip" style="border-color:${GCOL[i % GCOL.length]}">${ic(k, 16)} ${ITEMS[k].n}</span>`).join('') : '<span class="dim sm">Click rows in the table to graph items.</span>';
}

const HELP = `<div class="help cols"><div>
<h3>The loop</h3><p>Mine ore → smelt → build parts → belt them into the <b>HUB</b> → submit <b>Milestones</b> → unlock new machines → build bigger. Finish four <b>Space Elevator</b> phases to win.</p>
<h3>Machine ports</h3><p>Every machine has one <b style="color:#6ec8ff">blue input arrow</b> (behind it) and one <b style="color:#ffb347">orange output arrow</b> (in front). Machines that need two or more ingredients take them all through the one input — use a <b>Merger</b> to combine belts first, and keep the ratios roughly balanced. Pipes attach on any side. The HUB and Space Elevator accept belts on every side.</p>
<h3>Power</h3><p>Everything near the HUB gets free power (30 MW). Elsewhere, place <b>Power Poles</b> — anything inside a pole's area is powered, and poles auto-wire to each other. Build <b>Biomass Burners</b> (wood), then <b>Coal Generators</b> (coal + water), <b>Fuel Generators</b>, and <b>Geothermal</b> on geysers. Overloaded grids run everything slower. Press <kbd>V</kbd> to see power areas. While placing a pole, <b>yellow rings</b> show where it can connect to existing poles; the ring turns green and a preview wire appears when it will connect.</p>
<h3>Fluids</h3><p>Water Extractors go on lakes; Oil Extractors on oil nodes. Pipes connect to neighbours automatically — one fluid per network. Refineries make <b>byproducts</b>: if a byproduct has nowhere to go, the refinery stops. Sink it, burn it or reuse it!</p>
<h3>Transport</h3><p><b>Trucks (Tier 1):</b> build two Truck Stations and buy a truck in one's panel — it drives over open ground, no track needed. <b>Trains (Tier 2):</b> place two Train Stations, click one and use <b>Quick Route</b>: it lays a one-way loop of track around mountains and over lakes and builds a train. Add up to 12 trains per loop (<kbd>T</kbd> lists them all). You can also drag rails yourself. <b>Signals:</b> put Block Signals and Path Signals on your own tracks so many trains can share them — a train waits at a red signal until the track ahead is clear (path signals only need the tiles the train will use, which is ideal at junctions). <b>Ships (Tier 2):</b> build Ship Ports on lake or sea shores and buy cargo ships (2400 items) in a port's panel — choose which ports each ship visits. <b>Drones</b> fly goods in a straight line between Drone Ports.</p><h3>Biomes & distance</h3><p>Plains around the HUB: iron, copper, limestone · Forest: coal, iron, trees · Desert: oil, quartz, caterium, sulfur, bauxite · Highlands (rocky, hilly): caterium, sulfur, bauxite, geysers. In new worlds the forest, desert and highlands are big regions in different directions, and resources sit in rings: coal a little way out, oil/quartz/caterium/sulfur further, and bauxite near the edges. Better nodes are further from the HUB. Hover the ground to see what can be found there.</p>
<h3>Day & night</h3><p>A day lasts 12 minutes. Machines keep working at night; <b>Solar Panels</b> only make power while the sun is up. Turn the cycle off any time in the ☰ menu.</p>
<h3>Exploring</h3><p>Nodes appear on the map once you have seen them. The <b>Scanner</b> (<kbd>N</kbd>) pings the nearest resources, <b>💎 power crystals</b> (free Power Shards) and <b>🛸 crash sites</b>. Crash sites hold <b>Hard Drives</b>: analyse them in <b>Research</b> (<kbd>U</kbd>) to pick alternate recipes.</p>
<h3>Floors</h3><p>Build up to <b>three floors above the ground</b>. Press <kbd>PageUp</kbd>/<kbd>PageDown</kbd> (or <kbd>E</kbd>/<kbd>Z</kbd>, or the floor buttons by the minimap) to change floor — the camera rises with you and the floors above fade out. Lay <b>Foundations</b> (Floors tab, click-drag a rectangle), then build on them. <b>Conveyor Lifts</b> carry items up or down one floor; <b>Pipe Lifts</b> carry fluids. Power poles power every floor in their area. Miners, stations and other ground things stay on the ground. Middle-drag up/down (or <kbd>,</kbd> <kbd>.</kbd>) tilts the camera.</p>
<h3>Ratios</h3><ul><li>Miner Mk1 on a normal node = 120/min → feeds <b>2 smelters</b></li><li>Belts: Mk1 240 · Mk2 480 · Mk3 960 · Mk4 1440 /min</li><li>Click any machine for its exact rates; <kbd>P</kbd> shows totals.</li></ul>
</div><div>
<h3>Controls</h3><ul>
<li><kbd>Tab</kbd> build category · <kbd>1</kbd>–<kbd>0</kbd> pick a building · <kbd>F</kbd> belt</li>
<li><kbd>R</kbd> rotate (Shift+R back). While dragging belts/rails/pipes, <kbd>R</kbd> flips the corner.</li>
<li><kbd>Q</kbd> copy the hovered building (with recipe)</li>
<li><kbd>X</kbd> deconstruct — click or drag a box (also clears trees)</li>
<li><kbd>Ctrl+C</kbd> copy an area · <kbd>Ctrl+V</kbd> paste · <kbd>B</kbd> blueprint library</li>
<li>Drag empty ground / right-drag / <kbd>WASD</kbd> pan · wheel zoom · <kbd>G</kbd> or <kbd>Space</kbd> locate & fly to your HUB (the minimap arrow always points home)</li>
<li>Middle-drag or <kbd>[</kbd> <kbd>]</kbd> rotate the camera · middle-drag up/down or <kbd>,</kbd> <kbd>.</kbd> tilt it</li>
<li><kbd>PageUp</kbd>/<kbd>PageDown</kbd> (or <kbd>E</kbd>/<kbd>Z</kbd>) change floor</li>
<li><kbd>H</kbd> milestones · <kbd>C</kbd> craft · <kbd>P</kbd> stats · <kbd>K</kbd> shop · <kbd>M</kbd> map · <kbd>I</kbd> inventory (search, rates, goal needs) · <kbd>V</kbd> power areas</li>
<li><kbd>O</kbd> fast travel between your HUB and Outposts (not in Hard) · <kbd>G</kbd> go home</li>
<li><kbd>T</kbd> vehicles · <kbd>N</kbd> scanner · <kbd>U</kbd> research · <kbd>J</kbd> achievements · <kbd>L</kbd> planner (Easy/Creative)</li>
<li>Click ore to hand-mine (hold to keep going). Click or drag across trees to chop them.</li>
<li>Right-click / <kbd>Esc</kbd> cancel</li></ul>
<h3>Difficulty & game length</h3><p>Easy (~10–15 h), Normal (~15–30 h) and Hard (~30–50 h) differ in resource richness, starting kit and how much each later milestone and Space Elevator phase asks for. Tier 0 is the same everywhere.</p>
<h3>Machine lights</h3><p>${status('work')}<br>${status('starve')}<br>${status('block')}<br>${status('lowpower')}<br>${status('nopower', 'No power')}</p>
<h3>Overclocking & Shop</h3><p>Feed anything into a <b>Resource Sink</b> for points → coupons. Spend them (<kbd>K</kbd>) on Power Shards (overclock to 250%), Output Amplifiers and upgrades.</p>
</div></div>`;

// ---------------------------------------------------------------------------
// Maps
const mapFilter: Record<string, boolean> = {};
const RES_COL: Record<string, string> = { geyser: '#ff7040', crude_oil: '#b080e0' };
let mapBase: HTMLCanvasElement | null = null, mapOver: HTMLCanvasElement | null = null, mapOverT = 0;
const TCOL = ['#4d6b31', '#3a5a2a', '#a8987a', '#6a5640', '#2e6070', '#183a52', '#77746f'];
export function buildMapBase() {
  mapBase = document.createElement('canvas'); mapBase.width = W; mapBase.height = H;
  const g = mapBase.getContext('2d')!, img = g.createImageData(W, H), D = img.data;
  const rgb = TCOL.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  for (let i = 0; i < W * H; i++) {
    const c = rgb[G.tiles[i]] || rgb[0], tr = G.trees[i] ? 0.7 : 1;
    D[i * 4] = c[0] * tr; D[i * 4 + 1] = c[1] * (G.trees[i] ? 0.9 : 1); D[i * 4 + 2] = c[2] * tr; D[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  mapOver = document.createElement('canvas'); mapOver.width = W; mapOver.height = H;
}
/** a small image of everything built (for the timelapse) */
export function snapshotOverlay(): string {
  const S = 512, k = S / W, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  for (const e of G.ents.values()) {
    const d = BLD[e.type];
    g.fillStyle = d.kind === 'belt' || d.kind === 'tunnel' || d.kind === 'lift' ? '#e0a840' : d.kind === 'rail' ? '#d8d0c0' : d.kind === 'pipe' ? '#8ab0d0' : d.kind === 'pole' ? '#e8d890' : d.col;
    g.fillRect(Math.floor(e.x * k), Math.floor(e.y * k), Math.max(1, Math.ceil(e.w * k)), Math.max(1, Math.ceil(e.h * k)));
  }
  return c.toDataURL('image/png');
}
function refreshMapOverlay() {
  if (!mapOver) return;
  const g = mapOver.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  for (const e of G.ents.values()) {
    const d = BLD[e.type];
    g.fillStyle = d.kind === 'belt' || d.kind === 'tunnel' ? '#d8a040' : d.kind === 'rail' ? '#c8c0b0' : d.kind === 'pipe' ? '#8ab0d0' : d.kind === 'pole' ? '#e8d890' : d.col;
    g.fillRect(e.x, e.y, e.w, e.h);
  }
  for (const t of G.trains) { g.fillStyle = '#ff5030'; for (const c of t.cells) g.fillRect(c % W - 1, Math.floor(c / W) - 1, 3, 3); }
}
function drawMiniMap() {
  const c = document.getElementById('minimap') as HTMLCanvasElement;
  if (!c || !mapBase) return;
  const g = c.getContext('2d')!, S = c.width;
  // show a 256x256 window around the camera
  const span = 256, cx = clamp(view.cam.x - span / 2, 0, W - span), cy = clamp(view.cam.y - span / 2, 0, H - span);
  g.imageSmoothingEnabled = false;
  g.drawImage(mapBase, cx, cy, span, span, 0, 0, S, S);
  g.drawImage(mapOver!, cx, cy, span, span, 0, 0, S, S);
  const k = S / span;
  G.nodes.forEach((n, i) => { if (!G.disc[i] || n.x < cx || n.y < cy || n.x > cx + span || n.y > cy + span) return; g.fillStyle = RES_COL[n.res] || ITEMS[n.res].c; g.fillRect((n.x - cx) * k, (n.y - cy) * k, 2 * k + 1, 2 * k + 1); });
  for (const p of G.pings) { if (p.x < cx || p.y < cy || p.x > cx + span || p.y > cy + span) continue; g.strokeStyle = p.col; g.lineWidth = 2; g.beginPath(); g.arc((p.x - cx) * k, (p.y - cy) * k, 5 + 2 * Math.sin(G.realNow * 5), 0, 7); g.stroke(); }
  const vr = viewDiamond();
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); vr.forEach(([x, y], i) => i ? g.lineTo((x - cx) * k, (y - cy) * k) : g.moveTo((x - cx) * k, (y - cy) * k)); g.closePath(); g.stroke();
  const hub = G.L && G.L.hub;
  if (hub) {
    const hx = (hub.x + 2 - cx) * k, hy = (hub.y + 2 - cy) * k, pad = 9;
    const inside = hx >= 0 && hy >= 0 && hx <= S && hy <= S;
    const px = Math.max(pad, Math.min(S - pad, hx)), py = Math.max(pad, Math.min(S - pad, hy));
    g.fillStyle = '#f5a524'; g.strokeStyle = '#1a1206'; g.lineWidth = 1.5;
    if (inside) { g.beginPath(); g.arc(px, py, 5, 0, 7); g.fill(); g.stroke(); }
    else {
      const a = Math.atan2(hy - S / 2, hx - S / 2);
      g.save(); g.translate(px, py); g.rotate(a); g.beginPath(); g.moveTo(8, 0); g.lineTo(-6, -6); g.lineTo(-3, 0); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  }
  c.dataset.cx = String(cx); c.dataset.cy = String(cy);
}
function drawBigMap() {
  const c = document.getElementById('bigmap') as HTMLCanvasElement;
  if (!c || !mapBase) return;
  refreshMapOverlay();
  const g = c.getContext('2d')!, k = c.width / W;
  g.imageSmoothingEnabled = true;
  g.drawImage(mapBase, 0, 0, c.width, c.height);
  g.drawImage(mapOver!, 0, 0, c.width, c.height);
  G.nodes.forEach((n, i) => {
    if (mapFilter[n.res] === false || !G.disc[i]) return;
    g.fillStyle = RES_COL[n.res] || ITEMS[n.res].c;
    g.beginPath(); g.arc((n.x + 1) * k, (n.y + 1) * k, 2.6, 0, 7); g.fill();
    if (n.p === 2) { g.strokeStyle = '#ffd24a'; g.lineWidth = 1.2; g.stroke(); }
  });
  G.feats.forEach((f, i) => {
    if (!G.fdisc[i] || G.S.looted.includes(f.id)) return;
    g.font = '13px Segoe UI Emoji, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(f.kind === 'site' ? '🛸' : '💎', (f.x + f.w / 2) * k, (f.y + f.w / 2) * k);
  });
  for (const p of G.pings) { g.strokeStyle = p.col; g.lineWidth = 2.5; g.beginPath(); g.arc(p.x * k, p.y * k, 7, 0, 7); g.stroke(); }
  g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  for (const s of G.L.stations) { g.fillStyle = '#f0c040'; g.font = '10px Segoe UI'; g.fillText(s.name, s.x * k + 4, s.y * k); }
  g.strokeStyle = '#f5a524'; g.lineWidth = 2; g.strokeRect(HX * k - 3, HY * k - 3, 4 * k + 6, 4 * k + 6);
  g.font = '16px Segoe UI Emoji, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('🏠', (HX + 2) * k, HY * k - 3);
  g.font = '14px Segoe UI Emoji, sans-serif'; for (const o of G.L.outposts || []) g.fillText('⛺', (o.x + 1.5) * k, (o.y + 1.5) * k + 6);
  g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); viewDiamond().forEach(([x, y], i) => i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)); g.closePath(); g.stroke();
}
function viewDiamond() { return [s2w(0, 0), s2w(view.cw, 0), s2w(view.cw, view.ch), s2w(0, view.ch)]; }

// ---------------------------------------------------------------------------
// Tooltip
function renderTip() {
  const tip = $('#tip'), m = view.mouse;
  let h = '';
  const hov = document.elementFromPoint(m.sx, m.sy) as HTMLElement | null;
  const tipEl = hov && hov.closest ? hov.closest('[data-tip]') as HTMLElement : null;
  if (tipEl) {
    const tp = tipEl.dataset.tip!;
    if (tp.startsWith('bld:')) h = bldTip(tp.slice(4));
    else if (tp.startsWith('item:')) { const k = tp.slice(5), it = ITEMS[k]; h = `${ic(k, 20)} <b>${it.n}</b><div class="sm">Have ${fmt(G.S.inv[k] || 0)} · sink value ${fmt(it.val || 0)} pts</div><div class="sm">Made: ${fmtR(rate(stats.P, k))}/min · Used: ${fmtR(rate(stats.C, k))}/min</div>`; }
    else if (tp === 'tool:decon') h = '<b>Deconstruct</b> <kbd>X</kbd><div class="sm">Click one thing or drag a box. Full refund.</div>';
    else if (tp === 'tool:copy') h = '<b>Copy area</b> <kbd>Ctrl+C</kbd><div class="sm">Drag a box, then click to paste copies.</div>';
    else if (tp === 'tool:bp') h = '<b>Blueprint library</b> <kbd>B</kbd>';
    else if (tp === 'power') { h = '<b>Power</b><div class="sm">Total use / total production across all grids.</div>'; }
  } else if (hov && hov.id === 'c' && (!tool.t || tool.t.k === 'decon')) {
    const e = pickAt(m.wx, m.wy), n = nodeAt(m.tx, m.ty);
    if (e) {
      const d = def(e);
      if (d.kind === 'belt') h = `<b>${d.n}</b><div class="sm">Max ${d.speed! / 0.5 * 60}/min · carrying ${e.items.length}</div>${G.L.wrong && G.L.wrong.some((w: any) => w.x === e.x && w.y === e.y && (w.z || 0) === (e.z || 0)) ? '<div class="neg sm">⚠ This belt points at the side of a building. Buildings only take items at their blue input arrow.</div>' : ''}${e.items.length ? `<div>${[...new Set(e.items.map((i: any) => i.it))].map((k: any) => ic(k, 16) + ' ' + ITEMS[k].n).join('<br>')}</div>` : ''}`;
      else if (d.kind === 'rail') h = '<b>Railway</b>';
      else if (d.kind === 'machine') h = `<b>${d.n}</b>${e.recipe ? ' — ' + RECIPES[e.recipe].n : ''}<div>${status(e.st)}</div>`;
      else if (d.kind === 'miner') h = `<b>${d.n}</b> — ${ITEMS[e.node.res].n}<div>${status(e.st)}</div>`;
      else if (d.kind === 'pipe' && e.fnet) h = `<b>${d.n}</b><div class="sm">${e.fnet.fluid ? ITEMS[e.fnet.fluid].n : 'Empty'} · ${fmtR(e.fnet.amount)}/${fmtR(e.fnet.cap)}</div>`;
      else h = `<b>${d.n}</b>${e.st ? `<div>${status(e.st)}</div>` : ''}`;
    } else if (view.level > 0) {
      h = hasFloor(m.tx, m.ty, view.level) ? `<b>Foundation</b> <span class="dim">· floor ${view.level}</span><div class="sm">Build anything here except miners, stations and other ground-only buildings.</div>` : `<b>Open air</b> <span class="dim">· floor ${view.level}</span><div class="sm">Lay Foundations (Floors tab) to build up here.</div>`;
    } else if (n) {
      if (n.res === 'geyser') h = `<b>Geyser</b> — ${PURITY[n.p].n}<div class="sm">Geothermal Generator: ${150 * PURITY[n.p].m} MW</div>`;
      else if (n.res === 'crude_oil') h = `<b>Oil node</b> — ${PURITY[n.p].n}<div class="sm">Oil Extractor: ${240 * PURITY[n.p].m}/min</div>`;
      else h = `${ic(n.res, 18)} <b>${ITEMS[n.res].n}</b> — ${PURITY[n.p].n}<div class="sm">Miner Mk1: ${120 * PURITY[n.p].m}/min · click to hand-mine</div>`;
    } else if (m.tx >= 0 && m.ty >= 0 && m.tx < W && m.ty < H) {
      const i = m.ty * W + m.tx;
      if (G.trees[i]) h = '<b>Tree</b><div class="sm">Click or drag to chop (+5 Wood). Chopped trees grow back over time. Building here clears it automatically.</div>';
      else if (isWater(G.tiles[i])) h = `<b>${TILE_NAMES[G.tiles[i]]}</b><div class="sm">Water Extractors, belts, pipes, rails and poles can go here.</div>`;
      else if (G.tiles[i] === TT.ROCK) h = '<b>Mountain</b><div class="sm">Only railways can go here — they tunnel straight through. Trucks drive around.</div>';
      else { const b = biomeAtTiles(G.tiles, m.tx, m.ty); h = `<b>${BIOME_NAMES[b]}</b><div class="sm">Resources found here: ${Object.keys(RES_BIOMES).filter(r => RES_BIOMES[r].includes(b)).map(r => r === 'geyser' ? 'Geysers' : ITEMS[r].n).join(', ') || 'none'}</div>`; }
    }
  }
  if (h) {
    tip.innerHTML = h; tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    let x = m.sx + 16, y = m.sy + 16;
    if (x + r.width > view.cw - 8) x = m.sx - r.width - 12;
    if (y + r.height > view.ch - 8) y = m.sy - r.height - 12;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  } else tip.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Actions
export async function saveNow() { const ok = await saveGame(); toast(ok ? '💾 Saved' : 'Save failed', ok ? 'good' : 'bad'); }
let onNewGame: () => void = () => { };
export function setNewGameHandler(f: () => void) { onNewGame = f; }

function act(cmd: string, a: string, b: string) {
  const S = G.S, e = view.inspect, t = view.inspectTrain;
  switch (cmd) {
    case 'open': toggleModal(a); break;
    case 'gsel': toggleGraph(a); break;
    case 'floor': setLevel(+a); break;
    case 'timer': try { localStorage.setItem('bw-timer', showTimer() ? '0' : '1'); } catch { } break;
    case 'home': closeModal(); locateHome(flyTo); break;
    case 'route': if (e) {
      const others = stationList().filter((o: Ent) => o !== e);
      const tgt = G.ents.get(e.routeTo) || others[0];
      if (!tgt) break;
      run({ k: 'route', id: e.id, to: tgt.id, train: a === '1' ? 1 : 0 }); inspKey = '';
    } break;
    case 'unlockok': unlockQueue.shift(); if (unlockQueue.length) { ($('#mbody') as any).dataset.h = ''; renderModal(); } else closeModal(); break;
    case 'skiptut': G.S.flags.tutDone = 1; view.marker = null; break;
    case 'showme': { const i = tutStep(); const at = i >= 0 && TUT[i].at ? TUT[i].at!() : null; if (at && markerFlyTo) markerFlyTo(at[0], at[1]); break; }
    case 'closeModal': closeModal(); break;
    case 'closeInsp': closeInspect(); break;
    case 'cat': setCat(+a); break;
    case 'slot': selectSlot(+a); break;
    case 'decon': setTool(tool.t && tool.t.k === 'decon' ? null : { k: 'decon' }); sfx('click'); break;
    case 'copy': setTool({ k: 'bpsel', quick: true }); sfx('click'); break;
    case 'recipe': if (e) { run({ k: 'recipe', id: e.id, r: a || null }); inspKey = ''; } break;
    case 'rot': if (e) run({ k: 'rot', id: e.id, dir: 1 }); break;
    case 'copyEnt': if (e) { setTool({ k: 'build', type: e.type, recipe: e.recipe || null, clock: e.clock, filt: e.filt, mode: e.mode }); closeInspect(); } break;
    case 'del': if (e) run({ k: 'rm', id: e.id }); break;
    case 'shard': if (e) { run({ k: 'shard', id: e.id, n: +a }); inspKey = ''; } break;
    case 'amp': if (e) { run({ k: 'amp', id: e.id }); inspKey = ''; } break;
    case 'mode': if (e) { run({ k: 'mode', id: e.id, m: a }); inspKey = ''; } break;
    case 'collect': if (e) run({ k: 'collect', id: e.id }); break;
    case 'loadElev': run({ k: 'loadElev' }); break;
    case 'fuel': if (e) run({ k: 'fuel', id: e.id }); break;
    case 'flush': if (e) run({ k: 'flush', id: e.id }); break;
    case 'submit': run({ k: 'submit', m: a }); break;
    case 'craft': run({ k: 'craft', r: a, n: +b }); break;
    case 'clearq': run({ k: 'clearq' }); break;
    case 'buy': run({ k: 'buy', s: a }); break;
    case 'speed': run({ k: 'speed' }); sfx('click'); break;
    case 'save': saveNow(); break;
    case 'export': exportSave(); break;
    case 'import': importSave(ok => { if (ok) { closeModal(); closeInspect(); toast('Save imported', 'good'); buildMapBase(); onLoadedHook(); } else toast('Not a valid Beltworks save', 'bad'); }); break;
    case 'sound': setSound(!audio.on); break;
    case 'newgame': closeModal(); closeInspect(); onNewGame(); break;
    case 'bpnew': closeModal(); setTool({ k: 'bpsel' }); break;
    case 'bpclip': if (clipboard) { closeModal(); setTool({ k: 'paste', bp: clipboard, prot: 0 }); } break;
    case 'bpsaveclip': if (clipboard) nameBlueprint(clipboard); break;
    case 'bpuse': { const bp = loadBlueprints()[+a]; if (bp) { closeModal(); setTool({ k: 'paste', bp, prot: 0 }); } break; }
    case 'bpdel': { const l = loadBlueprints(); l.splice(+a, 1); storeBlueprints(l); break; }
    case 'bpsave': case 'bpjust': {
      const bp = bpPending; if (!bp) break;
      if (cmd === 'bpsave') { const nm = ((document.getElementById('bpn') as HTMLInputElement)?.value || '').trim() || `Blueprint ${loadBlueprints().length + 1}`; bp.name = nm; const l = loadBlueprints(); l.push(bp); storeBlueprints(l); toast(`Saved blueprint "${esc(nm)}"`, 'good'); }
      closeModal(); setTool({ k: 'paste', bp, prot: 0 }); bpPending = null; break;
    }
    case 'wagon': if (t) { run({ k: 'wagon', t: t.id, n: +a }); inspKey = ''; } break;
    case 'trun': if (t) { run({ k: 'trun', t: t.id }); inspKey = ''; } break;
    case 'tremove': if (t) run({ k: 'rmv', v: 't', id: t.id }); break;
    case 'tup': if (t) { run({ k: 'tup', t: t.id, i: +a }); inspKey = ''; } break;
    case 'tdel': if (t) { run({ k: 'tdel', t: t.id, i: +a }); inspKey = ''; } break;
    default: if (extraAct(cmd, a, b)) inspKey = '';
  }
  if (modalKind && cmd !== 'closeModal' && cmd !== 'open') setTimeout(() => { if (modalKind) { ($('#mbody') as any).dataset.h = ''; renderModal(); } }, 0);
}
let onLoadedHook = () => { };
export function setOnLoaded(f: () => void) { onLoadedHook = f; }

export function initUI() {
  document.addEventListener('pointerdown', ev => {
    const a = (ev.target as HTMLElement).closest?.('[data-act]') as HTMLElement | null;
    if (!a || (a as any).disabled) return;
    const [cmd, x, y] = a.dataset.act!.split(':');
    act(cmd, x, y);
  });
  const onInput = (ev: Event) => {
    const el = ev.target as HTMLInputElement;
    const key = el.dataset?.input; if (!key) return;
    const [k, a] = key.split(':');
    const e = view.inspect, t = view.inspectTrain;
    if (k === 'clock' && e) { const cv = document.getElementById('clkv'); if (cv) cv.textContent = el.value + '%'; if (ev.type === 'change' || !online()) run({ k: 'set', id: e.id, f: 'clock', v: +el.value / 100 }); }
    else if (k === 'filt' && e) run({ k: 'set', id: e.id, f: 'filt', i: +a, v: el.value });
    else if (k === 'name' && e) { if (ev.type === 'change' || !online()) run({ k: 'set', id: e.id, f: 'name', v: el.value }); }
    else if (k === 'target' && e) { run({ k: 'set', id: e.id, f: 'target', v: +el.value }); inspKey = ''; }
    else if (k === 'routeTo' && e) run({ k: 'set', id: e.id, f: 'routeTo', v: +el.value });
    else if (k === 'tname' && t) { if (ev.type === 'change' || !online()) run({ k: 'tname', t: t.id, v: el.value }); }
    else if (k === 'addstop' && t && el.value && ev.type === 'change') { run({ k: 'tstop', t: t.id, v: +el.value }); inspKey = ''; }
    else if (k === 'mapf') { mapFilter[a] = el.checked; drawBigMap(); }
    else if (k === 'invq') { invQuery = el.value; filterInventory(); }
    else if (k === 'vol') setVolume(a as any, +el.value / 100);
    else extraInput(k, a, el, ev);
  };
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  document.addEventListener('keydown', ev => {
    if ((ev.target as HTMLElement).id === 'bpn' && ev.key === 'Enter') act('bpsave', '', '');
  });
  $('#modal').addEventListener('pointerdown', ev => { if (ev.target === $('#modal')) closeModal(); });
  const mm = document.getElementById('minimap') as HTMLCanvasElement;
  mm.addEventListener('pointerdown', ev => {
    const r = mm.getBoundingClientRect(), k = 256 / r.width;
    view.cam.x = +mm.dataset.cx! + (ev.clientX - r.left) * k; view.cam.y = +mm.dataset.cy! + (ev.clientY - r.top) * k;
  });
  document.addEventListener('pointerdown', ev => {
    const c = (ev.target as HTMLElement);
    if (c.id === 'bigmap') { const r = c.getBoundingClientRect(); view.cam.x = (ev.clientX - r.left) / r.width * W; view.cam.y = (ev.clientY - r.top) / r.height * H; closeModal(); }
  });
  addEventListener('pointermove', ev => { if (ev.target !== document.getElementById('c')) { view.mouse.sx = ev.clientX; view.mouse.sy = ev.clientY; } });
  renderHotbar();
  setRerender(() => { if (modalKind) { ($('#mbody') as any).dataset.h = ''; renderModal(); } });
}

let t4 = 0, t1 = 0, tMap = 0;
export function uiTick(dt: number) {
  t4 += dt; t1 += dt; tMap += dt;
  if (t4 > 0.2) {
    t4 = 0;
    renderInv(); renderTracker(); renderInspect(); updateHint(); updateMarker();
    const typing = document.activeElement && (document.activeElement as HTMLElement).closest?.('#mbody') && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (!typing && (modalKind === 'stats' || modalKind === 'hub' || modalKind === 'craft' || modalKind === 'shop' || modalKind === 'inv' || (modalKind && LIVE_MODALS.has(modalKind)))) renderModal();
  }
  if (t1 > 1) { t1 = 0; renderHotbar(); }
  if (tMap > 2) { tMap = 0; refreshMapOverlay(); }
  drawMiniMap();
  renderTip();
}
export { captureBP };
