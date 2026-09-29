import { audioInit, sfx, startMusic } from './audio';
import { BLD, CATS, Cost, isFluid, ITEMS, MILESTONES, RECIPES } from './data';
import { hexCol, rgba } from './gl';
import { ensureFresh, fluidsTouching, setRecipe } from './sim';
import { H, W } from './terrain';
import { canPlaceTrain, placeTrain, removeTrain, trainAt } from './trains';
import { removeTruck, truckAt } from './trucks';
import { removeShip, shipAt } from './ships';
import { collectCrystal, featNear, locateHome } from './explore';
import { openSite, plannerAllowed } from './ui2';
import { clampCam, s2w, sd2w, spawn, updMouseWorld, view } from './view';
import { pickAt, poleReachT } from './r3/world3d';
import { rotateCamera, tiltCamera } from './r3/core';
import { title } from './title';
import { addInv, canAfford, canPlace, canRemove, chopTree, def, dims, Ent, entAt, floorBlocked, G, groundOnly, hasFloor, inPort, LH, NL, PORTED, setFloor, markDirty, missingText, nodeAt, pairBit, PAIRS, pay, place, refund, remove, rotateEnt, rotatePairs } from './world';
import * as UI from './ui';
import { online, railPairsForPath, run, tileFree as tileFreeZ } from './cmd';
import { DX, DY } from './util';

// ---------------------------------------------------------------------------
export interface BP { name: string; w: number; h: number; ents: any[] }
export const tool: { t: any } = { t: null }; // {k:'build',type,recipe?,clock?} | {k:'decon'} | {k:'bpsel',quick?} | {k:'paste',bp,prot}
export let rot = 0;
let drag: null | { sx: number; sy: number; axis: 'h' | 'v' | null; kind: string } = null;
let panning = false, panStart = { x: 0, y: 0, cx: 0, cy: 0, moved: false }, rotating = false, rotX = 0, rotY = 0;
let lmb = false, mining: any = null, mineT = 0, lastPlaced: string | null = null;
const keys = new Set<string>();
export let clipboard: BP | null = null;
export let curCat = 0;

export function setTool(t: any) {
  tool.t = t; drag = null; lastPlaced = null;
  view.showPower = !!(t && t.k === 'build' && (BLD[t.type].power || BLD[t.type].kind === 'pole' || BLD[t.type].kind === 'gen'));
  UI.renderHotbar(); UI.updateHint();
}
export function setCat(i: number) { curCat = (i + CATS.length) % CATS.length; UI.renderHotbar(); }
export function bestOf(entry: string | string[]) {
  if (typeof entry === 'string') return entry;
  return entry.find(t => G.S.unlocked.has(t)) || entry[entry.length - 1];
}
export function selectType(type: string) {
  if (!G.S.unlocked.has(type)) {
    const m = MILESTONES.find(m => m.un && m.un.includes(type));
    sfx('err'); UI.toast(`🔒 ${BLD[type].n} unlocks with "${m ? m.n : 'the Shop'}"${m ? ` (Tier ${m.tier})` : ''}`, 'bad'); return;
  }
  if (tool.t && tool.t.k === 'build' && tool.t.type === type) { setTool(null); return; }
  sfx('click');
  setTool({ k: 'build', type });
  if (BLD[type].kind === 'foundation' && view.level === 0) setLevel(1);
  else if (view.level > 0 && groundOnly(type)) { setLevel(0); setTool({ k: 'build', type }); }
}
export function selectSlot(i: number) {
  const entry = CATS[curCat].types[i];
  if (!entry) return;
  selectType(bestOf(entry));
}

/** entity on the active floor */
const at = (x: number, y: number) => entAt(x, y, view.level);
export function setLevel(n: number) {
  n = Math.max(0, Math.min(NL - 1, n));
  if (n === view.level) return;
  view.level = n; G.rev++; drag = null;
  if (tool.t && tool.t.k === 'build' && n > 0 && groundOnly(tool.t.type) && BLD[tool.t.type].kind !== 'foundation') setTool(null);
  sfx('click');
  UI.toast(n === 0 ? '⬇ Ground floor' : `⬆ Floor ${n}${G.floorN ? '' : ' — lay Foundations (Floors tab) to build up here'}`, '');
}

// ---------------------------------------------------------------------------
// Paths (L-shaped drags)
function dragPath(): { x: number; y: number; d: number }[] {
  const m = view.mouse, { sx, sy } = drag!, ex = m.tx, ey = m.ty, dx = ex - sx, dy = ey - sy;
  if (dx === 0 && dy === 0) return [{ x: sx, y: sy, d: rot }];
  let axis = drag!.axis || (Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v');
  const hd = dx > 0 ? 0 : 2, vd = dy > 0 ? 1 : 3, gx = Math.sign(dx), gy = Math.sign(dy);
  // never start by running back into the building whose output we're dragging from
  if (dx !== 0 && dy !== 0) {
    const first = axis === 'h' ? hd : vd, back = at(sx + DX[first], sy + DY[first]);
    if (back && BLD[back.type].kind !== 'belt' && BLD[back.type].kind !== 'pipe' && BLD[back.type].kind !== 'rail') axis = axis === 'h' ? 'v' : 'h';
  }
  const pts: { x: number; y: number; d: number }[] = [];
  if (axis === 'h') {
    for (let i = 0; i <= Math.abs(dx); i++) pts.push({ x: sx + gx * i, y: sy, d: (i < Math.abs(dx) || dy === 0) ? hd : vd });
    for (let j = 1; j <= Math.abs(dy); j++) pts.push({ x: ex, y: sy + gy * j, d: vd });
  } else {
    for (let j = 0; j <= Math.abs(dy); j++) pts.push({ x: sx, y: sy + gy * j, d: (j < Math.abs(dy) || dx === 0) ? vd : hd });
    for (let i = 1; i <= Math.abs(dx); i++) pts.push({ x: sx + gx * i, y: ey, d: hd });
  }
  if (pts.length > 400) pts.length = 400;
  if (tool.t && tool.t.k === 'build' && BLD[tool.t.type].kind === 'belt') aimBeltEnd(pts[pts.length - 1]);
  return pts;
}
/** if a belt ends on a building's input (or beside the HUB / Space Elevator), turn its last tile to feed into it */
function aimBeltEnd(p: { x: number; y: number; d: number }) {
  // does building e take a belt coming in from tile (x,y)?
  const feeds = (e: Ent | null, x: number, y: number) => {
    if (!e) return false;
    const k = BLD[e.type].kind;
    if (k === 'hub' || k === 'elevator') return true;
    if (k === 'merger') return !(e.x + DX[e.rot] === x && e.y + DY[e.rot] === y);
    if (PORTED.has(k)) { const ip = inPort(e); return ip[0] === x && ip[1] === y; }
    return false;
  };
  if (feeds(at(p.x + DX[p.d], p.y + DY[p.d]), p.x, p.y)) return;
  for (let d = 0; d < 4; d++) if (feeds(at(p.x + DX[d], p.y + DY[d]), p.x, p.y)) { p.d = d; return; }
}
const tileFree = (x: number, y: number, kind: string) => tileFreeZ(x, y, kind, view.level);
function pathCost(type: string, n: number): Cost { const c: Cost = {}; for (const k in BLD[type].cost) c[k] = BLD[type].cost[k] * n; return c; }

function commitDrag() {
  const t = tool.t, d = BLD[t.type], path = dragPath();
  run({ k: 'drag', type: t.type, z: view.level, path: path.map(p => [p.x, p.y, p.d]) });
  if (path.length > 1 && d.kind !== 'pipe') rot = path[path.length - 1].d;
  drag = null;
}

function ghostPos(type: string): [number, number] {
  const m = view.mouse, d = BLD[type];
  const [w, h] = dims(type, rot);
  if (d.on && d.on !== 'water') {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const n = nodeAt(m.tx + i, m.ty + j);
      if (n && ((d.on === 'node' && n.res !== 'crude_oil' && n.res !== 'geyser') || (d.on === 'oil' && n.res === 'crude_oil') || (d.on === 'geyser' && n.res === 'geyser'))) return [n.x, n.y];
    }
  }
  return [Math.round(m.wx - w / 2), Math.round(m.wy - h / 2)];
}
function tryPlace(loud: boolean) {
  const t = tool.t;
  const [x, y] = ghostPos(t.type);
  const key = x + ',' + y;
  if (key === lastPlaced) return;
  const reason = canPlace(t.type, x, y, rot, { z: view.level });
  if (reason) { if (loud) { UI.toast(reason, 'bad'); sfx('err'); } return; }
  lastPlaced = key;
  run({ k: 'place', type: t.type, x, y, rot, z: view.level, loud, recipe: t.recipe || undefined, clock: t.clock, filt: t.filt, mode: t.mode });
}

// ---------------------------------------------------------------------------
// Rail signals live on rail tiles
function placeSignal(x: number, y: number, sig: number, type: string) {
  if (view.level !== 0) { UI.toast('Put signals on a railway tile', 'bad'); sfx('err'); return; }
  run({ k: 'signal', x, y, sig, type });
}

// ---------------------------------------------------------------------------
// Foundations / deconstruct
function layFoundations(x0: number, y0: number, x1: number, y1: number) { run({ k: 'found', x0, y0, x1, y1, z: view.level }); }
function deconRect(x0: number, y0: number, x1: number, y1: number) { run({ k: 'decon', x0, y0, x1, y1, z: view.level }); }

// ---------------------------------------------------------------------------
// Blueprints
export function captureBP(x0: number, y0: number, x1: number, y1: number): BP | null {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const ents: any[] = [];
  const seen = new Set<Ent>();
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const e = at(x, y);
    if (!e || seen.has(e)) continue;
    seen.add(e);
    const d = def(e);
    if (d.kind === 'hub' || d.kind === 'elevator') continue;
    if (e.x < xa || e.y < ya || e.x + e.w - 1 > xb || e.y + e.h - 1 > yb) continue;
    const o: any = { t: e.type, x: e.x - xa, y: e.y - ya, r: e.rot };
    if (e.recipe) o.rc = e.recipe;
    if (e.pairs) o.pr = e.pairs;
    if (e.filt) o.fl = [...e.filt];
    if (e.mode) o.md = e.mode;
    if (e.isExit) o.ex = 1;
    if (e.clock !== undefined && e.clock < 1) o.ck = e.clock;
    ents.push(o);
  }
  if (!ents.length) return null;
  return { name: '', w: xb - xa + 1, h: yb - ya + 1, ents };
}
function rotBP(bp: BP, times: number): BP {
  let cur = bp;
  for (let k = 0; k < (times & 3); k++) {
    const ents = cur.ents.map(o => {
      const d = BLD[o.t];
      const [w, h] = o.r & 1 ? [d.h, d.w] : [d.w, d.h];
      const n = { ...o, x: cur.h - (o.y + h), y: o.x, r: d.noRotate ? 0 : (o.r + 1) & 3 };
      if (o.pr) n.pr = rotatePairs(o.pr, 1);
      return n;
    });
    cur = { name: cur.name, w: cur.h, h: cur.w, ents };
  }
  return cur;
}
export function bpCost(bp: BP): Cost {
  const c: Cost = {};
  for (const o of bp.ents) for (const k in BLD[o.t].cost) c[k] = (c[k] || 0) + BLD[o.t].cost[k];
  return c;
}
function pasteOrigin(bp: BP): [number, number] { const m = view.mouse; return [m.tx - Math.floor(bp.w / 2), m.ty - Math.floor(bp.h / 2)]; }
function bpEntOK(o: any, ox: number, oy: number) {
  const d = BLD[o.t], x = ox + o.x, y = oy + o.y;
  if (!G.S.unlocked.has(o.t)) return false;
  if (view.level > 0 && groundOnly(o.t)) return false;
  if (d.kind === 'rail') return tileFree(x, y, 'rail');
  if (d.kind === 'belt') return tileFree(x, y, 'belt');
  if (d.kind === 'pipe') return tileFree(x, y, 'pipe');
  return !canPlace(o.t, x, y, o.r, { free: true, z: view.level });
}
function doPaste() {
  const t = tool.t, bp: BP = rotBP(t.bp, t.prot || 0);
  const [ox, oy] = pasteOrigin(bp);
  run({ k: 'paste', bp: { w: bp.w, h: bp.h, ents: bp.ents }, ox, oy, z: view.level });
}
/** sparkles where a blueprint landed */
export function pasteFx(o: { x: number; y: number; w: number; h: number }) {
  for (let i = 0; i < 30; i++) spawn(o.x + (Math.random() - 0.5) * o.w, o.y + (Math.random() - 0.5) * o.h, { vz: 1.5, z: 0.3, life: 0.6, size: 0.12, col: hexCol('#9fe0ff') });
}

// ---------------------------------------------------------------------------
// Ghosts (called every frame)
export function updateGhosts() {
  const g: any[] = [];
  view.sel = null;
  const t = tool.t, m = view.mouse;
  view.hover = null; view.powerPreview = null;
  if (!t || t.k === 'decon') {
    const e = pickAt(m.wx, m.wy);
    if (e && m.inCanvas && !panning) view.hover = e;
  }
  if (t && m.inCanvas) {
    if (t.k === 'build') {
      const d = BLD[t.type];
      if (d.kind === 'foundation') {
        const x0 = drag ? drag.sx : m.tx, y0 = drag ? drag.sy : m.ty;
        view.sel = { x0, y0, x1: m.tx, y1: m.ty, col: view.level ? rgba(0.85, 0.85, 0.8, 0.35) : rgba(1, 0.3, 0.3, 0.25) };
      } else if ((d.kind === 'belt' || d.kind === 'pipe' || d.kind === 'rail') && !d.dz) {
        const path = drag ? dragPath() : [{ x: m.tx, y: m.ty, d: rot }];
        const pairs = d.kind === 'rail' ? railPairsForPath(path) : null;
        path.forEach((p, i) => {
          const ok = tileFree(p.x, p.y, d.kind);
          const gh: any = { type: t.type, x: p.x, y: p.y, rot: p.d, ok };
          if (pairs) gh.pairs = pairs[i];
          g.push(gh);
        });
      } else if (d.kind === 'signal') {
        const r = view.level === 0 ? entAt(m.tx, m.ty) : null;
        g.push({ type: t.type, x: m.tx, y: m.ty, rot: 0, ok: !!r && r.type === 'rail' });
      } else if (d.kind === 'train') {
        const r = canPlaceTrain(m.tx, m.ty, rot);
        g.push({ type: 'locomotive', x: m.tx, y: m.ty, rot, ok: !r.err, cells: r.cells });
      } else {
        const [x, y] = ghostPos(t.type);
        const reason = canPlace(t.type, x, y, rot, { z: view.level });
        let isExit = false;
        if (d.kind === 'tunnel' || d.kind === 'ptunnel') {
          for (let k = 1; k <= d.range; k++) { const q = at(x - DX[rot] * k, y - DY[rot] * k); if (q && q.type === t.type) { isExit = q.rot === rot && !q.isExit && !q.pair; break; } }
        }
        g.push({ type: t.type, x, y, rot, ok: !reason, recipe: t.recipe, isExit, reason });
        if (d.kind === 'pole') {
          const [w, h] = dims(t.type, rot), cx = x + w / 2, cy = y + h / 2, R = poleReachT(t.type);
          const c: [number, number][] = [];
          for (const p of G.L.poles) {
            const px = p.x + p.w / 2, py = p.y + p.h / 2, dd = Math.hypot(px - cx, py - cy);
            if (dd <= Math.min(R, poleReachT(p.type)) && dd > 0.1) c.push([dd, p.id]);
          }
          c.sort((a, b) => a[0] - b[0]);
          const links = c.slice(0, 6).map(([, id]) => { const p = G.ents.get(id)!; return [p.x + p.w / 2 + (p.type === 'hub' ? 1.3 : 0), p.y + p.h / 2 - (p.type === 'hub' ? 1.3 : 0), p.type === 'hub' ? 3.7 : p.type === 'tower' ? 4.45 : p.type === 'pole2' ? 2.3 : 1.82]; });
          let nearest = Infinity;
          for (const p of G.L.poles) nearest = Math.min(nearest, Math.hypot(p.x + p.w / 2 - cx, p.y + p.h / 2 - cy) - Math.min(R, poleReachT(p.type)));
          view.powerPreview = { x: cx, y: cy, links, reach: R, ok: links.length > 0 };
          (view.powerPreview as any).tooFar = links.length ? 0 : Math.ceil(nearest);
        }
      }
    } else if (t.k === 'paste') {
      const bp = rotBP(t.bp, t.prot || 0), [ox, oy] = pasteOrigin(bp);
      for (const o of bp.ents) g.push({ type: o.t, x: ox + o.x, y: oy + o.y, rot: o.r, ok: bpEntOK(o, ox, oy), recipe: o.rc, pairs: o.pr, isExit: !!o.ex });
      view.sel = { x0: ox, y0: oy, x1: ox + bp.w - 1, y1: oy + bp.h - 1, col: rgba(0.4, 0.8, 1, 0.06) };
    } else if (t.k === 'decon' && drag) {
      view.sel = { x0: drag.sx, y0: drag.sy, x1: m.tx, y1: m.ty, col: rgba(1, 0.3, 0.3, 0.18) };
    } else if (t.k === 'bpsel' && drag) {
      view.sel = { x0: drag.sx, y0: drag.sy, x1: m.tx, y1: m.ty, col: rgba(0.4, 0.8, 1, 0.16) };
    } else if (t.k === 'decon' || t.k === 'bpsel') {
      const e = pickAt(m.wx, m.wy);
      if (e && t.k === 'decon') view.sel = { x0: e.x, y0: e.y, x1: e.x + e.w - 1, y1: e.y + e.h - 1, col: rgba(1, 0.3, 0.3, 0.25) };
      else view.sel = { x0: m.tx, y0: m.ty, x1: m.tx, y1: m.ty, col: t.k === 'decon' ? rgba(1, 0.3, 0.3, 0.2) : rgba(0.4, 0.8, 1, 0.2) };
    }
  }
  view.ghosts = g;
}
export function dragInfo() {
  const t = tool.t;
  if (!t || t.k !== 'build' || !drag) return null;
  const d = BLD[t.type];
  if (d.kind === 'foundation') {
    const m = view.mouse, xa = Math.min(drag.sx, m.tx), xb = Math.max(drag.sx, m.tx), ya = Math.min(drag.sy, m.ty), yb = Math.max(drag.sy, m.ty);
    let n = 0;
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (!floorBlocked(x, y, view.level)) n++;
    return { n, cost: pathCost(t.type, n) };
  }
  const path = dragPath();
  let n = 0;
  for (const p of path) { if (!tileFree(p.x, p.y, d.kind)) continue; const e = at(p.x, p.y); if (!e || (e.type !== t.type && d.kind !== 'rail')) n++; }
  return { n, cost: pathCost(t.type, n) };
}

// ---------------------------------------------------------------------------
function handMine(n: any) { run({ k: 'mine', x: n.x, y: n.y }); }
/** ore bits flying off a node you mined by hand */
export function mineFx(n: any) {
  sfx('mine');
  const c = hexCol(ITEMS[n.res].c);
  for (let i = 0; i < 6; i++) spawn(n.x + 1, n.y + 1, { vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, z: 0.3, vz: 2 + Math.random() * 3, life: 0.6, col: c, size: 0.14, grav: 14 });
  spawn(n.x + 1, n.y + 1, { z: 0.6, vz: 1.8, life: 0.8, spr: 'i:' + n.res, size: 0.55, vr: 0, rot: 0 });
}
export function chopFx(x: number, y: number, n: number) {
  sfx('chop');
  for (let i = 0; i < 8; i++) spawn(x + 0.5, y + 0.5, { vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, z: 0.8, vz: 1 + Math.random() * 3, life: 0.7, col: hexCol(i % 2 ? '#4f8a2a' : '#9a6b3f'), size: 0.14, grav: 12 });
  if (n) spawn(x + 0.5, y + 0.5, { z: 1, vz: 1.5, life: 0.8, spr: 'i:wood', size: 0.5, vr: 0, rot: 0 });
}

export function initInput(canvas: HTMLCanvasElement) {
  const upd = (ev: PointerEvent | WheelEvent | MouseEvent) => { view.mouse.sx = ev.clientX; view.mouse.sy = ev.clientY; updMouseWorld(); };
  canvas.addEventListener('pointerenter', () => { view.mouse.inCanvas = true; });
  canvas.addEventListener('pointerleave', () => { view.mouse.inCanvas = false; });
  canvas.addEventListener('pointerdown', ev => {
    audioInit(); startMusic(); upd(ev); canvas.setPointerCapture(ev.pointerId); view.mouse.inCanvas = true;
    const m = view.mouse;
    if (ev.button === 1) { rotating = true; rotX = ev.clientX; rotY = ev.clientY; return; }
    if (ev.button === 2) { startPan(ev); return; }
    if (ev.button !== 0) return;
    lmb = true;
    const t = tool.t;
    if (t) {
      if (t.k === 'decon') { drag = { sx: m.tx, sy: m.ty, axis: null, kind: 'rect' }; return; }
      if (t.k === 'bpsel') { drag = { sx: m.tx, sy: m.ty, axis: null, kind: 'rect' }; return; }
      if (t.k === 'paste') { doPaste(); return; }
      const d = BLD[t.type];
      if (d.kind === 'foundation') { drag = { sx: m.tx, sy: m.ty, axis: null, kind: 'rect' }; return; }
      if ((d.kind === 'belt' || d.kind === 'pipe' || d.kind === 'rail') && !d.dz) { drag = { sx: m.tx, sy: m.ty, axis: null, kind: d.kind }; return; }
      if (d.kind === 'train' && view.level > 0) { UI.toast('Trains run on the ground floor', 'bad'); return; }
      if (d.kind === 'signal') { placeSignal(m.tx, m.ty, d.sig!, t.type); return; }
      if (d.kind === 'train') { run({ k: 'train', x: m.tx, y: m.ty, rot }); return; }
      tryPlace(true);
      return;
    }
    // no tool
    if (view.level > 0) { const e = pickAt(m.wx, m.wy); if (e && def(e).kind !== 'belt' && def(e).kind !== 'lift') { UI.openInspect(e); sfx('click'); return; } startPan(ev); return; }
    const tr = trainAt(m.wx + 0.4, m.wy + 0.4) || trainAt(m.wx, m.wy);
    if (tr) { UI.openTrain(tr); sfx('click'); return; }
    const tk = truckAt(m.wx, m.wy);
    if (tk) { UI.openTruck(tk); sfx('click'); return; }
    const sp = shipAt(m.wx, m.wy);
    if (sp) { UI.openShip(sp); sfx('click'); return; }
    const ft = featNear(m.wx, m.wy);
    if (ft) { if (ft.kind === 'crystal') run({ k: 'crystal', f: ft.id }); else { openSite(ft); sfx('click'); } return; }
    const e = pickAt(m.wx, m.wy);
    if (e) {
      const k = def(e).kind;
      if (k !== 'belt' && k !== 'rail' && k !== 'tunnel') { UI.openInspect(e); sfx('click'); return; }
    }
    const n = nodeAt(m.tx, m.ty);
    if (n && !e && n.res !== 'crude_oil' && n.res !== 'geyser') { mining = { n, chop: false }; mineT = 0; handMine(n); return; }
    if (!e && G.trees[m.ty * W + m.tx]) { mining = { chop: true }; run({ k: 'chop', x: m.tx, y: m.ty }); return; }
    startPan(ev);
  });
  canvas.addEventListener('pointermove', ev => {
    upd(ev);
    const m = view.mouse;
    if (rotating) { rotateCamera((ev.clientX - rotX) * 0.008); tiltCamera((ev.clientY - rotY) * 0.006); rotX = ev.clientX; rotY = ev.clientY; updMouseWorld(); return; }
    if (panning) {
      const dx = ev.clientX - panStart.x, dy = ev.clientY - panStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) panStart.moved = true;
      if (panStart.moved && G.S) G.S.flags.looked = 1;
      const [wdx, wdy] = sd2w(dx, dy); view.cam.x = panStart.cx - wdx; view.cam.y = panStart.cy - wdy; clampCam(); updMouseWorld();
      return;
    }
    if (!lmb) return;
    const t = tool.t;
    if (mining) {
      if (mining.chop) { if (G.trees[m.ty * W + m.tx] && !entAt(m.tx, m.ty)) run({ k: 'chop', x: m.tx, y: m.ty }); }
      else { const n = nodeAt(m.tx, m.ty); if (n !== mining.n) mining = null; }
    }
    if (t && t.k === 'build') {
      const d = BLD[t.type];
      if (drag && !drag.axis && (m.tx !== drag.sx || m.ty !== drag.sy)) drag.axis = Math.abs(m.tx - drag.sx) >= Math.abs(m.ty - drag.sy) ? 'h' : 'v';
      if (!drag && d.kind !== 'train') tryPlace(false);
    }
  });
  canvas.addEventListener('pointerup', ev => {
    upd(ev);
    if (rotating && ev.button === 1) { rotating = false; return; }
    if (panning) { panning = false; canvas.style.cursor = ''; if (ev.button === 2 && !panStart.moved) cancel(); return; }
    if (ev.button !== 0) return;
    lmb = false; mining = null; lastPlaced = null;
    const t = tool.t, m = view.mouse;
    if (!drag || !t) { drag = null; return; }
    if (t.k === 'build' && BLD[t.type].kind === 'foundation') { layFoundations(drag.sx, drag.sy, m.tx, m.ty); drag = null; }
    else if (t.k === 'build') commitDrag();
    else if (t.k === 'decon') {
      const one = drag.sx === m.tx && drag.sy === m.ty, e = one ? pickAt(m.wx, m.wy) : null;
      if (e) run({ k: 'rm', id: e.id, sig: e.type === 'rail' && e.sig ? 1 : 0 });
      else {
        const tr = one ? trainAt(m.wx, m.wy) : null, tk = one && !tr ? truckAt(m.wx, m.wy) : null, sp = one && !tr && !tk ? shipAt(m.wx, m.wy) : null;
        if (tr) run({ k: 'rmv', v: 't', id: tr.id }); else if (tk) run({ k: 'rmv', v: 'k', id: tk.id }); else if (sp) run({ k: 'rmv', v: 's', id: sp.id });
        else deconRect(drag.sx, drag.sy, m.tx, m.ty);
      }
      drag = null;
    }
    else if (t.k === 'bpsel') {
      const bp = captureBP(drag.sx, drag.sy, m.tx, m.ty);
      drag = null;
      if (!bp) { UI.toast('Nothing to copy there', 'bad'); sfx('err'); return; }
      clipboard = bp;
      if (t.quick) { setTool({ k: 'paste', bp, prot: 0 }); UI.toast(`Copied ${bp.ents.length} pieces — click to paste, R to rotate, B to save it`, 'good'); }
      else UI.nameBlueprint(bp);
      sfx('click');
    }
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', ev => {
    ev.preventDefault();
    const [wx, wy] = s2w(ev.clientX, ev.clientY);
    view.cam.s *= Math.exp(-ev.deltaY * 0.0015); clampCam(); if (G.S) G.S.flags.looked = 1;
    const [nx, ny] = s2w(ev.clientX, ev.clientY);
    view.cam.x += wx - nx; view.cam.y += wy - ny; clampCam(); upd(ev);
  }, { passive: false });

  addEventListener('keydown', ev => {
    if (title.open) return;
    const tg = ev.target as HTMLElement;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
    const k = ev.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && !ev.ctrlKey) { keys.add(k); ev.preventDefault(); return; }
    if (ev.repeat) return;
    audioInit();
    if (k === 'escape') { if (UI.modalOpen()) UI.closeModal(); else cancel(); return; }
    if (ev.ctrlKey && k === 'c') { ev.preventDefault(); setTool({ k: 'bpsel', quick: true }); UI.toast('Drag a box around what you want to copy', ''); return; }
    if (ev.ctrlKey && k === 'v') { ev.preventDefault(); if (clipboard) setTool({ k: 'paste', bp: clipboard, prot: 0 }); else UI.toast('Clipboard is empty — Ctrl+C first', 'bad'); return; }
    if (ev.ctrlKey && k === 's') { ev.preventDefault(); UI.saveNow(); return; }
    if (ev.ctrlKey) return;
    if (UI.modalOpen() && UI.currentModal() === 'travel' && k >= '1' && k <= '9') { UI.travelTo(+k - 1); return; }
    if (UI.modalOpen() && !['h', 'c', 'p', 'k', 'b', 'm', 'i', 'o', 'y'].includes(k)) return;
    if (k >= '0' && k <= '9') { selectSlot(k === '0' ? 9 : +k - 1); return; }
    if (k === 'tab') { ev.preventDefault(); setCat(curCat + (ev.shiftKey ? -1 : 1)); return; }
    if (k === 'f') { selectType(bestOf(CATS.find(c => c.id === 'log')!.types[0])); return; }
    if (k === 'r') {
      if (drag) { drag.axis = drag.axis === 'v' ? 'h' : 'v'; sfx('click'); return; }
      if (tool.t && tool.t.k === 'paste') { tool.t.prot = ((tool.t.prot || 0) + (ev.shiftKey ? 3 : 1)) & 3; sfx('click'); return; }
      if (tool.t && tool.t.k === 'build') { rot = (rot + (ev.shiftKey ? 3 : 1)) & 3; sfx('click'); return; }
      const e = pickAt(view.mouse.wx, view.mouse.wy); if (e) run({ k: 'rot', id: e.id, dir: ev.shiftKey ? -1 : 1 });
      return;
    }
    if (k === 'q') {
      const e = pickAt(view.mouse.wx, view.mouse.wy);
      if (e && G.S.unlocked.has(e.type) && def(e).kind !== 'hub') { rot = e.rot; setTool({ k: 'build', type: e.type, recipe: e.recipe || null, clock: e.clock, filt: e.filt, mode: e.mode }); sfx('click'); }
      else setTool(null);
      return;
    }
    if (k === 'x' || k === 'delete') { setTool(tool.t && tool.t.k === 'decon' ? null : { k: 'decon' }); sfx('click'); return; }
    if (k === 'h') return UI.toggleModal('hub');
    if (k === 'c') return UI.toggleModal('craft');
    if (k === 'p') return UI.toggleModal('stats');
    if (k === 'k') return UI.toggleModal('shop');
    if (k === 'b') return UI.toggleModal('bp');
    if (k === 'm') return UI.toggleModal('map');
    if (k === 'i') return UI.toggleModal('inv');
    if (k === 't') return UI.toggleModal('vehicles');
    if (k === 'n') return UI.toggleModal('scan');
    if (k === 'o') return UI.toggleModal('travel');
    if (k === 'u') return UI.toggleModal('research');
    if (k === 'j') return UI.toggleModal('ach');
    if (k === 'y') { if (online()) return UI.toggleModal('players'); return; }
    if (k === 'l') { if (!plannerAllowed()) { UI.toast('The Production Planner is available in Easy and Creative worlds', 'bad'); return; } return UI.toggleModal('planner'); }
    if (k === 'f1' || k === '?') { ev.preventDefault(); return UI.toggleModal('help'); }
    if (k === 'v') { view.showPower = !view.showPower; return; }
    if (k === 'pageup' || k === 'e') { ev.preventDefault(); setLevel(view.level + 1); return; }
    if (k === 'pagedown' || k === 'z') { ev.preventDefault(); setLevel(view.level - 1); return; }
    if (k === ',' || k === '.') { tiltCamera(k === ',' ? -0.08 : 0.08); return; }
    if (k === '[' || k === ']') { rotTarget += (k === '[' ? -1 : 1) * Math.PI / 4; return; }
    if (k === 'g' || k === ' ' || k === 'home') { ev.preventDefault(); locateHome(UI.flyTo); return; }
    if (k === '=' || k === '+') { view.cam.s *= 1.2; clampCam(); }
    if (k === '-') { view.cam.s /= 1.2; clampCam(); }
  });
  addEventListener('keyup', ev => keys.delete(ev.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
}
function startPan(ev: PointerEvent) { panning = true; panStart = { x: ev.clientX, y: ev.clientY, cx: view.cam.x, cy: view.cam.y, moved: false }; }
export function cancel() {
  if (drag) { drag = null; return; }
  if (tool.t) { setTool(null); return; }
  if (view.inspect || view.inspectTrain) { UI.closeInspect(); return; }
}
let rotTarget = 0, rotDone = 0;
export function tickInput(dt: number) {
  if (Math.abs(rotTarget - rotDone) > 1e-4) { const step = (rotTarget - rotDone) * Math.min(1, dt * 10); rotateCamera(step); rotDone += step; updMouseWorld(); }
  const sp = 900 * dt;
  let sx = 0, sy = 0;
  if (keys.has('w') || keys.has('arrowup')) sy -= sp;
  if (keys.has('s') || keys.has('arrowdown')) sy += sp;
  if (keys.has('a') || keys.has('arrowleft')) sx -= sp;
  if (keys.has('d') || keys.has('arrowright')) sx += sp;
  if (sx || sy) { if (G.S) G.S.flags.looked = 1; const [wx, wy] = sd2w(sx, sy); view.cam.x += wx; view.cam.y += wy; clampCam(); updMouseWorld(); }
  if (mining && !mining.chop) { mineT += dt; if (mineT >= 0.22) { mineT = 0; handMine(mining.n); } }
}
export { isFluid, RECIPES, ensureFresh };
