// Instanced camera-facing sprites (particles, icons, status markers) using the 2D sprite atlas.
import * as THREE from 'three';
import { atlasCanvas } from '../atlas';
import { Sprite } from '../gl';

export class Billboards {
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  max: number; n = 0;
  pos: Float32Array; size: Float32Array; uv: Float32Array; col: Float32Array; rot: Float32Array;
  aPos: THREE.InstancedBufferAttribute; aSize: THREE.InstancedBufferAttribute; aUV: THREE.InstancedBufferAttribute; aCol: THREE.InstancedBufferAttribute; aRot: THREE.InstancedBufferAttribute;
  constructor(scene: THREE.Scene, max = 6000, additive = false) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index; g.setAttribute('position', base.attributes.position);
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max * 2); this.uv = new Float32Array(max * 4); this.col = new Float32Array(max * 4); this.rot = new Float32Array(max);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(this.size, 2).setUsage(THREE.DynamicDrawUsage);
    this.aUV = new THREE.InstancedBufferAttribute(this.uv, 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iSize', this.aSize); g.setAttribute('iUV', this.aUV); g.setAttribute('iCol', this.aCol); g.setAttribute('iRot', this.aRot);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlasTex() } },
      transparent: true, depthWrite: false, depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iUV; attribute vec4 iCol; attribute float iRot;
        varying vec2 vUv; varying vec4 vCol;
        void main(){
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          float c = cos(iRot), s = sin(iRot);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSize;
          mv.xy += p;
          gl_Position = projectionMatrix * mv;
          vUv = vec2(mix(iUV.x, iUV.z, position.x + 0.5), mix(iUV.w, iUV.y, position.y + 0.5));
          vCol = iCol;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
        void main(){
          vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * vCol.rgb, t.a * vCol.a); if (gl_FragColor.a < 0.01) discard;
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  /** world position (x,y = tile coords, z = height); w,h in world units; col = 0xAABBGGRR */
  add(x: number, y: number, z: number, w: number, h: number, s: Sprite, col = 0xffffffff, rot = 0) {
    if (this.n >= this.max || !s) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = z; this.pos[i * 3 + 2] = y;
    this.size[i * 2] = w; this.size[i * 2 + 1] = h;
    this.uv[i * 4] = s.u0; this.uv[i * 4 + 1] = s.v0; this.uv[i * 4 + 2] = s.u1; this.uv[i * 4 + 3] = s.v1;
    this.col[i * 4] = (col & 255) / 255; this.col[i * 4 + 1] = ((col >>> 8) & 255) / 255; this.col[i * 4 + 2] = ((col >>> 16) & 255) / 255; this.col[i * 4 + 3] = (col >>> 24) / 255;
    this.rot[i] = rot;
  }
  end() {
    this.geo.instanceCount = this.n;
    for (const a of [this.aPos, this.aSize, this.aUV, this.aCol, this.aRot]) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); }
  }
}
let _tex: THREE.CanvasTexture | null = null;
export function atlasTex() {
  if (_tex) return _tex;
  _tex = new THREE.CanvasTexture(atlasCanvas);
  _tex.flipY = false;
  _tex.colorSpace = THREE.SRGBColorSpace;
  _tex.minFilter = THREE.LinearMipmapLinearFilter;
  _tex.anisotropy = 4;
  return _tex;
}
