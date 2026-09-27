// Shared view state: camera, mouse, overlays, particles.
import { clamp } from './util';
import { H, W } from './terrain';

export const view = {
  cam: { x: 512, y: 512, s: 30 }, // s = iso unit: a tile's diamond is 2s wide and s tall (CSS px)
  cw: 1, ch: 1, dpr: 1,
  mouse: { sx: 0, sy: 0, wx: 0, wy: 0, tx: 0, ty: 0, inCanvas: false },
  ghosts: [] as any[],          // {type,x,y,rot,ok,recipe?,pairs?,belt?} drawn translucent
  sel: null as null | { x0: number; y0: number; x1: number; y1: number; col: number },
  showPower: false,
  inspect: null as any,
  inspectTrain: null as any,
  inspectTruck: null as any,
  level: 0,                     // active floor (0 = ground)
  hover: null as any,
  marker: null as null | { x: number; y: number; z: number },
  powerPreview: null as null | { x: number; y: number; links: number[][]; reach: number; ok: boolean },
};
export const MIN_S = 1.2, MAX_S = 110;
export const TILT = 0.64; // vertical squash of the ground diamond (0.5 = classic isometric, 1 = top-down)
export const ZH = 0.72; // screen height of one tile of elevation, in units of s

/** projection hooks, provided by the active renderer (3D core) */
export const proj = {
  s2w: (x: number, y: number): [number, number] => [x, y],
  w2s: (x: number, y: number, _z = 0): [number, number] => [x, y],
  sd2w: (dx: number, dy: number): [number, number] => [dx, dy],
};
export function s2w(x: number, y: number): [number, number] { return proj.s2w(x, y); }
export function w2s(x: number, y: number, z = 0): [number, number] { return proj.w2s(x, y, z); }
/** convert a screen-space drag delta into a world-space delta */
export function sd2w(dx: number, dy: number): [number, number] { return proj.sd2w(dx, dy); }
export function clampCam() { const c = view.cam; c.x = clamp(c.x, 0, W); c.y = clamp(c.y, 0, H); c.s = clamp(c.s, MIN_S, MAX_S); }
export function updMouseWorld() {
  const m = view.mouse; const [wx, wy] = s2w(m.sx, m.sy);
  m.wx = wx; m.wy = wy; m.tx = Math.floor(wx); m.ty = Math.floor(wy);
}

// --- particles (world space, z = height above ground in tiles)
export interface Part { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; col: number; spr: string; rot: number; vr: number; grav: number; grow?: number }
export const parts: Part[] = [];
export function spawn(x: number, y: number, o: Partial<Part>) {
  if (parts.length > 1500) return;
  parts.push({ x, y, z: o.z || 0, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1, max: o.life || 1, size: o.size || 0.1, col: o.col ?? 0xffffffff, spr: o.spr || 'white', rot: o.rot ?? Math.random() * 6, vr: o.vr ?? (Math.random() - 0.5) * 10, grav: o.grav || 0, grow: o.grow || 0 });
}
export function updParts(dt: number) {
  let j = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.grav * dt;
    if (p.z < 0) { p.z = 0; p.vz = -p.vz * 0.3; p.vx *= 0.5; p.vy *= 0.5; }
    p.vx *= 1 - dt * 1.5; p.vy *= 1 - dt * 1.5; p.life -= dt; p.rot += p.vr * dt; p.size += (p.grow || 0) * dt;
    if (p.life > 0) parts[j++] = p;
  }
  parts.length = j;
}
