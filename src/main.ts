import { audioInit, audioTick, setAmbience, setMusicState, sfx, startMusic } from './audio';
import { nightness } from './daynight';
import { BLD, ITEMS, Milestone, RECIPES } from './data';
import { buildAtlas, iconHooks } from './atlas';
import { applyDayNight, C, initCore, resizeCore, rotateCamera, updateCamera } from './r3/core';
import { initDiscovery, tickExplore } from './explore';
import { tickAchievements } from './achievements';
import * as TK from './trucks';
import * as EX from './explore';
import * as PL from './planner';
import * as TER from './terrain';
import * as DATA from './data';
import { buildTerrain, T3, terrainTick, terrainTileChanged } from './r3/terrain3d';
import { icon3D, init3D, Label3, reset3D, update3D } from './r3/world3d';
import { hexCol, rgba } from './gl';
import { chopFx, initInput, mineFx, pasteFx, setTool, tickInput, updateGhosts } from './input';
import { clearTeams, isMine, MP } from './teams';
import { connect, disconnect, netStep, NET, NetHandlers, setStepper, ticksAvailable } from './net';
import { fmtCode } from './online';
import * as OUI from './ui3';
import { setDeliverFx, setOnMilestone, unlockName } from './progress';
import { addFrame, loadWorld, newSlotId, saveGame, slot } from './save';
import { hideTitle, initTitle, NewWorldOpts, setInvite, showTitle, title } from './title';
import { normCode } from './codes';
import { ensureFresh, resetStats, update } from './sim';
import { HX, HY } from './terrain';
import * as UI from './ui';
import { $ } from './util';
import { parts, spawn, updParts, view, w2s } from './view';
import { Ent, G, newWorld } from './world';
import * as W_ from './world';
import * as SIM from './sim';
import * as TR from './trains';
import * as INP from './input';
import * as CMD from './cmd';
import * as TEAMS from './teams';
import * as SAVE from './save';
import * as PR from './progress';
import * as DR from './r3/world3d';
import * as CORE from './r3/core';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ov = document.getElementById('ov') as HTMLCanvasElement;
const octx = ov.getContext('2d')!;

function resize() {
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  view.cw = innerWidth; view.ch = innerHeight;
  resizeCore(view.cw, view.ch, view.dpr);
  canvas.style.width = view.cw + 'px'; canvas.style.height = view.ch + 'px';
  ov.width = Math.round(view.cw * view.dpr); ov.height = Math.round(view.ch * view.dpr);
  ov.style.width = view.cw + 'px'; ov.style.height = view.ch + 'px';
}

function setupFx() {
  // messages from the simulation only reach the team they're about (online worlds have several)
  G.fx.toast = (h, k) => { if (isMine()) UI.toast(h, k); };
  G.fx.sfx = n => { if (isMine()) sfx(n); };
  G.fx.chop = (x, y, n) => { if (isMine()) chopFx(x, y, n); };
  G.fx.ui = (k, o) => {
    if (k === 'train') { setTool(null); UI.openTrain(o); }
    else if (k === 'removed') { if (view.inspect === o) UI.closeInspect(); }
    else if (k === 'vremoved') { if (view.inspectTrain === o || view.inspectTruck === o || view.inspectShip === o) UI.closeInspect(); }
    else if (k === 'pasted') pasteFx(o);
    else if (k === 'mined') mineFx(o);
  };
  G.fx.tile = (x, y) => terrainTileChanged(x, y);
  G.fx.placed = (e: Ent) => {
    const s = Math.max(e.w, e.h);
    if (s < 2) return;
    for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI * 2; spawn(e.x + e.w / 2 + Math.cos(a) * s * 0.55, e.y + e.h / 2 + Math.sin(a) * s * 0.55, { vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6, life: 0.45, col: hexCol('#b9b2a0'), size: 0.1 }); }
  };
  G.fx.removed = (e: Ent) => {
    const c = hexCol(BLD[e.type].col);
    for (let i = 0; i < (e.w > 1 ? 14 : 4); i++) spawn(e.x + Math.random() * e.w, e.y + Math.random() * e.h, { vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: 2 + Math.random() * 3, z: 0.5, life: 0.7, col: c, size: 0.12, grav: 12 });
  };
  let lastDel = 0;
  setDeliverFx((e: Ent, item: string) => {
    if (!isMine()) return;
    sfx('deliver');
    const now = performance.now();
    if (now - lastDel < 90) return;
    lastDel = now;
    spawn(e.x + e.w / 2 + (Math.random() - 0.5) * e.w * 0.6, e.y + e.h / 2, { z: 1.2, vz: 1.6, vx: (Math.random() - 0.5) * 0.4, life: 1, spr: 'i:' + item, size: 0.5, vr: 0, rot: 0 });
  });
  let shownTier = -1;
  setOnMilestone((m: Milestone) => {
    if (!isMine()) return;
    sfx('milestone');
    if (shownTier < 0) shownTier = G.S.flags.shownTier ?? 0;
    const tierUp = G.S.maxTier > (G.S.flags.shownTier ?? 0);
    G.S.flags.shownTier = G.S.maxTier;
    if (tierUp) setTimeout(() => sfx('tier'), 500);
    UI.showUnlocks(m, tierUp);
    const src = (m.phase ? G.L.elevator : null) || G.L.hub;
    if (src) {
      const cols = ['#f5a524', '#4cc38a', '#4ea1ff', '#ef5b5b', '#c77dff', '#ffffff'].map(c => hexCol(c));
      for (let i = 0; i < (m.phase ? 180 : 90); i++) { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 8; spawn(src.x + src.w / 2, src.y + src.h / 2, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 1.5, vz: 5 + Math.random() * 6, life: 1.6 + Math.random(), col: cols[i % cols.length], size: 0.14, grav: 9 }); }
    }
    if (m.win) { if (slot.id) addFrame(slot.id, UI.snapshotOverlay()); setTimeout(() => UI.openModal('win'), 1500); }
    UI.renderHotbar();
    saveGame();
  });
}

const loadingEl = () => $('#loading');
function setLoading(msg: string | null) {
  const el = loadingEl();
  if (msg === null) { el.classList.add('hidden'); return; }
  el.innerHTML = `<div class="logo">BELTWORKS</div><div>${msg}</div>`;
  el.classList.remove('hidden');
}
function afterWorldReady() {
  resetStats();
  view.level = 0; C.focusY = 0;
  initDiscovery();
  buildTerrain(); reset3D();
  UI.buildMapBase();
  ensureFresh();
  UI.closeInspect(); UI.closeModal();
  UI.renderHotbar();
}
async function enterWorld(fn: () => Promise<boolean> | boolean, isNew: boolean, msg: string) {
  hideTitle(); document.body.classList.remove('intitle');
  setLoading(msg);
  await new Promise(r => setTimeout(r, 40));
  let ok = false;
  try { ok = await fn(); } catch (e) { console.error(e); }
  if (!ok) { setLoading(null); UI.toast('Could not load that world', 'bad'); openTitle(); return; }
  afterWorldReady();
  setLoading(null);
  if (isNew) UI.startOnboarding();
  else UI.toast(`Welcome back to <b>${G.S.name}</b>`, 'good');
}
function createWorld(o: NewWorldOpts) {
  enterWorld(async () => {
    newWorld((Math.random() * 1e9) | 0, o);
    SIM.hist.s = [];
    view.cam.x = HX + 2; view.cam.y = HY + 2; view.cam.s = 30;
    slot.id = newSlotId();
    await saveGame();
    return true;
  }, true, o.size > 4000 ? 'Generating an enormous world… (this takes about a minute)' : o.size > 1500 ? 'Generating a huge world… (this takes a few seconds)' : 'Generating your world…');
}
/** join (or create) an online world */
function playOnline(o: { code?: string; create?: any }) {
  hideTitle(); document.body.classList.remove('intitle');
  setLoading(o.create ? 'Creating your server…' : 'Connecting…');
  slot.id = null;
  let entered = false;
  setStepper(update);
  netTries = 0;
  const code = o.code;
  const rejoin = () => { playOnlineAgain(code || NET.code, h); };
  const h = {
    progress: msg => { if (!entered) setLoading(msg); },
    ready: () => {
      entered = true;
      afterWorldReady();
      setLoading(null);
      const inf = MP.info.get(MP.myTeam);
      if (inf) { view.cam.x = inf.hx + 2; view.cam.y = inf.hy + 2; view.cam.s = 30; }
      OUI.netHud();
      UI.toast(`🌐 Welcome to <b>${G.S.name}</b> — join code <b>${fmtCode(NET.code)}</b>. Use <b>📋 Invite</b> at the top to bring friends.`, 'big');
      if (!G.S.flags.tutDone) UI.startOnboarding();
    },
    reloaded: () => { initDiscovery(); reset3D(); ensureFresh(); UI.buildMapBase(); },
    error: msg => {
      if (!entered) { setLoading(null); openTitle(); setTimeout(() => UI.toast(msg, 'bad'), 50); return; }
      if (NET.outdated) { OUI.showDisconnected(msg, () => location.reload(), 'Reload now'); return; }
      // the connection dropped (the relay restarts when it's updated): quietly rejoin a few times before giving up
      if (netTries < 4) {
        netTries++;
        OUI.showReconnecting(true);
        setTimeout(() => { if (NET.on) return; rejoin(); }, 1500 * netTries);
      } else { OUI.showReconnecting(false); OUI.showDisconnected(msg, () => { exitToTitle(); }); }
    },
    players: () => OUI.refreshPlayers(),
    chat: c => OUI.chatMessage(c),
    invite: m => OUI.showInvite(m),
  } as NetHandlers;
  connect(o, h);
}
let netTries = 0;
/** reconnect to the same world after a dropped connection (keeps the loaded terrain) */
function playOnlineAgain(code: string, h: NetHandlers) {
  const ready = h.ready;
  connect({ code }, { ...h, progress: () => { }, ready: () => { netTries = 0; OUI.showReconnecting(false); h.reloaded(); G.fx.toast('🔌 Reconnected', 'good'); void ready; } }, true);
}
function openTitle() {
  document.body.classList.add('intitle');
  view.marker = null; view.ghosts = [];
  UI.closeInspect(); UI.closeModal();
  showTitle({
    play: (id) => enterWorld(() => loadWorld(id), false, 'Loading world…'),
    create: createWorld,
    online: playOnline,
    imported: () => { afterWorldReady(); hideTitle(); document.body.classList.remove('intitle'); UI.toast('Save imported as a new world', 'good'); },
  });
}
async function exitToTitle() {
  if (NET.on || NET.ready) { disconnect(); clearTeams(); }
  if (slot.id) await saveGame();
  slot.id = null;
  openTitle();
}

let last = 0, acc = 0, saveT = 0, dbgT = 1e7, simErr = false, ambT = 0;
let fly: null | { x0: number; y0: number; x1: number; y1: number; t: number } = null;
function flyTo(x: number, y: number) { fly = { x0: view.cam.x, y0: view.cam.y, x1: x, y1: y, t: 0 }; if (view.cam.s < 22) view.cam.s = 26; }
let lastFrameAt = 0;
function frame(ms: number) {
  lastFrameAt = performance.now();
  // an online world is loading / catching up in the background: don't draw half-built state
  if (NET.loading && !NET.ready) { last = ms / 1000; requestAnimationFrame(frame); return; }
  const now = ms / 1000;
  let dt = now - last; last = now;
  if (dt > 0.1) dt = 0.1; if (dt < 0) dt = 0;
  G.realNow = now;
  tickInput(dt);
  if (fly) { fly.t = Math.min(1, fly.t + dt * 1.6); const e = fly.t < 0.5 ? 2 * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 2) / 2; view.cam.x = fly.x0 + (fly.x1 - fly.x0) * e; view.cam.y = fly.y0 + (fly.y1 - fly.y0) * e; if (fly.t >= 1) fly = null; }
  // fixed-step simulation
  const step = 1 / 60;
  if (title.open) { rotateCamera(dt * 0.04); acc = 0; }
  let n = 0;
  if (NET.on) {
    // online: run the ticks the server has finished, keeping a small buffer; catch up quickly if behind
    if (NET.ready && !title.open) {
      acc += dt;
      const avail = ticksAvailable(), max = avail > 30 ? 40 : 8;
      while ((acc >= step || ticksAvailable() > 12) && n < max) {
        let ok = false;
        try { ok = netStep(update); } catch (err) { if (!simErr) { simErr = true; console.error('simulation error', err); } NET.tick++; ok = true; }
        if (!ok) { acc = Math.min(acc, step * 2); break; }
        acc = Math.max(0, acc - step); n++;
      }
    }
  } else {
    acc += title.open ? 0 : dt * G.S.speed;
    while (acc >= step && n < 8 * G.S.speed) {
      try { update(step); } catch (err) { if (!simErr) { simErr = true; console.error('simulation error', err); } }
      acc -= step; n++;
    }
    if (n >= 8 * G.S.speed) acc = 0;
  }
  updParts(dt);
  for (const e of G.L.machines) if (e.pop > 0) e.pop = Math.max(0, e.pop - dt * 5);
  if (view.inspect && view.inspect.pop > 0) view.inspect.pop = Math.max(0, view.inspect.pop - dt * 5);
  updateGhosts();
  const labels: Label3[] = [];
  applyDayNight();
  updateCamera();
  if (!title.open) { tickExplore(dt, C.dist); tickAchievements(dt, a => { UI.toast(`🏆 Achievement unlocked: <b>${a.n}</b> — ${a.d}`, 'big'); sfx('tier'); }); }
  update3D(G.S.time, now, dt, labels);
  terrainTick(dt, now);
  C.renderer.render(C.scene, C.camera);
  // text overlay
  octx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  octx.clearRect(0, 0, view.cw, view.ch);
  for (const L of labels) {
    const [sx, sy] = w2s(L.x, L.y, L.z), t = L.t, c = L.c;
    if (sx < -200 || sy < -50 || sx > view.cw + 200 || sy > view.ch + 50) continue;
    const size = 13;
    octx.font = `600 ${size}px Segoe UI, system-ui, sans-serif`;
    octx.textAlign = 'center';
    octx.textBaseline = 'bottom';
    octx.fillStyle = 'rgba(0,0,0,.7)'; octx.fillText(t, sx + 1, sy + 1);
    octx.fillStyle = c; octx.fillText(t, sx, sy);
  }
  if (!title.open) UI.uiTick(dt);
  // real play time + a timelapse frame every 3 minutes
  if (!title.open && G.S && slot.id) {
    G.S.playT = (G.S.playT ?? G.S.time) + dt;
    const nf = G.S.flags.nextFrame ?? 10;
    if (G.S.playT >= nf) { G.S.flags.nextFrame = G.S.playT + 180; addFrame(slot.id, UI.snapshotOverlay()); }
  }
  // sound: ambience from what's around the camera, music from progress
  ambT += dt;
  if (ambT > 0.25 && G.tiles) {
    ambT = 0;
    const Wn = Math.round(Math.sqrt(G.tiles.length)), R = Math.min(70, C.dist * 0.7 + 10);
    let n = 0, water = 0, forest = 0, desert = 0, hills = 0;
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      const x = Math.floor(view.cam.x + i * R / 4), y = Math.floor(view.cam.y + j * R / 4);
      if (x < 0 || y < 0 || x >= Wn || y >= Wn) { water++; n++; continue; }
      const t = G.tiles[y * Wn + x]; n++;
      if (t === 4 || t === 5) water++; else if (t === 1 || G.trees[y * Wn + x]) forest++; else if (t === 2) desert++; else if (t === 3 || t === 6) hills++;
    }
    let busy = 0;
    if (G.L) for (const e of G.L.machines) if (e.st === 'work' && Math.abs(e.x - view.cam.x) < R && Math.abs(e.y - view.cam.y) < R) busy++;
    const night = G.S ? nightness() : 0;
    setAmbience({ wind: Math.min(1, hills / n * 1.6 + C.dist / 400), water: Math.min(1, water / n * 1.8), forest: forest / n, desert: desert / n, night, factory: Math.min(1, busy / 12) * (C.dist < 120 ? 1 : 0.3) });
    setMusicState(title.open ? 0 : G.S.maxTier, night);
  }
  audioTick();
  saveT += dt;
  if (saveT > 30) { saveT = 0; if (slot.id && !title.open) saveGame(); }
  requestAnimationFrame(frame);
}

async function boot() {
  const load = $('#loading');
  try {
    initCore(canvas);
    buildAtlas();
    init3D();
    iconHooks.building = icon3D;
  } catch (e) {
    console.error(e);
    load.innerHTML = '<div>Sorry — this game needs WebGL2 (any modern Chrome, Edge or Firefox).</div>';
    return;
  }
  resize();
  addEventListener('resize', resize);
  setupFx();
  await new Promise(r => setTimeout(r, 30));
  // a small scenic world behind the title screen (never saved)
  slot.id = null;
  newWorld(424242, { size: 512, mode: 'easy', name: 'Backdrop' });
  view.cam.x = HX + 2; view.cam.y = HY + 2; view.cam.s = 14;
  afterWorldReady();
  UI.setNewGameHandler(exitToTitle);
  UI.setFlyTo(flyTo);
  UI.setOnLoaded(() => { afterWorldReady(); });
  initInput(canvas);
  UI.initUI();
  initTitle();
  // opened from an invite link (…/beltworks/?join=K7QM2XRP)?
  try { const j = normCode(new URLSearchParams(location.search).get('join') || ''); if (j) { setInvite(j); history.replaceState(null, '', location.pathname); } } catch { }
  load.classList.add('hidden');
  openTitle();
  addEventListener('beforeunload', () => { if (slot.id) saveGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && slot.id) saveGame(); });
  requestAnimationFrame(t => { last = t / 1000; requestAnimationFrame(frame); });
  // online worlds keep ticking while this tab is in the background (animation frames stop there)
  setInterval(() => {
    if (!NET.ready || (!document.hidden && performance.now() - lastFrameAt < 500)) return;
    const t0 = performance.now();
    while (ticksAvailable() > 0 && performance.now() - t0 < 250) { try { netStep(update); } catch (err) { console.error(err); NET.tick++; } }
  }, 1000);
  (window as any).G = G; // debugging aid
  (window as any).BW = { frame: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { dbgT += dt * 1000; frame(dbgT); } }, T3, PL, DATA, TER, G, W: W_, SIM, TR, TK, EX, INP, PR, UI, view, DR, CORE, CMD, TEAMS, SAVE, NET };
}
boot();
export { audioInit, ITEMS, parts, rgba };
