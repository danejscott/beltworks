// Isometric ("Hay Day"-style) world renderer.
// World tiles are projected to diamonds; buildings are extruded blocks whose roofs use the top-down art.
import { buildAtlas, SPR } from './atlas';
import { BLD, heightOf, isFluid, ITEMS, RECIPES } from './data';
import { dronePos } from './drones';
import { hexCol, Renderer, rgba, Sprite, WHITE } from './gl';
import { curPhase } from './progress';
import { PURITY } from './sim';
import { H, TT, W } from './terrain';
import { trainPoints } from './trains';
import { clamp, DX, DY, easeOutBack, hash2, shade } from './util';
import { parts, s2w, spawn, TILT, view, ZH } from './view';
import { Ent, entAt, G, PAIRS } from './world';

export let R: Renderer;
export function initRenderer(canvas: HTMLCanvasElement) {
  R = new Renderer(canvas);
  R.setAtlas(buildAtlas());
}
const HP = Math.PI / 2;
const BWK = 1.25;           // billboard size factor (world units -> iso units)
const BELT_H = 0.12, ROCK_H = 0.9;
let U = 26, CX = 0, CY = 0, CAMX = 0, CAMY = 0, VW = 1, VH = 1;

const cc: Record<string, number> = Object.create(null);
const col = (hex: string, a = 1) => { const k = hex + a; return cc[k] ?? (cc[k] = hexCol(hex, a)); };
const colMul = (hex: string, m: number, a = 1) => { const k = hex + '*' + m + '*' + a; return cc[k] ?? (cc[k] = hexCol(shade(hex, m - 1), a)); };
const wcCache = new Map<string, number[]>();
function wallCols(hex: string, a: number) {
  const k = a === 1 ? hex : hex + a;
  let v = wcCache.get(k);
  if (!v) { v = [hexCol(shade(hex, -0.38), a), hexCol(shade(hex, -0.16), a)]; wcCache.set(k, v); }
  return v;
}
export const ST_HEX: Record<string, string> = { work: '#4cc38a', starve: '#f2c94c', block: '#ef5b5b', idle: '#8b94a2', nopower: '#9a7aff', lowpower: '#ff9a3a', noout: '#ef5b5b' };
const ORANGE = hexCol('#ffb347');
const SHADOW = rgba(0, 0, 0, 0.28);
const ROCK_TOP = hexCol('#c4beb2');

export type Label = [number, number, string, number, string, string?]; // CSS px

// ---------------------------------------------------------------------------
// projection helpers (device pixels)
export function P(wx: number, wy: number, z = 0): [number, number] {
  const dx = wx - CAMX, dy = wy - CAMY;
  return [CX + (dx - dy) * U, CY + (dx + dy) * U * TILT - z * U * ZH];
}
let PX = 0, PY = 0;
function pj(wx: number, wy: number, z: number) { const dx = wx - CAMX, dy = wy - CAMY; PX = CX + (dx - dy) * U; PY = CY + (dx + dy) * U * TILT - z * U * ZH; }
function ax(x: number, y: number): [number, number] { return [(x - y) * U, (x + y) * U * TILT]; }
/** flat rectangle lying on the ground (or a roof at height z), centred at wx,wy */
function ground(wx: number, wy: number, w: number, h: number, rot: number, s: Sprite, c = WHITE, z = 0) {
  let a1 = w, a2 = 0, b1 = 0, b2 = h;
  if (rot) { const co = Math.cos(rot), si = Math.sin(rot); a1 = co * w; a2 = si * w; b1 = -si * h; b2 = co * h; }
  pj(wx, wy, z);
  R.q(PX, PY, (a1 - a2) * U, (a1 + a2) * U * TILT, (b1 - b2) * U, (b1 + b2) * U * TILT, s, c);
}
/** upright sprite standing at (wx,wy,z), anchored at its bottom centre */
function bill(wx: number, wy: number, z: number, w: number, h: number, s: Sprite, c = WHITE, lean = 0) {
  pj(wx, wy, z); const pw = w * U * BWK, ph = h * U * BWK, bx = lean * ph;
  R.q(PX - bx / 2, PY - ph / 2, pw, 0, bx, ph, s, c);
}
/** upright sprite centred at (wx,wy,z) */
function billC(wx: number, wy: number, z: number, w: number, h: number, s: Sprite, c = WHITE, rot = 0) {
  pj(wx, wy, z); const pw = w * U * BWK, ph = h * U * BWK;
  if (!rot) { R.q(PX, PY, pw, 0, 0, ph, s, c); return; }
  const co = Math.cos(rot), si = Math.sin(rot);
  R.q(PX, PY, co * pw, si * pw, -si * ph, co * ph, s, c);
}
function line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, th: number, c: number) {
  const [a1, a2] = P(x0, y0, z0), [b1, b2] = P(x1, y1, z1);
  const dx = b1 - a1, dy = b2 - a2, L = Math.hypot(dx, dy) || 1;
  R.q((a1 + b1) / 2, (a2 + b2) / 2, dx, dy, -dy / L * th, dx / L * th, SPR.white, c);
}
/** vertical wall from world point p to q between heights z0..z1 */
function wall(px: number, py: number, qx: number, qy: number, z0: number, z1: number, s: Sprite, c: number) {
  pj(px, py, z0); const a0x = PX, a0y = PY; pj(qx, qy, z0);
  const Hh = (z1 - z0) * U * ZH;
  R.q((a0x + PX) / 2, (a0y + PY) / 2 - Hh / 2, PX - a0x, PY - a0y, 0, Hh, s, c);
}
/** axis-aligned block: east + south walls and a roof */
function block(x: number, y: number, w: number, h: number, z0: number, z1: number, top: Sprite | null, topC: number, wallHex: string, alpha = 1, wallS: Sprite = SPR.wall, faces = 3) {
  if (z1 - z0 > 0.001 && faces) {
    const wc = wallCols(wallHex, alpha);
    if (faces & 1) wall(x + w, y, x + w, y + h, z0, z1, wallS, wc[0]);
    if (faces & 2) wall(x, y + h, x + w, y + h, z0, z1, wallS, wc[1]);
  }
  if (top) { pj(x + w / 2, y + h / 2, z1); R.q(PX, PY, w * U, w * U * TILT, -h * U, h * U * TILT, top, topC); }
}
/** rotated box (vehicles) */
function rbox(cx: number, cy: number, len: number, wid: number, ang: number, z0: number, z1: number, top: Sprite, topC: number, wallHex: string, alpha = 1) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const lx = ca * len / 2, ly = sa * len / 2, sx = -sa * wid / 2, sy = ca * wid / 2;
  const c0 = [cx - lx - sx, cy - ly - sy], c1 = [cx + lx - sx, cy + ly - sy], c2 = [cx + lx + sx, cy + ly + sy], c3 = [cx - lx + sx, cy - ly + sy];
  const edges: [number[], number[], number, number][] = [[c1, c2, ca, sa], [c2, c3, -sa, ca], [c3, c0, -ca, -sa], [c0, c1, sa, -ca]];
  for (const [p, q, nx, ny] of edges) {
    if (nx + ny <= 0.001) continue;
    const sh = Math.round((0.6 + 0.25 * clamp((ny - nx + 1) / 2, 0, 1)) * 20) / 20;
    wall(p[0], p[1], q[0], q[1], z0, z1, SPR.wall, colMul(wallHex, sh, alpha));
  }
  const [Ax, Ay] = ax(c1[0] - c0[0], c1[1] - c0[1]), [Bx, By] = ax(c3[0] - c0[0], c3[1] - c0[1]);
  const [ox, oy] = P(cx, cy, z1);
  R.q(ox, oy, Ax, Ay, Bx, By, top, topC);
}

/** upright cylinder (chimneys, tanks, pistons) */
function cyl(cx: number, cy: number, r: number, z0: number, z1: number, hex: string, topHex?: string, alpha = 1) {
  const [ox, oy0] = P(cx, cy, z0), [, oy1] = P(cx, cy, z1);
  const wS = 2 * Math.SQRT2 * r * U * 0.9375;
  ground(cx, cy, 2 * r, 2 * r, 0, SPR.circle, colMul(hex, 0.55, alpha), z0);
  R.q(ox, (oy0 + oy1) / 2, wS, 0, 0, oy0 - oy1, SPR.cylside, col(hex, alpha));
  ground(cx, cy, 2 * r, 2 * r, 0, SPR.circle, colMul(topHex || hex, 1.12, alpha), z1);
}
/** sprite mounted flat on a vertical wall: (px,py,z) centre, (ex,ey) = wall direction in the world */
function wallQuad(px: number, py: number, ex: number, ey: number, z: number, size: number, rot: number, s: Sprite, c = WHITE) {
  const [Ex, Ey] = ax(ex, ey), Dy = U * ZH;
  const co = Math.cos(rot) * size, si = Math.sin(rot) * size;
  const [ox, oy] = P(px, py, z);
  R.q(ox, oy, co * Ex, co * Ey + si * Dy, -si * Ex, -si * Ey + co * Dy, s, c);
}
function smoke(x: number, y: number, z: number, dark = false, big = 1) {
  if (parts.length > 500) return;
  spawn(x, y, { z, vz: 0.9 + Math.random() * 0.4, vx: 0.25, vy: -0.1, life: 2.2, spr: 'glow', size: 0.35 * big, col: dark ? rgba(0.3, 0.3, 0.32, 0.5) : rgba(0.92, 0.92, 0.94, 0.45), grow: 0.8 * big, vr: 0 });
}

// ---------------------------------------------------------------------------
export function visHeight(e: Ent): number {
  const d = BLD[e.type];
  if (d.kind === 'belt') return BELT_H;
  if (d.kind === 'pole') return e.type === 'tower' ? 3.8 : e.type === 'pole2' ? 2 : 1.6;
  if (d.kind === 'elevator') return 5;
  if (d.kind === 'rail' || d.kind === 'pipe') return 0.1;
  return heightOf(e.type);
}
/** find the entity under a screen point, accounting for building heights */
export function pickAt(wx: number, wy: number): Ent | null {
  for (let t = 5.2; t >= 0; t -= 0.1) {
    const d = t * ZH / (2 * TILT);
    const e = entAt(Math.floor(wx + d), Math.floor(wy + d));
    if (e && visHeight(e) >= t - 0.05) return e;
  }
  return entAt(Math.floor(wx), Math.floor(wy));
}

// ---------------------------------------------------------------------------
interface Obj { k: number; t: number; e?: any; x?: number; y?: number }

export function drawWorld(time: number, real: number, labels: Label[]) {
  const c = view.cam, dpr = view.dpr;
  U = c.s * dpr; CX = view.cw * dpr / 2; CY = view.ch * dpr / 2; CAMX = c.x; CAMY = c.y; VW = view.cw * dpr; VH = view.ch * dpr;
  R.begin(c.x, c.y, U);
  R.terrain(real);
  const cs = [s2w(0, 0), s2w(view.cw, 0), s2w(0, view.ch), s2w(view.cw, view.ch)];
  const x0 = Math.max(0, Math.floor(Math.min(...cs.map(p => p[0]))) - 2), x1 = Math.min(W - 1, Math.ceil(Math.max(...cs.map(p => p[0]))) + 6);
  const y0 = Math.max(0, Math.floor(Math.min(...cs.map(p => p[1]))) - 2), y1 = Math.min(H - 1, Math.ceil(Math.max(...cs.map(p => p[1]))) + 6);
  const onScr = (wx: number, wy: number, m = 3) => { const [sx, sy] = P(wx, wy); const mm = m * U; return sx > -mm && sx < VW + mm && sy > -mm && sy < VH + mm * 2.5; };
  const detail = U >= 7 * dpr;
  const objs: Obj[] = [];

  // ---- ground layer
  for (const n of G.nodes) {
    if (n.x + 2 < x0 || n.x > x1 || n.y + 2 < y0 || n.y > y1 || !onScr(n.x + 1, n.y + 1)) continue;
    if (G.grid[n.y * W + n.x]) continue;
    if (n.res === 'crude_oil' || n.res === 'geyser') {
      ground(n.x + 1, n.y + 1, 2, 2, 0, SPR['n:' + n.res]);
      if (n.res === 'geyser' && Math.random() < 0.03) spawn(n.x + 1, n.y + 1, { z: 0.1, vz: 1.2, life: 1.6, spr: 'glow', size: 0.5, col: rgba(1, 1, 1, 0.4), grow: 0.8, vr: 0 });
    } else objs.push({ k: n.x + n.y + 2, t: 4, e: n });
    if (U > 9 * dpr) objs.push({ k: n.x + n.y + 2.01, t: 7, e: n });
  }
  const blds: Ent[] = [], poles: Ent[] = [];
  for (const e of G.ents.values()) {
    if (e.x + e.w < x0 || e.x > x1 || e.y + e.h < y0 || e.y > y1) { if (e.wires && e.wires.length) poles.push(e); continue; }
    const d = BLD[e.type], k = d.kind;
    if (k === 'rail') { drawRail(e.x, e.y, e.pairs, WHITE); continue; }
    if (k === 'pipe' || k === 'ptunnel') { drawPipe(e, real); continue; }
    if (k === 'belt' || k === 'tunnel') { objs.push({ k: e.x + e.y + 1, t: 1, e }); continue; }
    if (k === 'pole' || k === 'hub') poles.push(e);
    const ht = visHeight(e);
    if (ht > 0.3 && d.kind !== 'pole') ground(e.x + e.w / 2 + ht * 0.25, e.y + e.h / 2 + ht * 0.1, e.w + ht * 0.5, e.h + ht * 0.3, 0, SPR.shadow, SHADOW);
    blds.push(e);
    objs.push({ k: e.x + e.w / 2 + e.y + e.h / 2, t: 0, e });
  }
  if (view.showPower) for (const e of blds) {
    const d = BLD[e.type]; if (d.kind !== 'pole' && d.kind !== 'hub') continue;
    ground(e.x + e.w / 2, e.y + e.h / 2, e.w + d.area * 2, e.h + d.area * 2, 0, SPR.white, rgba(1, 0.85, 0.3, 0.12), 0.01);
  }
  if (view.sel) {
    const r = view.sel, xa = Math.min(r.x0, r.x1), ya = Math.min(r.y0, r.y1), xb = Math.max(r.x0, r.x1) + 1, yb = Math.max(r.y0, r.y1) + 1;
    ground((xa + xb) / 2, (ya + yb) / 2, xb - xa, yb - ya, 0, SPR.white, r.col, 0.02);
    const oc = r.col | 0xff000000, t = Math.max(1.5, U * 0.06);
    line(xa, ya, 0.02, xb, ya, 0.02, t, oc); line(xb, ya, 0.02, xb, yb, 0.02, t, oc); line(xb, yb, 0.02, xa, yb, 0.02, t, oc); line(xa, yb, 0.02, xa, ya, 0.02, t, oc);
  }

  // ---- terrain objects: rock cliffs and trees
  const area = (x1 - x0) * (y1 - y0);
  const rocks = U >= 5 * dpr, treesOn = U >= 7 * dpr;
  if ((rocks || treesOn) && area < 250000) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x, tt = G.tiles[i];
      if (tt === TT.ROCK) {
        if (!rocks) continue;
        // interior rock tiles whose east & south neighbours are rock only need a roof
        if (onScr(x + 0.5, y + 0.5, 2)) objs.push({ k: x + y + 1, t: 3, x, y });
      }
      else if (G.trees[i]) { if (treesOn && onScr(x + 0.5, y + 0.5, 2)) objs.push({ k: x + y + 1.02, t: 2, x, y }); }
      else if (U >= 15 * dpr && G.tiles[i] <= TT.GRASS2 && !G.grid[i] && hash2(x, y, 41) < 0.14 && onScr(x + 0.5, y + 0.5, 1)) objs.push({ k: x + y + 0.9, t: 8, x, y });
    }
  }
  // trains
  for (const tr of G.trains) {
    const pts = trainPoints(tr);
    for (let i = 0; i < tr.cars.length; i++) {
      const f = pts[2 * i], r = pts[2 * i + 1];
      if (!f || !r) continue;
      const x = (f[0] + r[0]) / 2, y = (f[1] + r[1]) / 2;
      if (x < x0 - 2 || x > x1 + 2 || y < y0 - 2 || y > y1 + 2) continue;
      objs.push({ k: x + y + 0.02, t: 5, e: tr, x: i });
    }
  }
  // ---- draw sorted objects
  objs.sort((a, b) => a.k - b.k);
  const gold = !!G.S.shop.gold;
  for (const o of objs) {
    switch (o.t) {
      case 0: drawBuilding(o.e, time, real, labels); break;
      case 1: drawBelt(o.e, time, gold, detail, WHITE, 1); drawBeltItems(o.e); break;
      case 2: {
        const x = o.x!, y = o.y!, h = hash2(x, y, 7), v = (h * 4) | 0;
        const jx = (h - 0.5) * 0.3, jy = (hash2(y, x, 3) - 0.5) * 0.3, sz = 0.85 + hash2(x, y, 11) * 0.35;
        ground(x + 0.6 + jx, y + 0.6 + jy, 0.9 * sz, 0.9 * sz, 0, SPR.shadow, SHADOW);
        const sway = Math.sin(real * 1.4 + x * 0.37 + y * 0.23) * 0.035 + Math.sin(real * 3.1 + h * 20) * 0.012;
        bill(x + 0.5 + jx, y + 0.5 + jy, 0, 1.0 * sz, 1.33 * sz, SPR['treeb' + v], WHITE, sway);
        break;
      }
      case 3: {
        const x = o.x!, y = o.y!;
        const faces = (G.tiles[y * W + x + 1] !== TT.ROCK ? 1 : 0) | (G.tiles[(y + 1) * W + x] !== TT.ROCK ? 2 : 0);
        block(x, y, 1, 1, 0, ROCK_H, SPR.rocktop, ROCK_TOP, '#a89886', 1, SPR.rockwall, U >= 8 * view.dpr ? faces : faces & 3);
        break;
      }
      case 4: {
        const n = o.e;
        block(n.x + 0.08, n.y + 0.08, 1.84, 1.84, 0, 0.22, SPR['n:' + n.res], WHITE, '#3a3d44');
        break;
      }
      case 5: drawTrainCar(o.e, o.x!); break;
      case 8: {
        const x = o.x!, y = o.y!, h = hash2(x, y, 43), v = h < 0.55 ? 0 : h < 0.75 ? 1 : h < 0.9 ? 2 : 3;
        const px = x + 0.2 + hash2(x, y, 44) * 0.6, py = y + 0.2 + hash2(y, x, 45) * 0.6;
        bill(px, py, 0, 0.32, 0.32, SPR['tuft' + v], WHITE, v < 2 ? Math.sin(real * 2 + x + y * 0.7) * 0.12 : 0);
        break;
      }
      case 7: {
        const n = o.e, pc = n.p === 2 ? col('#ffd24a') : WHITE;
        for (let i = 0; i <= n.p; i++) billC(n.x + 1 + (i - n.p / 2) * 0.28, n.y + 1 - (i - n.p / 2) * 0.28, 0.55, 0.14, 0.14, SPR.circle, pc);
        break;
      }
    }
  }
  // ---- things above everything
  const wireCol = rgba(0.12, 0.12, 0.14, 0.9);
  for (const p of poles) for (const q of p.wires || []) {
    const ax2 = p.x + p.w / 2, ay2 = p.y + p.h / 2, bx2 = q.x + q.w / 2, by2 = q.y + q.h / 2;
    if (Math.max(ax2, bx2) < x0 || Math.min(ax2, bx2) > x1 || Math.max(ay2, by2) < y0 || Math.min(ay2, by2) > y1) continue;
    const za = wireZ(p), zb = wireZ(q), sag = Math.min(0.7, Math.hypot(bx2 - ax2, by2 - ay2) * 0.035);
    const mx = (ax2 + bx2) / 2, my = (ay2 + by2) / 2, mz = (za + zb) / 2 - sag, th = Math.max(1, U * 0.03);
    const q1x = (ax2 + mx) / 2, q1y = (ay2 + my) / 2, q1z = (za + mz) / 2 - sag * 0.3;
    const q2x = (mx + bx2) / 2, q2y = (my + by2) / 2, q2z = (mz + zb) / 2 - sag * 0.3;
    line(ax2, ay2, za, q1x, q1y, q1z, th, wireCol); line(q1x, q1y, q1z, mx, my, mz, th, wireCol);
    line(mx, my, mz, q2x, q2y, q2z, th, wireCol); line(q2x, q2y, q2z, bx2, by2, zb, th, wireCol);
  }
  for (const p of G.L ? G.L.drones : []) {
    const pos = dronePos(p);
    if (!pos) continue;
    const [x, y, , alt] = pos;
    ground(x, y, 0.9, 0.9, 0, SPR.shadow, rgba(0, 0, 0, 0.35));
    billC(x, y, 1 + alt * 3, 0.9, 0.9, SPR.drone);
  }
  const outline = (e: Ent, cl: number) => {
    const z = visHeight(e) + 0.02, t = Math.max(1.5, U * 0.07);
    line(e.x, e.y, z, e.x + e.w, e.y, z, t, cl); line(e.x + e.w, e.y, z, e.x + e.w, e.y + e.h, z, t, cl);
    line(e.x + e.w, e.y + e.h, z, e.x, e.y + e.h, z, t, cl); line(e.x, e.y + e.h, z, e.x, e.y, z, t, cl);
  };
  if (view.hover && G.ents.has(view.hover.id)) outline(view.hover, rgba(1, 1, 1, 0.7));
  if (view.inspect && G.ents.has(view.inspect.id)) outline(view.inspect, col('#f5a524'));
  for (const gh of view.ghosts) drawGhost(gh, time, real);
  for (const p of parts) {
    const a = clamp(p.life / p.max * 1.5, 0, 1);
    const alpha = ((p.col >>> 24) / 255) * a;
    const cl = ((Math.round(alpha * 255) << 24) | (p.col & 0xffffff)) >>> 0;
    const isSq = p.spr === 'white';
    billC(p.x, p.y, p.z, p.size, isSq ? p.size * 0.6 : p.size, SPR[p.spr] || SPR.white, cl, isSq ? p.rot : 0);
  }
  R.flush();
}

function wireZ(e: Ent) { const d = BLD[e.type]; return d.kind === 'hub' ? 1.3 : e.type === 'tower' ? 3.75 : e.type === 'pole2' ? 1.95 : 1.55; }

// ---------------------------------------------------------------------------
export function drawRail(x: number, y: number, pairs: number, cl: number) {
  for (let i = 0; i < 6; i++) {
    if (!(pairs & (1 << i))) continue;
    if (i === 0) ground(x + 0.5, y + 0.5, 1, 1, 0, SPR.rail_s, cl, 0.01);
    else if (i === 1) ground(x + 0.5, y + 0.5, 1, 1, HP, SPR.rail_s, cl, 0.01);
    else { const k = i === 3 ? 0 : i === 4 ? 1 : i === 5 ? 2 : 3; ground(x + 0.5, y + 0.5, 1, 1, k * HP, SPR.rail_c, cl, 0.01); }
  }
}
function pipeConn(e: Ent, d: number) {
  const n = entAt(e.x + DX[d], e.y + DY[d]);
  if (!n) return false;
  const k = BLD[n.type].kind;
  if (k === 'pipe' || k === 'tank') return true;
  if (k === 'ptunnel') { const s = n.isExit ? n.rot : (n.rot + 2) & 3; return n.x + DX[s] === e.x && n.y + DY[s] === e.y; }
  if (k === 'machine' || k === 'extractor' || (k === 'gen' && (BLD[n.type].water || n.type === 'fuel_gen'))) return true;
  return false;
}
function drawPipe(e: Ent, real: number) {
  const cx = e.x + 0.5, cy = e.y + 0.5, net = e.fnet, z = 0.12;
  if (e.type === 'ptunnel') { ground(cx, cy, 1, 1, (e.isExit ? e.rot + 2 : e.rot) * HP + Math.PI, SPR.ptunnel, WHITE, 0.02); return; }
  const fl = net && net.fluid ? ITEMS[net.fluid].c : null;
  const fill = net && net.cap ? net.amount / net.cap : 0;
  const flowing = net && net.flowEMA > 0.001;
  const fa = fl ? clamp(0.3 + fill * 0.7, 0, 1) * (flowing ? 0.8 + 0.2 * Math.sin(real * 6 + e.x * 0.7 + e.y * 0.7) : 1) : 0;
  const tint = e.type === 'pipe2' ? col('#d8e4ee') : WHITE;
  ground(cx + 0.1, cy + 0.1, 0.55, 0.55, 0, SPR.shadow, rgba(0, 0, 0, 0.2));
  let any = false;
  for (let d = 0; d < 4; d++) if (pipeConn(e, d)) { any = true; ground(cx, cy, 1, 1, d * HP, SPR.pipe_arm, tint, z); if (fa > 0) ground(cx, cy, 1, 1, d * HP, SPR.fluid_arm, col(fl!, fa), z); }
  if (!any) { ground(cx, cy, 1, 1, 0, SPR.pipe_arm, tint, z); ground(cx, cy, 1, 1, Math.PI, SPR.pipe_arm, tint, z); }
  ground(cx, cy, 1, 1, 0, SPR.pipe_hub, tint, z);
  if (fa > 0) ground(cx, cy, 1, 1, 0, SPR.fluid_hub, col(fl!, fa), z);
}
export function drawBelt(b: Ent, time: number, gold: boolean, detail: boolean, cl: number, alpha = 1) {
  const cx = b.x + 0.5, cy = b.y + 0.5, d = BLD[b.type];
  if (d.kind === 'tunnel') {
    block(b.x + 0.05, b.y + 0.05, 0.9, 0.9, 0, 0.4, null, WHITE, '#6a5a3a', alpha);
    ground(cx, cy, 0.9, 0.9, b.rot * HP, SPR[b.isExit ? 'tunnel_out' : 'tunnel_in'], cl, 0.4);
    return;
  }
  const colHex = gold ? '#f5c542' : d.col;
  if (!detail) { ground(cx, cy, 1, 1, 0, SPR.white, cl === WHITE ? col(colHex, 0.85) : cl, 0.02); return; }
  block(b.x, b.y, 1, 1, 0, BELT_H, null, WHITE, '#6a6e74', alpha, SPR.beltwall);
  const pre = gold ? 'gold' : b.type;
  const f = Math.floor((((time * d.speed) % 1) + 1) % 1 * 8) & 7;
  if (b.curve >= 0) {
    const right = b.rot === ((b.curve + 1) & 3);
    ground(cx, cy, right ? 1 : -1, 1, (b.rot - 1) * HP, SPR[pre + 'c' + f], cl, BELT_H);
  } else ground(cx, cy, 1, 1, b.rot * HP, SPR[pre + 's' + f], cl, BELT_H);
}
function bez(p: number[], t: number): [number, number] {
  const u = 1 - t;
  return [u * u * p[0] + 2 * u * t * p[2] + t * t * p[4], u * u * p[1] + 2 * u * t * p[3] + t * t * p[5]];
}
function drawBeltItems(b: Ent) {
  if (!b.items || !b.items.length || !b.pts || U < 5 * view.dpr) return;
  const sz = 0.56;
  if (b.type === 'tunnel') {
    const ex = b.pair ? G.ents.get(b.pair) : null;
    for (const it of b.items) {
      if (it.pos <= 0.35) { const [x, y] = bez(b.pts, it.pos); bill(x, y, BELT_H, sz, sz, SPR['i:' + it.it]); }
      else if (ex && it.pos >= b.len - 0.35) { const t = it.pos - (b.len - 1); bill(ex.x + 0.5 + DX[b.rot] * (t - 0.5), ex.y + 0.5 + DY[b.rot] * (t - 0.5), BELT_H, sz, sz, SPR['i:' + it.it]); }
    }
    return;
  }
  const zoomed = U >= 16 * view.dpr;
  for (const it of b.items) { const [x, y] = bez(b.pts, it.pos > 1 ? 1 : it.pos); if (zoomed) ground(x + 0.05, y + 0.05, 0.4, 0.3, 0, SPR.shadow, rgba(0, 0, 0, 0.35), BELT_H); bill(x, y, BELT_H - 0.02, sz, sz, SPR['i:' + it.it]); }
}

// ---------------------------------------------------------------------------
function led(cx: number, cy: number, z: number, st: string, real: number, s = 0.2) {
  const h = ST_HEX[st] || '#888';
  const pulse = st === 'block' || st === 'nopower' ? 0.55 + 0.45 * Math.sin(real * 7) : 1;
  billC(cx, cy, z, s * 2.2, s * 2.2, SPR.glow, col(h, 0.4 * pulse));
  billC(cx, cy, z, s, s, SPR.circle, col(h, pulse));
}
/** Hay Day-style speech bubble with the product icon, floating above the roof */
function bubble(cx: number, cy: number, z: number, item: string, st: string, prog: number, real: number, extra?: string) {
  const bob = Math.sin(real * 2 + cx * 1.7 + cy) * 0.04;
  const [ox, oy] = P(cx, cy, z + bob);
  const pw = 0.85 * U * BWK, ph = pw * 72 / 64;
  R.q(ox, oy - ph / 2, pw, 0, 0, ph, SPR.bubble, WHITE);
  const icx = ox, icy = oy - ph * 0.57, is = pw * 0.62;
  R.q(icx, icy, is, 0, 0, is, SPR['i:' + item]);
  if (extra) R.q(icx + is * 0.42, icy + is * 0.32, is * 0.5, 0, 0, is * 0.5, SPR['i:' + extra]);
  const h = ST_HEX[st] || '#888', pulse = st === 'block' || st === 'nopower' ? 0.55 + 0.45 * Math.sin(real * 7) : 1;
  R.q(ox + pw * 0.36, oy - ph * 0.86, pw * 0.26, 0, 0, pw * 0.26, SPR.circle, col(h, pulse));
  if (prog > 0) {
    const bw = pw * 0.7, by = oy - ph * 0.14, bh = Math.max(2, pw * 0.07);
    R.q(ox, by, bw, 0, 0, bh, SPR.white, rgba(0, 0, 0, 0.25));
    R.q(ox - bw / 2 + bw * prog / 2, by, bw * prog, 0, 0, bh, SPR.white, col(h));
  }
}
function frontMarks(e: Ent, ht: number) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, dx = DX[e.rot], dy = DY[e.rot];
  const along = e.rot & 1 ? e.w : e.h, hw = (e.rot & 1 ? e.h : e.w) / 2;
  ground(cx + dx * (hw - 0.14), cy + dy * (hw - 0.14), e.rot & 1 ? along - 0.3 : 0.1, e.rot & 1 ? 0.1 : along - 0.3, 0, SPR.white, ORANGE, ht + 0.005);
  if (U > 9 * view.dpr && e.ft) for (const [x, y] of e.ft) ground(x + 0.5 - dx * 0.38, y + 0.5 - dy * 0.38, 0.36, 0.36, e.rot * HP, SPR.arrow, ORANGE, 0.03);
}

export function drawBuilding(e: Ent, time: number, real: number, labels: Label[] | null, ghostCol?: number) {
  const d = BLD[e.type], k = d.kind, cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  const ghost = ghostCol !== undefined;
  const tint = ghost ? ghostCol! : WHITE, alpha = ghost ? 0.6 : 1;
  let sc = 1;
  if (!ghost) { const a = (real - e.born) / 0.35; if (a < 1) sc = easeOutBack(Math.max(0, a)); if (e.pop > 0) sc *= 1 + 0.08 * e.pop; }
  if (k === 'belt' || k === 'tunnel') { drawBelt(e, time, false, true, tint, alpha); return; }
  if (k === 'ptunnel') { ground(cx, cy, 1, 1, (e.isExit ? e.rot + 2 : e.rot) * HP + Math.PI, SPR.ptunnel, tint, 0.02); return; }
  if (k === 'rail') { drawRail(e.x, e.y, e.pairs || 1, tint); return; }
  if (k === 'pipe') { ground(cx, cy, 1, 1, 0, SPR.pipe_arm, tint, 0.12); ground(cx, cy, 1, 1, Math.PI, SPR.pipe_arm, tint, 0.12); ground(cx, cy, 1, 1, 0, SPR.pipe_hub, tint, 0.12); return; }
  if (k === 'pole' && e.w === 1) {
    if (!ghost) ground(cx + 0.35, cy + 0.15, 0.5, 0.35, 0, SPR.shadow, SHADOW);
    const tall = e.type === 'pole2';
    bill(cx, cy, 0, tall ? 0.38 : 0.3, (tall ? 2.05 : 1.65) * sc, SPR[tall ? 'pole2b' : 'poleb'], tint);
    return;
  }
  if (e.type === 'tower') {
    block(e.x + 0.3, e.y + 0.3, e.w - 0.6, e.h - 0.6, 0, 0.3, SPR['b:tower'], tint, '#6a6a70', alpha);
    bill(cx, cy, 0.25, 1.1, 3.6 * sc, SPR.towerb, tint);
    return;
  }
  const spr = SPR['b:' + e.type];
  if (!spr) return;
  const ht = heightOf(e.type) * sc;
  const inset = e.w > 1 ? 0.07 : 0.1;
  const busy = !ghost && (e.st === 'work' || e.st === 'lowpower') && (k === 'machine' || k === 'miner' || k === 'extractor' || k === 'harvester');
  const jit = busy && view.cam.s > 12 ? Math.sin(real * 47 + e.id) * 0.012 : 0;
  const x = e.x + inset + jit, y = e.y + inset, w = e.w - inset * 2, h = e.h - inset * 2;
  const rot1 = k === 'splitter' || k === 'merger' || k === 'sorter';
  block(x, y, w, h, 0, ht, rot1 ? null : spr, tint, d.col, alpha);
  if (rot1) ground(cx, cy, w, h, e.rot * HP, spr, tint, ht);
  if (ghost) {
    if (e.ft && ['machine', 'miner', 'harvester', 'storage', 'station', 'drone'].includes(k)) frontMarks(e, ht);
    if (e.recipe) { const r = RECIPES[e.recipe]; billC(cx, cy, ht + 0.5, 0.5, 0.5, SPR['i:' + Object.keys(r.out)[0]], rgba(1, 1, 1, 0.85)); }
    return;
  }
  if (sc < 0.3) return;
  const m = Math.min(e.w, e.h);
  const zoomed = U >= 14 * view.dpr;
  if (U >= 12 * view.dpr) props(e, ht, time, real, busy);
  if (zoomed && k === 'machine' && (e.st === 'starve' || e.st === 'idle') && Math.random() < 0.004) spawn(cx + 0.3, cy - 0.3, { z: ht + 0.8, vz: 0.45, vx: 0.15, vy: -0.15, life: 2.2, spr: 'zz', size: 0.34, vr: 0, rot: 0, col: rgba(1, 1, 1, 0.9) });
  switch (k) {
    case 'machine': {
      frontMarks(e, ht);
      const working = e.st === 'work' || e.st === 'lowpower';
      ground(cx, cy, m * 0.55, m * 0.55, working ? time * 1.6 * e.clock : 0, SPR.gear, rgba(1, 1, 1, 0.14), ht + 0.005);
      if (e.recipe) {
        const outs = Object.keys(RECIPES[e.recipe].out);
        if (zoomed) bubble(cx, cy, ht + 0.12, outs[0], e.st, e.prog, real, outs[1]);
        else led(cx, cy, ht + 0.3, e.st, real, 0.35);
      } else led(cx, cy, ht + 0.3, 'idle', real, 0.3);
      if (e.amp) billC(e.x + 0.4, e.y + 0.4, ht + 0.2, 0.35, 0.35, SPR['i:amplifier']);
      if (e.shards) for (let i = 0; i < e.shards; i++) ground(e.x + 0.35 + i * 0.25, e.y + e.h - 0.35, 0.28, 0.28, 0, SPR['i:power_shard'], WHITE, ht + 0.01);
      break;
    }
    case 'miner': {
      frontMarks(e, ht);
      const spd = e.st === 'work' || e.st === 'lowpower' ? 7 * PURITY[e.node.p].m * e.clock : 0;
      ground(cx, cy, 1.25, 1.25, time * spd, SPR.drill, WHITE, ht + 0.01);
      led(cx + 0.55, cy - 0.55, ht + 0.15, e.st, real);
      break;
    }
    case 'harvester':
      frontMarks(e, ht);
      ground(cx, cy, 1.2, 1.2, e.st === 'work' ? time * 9 : 0, SPR.saw, WHITE, ht + 0.01);
      led(cx + 0.55, cy - 0.55, ht + 0.15, e.st, real);
      break;
    case 'extractor': {
      const on = e.st === 'work' || e.st === 'lowpower';
      ground(cx, cy, 1.0, 1.0, on ? time * 6 : 0, SPR.fan, rgba(1, 1, 1, 0.55), ht + 0.01);
      led(cx + 0.55, cy - 0.55, ht + 0.15, e.st, real);
      break;
    }
    case 'storage': case 'station': {
      frontMarks(e, ht);
      const kk = Object.keys(e.store)[0];
      if (kk && zoomed) bubble(cx, cy, ht + 0.1, kk, e.tot >= d.cap ? 'block' : 'work', e.tot / d.cap, real);
      if (k === 'station' && labels) labelAt(labels, cx, cy, ht + 1.3, e.name + (e.mode === 'load' ? ' ⬆' : ' ⬇'), 12, '#ffe08a');
      break;
    }
    case 'drone': {
      frontMarks(e, ht);
      if (e.dr.s === 'home') billC(cx, cy, ht + 0.3, 0.9, 0.9, SPR.drone);
      if (labels) labelAt(labels, cx, cy, ht + 1.3, e.name, 12, '#a8d8ff');
      break;
    }
    case 'sink':
      ground(cx, cy, 2, 2, time * 2, SPR.gear, rgba(1, 0.6, 0.85, e.sinkT > 0 ? 0.4 : 0.15), ht + 0.01);
      break;
    case 'gen': {
      const load = e.avail > 0 && e.pnet ? e.pnet.load : 0;
      if (load > 0) billC(cx, cy, ht + 0.2, m * 0.9, m * 0.9, SPR.glow, rgba(1, 0.65, 0.25, 0.2 + 0.2 * load + 0.08 * Math.sin(real * 9 + e.id)));
      if (e.type === 'coal_gen' || e.type === 'fuel_gen') ground(cx, cy, m * 0.5, m * 0.5, time * 6 * load, SPR.fan, rgba(1, 1, 1, 0.4), ht + 0.01);
      led(cx + m * 0.3, cy - m * 0.3, ht + 0.15, e.st, real);
      if (load > 0 && e.type !== 'geothermal' && Math.random() < 0.06 * load) spawn(e.x + e.w * 0.3, e.y + e.h * 0.3, { z: ht + 0.2, vz: 1.2, vx: 0.2, life: 2, spr: 'glow', size: 0.5, col: rgba(0.35, 0.35, 0.38, 0.45), grow: 0.9, vr: 0 });
      if (e.type === 'geothermal' && Math.random() < 0.06) spawn(cx, cy, { z: ht, vz: 1.4, life: 1.6, spr: 'glow', size: 0.6, col: rgba(1, 1, 1, 0.4), grow: 0.9, vr: 0 });
      break;
    }
    case 'battery': {
      const f = e.stored / d.cap;
      for (let i = 0; i < 3; i++) ground(e.x + e.w * (0.27 + i * 0.23), cy, e.w * 0.14, e.h * 0.58 * Math.max(0.03, f), 0, SPR.white, col('#4ac0a0', 0.9), ht + 0.01);
      break;
    }
    case 'hub':
      ground(cx, cy, 3.2, 3.2, time * 0.4, SPR.gear, rgba(0.96, 0.65, 0.14, 0.18), ht + 0.01);
      break;
    case 'elevator': {
      const ph = curPhase();
      let frac = 0;
      if (ph) { let a = 0, b = 0; for (const kk in ph.req) { a += Math.min(G.S.elev[kk] || 0, ph.req[kk]); b += ph.req[kk]; } frac = a / b; }
      const N = 28;
      for (let i = 0; i < N; i++) {
        const a = -HP + i / N * Math.PI * 2, lit = i / N < frac;
        ground(cx + Math.cos(a) * 2.05, cy + Math.sin(a) * 2.05, 0.22, 0.22, 0, SPR.circle, lit ? col('#b69cff') : rgba(0.3, 0.3, 0.4, 1), ht + 0.01);
      }
      const th = 5 * sc;
      block(cx - 0.8, cy - 0.8, 1.6, 1.6, ht, th, SPR.circle, col('#e9eaff'), '#c9cbe0');
      billC(cx, cy, th + 0.1, 1.6, 1.6, SPR.glow, rgba(0.8, 0.7, 1, 0.35 + 0.15 * Math.sin(real * 2)));
      if (labels) labelAt(labels, cx, cy, th + 0.8, 'SPACE ELEVATOR', 13, '#e0d4ff');
      break;
    }
    case 'splitter': case 'sorter': { const it = e.buf[0]; if (it && zoomed) billC(cx, cy, ht + 0.25, 0.35, 0.35, SPR['i:' + it]); break; }
    case 'merger': { const it = e.slot.find((q: any) => q); if (it && zoomed) billC(cx, cy, ht + 0.25, 0.35, 0.35, SPR['i:' + it]); break; }
    case 'decor':
      if (e.type === 'lamp') billC(cx, cy, 0.4, 4, 4, SPR.lampglow);
      break;
  }
  if ((e.st === 'nopower' || e.st === 'lowpower') && Math.sin(real * 5) > -0.2) billC(cx, cy, ht + (zoomed && k === 'machine' ? 1.35 : 0.6), 0.45, 0.45, SPR.bolt);
}
/** extra 3D details: chimneys, cogs, arms, tanks... with idle and working animations */
function props(e: Ent, ht: number, time: number, real: number, busy: boolean) {
  const x = e.x, y = e.y, w = e.w, h = e.h, cx = x + w / 2, cy = y + h / 2;
  const blink = (period: number, off = 0) => ((real + off) % period) < period * 0.5;
  const cogC = col('#b8bec6');
  const near = U >= 18 * view.dpr;
  const eastCog = (zf: number, size: number, speed: number, off = 0.5) => near &&
    wallQuad(x + w + 0.005, y + h * off, 0, 1, ht * zf, size, busy ? time * speed : real * 0.15, SPR.gear, cogC);
  const southCog = (zf: number, size: number, speed: number, off = 0.5) => near &&
    wallQuad(x + w * off, y + h + 0.005, 1, 0, ht * zf, size, busy ? -time * speed : -real * 0.15, SPR.gear, cogC);
  const lamp = (px: number, py: number, pz: number, hex: string, on: boolean) =>
    billC(px, py, pz, on ? 0.22 : 0.12, on ? 0.22 : 0.12, on ? SPR.glow : SPR.circle, on ? col(hex, 0.95) : col('#3a3d44'));
  const genLoad = e.avail > 0 && e.pnet ? e.pnet.load : 0;
  switch (e.type) {
    case 'smelter': {
      cyl(x + 0.45, y + 0.45, 0.2, ht, ht + 0.75, '#6a6e76', '#2a2c30');
      if (busy ? Math.random() < 0.08 : Math.random() < 0.004) smoke(x + 0.45, y + 0.45, ht + 0.8, false, busy ? 1 : 0.6);
      const glow = busy ? 0.75 + 0.25 * Math.sin(real * 9) : 0.18 + 0.08 * Math.sin(real * 1.5);
      wallQuad(cx, y + h + 0.005, 1, 0, ht * 0.4, 0.55, 0, SPR.glow, rgba(1, 0.55, 0.15, glow));
      eastCog(0.5, 0.45, 3);
      break;
    }
    case 'constructor': {
      const press = busy ? Math.abs(Math.sin(time * 4)) * 0.22 : 0.05 + Math.sin(real * 1.2) * 0.02;
      cyl(cx, cy, 0.12, ht, ht + 0.5 + press, '#9aa2ac');
      block(cx - 0.3, cy - 0.3, 0.6, 0.6, ht + 0.25 + press, ht + 0.4 + press, SPR.white, col('#c8ced6'), '#8a929c');
      eastCog(0.5, 0.5, 4, 0.3); eastCog(0.5, 0.35, -5.5, 0.72);
      southCog(0.5, 0.45, 3);
      lamp(x + 0.25, y + h - 0.25, ht + 0.15, busy ? '#4cc38a' : '#f2c94c', busy || blink(2));
      break;
    }
    case 'assembler': {
      for (const [ox, oy, ph] of [[0.9, 0.9, 0], [w - 0.9, h - 0.9, 1.7]]) {
        const a = busy ? Math.sin(time * 2.2 + ph) * 1.3 + ph : Math.sin(real * 0.4 + ph) * 0.3 + ph;
        cyl(x + ox, y + oy, 0.2, ht, ht + 0.3, '#3a3d44');
        ground(x + ox + Math.cos(a) * 0.45, y + oy + Math.sin(a) * 0.45, 1.0, 0.25, a, SPR.arm, WHITE, ht + 0.35);
      }
      southCog(0.45, 0.6, 2.5, 0.3); southCog(0.45, 0.42, -3.6, 0.62);
      eastCog(0.45, 0.55, 3);
      for (let i = 0; i < 3; i++) lamp(x + w - 0.3, y + 0.3 + i * 0.25, ht + 0.1, '#4ea1ff', busy ? Math.sin(real * 6 + i) > 0 : i === ((real | 0) % 3));
      break;
    }
    case 'foundry': {
      cyl(x + 0.5, y + 0.5, 0.26, ht, ht + 1.0, '#5a5e66', '#2a2c30');
      cyl(x + w - 0.5, y + 0.5, 0.22, ht, ht + 0.85, '#5a5e66', '#2a2c30');
      if (busy) { if (Math.random() < 0.1) smoke(x + 0.5, y + 0.5, ht + 1.05, true, 1.2); if (Math.random() < 0.07) smoke(x + w - 0.5, y + 0.5, ht + 0.9, true); }
      billC(cx, cy, ht + 0.1, 1.4, 1.4, SPR.glow, rgba(1, 0.5, 0.15, busy ? 0.35 + 0.15 * Math.sin(real * 7) : 0.1));
      southCog(0.5, 0.6, 2);
      break;
    }
    case 'refinery': {
      cyl(x + 0.75, y + 0.75, 0.5, ht, ht + 1.3, '#c8ccd2', '#a0a6ae');
      cyl(x + w - 0.8, y + 0.75, 0.42, ht, ht + 1.0, '#d4a84a', '#b08a3a');
      cyl(x + 0.75, y + h - 0.8, 0.38, ht, ht + 0.8, '#c8ccd2');
      cyl(x + w - 0.6, y + h - 0.6, 0.1, ht, ht + 2.0, '#6a6e76');
      const fl = busy ? 0.55 + 0.2 * Math.sin(real * 13) + 0.1 * Math.sin(real * 29) : 0.18 + 0.04 * Math.sin(real * 5);
      bill(x + w - 0.6, y + h - 0.6, ht + 2.0, 0.56 * fl, 1.0 * fl, SPR.flame);
      eastCog(0.5, 0.5, 2.5, 0.35);
      break;
    }
    case 'manufacturer': {
      for (let i = 0; i < 3; i++) ground(x + 0.9 + i * 1.1, y + 0.9, 0.9, 0.9, (busy ? time * 2 : real * 0.1) * (i % 2 ? -1 : 1), SPR.gear, cogC, ht + 0.02);
      cyl(x + w - 0.7, y + h - 0.7, 0.3, ht, ht + 0.6, '#2fa596');
      const LC = ['#ef5b5b', '#f2c94c', '#4cc38a', '#4ea1ff', '#c77dff'];
      for (let i = 0; i < 5; i++) {
        const on = busy ? Math.sin(real * 5 + i * 1.3) > 0 : i === ((real * 1.5) | 0) % 5;
        wallQuad(x + 0.5 + i * 0.7, y + h + 0.005, 1, 0, ht * 0.7, 0.18, 0, SPR.circle, col(LC[i], on ? 1 : 0.25));
      }
      eastCog(0.45, 0.7, 2, 0.5);
      break;
    }
    case 'miner1': case 'miner2': case 'miner3': {
      const bob = busy ? Math.abs(Math.sin(time * 6)) * 0.15 : 0;
      const hc = BLD[e.type].col;
      cyl(cx, cy, 0.18, ht, ht + 0.7 - bob, '#8a929c');
      block(cx - 0.28, cy - 0.28, 0.56, 0.56, ht + 0.7 - bob, ht + 0.85 - bob, SPR.white, col(hc), hc);
      if (busy && Math.random() < 0.05) spawn(cx + (Math.random() - 0.5), cy + (Math.random() - 0.5), { z: 0.2, vz: 2, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 0.6, col: hexCol(ITEMS[e.node.res].c), size: 0.1, grav: 12 });
      eastCog(0.5, 0.4, 5);
      break;
    }
    case 'harvester':
      if (busy && Math.random() < 0.08) spawn(cx, cy, { z: ht, vz: 2, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 0.6, col: hexCol('#c8a070'), size: 0.08, grav: 12 });
      break;
    case 'water_extractor': {
      const p = busy ? Math.sin(time * 3) * 0.12 : Math.sin(real * 0.8) * 0.02;
      cyl(cx, cy, 0.22, ht, ht + 0.45 + p, '#3f8fe0', '#8ac4f8');
      if (busy && Math.random() < 0.05) spawn(cx, cy, { z: 0.05, vz: 1.5, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 0.6, col: rgba(0.7, 0.85, 1, 0.8), size: 0.08, grav: 8 });
      break;
    }
    case 'oil_extractor': {
      const a = busy ? Math.sin(time * 2.2) * 0.35 : Math.sin(real * 0.5) * 0.05;
      cyl(cx - 0.3, cy - 0.3, 0.08, ht, ht + 0.8, '#3a3d44');
      billC(cx - 0.3, cy - 0.3, ht + 0.85, 1.1, 0.55, SPR.pumphead, WHITE, a);
      break;
    }
    case 'biomass_burner':
      cyl(x + 0.5, y + 0.5, 0.16, ht, ht + 0.6, '#6a5a4a', '#2a2420');
      if (genLoad > 0 && Math.random() < 0.08 * genLoad) smoke(x + 0.5, y + 0.5, ht + 0.65, true);
      wallQuad(cx, y + h + 0.005, 1, 0, ht * 0.4, 0.5, 0, SPR.flame, rgba(1, 1, 1, genLoad > 0 ? 0.6 + 0.3 * Math.sin(real * 11) : 0.1));
      break;
    case 'coal_gen':
      cyl(x + 0.6, y + 0.6, 0.35, ht, ht + 1.1, '#c8c4bc', '#8a8680');
      cyl(x + w - 0.6, y + 0.6, 0.3, ht, ht + 0.9, '#c8c4bc', '#8a8680');
      if (genLoad > 0 && Math.random() < 0.12 * genLoad) smoke(x + 0.6, y + 0.6, ht + 1.15, false, 1.4);
      wallQuad(x + w + 0.005, y + h * 0.5, 0, 1, ht * 0.45, 0.6, time * 3 * (genLoad || 0.05), SPR.gear, cogC);
      break;
    case 'fuel_gen':
      cyl(x + w - 0.5, y + 0.5, 0.15, ht, ht + 1.2, '#5a5e66', '#1a1c20');
      if (genLoad > 0 && Math.random() < 0.1 * genLoad) smoke(x + w - 0.5, y + 0.5, ht + 1.25, true);
      wallQuad(x + w * 0.5, y + h + 0.005, 1, 0, ht * 0.45, 0.6, -time * 4 * (genLoad || 0.05), SPR.gear, cogC);
      break;
    case 'battery':
      for (let i = 0; i < 4; i++) lamp(x + 0.3 + i * 0.4, y + h - 0.2, ht + 0.05, '#4ac0a0', e.stored / BLD.battery.cap > i / 4 && (e.pnet && e.pnet.batFlow > 0 ? blink(0.8, i * 0.2) : true));
      break;
    case 'storage': case 'storage2': {
      const n = Math.min(4, Math.ceil(e.tot / BLD[e.type].cap * 4));
      const spots = [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]];
      for (let i = 0; i < n; i++) { const [fx, fy] = spots[i]; block(x + w * fx - 0.25, y + h * fy - 0.25, 0.5, 0.5, ht, ht + 0.35, SPR.crate, WHITE, '#9a6f40'); }
      break;
    }
    case 'hub': {
      cyl(x + w - 0.7, y + 0.7, 0.07, ht, ht + 1.4, '#9aa2ac');
      lamp(x + w - 0.7, y + 0.7, ht + 1.45, '#ef5b5b', blink(1.2));
      const sx = Math.cos(real * 0.8);
      billC(x + 0.9, y + 0.9, ht + 0.55, 0.9 * Math.max(0.15, Math.abs(sx)), 0.75, SPR.dish);
      break;
    }
    case 'drone_port': case 'station':
      lamp(x + 0.3, y + 0.3, ht + 0.1, '#f2c94c', blink(1.6));
      lamp(x + w - 0.3, y + h - 0.3, ht + 0.1, '#f2c94c', blink(1.6, 0.8));
      break;
    case 'sink':
      billC(cx, cy, ht + 0.2, 1.3, 1.3, SPR.glow, rgba(1, 0.5, 0.8, 0.12 + 0.06 * Math.sin(real * 3)));
      break;
    case 'splitter': case 'merger': case 'sorter':
      ground(cx, cy, 0.4, 0.4, real * 1.5, SPR.gear, col('#e8e0c0'), ht + 0.01);
      break;
    case 'elevator':
      for (let i = 0; i < 4; i++) lamp(cx - 0.8 + (i % 2) * 1.6, cy - 0.8 + (i >> 1) * 1.6, 5.05, '#ef5b5b', blink(1.5, i * 0.37));
      break;
  }
}
function labelAt(labels: Label[], x: number, y: number, z: number, t: string, px: number, c: string) {
  const [sx, sy] = P(x, y, z);
  labels.push([sx / view.dpr, sy / view.dpr, t, px, c]);
}

function drawTrainCar(t: any, i: number) {
  const pts = trainPoints(t);
  const f = pts[2 * i], r = pts[2 * i + 1];
  const x = (f[0] + r[0]) / 2, y = (f[1] + r[1]) / 2, a = Math.atan2(f[1] - r[1], f[0] - r[0]);
  const loco = t.cars[i] === 'loco';
  ground(x + 0.2, y + 0.1, 2.1, 1.0, a, SPR.shadow, SHADOW);
  rbox(x, y, 1.9, 0.8, a, 0.1, 0.75, SPR[loco ? 'loco' : 'wagon'], WHITE, loco ? '#b0402c' : '#6a5e52');
  if (!loco && t.tot > 0) { const k = Object.keys(t.cargo)[0]; if (k) ground(x, y, 1.4, 0.45, a, SPR.white, col(ITEMS[k].c, 0.95), 0.76); }
  if (view.inspectTrain === t) for (const p of pts) billC(p[0], p[1], 1, 0.2, 0.2, SPR.circle, col('#f5a524', 0.9));
}

function drawGhost(gh: any, time: number, real: number) {
  const ok = gh.ok !== false;
  const tint = ok ? rgba(0.75, 1, 0.8, 0.62) : rgba(1, 0.35, 0.35, 0.62);
  const d = BLD[gh.type];
  if (!d) return;
  if (d.kind === 'train') {
    const c = ok ? col('#d0503a', 0.75) : rgba(1, 0.3, 0.3, 0.6);
    for (let i = 0; i < (gh.cells || []).length; i += 2) {
      const a = gh.cells[i], b = gh.cells[i + 1];
      if (b === undefined) continue;
      const ax2 = a % W + 0.5, ay2 = Math.floor(a / W) + 0.5, bx2 = b % W + 0.5, by2 = Math.floor(b / W) + 0.5;
      rbox((ax2 + bx2) / 2, (ay2 + by2) / 2, 1.9, 0.8, Math.atan2(ay2 - by2, ax2 - bx2), 0.1, 0.75, SPR[i === 0 ? 'loco' : 'wagon'], c, '#d0503a', 0.6);
    }
    if (!gh.cells) ground(gh.x + 0.5, gh.y + 0.5, 1, 1, 0, SPR.white, rgba(1, 0.3, 0.3, 0.45), 0.02);
    return;
  }
  const [w, h] = gh.rot & 1 ? [d.h, d.w] : [d.w, d.h];
  const e: any = { ...gh, w, h, born: -99, pop: 0, isExit: gh.isExit, curve: -1 };
  if (d.kind === 'pole' || d.kind === 'hub') ground(gh.x + w / 2, gh.y + h / 2, w + d.area * 2, h + d.area * 2, 0, SPR.white, rgba(1, 0.85, 0.3, 0.14), 0.01);
  if (d.kind !== 'belt' && d.kind !== 'rail' && d.kind !== 'pipe' && d.kind !== 'tunnel' && d.kind !== 'ptunnel') e.ft = frontTilesOf(e);
  if (!ok) ground(gh.x + w / 2, gh.y + h / 2, w, h, 0, SPR.white, rgba(1, 0.2, 0.2, 0.25), 0.02);
  drawBuilding(e, time, real, null, tint);
}
function frontTilesOf(e: any) {
  const out: number[][] = [];
  const { x, y, w, h, rot } = e;
  if (rot === 0) for (let j = 0; j < h; j++) out.push([x + w, y + j]);
  else if (rot === 2) for (let j = 0; j < h; j++) out.push([x - 1, y + j]);
  else if (rot === 1) for (let i = 0; i < w; i++) out.push([x + i, y + h]);
  else for (let i = 0; i < w; i++) out.push([x + i, y - 1]);
  return out;
}
export { PAIRS, isFluid };
