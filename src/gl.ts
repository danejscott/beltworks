// Minimal WebGL2 renderer: instanced textured quads from one atlas + a procedural terrain shader.
import { H, W } from './terrain';

export interface Sprite { u0: number; v0: number; u1: number; v1: number; w: number; h: number }

const SPRITE_VS = `#version 300 es
layout(location=0) in vec2 a_c;
layout(location=1) in vec2 i_o;
layout(location=2) in vec4 i_ab;
layout(location=3) in vec4 i_uv;
layout(location=4) in vec4 i_col;
uniform vec2 u_view;
out vec2 v_uv; out vec4 v_col;
void main(){
  vec2 p = i_o + a_c.x * i_ab.xy + a_c.y * i_ab.zw;
  gl_Position = vec4(p.x * 2.0 / u_view.x - 1.0, 1.0 - p.y * 2.0 / u_view.y, 0.0, 1.0);
  v_uv = mix(i_uv.xy, i_uv.zw, a_c + 0.5);
  v_col = i_col;
}`;
const SPRITE_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
in vec2 v_uv; in vec4 v_col;
out vec4 o;
void main(){ vec4 t = texture(u_tex, v_uv); o = t * vec4(v_col.rgb * v_col.a, v_col.a); }`;

const TERRAIN_VS = `#version 300 es
layout(location=0) in vec2 a_c;
out vec2 v_ndc;
void main(){ v_ndc = a_c * 2.0; gl_Position = vec4(a_c * 2.0, 0.0, 1.0); }`;
const TERRAIN_FS = `#version 300 es
precision highp float;
uniform highp usampler2D u_tiles;
uniform vec2 u_cam; uniform float u_scale; uniform vec2 u_view; uniform float u_time; uniform vec2 u_size; uniform float u_tilt;
in vec2 v_ndc; out vec4 o;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm3(vec2 p){ return vn(p)*0.5 + vn(p*2.1)*0.3 + vn(p*4.3)*0.2; }
vec3 baseCol(uint t, vec2 w){
  float n = fbm3(w*0.18);          // large patches
  float m = vn(w*0.9);             // medium variation
  if(t==0u) return mix(mix(vec3(0.30,0.42,0.19), vec3(0.38,0.49,0.22), n), vec3(0.42,0.47,0.24), m*0.35);
  if(t==1u) return mix(mix(vec3(0.22,0.35,0.16), vec3(0.29,0.42,0.19), n), vec3(0.25,0.33,0.17), m*0.3);
  if(t==2u) return mix(vec3(0.66,0.60,0.45), vec3(0.74,0.67,0.50), n*0.7 + m*0.3);
  if(t==3u) return mix(vec3(0.40,0.33,0.24), vec3(0.48,0.39,0.28), n*0.6 + m*0.4);
  if(t==4u) return mix(vec3(0.18,0.38,0.44), vec3(0.22,0.43,0.48), n);
  if(t==5u) return mix(vec3(0.09,0.23,0.33), vec3(0.12,0.28,0.38), n);
  return mix(vec3(0.44,0.43,0.41), vec3(0.52,0.51,0.48), vn(w*0.9));
}
uvec4 tileAt(ivec2 p){ p = clamp(p, ivec2(0), ivec2(u_size)-1); return texelFetch(u_tiles, p, 0); }
void main(){
  vec2 px = vec2(v_ndc.x * u_view.x * 0.5, -v_ndc.y * u_view.y * 0.5);
  float ia = px.x / u_scale, ib = px.y / (u_scale * u_tilt);
  vec2 w = vec2((ia + ib) * 0.5, (ib - ia) * 0.5) + u_cam;
  if (w.x < 0.0 || w.y < 0.0 || w.x >= u_size.x || w.y >= u_size.y) {
    float n = vn(w * 0.3 + vec2(u_time * 0.2, 0.0));
    o = vec4(vec3(0.08, 0.22, 0.32) + n * 0.03, 1.0); return;
  }
  ivec2 ti = ivec2(floor(w));
  uvec4 t = tileAt(ti);
  vec3 c = baseCol(t.r, w);
  vec2 f = fract(w);
  float detail = smoothstep(10.0, 34.0, u_scale);
  bool water = t.r == 4u || t.r == 5u;
  float shore = 0.0;
  vec2 wf = f + (vec2(vn(w*3.1), vn(w*3.1+17.0)) - 0.5) * 0.35;
  for (int k = 0; k < 4; k++) {
    ivec2 d = k==0?ivec2(1,0):k==1?ivec2(-1,0):k==2?ivec2(0,1):ivec2(0,-1);
    uvec4 nt = tileAt(ti + d);
    if (nt.r != t.r) {
      bool wb = nt.r == 4u || nt.r == 5u;
      bool hard = water != wb || t.r == 6u || nt.r == 6u;
      vec2 ff = hard ? f : wf;
      float e = k==0?1.0-ff.x:k==1?ff.x:k==2?1.0-ff.y:ff.y;
      float bw = hard ? 0.2 : 0.6;
      float a = (1.0 - smoothstep(0.0, bw, e)) * 0.5;
      if (hard) a *= 0.3;
      c = mix(c, baseCol(nt.r, w), a);
      if (water && !wb) shore = max(shore, 1.0 - smoothstep(0.0, 0.35, e));
    }
  }
  // grass texture + wind
  if (t.r <= 1u) {
    float blades = vn(w*vec2(9.0, 23.0)) * 0.5 + vn(w*vec2(21.0, 7.0)) * 0.5;
    c *= 1.0 + (blades - 0.5) * 0.22 * detail;
    float wind = sin(u_time*1.3 + dot(w, vec2(0.35, 0.22)) + vn(w*0.15)*5.0);
    c *= 1.0 + wind * 0.025;
    float spots = smoothstep(0.78, 0.9, vn(w*2.3 + 40.0));
    c = mix(c, c * vec3(1.12, 1.08, 0.8), spots * 0.4);
  } else if (t.r == 2u || t.r == 3u) {
    c *= 1.0 + (vn(w*14.0) - 0.5) * 0.12 * detail;
  }
  if (water) {
    float ca = vn(w*1.3 + vec2(u_time*0.35, u_time*0.2)) * vn(w*2.1 - vec2(u_time*0.25, 0.0));
    c += vec3(0.06,0.08,0.08) * smoothstep(0.3, 0.6, ca);
    float glint = smoothstep(0.82, 0.95, vn(w*3.0 + vec2(u_time*0.6, -u_time*0.4)));
    c += vec3(0.25) * glint * detail;
    float foam = shore * (0.55 + 0.45 * sin(u_time*2.0 + (w.x + w.y) * 3.0 + vn(w*2.0)*4.0));
    c = mix(c, vec3(0.85, 0.9, 0.9), foam * 0.55);
  }
  if (t.g > 0u) {
    float far = 1.0 - smoothstep(5.0, 9.0, u_scale);
    c = mix(c, vec3(0.12,0.26,0.12) + vn(w*2.0)*0.05, 0.8*far);
  }
  // drifting cloud shadows
  float cl = vn(w*0.035 + u_time*vec2(0.012, 0.007)) * 0.65 + vn(w*0.09 + u_time*vec2(0.02, 0.01)) * 0.35;
  c *= 1.0 - smoothstep(0.58, 0.75, cl) * 0.2;
  if (u_scale > 14.0 && t.r < 4u) {
    vec2 g = abs(f - 0.5);
    float line = smoothstep(0.5 - 1.5/u_scale, 0.5, max(g.x, g.y));
    c *= 1.0 - line * 0.05 * smoothstep(14.0, 26.0, u_scale);
  }
  o = vec4(c, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  return p;
}

const STRIDE = 11; // floats per instance: o(2) A(2) B(2) uv(4) col(1)
const MAXI = 32768;

export class Renderer {
  gl: WebGL2RenderingContext;
  sp: WebGLProgram; tp: WebGLProgram;
  vao: WebGLVertexArrayObject; tvao: WebGLVertexArrayObject;
  ibuf: WebGLBuffer;
  data = new ArrayBuffer(MAXI * STRIDE * 4);
  f32 = new Float32Array(this.data);
  u32 = new Uint32Array(this.data);
  n = 0;
  atlas: WebGLTexture; tiles: WebGLTexture;
  tileData: Uint8Array;
  cam = { x: 0, y: 0, s: 32 }; vw = 1; vh = 1; tilt = 0.64;
  uS: any = {}; uT: any = {};
  drawCalls = 0; quads = 0;

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.sp = compile(gl, SPRITE_VS, SPRITE_FS);
    this.tp = compile(gl, TERRAIN_VS, TERRAIN_FS);
    for (const n of ['u_view', 'u_tex']) this.uS[n] = gl.getUniformLocation(this.sp, n);
    for (const n of ['u_cam', 'u_scale', 'u_view', 'u_time', 'u_tiles', 'u_size', 'u_tilt']) this.uT[n] = gl.getUniformLocation(this.tp, n);
    const quad = new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    // sprite VAO
    this.vao = gl.createVertexArray()!; gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ibuf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const B = STRIDE * 4;
    const attr = (loc: number, size: number, type: number, norm: boolean, off: number) => {
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, norm, B, off); gl.vertexAttribDivisor(loc, 1);
    };
    attr(1, 2, gl.FLOAT, false, 0); attr(2, 4, gl.FLOAT, false, 8);
    attr(3, 4, gl.FLOAT, false, 24); attr(4, 4, gl.UNSIGNED_BYTE, true, 40);
    // terrain VAO
    this.tvao = gl.createVertexArray()!; gl.bindVertexArray(this.tvao);
    gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  setAtlas(canvas: HTMLCanvasElement) {
    const gl = this.gl;
    this.atlas = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  setTiles(tiles: Uint8Array, trees: Uint8Array) {
    const gl = this.gl;
    this.tileData = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { this.tileData[i * 4] = tiles[i]; this.tileData[i * 4 + 1] = trees[i]; }
    if (!this.tiles) this.tiles = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tiles);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, W, H, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, this.tileData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  updateTile(x: number, y: number, tile: number, tree: number) {
    const gl = this.gl, i = (y * W + x) * 4;
    this.tileData[i] = tile; this.tileData[i + 1] = tree;
    gl.bindTexture(gl.TEXTURE_2D, this.tiles);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, 1, 1, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, this.tileData.subarray(i, i + 4));
  }
  resize(w: number, h: number, dpr: number) {
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.vw = this.canvas.width; this.vh = this.canvas.height;
    this.gl.viewport(0, 0, this.vw, this.vh);
  }
  begin(camX: number, camY: number, scalePx: number) {
    this.cam.x = camX; this.cam.y = camY; this.cam.s = scalePx;
    this.n = 0; this.drawCalls = 0; this.quads = 0;
    const gl = this.gl;
    gl.clearColor(0.04, 0.05, 0.06, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  terrain(time: number) {
    const gl = this.gl;
    gl.useProgram(this.tp); gl.bindVertexArray(this.tvao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tiles);
    gl.uniform1i(this.uT.u_tiles, 0);
    gl.uniform2f(this.uT.u_cam, this.cam.x, this.cam.y);
    gl.uniform1f(this.uT.u_scale, this.cam.s);
    gl.uniform2f(this.uT.u_view, this.vw, this.vh);
    gl.uniform1f(this.uT.u_time, time);
    gl.uniform2f(this.uT.u_size, W, H);
    gl.uniform1f(this.uT.u_tilt, this.tilt);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND);
  }
  /** affine quad in device pixels: center (ox,oy), edge vectors A and B. col = 0xAABBGGRR */
  q(ox: number, oy: number, ax: number, ay: number, bx: number, by: number, s: Sprite, col = 0xffffffff) {
    if (this.n >= MAXI) this.flush();
    const o = this.n * STRIDE, f = this.f32;
    f[o] = ox; f[o + 1] = oy; f[o + 2] = ax; f[o + 3] = ay; f[o + 4] = bx; f[o + 5] = by;
    f[o + 6] = s.u0; f[o + 7] = s.v0; f[o + 8] = s.u1; f[o + 9] = s.v1;
    this.u32[o + 10] = col;
    this.n++;
  }
  flush() {
    if (!this.n) return;
    const gl = this.gl;
    gl.useProgram(this.sp); gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(this.uS.u_tex, 0);
    gl.uniform2f(this.uS.u_view, this.vw, this.vh);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.f32, 0, this.n * STRIDE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
    this.drawCalls++; this.quads += this.n;
    this.n = 0;
  }
}

/** pack r,g,b (0..1) + a (0..1) into 0xAABBGGRR */
export function rgba(r: number, g: number, b: number, a = 1) {
  return ((Math.round(a * 255) << 24) | (Math.round(b * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(r * 255)) >>> 0;
}
export function hexCol(hex: string, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  return rgba((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a);
}
export const WHITE = 0xffffffff;
