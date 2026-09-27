// Three.js core: renderer, scene, camera rig, lights, sky environment, projection helpers.
// World tile (x, y) at height z maps to three.js (x, z, y).
import * as THREE from 'three';
import { clamp } from '../util';
import { proj, view } from '../view';
import { cycleOn, dayPhase, daylight, sunElev } from '../daynight';

export const C = {
  renderer: null as THREE.WebGLRenderer,
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(34, 1, 0.5, 4000),
  sun: new THREE.DirectionalLight('#fff1dc', 2.7),
  hemi: new THREE.HemisphereLight('#c6dcf2', '#4a4238', 0.85),
  yaw: Math.PI / 4,       // camera sits south-east of the target by default
  pitch: 0.98,            // ~56 degrees down
  dist: 40,
  focusY: 0,              // camera target height (rises with the active floor)
};
export const zoomToDist = (s: number) => 1000 / s;
/** direction from the ground toward the sun (or moon) */
export const sunDir = new THREE.Vector3(-0.9, 1.6, -0.6);

// --- day / night lighting
const DAY = { sky: new THREE.Color('#a9c4d6'), sun: new THREE.Color('#fff1dc'), hs: new THREE.Color('#c6dcf2'), hg: new THREE.Color('#4a4238') };
const DUSK = { sky: new THREE.Color('#d9a489'), sun: new THREE.Color('#ffa860') };
const NIGHT = { sky: new THREE.Color('#141c30'), sun: new THREE.Color('#8fa8e8'), hs: new THREE.Color('#34467a'), hg: new THREE.Color('#1a1822') };
const tc = new THREE.Color();
export function applyDayNight() {
  const sc = C.scene, fog = sc.fog as THREE.Fog, bg = sc.background as THREE.Color;
  if (!cycleOn()) {
    sunDir.set(-0.9, 1.6, -0.6);
    C.sun.color.copy(DAY.sun); C.sun.intensity = 2.7;
    C.hemi.color.copy(DAY.hs); C.hemi.groundColor.copy(DAY.hg); C.hemi.intensity = 0.85;
    bg.copy(DAY.sky); fog.color.copy(DAY.sky); sc.environmentIntensity = 0.55; C.renderer.toneMappingExposure = 0.95;
    return;
  }
  const p = dayPhase(), el = sunElev(p), L = daylight();
  const dusk = Math.max(0, 1 - Math.abs(el) / 0.32) * (el > -0.2 ? 1 : 0);   // warm tint near sunrise / sunset
  // the sun arcs east -> west by day; the moon takes over at night
  const th = (p - 0.25) * Math.PI * 2;
  const up = el >= 0 ? el : -el;
  const sx = el >= 0 ? Math.cos(th) : -Math.cos(th);
  sunDir.set(sx * 1.2, 0.25 + up * 1.7, -0.55);
  // sun / moon light
  tc.copy(NIGHT.sun).lerp(DAY.sun, L); tc.lerp(DUSK.sun, dusk * 0.7);
  C.sun.color.copy(tc);
  C.sun.intensity = 0.7 + L * 2.0;
  C.hemi.color.copy(NIGHT.hs).lerp(DAY.hs, L);
  C.hemi.groundColor.copy(NIGHT.hg).lerp(DAY.hg, L);
  C.hemi.intensity = 0.7 + L * 0.15;
  tc.copy(NIGHT.sky).lerp(DAY.sky, L); tc.lerp(DUSK.sky, dusk * 0.55);
  bg.copy(tc); fog.color.copy(tc);
  sc.environmentIntensity = 0.2 + L * 0.35;
  C.renderer.toneMappingExposure = 0.95 + (1 - L) * 0.2;
}

export function initCore(canvas: HTMLCanvasElement) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 0.95;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  C.renderer = r;
  const sc = C.scene;
  const sky = new THREE.Color('#a9c4d6');
  sc.background = sky;
  sc.fog = new THREE.Fog(sky, 200, 800);
  sc.add(C.hemi);
  C.sun.castShadow = true;
  C.sun.shadow.mapSize.set(2048, 2048);
  C.sun.shadow.bias = -0.0004;
  C.sun.shadow.normalBias = 0.03;
  sc.add(C.sun); sc.add(C.sun.target);
  // image-based lighting from a simple procedural sky (gives metals and water their reflections)
  const pm = new THREE.PMREMGenerator(r);
  const envScene = new THREE.Scene();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){
      float h = vP.y;
      vec3 top = vec3(0.35,0.55,0.85), hor = vec3(0.85,0.88,0.9), gnd = vec3(0.32,0.3,0.26);
      vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.6)) : mix(hor, gnd, pow(-h, 0.4));
      vec3 sd = normalize(vec3(0.5, 0.75, 0.35));
      c += vec3(6.0, 5.4, 4.6) * pow(max(dot(vP, sd), 0.0), 300.0);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat));
  sc.environment = pm.fromScene(envScene, 0.02).texture;
  sc.environmentIntensity = 0.55;
  // projection hooks used by the rest of the game (view.ts)
  proj.s2w = screenToGround;
  proj.w2s = worldToScreen;
  proj.sd2w = screenDeltaToWorld;
}

export function resizeCore(w: number, h: number, dpr: number) {
  C.renderer.setPixelRatio(dpr);
  C.renderer.setSize(w, h, false);
  C.camera.aspect = w / h;
  C.camera.updateProjectionMatrix();
}

const tmpV = new THREE.Vector3();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
export function updateCamera() {
  const c = view.cam;
  C.dist = zoomToDist(c.s);
  const cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
  const tx = c.x, tz = c.y;
  const want = view.level * 4;
  C.focusY += (want - C.focusY) * 0.18; if (Math.abs(want - C.focusY) < 0.01) C.focusY = want;
  const fy = C.focusY;
  plane.constant = -fy;
  C.camera.position.set(tx + Math.cos(C.yaw) * cp * C.dist, sp * C.dist + fy, tz + Math.sin(C.yaw) * cp * C.dist);
  C.camera.lookAt(tx, fy, tz);
  C.camera.near = Math.max(0.3, C.dist * 0.05);
  C.camera.far = C.dist * 4 + 400;
  C.camera.updateProjectionMatrix();
  C.camera.updateMatrixWorld();
  const fog = C.scene.fog as THREE.Fog;
  fog.near = C.dist * 1.6 + 30; fog.far = C.dist * 4.5 + 250;
  // sun follows the view so shadows stay sharp where we look
  const span = clamp(C.dist * 0.9, 12, 160);
  const sh = C.sun.shadow.camera as THREE.OrthographicCamera;
  sh.left = -span; sh.right = span; sh.top = span; sh.bottom = -span; sh.near = 1; sh.far = span * 4 + 100;
  sh.updateProjectionMatrix();
  const sl = span / Math.max(0.5, sunDir.y / 1.6);
  C.sun.position.set(tx + sunDir.x * sl, sunDir.y * sl + 20 + fy, tz + sunDir.z * sl);
  sh.far = sl * 3 + 200; sh.updateProjectionMatrix();
  C.sun.target.position.set(tx, fy, tz);
  C.sun.shadow.needsUpdate = true;
  C.renderer.shadowMap.enabled = C.dist < 260;
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
export function screenRay(sx: number, sy: number) {
  ndc.set(sx / view.cw * 2 - 1, -(sy / view.ch) * 2 + 1);
  ray.setFromCamera(ndc, C.camera);
  return ray.ray;
}
export function screenToGround(sx: number, sy: number): [number, number] {
  const r = screenRay(sx, sy);
  const hit = r.intersectPlane(plane, tmpV);
  if (!hit) { const d = r.direction; return [view.cam.x + d.x * 2000, view.cam.y + d.z * 2000]; }
  return [hit.x, hit.z];
}
export function worldToScreen(x: number, y: number, z = 0): [number, number] {
  tmpV.set(x, z, y).project(C.camera);
  return [(tmpV.x + 1) / 2 * view.cw, (1 - tmpV.y) / 2 * view.ch];
}
export function screenDeltaToWorld(dx: number, dy: number): [number, number] {
  const k = 2 * C.dist * Math.tan(THREE.MathUtils.degToRad(C.camera.fov / 2)) / Math.max(1, view.ch);
  const rx = Math.sin(C.yaw), ry = -Math.cos(C.yaw);          // screen-right on the ground
  const fx = Math.cos(C.yaw), fy = Math.sin(C.yaw);           // screen-down on the ground (toward camera)
  const sp = Math.sin(C.pitch);
  return [(dx * rx + dy * fx / sp) * k, (dx * ry + dy * fy / sp) * k];
}
export function rotateCamera(d: number) { C.yaw += d; }
/** tilt between a low, dramatic angle and nearly top-down */
export function tiltCamera(d: number) { C.pitch = Math.max(0.5, Math.min(1.45, C.pitch + d)); }
