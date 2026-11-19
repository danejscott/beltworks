// Dev test: pipework shapes — a water extractor feeding a pipe run with a corner, a T, a cross, a dead end, and a
// stretch over water. Leaves the camera on it.
export async function run() {
  const BW = window.BW, G = BW.G, W = BW.TER.W, P = await import('/tools/pt.js');
  const h = [...G.ents.values()].find(e => e.type === 'hub');
  // a lake shore with open land next to it
  let spot = null;
  for (let r = 10; r < 300 && !spot; r += 2) for (let k = 0; k < 48 && !spot; k++) {
    const x = Math.round(h.x + Math.cos(k / 48 * 6.283) * r), y = Math.round(h.y + Math.sin(k / 48 * 6.283) * r);
    if (!BW.W.canPlace('water_extractor', x, y, 0, {}) && P.findArea(16, 14, x + 9, y, 0, 3)) spot = { x, y };
  }
  if (!spot) return 'no shore';
  const WX = P.put('water_extractor', spot.x, spot.y, 0);
  const lay = (path) => BW.CMD.run({ k: 'drag', type: 'pipe1', z: 0, path });
  const x0 = spot.x + 2, y0 = spot.y;
  // east 8, then south 6 (corner), with a T branch north at +4 and a cross at +6
  const p = []; for (let i = 0; i <= 8; i++) p.push([x0 + i, y0, 0]); lay(p);
  const q = []; for (let j = 1; j <= 6; j++) q.push([x0 + 8, y0 + j, 1]); lay(q);
  const t = []; for (let j = 1; j <= 3; j++) t.push([x0 + 4, y0 - j, 3]); lay(t);                  // T branch (dead end)
  const c1 = []; for (let j = 1; j <= 2; j++) c1.push([x0 + 6, y0 - j, 3]); lay(c1);
  const c2 = []; for (let j = 1; j <= 2; j++) c2.push([x0 + 6, y0 + j, 1]); lay(c2);               // cross at x0+6
  G.dirty.fluid = true; P.sim(3);
  BW.view.cam.x = x0 + 4; BW.view.cam.y = y0 + 2; BW.view.cam.s = 40;
  return ['ok', WX && WX.st, P.log.join('|')];
}
