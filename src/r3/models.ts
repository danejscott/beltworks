// Procedural 3D models: buildings (static + animated parts), items, nodes, trees, vehicles, belts, rails, pipes.
// Local space: footprint centred on the origin, y up, +x = the building's front (output side), +z = world south.
import * as THREE from 'three';
import { ITEMS } from '../data';
import { B, M, Mat, Model, rockGeo, std } from './mat';

export interface AnimOut { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number }
export interface Anim { key: string; model: Model; fn: (o: AnimOut, e: any, t: number, real: number, busy: boolean) => void }
export interface Template { stat: Model; anims: Anim[]; height: number; light: number[] | null; smoke?: number[][]; glow?: number[][] }

const TAU = Math.PI * 2;
function pad(b: B, S: number, trim = true) {
  const s = S - 0.08;
  b.box(s, 0.14, s, 0, 0, 0, M.concrete);
  if (trim) { b.box(s, 0.03, 0.07, 0, 0.14, s / 2 - 0.035, M.yellow); b.box(0.07, 0.03, s, s / 2 - 0.035, 0.14, 0, M.yellow); }
}
function gear(r: number, thick: number, teeth: number, axis: 'x' | 'y' | 'z', m: Mat = M.steel): Model {
  const b = new B();
  b.cyl(r * 0.82, thick, 0, -thick / 2, 0, m, 18);
  b.cyl(r * 0.25, thick * 1.4, 0, -thick * 0.7, 0, M.steelDk, 10);
  for (let i = 0; i < teeth; i++) {
    const a = i / teeth * TAU;
    b.add(new THREE.BoxGeometry(r * 0.3, thick, r * 0.22), m, Math.cos(a) * r * 0.88, 0, Math.sin(a) * r * 0.88, 0, -a, 0);
  }
  const mdl = b.build();
  if (axis === 'z') mdl.geo.rotateX(Math.PI / 2);
  if (axis === 'x') mdl.geo.rotateZ(Math.PI / 2);
  return mdl;
}
function fan(r: number, m: Mat = M.steel): Model {
  const b = new B();
  b.cyl(r * 0.18, 0.08, 0, -0.04, 0, M.steelDk, 10);
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; b.add(new THREE.BoxGeometry(r * 0.85, 0.02, r * 0.28), m, Math.cos(a) * r * 0.5, 0, Math.sin(a) * r * 0.5, 0.25, -a, 0); }
  return b.build();
}
const one = (fn: (b: B) => void) => { const b = new B(); fn(b); return b.build(); };
const tierMat = (t: string) => t.endsWith('3') ? M.red : t.endsWith('2') ? M.blue : M.orange;

// ---------------------------------------------------------------------------
export function buildTemplates(): Record<string, Template> {
  const T: Record<string, Template> = Object.create(null);

  // ---- Miners
  for (const t of ['miner1', 'miner2', 'miner3']) {
    const b = new B(); pad(b, 2);
    for (const sx of [-0.72, 0.72]) for (const sz of [-0.72, 0.72]) b.box(0.14, 1.5, 0.14, sx, 0.14, sz, M.steelDk);
    b.beam([-0.72, 0.3, 0.72], [0.72, 1.35, 0.72], 0.07, M.steelDk); b.beam([0.72, 0.3, -0.72], [0.72, 1.35, 0.72], 0.07, M.steelDk);
    b.box(1.45, 0.75, 1.45, 0, 1.45, 0, tierMat(t));
    b.box(1.47, 0.08, 1.47, 0, 1.62, 0, M.steelDk);
    b.box(1.05, 0.22, 1.05, 0, 2.2, 0, M.steelDk);
    b.box(0.35, 0.06, 0.9, -0.25, 2.42, 0, M.grey); b.box(0.35, 0.06, 0.9, 0.25, 2.42, 0, M.grey);
    b.cyl(0.26, 0.35, 0.3, 2.42, 0.3, M.steel, 14);
    b.box(0.55, 0.55, 0.7, 0.82, 0.14, 0, M.orangeDk); b.box(0.2, 0.1, 0.55, 1.02, 0.69, 0, M.black);
    b.box(0.3, 0.4, 0.04, -0.2, 1.6, 0.735, M.black);
    T[t] = {
      stat: b.build(), height: 2.6, light: [0.6, 2.5, 0.6],
      anims: [{
        key: 'drill', model: one(b2 => { b2.cyl(0.14, 1.25, 0, 0, 0, M.steel, 12); b2.cone(0.26, 0.35, 0, -0.35, 0, M.steelDk, 10); b2.torus(0.2, 0.04, 0, 0.9, 0, M.steelDk); }),
        fn: (o, e, t, _r, busy) => { const bob = busy ? Math.abs(Math.sin(t * 5)) * 0.12 : 0; o.y = 0.35 - bob; o.ry = busy ? t * 9 * e.clock : 0; },
      }],
    };
  }
  // ---- Smelter
  {
    const b = new B(); pad(b, 2);
    b.box(1.45, 1.05, 1.3, -0.1, 0.14, 0, M.orange);
    b.box(1.55, 0.12, 1.4, -0.1, 1.19, 0, M.steelDk);
    b.box(0.85, 0.52, 0.05, -0.1, 0.3, 0.66, M.black);
    b.box(0.7, 0.38, 0.05, -0.1, 0.36, 0.68, M.glowOrange);
    b.cyl(0.2, 1.35, -0.55, 1.31, -0.38, M.steelDk, 14); b.torus(0.21, 0.03, -0.55, 2.4, -0.38, M.grey);
    b.box(0.42, 0.42, 0.6, 0.78, 0.14, 0, M.orangeDk);
    b.box(0.32, 0.6, 0.85, -0.86, 0.14, 0, M.steel);
    b.hcyl(0.07, 1.2, -0.1, 0.95, 0.67, M.steel, 'x');
    for (let i = 0; i < 3; i++) b.box(0.05, 0.4, 0.25, 0.64, 0.55, -0.45 + i * 0.3, M.grey);
    T.smelter = { stat: b.build(), height: 2.7, light: [0.55, 1.35, 0.55], anims: [], smoke: [[-0.55, 2.7, -0.38]], glow: [[-0.1, 0.55, 0.9]] };
  }
  // ---- Constructor
  {
    const b = new B(); pad(b, 2);
    b.box(1.6, 1.15, 0.22, 0, 0.14, -0.68, M.orange); b.box(1.6, 1.15, 0.22, 0, 0.14, 0.68, M.orange);
    b.box(0.22, 1.15, 1.14, -0.7, 0.14, 0, M.orange);
    b.box(1.72, 0.18, 1.62, 0, 1.29, 0, M.steelDk);
    b.box(1.1, 0.22, 1.1, 0.05, 0.14, 0, M.black);
    b.box(0.8, 0.3, 0.8, -0.15, 1.47, 0, M.orange); b.cyl(0.1, 0.25, 0.4, 1.47, 0.4, M.steel, 10);
    b.box(0.5, 0.35, 0.02, 0.2, 0.55, 0.795, M.glass);
    b.box(0.4, 0.35, 0.55, 0.85, 0.14, 0, M.orangeDk);
    const g = gear(0.24, 0.06, 10, 'z');
    T['constructor' as string] = {
      stat: b.build(), height: 1.8, light: [0.7, 1.45, 0.7],
      anims: [
        { key: 'press', model: one(b2 => { b2.box(0.62, 0.1, 0.62, 0, 0, 0, M.steel); b2.cyl(0.07, 0.5, 0, 0.1, 0, M.steelDk, 8); }), fn: (o, _e, t, real, busy) => { o.y = 0.72 + (busy ? Math.abs(Math.sin(t * 4)) * 0.28 : 0.2 + Math.sin(real) * 0.01); o.x = 0.05; } },
        { key: 'cog', model: g, fn: (o, _e, t, real, busy) => { o.x = -0.35; o.y = 0.75; o.z = 0.82; o.rz = busy ? t * 3 : real * 0.1; } },
        { key: 'cog', model: g, fn: (o, _e, t, real, busy) => { o.x = 0.05; o.y = 0.95; o.z = 0.82; o.rz = busy ? -t * 3 + 0.3 : -real * 0.1; } },
      ],
    };
  }
  // ---- Assembler
  {
    const b = new B(); pad(b, 3);
    for (const sx of [-1.25, 1.25]) for (const sz of [-1.25, 1.25]) b.box(0.3, 1.9, 0.3, sx, 0.14, sz, M.orange);
    for (const s of [-1.25, 1.25]) { b.box(2.8, 0.22, 0.25, 0, 2.04, s, M.steelDk); b.box(0.25, 0.22, 2.8, s, 2.04, 0, M.steelDk); }
    b.box(2.8, 0.1, 1.3, 0, 2.26, -0.75, M.orange);
    b.box(2.6, 0.06, 1.0, 0, 2.26, 0.65, M.glass);
    b.box(1.4, 0.5, 1.0, 0.1, 0.14, 0, M.steelDk);
    b.box(0.6, 1.3, 2.3, -1.0, 0.14, 0, M.grey);
    b.box(0.08, 0.5, 0.6, -0.68, 0.7, 0, M.glowBlue);
    b.box(0.55, 0.4, 0.8, 1.2, 0.14, 0, M.orangeDk);
    const arm = one(b2 => {
      b2.cyl(0.16, 0.25, 0, 0, 0, M.steelDk, 12);
      b2.add(new THREE.BoxGeometry(0.14, 0.65, 0.14), M.yellow, 0.12, 0.5, 0, 0, 0, -0.5);
      b2.add(new THREE.BoxGeometry(0.6, 0.11, 0.11), M.yellow, 0.5, 0.78, 0, 0, 0, 0.35);
      b2.sphere(0.08, 0.28, 0.78, 0, M.steelDk, 8);
      b2.box(0.12, 0.18, 0.12, 0.78, 0.8, 0, M.steel);
    });
    T.assembler = {
      stat: b.build(), height: 2.4, light: [1.25, 2.1, 1.25],
      anims: [
        { key: 'arm', model: arm, fn: (o, _e, t, real, busy) => { o.x = -0.3; o.y = 0.64; o.z = -0.55; o.ry = busy ? Math.sin(t * 2.2) * 1.2 : Math.sin(real * 0.4) * 0.15; } },
        { key: 'arm', model: arm, fn: (o, _e, t, real, busy) => { o.x = 0.5; o.y = 0.64; o.z = 0.55; o.ry = Math.PI + (busy ? Math.sin(t * 2.2 + 1.7) * 1.2 : Math.sin(real * 0.4 + 1) * 0.15); } },
      ],
    };
  }
  // ---- Foundry
  {
    const b = new B(); pad(b, 3);
    b.box(2.7, 1.2, 1.3, 0, 0.14, -0.7, M.orange);
    b.box(2.75, 0.12, 1.35, 0, 1.34, -0.7, M.steelDk);
    for (const x of [-0.65, 0.65]) {
      b.cyl(0.55, 1.45, x, 0.14, 0.55, M.steelDk, 18); b.torus(0.56, 0.05, x, 0.9, 0.55, M.orange); b.torus(0.56, 0.05, x, 1.4, 0.55, M.orange);
      b.cyl(0.45, 0.04, x, 1.58, 0.55, M.glowOrange, 18);
    }
    b.cyl(0.24, 1.6, -0.9, 1.46, -0.95, M.steelDk, 14); b.cyl(0.2, 1.3, 0.95, 1.46, -0.95, M.steelDk, 14);
    b.box(0.5, 0.45, 0.8, 1.3, 0.14, 0.5, M.orangeDk);
    T.foundry = { stat: b.build(), height: 3.1, light: [1.3, 1.5, -0.3], anims: [], smoke: [[-0.9, 3.1, -0.95], [0.95, 2.8, -0.95]], glow: [[-0.65, 1.7, 0.55], [0.65, 1.7, 0.55]] };
  }
  // ---- Refinery
  {
    const b = new B(); pad(b, 4);
    b.cyl(0.78, 3.4, -0.8, 0.14, -0.8, M.white, 22); b.torus(0.8, 0.06, -0.8, 1.2, -0.8, M.orange); b.torus(0.8, 0.06, -0.8, 2.5, -0.8, M.orange);
    b.cone(0.78, 0.4, -0.8, 3.54, -0.8, M.greyLt, 22);
    b.torus(1.0, 0.04, -0.8, 2.0, -0.8, M.yellow);
    b.cyl(0.6, 2.2, 0.95, 0.14, -0.95, M.greyLt, 18); b.torus(0.62, 0.05, 0.95, 1.6, -0.95, M.orange);
    b.hcyl(0.45, 2.2, -0.2, 0.62, 1.0, M.steel, 'x');
    b.hcyl(0.1, 1.75, 0.07, 1.8, -0.9, M.steel, 'x'); b.hcyl(0.08, 1.8, -0.8, 0.9, 0.1, M.steel, 'z');
    b.cyl(0.1, 4.3, 1.45, 0.14, 1.45, M.steelDk, 10);
    b.box(0.9, 0.9, 0.7, 1.2, 0.14, 0.3, M.orange); b.box(0.5, 0.25, 0.02, 1.2, 0.6, 0.66, M.glass);
    T.refinery = { stat: b.build(), height: 4.4, light: [1.2, 1.1, 0.3], anims: [], glow: [[1.45, 4.55, 1.45]] };
  }
  // ---- Manufacturer
  {
    const b = new B(); pad(b, 4);
    b.box(3.6, 2.0, 3.2, 0, 0.14, -0.1, M.orange);
    b.box(3.7, 0.15, 3.3, 0, 2.14, -0.1, M.steelDk);
    for (const x of [-1.2, 0, 1.2]) b.box(0.55, 0.22, 2.7, x, 2.29, -0.1, M.glass);
    b.box(0.05, 1.3, 1.7, 1.81, 0.14, 0.2, M.black);
    for (let i = 0; i < 6; i++) b.box(0.02, 0.1, 0.1, 1.84, 1.0, -0.4 + i * 0.25, M.yellow);
    b.box(3.62, 0.25, 0.04, 0, 1.6, 1.51, M.steelDk);
    for (let i = 0; i < 5; i++) b.box(0.3, 0.3, 0.02, -1.4 + i * 0.7, 0.9, 1.51, M.glass);
    const f = fan(0.34);
    const vents = [[1.35, -1.35], [-1.35, -1.35]];
    for (const [x, z] of vents) b.cyl(0.38, 0.35, x, 2.29, z, M.steel, 16);
    T.manufacturer = {
      stat: b.build(), height: 2.9, light: [1.7, 2.3, 1.4],
      anims: vents.map(([x, z]) => ({ key: 'fan', model: f, fn: (o: AnimOut, _e: any, t: number, real: number, busy: boolean) => { o.x = x; o.y = 2.66; o.z = z; o.ry = busy ? t * 8 : real * 0.3; } })),
    };
  }
  // ---- Packager: canister carousel between two fluid tanks
  {
    const b = new B(); pad(b, 3);
    b.box(2.6, 0.9, 1.1, 0, 0.14, -0.8, M.orange); b.box(2.65, 0.1, 1.15, 0, 1.04, -0.8, M.steelDk);
    for (const x of [-0.85, 0.85]) { b.cyl(0.42, 1.6, x, 0.14, 0.55, M.white, 18); b.torus(0.43, 0.04, x, 1.2, 0.55, M.blue); b.cone(0.42, 0.25, x, 1.74, 0.55, M.greyLt, 18); }
    b.box(1.0, 0.5, 1.0, 0, 0.14, 0.55, M.steelDk); b.box(0.8, 0.04, 0.8, 0, 0.64, 0.55, M.yellow);
    b.box(0.5, 0.35, 0.02, 0.3, 0.55, -0.24, M.glass);
    T.packager = {
      stat: b.build(), height: 2.0, light: [1.2, 1.1, -1.2],
      anims: [{ key: 'carousel', model: one(b2 => { b2.cyl(0.38, 0.05, 0, 0, 0, M.steel, 16); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b2.cyl(0.07, 0.22, Math.cos(a) * 0.28, 0.05, Math.sin(a) * 0.28, M.grey, 8); } }), fn: (o, _e, t, real, busy) => { o.y = 0.68; o.z = 0.55; o.ry = busy ? t * 2 : real * 0.1; } }],
    };
  }
  // ---- Blender: big mixing vat with stirrers
  {
    const b = new B(); pad(b, 4);
    b.cyl(1.25, 2.1, -0.3, 0.14, 0, M.greyLt, 26); b.torus(1.27, 0.07, -0.3, 1.0, 0, M.orange); b.torus(1.27, 0.07, -0.3, 1.9, 0, M.orange);
    b.cyl(1.3, 0.12, -0.3, 2.24, 0, M.steelDk, 26);
    for (const z of [-1.3, 1.3]) { b.cyl(0.35, 1.5, 1.35, 0.14, z, M.white, 14); b.torus(0.36, 0.04, 1.35, 1.1, z, M.teal); }
    b.box(0.8, 1.1, 0.9, 1.35, 0.14, 0, M.orange); b.box(0.02, 0.3, 0.5, 1.76, 0.8, 0, M.glass);
    b.hcyl(0.1, 1.2, 0.65, 1.2, -1.0, M.steel, 'x'); b.hcyl(0.1, 1.2, 0.65, 1.2, 1.0, M.steel, 'x');
    T.blender = {
      stat: b.build(), height: 2.8, light: [1.35, 1.35, 0.5],
      anims: [{ key: 'stir', model: one(b2 => { b2.cyl(0.08, 0.7, 0, 0, 0, M.steelDk, 8); b2.box(1.3, 0.08, 0.12, 0, 0.62, 0, M.steel); b2.box(0.12, 0.08, 1.3, 0, 0.62, 0, M.steel); }), fn: (o, _e, t, real, busy) => { o.x = -0.3; o.y = 2.3; o.ry = busy ? t * 4 : real * 0.15; } }],
      glow: [[-0.3, 2.4, 0]],
    };
  }
  // ---- Particle Accelerator: a glowing ring on a massive base
  {
    const b = new B(); pad(b, 5);
    b.box(4.6, 0.5, 4.6, 0, 0.14, 0, M.steelDk);
    b.torus(1.75, 0.34, 0, 1.5, 0, M.white, Math.PI / 2);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; b.box(0.5, 0.9, 0.5, Math.cos(a) * 1.75, 0.64, Math.sin(a) * 1.75, M.orange, -a); b.box(0.56, 0.12, 0.56, Math.cos(a) * 1.75, 1.95, Math.sin(a) * 1.75, M.steelDk, -a); }
    b.box(1.1, 1.6, 1.1, 0, 0.64, 0, M.grey); b.cyl(0.35, 0.6, 0, 2.24, 0, M.steel, 16);
    b.box(0.8, 1.0, 0.8, 1.9, 0.64, 1.9, M.orange); b.box(0.02, 0.3, 0.5, 2.31, 1.1, 1.9, M.glass);
    T.particle_accelerator = {
      stat: b.build(), height: 2.9, light: [1.9, 1.75, 1.9],
      anims: [{ key: 'beam', model: one(b2 => b2.torus(1.75, 0.08, 0, 0, 0, M.glowPurple)), fn: (o, _e, t, real, busy) => { o.y = 1.5; o.s = busy ? 1 + Math.sin(t * 10) * 0.01 : 0.2; o.ry = real; } }],
      glow: [[0, 2.6, 0]],
    };
  }
  // ---- Harvester
  {
    const b = new B(); pad(b, 2);
    b.box(1.1, 0.8, 1.0, -0.35, 0.14, 0, M.green); b.box(1.12, 0.1, 1.02, -0.35, 0.94, 0, M.steelDk);
    b.box(0.5, 0.3, 0.02, -0.35, 0.5, 0.51, M.glass);
    b.beam([0.1, 0.8, 0], [0.75, 1.0, 0], 0.12, M.steelDk);
    b.box(0.45, 0.45, 0.6, 0.78, 0.14, 0, M.orangeDk);
    T.harvester = {
      stat: b.build(), height: 1.3, light: [-0.8, 1.05, 0.4],
      anims: [{ key: 'saw', model: one(b2 => { b2.cyl(0.38, 0.04, 0, -0.02, 0, M.steel, 20); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; b2.add(new THREE.ConeGeometry(0.05, 0.1, 4), M.steel, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, 0, 0, -Math.PI / 2 + 0); } }), fn: (o, _e, t, _r, busy) => { o.x = 0.75; o.y = 1.05; o.ry = busy ? t * 14 : 0; } }],
    };
  }
  // ---- Water extractor
  {
    const b = new B();
    b.box(1.9, 0.3, 1.9, 0, -0.15, 0, M.greyLt);
    for (const s of [-0.9, 0.9]) b.box(1.9, 0.08, 0.1, 0, 0.15, s, M.yellow);
    b.box(1.0, 0.95, 1.0, -0.2, 0.15, -0.2, M.blue); b.box(1.05, 0.1, 1.05, -0.2, 1.1, -0.2, M.steelDk);
    b.cyl(0.18, 1.4, 0.55, -0.4, 0.55, M.steel, 12);
    b.hcyl(0.12, 0.8, 0.55, 0.55, -0.2, M.steel, 'x');
    T.water_extractor = {
      stat: b.build(), height: 1.6, light: [-0.6, 1.25, 0.25],
      anims: [{ key: 'pump', model: one(b2 => { b2.cyl(0.12, 0.6, 0, 0, 0, M.steelDk, 10); b2.cyl(0.2, 0.12, 0, 0.6, 0, M.steel, 12); }), fn: (o, _e, t, real, busy) => { o.x = 0.55; o.z = 0.55; o.y = 1.0 + (busy ? Math.sin(t * 3) * 0.15 : Math.sin(real * 0.7) * 0.02); } }],
    };
  }
  // ---- Oil extractor (derrick + pumpjack)
  {
    const b = new B(); pad(b, 2);
    for (const sx of [-0.75, 0.75]) for (const sz of [-0.75, 0.75]) b.beam([sx, 0.14, sz], [sx * 0.2, 3.0, sz * 0.2], 0.08, M.steelDk);
    for (const h of [0.9, 1.7, 2.4]) { const k = 1 - (h - 0.14) / 2.86 * 0.8; for (const s of [-1, 1]) { b.beam([-0.75 * k, h, s * 0.75 * k], [0.75 * k, h, s * 0.75 * k], 0.05, M.steelDk); b.beam([s * 0.75 * k, h, -0.75 * k], [s * 0.75 * k, h, 0.75 * k], 0.05, M.steelDk); } }
    b.box(0.5, 0.3, 0.5, 0, 3.0, 0, M.purple);
    b.box(0.7, 0.5, 0.5, -0.4, 0.14, 0.45, M.purple);
    b.box(0.12, 0.9, 0.12, 0.35, 0.14, -0.45, M.steelDk);
    b.cyl(0.12, 0.6, 0.8, 0.14, 0, M.steel, 10);
    T.oil_extractor = {
      stat: b.build(), height: 3.3, light: [-0.4, 0.75, 0.75],
      anims: [{ key: 'jack', model: one(b2 => { b2.box(1.4, 0.12, 0.14, 0.1, -0.06, 0, M.purple); b2.box(0.2, 0.35, 0.18, 0.75, -0.2, 0, M.red); b2.box(0.25, 0.25, 0.25, -0.55, -0.15, 0, M.steelDk); }), fn: (o, _e, t, real, busy) => { o.x = 0.35; o.y = 1.1; o.z = -0.45; o.rz = busy ? Math.sin(t * 2.2) * 0.35 : Math.sin(real * 0.4) * 0.03; } }],
    };
  }
  // ---- Storage
  for (const [t, S] of [['storage', 2], ['storage2', 3]] as [string, number][]) {
    const b = new B(); pad(b, S, false);
    const w = S - 0.25, h = S === 2 ? 1.3 : 1.9, d = S - 0.35;
    b.box(w, h, d, 0, 0.14, 0, S === 2 ? M.orange : M.greyLt);
    b.box(w + 0.04, 0.1, d + 0.04, 0, 0.14 + h, 0, M.steelDk);
    for (let i = 0; i <= 6; i++) { const x = -w / 2 + 0.1 + i * (w - 0.2) / 6; b.box(0.05, h - 0.1, d + 0.04, x, 0.19, 0, M.grey); }
    b.box(0.04, h * 0.7, d * 0.6, w / 2 + 0.02, 0.19, 0, M.black);
    T[t] = { stat: b.build(), height: h + 0.3, light: [w / 2, h + 0.1, d / 2], anims: [] };
  }
  // ---- Sink
  {
    const b = new B(); pad(b, 3);
    b.cyl(1.25, 0.6, 0, 0.14, 0, M.steelDk, 28);
    b.add(new THREE.CylinderGeometry(1.2, 0.35, 0.9, 28, 1, true), M.grey, 0, 1.19, 0);
    b.cyl(0.35, 0.3, 0, 0.74, 0, M.glowPink, 18);
    b.torus(1.22, 0.06, 0, 1.64, 0, M.orange);
    T.sink = { stat: b.build(), height: 1.8, light: [1.1, 0.8, 1.1], anims: [{ key: 'ring', model: one(b2 => { b2.torus(0.7, 0.05, 0, 0, 0, M.glowPink); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b2.box(0.08, 0.05, 0.3, Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7, M.steel, -a); } }), fn: (o, e, t) => { o.y = 1.2; o.ry = t * (e.sinkT > 0 ? 4 : 0.6); } }] };
  }
  // ---- Fluid tank
  {
    const b = new B(); pad(b, 2, false);
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.55, 0.55]) b.box(0.1, 0.4, 0.1, sx, 0.14, sz, M.steelDk);
    b.cyl(0.85, 1.9, 0, 0.5, 0, M.white, 24); b.add(new THREE.SphereGeometry(0.85, 24, 8, 0, TAU, 0, Math.PI / 2), M.white, 0, 2.4, 0);
    b.torus(0.87, 0.04, 0, 1.4, 0, M.orange);
    b.box(0.05, 1.9, 0.25, 0.87, 0.5, 0.2, M.steelDk);
    T.tank = { stat: b.build(), height: 3.2, light: null, anims: [] };
  }
  // ---- Splitters / mergers
  for (const [t, top] of [['splitter', M.orange], ['merger', M.yellow], ['sorter', M.blue]] as [string, Mat][]) {
    const b = new B();
    b.box(0.82, 0.5, 0.82, 0, 0, 0, M.steelDk);
    b.box(0.86, 0.08, 0.86, 0, 0.5, 0, top);
    b.box(0.3, 0.3, 0.6, 0.35, 0.1, 0, M.black);
    b.add(new THREE.ConeGeometry(0.12, 0.25, 3), M.white, 0.2, 0.62, 0, 0, 0, -Math.PI / 2);
    T[t] = { stat: b.build(), height: 0.7, light: null, anims: [] };
  }
  // ---- Power poles / tower
  T.pole1 = { stat: one(b => { b.cyl(0.14, 0.1, 0, 0, 0, M.concrete, 8); b.cyl(0.055, 1.9, 0, 0, 0, M.wood, 8); b.box(0.7, 0.07, 0.07, 0, 1.72, 0, M.wood); for (const x of [-0.3, 0.3]) b.cyl(0.04, 0.12, x, 1.79, 0, M.white, 6); }), height: 1.95, light: null, anims: [] };
  T.pole2 = { stat: one(b => { b.cyl(0.18, 0.12, 0, 0, 0, M.concrete, 8); b.cyl(0.07, 2.4, 0, 0, 0, M.steel, 10); for (const h of [2.2, 1.9]) b.box(0.8, 0.07, 0.07, 0, h, 0, M.steelDk); for (const x of [-0.35, 0.35]) b.cyl(0.045, 0.14, x, 2.27, 0, M.white, 6); }), height: 2.45, light: null, anims: [] };
  {
    const b = new B();
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.8, 0.8]) { b.box(0.25, 0.2, 0.25, sx, 0, sz, M.concrete); b.beam([sx, 0.2, sz], [sx * 0.15, 4.4, sz * 0.15], 0.08, M.steel); }
    for (let i = 1; i <= 5; i++) { const h = i * 0.8, k = 1 - h / 4.6 * 0.85; for (const s of [-1, 1]) { b.beam([-0.8 * k, h, s * 0.8 * k], [0.8 * k, h + 0.6, s * 0.8 * k], 0.04, M.steel); b.beam([s * 0.8 * k, h, -0.8 * k], [s * 0.8 * k, h + 0.6, 0.8 * k], 0.04, M.steel); } }
    b.box(1.4, 0.1, 0.1, 0, 4.3, 0, M.steelDk); for (const x of [-0.6, 0.6]) b.cyl(0.05, 0.16, x, 4.4, 0, M.white, 6);
    T.tower = { stat: b.build(), height: 4.6, light: null, anims: [] };
  }
  // ---- Generators
  {
    const b = new B(); pad(b, 2);
    b.box(1.3, 1.0, 1.2, -0.1, 0.14, -0.1, M.orange); b.box(1.36, 0.1, 1.26, -0.1, 1.14, -0.1, M.steelDk);
    b.box(0.6, 0.4, 0.05, -0.1, 0.3, 0.52, M.black); b.box(0.5, 0.3, 0.05, -0.1, 0.35, 0.545, M.glowOrange);
    b.cyl(0.17, 1.2, -0.45, 1.24, -0.45, M.steelDk, 12);
    b.box(0.5, 0.6, 0.5, 0.6, 0.14, 0.5, M.wood);
    T.biomass_burner = { stat: b.build(), height: 2.4, light: [0.5, 1.2, -0.6], anims: [], smoke: [[-0.45, 2.45, -0.45]], glow: [[-0.1, 0.5, 0.7]] };
  }
  {
    const b = new B(); pad(b, 3);
    b.box(2.6, 1.3, 1.5, 0, 0.14, 0.55, M.orange); b.box(2.65, 0.12, 1.55, 0, 1.44, 0.55, M.steelDk);
    b.add(new THREE.CylinderGeometry(0.62, 0.85, 2.6, 22, 1, true), M.concrete, -0.7, 1.44, -0.7);
    b.torus(0.63, 0.04, -0.7, 2.72, -0.7, M.grey);
    b.cyl(0.2, 3.2, 1.0, 0.14, -1.0, M.steelDk, 12); b.torus(0.21, 0.04, 1.0, 3.0, -1.0, M.red);
    b.hcyl(0.1, 1.4, 0.2, 0.9, -0.5, M.steel, 'x');
    for (let i = 0; i < 4; i++) b.box(0.4, 0.4, 0.02, -0.9 + i * 0.6, 0.6, 1.31, M.glass);
    T.coal_gen = { stat: b.build(), height: 3.4, light: [1.2, 1.5, 1.2], anims: [{ key: 'turbine', model: gear(0.35, 0.08, 12, 'z', M.steel), fn: (o, e, t) => { o.x = 0.5; o.y = 0.9; o.z = 1.33; o.rz = t * 3 * ((e.pnet && e.avail > 0 ? e.pnet.load : 0) + 0.02); } }], smoke: [[-0.7, 2.8, -0.7], [1.0, 3.35, -1.0]] };
  }
  {
    const b = new B(); pad(b, 3);
    b.hcyl(0.62, 2.4, 0, 0.8, -0.3, M.steel, 'x'); b.torus(0.64, 0.05, -0.7, 0.8, -0.3, M.orange, 0); b.torus(0.64, 0.05, 0.7, 0.8, -0.3, M.orange, 0);
    for (const x of [-0.8, 0.8]) b.box(0.3, 0.2, 1.0, x, 0.14, -0.3, M.steelDk);
    b.cyl(0.16, 2.6, -1.0, 0.14, -1.0, M.steelDk, 10); b.cyl(0.16, 2.3, -0.6, 0.14, -1.05, M.steelDk, 10);
    b.box(1.2, 0.9, 0.7, 0.6, 0.14, 0.95, M.orange); b.box(0.6, 0.3, 0.02, 0.6, 0.55, 1.31, M.glass);
    T.fuel_gen = { stat: b.build(), height: 2.8, light: [1.2, 1.1, 1.2], anims: [], smoke: [[-1.0, 2.75, -1.0], [-0.6, 2.45, -1.05]] };
  }
  {
    const b = new B(); pad(b, 2);
    b.add(new THREE.SphereGeometry(0.75, 20, 10, 0, TAU, 0, Math.PI / 2), M.greyLt, 0, 0.14, 0);
    b.cyl(0.2, 0.7, 0, 0.8, 0, M.steelDk, 12);
    b.hcyl(0.1, 1.6, 0, 0.45, 0.6, M.copper, 'x');
    b.box(0.5, 0.5, 0.4, 0.6, 0.14, -0.6, M.orange);
    T.geothermal = { stat: b.build(), height: 1.6, light: [0.6, 0.7, -0.4], anims: [], smoke: [[0, 1.55, 0]] };
  }
  {
    const b = new B(); pad(b, 2);
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.45, 0.45]) { b.cyl(0.33, 1.2, sx, 0.14, sz, M.grey, 16); b.cyl(0.25, 0.08, sx, 1.34, sz, M.steelDk, 12); b.torus(0.34, 0.03, sx, 0.8, sz, M.green); }
    T.battery = { stat: b.build(), height: 1.5, light: [0.8, 0.5, 0.8], anims: [] };
  }
  // ---- Transport
  {
    const b = new B();
    b.box(2.9, 0.3, 2.9, 0, 0, 0, M.concrete);
    b.box(2.9, 0.04, 0.12, 0, 0.3, 1.39, M.yellow); b.box(0.12, 0.04, 2.9, 1.39, 0.3, 0, M.yellow);
    for (const sx of [-1.2, 1.2]) for (const sz of [-1.2, 1.2]) b.box(0.15, 1.8, 0.15, sx, 0.3, sz, M.orange);
    b.box(2.7, 0.12, 2.7, 0, 2.1, 0, M.steelDk);
    b.box(0.9, 1.0, 0.7, -0.8, 0.3, -0.8, M.orange); b.box(0.5, 0.3, 0.02, -0.8, 0.8, -0.44, M.glass);
    T.station = { stat: b.build(), height: 2.3, light: [1.2, 2.2, 1.2], anims: [] };
  }
  {
    const b = new B();
    b.box(2.9, 0.45, 2.9, 0, 0, 0, M.grey);
    b.torus(0.95, 0.05, 0, 0.47, 0, M.yellow);
    b.box(0.08, 0.02, 1.2, -0.3, 0.46, 0, M.white); b.box(0.08, 0.02, 1.2, 0.3, 0.46, 0, M.white); b.box(0.6, 0.02, 0.08, 0, 0.46, 0, M.white);
    b.box(0.7, 1.2, 0.7, 1.05, 0.45, -1.05, M.orange); b.cyl(0.04, 0.8, 1.05, 1.65, -1.05, M.steel, 6);
    T.drone_port = { stat: b.build(), height: 1.6, light: [-1.3, 0.5, 1.3], anims: [] };
  }
  // ---- Nuclear power plant: reactor dome and two cooling towers
  {
    const b = new B(); pad(b, 5);
    const tower = new THREE.LatheGeometry([[1.05, 0], [0.8, 1.4], [0.68, 2.6], [0.74, 3.4], [0.82, 3.9]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
    for (const z of [-1.15, 1.15]) { b.add(tower, M.concrete, -1.0, 0.14, z); b.torus(0.8, 0.04, -1.0, 3.2, z, M.orange); }
    b.cyl(0.95, 1.3, 1.05, 0.14, 0, M.white, 24); b.add(new THREE.SphereGeometry(0.95, 24, 8, 0, TAU, 0, Math.PI / 2), M.white, 1.05, 1.44, 0);
    b.torus(0.97, 0.06, 1.05, 1.0, 0, M.green);
    b.box(1.0, 0.9, 0.9, 1.55, 0.14, -1.6, M.orange); b.box(0.02, 0.3, 0.5, 2.06, 0.6, -1.6, M.glass);
    b.hcyl(0.14, 1.2, 0.0, 0.8, -0.6, M.steel, 'x'); b.hcyl(0.14, 1.2, 0.0, 0.8, 0.6, M.steel, 'x');
    T.nuclear_plant = { stat: b.build(), height: 4.1, light: [1.55, 1.1, -1.6], anims: [], smoke: [[-1.0, 4.1, -1.15], [-1.0, 4.1, 1.15]], glow: [[1.05, 2.4, 0]] };
  }
  // ---- Ship port: a concrete quay with a dock crane
  {
    const b = new B();
    b.box(2.9, 0.35, 2.9, 0, 0, 0, M.concrete);
    b.box(2.9, 0.04, 0.12, 0, 0.35, 1.39, M.yellow); b.box(0.12, 0.04, 2.9, 1.39, 0.35, 0, M.yellow);
    for (const [x, z] of [[1.3, -1.1], [1.3, 0], [1.3, 1.1]]) b.cyl(0.08, 0.18, x, 0.35, z, M.black, 8);
    b.box(1.0, 1.1, 1.2, -0.9, 0.35, -0.8, M.orange); b.box(1.04, 0.1, 1.24, -0.9, 1.45, -0.8, M.steelDk); b.box(0.02, 0.3, 0.6, -0.39, 0.9, -0.8, M.glass);
    for (const [x, z] of [[-0.3, 0.9], [0.3, 0.9]]) b.box(0.1, 2.2, 0.1, x, 0.35, z, M.yellow);
    b.box(0.8, 0.12, 0.2, 0, 2.55, 0.9, M.yellow);
    b.box(0.55, 0.45, 0.55, -0.8, 0.35, 0.8, M.blue); b.box(0.55, 0.45, 0.55, -0.8, 0.8, 0.8, M.red);
    T.ship_port = { stat: b.build(), height: 2.6, light: [-0.4, 1.3, -1.35], anims: [{ key: 'jib', model: one(b2 => { b2.box(2.3, 0.1, 0.12, 0.85, 0, 0, M.yellow); b2.cyl(0.02, 0.6, 1.8, -0.6, 0, M.steelDk, 4); b2.box(0.25, 0.12, 0.25, 1.8, -0.72, 0, M.steelDk); }), fn: (o, _e, _t, real) => { o.y = 2.66; o.z = 0.9; o.ry = Math.sin(real * 0.3) * 0.9; } }] };
  }
  // ---- Outpost: a small field base with a comms mast and a beacon
  {
    const b = new B();
    b.box(2.9, 0.25, 2.9, 0, 0, 0, M.concrete);
    b.box(2.9, 0.03, 0.12, 0, 0.25, 1.39, M.yellow); b.box(0.12, 0.03, 2.9, 1.39, 0.25, 0, M.yellow);
    b.box(1.5, 1.2, 1.2, -0.55, 0.25, -0.5, M.orange); b.box(1.56, 0.1, 1.26, -0.55, 1.45, -0.5, M.steelDk);
    b.box(1.1, 0.35, 0.02, -0.55, 0.8, 0.11, M.glass); b.box(0.45, 0.8, 0.03, 0.05, 0.25, 0.11, M.black);
    b.box(0.6, 0.5, 0.6, 0.8, 0.25, 0.8, M.wood); b.box(0.45, 0.4, 0.45, 0.8, 0.75, 0.8, M.wood);
    b.cyl(0.07, 3.0, 0.9, 0.25, -0.9, M.steel, 8); b.beam([0.9, 3.2, -0.9], [0.5, 2.3, -0.9], 0.03, M.steelDk);
    b.box(0.5, 0.3, 0.02, 1.15, 2.7, -0.9, M.orange);
    b.box(0.5, 0.45, 0.5, -1.0, 0.25, 0.9, M.grey); b.box(0.3, 0.06, 0.02, -1.0, 0.55, 1.16, M.glowGreen);
    T.outpost = { stat: b.build(), height: 1.7, light: [0.9, 3.3, -0.9], anims: [{ key: 'odish', model: one(b2 => { b2.add(new THREE.SphereGeometry(0.4, 14, 5, 0, TAU, 0, 0.9), M.white, 0, 0.5, 0, Math.PI * 0.35); b2.cyl(0.04, 0.3, 0, 0, 0, M.steelDk, 6); }), fn: (o, _e, _t, real) => { o.x = -0.55; o.y = 1.55; o.z = -0.5; o.ry = real * 0.5; } }] };
  }
  // ---- Truck station: loading dock + canopy over the parking bay
  {
    const b = new B();
    b.box(2.9, 0.25, 2.9, 0, 0, 0, M.concrete);
    b.box(2.9, 0.03, 0.12, 0, 0.25, 1.39, M.yellow); b.box(0.12, 0.03, 2.9, 1.39, 0.25, 0, M.yellow);
    b.box(1.0, 1.3, 2.6, -0.9, 0.25, 0, M.orange); b.box(1.06, 0.1, 2.66, -0.9, 1.55, 0, M.steelDk);
    b.box(0.04, 0.8, 0.9, -0.39, 0.25, -0.6, M.black); b.box(0.04, 0.8, 0.9, -0.39, 0.25, 0.6, M.black);
    for (let i = 0; i < 4; i++) b.box(0.05, 0.02, 0.9, -0.36, 0.35 + i * 0.18, -0.6, M.grey);
    for (const sz of [-1.25, 1.25]) b.box(0.1, 1.55, 0.1, 1.2, 0.25, sz, M.steelDk);
    b.box(2.1, 0.08, 2.7, 0.25, 1.8, 0, M.greyLt); b.box(2.12, 0.04, 0.1, 0.25, 1.76, 1.3, M.orange); b.box(2.12, 0.04, 0.1, 0.25, 1.76, -1.3, M.orange);
    b.box(1.5, 0.01, 0.06, 0.5, 0.25, 0.7, M.white); b.box(1.5, 0.01, 0.06, 0.5, 0.25, -0.7, M.white);
    b.box(0.5, 0.35, 0.5, -0.9, 1.65, -0.8, M.grey); b.cyl(0.15, 0.1, -0.9, 2.0, -0.8, M.steelDk, 10);
    T.truck_station = { stat: b.build(), height: 2.0, light: [-0.4, 1.4, 1.2], anims: [{ key: 'tfan', model: fan(0.2), fn: (o, _e, _t, real) => { o.x = -0.9; o.y = 2.1; o.z = -0.8; o.ry = real * 6; } }] };
  }
  // ---- Solar panel array
  {
    const b = new B(); pad(b, 3);
    for (const [px, pz] of [[-0.68, -0.68], [0.68, -0.68], [-0.68, 0.68], [0.68, 0.68]]) {
      b.cyl(0.05, 0.62, px, 0.14, pz, M.steelDk, 6);
      b.add(new THREE.BoxGeometry(1.24, 0.05, 1.18), M.steelDk, px, 0.86, pz, 0.38, 0, 0);
      b.add(new THREE.BoxGeometry(1.14, 0.03, 1.08), M.solar, px, 0.895, pz, 0.38, 0, 0);
      for (const k of [-0.28, 0, 0.28]) b.add(new THREE.BoxGeometry(0.015, 0.032, 1.08), M.greyLt, px + k, 0.9, pz, 0.38, 0, 0);
    }
    b.box(0.34, 0.4, 0.3, 1.2, 0.14, 0, M.grey); b.box(0.2, 0.08, 0.02, 1.2, 0.4, 0.16, M.glowGreen);
    T.solar = { stat: b.build(), height: 1.3, light: [1.2, 0.62, 0], anims: [] };
  }
  // ---- HUB
  {
    const b = new B();
    b.box(3.95, 0.3, 3.95, 0, 0, 0, M.concrete);
    b.box(3.95, 0.04, 0.12, 0, 0.3, 1.9, M.yellow); b.box(0.12, 0.04, 3.95, 1.9, 0.3, 0, M.yellow);
    b.box(2.1, 1.7, 1.8, -0.8, 0.3, -0.8, M.orange); b.box(2.16, 0.14, 1.86, -0.8, 2.0, -0.8, M.steelDk);
    b.box(1.6, 0.5, 0.03, -0.8, 1.2, 0.115, M.glass); b.box(0.03, 0.5, 1.2, 0.255, 1.2, -0.8, M.glass);
    b.box(0.6, 1.1, 0.04, -0.2, 0.3, 0.12, M.black);
    b.cyl(0.08, 3.6, 1.3, 0.3, -1.3, M.steel, 8); b.cyl(0.05, 0.2, 1.3, 3.9, -1.3, M.red, 6);
    for (let i = 0; i < 3; i++) b.box(0.55, 0.55, 0.55, 0.9 + (i % 2) * 0.6, 0.3 + (i === 2 ? 0.55 : 0), 1.0, M.wood);
    b.box(1.0, 0.8, 0.8, 1.2, 0.3, -0.2, M.grey);
    T.hub = {
      stat: b.build(), height: 2.3, light: [1.3, 4.0, -1.3],
      anims: [{ key: 'dish', model: one(b2 => { b2.cyl(0.05, 0.4, 0, 0, 0, M.steelDk, 6); b2.add(new THREE.SphereGeometry(0.55, 16, 6, 0, TAU, 0, 0.9), M.white, 0, 0.9, 0, Math.PI * 0.35); b2.beam([0, 0.55, 0], [0.25, 1.05, 0], 0.03, M.steelDk); }), fn: (o, _e, _t, real) => { o.x = -1.3; o.y = 2.14; o.z = -1.3; o.ry = real * 0.6; } }],
    };
  }
  // ---- Space Elevator
  {
    const b = new B();
    b.box(4.9, 0.6, 4.9, 0, 0, 0, M.concrete);
    b.box(4.9, 0.05, 0.15, 0, 0.6, 2.38, M.yellow); b.box(0.15, 0.05, 4.9, 2.38, 0.6, 0, M.yellow);
    b.cyl(1.9, 0.8, 0, 0.6, 0, M.steelDk, 32);
    b.cyl(1.0, 10, 0, 1.4, 0, M.white, 24, 0.6);
    for (let h = 2; h < 11; h += 1.5) b.torus(1.0 - (h - 1.4) / 10 * 0.4 + 0.08, 0.08, 0, h, 0, M.orange);
    for (const sx of [-1.6, 1.6]) for (const sz of [-1.6, 1.6]) b.beam([sx, 1.4, sz], [sx * 0.3, 8, sz * 0.3], 0.14, M.steel);
    b.cone(0.62, 1.2, 0, 11.4, 0, M.greyLt, 24);
    T.elevator = { stat: b.build(), height: 12.6, light: [0, 12.7, 0], anims: [{ key: 'ering', model: one(b2 => b2.torus(1.9, 0.07, 0, 0, 0, M.glowBlue)), fn: (o, _e, _t, real) => { o.y = 1.6 + (real * 0.8) % 9; o.s = 1 - ((real * 0.8) % 9) / 9 * 0.55; } }] };
  }
  T.statue = { stat: one(b => { b.box(1.6, 0.4, 1.6, 0, 0, 0, M.concrete); b.add(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 6), M.gold, 0, 1.2, 0, Math.PI / 2); b.cyl(0.12, 0.45, 0, 0.4, 0, M.gold, 8); }), height: 1.8, light: null, anims: [] };
  T.lamp = { stat: one(b => { b.cyl(0.06, 1.6, 0, 0, 0, M.steelDk, 8); b.box(0.35, 0.08, 0.2, 0.1, 1.6, 0, M.steelDk); b.box(0.28, 0.03, 0.16, 0.1, 1.58, 0, M.glowWhite); }), height: 1.7, light: null, anims: [] };
  return T;
}

// ---------------------------------------------------------------------------
// Items (3D, ~0.3 units)
const itemGeoCache: Record<string, { geo: THREE.BufferGeometry; mat: THREE.Material }> = Object.create(null);
export function itemModel(k: string) {
  if (itemGeoCache[k]) return itemGeoCache[k];
  const it = ITEMS[k], c = it.c;
  let geo: THREE.BufferGeometry;
  let metal = 0.3, rough = 0.55;
  switch (it.s) {
    case 'ore': geo = rockGeo(0.14, k.length * 97 + 11, 0, 0.8); rough = 0.8; metal = 0.15; break;
    case 'crystal': geo = new THREE.OctahedronGeometry(0.13, 0); geo.scale(0.7, 1.4, 0.7); rough = 0.15; metal = 0.1; break;
    case 'log': geo = new THREE.CylinderGeometry(0.08, 0.08, 0.34, 8); geo.rotateZ(Math.PI / 2); rough = 0.9; metal = 0; break;
    case 'ingot': geo = new THREE.CylinderGeometry(0.1, 0.14, 0.09, 4); geo.rotateY(Math.PI / 4); geo.scale(1.5, 1, 0.8); metal = 0.85; rough = 0.3; break;
    case 'plate': case 'rplate': case 'smart': geo = new THREE.BoxGeometry(0.3, 0.04, 0.3); metal = 0.7; rough = 0.35; break;
    case 'rod': case 'pipe': geo = new THREE.CylinderGeometry(0.035, 0.035, 0.36, 8); geo.rotateZ(Math.PI / 2); metal = 0.8; rough = 0.3; break;
    case 'screw': geo = new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6); geo.rotateZ(Math.PI / 2); metal = 0.8; break;
    case 'coil': case 'cable': geo = new THREE.TorusGeometry(0.1, 0.04, 6, 14); geo.rotateX(Math.PI / 2); metal = it.s === 'coil' ? 0.8 : 0.1; break;
    case 'block': geo = new THREE.BoxGeometry(0.24, 0.2, 0.24); rough = 0.95; metal = 0; break;
    case 'bio': case 'pellet': case 'powder': geo = new THREE.DodecahedronGeometry(0.12, 0); geo.scale(1, 0.6, 1); rough = 0.9; metal = 0; break;
    case 'beam': case 'ebeam': geo = new THREE.BoxGeometry(0.42, 0.09, 0.1); metal = 0.75; break;
    case 'sheet': geo = new THREE.BoxGeometry(0.3, 0.025, 0.24); rough = 0.4; metal = 0.05; break;
    case 'rotor': case 'stator': case 'motor': case 'engine': geo = new THREE.CylinderGeometry(0.12, 0.12, 0.22, 12); geo.rotateZ(Math.PI / 2); metal = 0.7; break;
    case 'frame': case 'vframe': case 'hframe': { const b = new B(); const m = M.steel; for (const s of [-1, 1]) { b.box(0.34, 0.05, 0.05, 0, 0, s * 0.15, m); b.box(0.05, 0.05, 0.34, s * 0.15, 0, 0, m); } geo = b.build().geo; metal = 0.7; break; }
    case 'shard': geo = new THREE.OctahedronGeometry(0.12, 0); geo.scale(0.6, 1.6, 0.6); rough = 0.1; metal = 0; break;
    case 'scrap': geo = rockGeo(0.13, 77, 0, 0.5); metal = 0.9; rough = 0.3; break;
    default: geo = new THREE.BoxGeometry(0.26, 0.16, 0.22); metal = 0.4; break;
  }
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(0, -bb.min.y, 0);
  const emissive = it.s === 'shard' || it.s === 'crystal' ? new THREE.Color(c).multiplyScalar(0.25) : new THREE.Color(0);
  const mat = std(c, rough, metal, { emissive, flatShading: it.s === 'ore' || it.s === 'scrap' });
  return itemGeoCache[k] = { geo, mat };
}

// ---------------------------------------------------------------------------
// Resource nodes: clusters of rocks with ore colour
export function nodeModel(res: string, variant: number): Model {
  const b = new B();
  let seed = res.length * 131 + variant * 977 + 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  if (res === 'crude_oil') {
    b.add(new THREE.CylinderGeometry(0.85, 0.9, 0.04, 20), std('#0c0b10', 0.05, 0.3), 0, 0.02, 0);
    for (let i = 0; i < 6; i++) { const a = rnd() * TAU, r = 0.8 + rnd() * 0.15; b.add(rockGeo(0.18 + rnd() * 0.1, seed + i, 0), M.grey, Math.cos(a) * r, 0.05, Math.sin(a) * r); }
    return b.build();
  }
  if (res === 'geyser') {
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + rnd() * 0.3, r = 0.7 + rnd() * 0.15; b.add(rockGeo(0.24 + rnd() * 0.12, seed + i, 0), std('#5a4a42', 0.9, 0.05), Math.cos(a) * r, 0.1, Math.sin(a) * r); }
    b.add(new THREE.CylinderGeometry(0.5, 0.55, 0.05, 16), std('#2a1a14', 0.4, 0.1, { emissive: new THREE.Color('#ff5a1a'), emissiveIntensity: 1.2 }), 0, 0.03, 0);
    return b.build();
  }
  const col = ITEMS[res].c;
  const oreMat = std(col, 0.55, res === 'coal' || res === 'limestone' ? 0.05 : 0.45, res === 'uranium' ? { flatShading: true, emissive: new THREE.Color('#2aa040'), emissiveIntensity: 0.9 } : { flatShading: true });
  const baseMat = std('#6a665f', 0.9, 0.05, { flatShading: true });
  b.add(rockGeo(0.75, seed, 1, 0.45), baseMat, 0, 0.1, 0);
  const n = 6 + variant;
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, r = rnd() * 0.65, s = 0.2 + rnd() * 0.22;
    b.add(rockGeo(s, seed + i * 13, 0, 0.8), rnd() < 0.7 ? oreMat : baseMat, Math.cos(a) * r, 0.25 + rnd() * 0.15, Math.sin(a) * r, rnd() * 3, rnd() * 3, rnd() * 3);
  }
  return b.build();
}

// Trees
export function treeModels(): Model[] {
  const leaf = [std('#3d5e2a', 0.85, 0, { flatShading: true }), std('#4a6b30', 0.85, 0, { flatShading: true }), std('#2e4f2c', 0.85, 0, { flatShading: true })];
  const bark = std('#5a4030', 0.9, 0);
  const out: Model[] = [];
  out.push(one(b => { b.cyl(0.07, 0.5, 0, 0, 0, bark, 6); b.cone(0.5, 0.8, 0, 0.35, 0, leaf[2], 7); b.cone(0.4, 0.7, 0, 0.8, 0, leaf[2], 7); b.cone(0.27, 0.55, 0, 1.22, 0, leaf[2], 7); }));
  out.push(one(b => { b.cyl(0.08, 0.7, 0, 0, 0, bark, 6); b.add(new THREE.IcosahedronGeometry(0.48, 0), leaf[0], 0, 1.0, 0); b.add(new THREE.IcosahedronGeometry(0.36, 0), leaf[0], 0.25, 0.8, 0.15); b.add(new THREE.IcosahedronGeometry(0.33, 0), leaf[1], -0.22, 1.25, -0.1); }));
  out.push(one(b => { b.cyl(0.06, 0.6, 0, 0, 0, bark, 6); b.add(new THREE.IcosahedronGeometry(0.42, 0), leaf[1], 0, 0.9, 0); b.add(new THREE.IcosahedronGeometry(0.3, 0), leaf[1], 0.1, 1.25, 0.1); }));
  out.push(one(b => { b.add(new THREE.IcosahedronGeometry(0.34, 0), leaf[0], 0, 0.2, 0); b.add(new THREE.IcosahedronGeometry(0.26, 0), leaf[2], 0.25, 0.15, 0.1); }));
  return out;
}

// Vehicles
export function locoModel(): Model {
  return one(b => {
    b.box(1.85, 0.12, 0.72, 0, 0.18, 0, M.steelDk);
    for (const x of [-0.65, -0.2, 0.25, 0.65]) for (const z of [-0.3, 0.3]) b.hcyl(0.13, 0.08, x, 0.16, z, M.black, 'z', 10);
    b.box(1.2, 0.55, 0.64, -0.25, 0.3, 0, M.orange);
    b.box(0.5, 0.75, 0.7, 0.62, 0.3, 0, M.orange); b.box(0.52, 0.08, 0.72, 0.62, 1.05, 0, M.steelDk);
    b.box(0.02, 0.25, 0.5, 0.875, 0.72, 0, M.glass); b.box(0.35, 0.25, 0.02, 0.62, 0.72, 0.355, M.glass);
    for (let i = 0; i < 4; i++) b.box(0.18, 0.04, 0.5, -0.7 + i * 0.3, 0.86, 0, M.grey);
    b.box(0.05, 0.1, 0.5, 0.9, 0.35, 0, M.yellow);
  });
}
export function wagonModel(): Model {
  return one(b => {
    b.box(1.85, 0.12, 0.72, 0, 0.18, 0, M.steelDk);
    for (const x of [-0.6, 0.6]) for (const z of [-0.3, 0.3]) b.hcyl(0.13, 0.08, x, 0.16, z, M.black, 'z', 10);
    b.box(1.75, 0.5, 0.66, 0, 0.3, 0, M.greyLt);
    for (let i = 0; i < 7; i++) b.box(0.04, 0.46, 0.68, -0.78 + i * 0.26, 0.32, 0, M.grey);
    b.box(1.77, 0.04, 0.68, 0, 0.8, 0, M.steelDk);
  });
}
export function truckModel(): Model {
  return one(b => {
    b.box(1.35, 0.1, 0.56, 0, 0.12, 0, M.steelDk);
    for (const x of [-0.45, -0.2, 0.45]) for (const z of [-0.28, 0.28]) b.hcyl(0.13, 0.1, x, 0.13, z, M.rubber, 'z', 10);
    b.box(0.42, 0.52, 0.58, 0.46, 0.22, 0, M.orange); b.box(0.44, 0.05, 0.6, 0.46, 0.74, 0, M.steelDk);
    b.box(0.02, 0.2, 0.46, 0.675, 0.5, 0, M.glass); b.box(0.24, 0.18, 0.02, 0.48, 0.52, 0.295, M.glass); b.box(0.24, 0.18, 0.02, 0.48, 0.52, -0.295, M.glass);
    b.box(0.86, 0.58, 0.6, -0.2, 0.22, 0, M.greyLt); b.box(0.88, 0.04, 0.62, -0.2, 0.8, 0, M.steelDk);
    for (let i = 0; i < 4; i++) b.box(0.03, 0.54, 0.62, -0.55 + i * 0.23, 0.24, 0, M.grey);
    b.box(0.04, 0.08, 0.5, 0.69, 0.28, 0, M.yellow);
  });
}
/** crashed drop pod with a glowing hatch */
export function siteModel(): Model {
  return one(b => {
    b.cyl(1.05, 0.02, 0, 0.005, 0, M.scorch, 18);
    b.add(new THREE.CapsuleGeometry(0.38, 1.0, 4, 12), M.greyLt, 0, 0.36, 0, 0, 0.5, 1.28);
    b.add(new THREE.CylinderGeometry(0.405, 0.405, 0.16, 14), M.orange, 0, 0.36, 0, 0, 0.5, 1.28);
    b.add(new THREE.BoxGeometry(0.5, 0.04, 0.3), M.steelDk, -0.62, 0.18, 0.4, 0.3, 0.5, 0.2);
    b.add(new THREE.BoxGeometry(0.5, 0.04, 0.3), M.steelDk, -0.5, 0.6, 0.45, 1.2, 0.5, 0.3);
    b.add(new THREE.BoxGeometry(0.22, 0.12, 0.3), M.black, 0.1, 0.62, 0.02, 0.2, 0.5, 0.25);
    b.sphere(0.07, 0.12, 0.72, 0.02, M.glowBlue, 10);
    for (let i = 0; i < 7; i++) { const a = i * 2.1, r = 0.55 + (i % 3) * 0.15; b.add(new THREE.BoxGeometry(0.16, 0.05, 0.1), i % 2 ? M.steelDk : M.orange, Math.cos(a) * r, 0.03, Math.sin(a) * r, 0.2 * i, a, 0.1); }
    b.beam([-0.1, 0.5, -0.35], [0.25, 1.1, -0.6], 0.03, M.steelDk);
  });
}
/** power crystal cluster: tier 0 blue, 1 yellow, 2 purple */
export function crystalModel(tier: number): Model {
  const m = [M.crysBlue, M.crysYellow, M.crysPurple][tier];
  return one(b => {
    b.add(rockGeo(0.32, 11 + tier, 0, 0.45), M.grey, 0, 0.08, 0);
    b.add(new THREE.OctahedronGeometry(0.2), m, 0, 0.42, 0, 0, 0, 0, 0.7, 1.9, 0.7);
    b.add(new THREE.OctahedronGeometry(0.14), m, 0.17, 0.3, 0.1, 0.45, 0, 0.35, 0.7, 1.6, 0.7);
    b.add(new THREE.OctahedronGeometry(0.12), m, -0.15, 0.27, -0.08, -0.3, 0, -0.45, 0.7, 1.5, 0.7);
    if (tier > 0) b.add(new THREE.OctahedronGeometry(0.1), m, 0.02, 0.24, -0.2, -0.5, 0, 0.1, 0.7, 1.5, 0.7);
  });
}
/** cargo ship: hull, containers and a bridge at the stern (bow points +x) */
export function shipModel(): Model {
  return one(b => {
    b.add(new THREE.BoxGeometry(2.6, 0.5, 0.95), M.steelDk, 0, 0.1, 0);
    b.add(new THREE.CylinderGeometry(0.48, 0.48, 0.5, 3, 1), M.steelDk, 1.3, 0.1, 0, 0, Math.PI / 2, 0, 0.9, 1, 1);
    b.box(2.9, 0.08, 1.0, 0.05, 0.35, 0, M.red);
    b.box(2.4, 0.06, 0.85, 0.1, 0.43, 0, M.grey);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) b.box(0.45, 0.3, 0.38, -0.2 + i * 0.5, 0.49 + j * 0.3, 0, [M.orange, M.blue, M.green][(i + j) % 3]);
    b.box(0.5, 0.55, 0.8, -1.0, 0.49, 0, M.white); b.box(0.52, 0.12, 0.82, -1.0, 1.04, 0, M.steelDk);
    b.box(0.02, 0.14, 0.6, -0.74, 0.86, 0, M.glass);
    b.cyl(0.08, 0.35, -1.15, 1.16, 0, M.orange, 8);
  });
}
export function droneModel(): Model {
  return one(b => {
    b.box(0.34, 0.14, 0.24, 0, 0, 0, M.orange); b.box(0.36, 0.04, 0.26, 0, 0.14, 0, M.steelDk);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.beam([0, 0.07, 0], [sx * 0.3, 0.1, sz * 0.3], 0.04, M.steelDk); b.cyl(0.14, 0.02, sx * 0.3, 0.12, sz * 0.3, M.glass, 12); }
  });
}

// Belts: straight + curve frames and surfaces (surfaces use an animated texture material)
export function beltFrameStraight(): Model {
  return one(b => {
    b.box(1.0, 0.06, 0.8, 0, 0.16, 0, M.black);
    for (const s of [-1, 1]) { b.box(1.0, 0.1, 0.07, 0, 0.19, s * 0.43, M.steelDk); b.box(1.0, 0.03, 0.075, 0, 0.29, s * 0.43, M.orange); }
    for (const s of [-1, 1]) b.box(0.08, 0.16, 0.08, 0, 0, s * 0.35, M.steelDk);
  });
}
function arcBeams(b: B, r: number, y: number, t: number, h: number, m: Mat, cx: number, cz: number, n = 6) {
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI / 2, a1 = (i + 1) / n * Math.PI / 2;
    const p0 = [cx + Math.sin(a0) * r, y, cz - Math.cos(a0) * r], p1 = [cx + Math.sin(a1) * r, y, cz - Math.cos(a1) * r];
    const dx = p1[0] - p0[0], dz = p1[2] - p0[2], L = Math.hypot(dx, dz) + 0.01;
    b.add(new THREE.BoxGeometry(L, h, t), m, (p0[0] + p1[0]) / 2, y + h / 2, (p0[2] + p1[2]) / 2, 0, -Math.atan2(dz, dx), 0);
  }
}
export function beltFrameCurve(): Model {
  // enters the west edge moving east, exits the south edge moving south; arc centre at (-0.5, +0.5)
  return one(b => {
    arcBeams(b, 0.5, 0.16, 0.8, 0.06, M.black, -0.5, 0.5);
    for (const r of [0.07, 0.93]) { arcBeams(b, r, 0.19, 0.07, 0.1, M.steelDk, -0.5, 0.5, r < 0.5 ? 2 : 6); arcBeams(b, r, 0.29, 0.075, 0.03, M.orange, -0.5, 0.5, r < 0.5 ? 2 : 6); }
    b.box(0.08, 0.16, 0.08, -0.15, 0, 0.15, M.steelDk);
  });
}
export function beltSurfaceStraight() {
  const g = new THREE.PlaneGeometry(1, 0.78); g.rotateX(-Math.PI / 2); g.translate(0, 0.225, 0);
  return g;
}
export function beltSurfaceCurve() {
  const N = 10, pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI / 2;
    for (const [r, v] of [[0.11, 0], [0.89, 1]]) {
      pos.push(-0.5 + Math.sin(a) * r, 0.225, 0.5 - Math.cos(a) * r); uv.push(a * 0.5, v); nrm.push(0, 1, 0);
    }
  }
  for (let i = 0; i < N; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
export function tunnelModel(exit: boolean): Model {
  return one(b => {
    b.box(1.0, 0.06, 0.8, 0, 0.16, 0, M.black);
    b.box(0.6, 0.6, 0.95, exit ? -0.2 : 0.2, 0.0, 0, M.steelDk);
    b.box(0.62, 0.08, 0.97, exit ? -0.2 : 0.2, 0.6, 0, M.orange);
    b.box(0.02, 0.4, 0.6, exit ? 0.105 : -0.105, 0.16, 0, M.rubber);
  });
}
// Rails
// Floors: foundation deck tile, support pillar, conveyor lifts, pipe lift (LH = 4 units per floor)
export function deckModel(): Model {
  return one(b => { b.box(1.0, 0.24, 1.0, 0, 0, 0, M.steelDk); b.box(0.96, 0.06, 0.96, 0, 0.24, 0, M.concrete); });
}
export function pillarModel(): Model {
  return one(b => { b.box(0.22, 1, 0.22, 0, 0, 0, M.steelDk); b.box(0.3, 0.06, 0.3, 0, 0, 0, M.grey); });
}
/** conveyor lift shaft, one floor tall; up = in at the bottom back, out at the top front */
export function liftModel(up: boolean): Model {
  const Hh = 4;
  return one(b => {
    for (const sx of [-0.36, 0.36]) for (const sz of [-0.36, 0.36]) b.box(0.08, Hh + 0.3, 0.08, sx, 0, sz, M.steelDk);
    b.box(0.64, Hh, 0.64, 0, 0.15, 0, M.greyLt);
    for (let h = 0.6; h < Hh; h += 0.9) b.box(0.68, 0.06, 0.68, 0, h, 0, M.orange);
    b.box(0.7, 0.1, 0.7, 0, Hh + 0.3, 0, M.steelDk);
    const lo = 0.14, hi = Hh + 0.14;
    // belt stubs: where items go in (back, -x) and come out (front, +x)
    b.box(0.3, 0.08, 0.7, -0.5, up ? lo : hi, 0, M.black); b.box(0.3, 0.08, 0.7, 0.5, up ? hi : lo, 0, M.black);
    b.box(0.02, 0.3, 0.5, 0.33, up ? hi + 0.1 : lo + 0.1, 0, M.glowOrange); b.box(0.02, 0.3, 0.5, -0.33, up ? lo + 0.1 : hi + 0.1, 0, M.glowBlue);
  });
}
export function pipeLiftModel(): Model {
  return one(b => { b.cyl(0.13, 4.6, 0, 0.3, 0, M.greyLt, 12); b.torus(0.15, 0.03, 0, 0.55, 0, M.steelDk); b.torus(0.15, 0.03, 0, 4.55, 0, M.steelDk); b.cyl(0.1, 0.05, 0, 0, 0, M.concrete, 8); });
}
/** concrete tunnel mouth; local +x points out of the mountain */
export function portalModel(): Model {
  return one(b => {
    b.box(0.5, 1.6, 0.22, -0.05, 0, -0.62, M.concrete); b.box(0.5, 1.6, 0.22, -0.05, 0, 0.62, M.concrete);
    b.box(0.5, 0.35, 1.46, -0.05, 1.45, 0, M.concrete);
    b.box(0.52, 0.06, 1.48, -0.05, 1.8, 0, M.yellow);
    b.box(0.9, 1.45, 1.05, -0.5, 0, 0, M.black);
    b.box(0.08, 0.3, 0.9, 0.2, 1.47, 0, M.orange);
  });
}
/** rail signal post in the tile corner (path signals get a blue band) */
export function signalModel(path: boolean): Model {
  return one(b => { b.cyl(0.04, 1.0, 0.4, 0, 0.4, M.steelDk, 6); b.box(0.16, 0.28, 0.14, 0.4, 0.92, 0.4, M.black); b.box(0.18, 0.05, 0.16, 0.4, 0.86, 0.4, path ? M.blue : M.red); b.cyl(0.1, 0.05, 0.4, 0, 0.4, M.concrete, 8); });
}
export function railStraight(): Model {
  return one(b => {
    for (let i = 0; i < 3; i++) b.box(0.12, 0.05, 0.7, -0.33 + i * 0.33, 0, 0, M.wood);
    for (const z of [-0.22, 0.22]) b.box(1.0, 0.06, 0.05, 0, 0.05, z, M.steel);
  });
}
export function railCurve(): Model {
  return one(b => {
    for (let i = 0; i < 3; i++) { const a = (i + 0.5) / 3 * Math.PI / 2; b.add(new THREE.BoxGeometry(0.7, 0.05, 0.12), M.wood, -0.5 + Math.sin(a) * 0.5, 0.025, 0.5 - Math.cos(a) * 0.5, 0, -a + Math.PI / 2, 0); }
    for (const r of [0.28, 0.72]) arcBeams(b, r, 0.05, 0.05, 0.06, M.steel, -0.5, 0.5, 6);
  });
}
// Pipes
export function pipeArm(): Model { return one(b => { b.hcyl(0.11, 0.5, 0.25, 0.55, 0, M.greyLt, 'x', 12); b.torus(0.13, 0.025, 0.47, 0.55, 0, M.steelDk, 0); }); }
export function pipeHub(): Model { return one(b => { b.sphere(0.15, 0, 0.55, 0, M.greyLt, 12); b.cyl(0.04, 0.45, 0, 0, 0, M.steelDk, 6); b.cyl(0.1, 0.05, 0, 0, 0, M.concrete, 8); }); }
export function ptunnelModel(): Model { return one(b => { b.box(0.7, 0.6, 0.7, 0, 0, 0, M.steelDk); b.box(0.72, 0.08, 0.72, 0, 0.6, 0, M.blue); b.hcyl(0.11, 0.3, -0.35, 0.55, 0, M.greyLt, 'x', 12); }); }
