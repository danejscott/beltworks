// UI for the newer systems: vehicles list, scanner, research, planner, achievements, crash sites, trucks.
import { sfx } from './audio';
import { ALT_IDS, BLD, isFluid, ITEMS, MACHINE_NAMES, RECIPES } from './data';
import { ACHS } from './achievements';
import { altMachineOK, altPool, analyseDrive, CRYSTAL_NAMES, discoveredCount, lootSite, pickAlt, scan, scanCol, scanName, scanRange, SCAN_TARGETS } from './explore';
import { Feat } from './features';
import { machineName, plan, plannableItems } from './planner';
import { addTrainToLine, lineOf, lineTrains, MAX_LINE_TRAINS, trainCap } from './trains';
import { buyTruck, removeTruck, TRUCK_CAP, truckStations } from './trucks';
import { esc, fmt, fmtR } from './util';
import { W } from './terrain';
import { view } from './view';
import { Ent, G, Truck } from './world';
import { closeModal, costHTML, flyTo, ic, openModal, openTrain, openTruck, status, toast } from './ui';

export const plannerAllowed = () => G.S.mode === 'easy' || G.S.mode === 'creative';
export const fastTravelAllowed = () => G.S.mode !== 'hard';
/** the HUB plus every Outpost, for the travel list */
export function travelPoints(): { name: string; x: number; y: number; e: Ent }[] {
  const out: { name: string; x: number; y: number; e: Ent }[] = [];
  if (G.L && G.L.hub) out.push({ name: '🏠 HUB', x: G.L.hub.x + 2, y: G.L.hub.y + 2, e: G.L.hub });
  for (const o of (G.L && G.L.outposts) || []) out.push({ name: '⛺ ' + o.name, x: o.x + 1.5, y: o.y + 1.5, e: o });
  return out;
}
let pendingSite: Feat | null = null;
export function openSite(f: Feat) { pendingSite = f; openModal('site'); }
const pl = { item: 'reinforced_plate', rate: 10 };

const stTxt: Record<string, string> = { moving: 'Driving', loading: 'At station', nopath: 'No route!', noschedule: 'No schedule', stopped: 'Stopped', idle: 'Planning route' };
const vehLed = (s: string) => s === 'nopath' ? 'block' : s === 'moving' || s === 'loading' ? 'work' : 'idle';

/** extra modal renderers: return [title, html] */
export const EXTRA_MODALS: Record<string, () => [string, string]> = {
  vehicles: () => {
    let h = '<p class="sm" style="margin-top:0">Every train and truck in your world. <b>View</b> flies the camera there. Quick Route lines are one-way loops, so you can run many trains on each (up to ' + MAX_LINE_TRAINS + ').</p>';
    const lines = G.S.lines.filter(l => G.ents.has(l.a) && G.ents.has(l.b));
    if (lines.length) {
      h += '<h3 class="ch">🛤 Train lines</h3><table class="st"><tr><th>Line</th><th>Length</th><th>Trains</th><th></th></tr>';
      for (const l of lines) {
        const a = G.ents.get(l.a)!, b = G.ents.get(l.b)!;
        h += `<tr><td>${esc(a.name)} ⇄ ${esc(b.name)}</td><td>${l.cells.length} tiles</td><td>${lineTrains(l).length}</td><td><button class="mini go" data-act="lineadd:${l.id}">+ Train</button></td></tr>`;
      }
      h += '</table>';
    }
    h += '<h3 class="ch">🚂 Trains</h3>';
    if (!G.trains.length) h += '<div class="dim">No trains yet. Place two Train Stations and use Quick Route in one of their panels.</div>';
    else {
      h += '<table class="st"><tr><th>Name</th><th>Status</th><th>Next stop</th><th>Cargo</th><th></th></tr>';
      for (const t of G.trains) {
        const st = G.ents.get(t.sched[t.si]);
        h += `<tr><td>${esc(t.name)}</td><td>${status(vehLed(t.state), stTxt[t.state] || t.state)}</td><td>${st ? esc(st.name) : '—'}</td><td>${fmt(t.tot)} / ${fmt(trainCap(t))}</td><td><button class="mini" data-act="vview:t:${t.id}">View</button></td></tr>`;
      }
      h += '</table>';
    }
    h += '<h3 class="ch">🚚 Trucks</h3>';
    if (!G.trucks.length) h += '<div class="dim">No trucks yet. Build two Truck Stations (Transport tab) and buy a truck in one of their panels.</div>';
    else {
      h += '<table class="st"><tr><th>Name</th><th>Status</th><th>Next stop</th><th>Cargo</th><th></th></tr>';
      for (const t of G.trucks) {
        const st = G.ents.get(t.sched[t.si]);
        h += `<tr><td>${esc(t.name)}</td><td>${status(vehLed(t.state), stTxt[t.state] || t.state)}</td><td>${st ? esc(st.name) : '—'}</td><td>${fmt(t.tot)} / ${fmt(TRUCK_CAP)}</td><td><button class="mini" data-act="vview:k:${t.id}">View</button></td></tr>`;
      }
      h += '</table>';
    }
    return ['Vehicles', h];
  },
  scan: () => {
    let h = `<p class="sm" style="margin-top:0">Scans up to <b>${scanRange()} tiles</b> around the centre of your view (range grows with each tier) and marks the closest finds with light beams. You have discovered <b>${discoveredCount()}</b> of ${G.nodes.length} resource nodes.</p><div class="scang">`;
    for (const k of SCAN_TARGETS) {
      const icon = k === 'site' ? '<span class="big">🛸</span>' : k === 'crystal' ? '<span class="big">💎</span>' : k === 'geyser' ? '<span class="dot" style="background:#ff7040;width:22px;height:22px"></span>' : ic(k, 26);
      h += `<button class="scanb" data-act="scan:${k}" style="border-color:${scanCol(k)}">${icon}<span>${scanName(k)}</span></button>`;
    }
    h += '</div><p class="sm">💎 Power crystals give Power Shards for overclocking (blue 1, yellow 2, purple 5). 🛸 Crash sites hold Hard Drives for alternate recipes — some need parts to pry open.</p>';
    return ['📡 Resource Scanner', h];
  },
  research: () => {
    const S = G.S;
    let h = `<p style="margin-top:0">Hard Drives: <b>${fmt(S.inv.hard_drive || 0)}</b>${S.mode === 'creative' ? ' (free in Creative)' : ''}. Analyse one to choose <b>1 of 3</b> alternate recipes. Alternates use different ingredients — often cheaper, or skipping a whole step.</p>`;
    if (S.altOffer && S.altOffer.length) {
      h += '<h3 class="ch">Choose one</h3><div class="cgrid">';
      for (const id of S.altOffer) h += altCard(id, true);
      h += '</div>';
    } else {
      const pool = altPool();
      h += pool.length ? `<button class="go big" data-act="analyse">🧪 Analyse a Hard Drive</button><span class="sm"> ${pool.length} alternates left to find</span>` : '<p class="pos">You have researched every alternate recipe!</p>';
      if ((S.inv.hard_drive || 0) < 1 && S.mode !== 'creative') h += '<p class="sm">No drives? Open the Scanner (<kbd>N</kbd>) and scan for Crash Sites.</p>';
    }
    h += `<h3 class="ch">Researched (${S.alts.length}/${ALT_IDS.length})</h3>`;
    h += S.alts.length ? `<div class="cgrid">${S.alts.map(id => altCard(id, false)).join('')}</div>` : '<div class="dim">None yet.</div>';
    return ['🧪 Research: Alternate Recipes', h];
  },
  planner: () => {
    if (!plannerAllowed()) return ['📐 Production Planner', '<p>The planner is available in <b>Easy</b> and <b>Creative</b> worlds. In Hard mode, you do the maths!</p>'];
    const items = plannableItems();
    let h = `<div class="row wrap" style="gap:10px"><label>Make</label><select data-input="plitem">${items.map(k => `<option value="${k}" ${k === pl.item ? 'selected' : ''}>${ITEMS[k].n}</option>`).join('')}</select><label>at</label><input type="number" min="0.1" step="any" value="${pl.rate}" data-input="plrate" style="width:90px"><label>per minute</label></div>`;
    const p = plan(pl.item, pl.rate);
    h += '<h3 class="ch">Machines</h3><table class="st"><tr><th>Item</th><th>Recipe</th><th>Machines</th><th>Rate</th><th>Power</th></tr>';
    for (const s of p.steps) {
      const full = Math.ceil(s.count - 1e-6), frac = s.count - Math.floor(s.count);
      const clock = frac > 1e-3 ? ` <span class="sm dim">(or ${full} at ${Math.round(s.count / full * 100)}% clock)</span>` : '';
      h += `<tr><td style="padding-left:${6 + s.depth * 12}px">${ic(s.item, 18)} ${ITEMS[s.item].n}</td><td>${machineName(s.machine)}</td><td><b>${fmtR(s.count)}</b>${clock}</td><td>${fmtR(s.rate)}/min</td><td>${fmtR(s.power)} MW</td></tr>`;
    }
    h += '</table><h3 class="ch">Raw resources</h3><div class="chips">';
    for (const k in p.raw) h += `<span class="chip" data-tip="item:${k}">${ic(k, 18)} ${fmtR(p.raw[k])}/min${!isFluid(k) && ['iron_ore', 'copper_ore', 'limestone', 'coal', 'caterium_ore', 'raw_quartz', 'bauxite'].includes(k) ? ` <span class="dim">≈ ${fmtR(p.raw[k] / 120)} Mk1 miners</span>` : ''}</span>`;
    h += '</div>';
    const bys = Object.keys(p.byproducts);
    if (bys.length) h += `<p class="sm warn">Byproducts to deal with: ${bys.map(k => `${ic(k, 14)} ${fmtR(p.byproducts[k])}/min`).join(', ')}</p>`;
    h += `<p>⚡ Total power: <b>${fmtR(p.power)} MW</b> (plus miners and extractors). Belts: Mk1 carries 240/min.</p><p class="sm dim">Uses standard recipes, normal nodes and 100% clock speed.</p>`;
    return ['📐 Production Planner', h];
  },
  travel: () => {
    const pts = travelPoints();
    let h = '';
    if (!fastTravelAllowed()) h += '<p class="warn">Fast travel is turned off in <b>Hard</b> mode — pan the camera there yourself. (<kbd>G</kbd> still takes you home.)</p>';
    else h += '<p class="sm" style="margin-top:0">Jump the camera straight to your HUB or any Outpost. Build Outposts (Transport tab) in far-away regions to add more stops. Keys <kbd>1</kbd>–<kbd>9</kbd> pick a stop.</p>';
    h += '<div class="cgrid">';
    pts.forEach((p, i) => {
      const d = Math.round(Math.hypot(p.x - view.cam.x, p.y - view.cam.y));
      const n = p.e.pnet ? `${fmtR(p.e.pnet.cap)} MW grid` : 'no grid';
      h += `<div class="ccard"><div><b>${esc(p.name)}</b><div class="sm">${d < 8 ? 'You are here' : d + ' tiles away'} · ${n}</div></div><div class="cb"><button class="${fastTravelAllowed() ? 'go' : ''}" data-act="travel:${i}" ${fastTravelAllowed() ? '' : 'disabled'}>${i < 9 ? `<kbd>${i + 1}</kbd> ` : ''}Travel</button></div></div>`;
    });
    if (pts.length < 2) h += '<div class="dim" style="padding:8px">No Outposts yet — they unlock with Logistics Mk2 (Tier 1).</div>';
    return ['🧭 Fast Travel', h + '</div>'];
  },
  ach: () => {
    const S = G.S, got = ACHS.filter(a => S.ach[a.id]).length;
    let h = `<p style="margin-top:0"><b>${got}</b> / ${ACHS.length} unlocked</p><div class="bar" style="max-width:420px"><i style="width:${got / ACHS.length * 100}%"></i></div><div class="achg">`;
    for (const a of ACHS) {
      const t = S.ach[a.id];
      h += `<div class="achc ${t ? 'got' : ''}"><span class="achi">${t ? a.i : '🔒'}</span><div><b>${a.n}</b><div class="sm">${a.d}</div>${t ? `<div class="sm pos">Unlocked at ${Math.floor(t / 60)} min</div>` : ''}</div></div>`;
    }
    return ['🏆 Achievements', h + '</div>'];
  },
  site: () => {
    const f = pendingSite;
    if (!f || G.S.looted.includes(f.id)) return ['Crash site', '<p class="dim">Already looted.</p>'];
    const need = Object.keys(f.cost).length;
    let h = `<div style="text-align:center"><div style="font-size:48px">🛸</div><p>A crashed drop pod. Inside: <b>${ic('hard_drive', 18)} 1 Hard Drive</b>${f.shards ? ` and <b>${ic('power_shard', 18)} ${f.shards} Power Shard${f.shards > 1 ? 's' : ''}</b>` : ''}.</p>`;
    h += need ? `<p>The hatch is jammed. To pry it open you need: ${costHTML(f.cost)}</p>` : '<p>The hatch is already open.</p>';
    h += `<button class="go big" data-act="loot">${need ? 'Pry it open' : 'Take the loot'}</button><p class="sm">Analyse Hard Drives in Research (<kbd>U</kbd>) to unlock alternate recipes.</p></div>`;
    return ['Crash site', h];
  },
};
function altCard(id: string, pick: boolean) {
  const r = RECIPES[id], outs = Object.keys(r.out), ok = altMachineOK(id);
  return `<div class="ccard">${ic(outs[0], 34)}<div><b>${r.n}</b> <span class="dim">· ${MACHINE_NAMES[r.m]}</span><div class="sm">${Object.keys(r.in).map(i => `${ic(i, 14)}${fmtR(r.in[i] * 60 / r.t)}`).join(' + ')} → ${outs.map(o => `${ic(o, 14)}${fmtR(r.out[o] * 60 / r.t)}`).join(' + ')} /min</div>${ok ? '' : `<div class="sm warn">Needs a ${MACHINE_NAMES[r.m]} (not unlocked yet)</div>`}</div>${pick ? `<div class="cb"><button class="go" data-act="pickalt:${id}">Choose</button></div>` : ''}</div>`;
}
export const LIVE_MODALS = new Set(['vehicles', 'research', 'ach', 'scan']);

/** extra actions; returns true if handled */
export function extraAct(cmd: string, a: string, b: string): boolean {
  const S = G.S, e = view.inspect as Ent | null, k = view.inspectTruck as Truck | null;
  switch (cmd) {
    case 'vview': {
      if (a === 't') { const t = G.trains.find(x => String(x.id) === b); if (t) { const c = t.cells[0]; flyTo(c % W, Math.floor(c / W)); closeModal(); openTrain(t); } }
      else { const t = G.trucks.find(x => String(x.id) === b); if (t) { flyTo(t.x, t.y); closeModal(); openTruck(t); } }
      return true;
    }
    case 'lineadd': { const l = lineOf(+a); if (l) { const err = addTrainToLine(l); if (err) { toast('Can\'t add a train: ' + err, 'bad'); sfx('err'); } else toast('🚂 Another train joined the line', 'good'); } return true; }
    case 'scan': { const msg = scan(a); toast(msg, 'good'); sfx('click'); closeModal(); return true; }
    case 'analyse': { const err = analyseDrive(); if (err) { toast(err, 'bad'); sfx('err'); } else sfx('craft'); return true; }
    case 'pickalt': pickAlt(a); return true;
    case 'loot': { if (pendingSite) { const err = lootSite(pendingSite); if (err) { toast(err, 'bad'); sfx('err'); } else { toast(`🛸 Looted! <b>+1 Hard Drive</b>${pendingSite.shards ? ` and <b>+${pendingSite.shards} Power Shard${pendingSite.shards > 1 ? 's' : ''}</b>` : ''}. Press <kbd>U</kbd> to research it.`, 'big'); closeModal(); } } return true; }
    case 'buytruck': if (e) { const others = truckStations().filter(o => o !== e); const tgt = G.ents.get(e.truckTo) || others[0] || null; const err = buyTruck(e, tgt); if (err) { toast(err, 'bad'); sfx('err'); } else toast(`🚚 A truck is on its way${tgt ? ` between <b>${esc(e.name)}</b> and <b>${esc(tgt.name)}</b>` : ''}!`, 'good'); } return true;
    case 'kremove': if (k) { removeTruck(k); view.inspectTruck = null; } return true;
    case 'ksched': if (k) { const tgt = G.ents.get(+a); if (tgt && !k.sched.includes(tgt.id)) k.sched.push(tgt.id); } return true;
    case 'kdel': if (k) { k.sched.splice(+a, 1); if (k.si >= k.sched.length) k.si = 0; k.state = 'idle'; k.retryT = 0; } return true;
    case 'travel': { const p = travelPoints()[+a]; if (p && fastTravelAllowed()) { flyTo(p.x, p.y); closeModal(); toast(`🧭 ${esc(p.name)}`, ''); sfx('click'); } return true; }
    case 'dn': S.dayNight = !S.dayNight; sfx('click'); toast(S.dayNight ? '🌙 Day/night cycle on' : '☀️ Day/night cycle off (always daytime)', ''); return true;
  }
  return false;
}
/** extra form inputs; returns true if handled */
export function extraInput(k: string, _a: string, el: HTMLInputElement, ev: Event): boolean {
  const e = view.inspect as Ent | null, t = view.inspectTruck as Truck | null;
  if (k === 'plitem') { pl.item = el.value; rerender(); return true; }
  if (k === 'plrate') { const v = parseFloat(el.value); if (v > 0 && ev.type === 'change') { pl.rate = v; rerender(); } else if (v > 0) pl.rate = v; return true; }
  if (k === 'truckTo' && e) { e.truckTo = +el.value; return true; }
  if (k === 'kname' && t) { t.name = el.value || t.name; return true; }
  if (k === 'kstop' && t && el.value && ev.type === 'change') { t.sched.push(+el.value); if (t.state === 'noschedule' || t.state === 'nopath') { t.state = 'idle'; t.retryT = 0; } sfx('click'); return true; }
  return false;
}
let rerender = () => { };
export function setRerender(f: () => void) { rerender = f; }

// ---------------------------------------------------------------------------
// Inspector extras
export function stationExtra(e: Ent): string {
  const lines = G.S.lines.filter(l => l.a === e.id || l.b === e.id);
  if (!lines.length) return '';
  let h = '<div class="sec">🛤 Lines</div>';
  for (const l of lines) {
    const o = G.ents.get(l.a === e.id ? l.b : l.a);
    h += `<div class="row">⇄ ${o ? esc(o.name) : '?'} · ${lineTrains(l).length} train${lineTrains(l).length === 1 ? '' : 's'} <button class="mini go" data-act="lineadd:${l.id}">+ Train</button></div>`;
  }
  return h + `<div class="sm">Loops are one-way, so trains follow each other safely. Cost per train: ${costHTML({ ...BLD.locomotive.cost })} + wagon.</div>`;
}
export function outpostStatic(e: Ent): string {
  let h = `<div class="sec">Name</div><input type="text" value="${esc(e.name)}" data-input="name" maxlength="24" style="width:100%">`;
  h += `<div class="sm" style="margin-top:6px">Gives ${BLD.outpost.mw} MW of free power inside its area and wires to nearby poles. ${fastTravelAllowed() ? 'Press <kbd>O</kbd> to fast-travel between your HUB and Outposts.' : 'Fast travel is off in Hard mode.'}</div>`;
  return h;
}
export function tstationStatic(e: Ent): string {
  let h = `<div class="sec">Name</div><input type="text" value="${esc(e.name)}" data-input="name" maxlength="24" style="width:100%">`;
  h += `<div class="sec">Mode</div><div class="row"><button class="${e.mode === 'load' ? 'go' : ''}" data-act="mode:load">⬆ Load trucks</button><button class="${e.mode === 'unload' ? 'go' : ''}" data-act="mode:unload">⬇ Unload trucks</button></div>`;
  const others = truckStations().filter(o => o !== e);
  h += '<div class="sec">🚚 Buy a truck</div>';
  if (!others.length) h += '<div class="sm">Place a second Truck Station, then buy a truck here to drive between them.</div>';
  else {
    const sel = e.truckTo && others.some(o => o.id === e.truckTo) ? e.truckTo : others[0].id;
    h += `<select data-input="truckTo" style="width:100%">${others.map(o => `<option value="${o.id}" ${o.id === sel ? 'selected' : ''}>to ${esc(o.name)} (${Math.round(Math.hypot(o.x - e.x, o.y - e.y))} tiles)</option>`).join('')}</select>`;
    h += `<div class="row" style="margin-top:6px"><button class="go" data-act="buytruck">Buy truck</button><span class="sm">${costHTML(BLD.truck.cost)}</span></div>`;
    h += `<div class="sm">Trucks carry ${TRUCK_CAP} items, drive around buildings, mountains and water, and don't need track.</div>`;
  }
  return h;
}
export function tstationDyn(e: Ent): string {
  const tr = G.trucks.filter(t => t.sched.includes(e.id));
  let h = `<div class="sm">${tr.length ? 'Served by ' + tr.map(t => esc(t.name)).join(', ') : 'No trucks visit this station yet.'}</div>`;
  if (!e.pnet) h += '<div class="neg sm">Needs power to load/unload.</div>';
  return h;
}
export function truckStatic(t: Truck): string {
  let h = `<div class="ih"><div class="it">🚚 Truck</div><button class="x" data-act="closeInsp">✕</button></div>`;
  h += `<input type="text" value="${esc(t.name)}" data-input="kname" maxlength="24" style="width:100%"><div id="idyn"></div>`;
  h += '<div class="sec">Route</div>';
  t.sched.forEach((sid, i) => { const s = G.ents.get(sid); h += `<div class="stop"><span class="sn">${i + 1}. ${s ? esc(s.name) + (s.mode === 'load' ? ' ⬆' : ' ⬇') : '?'}</span><button class="mini" data-act="kdel:${i}">✕</button></div>`; });
  h += `<select data-input="kstop" style="width:100%;margin-top:4px"><option value="">+ Add a truck station…</option>${truckStations().map(s => `<option value="${s.id}">${esc(s.name)} (${s.mode})</option>`).join('')}</select>`;
  h += '<div class="ibtns"><button class="danger" data-act="kremove">Remove truck</button></div>';
  return h;
}
export function truckDyn(t: Truck): string {
  const st = G.ents.get(t.sched[t.si]);
  let h = `<div class="row">${status(vehLed(t.state), t.state === 'nopath' ? 'No route! Is the station walled in?' : stTxt[t.state] || t.state)}</div>`;
  if (st) h += `<div class="sm">Next: ${esc(st.name)} · ${fmtR(t.v)} tiles/s</div>`;
  h += `<div class="row">Cargo ${fmt(t.tot)} / ${fmt(TRUCK_CAP)}</div><div class="bar"><i style="width:${t.tot / TRUCK_CAP * 100}%"></i></div><div class="chips">`;
  for (const kk in t.cargo) h += `<span class="chip">${ic(kk, 18)}${fmt(t.cargo[kk])}</span>`;
  return h + '</div>';
}
export { CRYSTAL_NAMES };
