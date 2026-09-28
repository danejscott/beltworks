// Procedural sprite atlas. Everything is drawn with Canvas2D once at startup.
import { BLD, heightOf, ITEMS } from './data';
import { Sprite } from './gl';
import { mulberry32, poly, rrect, shade } from './util';

export const PPT = 32; // pixels per tile in the atlas
const A = 2048;
export const SPR: Record<string, Sprite> = Object.create(null);
export const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = atlasCanvas.height = A;
const G2 = atlasCanvas.getContext('2d')!;
let cx = 0, cy = 0, rowH = 0;
const PAD = 3;

function add(name: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  if (cx + w + PAD > A) { cx = 0; cy += rowH + PAD; rowH = 0; }
  G2.save(); G2.translate(cx, cy); G2.beginPath(); G2.rect(0, 0, w, h); G2.clip();
  draw(G2, w, h);
  G2.restore();
  SPR[name] = { u0: cx / A, v0: cy / A, u1: (cx + w) / A, v1: (cy + h) / A, w, h };
  cx += w + PAD; rowH = Math.max(rowH, h);
}

// ---------------------------------------------------------------------------
// Item icons
export function drawItem(g: CanvasRenderingContext2D, k: string, size: number) {
  const it = ITEMS[k], c = it.c, dk = shade(c, -0.5), lt = shade(c, 0.4);
  g.save(); g.translate(size / 2, size / 2); g.scale(size / 64, size / 64);
  g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 3.5; g.strokeStyle = dk; g.fillStyle = c;
  const circ = (x: number, y: number, r: number) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); };
  const plate = () => { rrect(g, -23, -23, 46, 46, 5); g.fill(); g.stroke(); };
  const frame = (w: number) => { g.lineWidth = w + 5; g.strokeStyle = dk; g.strokeRect(-19, -19, 38, 38); g.lineWidth = w; g.strokeStyle = c; g.strokeRect(-19, -19, 38, 38); };
  switch (it.s) {
    case 'ore': poly(g, [[-22, -8], [-10, -22], [12, -21], [25, -4], [19, 18], [-4, 25], [-23, 12]]); g.fill(); g.stroke(); g.fillStyle = lt; circ(-7, -6, 5); g.fill(); circ(9, 5, 4); g.fill(); g.fillStyle = dk; circ(-4, 11, 3); g.fill(); break;
    case 'crystal': for (const [x, y, s] of [[-8, 4, 1], [10, 6, 0.8], [0, -4, 1.2]]) { g.save(); g.translate(x, y); g.scale(s, s); poly(g, [[0, -20], [9, -8], [7, 14], [-7, 14], [-9, -8]]); g.fill(); g.stroke(); g.fillStyle = lt; poly(g, [[0, -18], [5, -8], [0, 10]]); g.fill(); g.fillStyle = c; g.restore(); } break;
    case 'log': g.fillStyle = c; rrect(g, -26, -11, 46, 22, 8); g.fill(); g.stroke(); g.fillStyle = '#d9b27a'; g.beginPath(); g.ellipse(20, 0, 8, 11, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.strokeStyle = '#9a6b3f'; g.lineWidth = 2; circ(20, 0, 4); g.stroke(); break;
    case 'drop': g.beginPath(); g.moveTo(0, -26); g.bezierCurveTo(14, -8, 20, 2, 20, 10); g.arc(0, 10, 20, 0, Math.PI); g.bezierCurveTo(-20, 2, -14, -8, 0, -26); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(-8, 6, 4, 8, 0.4, 0, 7); g.fill(); break;
    case 'ingot': poly(g, [[-25, 12], [-16, -11], [16, -11], [25, 12]]); g.fill(); g.stroke(); g.strokeStyle = lt; g.lineWidth = 4; g.beginPath(); g.moveTo(-12, -5); g.lineTo(12, -5); g.stroke(); break;
    case 'block': rrect(g, -21, -21, 42, 42, 6); g.fill(); g.stroke(); g.strokeStyle = shade(c, -0.25); g.lineWidth = 2.5; g.beginPath(); g.moveTo(-21, 0); g.lineTo(21, 0); g.moveTo(0, -21); g.lineTo(0, 0); g.moveTo(-8, 0); g.lineTo(-8, 21); g.stroke(); break;
    case 'plate': plate(); g.strokeStyle = lt; g.lineWidth = 3; g.beginPath(); g.moveTo(-14, -14); g.lineTo(14, -14); g.stroke(); break;
    case 'rod': g.rotate(-Math.PI / 4); rrect(g, -27, -6, 54, 12, 5); g.fill(); g.stroke(); g.strokeStyle = lt; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-20, -2); g.lineTo(20, -2); g.stroke(); break;
    case 'screw': g.rotate(-Math.PI / 4); rrect(g, -24, -5, 36, 10, 3); g.fill(); g.stroke(); g.strokeStyle = dk; g.lineWidth = 2; g.beginPath(); for (let i = -18; i < 8; i += 6) { g.moveTo(i, -5); g.lineTo(i + 3, 5); } g.stroke(); poly(g, [[12, -12], [22, -12], [26, 0], [22, 12], [12, 12]]); g.fillStyle = c; g.fill(); g.lineWidth = 3.5; g.stroke(); break;
    case 'coil': g.lineWidth = 11; g.strokeStyle = c; circ(0, 0, 16); g.stroke(); g.lineWidth = 2.5; g.strokeStyle = dk; circ(0, 0, 22); g.stroke(); circ(0, 0, 10.5); g.stroke(); g.strokeStyle = lt; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 16, -2.4, -1.2); g.stroke(); break;
    case 'cable': circ(0, 0, 23); g.fill(); g.strokeStyle = '#15171a'; g.stroke(); g.strokeStyle = '#f0a854'; g.lineWidth = 7; circ(0, 0, 12); g.stroke(); g.fillStyle = '#7a5a30'; circ(0, 0, 5); g.fill(); break;
    case 'bio': for (const [x, y, r] of [[-9, 4, 13], [9, 6, 12], [0, -9, 12]]) { g.fillStyle = c; circ(x, y, r); g.fill(); g.stroke(); } g.fillStyle = shade(c, 0.3); circ(-3, -10, 4); g.fill(); break;
    case 'beam': poly(g, [[-25, -17], [25, -17], [25, -8], [7, -8], [7, 8], [25, 8], [25, 17], [-25, 17], [-25, 8], [-7, 8], [-7, -8], [-25, -8]]); g.fill(); g.stroke(); break;
    case 'pipe': rrect(g, -26, -11, 46, 22, 4); g.fill(); g.stroke(); g.fillStyle = dk; g.beginPath(); g.ellipse(20, 0, 6, 11, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = lt; g.lineWidth = 3; g.beginPath(); g.moveTo(-18, -5); g.lineTo(10, -5); g.stroke(); break;
    case 'powder': g.beginPath(); g.moveTo(-24, 18); g.quadraticCurveTo(0, -30, 24, 18); g.closePath(); g.fill(); g.stroke(); g.fillStyle = dk; for (const [x, y] of [[-6, 6], [5, 10], [0, -2], [9, 0]]) { circ(x, y, 2); g.fill(); } break;
    case 'casing': rrect(g, -18, -24, 36, 48, 6); g.fill(); g.stroke(); g.fillStyle = dk; rrect(g, -10, -16, 20, 32, 4); g.fill(); g.fillStyle = lt; rrect(g, -8, -14, 5, 28, 2); g.fill(); break;
    case 'sheet': g.save(); g.rotate(-0.25); rrect(g, -24, -16, 48, 32, 5); g.fill(); g.stroke(); g.fillStyle = lt; rrect(g, -18, -11, 16, 6, 3); g.fill(); g.restore(); break;
    case 'pellet': for (const [x, y] of [[-10, -8], [8, -10], [0, 6], [-12, 10], [12, 9]]) { g.fillStyle = c; circ(x, y, 8); g.fill(); g.stroke(); } break;
    case 'scrap': poly(g, [[-22, -6], [-8, -20], [6, -12], [20, -20], [24, 4], [8, 20], [-6, 12], [-20, 18]]); g.fill(); g.stroke(); g.strokeStyle = lt; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-12, 0); g.lineTo(10, -6); g.stroke(); break;
    case 'rplate': plate(); g.fillStyle = dk; for (const [x, y] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) { circ(x, y, 4); g.fill(); } g.strokeStyle = lt; g.lineWidth = 3; g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke(); break;
    case 'rotor': for (let i = 0; i < 3; i++) { g.save(); g.rotate(i * Math.PI * 2 / 3); rrect(g, -6, -28, 12, 22, 5); g.fill(); g.stroke(); g.restore(); } circ(0, 0, 11); g.fillStyle = lt; g.fill(); g.stroke(); break;
    case 'frame': frame(8); g.lineWidth = 5; g.strokeStyle = c; g.beginPath(); g.moveTo(-17, -17); g.lineTo(17, 17); g.stroke(); break;
    case 'smart': rrect(g, -23, -23, 46, 46, 7); g.fill(); g.stroke(); g.fillStyle = '#d6eeff'; rrect(g, -10, -10, 20, 20, 3); g.fill(); g.strokeStyle = '#d6eeff'; g.lineWidth = 2.5; g.beginPath(); for (const s of [-1, 1]) { g.moveTo(s * 10, -5); g.lineTo(s * 19, -5); g.moveTo(s * 10, 5); g.lineTo(s * 19, 5); } g.stroke(); break;
    case 'ebeam': rrect(g, -24, -19, 48, 38, 5); g.fill(); g.stroke(); g.fillStyle = '#5a6572'; poly(g, [[-15, -10], [15, -10], [15, -5], [4, -5], [4, 5], [15, 5], [15, 10], [-15, 10], [-15, 5], [-4, 5], [-4, -5], [-15, -5]]); g.fill(); break;
    case 'vframe': frame(8); g.strokeStyle = lt; g.lineWidth = 5; g.beginPath(); g.moveTo(-17, -17); g.lineTo(17, 17); g.moveTo(17, -17); g.lineTo(-17, 17); g.stroke(); break;
    case 'stator': circ(0, 0, 24); g.fill(); g.stroke(); g.fillStyle = '#2b2f36'; circ(0, 0, 10); g.fill(); g.fillStyle = '#f0a854'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; circ(Math.cos(a) * 17, Math.sin(a) * 17, 4.5); g.fill(); } break;
    case 'motor': rrect(g, -23, -17, 36, 34, 5); g.fill(); g.stroke(); g.fillStyle = '#b9c0c9'; rrect(g, 13, -5, 14, 10, 2); g.fill(); g.stroke(); g.strokeStyle = dk; g.lineWidth = 2.5; g.beginPath(); for (let x = -15; x < 10; x += 7) { g.moveTo(x, -13); g.lineTo(x, 13); } g.stroke(); break;
    case 'awire': rrect(g, -24, -19, 48, 38, 8); g.fill(); g.stroke(); g.strokeStyle = '#f0a854'; g.lineWidth = 3; g.beginPath(); g.moveTo(-18, -8); g.bezierCurveTo(-5, -8, -5, 8, 18, 8); g.moveTo(-18, 8); g.bezierCurveTo(-5, 8, -5, -8, 18, -8); g.stroke(); break;
    case 'board': rrect(g, -24, -18, 48, 36, 4); g.fill(); g.stroke(); g.strokeStyle = '#e8d070'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-18, -8); g.lineTo(-4, -8); g.lineTo(2, 0); g.lineTo(18, 0); g.moveTo(-18, 8); g.lineTo(8, 8); g.stroke(); g.fillStyle = '#1d2a22'; rrect(g, 4, -14, 12, 10, 2); g.fill(); break;
    case 'chip': rrect(g, -16, -16, 32, 32, 4); g.fill(); g.stroke(); g.strokeStyle = '#d0d6dc'; g.lineWidth = 3; g.beginPath(); for (let i = -10; i <= 10; i += 10) { g.moveTo(-16, i); g.lineTo(-24, i); g.moveTo(16, i); g.lineTo(24, i); g.moveTo(i, -16); g.lineTo(i, -24); g.moveTo(i, 16); g.lineTo(i, 24); } g.stroke(); g.fillStyle = lt; rrect(g, -7, -7, 14, 14, 2); g.fill(); break;
    case 'hframe': frame(11); g.lineWidth = 7; g.strokeStyle = c; g.beginPath(); g.moveTo(-16, -16); g.lineTo(16, 16); g.moveTo(16, -16); g.lineTo(-16, 16); g.stroke(); g.fillStyle = dk; circ(0, 0, 5); g.fill(); break;
    case 'computer': rrect(g, -24, -20, 48, 34, 4); g.fill(); g.stroke(); g.fillStyle = '#5fd0ff'; rrect(g, -18, -14, 36, 22, 2); g.fill(); g.fillStyle = dk; rrect(g, -10, 16, 20, 6, 2); g.fill(); g.fillStyle = '#e0f6ff'; rrect(g, -14, -10, 12, 3, 1); g.fill(); break;
    case 'engine': rrect(g, -20, -18, 40, 36, 6); g.fill(); g.stroke(); g.fillStyle = dk; for (let i = -12; i <= 12; i += 8) { rrect(g, i - 2, -24, 4, 8, 1); g.fill(); } g.fillStyle = lt; circ(0, 2, 9); g.fill(); g.stroke(); break;
    case 'acu': rrect(g, -24, -20, 48, 40, 6); g.fill(); g.stroke(); g.fillStyle = '#9fe0ff'; for (let i = 0; i < 3; i++) { rrect(g, -18 + i * 13, -12, 10, 10, 2); g.fill(); } g.fillStyle = '#f0c040'; rrect(g, -18, 4, 36, 8, 2); g.fill(); break;
    case 'osc': rrect(g, -22, -14, 44, 28, 6); g.fill(); g.stroke(); g.fillStyle = '#ffd0ea'; poly(g, [[0, -10], [8, 0], [0, 10], [-8, 0]]); g.fill(); g.strokeStyle = '#d0d6dc'; g.lineWidth = 3; g.beginPath(); for (const x of [-14, 14]) { g.moveTo(x, 14); g.lineTo(x, 24); } g.stroke(); break;
    case 'hsc': rrect(g, -24, -12, 48, 24, 5); g.fill(); g.stroke(); g.fillStyle = dk; for (let i = -18; i <= 14; i += 8) { rrect(g, i, -6, 4, 12, 1); g.fill(); } break;
    case 'super': rrect(g, -18, -26, 36, 52, 5); g.fill(); g.stroke(); for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#5fd0ff' : '#3fe08a'; rrect(g, -12, -20 + i * 9, 24, 5, 1); g.fill(); } break;
    case 'radio': rrect(g, -22, -10, 44, 30, 5); g.fill(); g.stroke(); g.strokeStyle = dk; g.lineWidth = 3; g.beginPath(); g.moveTo(10, -10); g.lineTo(18, -26); g.stroke(); g.strokeStyle = '#ff6060'; g.beginPath(); g.arc(18, -26, 6, -2.2, -0.9); g.stroke(); g.fillStyle = dk; circ(-8, 5, 7); g.fill(); break;
    case 'director': poly(g, [[0, -26], [24, -8], [16, 22], [-16, 22], [-24, -8]]); g.fill(); g.stroke(); g.fillStyle = '#f0e0ff'; circ(0, 0, 8); g.fill(); g.strokeStyle = '#f0e0ff'; g.lineWidth = 2; circ(0, 0, 14); g.stroke(); break;
    case 'shard': g.fillStyle = c; poly(g, [[0, -28], [12, -4], [4, 26], [-10, 6], [-8, -12]]); g.fill(); g.stroke(); g.fillStyle = '#e8fbff'; poly(g, [[0, -22], [6, -4], [0, 14]]); g.fill(); break;
    case 'amp': circ(0, 0, 22); g.fill(); g.stroke(); g.strokeStyle = '#f5e0ff'; g.lineWidth = 4; g.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.3; g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); g.lineTo(Math.cos(a) * 18, Math.sin(a) * 18); } g.stroke(); break;
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Building bases (unrotated; front/output drawn dynamically)
function body(g: CanvasRenderingContext2D, w: number, h: number, col: string, r = 7) {
  g.fillStyle = 'rgba(0,0,0,.45)'; rrect(g, 3, 5, w - 5, h - 6, r); g.fill();
  g.fillStyle = shade(col, -0.55); rrect(g, 1.5, 1.5, w - 4, h - 4, r); g.fill();
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, shade(col, -0.08)); gr.addColorStop(1, shade(col, -0.4));
  g.fillStyle = gr; rrect(g, 4, 4, w - 9, h - 9, r - 2); g.fill();
  g.strokeStyle = shade(col, 0.3); g.lineWidth = 1.5; g.stroke();
}
function bolts(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = 'rgba(0,0,0,.35)';
  for (const [x, y] of [[9, 9], [w - 11, 9], [9, h - 11], [w - 11, h - 11]]) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
}
function circleAt(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string, lw = 2) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
export function drawBuildingBase(g: CanvasRenderingContext2D, type: string, w: number, h: number) {
  const d = BLD[type], col = d.col, cxp = w / 2, cyp = h / 2, m = Math.min(w, h);
  const rng = mulberry32(type.length * 7919 + type.charCodeAt(0));
  switch (type) {
    case 'hub': {
      body(g, w, h, '#4a4034', 10);
      circleAt(g, cxp, cyp, m * 0.4, '#2a241c', '#f5a524', 3);
      g.strokeStyle = '#f5a52488'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.arc(cxp, cyp, m * 0.33, 0, 7); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#f5a524'; g.font = `bold ${m * 0.2}px Segoe UI, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HUB', cxp, cyp);
      for (let i = 0; i < 4; i++) { g.save(); g.translate(cxp, cyp); g.rotate(i * Math.PI / 2); g.fillStyle = '#f5a52466'; poly(g, [[m * 0.42, -8], [m * 0.47, 0], [m * 0.42, 8]]); g.fill(); g.restore(); }
      return;
    }
    case 'elevator': {
      body(g, w, h, '#3a3a4c', 12);
      circleAt(g, cxp, cyp, m * 0.44, '#262636', '#6a6a8a', 3);
      circleAt(g, cxp, cyp, m * 0.3, '#c9cbe0', '#8f92b5', 3);
      circleAt(g, cxp, cyp, m * 0.16, '#8f92b5');
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; circleAt(g, cxp + Math.cos(a) * m * 0.37, cyp + Math.sin(a) * m * 0.37, 4, '#b69cff'); }
      return;
    }
    case 'statue': {
      g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(cxp + 3, cyp + 6, m * 0.42, m * 0.3, 0, 0, 7); g.fill();
      circleAt(g, cxp, cyp, m * 0.42, '#5a5048', '#3a3028');
      g.save(); g.translate(cxp, cyp); const r = m * 0.3;
      const pts = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      const gr = g.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, '#fff2a0'); gr.addColorStop(0.5, '#f0c040'); gr.addColorStop(1, '#a07010');
      g.fillStyle = gr; poly(g, pts); g.fill(); g.strokeStyle = '#805a10'; g.lineWidth = 2; g.stroke();
      circleAt(g, 0, 0, r * 0.45, '#5a5048', '#805a10'); g.restore();
      return;
    }
    case 'lamp': circleAt(g, cxp, cyp, m * 0.3, '#3a3a40', '#222'); circleAt(g, cxp, cyp, m * 0.18, '#fff2b0'); return;
    case 'pole1': case 'pole2': {
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(cxp + 3, cyp + 4, m * 0.3, m * 0.22, 0, 0, 7); g.fill();
      circleAt(g, cxp, cyp, m * 0.26, shade(col, -0.4), shade(col, -0.7));
      circleAt(g, cxp, cyp, m * 0.14, col);
      g.fillStyle = '#3a3a40'; g.fillRect(cxp - m * 0.34, cyp - 2, m * 0.68, 4);
      if (type === 'pole2') g.fillRect(cxp - 2, cyp - m * 0.34, 4, m * 0.68);
      return;
    }
    case 'splitter': case 'merger': case 'sorter': {
      body(g, w, h, col, 5);
      g.fillStyle = type === 'sorter' ? '#bfefff' : '#fff5cc';
      if (type === 'merger') { for (const r of [Math.PI, -Math.PI / 2, Math.PI / 2]) { g.save(); g.translate(cxp, cyp); g.rotate(r); poly(g, [[12, -4], [7, 0], [12, 4]]); g.fill(); g.restore(); } g.save(); g.translate(cxp, cyp); poly(g, [[5, -6], [12, 0], [5, 6]]); g.fillStyle = '#ffb347'; g.fill(); g.restore(); }
      else { for (const r of [0, -Math.PI / 2, Math.PI / 2]) { g.save(); g.translate(cxp, cyp); g.rotate(r); poly(g, [[6, -5], [12, 0], [6, 5]]); g.fillStyle = '#ffb347'; g.fill(); g.restore(); } }
      circleAt(g, cxp, cyp, 3.5, 'rgba(0,0,0,.4)');
      return;
    }
  }
  body(g, w, h, col, m >= 64 ? 9 : 7);
  bolts(g, w, h);
  const dark = shade(col, -0.65);
  switch (d.kind) {
    case 'miner': circleAt(g, cxp, cyp, m * 0.38, dark, shade(col, 0.2), 2.5); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; circleAt(g, cxp + Math.cos(a) * m * 0.3, cyp + Math.sin(a) * m * 0.3, 1.8, shade(col, 0.3)); } break;
    case 'harvester': circleAt(g, cxp, cyp, m * 0.36, '#2a3020', '#9ac060', 2); break;
    case 'machine':
      if (type === 'smelter') { rrect(g, cxp - m * 0.28, cyp - m * 0.2, m * 0.56, m * 0.4, 5); g.fillStyle = '#301810'; g.fill(); const gr = g.createRadialGradient(cxp, cyp, 1, cxp, cyp, m * 0.3); gr.addColorStop(0, '#ffb060aa'); gr.addColorStop(1, '#ff600000'); g.fillStyle = gr; g.fill(); }
      else if (type === 'constructor') { g.fillStyle = dark; g.fillRect(6, cyp - m * 0.16, w - 12, m * 0.32); g.strokeStyle = shade(col, 0.2); g.lineWidth = 1.5; for (let x = 10; x < w - 8; x += 6) { g.beginPath(); g.moveTo(x, cyp - m * 0.16); g.lineTo(x, cyp + m * 0.16); g.stroke(); } }
      else if (type === 'assembler') { for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) circleAt(g, w * x, h * y, m * 0.1, dark, shade(col, 0.25)); rrect(g, cxp - m * 0.2, cyp - m * 0.2, m * 0.4, m * 0.4, 6); g.fillStyle = shade(col, -0.5); g.fill(); }
      else if (type === 'foundry') { circleAt(g, cxp, cyp, m * 0.34, '#2a1018', '#ff8a40', 3); const gr = g.createRadialGradient(cxp, cyp, 2, cxp, cyp, m * 0.3); gr.addColorStop(0, '#ffd080aa'); gr.addColorStop(1, '#ff400000'); g.fillStyle = gr; g.beginPath(); g.arc(cxp, cyp, m * 0.3, 0, 7); g.fill(); }
      else if (type === 'refinery') { for (const [x, y, r] of [[0.28, 0.28, 0.16], [0.72, 0.28, 0.16], [0.28, 0.72, 0.16], [0.72, 0.72, 0.16]]) { circleAt(g, w * x, h * y, m * r, shade(col, -0.3), shade(col, 0.3), 2.5); circleAt(g, w * x, h * y, m * r * 0.45, dark); } g.strokeStyle = '#8a9aa8'; g.lineWidth = 5; g.beginPath(); g.moveTo(w * 0.28, h * 0.5); g.lineTo(w * 0.72, h * 0.5); g.moveTo(w * 0.5, h * 0.28); g.lineTo(w * 0.5, h * 0.72); g.stroke(); }
      else if (type === 'manufacturer') { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { if (i === 1 && j === 1) continue; rrect(g, w * (0.14 + i * 0.26), h * (0.14 + j * 0.26), w * 0.2, h * 0.2, 4); g.fillStyle = shade(col, -0.35 - rng() * 0.2); g.fill(); } }
      break;
    case 'extractor':
      if (type === 'water_extractor') { circleAt(g, cxp, cyp, m * 0.34, '#123048', '#6ab0f0', 3); circleAt(g, cxp, cyp, m * 0.16, '#3f8fe0'); }
      else { g.strokeStyle = '#2a2030'; g.lineWidth = 3; g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.moveTo(w - 8, 8); g.lineTo(8, h - 8); g.stroke(); circleAt(g, cxp, cyp, m * 0.2, '#1a1422', '#b090d0', 2); }
      break;
    case 'storage': g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; for (let y = 10; y < h - 8; y += 8) { g.beginPath(); g.moveTo(8, y); g.lineTo(w - 8, y); g.stroke(); } g.strokeStyle = shade(col, 0.25); g.strokeRect(8, 8, w - 17, h - 17); break;
    case 'sink': for (let i = 4; i >= 1; i--) circleAt(g, cxp, cyp, m * 0.1 * i, i % 2 ? '#3a1830' : shade(col, -0.2)); break;
    case 'tank': circleAt(g, cxp, cyp, m * 0.4, shade(col, -0.3), shade(col, 0.3), 3); circleAt(g, cxp, cyp, m * 0.3, dark); break;
    case 'pole': g.strokeStyle = shade(col, -0.3); g.lineWidth = 3; g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.moveTo(w - 8, 8); g.lineTo(8, h - 8); g.stroke(); circleAt(g, cxp, cyp, m * 0.15, col, dark); break;
    case 'gen':
      if (type === 'biomass_burner') { rrect(g, cxp - m * 0.25, cyp - m * 0.25, m * 0.5, m * 0.5, 6); g.fillStyle = '#2a1a10'; g.fill(); const gr = g.createRadialGradient(cxp, cyp, 1, cxp, cyp, m * 0.3); gr.addColorStop(0, '#ff9040aa'); gr.addColorStop(1, '#ff400000'); g.fillStyle = gr; g.fill(); }
      else if (type === 'coal_gen') { circleAt(g, w * 0.32, h * 0.32, m * 0.16, '#26262c', '#666'); circleAt(g, w * 0.68, h * 0.32, m * 0.16, '#26262c', '#666'); rrect(g, w * 0.2, h * 0.58, w * 0.6, h * 0.24, 5); g.fillStyle = dark; g.fill(); }
      else if (type === 'fuel_gen') { circleAt(g, cxp, cyp, m * 0.34, '#301c10', '#f0a040', 3); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; circleAt(g, cxp + Math.cos(a) * m * 0.22, cyp + Math.sin(a) * m * 0.22, 3, '#f0a040'); } }
      else if (type === 'geothermal') { circleAt(g, cxp, cyp, m * 0.34, '#301410', '#ff7040', 3); circleAt(g, cxp, cyp, m * 0.16, '#ff9a50'); }
      break;
    case 'battery': for (let i = 0; i < 3; i++) { rrect(g, w * (0.18 + i * 0.23), h * 0.2, w * 0.18, h * 0.6, 3); g.fillStyle = dark; g.fill(); } break;
    case 'station': g.fillStyle = dark; g.fillRect(6, 6, w - 12, h - 12); g.fillStyle = '#f0c04088'; for (let x = 8; x < w - 8; x += 12) g.fillRect(x, h - 14, 6, 6); circleAt(g, cxp, cyp - 4, m * 0.16, '#3a2c1c', '#f0c040'); break;
    case 'drone': circleAt(g, cxp, cyp, m * 0.38, '#1c2838', '#6ab0f0', 3); g.strokeStyle = '#6ab0f0'; g.lineWidth = 3; g.beginPath(); g.moveTo(cxp - 10, cyp - 12); g.lineTo(cxp - 10, cyp + 12); g.moveTo(cxp + 10, cyp - 12); g.lineTo(cxp + 10, cyp + 12); g.moveTo(cxp - 10, cyp); g.lineTo(cxp + 10, cyp); g.stroke(); break;
  }
}

// ---------------------------------------------------------------------------
export function buildAtlas() {
  add('white', 8, 8, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 8, 8); });
  const wsp = SPR.white; const inset = 3 / A; SPR.white = { ...wsp, u0: wsp.u0 + inset, v0: wsp.v0 + inset, u1: wsp.u1 - inset, v1: wsp.v1 - inset };
  add('circle', 64, 64, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); });
  add('ring', 64, 64, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.stroke(); });
  add('glow', 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  add('shadow', 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  add('arrow', 32, 32, (g) => { g.fillStyle = '#fff'; poly(g, [[6, 4], [28, 16], [6, 28], [11, 16]]); g.fill(); });
  add('gear', 64, 64, (g) => {
    g.translate(32, 32); g.fillStyle = '#fff'; g.beginPath();
    for (let i = 0; i < 20; i++) { const a = i * Math.PI / 10, r = i % 2 ? 22 : 29; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
  });
  add('drill', 64, 64, (g) => { g.translate(32, 32); g.fillStyle = '#dde2e8'; for (let i = 0; i < 3; i++) { g.rotate(Math.PI * 2 / 3); poly(g, [[0, -5], [29, 0], [0, 5]]); g.fill(); } g.fillStyle = '#2a2d33'; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill(); });
  add('saw', 64, 64, (g) => { g.translate(32, 32); g.fillStyle = '#d8dde2'; g.beginPath(); for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, r = i % 2 ? 24 : 29; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.fillStyle = '#6f9a3a'; g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fill(); });
  add('fan', 64, 64, (g) => { g.translate(32, 32); g.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { g.rotate(Math.PI * 2 / 5); g.beginPath(); g.ellipse(14, 0, 14, 6, 0.3, 0, 7); g.fill(); } });
  add('bolt', 32, 32, (g) => { g.fillStyle = '#ffd84a'; g.strokeStyle = '#3a2a00'; g.lineWidth = 2; poly(g, [[18, 2], [6, 18], [14, 18], [11, 30], [26, 12], [17, 12]]); g.fill(); g.stroke(); });
  add('warn', 32, 32, (g) => { g.fillStyle = '#ef5b5b'; g.strokeStyle = '#300'; g.lineWidth = 2; poly(g, [[16, 3], [30, 28], [2, 28]]); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.fillRect(14.5, 11, 3, 9); g.fillRect(14.5, 22, 3, 3); });
  add('pin', 32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 12, 9, Math.PI, 0); g.lineTo(16, 30); g.closePath(); g.fill(); });
  // items
  for (const k in ITEMS) add('i:' + k, 64, 64, (g) => drawItem(g, k, 64));
  // buildings
  for (const t in BLD) {
    const d = BLD[t];
    if (d.kind === 'belt' || d.kind === 'rail' || d.kind === 'pipe' || d.kind === 'tunnel' || d.kind === 'ptunnel' || d.kind === 'train' || d.kind === 'wagon') continue;
    add('b:' + t, d.w * PPT, d.h * PPT, (g, w, h) => drawBuildingBase(g, t, w, h));
  }
  // belts: straight + curve, 8 animation frames each, per tier
  for (const t of ['belt1', 'belt2', 'belt3', 'belt4', 'gold']) {
    const col = t === 'gold' ? '#f5c542' : BLD[t].col;
    for (let f = 0; f < 8; f++) {
      add(`${t}s${f}`, 32, 32, (g) => beltStraight(g, col, f / 8));
      add(`${t}c${f}`, 32, 32, (g) => beltCurve(g, col, f / 8));
    }
  }
  add('tunnel_in', 32, 32, (g) => tunnelSprite(g, false));
  add('tunnel_out', 32, 32, (g) => tunnelSprite(g, true));
  // pipes
  add('pipe_arm', 32, 32, (g) => { g.fillStyle = '#3a4450'; g.fillRect(16, 8, 16, 16); g.fillStyle = '#8a9aa8'; g.fillRect(16, 10, 16, 12); g.fillStyle = '#b6c4d0'; g.fillRect(16, 11, 16, 3); g.fillStyle = '#5a6874'; g.fillRect(26, 8, 3, 16); });
  add('pipe_hub', 32, 32, (g) => { circleAt(g, 16, 16, 9, '#8a9aa8', '#3a4450', 2.5); circleAt(g, 16, 16, 4, '#5a6874'); });
  add('fluid_arm', 32, 32, (g) => { g.fillStyle = '#fff'; g.fillRect(16, 13, 16, 6); });
  add('fluid_hub', 32, 32, (g) => { circleAt(g, 16, 16, 5, '#fff'); });
  add('ptunnel', 32, 32, (g) => { circleAt(g, 16, 16, 12, '#2a3038', '#8a9aa8', 3); g.fillStyle = '#8a9aa8'; g.fillRect(0, 11, 12, 10); circleAt(g, 16, 16, 6, '#0c0f12'); });
  // rails
  add('rail_s', 32, 32, (g) => { g.fillStyle = '#6a4e36'; for (let x = 2; x < 32; x += 8) g.fillRect(x, 5, 4, 22); g.fillStyle = '#c9ccd2'; g.fillRect(0, 9, 32, 3); g.fillRect(0, 20, 32, 3); });
  add('rail_c', 32, 32, (g) => {
    g.strokeStyle = '#6a4e36'; g.lineWidth = 4;
    for (let a = 0.12; a < Math.PI / 2; a += 0.36) { g.beginPath(); g.moveTo(Math.cos(-a) * 5, 32 + Math.sin(-a) * 5); g.lineTo(Math.cos(-a) * 27, 32 + Math.sin(-a) * 27); g.stroke(); }
    g.strokeStyle = '#c9ccd2'; g.lineWidth = 3;
    for (const r of [10.5, 21.5]) { g.beginPath(); g.arc(0, 32, r, -Math.PI / 2, 0); g.stroke(); }
  });
  // trees
  for (let v = 0; v < 4; v++) add('tree' + v, 48, 48, (g) => treeSprite(g, v));
  // nodes
  for (const res of ['iron_ore', 'copper_ore', 'limestone', 'coal', 'caterium_ore', 'raw_quartz', 'bauxite', 'sulfur', 'crude_oil', 'geyser']) add('n:' + res, 64, 64, (g) => nodeSprite(g, res));
  // vehicles
  add('loco', 64, 28, (g) => { rrect(g, 2, 2, 60, 24, 6); g.fillStyle = '#7a2a20'; g.fill(); rrect(g, 4, 4, 56, 20, 5); g.fillStyle = '#d0503a'; g.fill(); g.fillStyle = '#2a3440'; rrect(g, 44, 6, 12, 16, 3); g.fill(); g.fillStyle = '#f5d060'; g.fillRect(58, 8, 3, 4); g.fillRect(58, 16, 3, 4); g.fillStyle = '#5a1a14'; for (let x = 10; x < 40; x += 8) g.fillRect(x, 7, 3, 14); });
  add('wagon', 64, 28, (g) => { rrect(g, 3, 3, 58, 22, 4); g.fillStyle = '#3a342e'; g.fill(); rrect(g, 5, 5, 54, 18, 3); g.fillStyle = '#8a7a6a'; g.fill(); g.strokeStyle = '#5a4a3a'; g.lineWidth = 2; for (let x = 12; x < 56; x += 10) { g.beginPath(); g.moveTo(x, 5); g.lineTo(x, 23); g.stroke(); } });
  add('cargo', 64, 28, (g) => { g.fillStyle = '#fff'; rrect(g, 9, 8, 46, 12, 3); g.fill(); });
  add('drone', 40, 40, (g) => { g.translate(20, 20); g.strokeStyle = '#2a3440'; g.lineWidth = 4; g.beginPath(); g.moveTo(-13, -13); g.lineTo(13, 13); g.moveTo(13, -13); g.lineTo(-13, 13); g.stroke(); for (const [x, y] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) circleAt(g, x, y, 6, 'rgba(200,230,255,.5)', '#2a3440', 1.5); rrect(g, -8, -6, 16, 12, 4); g.fillStyle = '#5a9ad8'; g.fill(); g.fillStyle = '#e8f4ff'; g.fillRect(4, -2, 3, 4); });
  add('lampglow', 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,180,.55)'); gr.addColorStop(1, 'rgba(255,240,180,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

  // ---- isometric extras
  add('wall', 32, 32, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c8c8c8');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 0, 32, 2);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 28, 32, 4);
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(15, 3, 2, 25);
  });
  add('rocktop', 32, 32, (g) => {
    const r = mulberry32(11); g.fillStyle = '#9a968f'; g.fillRect(0, 0, 32, 32); g.fillStyle = 'rgba(80,110,60,.18)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(r() * 32, r() * 32, 3 + r() * 5, 0, 7); g.fill(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(r() * 32, r() * 32, 1 + r() * 3, 0, 7); g.fill(); }
  });
  add('rockwall', 32, 32, (g) => {
    const r = mulberry32(5); g.fillStyle = '#f2eee8'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = 'rgba(0,0,0,.10)'; for (let y = 5; y < 32; y += 7) g.fillRect(0, y + (r() * 2 | 0), 32, 2);
    for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(r() * 32, r() * 32, 3 + r() * 5, 2); }
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(0, 0, 32, 2);
  });
  for (let v = 0; v < 4; v++) add('treeb' + v, 48, 64, (g) => treeBillboard(g, v));
  add('poleb', 16, 64, (g) => {
    g.fillStyle = '#7a5a3a'; g.fillRect(6, 6, 4, 58); g.fillStyle = '#9a7a52'; g.fillRect(6, 6, 2, 58);
    g.fillStyle = '#5a4028'; g.fillRect(1, 8, 14, 3);
    g.fillStyle = '#e8e0c8'; g.fillRect(1, 5, 3, 4); g.fillRect(12, 5, 3, 4);
  });
  add('pole2b', 20, 80, (g) => {
    g.fillStyle = '#9aa4ae'; g.fillRect(8, 6, 4, 74); g.fillStyle = '#c8d0d8'; g.fillRect(8, 6, 2, 74);
    g.fillStyle = '#6a747e'; g.fillRect(1, 8, 18, 3); g.fillRect(3, 16, 14, 2);
    g.fillStyle = '#e8e0c8'; g.fillRect(1, 4, 3, 5); g.fillRect(16, 4, 3, 5);
  });
  add('towerb', 48, 128, (g) => {
    g.strokeStyle = '#8a929a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(8, 128); g.lineTo(22, 8); g.lineTo(26, 8); g.lineTo(40, 128); g.stroke();
    g.lineWidth = 1.5; for (let y = 20; y < 124; y += 14) { const a = 8 + (128 - y) / 120 * 0 + (y - 8) / 120 * 0; void a; const l = 22 - (y - 8) / 120 * 14, r2 = 26 + (y - 8) / 120 * 14; g.beginPath(); g.moveTo(l, y); g.lineTo(r2, y + 14); g.moveTo(r2, y); g.lineTo(l, y + 14); g.stroke(); }
    g.fillStyle = '#6a727a'; g.fillRect(4, 10, 40, 4); g.fillStyle = '#e8e0c8'; g.fillRect(4, 6, 4, 5); g.fillRect(40, 6, 4, 5);
  });
  add('bubble', 64, 72, (g) => {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(33, 34, 29, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 31, 29, 0, 7); g.fill();
    poly(g, [[24, 55], [32, 71], [40, 55]]); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 2; g.beginPath(); g.arc(32, 31, 27, 0, 7); g.stroke();
  });

  // ---- detail props
  add('beltwall', 32, 32, (g) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 32, 5);
    for (let x = 2; x < 32; x += 8) { g.fillStyle = '#707070'; g.beginPath(); g.arc(x + 2, 18, 5, 0, 7); g.fill(); g.fillStyle = '#b0b0b0'; g.beginPath(); g.arc(x + 2, 18, 2, 0, 7); g.fill(); }
  });
  add('cylside', 32, 32, (g) => {
    const gr = g.createLinearGradient(0, 0, 32, 0);
    gr.addColorStop(0, '#9a9a9a'); gr.addColorStop(0.3, '#ffffff'); gr.addColorStop(0.55, '#e4e4e4'); gr.addColorStop(1, '#7a7a7a');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 8, 32, 2); g.fillRect(0, 22, 32, 2);
  });
  add('arm', 64, 16, (g) => {
    g.fillStyle = '#e8b23a'; rrect(g, 4, 3, 56, 10, 5); g.fill(); g.strokeStyle = '#7a5a10'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#3a3d44'; g.beginPath(); g.arc(9, 8, 5, 0, 7); g.fill(); g.beginPath(); g.arc(55, 8, 4, 0, 7); g.fill();
    g.fillStyle = '#c8ccd2'; g.fillRect(58, 3, 6, 3); g.fillRect(58, 10, 6, 3);
  });
  add('dish', 48, 40, (g) => {
    g.fillStyle = '#6a6e76'; g.fillRect(22, 24, 4, 16);
    const gr = g.createLinearGradient(0, 0, 48, 0); gr.addColorStop(0, '#9aa0a8'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#8a9098');
    g.fillStyle = gr; g.beginPath(); g.ellipse(24, 14, 22, 12, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#6a6e76'; g.lineWidth = 2; g.beginPath(); g.moveTo(24, 14); g.lineTo(24, 2); g.stroke();
    g.fillStyle = '#ef5b5b'; g.beginPath(); g.arc(24, 3, 2.5, 0, 7); g.fill();
  });
  add('flame', 32, 48, (g) => {
    const gr = g.createRadialGradient(16, 34, 2, 16, 30, 18);
    gr.addColorStop(0, 'rgba(255,250,200,1)'); gr.addColorStop(0.4, 'rgba(255,170,40,.95)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(16, 2); g.bezierCurveTo(30, 20, 28, 44, 16, 46); g.bezierCurveTo(4, 44, 2, 20, 16, 2); g.fill();
  });
  add('crate', 32, 32, (g) => {
    g.fillStyle = '#b8894e'; g.fillRect(0, 0, 32, 32);
    g.strokeStyle = '#7a5530'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 29, 29);
    g.beginPath(); g.moveTo(3, 3); g.lineTo(29, 29); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(3, 3, 26, 3);
  });
  add('zz', 32, 32, (g) => {
    g.font = 'bold 26px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 4; g.strokeStyle = 'rgba(30,40,60,.8)'; g.strokeText('z', 16, 16); g.fillStyle = '#ffffff'; g.fillText('z', 16, 16);
  });
  add('pumphead', 48, 24, (g) => {
    g.fillStyle = '#3a3d44'; rrect(g, 2, 8, 40, 8, 3); g.fill();
    g.fillStyle = '#d0503a'; g.beginPath(); g.moveTo(36, 4); g.quadraticCurveTo(48, 12, 36, 22); g.lineTo(32, 20); g.lineTo(32, 6); g.closePath(); g.fill();
    g.fillStyle = '#c8ccd2'; g.beginPath(); g.arc(22, 12, 3, 0, 7); g.fill();
  });
  for (let v = 0; v < 4; v++) add('tuft' + v, 24, 24, (g) => {
    const r = mulberry32(v * 71 + 3);
    if (v === 3) { for (let i = 0; i < 3; i++) { g.fillStyle = ['#8a857c', '#9a948a', '#77736b'][i]; g.beginPath(); g.ellipse(6 + r() * 12, 16 + r() * 5, 3 + r() * 2, 2 + r(), 0, 0, 7); g.fill(); } return; }
    if (v === 2) { g.fillStyle = '#35592a'; g.beginPath(); g.arc(12, 15, 8, 0, 7); g.fill(); g.fillStyle = '#44702f'; g.beginPath(); g.arc(10, 12, 5, 0, 7); g.fill(); return; }
    g.strokeStyle = '#4a7432'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) { const x = 5 + r() * 14; g.beginPath(); g.moveTo(x, 23); g.quadraticCurveTo(x + (r() - 0.5) * 6, 16, x + (r() - 0.5) * 8, 6 + r() * 8); g.stroke(); }
    if (v === 1) for (let i = 0; i < 3; i++) { g.fillStyle = ['#f2e36a', '#ffffff', '#e89ad0'][i]; g.beginPath(); g.arc(6 + r() * 12, 7 + r() * 8, 2, 0, 7); g.fill(); }
  });
  return atlasCanvas;
}

function treeBillboard(g: CanvasRenderingContext2D, v: number) {
  const rng = mulberry32(v * 131 + 7);
  g.fillStyle = '#6b4a2e'; rrect(g, 20, 40, 8, 22, 3); g.fill();
  g.fillStyle = '#86603c'; rrect(g, 20, 40, 3, 22, 2); g.fill();
  const base = ['#3d6e2c', '#4a7a32', '#2c5e34', '#557c30'][v];
  if (v === 2) { // pine
    for (let i = 0; i < 3; i++) { const y = 6 + i * 11, w = 12 + i * 6; g.fillStyle = shade(base, -0.1 + i * 0.05); poly(g, [[24, y], [24 + w, y + 20], [24 - w, y + 20]]); g.fill(); }
    g.fillStyle = shade(base, 0.25); poly(g, [[24, 6], [28, 14], [21, 14]]); g.fill();
    return;
  }
  const blobs: number[][] = [[24, 26, 16], [14, 32, 11], [34, 32, 11], [24, 16, 12]];
  for (const [x, y, r] of blobs) { g.fillStyle = shade(base, -0.28); g.beginPath(); g.arc(x, y + 2, r, 0, 7); g.fill(); }
  for (const [x, y, r] of blobs) { g.fillStyle = base; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  for (let i = 0; i < 5; i++) { g.fillStyle = shade(base, 0.25 + rng() * 0.1); g.beginPath(); g.arc(14 + rng() * 18, 12 + rng() * 16, 3 + rng() * 3, 0, 7); g.fill(); }
  if (v === 3) { g.fillStyle = '#e8503a'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(12 + rng() * 24, 16 + rng() * 20, 2.2, 0, 7); g.fill(); } }
}
function beltStraight(g: CanvasRenderingContext2D, col: string, ph: number) {
  // metal side frames in the tier colour, dark rubber belt with moving slats
  g.fillStyle = '#2a2d31'; g.fillRect(0, 4, 32, 24);
  const off = ph * 32;
  for (let k = -1; k < 5; k++) {
    const x = ((off + k * 8) % 32 + 32) % 32;
    g.fillStyle = '#44484e'; g.fillRect(x, 5, 3, 22);
    g.fillStyle = '#1c1e21'; g.fillRect(x + 3, 5, 1, 22);
  }
  g.globalAlpha = 0.28; g.strokeStyle = col; g.lineWidth = 2; g.lineCap = 'round';
  for (let k = -1; k < 3; k++) { const x = ((ph + k * 0.5) * 32); g.beginPath(); g.moveTo(x - 3, 11); g.lineTo(x + 2, 16); g.lineTo(x - 3, 21); g.stroke(); }
  g.globalAlpha = 1;
  for (const y of [0, 27]) {
    g.fillStyle = shade(col, -0.35); g.fillRect(0, y, 32, 5);
    g.fillStyle = col; g.fillRect(0, y, 32, 3);
    g.fillStyle = shade(col, 0.45); g.fillRect(0, y, 32, 1);
    g.fillStyle = 'rgba(0,0,0,.35)'; for (let x = 4; x < 32; x += 8) g.fillRect(x, y + 1, 2, 2);
  }
}
function beltCurve(g: CanvasRenderingContext2D, col: string, ph: number) {
  // enters from the west edge (moving east), exits the south edge (moving south); arc around (0,32)
  const arc = (r: number, w: number, st: string) => { g.strokeStyle = st; g.lineWidth = w; g.beginPath(); g.arc(0, 32, r, -Math.PI / 2, 0); g.stroke(); };
  arc(16, 24, '#2a2d31');
  for (let k = -1; k < 5; k++) {
    const t = ((ph + k * 0.25) % 1 + 1) % 1, a = -Math.PI / 2 + t * Math.PI / 2;
    g.save(); g.translate(0, 32); g.rotate(a);
    g.fillStyle = '#44484e'; g.fillRect(5, -1.5, 22, 3); g.fillStyle = '#1c1e21'; g.fillRect(5, 1.5, 22, 1);
    g.restore();
  }
  arc(2.5, 5, shade(col, -0.35)); arc(29.5, 5, shade(col, -0.35));
  arc(2, 3, col); arc(30, 3, col);
}
function tunnelSprite(g: CanvasRenderingContext2D, exit: boolean) {
  g.fillStyle = '#6a5a3a'; rrect(g, 2, 2, 28, 28, 5); g.fill();
  g.fillStyle = '#22262c'; g.fillRect(exit ? 16 : 0, 6, 16, 20);
  g.fillStyle = '#0a0c0f'; rrect(g, exit ? 6 : 12, 5, 14, 22, 6); g.fill();
  g.fillStyle = '#d6a13a'; poly(g, exit ? [[20, 11], [27, 16], [20, 21]] : [[4, 11], [11, 16], [4, 21]]); g.fill();
}
function treeSprite(g: CanvasRenderingContext2D, v: number) {
  const rng = mulberry32(v * 97 + 5);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(27, 30, 17, 13, 0, 0, 7); g.fill();
  const base = ['#2e5a2a', '#35642c', '#2a5236', '#3f6a2a'][v];
  for (let i = 0; i < 6; i++) {
    const x = 16 + rng() * 16, y = 14 + rng() * 16, r = 8 + rng() * 6;
    g.fillStyle = shade(base, -0.2 + i * 0.07); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.fillStyle = shade(base, 0.25); g.beginPath(); g.arc(20, 17, 4, 0, 7); g.fill();
}
function nodeSprite(g: CanvasRenderingContext2D, res: string) {
  const rng = mulberry32(res.length * 977 + res.charCodeAt(0));
  if (res === 'geyser') {
    g.fillStyle = 'rgba(0,0,0,.35)'; rrect(g, 5, 7, 57, 56, 16); g.fill();
    g.fillStyle = '#4a3a32'; rrect(g, 3, 3, 58, 58, 16); g.fill();
    circleAt(g, 32, 32, 20, '#2a1c16', '#6a4a3a', 3); circleAt(g, 32, 32, 12, '#c05030'); circleAt(g, 32, 32, 6, '#ffb070');
    return;
  }
  if (res === 'crude_oil') {
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(33, 35, 28, 24, 0, 0, 7); g.fill();
    g.fillStyle = '#1a1420'; g.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, r = 22 + rng() * 7; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.closePath(); g.fill();
    g.fillStyle = 'rgba(160,120,220,.25)'; g.beginPath(); g.ellipse(26, 26, 9, 5, -0.5, 0, 7); g.fill();
    return;
  }
  g.fillStyle = 'rgba(0,0,0,.35)'; rrect(g, 5, 7, 57, 56, 14); g.fill();
  g.fillStyle = '#2c2f35'; rrect(g, 3, 3, 58, 57, 14); g.fill(); g.strokeStyle = '#1a1c20'; g.lineWidth = 2; g.stroke();
  const col = ITEMS[res].c;
  for (let i = 0; i < 10; i++) {
    const x = 12 + rng() * 40, y = 12 + rng() * 40, r = 5 + rng() * 7, pts = [];
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + rng() * 0.5; pts.push([x + Math.cos(a) * r * (0.7 + rng() * 0.4), y + Math.sin(a) * r * (0.7 + rng() * 0.4)]); }
    poly(g, pts); g.fillStyle = shade(col, (rng() - 0.6) * 0.4); g.fill(); g.strokeStyle = shade(col, -0.55); g.lineWidth = 1.5; g.stroke();
    g.fillStyle = shade(col, 0.45); g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.22, 0, 7); g.fill();
  }
}

/** draw a little isometric block of a building into a 2D canvas (for UI icons) */
export function isoIcon(g: CanvasRenderingContext2D, type: string, S: number) {
  const d = BLD[type], ht = heightOf(type), w = d.w, h = d.h;
  const T = 0.64, Z = 0.72;
  const u = S / (w + h + 0.4) * 0.95;
  const Hp = ht * u * Z;
  const ox = S / 2 + (h - w) * u / 2, oy = (S - (w + h) * u * T - Hp) / 2 + Hp;
  const P = (x: number, y: number, z: number) => [ox + (x - y) * u, oy + (x + y) * u * T - z * u * Z];
  const face = (pts: number[][], col: string) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = col; g.fill(); };
  if (ht > 0.01) {
    face([P(w, 0, 0), P(w, h, 0), P(w, h, ht), P(w, 0, ht)], shade(d.col, -0.45));
    face([P(0, h, 0), P(w, h, 0), P(w, h, ht), P(0, h, ht)], shade(d.col, -0.25));
  }
  const base = document.createElement('canvas'); base.width = w * PPT; base.height = h * PPT;
  drawBuildingBase(base.getContext('2d')!, type, w * PPT, h * PPT);
  const [ex, ey] = P(0, 0, ht);
  g.save(); g.setTransform(u / PPT, u * T / PPT, -u / PPT, u * T / PPT, ex, ey); g.drawImage(base, 0, 0); g.restore();
}

// DOM icon cache (for UI)
export const ICONURL: Record<string, string> = Object.create(null);
export function itemIconURL(k: string) {
  if (!ICONURL[k]) { const c = document.createElement('canvas'); c.width = c.height = 48; drawItem(c.getContext('2d')!, k, 48); ICONURL[k] = c.toDataURL(); }
  return ICONURL[k];
}
const BICON: Record<string, string> = Object.create(null);
export const iconHooks = { building: null as null | ((t: string) => string | null) };
export function buildingIconURL(type: string) {
  if (BICON[type]) return BICON[type];
  if (iconHooks.building) { const u = iconHooks.building(type); if (u) return BICON[type] = u; }
  const d = BLD[type];
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d')!;
  if (d.kind === 'belt' || d.kind === 'tunnel' || d.kind === 'rail' || d.kind === 'pipe' || d.kind === 'ptunnel' || d.kind === 'train' || d.kind === 'wagon') {
    g.translate(16, 16); g.scale(2, 2);
    if (d.kind === 'belt') beltStraight(g, d.col, 0.25);
    else if (d.kind === 'tunnel') tunnelSprite(g, false);
    else if (d.kind === 'rail') { g.fillStyle = '#6a4e36'; for (let x = 2; x < 32; x += 8) g.fillRect(x, 5, 4, 22); g.fillStyle = '#c9ccd2'; g.fillRect(0, 9, 32, 3); g.fillRect(0, 20, 32, 3); }
    else if (d.kind === 'pipe') { g.fillStyle = '#3a4450'; g.fillRect(0, 8, 32, 16); g.fillStyle = d.col; g.fillRect(0, 10, 32, 12); g.fillStyle = '#e0e8f0'; g.fillRect(0, 11, 32, 3); }
    else if (d.kind === 'ptunnel') { circleAt(g, 16, 16, 12, '#2a3038', '#8a9aa8', 3); circleAt(g, 16, 16, 6, '#0c0f12'); }
    else { g.translate(0, 2); rrect(g, 0, 0, 32, 28, 6); g.fillStyle = '#d0503a'; g.fill(); g.fillStyle = '#2a3440'; rrect(g, 20, 5, 8, 16, 2); g.fill(); }
  } else {
    isoIcon(g, type, 96);
  }
  return BICON[type] = c.toDataURL();
}
