// Dev test: an offshore harbor (open water around it), concrete slabs back to the shore, a truck station on the slabs,
// a pole on a pile, and the new pumps. Leaves the camera on the harbor.
export async function run() {
  const BW = window.BW, G = BW.G, W = BW.TER.W, P = await import('/tools/pt.js');
  const h = [...G.ents.values()].find(e => e.type === 'hub');
  P.log.length = 0;
  // a harbor spot: every rotation, rings out from the HUB, nearest first
  let H = null;
  for (let r = 10; r < 420 && !H; r += 3) for (let k = 0; k < 64 && !H; k++) {
    const x = Math.round(h.x + Math.cos(k / 64 * 6.283) * r), y = Math.round(h.y + Math.sin(k / 64 * 6.283) * r);
    for (let rot = 0; rot < 4 && !H; rot++) if (!BW.W.canPlace('harbor', x, y, rot, {})) H = P.put('harbor', x, y, rot);
  }
  if (!H) return 'no open water spot';
  // slabs: from the land end straight back until we reach land (at most 30 tiles)
  const back = BW.W.pierBack(H), dir = (H.rot + 2) & 3, DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  let len = 0;
  for (let k = 0; k < 30; k++) { const [x, y] = back[0]; const tx = x + DX[dir] * k, ty = y + DY[dir] * k; if (!BW.TER.isWater(G.tiles[ty * W + tx])) break; len = k + 1; }
  const [bx0, by0] = back[0], [bx1, by1] = back[back.length - 1];
  const ex = bx0 + DX[dir] * (len - 1), ey = by0 + DY[dir] * (len - 1);
  BW.CMD.run({ k: 'slabs', x0: Math.min(bx0, bx1, ex), y0: Math.min(by0, by1, ey), x1: Math.max(bx0, bx1, ex), y1: Math.max(by0, by1, ey) });
  const slabs = G.slabs.size;
  // a pole out on the water next to the pier
  const side = (H.rot + 1) & 3, px = H.x + (H.rot & 1 ? -2 : 4), py = H.y + (H.rot & 1 ? 4 : -2);
  const pole = P.put('pole2', px, py);
  // a water extractor and an oil extractor near the HUB for a look
  let wx = null; for (let r = 4; r < 200 && !wx; r += 2) for (let k = 0; k < 32 && !wx; k++) { const x = Math.round(h.x + Math.cos(k / 32 * 6.283) * r), y = Math.round(h.y + Math.sin(k / 32 * 6.283) * r); if (!BW.W.canPlace('water_extractor', x, y, 0, {})) wx = P.put('water_extractor', x, y, 0); }
  const oilN = G.nodes.filter(n => n.res === 'crude_oil' && !G.grid[n.y * W + n.x]).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
  const ox = oilN ? P.put('oil_extractor', oilN.x, oilN.y, 0) : null;
  window.HB = { H, pole, wx, ox };
  const V = await import(performance.getEntriesByType('resource').map(r => r.name).find(n => n.includes('/src/view.ts')));
  Object.assign(V.view.cam, { x: H.x + H.w / 2, y: H.y + H.h / 2, s: 22 });
  return [H.x - h.x, H.y - h.y, H.rot, H.w + 'x' + H.h, 'slab run ' + len, 'slabs ' + slabs, 'pole ' + !!pole, 'wx ' + !!wx, 'oil ' + !!ox, P.log.join('|')];
}
