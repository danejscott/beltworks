// Keeps the three.js scene in sync with the game world: instanced buildings, belts, items, rails, pipes,
// trees, vehicles, ghosts and effects.
import * as THREE from 'three';
import { SPR } from '../atlas';
import { BLD, ITEMS, RECIPES } from '../data';
import { dronePos } from '../drones';
import { hexCol, rgba } from '../gl';
import { curPhase } from '../progress';
import { ensureFresh } from '../sim';
import { H, W } from '../terrain';
import { signalRed, trainPoints } from '../trains';
import { nightness } from '../daynight';
import { DX, DY, easeOutBack, hash2 } from '../util';
import { parts, spawn, view } from '../view';
import { Ent, entAt, frontTiles, G, inPort, LH, PORTED, railSides } from '../world';
import { Billboards } from './bb';
import { C, screenRay } from './core';
import { B, M, Model, std } from './mat';
import * as MD from './models';
import { T3, tunnelInside, updateCuts } from './terrain3d';
import { MP } from '../teams';
import { Curve, railCurves } from '../railcurves';
import { isDepleted } from '../deplete';

// ---------------------------------------------------------------------------
// Team colours (online): the orange trim of a player's buildings and vehicles becomes their colour
const tintCache = new WeakMap<object, Map<string, THREE.Material[]>>();
const accentMats = new Map<string, THREE.Material>();
function accent(col: string, dark: boolean) {
  const k = col + (dark ? 'd' : '');
  let m = accentMats.get(k);
  if (!m) { const c = new THREE.Color(col); if (dark) c.multiplyScalar(0.62); m = std('#' + c.getHexString(), dark ? 0.55 : 0.48, 0.3); accentMats.set(k, m); }
  return m;
}
/** a team's colour, or '' for the default orange */
const teamHex = (o: number | undefined) => (MP.teams && o ? MP.info.get(o)?.col || '' : '');
/** the material list with orange swapped for the team's colour */
function tint(mats: THREE.Material | THREE.Material[], o: number | undefined): THREE.Material | THREE.Material[] {
  const col = teamHex(o);
  if (!col || !Array.isArray(mats)) return mats;
  let m = tintCache.get(mats);
  if (!m) tintCache.set(mats, m = new Map());
  let r = m.get(col);
  if (!r) { r = mats.map(x => x === M.orange ? accent(col, false) : x === M.orangeDk ? accent(col, true) : x); m.set(col, r); }
  return r;
}
const tkey = (o: number | undefined) => { const c = teamHex(o); return c ? '|' + c : ''; };
/** "Dane" or "Dane & Sam" (a team's players), falling back to the team's name */
function teamLabel(o: number) {
  const names = [...MP.players.values()].filter(p => p.team === o).map(p => p.name);
  return names.length ? names.slice(0, 3).join(' & ') + (names.length > 3 ? ' +' + (names.length - 3) : '') : MP.info.get(o)?.name || '';
}

const HP = Math.PI / 2;
export const poleReachT = (type: string) => (BLD[type].reach || 0) * (G.S && G.S.shop.wires ? 1.5 : 1);
const MX = new THREE.Matrix4(), LM = new THREE.Matrix4(), Q = new THREE.Quaternion(), EU = new THREE.Euler(), V = new THREE.Vector3(), SV = new THREE.Vector3(), COL = new THREE.Color();

// ---------------------------------------------------------------------------
class Batch {
  mesh!: THREE.InstancedMesh; n = 0; cap: number;
  constructor(public geo: THREE.BufferGeometry, public mat: THREE.Material | THREE.Material[], cap = 32, public shadow = true, public colors = false, public order = 0) { this.cap = cap; this.make(null); }
  make(old: THREE.InstancedMesh | null) {
    const m = new THREE.InstancedMesh(this.geo, this.mat, this.cap);
    m.castShadow = this.shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; m.renderOrder = this.order;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.colors) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    if (old) {
      (m.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      if (this.colors && old.instanceColor) (m.instanceColor!.array as Float32Array).set(old.instanceColor.array as Float32Array);
      C.scene.remove(old); old.dispose();
    }
    C.scene.add(m);
    this.mesh = m;
  }
  begin() { this.n = 0; }
  push(m: THREE.Matrix4, c?: THREE.Color) {
    if (this.n >= this.cap) { this.cap *= 2; this.make(this.mesh); }
    m.toArray(this.mesh.instanceMatrix.array as Float32Array, this.n * 16);
    if (this.colors && c) c.toArray(this.mesh.instanceColor!.array as Float32Array, this.n * 3);
    this.n++;
  }
  /** append recorded instances (16 floats per matrix, 3 per colour) */
  pushArr(m: number[], c: number[]) {
    const n = m.length >> 4;
    if (!n) return;
    if (this.n + n > this.cap) { while (this.n + n > this.cap) this.cap *= 2; this.make(this.mesh); }
    (this.mesh.instanceMatrix.array as Float32Array).set(m, this.n * 16);
    if (this.colors && c.length) (this.mesh.instanceColor!.array as Float32Array).set(c, this.n * 3);
    this.n += n;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.colors) this.mesh.instanceColor!.needsUpdate = true;
  }
}
interface Pusher { push(m: THREE.Matrix4, c?: THREE.Color): void }
interface LayerLike { get(key: string, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], shadow?: boolean, colors?: boolean): Pusher }
/** records instances for one chunk of the static layer (copied into the real meshes later) */
class RecBatch implements Pusher {
  m: number[] = []; c: number[] = [];
  constructor(public geo: THREE.BufferGeometry, public mat: THREE.Material | THREE.Material[], public shadow: boolean, public colors: boolean) { }
  push(mx: THREE.Matrix4, col?: THREE.Color) {
    mx.toArray(this.m, this.m.length);
    if (this.colors) { if (col) col.toArray(this.c, this.c.length); else this.c.push(1, 1, 1); }
  }
}
class Rec implements LayerLike {
  map = new Map<string, RecBatch>();
  get(key: string, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], shadow = true, colors = false) {
    let b = this.map.get(key);
    if (!b) { b = new RecBatch(geo, mat, shadow, colors); this.map.set(key, b); }
    return b;
  }
}
class Layer implements LayerLike {
  map = new Map<string, Batch>();
  get(key: string, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], shadow = true, colors = false, order = 0) {
    let b = this.map.get(key);
    if (!b) { b = new Batch(geo, mat, 32, shadow, colors, order); this.map.set(key, b); }
    return b;
  }
  begin() { for (const b of this.map.values()) b.begin(); }
  end() { for (const b of this.map.values()) b.end(); }
}

// ---------------------------------------------------------------------------
let TPL: Record<string, MD.Template>;
const models: Record<string, Model> = Object.create(null);
const mdl = (k: string, f: () => Model) => models[k] || (models[k] = f());
let beltMats: Record<string, THREE.MeshStandardMaterial>;
let ghostOK: THREE.Material, ghostBad: THREE.Material, areaMat: THREE.Material, lightMat: THREE.MeshBasicMaterial, fadeMat: THREE.Material, deckFade: THREE.Material;
let SL: Layer, DL: Layer, GL: Layer, TL: Layer;
let bbs: Billboards, bbAdd: Billboards;
let prevWires: THREE.LineSegments, ringMat: THREE.Material, ringGeo: THREE.BufferGeometry;
let wires: THREE.LineSegments, selPlane: THREE.Mesh, hoverBox: THREE.LineSegments, inspBox: THREE.LineSegments;
let lastRev = -1, lastStatic = 0, animEnts: Ent[] = [], popping = false, lastFluidSig = '';
/** buildings still playing their pop-in animation: drawn each frame in the dynamic layer, so the static layer isn't rebuilt every frame */
let popEnts: Ent[] = [], popUntil = 0;
let sigRails: Ent[] = [], lampEnts: Ent[] = [], visFeats: { x: number; y: number; kind: string; tier: number }[] = [];
const AM = new THREE.Matrix4();
function fluidSig() { let s = ''; for (const n of G.fnets) s += (n.fluid || '-')[0] + (n.fluid || '').length; return s; }
let treeState = { x: -999, y: -999, r: 0, rev: -1, t: 0 };
const leafUniform = { value: 0 };

function beltTexture(hex: string) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d')!;
  g.fillStyle = '#26282c'; g.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 16) { g.fillStyle = '#3a3d44'; g.fillRect(x, 0, 6, 64); g.fillStyle = '#18191c'; g.fillRect(x + 6, 0, 2, 64); }
  g.globalAlpha = 0.55; g.strokeStyle = hex; g.lineWidth = 4; g.lineCap = 'round';
  for (const x of [8, 40]) { g.beginPath(); g.moveTo(x, 18); g.lineTo(x + 10, 32); g.lineTo(x, 46); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function init3D() {
  TPL = MD.buildTemplates();
  beltMats = {};
  for (const [k, hex] of [['belt1', '#e0a030'], ['belt2', '#4cc38a'], ['belt3', '#4ea1ff'], ['belt4', '#c77dff'], ['gold', '#f5c542']] as [string, string][]) {
    beltMats[k] = new THREE.MeshStandardMaterial({ map: beltTexture(hex), roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide });
  }
  ghostOK = new THREE.MeshStandardMaterial({ color: '#7dffa0', transparent: true, opacity: 0.45, depthWrite: false, emissive: new THREE.Color('#1a6a30'), side: THREE.DoubleSide });
  ghostBad = new THREE.MeshStandardMaterial({ color: '#ff6060', transparent: true, opacity: 0.45, depthWrite: false, emissive: new THREE.Color('#6a1a1a'), side: THREE.DoubleSide });
  areaMat = new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.12, depthWrite: false });
  // floors above the one you're working on are drawn see-through
  fadeMat = new THREE.MeshStandardMaterial({ color: '#c8d4e0', transparent: true, opacity: 0.16, depthWrite: false, roughness: 0.6 });
  deckFade = new THREE.MeshStandardMaterial({ color: '#b8c0c8', transparent: true, opacity: 0.1, depthWrite: false, roughness: 0.8 });
  lightMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  // gently swaying leaves (idle animation)
  MD.treeModels().forEach((t, i) => { models['tree' + i] = t; });
  MD.treeModelsLow().forEach((t, i) => { models['treeL' + i] = t; });
  for (const k in models) if (k.startsWith('tree')) for (const m of models[k].mats) {
    const sm = m as THREE.MeshStandardMaterial;
    if ((sm as any)._sway) continue; (sm as any)._sway = 1;
    sm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = leafUniform;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        float k = max(position.y - 0.35, 0.0);
        transformed.x += sin(uTime * 1.4 + ph) * 0.05 * k;
        transformed.z += cos(uTime * 1.1 + ph) * 0.03 * k;
        #endif`);
    };
  }
  SL = new Layer(); DL = new Layer(); GL = new Layer(); TL = new Layer();
  bbs = new Billboards(C.scene, 8000, false);
  bbAdd = new Billboards(C.scene, 2000, true);
  wires = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#1a1a1c' }));
  wires.frustumCulled = false; C.scene.add(wires);
  prevWires = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#7dffa0', transparent: true, opacity: 0.9, depthTest: false }));
  prevWires.frustumCulled = false; prevWires.renderOrder = 15; C.scene.add(prevWires);
  ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  ringGeo = new THREE.RingGeometry(0.965, 1, 96).rotateX(-Math.PI / 2);
  selPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: '#ffffff', opacity: 0.2 }));
  selPlane.visible = false; C.scene.add(selPlane);
  const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  hoverBox = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthTest: false }));
  inspBox = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: '#f5a524', depthTest: false }));
  hoverBox.renderOrder = inspBox.renderOrder = 20;
  C.scene.add(hoverBox); C.scene.add(inspBox);
}
export function reset3D() { lastRev = -1; fullNext = true; needAssemble = true; treeState = { x: -999, y: -999, r: 0, rev: -1, t: 0 }; }

// ---------------------------------------------------------------------------
/** height offset of the floor currently being drawn (added by compose) */
let ZO = 0;
function compose(x: number, h: number, y: number, ry: number, sx = 1, sy = 1, sz = 1) {
  EU.set(0, ry, 0); Q.setFromEuler(EU); V.set(x, h + ZO, y); SV.set(sx, sy, sz);
  return MX.compose(V, Q, SV);
}
const rotOf = (e: Ent) => BLD[e.type].noRotate ? 0 : -e.rot * HP;
export function visHeight(e: Ent) {
  const d = BLD[e.type];
  if (d.kind === 'belt') return 0.35;
  if (d.kind === 'lift' || d.dz) return LH + 0.4;
  if (d.kind === 'rail') return 0.12;
  if (d.kind === 'pipe' || d.kind === 'ptunnel' || d.kind === 'tunnel') return 0.75;
  return TPL[e.type] ? TPL[e.type].height : 1;
}

function pushTemplate(L: LayerLike, key: string, t: MD.Template, m: THREE.Matrix4, mat?: THREE.Material, o?: number) {
  L.get(key + (mat ? '' : tkey(o)), t.stat.geo, mat || tint(t.stat.mats, o)).push(m);
}
function pushModel(L: LayerLike, key: string, model: Model, m: THREE.Matrix4, mat?: THREE.Material, shadow = true, o?: number) {
  L.get(key + (mat ? '' : tkey(o)), model.geo, mat || tint(model.mats, o), shadow).push(m);
}
/** orange arrow in front (output) and blue arrow behind (input) for every building with ports */
const OUT_KINDS = new Set(['machine', 'miner', 'harvester', 'storage', 'station', 'tstation', 'port', 'drone']);
const inArrowModel = () => mdl('arrowIn', () => { const b = new B(); b.add(new THREE.ConeGeometry(0.2, 0.36, 3), M.glowBlue, 0, 0.03, 0, 0, 0, -HP); return b.build(); });
const outArrowModel = () => mdl('arrowOut', () => { const b = new B(); b.add(new THREE.ConeGeometry(0.2, 0.36, 3), M.glowOrange, 0, 0.03, 0, 0, 0, -HP); return b.build(); });
/** where items go in and come out: [tile x, tile y, direction the item moves, out?] */
export function portArrows(e: { type: string; x: number; y: number; w: number; h: number; rot: number }): [number, number, number, boolean][] {
  const d = BLD[e.type];
  if (!d) return [];
  const out: [number, number, number, boolean][] = [];
  const r = e.rot;
  if (d.kind === 'splitter' || d.kind === 'sorter' || d.kind === 'merger') {
    // 1x1 logistics: splitters take from behind and send forward/left/right; mergers the reverse
    const back = (r + 2) & 3, sides = [r, (r + 3) & 3, (r + 1) & 3];
    if (d.kind === 'merger') {
      for (const s of [back, (r + 3) & 3, (r + 1) & 3]) out.push([e.x + DX[s], e.y + DY[s], (s + 2) & 3, false]);
      out.push([e.x + DX[r], e.y + DY[r], r, true]);
    } else {
      out.push([e.x + DX[back], e.y + DY[back], r, false]);
      for (const s of sides) out.push([e.x + DX[s], e.y + DY[s], s, true]);
    }
    return out;
  }
  if (d.kind === 'tstation') {
    const [ix, iy] = inPort(e);
    if ((e as any).mode === 'unload') out.push([ix, iy, (r + 2) & 3, true]); else out.push([ix, iy, r, false]);
    return out;
  }
  const hasIn = PORTED.has(d.kind) && !(d.kind === 'gen' && !(d.fuels && Object.keys(d.fuels).some(f => !ITEMS[f].fluid)));
  const hasOut = OUT_KINDS.has(d.kind) || !!d.waste;
  if (hasOut) { const [fx, fy] = frontTiles(e)[0]; out.push([fx, fy, d.pier ? (r + 2) & 3 : r, true]); }
  if (hasIn) { const [ix, iy] = inPort(e); out.push([ix, iy, r, false]); }
  return out;
}
function pushPortArrows(L: LayerLike, e: Ent, pre: string, force = false) {
  const free = (x: number, y: number) => { if (pre || force) return true; const n = entAt(x, y, e.z || 0); return !(n && (BLD[n.type].kind === 'belt' || BLD[n.type].kind === 'tunnel')); };
  // arrows on a selected building float above belts so they're always visible
  const h = force ? 0.55 : 0.03, sc = force ? 1.8 : 1.5, sy = force ? 0.6 : 0.3;
  for (const [x, y, dir, isOut] of portArrows(e)) {
    if (!free(x, y)) continue;
    const off = isOut ? -0.2 : 0.2;   // nudged toward the building
    pushModel(L, pre + (isOut ? 'arrowOut' : 'arrowIn'), isOut ? outArrowModel() : inArrowModel(), compose(x + 0.5 + DX[dir] * off, h, y + 0.5 + DY[dir] * off, -dir * HP, sc, sy, sc), undefined, false);
  }
}
const arrowModel = () => mdl('arrow', () => { const b = new B(); b.add(new THREE.ConeGeometry(0.16, 0.3, 3), M.orange, 0, 0.03, 0, 0, 0, -HP); return b.build(); });
/** level-of-detail settings (tweakable from the console for testing) */
export const LOD = { itemFar: 0.45 };
let cargoMat: THREE.Material | null = null, itemFarMat: THREE.Material | null = null;
const beltKey = (b: Ent) => G.S.shop.gold ? 'gold' : (b.type in { belt1: 1, belt2: 1, belt3: 1, belt4: 1 } ? b.type : 'belt1');
const surfS = () => mdl('surfS', () => ({ geo: MD.beltSurfaceStraight(), mats: [] }));
const surfC = () => mdl('surfC', () => ({ geo: MD.beltSurfaceCurve(), mats: [] }));

function pushBelt(L: LayerLike, b: Ent, mat?: THREE.Material, prefix = '') {
  const cx = b.x + 0.5, cy = b.y + 0.5;
  if (BLD[b.type].kind === 'tunnel') {
    pushModel(L, prefix + (b.isExit ? 'tunOut' : 'tunIn'), mdl(b.isExit ? 'tunOut' : 'tunIn', () => MD.tunnelModel(!!b.isExit)), compose(cx, 0, cy, -b.rot * HP), mat);
    return;
  }
  const curve = b.curve >= 0 && !mat;
  if (curve) {
    const right = b.rot === ((b.curve + 1) & 3);
    const m = compose(cx, 0, cy, -(b.rot - 1) * HP, right ? 1 : -1, 1, 1);
    pushModel(L, prefix + 'beltFC', mdl('beltFC', MD.beltFrameCurve), m, mat);
    L.get(prefix + 'bsC:' + beltKey(b), surfC().geo, mat || beltMats[beltKey(b)], false).push(m);
  } else {
    const m = compose(cx, 0, cy, -b.rot * HP);
    pushModel(L, prefix + 'beltFS', mdl('beltFS', MD.beltFrameStraight), m, mat);
    L.get(prefix + 'bsS:' + (mat ? 'g' : beltKey(b)), surfS().geo, mat || beltMats[beltKey(b)], false).push(m);
  }
}
function pushRail(L: LayerLike, x: number, y: number, pairs: number, mat?: THREE.Material, prefix = '', curves?: Map<number, Curve>) {
  const ti = y * W + x;
  if (!prefix && (G.tiles[ti] === 4 || G.tiles[ti] === 5)) pushModel(L, 'railBridge', mdl('railBridge', MD.railBridge), compose(x + 0.5, 0, y + 0.5, (pairs & 2) && !(pairs & 1) ? -HP : 0));
  if (curves && curves.has(ti)) return;   // drawn as part of a wide curve
  for (let i = 0; i < 6; i++) {
    if (!(pairs & (1 << i))) continue;
    if (i < 2) pushModel(L, prefix + 'railS', mdl('railS', MD.railStraight), compose(x + 0.5, 0, y + 0.5, i === 0 ? 0 : -HP), mat, false);
    else { const k = i === 3 ? 0 : i === 4 ? 1 : i === 5 ? 2 : 3; pushModel(L, prefix + 'railC', mdl('railC', MD.railCurve), compose(x + 0.5, 0, y + 0.5, -k * HP), mat, false); }
  }
}
function pipeConn(e: Ent, d: number, lv = e.z || 0) {
  const n = entAt(e.x + DX[d], e.y + DY[d], lv);
  if (!n) return false;
  const k = BLD[n.type].kind;
  if (k === 'pipe' || k === 'tank') return true;
  if (k === 'ptunnel') { const s = n.isExit ? n.rot : (n.rot + 2) & 3; return n.x + DX[s] === e.x && n.y + DY[s] === e.y; }
  return k === 'machine' || k === 'extractor' || (k === 'gen' && (!!BLD[n.type].water || n.type === 'fuel_gen'));
}

/** tunnel mouths where a railway disappears into a mountain */
/** a rail tile is 'inside' the mountain when all four of its corners are above the tunnel height */
const inside = tunnelInside;
function pushPortals(L: LayerLike, e: Ent) {
  if (!inside(e.x, e.y)) return;
  const sides = railSides(e.pairs);
  for (let s = 0; s < 4; s++) {
    if (!(sides & (1 << s))) continue;
    if (inside(e.x + DX[s], e.y + DY[s])) continue;
    pushModel(L, 'portal', mdl('portal', MD.portalModel), compose(e.x + 0.5 + DX[s] * 0.5, 0, e.y + 0.5 + DY[s] * 0.5, -s * HP));
  }
}
// ---------------------------------------------------------------------------
// The static layer is recorded in 16x16-tile chunks. A change only re-records the chunks around it, and moving the
// camera reuses chunks already recorded; the visible chunks are then copied into the instanced meshes.
const CH = 16;
interface VisFeat { x: number; y: number; kind: string; tier: number }
interface Chunk { rec: Rec; anim: Ent[]; lamps: Ent[]; sig: Ent[]; feats: VisFeat[]; pops: Ent[]; popUntil: number }
let chunks = new Map<number, Chunk>();
const ckey = (cx: number, cy: number) => cy * 4096 + cx;
let fullNext = true, lastTouchN = 0, lastCutRev = -1, needAssemble = true;
let stX = -1e9, stY = -1e9, stR = 0;

/** record the given chunks (one pass over everything in the world) */
function recordChunks(keys: Set<number>, real: number) {
  const nc = new Map<number, Chunk>();
  for (const k of keys) { const c: Chunk = { rec: new Rec(), anim: [], lamps: [], sig: [], feats: [], pops: [], popUntil: 0 }; nc.set(k, c); chunks.set(k, c); }
  const at = (x: number, y: number) => nc.get(ckey(Math.floor(x / CH), Math.floor(y / CH)));
  const rc = railCurves(), curveTiles = rc.byTile;
  const lvl = view.level;
  if (lvl === 0) for (const c of rc.corners) {
    const ch = at(c.cx, c.cy); if (!ch) continue;
    const qx = -(DX[c.a] + DX[c.b]), qy = -(DY[c.a] + DY[c.b]);   // from the arc's centre toward the corner
    const k = qx > 0 && qy < 0 ? 0 : qx > 0 && qy > 0 ? 1 : qx < 0 && qy > 0 ? 2 : 3;
    pushModel(ch.rec, 'railArc', mdl('railArc', MD.railArcBig), compose(c.ox, 0, c.oy, -k * HP), undefined, false);
  }
  for (const e of G.ents.values()) {
    const ch = at(e.x, e.y);
    if (!ch) continue;
    const L = ch.rec;
    const d = BLD[e.type], k = d.kind, z = e.z || 0;
    const base = e.z2 !== undefined ? Math.min(z, e.z2) : z;
    const faded = base > lvl;
    ZO = base * LH;
    if (k === 'lift') { pushModel(L, (faded ? 'F' : '') + 'lift' + d.dz, mdl('lift' + d.dz, () => MD.liftModel(d.dz! > 0)), compose(e.x + 0.5, 0, e.y + 0.5, -e.rot * HP), faded ? fadeMat : undefined); continue; }
    if (e.type === 'pipe_lift') {
      pushModel(L, (faded ? 'F' : '') + 'pipeLift', mdl('pipeLift', MD.pipeLiftModel), compose(e.x + 0.5, 0, e.y + 0.5, 0), faded ? fadeMat : undefined);
      for (const lv of [z, e.z2]) { if (lv > lvl) continue; ZO = lv * LH; for (let dd = 0; dd < 4; dd++) if (pipeConn(e, dd, lv)) pushModel(L, 'pipeArm', mdl('pipeArm', MD.pipeArm), compose(e.x + 0.5, 0, e.y + 0.5, -dd * HP)); }
      continue;
    }
    if (faded) {
      if (k === 'belt' || k === 'tunnel') pushBelt(L, e, fadeMat, 'F');
      else if (k === 'pipe') pushModel(L, 'Fpipe', mdl('pipeHub', MD.pipeHub), compose(e.x + 0.5, 0, e.y + 0.5, 0), fadeMat);
      else if (TPL[e.type]) pushTemplate(L, 'F:' + e.type, TPL[e.type], compose(e.x + e.w / 2, 0, e.y + e.h / 2, rotOf(e)), fadeMat);
      continue;
    }
    if (k === 'belt' || k === 'tunnel') { pushBelt(L, e); continue; }
    if (k === 'rail') {
      pushRail(L, e.x, e.y, e.pairs, undefined, '', curveTiles);
      if (e.sig) ch.sig.push(e);
      if (G.tiles[e.y * W + e.x] === 6) pushPortals(L, e);
      continue;
    }
    if (k === 'pipe') {
      const cx = e.x + 0.5, cy = e.y + 0.5;
      const fl = e.fnet && e.fnet.fluid ? ITEMS[e.fnet.fluid].c : '#d0d4da';
      COL.set(fl).lerp(new THREE.Color('#ffffff'), 0.35);
      L.get('pipeHub', mdl('pipeHub', MD.pipeHub).geo, mdl('pipeHub', MD.pipeHub).mats, true, true).push(compose(cx, 0, cy, 0), COL);
      let any = false;
      for (let dd = 0; dd < 4; dd++) if (pipeConn(e, dd)) { any = true; pushModel(L, 'pipeArm', mdl('pipeArm', MD.pipeArm), compose(cx, 0, cy, -dd * HP)); }
      if (!any) pushModel(L, 'pipeArm', mdl('pipeArm', MD.pipeArm), compose(cx, 0, cy, 0));
      continue;
    }
    if (k === 'ptunnel') { pushModel(L, 'ptun', mdl('ptun', MD.ptunnelModel), compose(e.x + 0.5, 0, e.y + 0.5, -(e.isExit ? e.rot + 2 : e.rot) * HP)); continue; }
    const t = TPL[e.type];
    if (!t) continue;
    // just placed: plays its pop-in animation in the dynamic layer, then this chunk is re-recorded
    if (real - e.born < 0.45) { ch.pops.push(e); ch.popUntil = Math.max(ch.popUntil, e.born + 0.45); continue; }
    pushTemplate(L, 'T:' + e.type, t, compose(e.x + e.w / 2, 0, e.y + e.h / 2, rotOf(e)), undefined, e.o);
    if (t.anims.length || t.light || t.smoke || t.glow) ch.anim.push(e);
    if (e.type === 'lamp') ch.lamps.push(e);
    pushPortArrows(L, e, '');
  }
  ZO = 0;
  // foundation decks (and their support pillars)
  if (G.floorN) {
    const dm = mdl('deck', MD.deckModel), pm = mdl('pillar', MD.pillarModel);
    for (const key of keys) {
      const ch = nc.get(key)!, cx = key % 4096, cy = Math.floor(key / 4096);
      for (let y = cy * CH; y < Math.min(H, cy * CH + CH); y++) for (let x = cx * CH; x < Math.min(W, cx * CH + CH); x++) {
        const f = G.floor[y * W + x];
        if (!f) continue;
        for (let z = 1; z < 4; z++) {
          if (!(f & (1 << z))) continue;
          const faded = z > lvl;
          pushModel(ch.rec, faded ? 'deckF' : 'deck', dm, compose(x + 0.5, z * LH - 0.3, y + 0.5, 0), faded ? deckFade : undefined, !faded);
          if ((x & 3) === 0 && (y & 3) === 0 && !faded) {
            let below = 0; for (let zz = z - 1; zz >= 1; zz--) if (f & (1 << zz)) { below = zz; break; }
            const bh = below * LH, top = z * LH - 0.3;
            pushModel(ch.rec, 'pillar', pm, compose(x + 0.5, bh, y + 0.5, 0, 1, top - bh, 1));
          }
        }
      }
    }
  }
  // resource nodes (hidden under miners)
  for (const n of G.nodes) {
    const ch = at(n.x, n.y);
    if (!ch || G.grid[n.y * W + n.x]) continue;
    const v = n.id % 3;
    if (isDepleted(n)) { pushModel(ch.rec, 'node:spent', mdl('node:spent', () => MD.nodeModel('coal', 0)), compose(n.x + 1, -0.05, n.y + 1, n.id, 0.8, 0.25, 0.8)); continue; }
    const key = 'node:' + n.res + ':' + v;
    pushModel(ch.rec, key, mdl(key, () => MD.nodeModel(n.res, v)), compose(n.x + 1, 0, n.y + 1, (n.id * 2.39) % (Math.PI * 2), n.p === 2 ? 1.1 : n.p === 0 ? 0.85 : 1, 1, n.p === 2 ? 1.1 : n.p === 0 ? 0.85 : 1));
  }
  // crash sites and power crystals
  const looted = new Set(G.S.looted);
  for (const f of G.feats) {
    const ch = at(f.x, f.y);
    if (!ch || looted.has(f.id)) continue;
    const cx = f.x + f.w / 2, cy = f.y + f.w / 2, ry = (f.id * 1.7) % (Math.PI * 2);
    if (f.kind === 'site') pushModel(ch.rec, 'site', mdl('site', MD.siteModel), compose(cx, 0, cy, ry));
    else pushModel(ch.rec, 'crys' + f.tier, mdl('crys' + f.tier, () => MD.crystalModel(f.tier)), compose(cx, 0, cy, ry, 1.3, 1.3, 1.3));
    ch.feats.push({ x: cx, y: cy, kind: f.kind, tier: f.tier });
  }
}

/** bring the static layer up to date: re-record what changed, then copy the visible chunks into the meshes */
export const ST = { n: 0, fresh: 0, rec: 0, recN: 0, asm: 0, full: 0 };
function rebuildStatic(real: number) {
  const q0 = performance.now(); ST.n++;
  ensureFresh();
  const q1 = performance.now(); ST.fresh += q1 - q0;
  if (G.railRev !== lastCutRev) { lastCutRev = G.railRev; const rr: number[] = []; for (const r of G.L.rails) if (G.tiles[r.y * W + r.x] === 6) rr.push(r.y * W + r.x); updateCuts(rr); }
  // what changed since last time: specific areas (just those chunks) or anything else (everything)
  const tagged = G.rev - lastRev === G.touchN - lastTouchN;
  if (fullNext || !tagged) { chunks.clear(); fullNext = false; ST.full++; }
  else {
    const t = G.touched;
    for (let i = 0; i + 3 < t.length; i += 4) {
      const x0 = Math.floor((t[i] - 2) / CH), y0 = Math.floor((t[i + 1] - 2) / CH), x1 = Math.floor((t[i + 2] + 2) / CH), y1 = Math.floor((t[i + 3] + 2) / CH);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) chunks.delete(ckey(cx, cy));
    }
  }
  G.touched.length = 0; lastTouchN = G.touchN; lastRev = G.rev;
  // chunks with finished pop-in animations are recorded again (now as normal buildings)
  for (const [k, c] of chunks) if (c.pops.length && real >= c.popUntil) chunks.delete(k);
  // the visible chunks
  const SR = C.dist * 1.3 + 16, sx = view.cam.x, sy = view.cam.y;
  stX = sx; stY = sy; stR = SR;
  const cx0 = Math.max(0, Math.floor((sx - SR) / CH)), cx1 = Math.min(Math.ceil(W / CH) - 1, Math.floor((sx + SR) / CH));
  const cy0 = Math.max(0, Math.floor((sy - SR) / CH)), cy1 = Math.min(Math.ceil(H / CH) - 1, Math.floor((sy + SR) / CH));
  const vis: number[] = [], missing = new Set<number>();
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const k = ckey(cx, cy); vis.push(k); if (!chunks.has(k)) missing.add(k); }
  const q2 = performance.now();
  if (missing.size) recordChunks(missing, real);
  const q3 = performance.now(); ST.rec += q3 - q2; ST.recN += missing.size;
  // forget chunks far away (memory)
  if (chunks.size > vis.length * 3 + 64) { const keep = new Set(vis); for (const k of [...chunks.keys()]) if (!keep.has(k)) chunks.delete(k); }
  // copy into the meshes
  SL.begin();
  animEnts = []; lampEnts = []; sigRails = []; visFeats = []; popEnts = []; popUntil = 0; popping = false;
  for (const k of vis) {
    const c = chunks.get(k)!;
    for (const [key, r] of c.rec.map) SL.get(key, r.geo, r.mat, r.shadow, r.colors).pushArr(r.m, r.c);
    if (c.anim.length) animEnts.push(...c.anim);
    if (c.lamps.length) lampEnts.push(...c.lamps);
    if (c.sig.length) sigRails.push(...c.sig);
    if (c.feats.length) visFeats.push(...c.feats);
    if (c.pops.length) { popEnts.push(...c.pops); popUntil = Math.max(popUntil, c.popUntil); popping = true; }
  }
  SL.end();
  needAssemble = false;
  ST.asm += performance.now() - q3;
  // power lines
  const inR = (x: number, y: number, pad = 0) => x > sx - SR - pad && x < sx + SR + pad && y > sy - SR - pad && y < sy + SR + pad;
  const pts: number[] = [];
  const wz = (e: Ent) => (e.type === 'outpost' ? 3.3 : e.type === 'tower' ? 4.45 : e.type === 'pole2' ? 2.3 : e.type === 'hub' ? 3.7 : 1.82) + (e.z || 0) * LH;
  const wxy = (e: Ent) => e.type === 'hub' ? [e.x + e.w / 2 + 1.3, e.y + e.h / 2 - 1.3] : [e.x + e.w / 2, e.y + e.h / 2];
  for (const p of G.L.poles) for (const q of p.wires || []) {
    if (!inR(p.x, p.y, 70) && !inR(q.x, q.y, 70)) continue;
    const [ax, ay] = wxy(p), [bx, by] = wxy(q), za = wz(p), zb = wz(q);
    const sag = Math.min(0.9, Math.hypot(bx - ax, by - ay) * 0.04);
    let px = ax, py = ay, pz = za;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = za + (zb - za) * t - sag * 4 * t * (1 - t);
      pts.push(px, pz, py, x, z, y); px = x; py = y; pz = z;
    }
  }
  wires.geometry.dispose();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  wires.geometry = g;
}

// ---------------------------------------------------------------------------
function rebuildTrees(cx: number, cy: number, R: number) {
  TL.begin();
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R)), y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
  let n = 0;
  for (let y = y0; y <= y1 && n < 26000; y++) for (let x = x0; x <= x1; x++) {
    if (!G.trees[y * W + x]) continue;
    const h = hash2(x, y, 7), v = h < 0.3 ? 0 : h < 0.65 ? 1 : h < 0.9 ? 2 : 3;
    const s = 0.8 + hash2(x, y, 11) * 0.55;
    // trees further out use the cheap stand-ins
    const far = Math.abs(x - cx) + Math.abs(y - cy) > R * 0.55;
    const key = (far ? 'treeL' : 'tree') + v;
    TL.get(key, models[key].geo, models[key].mats, !far).push(compose(x + 0.5 + (h - 0.5) * 0.4, 0, y + 0.5 + (hash2(y, x, 3) - 0.5) * 0.4, h * 20, s, s * (0.9 + hash2(x, y, 5) * 0.3), s));
    n++;
  }
  TL.end();
}

// ---------------------------------------------------------------------------
const ST_COL: Record<string, string> = { work: '#3cff7a', starve: '#ffd23c', block: '#ff4040', idle: '#8aa0b8', nopower: '#a07aff', lowpower: '#ff9a3a', noout: '#ff4040' };
const col3: Record<string, THREE.Color> = {};
const stc = (st: string) => col3[st] || (col3[st] = new THREE.Color(ST_COL[st] || '#888888'));
const AO: MD.AnimOut = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1 };
const GLOW_OR = hexCol('#ff9a3a', 0.8), SMOKE_L = rgba(0.9, 0.9, 0.92, 0.45), SMOKE_D = rgba(0.28, 0.28, 0.3, 0.5);

export interface Label3 { x: number; y: number; z: number; t: string; c: string }
export function update3D(time: number, real: number, dt: number, labels: Label3[]) {
  leafUniform.value = real;
  // static layer
  if (real - lastStatic > 1) { lastStatic = real; const sig = fluidSig(); if (sig !== lastFluidSig) { lastFluidSig = sig; fullNext = true; needAssemble = true; } }
  const wantR = C.dist * 1.3 + 16;
  if (Math.abs(view.cam.x - stX) > stR * 0.3 || Math.abs(view.cam.y - stY) > stR * 0.3 || Math.abs(wantR - stR) > stR * 0.3) needAssemble = true;
  if (G.rev !== lastRev || needAssemble || (popping && real >= popUntil)) rebuildStatic(real);
  // trees near the camera
  const R = Math.min(150, C.dist * 1.7 + 25);
  const ts = treeState;
  if (Math.hypot(view.cam.x - ts.x, view.cam.y - ts.y) > R * 0.25 || Math.abs(R - ts.r) > ts.r * 0.3 || (ts.rev !== G.treeRev && real - ts.t > 0.4)) {
    rebuildTrees(view.cam.x, view.cam.y, R); ts.x = view.cam.x; ts.y = view.cam.y; ts.r = R; ts.rev = G.treeRev; ts.t = real;
    T3.uniforms.uCamT.value.set(ts.x, ts.y); T3.uniforms.uTreeR.value = R;
  }
  // dynamic layer
  DL.begin(); bbs.begin(); bbAdd.begin();
  for (const e of popEnts) {
    if (!G.ents.has(e.id)) continue;
    const t = TPL[e.type]; if (!t) continue;
    ZO = (e.z || 0) * LH;
    const sy = Math.max(0.02, easeOutBack(Math.min(1, Math.max(0, (real - e.born) / 0.45))));
    pushTemplate(DL, 'T:' + e.type, t, compose(e.x + e.w / 2, 0, e.y + e.h / 2, rotOf(e), 1, sy, 1), undefined, e.o);
  }
  ZO = 0;
  const near = C.dist < 60, close = C.dist < 30;
  const tgx = view.cam.x, tgy = view.cam.y, VR = C.dist * 1.6 + 20;
  for (const e of animEnts) {
    if (!G.ents.has(e.id) || (e.z || 0) > view.level) continue;
    const t = TPL[e.type], d = BLD[e.type];
    const busy = d.kind === 'gen' ? (e.avail > 0 && e.pnet && e.pnet.load > 0) : (e.st === 'work' || e.st === 'lowpower');
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, ry = rotOf(e);
    const far = Math.abs(cx - tgx) > VR || Math.abs(cy - tgy) > VR;
    const zoff = (e.z || 0) * LH;
    ZO = zoff;
    const base = compose(cx, 0, cy, ry);
    ZO = 0;
    const baseM = LM.copy(base);
    if (!far) for (const a of t.anims) {
      AO.x = AO.y = AO.z = AO.rx = AO.ry = AO.rz = 0; AO.s = 1;
      a.fn(AO, e, time, real, !!busy);
      EU.set(AO.rx, AO.ry, AO.rz); Q.setFromEuler(EU); V.set(AO.x, AO.y, AO.z); SV.set(AO.s, AO.s, AO.s);
      const m = AM.compose(V, Q, SV).premultiply(baseM);
      DL.get('A:' + e.type + ':' + a.key + tkey(e.o), a.model.geo, tint(a.model.mats, e.o)).push(m);
    }
    const co = Math.cos(ry), si = Math.sin(ry);
    const loc = (p: number[]) => [cx + p[0] * co + p[2] * si, cy - p[0] * si + p[2] * co, p[1] + zoff];
    if (t.light) {
      const st = d.kind === 'gen' ? (e.st || 'idle') : e.st || 'idle';
      const [lx, ly, lz] = loc(t.light);
      const blink = (st === 'block' || st === 'nopower') && Math.sin(real * 7) < 0;
      DL.get('light', mdl('lightS', () => ({ geo: new THREE.SphereGeometry(0.07, 8, 6), mats: [] })).geo, lightMat, false, true).push(compose(lx, lz, ly, 0, blink ? 0.3 : 1, blink ? 0.3 : 1, blink ? 0.3 : 1), stc(st));
      if (near && !blink) bbAdd.add(lx, ly, lz, 0.35, 0.35, SPR.glow, hexCol(ST_COL[st] || '#888888', 0.5));
    }
    if (far) continue;
    if (t.glow) for (const g of t.glow) {
      const [gx, gy, gz] = loc(g);
      const a = busy ? 0.55 + 0.25 * Math.sin(real * 9 + e.id) : 0.12;
      bbAdd.add(gx, gy, gz, e.type === 'refinery' ? 0.9 : 1.1, e.type === 'refinery' ? 0.9 : 1.1, SPR.glow, ((Math.round(a * 255) << 24) | (GLOW_OR & 0xffffff)) >>> 0);
      if (e.type === 'refinery') { const f = busy ? 0.8 + 0.25 * Math.sin(real * 13) : 0.3; bbAdd.add(gx, gy, gz + 0.35 * f, 0.4 * f, 0.8 * f, SPR.flame); }
    }
    if (t.smoke && parts.length < 700) {
      const load = d.kind === 'gen' ? (e.avail > 0 && e.pnet ? e.pnet.load : 0) : busy ? 1 : 0;
      for (const s of t.smoke) if (Math.random() < (load > 0 ? 0.08 * Math.max(0.3, load) : 0.004)) {
        const [sx, sy, sz] = loc(s);
        spawn(sx, sy, { z: sz, vz: 1 + Math.random() * 0.4, vx: 0.3, vy: -0.1, life: 2.6, spr: 'glow', size: 0.5, col: e.type === 'foundry' || e.type === 'fuel_gen' || e.type === 'biomass_burner' ? SMOKE_D : SMOKE_L, grow: 1.1, vr: 0 });
      }
    }
    if (d.kind === 'miner' && busy && Math.random() < 0.04 && close) spawn(cx + (Math.random() - 0.5) * 1.2, cy + (Math.random() - 0.5) * 1.2, { z: 0.2, vz: 2, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 0.7, col: hexCol(ITEMS[e.node.res].c), size: 0.1, grav: 12 });
    if (close && d.kind === 'machine' && e.recipe) {
      const out = Object.keys(RECIPES[e.recipe].out)[0];
      bbs.add(cx, cy, zoff + t.height + 0.55 + Math.sin(real * 2 + e.id) * 0.05, 0.55, 0.55, SPR['i:' + out], rgba(1, 1, 1, 0.9));
    }
    if ((e.st === 'nopower' || e.st === 'lowpower') && Math.sin(real * 5) > -0.2) bbs.add(cx, cy, zoff + t.height + 0.3, 0.5, 0.5, SPR.bolt);
    if (close && d.kind === 'machine' && (e.st === 'starve' || e.st === 'idle') && Math.random() < 0.003) spawn(cx, cy, { z: zoff + t.height, vz: 0.4, vx: 0.15, life: 2.2, spr: 'zz', size: 0.35, vr: 0, rot: 0, col: rgba(1, 1, 1, 0.8) });
  }
  // items on belts
  // (far from the middle of the view they're simple coloured blocks: one draw call, no shadows)
  if (C.dist < 120) {
    const FR = VR * LOD.itemFar, farM = mdl('itemFar', () => ({ geo: new THREE.BoxGeometry(0.3, 0.14, 0.3).translate(0, 0.07, 0), mats: [] }));
    const farMat = itemFarMat || (itemFarMat = std('#ffffff', 0.8, 0.05));
    for (const b of G.L.belts) {
      if (!b.items.length || Math.abs(b.x - tgx) > VR || Math.abs(b.y - tgy) > VR || (b.z || 0) > view.level || b.type.startsWith('lift')) continue;
      const far = Math.abs(b.x - tgx) > FR || Math.abs(b.y - tgy) > FR;
      const bz = (b.z || 0) * LH;
      const p = b.pts;
      const isT = b.type === 'tunnel', ex = isT && b.pair ? G.ents.get(b.pair) : null;
      for (const it of b.items) {
        let x: number, y: number, ang: number;
        if (isT) {
          if (it.pos <= 0.3) { x = p[0] + (p[4] - p[0]) * it.pos; y = p[1] + (p[5] - p[1]) * it.pos; }
          else if (ex && it.pos >= b.len - 0.3) { const t = it.pos - (b.len - 1); x = ex.x + 0.5 + DX[b.rot] * (t - 0.5); y = ex.y + 0.5 + DY[b.rot] * (t - 0.5); }
          else continue;
          ang = b.rot * HP;
        } else {
          const t = it.pos > 1 ? 1 : it.pos, u = 1 - t;
          x = u * u * p[0] + 2 * u * t * p[2] + t * t * p[4]; y = u * u * p[1] + 2 * u * t * p[3] + t * t * p[5];
          const tx = 2 * u * (p[2] - p[0]) + 2 * t * (p[4] - p[2]), ty = 2 * u * (p[3] - p[1]) + 2 * t * (p[5] - p[3]);
          ang = Math.atan2(ty, tx);
        }
        if (far) { COL.set(ITEMS[it.it].c); DL.get('itemFar', farM.geo, farMat, false, true).push(compose(x, 0.23 + bz, y, -ang), COL); continue; }
        const im = MD.itemModel(it.it);
        DL.get('item:' + it.it, im.geo, im.mat, close).push(compose(x, 0.23 + bz, y, -ang));
      }
    }
  }
  // trains
  for (const tr of G.trains) {
    const pts = trainPoints(tr);
    for (let i = 0; i < tr.cars.length; i++) {
      const f = pts[2 * i], r = pts[2 * i + 1];
      if (!f || !r) continue;
      const x = (f[0] + r[0]) / 2, y = (f[1] + r[1]) / 2, a = Math.atan2(f[1] - r[1], f[0] - r[0]);
      const loco = tr.cars[i] === 'loco';
      pushModel(DL, loco ? 'loco' : 'wagon', mdl(loco ? 'loco' : 'wagon', loco ? MD.locoModel : MD.wagonModel), compose(x, 0.05, y, -a), undefined, true, tr.o);
      if (!loco && tr.tot > 0) {
        const k = Object.keys(tr.cargo)[0];
        if (k) { COL.set(ITEMS[k].c); DL.get('cargo', mdl('cargo', () => ({ geo: new THREE.BoxGeometry(1.6, 0.25, 0.55).translate(0, 0.9, 0), mats: [] })).geo, cargoMat || (cargoMat = std('#ffffff', 0.7, 0.1)), true, true).push(compose(x, 0.05, y, -a, 1, Math.min(1, tr.tot / (2000 * tr.cars.filter((c: string) => c === 'wagon').length) + 0.2), 1), COL); }
      }
    }
    if (close && pts[0]) labels.push({ x: pts[0][0], y: pts[0][1], z: 1.8, t: tr.name, c: '#ffd0c0' });
  }
  // red warning arrows: something is feeding a building at the wrong spot
  if (G.L.wrong && G.L.wrong.length && Math.sin(real * 6) > -0.3) {
    const wm = mdl('arrowBad', () => { const b = new B(); b.add(new THREE.ConeGeometry(0.22, 0.4, 3), M.red, 0, 0.03, 0, 0, 0, -HP); return b.build(); });
    for (const w of G.L.wrong) {
      if ((w.z || 0) > view.level || Math.abs(w.x - tgx) > VR || Math.abs(w.y - tgy) > VR) continue;
      pushModel(DL, 'arrowBad', wm, compose(w.x + 0.5 + DX[w.dir] * 0.5, (w.z || 0) * LH + 0.45, w.y + 0.5 + DY[w.dir] * 0.5, -w.dir * HP, 1.4, 1.4, 1.4), undefined, false);
      if (near) bbs.add(w.x + 0.5 + DX[w.dir] * 0.5, w.y + 0.5 + DY[w.dir] * 0.5, (w.z || 0) * LH + 1.1, 0.45, 0.45, SPR.bolt, hexCol('#ff5050'));
    }
  }
  // ships: bob gently on the water and leave a wake
  for (const sp of G.ships) {
    if (Math.abs(sp.x - tgx) > VR * 1.5 || Math.abs(sp.y - tgy) > VR * 1.5) continue;
    const bob = Math.sin(real * 1.3 + sp.id % 7) * 0.04;
    pushModel(DL, 'ship', mdl('ship', MD.shipModel), compose(sp.x, -0.32 + bob, sp.y, -sp.a), undefined, true, sp.o);
    if (sp.v > 0.5 && near && Math.random() < 0.3) spawn(sp.x - Math.cos(sp.a) * 1.4, sp.y - Math.sin(sp.a) * 1.4, { z: -0.1, vz: 0.2, life: 1.2, spr: 'glow', size: 0.35, col: rgba(0.9, 0.95, 1, 0.5), grow: 0.8, vr: 0 });
    if (close) labels.push({ x: sp.x, y: sp.y, z: 1.6, t: sp.name, c: '#bfe0ff' });
  }
  // rail signals: a post beside the track with a red or green lamp
  for (const r of sigRails) {
    if (!G.ents.has(r.id) || !r.sig || Math.abs(r.x - tgx) > VR || Math.abs(r.y - tgy) > VR) continue;
    const post = mdl('sigPost' + r.sig, () => MD.signalModel(r.sig === 2));
    pushModel(DL, 'sigPost' + r.sig, post, compose(r.x + 0.5, 0, r.y + 0.5, 0));
    const red = signalRed(r.y * W + r.x);
    COL.set(red ? '#ff3a2a' : '#3aff6a');
    DL.get('light', mdl('lightS', () => ({ geo: new THREE.SphereGeometry(0.07, 8, 6), mats: [] })).geo, lightMat, false, true).push(compose(r.x + 0.9, 1.05, r.y + 0.9, 0, 1.3, 1.3, 1.3), COL);
    if (near) bbAdd.add(r.x + 0.9, r.y + 0.9, 1.05, 0.5, 0.5, SPR.glow, hexCol(red ? '#ff3a2a' : '#3aff6a', 0.6));
  }
  // trucks
  for (const tk of G.trucks) {
    if (Math.abs(tk.x - tgx) > VR * 1.5 || Math.abs(tk.y - tgy) > VR * 1.5) continue;
    pushModel(DL, 'truck', mdl('truck', MD.truckModel), compose(tk.x, 0.02, tk.y, -tk.a), undefined, true, tk.o);
    if (close) labels.push({ x: tk.x, y: tk.y, z: 1.3, t: tk.name, c: '#ffe0b0' });
  }
  const night = nightness();
  // glowing crystals and crash-site beacons
  for (const f of visFeats) {
    const pulse = 0.5 + 0.3 * Math.sin(real * 3 + f.x);
    if (f.kind === 'crystal') bbAdd.add(f.x, f.y, 0.55, 1.6, 1.6, SPR.glow, hexCol(['#5ab4ff', '#ffd84a', '#c070ff'][f.tier], Math.min(1, pulse + night * 0.3)));
    else if (near) bbAdd.add(f.x + 0.1, f.y, 0.75, 0.6, 0.6, SPR.glow, hexCol('#5ab4ff', pulse));
  }
  // scanner pings: tall beams of light
  for (const pg of G.pings) {
    const left = pg.t - real, a = Math.min(1, left / 5) * (0.6 + 0.25 * Math.sin(real * 4));
    bbAdd.add(pg.x, pg.y, 12, 1.1, 24, SPR.glow, hexCol(pg.col, a));
    COL.set(pg.col);
    const rs = 1.5 + ((real * 1.5) % 1) * 2.5;
    DL.get('ring', ringGeo, ringMat, false, true).push(compose(pg.x, 0.2, pg.y, 0, rs, 1, rs), COL);
    labels.push({ x: pg.x, y: pg.y, z: 3, t: pg.label, c: pg.col });
  }
  // lights at night
  if (night > 0.05) {
    for (const e of animEnts) {
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      if (Math.abs(cx - tgx) > VR || Math.abs(cy - tgy) > VR) continue;
      const on = e.st === 'work' || BLD[e.type].kind === 'hub' || BLD[e.type].kind === 'station' || BLD[e.type].kind === 'tstation';
      const size = Math.max(e.w, e.h) * 1.1;
      bbAdd.add(cx, cy, (e.z || 0) * LH + TPL[e.type].height * 0.55, size, size, SPR.glow, hexCol('#ffc070', night * (on ? 0.32 : 0.12)));
    }
    for (const e of lampEnts) {
      if (Math.abs(e.x - tgx) > VR || Math.abs(e.y - tgy) > VR) continue;
      const lz = (e.z || 0) * LH;
      bbAdd.add(e.x + 0.6, e.y + 0.5, lz + 1.6, 1.4, 1.4, SPR.glow, hexCol('#fff2c0', night * 0.9));
      bbAdd.add(e.x + 0.5, e.y + 0.5, lz + 0.15, 7, 7, SPR.glow, hexCol('#ffe6a0', night * 0.45));
    }
    for (const sp of G.ships) bbAdd.add(sp.x - Math.cos(sp.a) * 1.0, sp.y - Math.sin(sp.a) * 1.0, 1.2, 1.2, 1.2, SPR.glow, hexCol('#fff0c0', night * 0.7));
    for (const tk of G.trucks) if (tk.v > 0.1) bbAdd.add(tk.x + Math.cos(tk.a) * 0.9, tk.y + Math.sin(tk.a) * 0.9, 0.35, 1.4, 1.4, SPR.glow, hexCol('#fff0c0', night * 0.7));
    for (const tr of G.trains) { const p0 = trainPoints(tr)[0]; if (p0) bbAdd.add(p0[0], p0[1], 0.6, 1.8, 1.8, SPR.glow, hexCol('#fff0c0', night * 0.8)); }
  }
  // drones
  for (const p of G.L.drones) {
    const pos = dronePos(p);
    const [x, y, a, alt] = pos || [p.x + 1.5, p.y + 1.5, 0, 0];
    pushModel(DL, 'drone', mdl('drone', MD.droneModel), compose(x, pos ? 1.2 + alt * 4 : 0.5, y, -a), undefined, true, p.o);
    if (p.name && near) labels.push({ x: p.x + 1.5, y: p.y + 1.5, z: 2.2, t: p.name, c: '#a8d8ff' });
  }
  for (const s of G.L.stations) if (near) labels.push({ x: s.x + 1.5, y: s.y + 1.5, z: 2.9, t: s.name + (s.mode === 'load' ? ' ⬆' : ' ⬇'), c: '#ffe08a' });
  for (const s of G.L.outposts || []) labels.push({ x: s.x + 1.5, y: s.y + 1.5, z: 3.9, t: '⛺ ' + (MP.teams && s.o && s.o !== MP.myTeam ? teamLabel(s.o) : s.name), c: MP.teams && s.o ? MP.info.get(s.o)?.col || '#ffc070' : '#ffc070' });
  for (const s of G.L.ports || []) if (near) labels.push({ x: s.x + 1.5, y: s.y + 1.5, z: 2.9, t: '⚓ ' + s.name + (s.mode === 'load' ? ' ⬆' : ' ⬇'), c: '#a8d0ff' });
  for (const s of G.L.tstations) if (near) labels.push({ x: s.x + 1.5, y: s.y + 1.5, z: 2.6, t: s.name + (s.mode === 'load' ? ' ⬆' : ' ⬇'), c: '#ffd0a0' });
  if (G.L.elevator) { const e = G.L.elevator; labels.push({ x: e.x + 2.5, y: e.y + 2.5, z: 13.5, t: 'SPACE ELEVATOR', c: '#e0d4ff' }); }
  if (G.L.hub) { const e = G.L.hub; if (near) labels.push({ x: e.x + 2, y: e.y + 2, z: 4.3, t: 'HUB', c: '#ffd08a' }); }
  // online: every player's name floats above their HUB (and outposts), in their colour
  if (MP.teams) for (const h of G.L.hubs) {
    const inf = MP.info.get(h.o || 0);
    if (!inf || !h.o || Math.abs(h.x - tgx) > VR * 3 || Math.abs(h.y - tgy) > VR * 3) continue;
    const who = teamLabel(h.o);
    labels.push({ x: h.x + 2, y: h.y + 2, z: 6.2, t: who, c: inf.col });
  }
  // purity markers on nodes
  if (close) for (const n of G.nodes) {
    if (Math.abs(n.x - tgx) > VR || Math.abs(n.y - tgy) > VR || G.grid[n.y * W + n.x]) continue;
    for (let i = 0; i <= n.p; i++) bbs.add(n.x + 1 + (i - n.p / 2) * 0.3, n.y + 1, 1.0, 0.16, 0.16, SPR.circle, n.p === 2 ? hexCol('#ffd24a') : 0xffffffff);
  }
  // power pole reach preview: rings show where a new pole can connect, lines show what it will link to
  const pp = view.powerPreview;
  const pts: number[] = [];
  ZO = view.level * LH;
  if (pp) {
    const rb = DL.get('ring', ringGeo, ringMat, false, true);
    for (const p of G.L.poles) {
      const px = p.x + p.w / 2, py = p.y + p.h / 2, d = Math.hypot(px - pp.x, py - pp.y);
      const r = Math.min(pp.reach, poleReachT(p.type));
      if (d > r * 2.5 + 10) continue;
      COL.set(d <= r ? '#7dffa0' : '#ffd24a');
      rb.push(compose(px, 0.1, py, 0, r, 1, r), COL);
    }
    COL.set(pp.ok ? '#7dffa0' : '#ff6060');
    rb.push(compose(pp.x, 0.12, pp.y, 0, pp.reach, 1, pp.reach), COL);
    for (const [qx, qy, qz] of pp.links) pts.push(pp.x, 1.8, pp.y, qx, qz, qy);
  }
  prevWires.geometry.dispose();
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); prevWires.geometry = pg;
  ZO = 0;
  // tutorial marker
  const mk = view.marker;
  if (mk) {
    const b = Math.abs(Math.sin(real * 3)) * 0.35;
    bbs.add(mk.x, mk.y, mk.z + 0.7 + b, 0.9, 0.9, SPR.pin, hexCol('#ffa030'));
    COL.set('#ffa030');
    const rs = 1.1 + 0.25 * Math.sin(real * 4);
    DL.get('ring', ringGeo, ringMat, false, true).push(compose(mk.x, 0.15, mk.y, 0, rs, 1, rs), COL);
  }
  // the selected / hovered building shows where things go in and out, even under belts
  for (const se of [view.inspect, view.hover]) if (se && G.ents.has(se.id)) { ZO = (se.z || 0) * LH; pushPortArrows(DL, se, 'sel', true); }
  // power areas
  ZO = view.level * LH;
  if (view.showPower) for (const p of G.L.poles) {
    const a = BLD[p.type].area;
    DL.get('area', mdl('areaP', () => ({ geo: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mats: [] })).geo, areaMat, false).push(compose(p.x + p.w / 2, 0.05, p.y + p.h / 2, 0, p.w + a * 2, 1, p.h + a * 2));
  }
  ZO = 0;
  DL.end();
  // particles
  for (const p of parts) {
    const a = Math.min(1, p.life / p.max * 1.5);
    const alpha = ((p.col >>> 24) / 255) * a;
    const cl = ((Math.round(alpha * 255) << 24) | (p.col & 0xffffff)) >>> 0;
    const sq = p.spr === 'white';
    bbs.add(p.x, p.y, p.z, p.size, sq ? p.size * 0.6 : p.size, SPR[p.spr] || SPR.white, cl, sq ? p.rot : 0);
  }
  bbs.end(); bbAdd.end();
  // belt texture scrolling
  for (const k in beltMats) { const sp = k === 'gold' ? 4 : BLD[k].speed!; beltMats[k].map!.offset.x = -((time * sp) % 1); }
  updateGhosts(real);
  updateSelection();
}

// ---------------------------------------------------------------------------
function updateGhosts(real: number) {
  GL.begin();
  ZO = view.level * LH;
  for (const gh of view.ghosts) {
    const d = BLD[gh.type];
    if (!d) continue;
    const mat = gh.ok !== false ? ghostOK : ghostBad, pre = gh.ok !== false ? 'gok:' : 'gbad:';
    if (d.kind === 'train') {
      const cells = gh.cells || [];
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const a = cells[i], b = cells[i + 1];
        const ax = a % W + 0.5, ay = Math.floor(a / W) + 0.5, bx = b % W + 0.5, by = Math.floor(b / W) + 0.5;
        pushModel(GL, pre + (i ? 'wagon' : 'loco'), mdl(i ? 'wagon' : 'loco', i ? MD.wagonModel : MD.locoModel), compose((ax + bx) / 2, 0.05, (ay + by) / 2, -Math.atan2(ay - by, ax - bx)), mat, false);
      }
      continue;
    }
    if (d.kind === 'lift') { ZO = (view.level + Math.min(0, d.dz!)) * LH; pushModel(GL, pre + 'lift' + d.dz, mdl('lift' + d.dz, () => MD.liftModel(d.dz! > 0)), compose(gh.x + 0.5, 0, gh.y + 0.5, -gh.rot * HP), mat, false); ZO = view.level * LH; continue; }
    if (gh.type === 'pipe_lift') { pushModel(GL, pre + 'pipeLift', mdl('pipeLift', MD.pipeLiftModel), compose(gh.x + 0.5, 0, gh.y + 0.5, 0), mat, false); continue; }
    if (d.kind === 'belt' || d.kind === 'tunnel') { pushBelt(GL, { ...gh, curve: -1, isExit: gh.isExit } as any, mat, pre); continue; }
    if (d.kind === 'rail') { pushRail(GL, gh.x, gh.y, gh.pairs || 1, mat, pre); continue; }
    if (d.kind === 'signal') { pushModel(GL, pre + 'sigPost' + d.sig, mdl('sigPost' + d.sig, () => MD.signalModel(d.sig === 2)), compose(gh.x + 0.5, 0, gh.y + 0.5, 0), mat, false); continue; }
    if (d.kind === 'pipe') { pushModel(GL, pre + 'pipeHub', mdl('pipeHub', MD.pipeHub), compose(gh.x + 0.5, 0, gh.y + 0.5, 0), mat, false); pushModel(GL, pre + 'pipeArm', mdl('pipeArm', MD.pipeArm), compose(gh.x + 0.5, 0, gh.y + 0.5, 0), mat, false); pushModel(GL, pre + 'pipeArm', mdl('pipeArm', MD.pipeArm), compose(gh.x + 0.5, 0, gh.y + 0.5, Math.PI), mat, false); continue; }
    if (d.kind === 'ptunnel') { pushModel(GL, pre + 'ptun', mdl('ptun', MD.ptunnelModel), compose(gh.x + 0.5, 0, gh.y + 0.5, -(gh.isExit ? gh.rot + 2 : gh.rot) * HP), mat, false); continue; }
    const t = TPL[gh.type];
    if (!t) continue;
    const [w, h] = gh.rot & 1 ? [d.h, d.w] : [d.w, d.h];
    pushTemplate(GL, pre + 'T:' + gh.type, t, compose(gh.x + w / 2, 0, gh.y + h / 2, d.noRotate ? 0 : -gh.rot * HP), mat);
    if (d.kind === 'pole' || d.kind === 'hub') GL.get('garea', mdl('areaP', () => ({ geo: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mats: [] })).geo, areaMat, false).push(compose(gh.x + w / 2, 0.06, gh.y + h / 2, 0, w + d.area! * 2, 1, h + d.area! * 2));
    pushPortArrows(GL, { type: gh.type, x: gh.x, y: gh.y, w, h, rot: gh.rot } as any, 'g');
  }
  ZO = 0;
  GL.end();
  void real;
}
function updateSelection() {
  const s = view.sel;
  if (s) {
    const xa = Math.min(s.x0, s.x1), ya = Math.min(s.y0, s.y1), xb = Math.max(s.x0, s.x1) + 1, yb = Math.max(s.y0, s.y1) + 1;
    selPlane.visible = true; selPlane.position.set((xa + xb) / 2, view.level * LH + 0.07, (ya + yb) / 2); selPlane.scale.set(xb - xa, 1, yb - ya);
    const m = selPlane.material as THREE.MeshBasicMaterial;
    m.color.setRGB((s.col & 255) / 255, ((s.col >>> 8) & 255) / 255, ((s.col >>> 16) & 255) / 255);
    m.opacity = Math.max(0.15, (s.col >>> 24) / 255 * 1.6);
  } else selPlane.visible = false;
  const box = (b: THREE.LineSegments, e: Ent | null) => {
    if (!e || !G.ents.has(e.id)) { b.visible = false; return; }
    const bz = e.z2 !== undefined ? Math.min(e.z || 0, e.z2) : (e.z || 0);
    b.visible = true; b.position.set(e.x + e.w / 2, bz * LH, e.y + e.h / 2); b.scale.set(e.w + 0.06, visHeight(e) + 0.05, e.h + 0.06);
  };
  box(hoverBox, view.hover && view.hover !== view.inspect ? view.hover : null);
  box(inspBox, view.inspect);
}

// ---------------------------------------------------------------------------
/** entity under the mouse, accounting for building heights (ray march) */
export function pickAt(wx: number, wy: number): Ent | null {
  const r = screenRay(view.mouse.sx, view.mouse.sy);
  const o = r.origin, d = r.direction;
  const lv = view.level;
  if (d.y < -1e-4) {
    // march down from above the active floor; decks hide whatever is underneath them
    for (let h = lv * LH + 13; h >= 0; h -= 0.1) {
      const t = (h - o.y) / d.y;
      if (t < 0) continue;
      const x = o.x + d.x * t, y = o.z + d.z * t, fx = Math.floor(x), fy = Math.floor(y);
      const zl = Math.min(lv, Math.floor(h / LH));
      if (h < lv * LH - 0.3 && lv > 0 && fx >= 0 && fy >= 0 && fx < W && fy < H && (G.floor[fy * W + fx] & (1 << lv))) break;
      const e = entAt(fx, fy, zl);
      if (e) { const bz = e.z2 !== undefined ? Math.min(e.z || 0, e.z2) : (e.z || 0); if (visHeight(e) >= h - bz * LH - 0.05) return e; }
    }
  }
  return entAt(Math.floor(wx), Math.floor(wy), lv);
}

// ---------------------------------------------------------------------------
// 3D building icons for the UI
let iconR: THREE.WebGLRenderer | null = null, iconScene: THREE.Scene, iconCam: THREE.PerspectiveCamera;
const iconCache: Record<string, string> = Object.create(null);
export function icon3D(type: string): string | null {
  if (iconCache[type]) return iconCache[type];
  const d = BLD[type];
  let model: Model | null = null;
  if (TPL[type]) model = TPL[type].stat;
  else if (d.kind === 'foundation') model = mdl('deck', MD.deckModel);
  else if (d.kind === 'signal') model = mdl('sigPost' + d.sig, () => MD.signalModel(d.sig === 2));
  else if (d.kind === 'lift') model = mdl('lift' + d.dz, () => MD.liftModel(d.dz! > 0));
  else if (type === 'pipe_lift') model = mdl('pipeLift', MD.pipeLiftModel);
  else if (d.kind === 'belt') model = mdl('beltFS', MD.beltFrameStraight);
  else if (d.kind === 'tunnel') model = mdl('tunIn', () => MD.tunnelModel(false));
  else if (d.kind === 'rail') model = mdl('railS', MD.railStraight);
  else if (d.kind === 'pipe') model = mdl('pipeArm', MD.pipeArm);
  else if (d.kind === 'ptunnel') model = mdl('ptun', MD.ptunnelModel);
  else if (d.kind === 'train') model = mdl('loco', MD.locoModel);
  if (!model) return null;
  if (!iconR) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    iconR = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
    iconR.outputColorSpace = THREE.SRGBColorSpace; iconR.toneMapping = THREE.ACESFilmicToneMapping;
    iconScene = new THREE.Scene();
    iconScene.environment = C.scene.environment; iconScene.environmentIntensity = 0.7;
    iconScene.add(new THREE.HemisphereLight('#dfefff', '#554a40', 1.3));
    const s = new THREE.DirectionalLight('#fff1dc', 2.8); s.position.set(-3, 6, -2); iconScene.add(s);
    iconCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  }
  const mesh = new THREE.Mesh(model.geo, model.mats.length ? model.mats : [std('#888888')]);
  if (d.kind === 'belt') { const s = new THREE.Mesh(surfS().geo, beltMats[type in beltMats ? type : 'belt1']); mesh.add(s); }
  iconScene.add(mesh);
  const bb = model.geo.boundingBox || (model.geo.computeBoundingBox(), model.geo.boundingBox!);
  const sph = new THREE.Sphere(); bb.getBoundingSphere(sph);
  const dist = sph.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.05;
  iconCam.position.set(sph.center.x + dist * 0.55, sph.center.y + dist * 0.62, sph.center.z + dist * 0.55);
  iconCam.lookAt(sph.center);
  iconR.render(iconScene, iconCam);
  const url = iconR.domElement.toDataURL();
  iconScene.remove(mesh);
  return iconCache[type] = url;
}
