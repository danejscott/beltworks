// Materials + a tiny procedural model builder (merges primitives into one geometry per material).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function std(hex: string, rough = 0.55, metal = 0.2, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough, metalness: metal, ...extra });
}
export function glow(hex: string, intensity = 2) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color('#111111'), emissive: new THREE.Color(hex), emissiveIntensity: intensity, roughness: 0.6 });
}

// Satisfactory-ish industrial palette
export const M = {
  orange: std('#e2742a', 0.48, 0.3),
  orangeDk: std('#a8531c', 0.55, 0.3),
  steel: std('#9aa0a8', 0.35, 0.85),
  steelDk: std('#4c5058', 0.45, 0.75),
  grey: std('#6e7178', 0.6, 0.45),
  greyLt: std('#b8bbc0', 0.55, 0.35),
  concrete: std('#9d9a93', 0.92, 0.02),
  black: std('#232428', 0.55, 0.4),
  rubber: std('#1b1c1f', 0.95, 0.0),
  glass: std('#3a5566', 0.08, 0.3, { emissive: new THREE.Color('#0c1a22'), emissiveIntensity: 1 }),
  yellow: std('#e3b52a', 0.5, 0.25),
  white: std('#d9dbdf', 0.5, 0.2),
  copper: std('#c26a38', 0.32, 0.9),
  gold: std('#e8b84a', 0.25, 1.0),
  wood: std('#7a5636', 0.85, 0.0),
  teal: std('#2a9d90', 0.5, 0.3),
  purple: std('#7a5cd0', 0.5, 0.3),
  red: std('#c23a3a', 0.5, 0.3),
  blue: std('#3a82c2', 0.5, 0.3),
  green: std('#4a9a50', 0.5, 0.3),
  glowOrange: glow('#ff8a2a', 3),
  glowPink: glow('#ff5ab4', 2.5),
  glowBlue: glow('#5ab4ff', 2.5),
  glowGreen: glow('#5aff8a', 2),
  glowWhite: glow('#fff4d0', 2.5),
  glowYellow: glow('#ffd84a', 2.6),
  glowPurple: glow('#c070ff', 2.6),
  scorch: std('#2a2622', 0.97, 0.0),
  crysBlue: std('#3a8ae0', 0.15, 0.1, { emissive: new THREE.Color('#1f6ad8'), emissiveIntensity: 1.1 }),
  crysYellow: std('#e8b830', 0.15, 0.1, { emissive: new THREE.Color('#d89a10'), emissiveIntensity: 1.1 }),
  crysPurple: std('#a050e8', 0.15, 0.1, { emissive: new THREE.Color('#8030d0'), emissiveIntensity: 1.1 }),
  solar: std('#1c3560', 0.16, 0.75),
};
export type Mat = THREE.Material;

const E = new THREE.Euler(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), T = new THREE.Vector3(), MX = new THREE.Matrix4();

/** Collects primitives, then merges them into one grouped geometry + material list */
export class B {
  parts: { g: THREE.BufferGeometry; m: Mat }[] = [];
  add(g: THREE.BufferGeometry, m: Mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    E.set(rx, ry, rz); Q.setFromEuler(E); S.set(sx, sy, sz); T.set(x, y, z);
    MX.compose(T, Q, S);
    const gg = g.index ? g.toNonIndexed() : g.clone();
    gg.applyMatrix4(MX);
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') gg.deleteAttribute(k);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    this.parts.push({ g: gg, m });
    return this;
  }
  /** box with its bottom at y */
  box(w: number, h: number, d: number, x: number, y: number, z: number, m: Mat, ry = 0) { return this.add(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z, 0, ry, 0); }
  /** vertical cylinder with its bottom at y */
  cyl(r: number, h: number, x: number, y: number, z: number, m: Mat, seg = 16, rTop?: number) { return this.add(new THREE.CylinderGeometry(rTop ?? r, r, h, seg), m, x, y + h / 2, z); }
  /** horizontal cylinder along x (axis 'x') or z */
  hcyl(r: number, len: number, x: number, y: number, z: number, m: Mat, axis: 'x' | 'z' = 'x', seg = 14) {
    return this.add(new THREE.CylinderGeometry(r, r, len, seg), m, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
  }
  sphere(r: number, x: number, y: number, z: number, m: Mat, seg = 12) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), m, x, y, z); }
  torus(r: number, t: number, x: number, y: number, z: number, m: Mat, rx = Math.PI / 2) { return this.add(new THREE.TorusGeometry(r, t, 8, 24), m, x, y, z, rx); }
  cone(r: number, h: number, x: number, y: number, z: number, m: Mat, seg = 16) { return this.add(new THREE.ConeGeometry(r, h, seg), m, x, y + h / 2, z); }
  /** beam between two points (square section) */
  beam(a: number[], b: number[], t: number, m: Mat) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    const g = new THREE.BoxGeometry(t, L, t);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
    MX.compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1));
    const gg = g.toNonIndexed(); gg.applyMatrix4(MX);
    this.parts.push({ g: gg, m });
    return this;
  }
  build(): Model {
    const byMat = new Map<Mat, THREE.BufferGeometry[]>();
    for (const p of this.parts) { let a = byMat.get(p.m); if (!a) byMat.set(p.m, a = []); a.push(p.g); }
    const geos: THREE.BufferGeometry[] = [], mats: Mat[] = [];
    for (const [m, gs] of byMat) { geos.push(mergeGeometries(gs, false)!); mats.push(m); }
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, true)!;
    if (geos.length === 1) { geo.clearGroups(); geo.addGroup(0, geo.attributes.position.count, 0); }
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    return { geo, mats };
  }
}
export interface Model { geo: THREE.BufferGeometry; mats: Mat[] }

/** jagged rock: an icosahedron with noisy vertices, flat shaded */
export function rockGeo(r: number, seed: number, detail = 1, squash = 0.7) {
  const ico = new THREE.IcosahedronGeometry(r, detail);
  const g = ico.index ? ico.toNonIndexed() : ico;
  const p = g.attributes.position as THREE.BufferAttribute;
  const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const off = new Map<string, number>();
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    let f = off.get(k); if (f === undefined) { f = 0.75 + rnd() * 0.5; off.set(k, f); }
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * squash, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}
