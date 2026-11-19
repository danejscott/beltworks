// Dev test: two stations + a Quick Route loop with a train, a branch (wye) off the loop, then the signal assistant.
export async function run() {
  const BW = window.BW, G = BW.G, W = BW.TER.W, P = await import('/tools/pt.js');
  const RP = await import(performance.getEntriesByType('resource').map(r => r.name).find(n => n.includes('/src/railplan.ts')) || '/src/railplan.ts');
  const h = [...G.ents.values()].find(e => e.type === 'hub');
  const a1 = P.findArea(40, 40, h.x + 70, h.y - 40, 0, 220), a2 = P.findArea(40, 40, h.x - 40, h.y + 70, 0, 260);
  const A = P.put('station', a1.x + 10, a1.y + 8, 0), B = P.put('station', a2.x + 10, a2.y + 8, 1);
  const err = BW.TR.buildRoute(A, B, true);
  const line = G.S.lines[G.S.lines.length - 1];
  // branch off a straight stretch of the loop
  let br = 'none';
  if (line) {
    for (let k = 10; k < line.cells.length - 10 && br === 'none'; k++) {
      const c = line.cells[k], x = c % W, y = Math.floor(c / W);
      const r = BW.W.railAt(c); if (!r || (r.pairs !== 1 && r.pairs !== 2)) continue;
      const tx = r.pairs === 1 ? x + 4 : x + 30, ty = r.pairs === 1 ? y + 30 : y + 4;
      const p = RP.planRail(x, y, tx, ty);
      if (p.ok) { BW.CMD.run({ k: 'rails', tiles: p.tiles.map(q => [q.x, q.y, q.p]), junc: p.junc.map(q => [q.x, q.y, q.p]) }); br = 'ok ' + p.tiles.length; }
    }
  }
  const c0 = line.cells[0];
  BW.CMD.run({ k: 'signal', x: c0 % W, y: Math.floor(c0 / W), sig: 3, type: 'signal_auto' });
  let heads = 0, path = 0;
  for (const r of G.L.rails || []) { if (!r.sg) continue; for (let d = 0; d < 4; d++) { const t = (r.sg >> (2 * d)) & 3; if (t) heads++; if (t === 2) path++; } }
  const rep = BW.TR.signalReport();
  const errs = [...rep.report.values()].filter(b => b.errors.length).map(b => b.errors[0]);
  window.SG = { A, B, line };
  return ['route ' + err, 'branch ' + br, 'heads ' + heads + ' (path ' + path + ')', 'errors ' + JSON.stringify(errs.slice(0, 4)), 'sigErr ' + rep.sigErrors.size];
}
