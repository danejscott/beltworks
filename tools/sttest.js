// Dev test: two platform stations, Quick Route, a train carrying plates from one to the other.
export async function run() {
  const BW = window.BW, G = BW.G;
  if (G.ents.size < 2 || G.S.name === 'Backdrop') {
    const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Play') && b.parentElement.parentElement.textContent.includes('Misty Outpost'));
    if (!b) return 'no test world';
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click();
    for (let i = 0; i < 40 && G.S.name !== 'Misty Outpost'; i++) await new Promise(r => setTimeout(r, 250));
  }
  const P = await import('/tools/pt.js');
  for (const e of [...G.ents.values()]) if (e.type !== 'hub') BW.W.remove(e, { quiet: true });
  G.trains.length = 0; G.S.lines = [];
  const h = [...G.ents.values()].find(e => e.type === 'hub'); P.log.length = 0;
  const a1 = P.findArea(30, 30, h.x + 40, h.y, 0, 120), a2 = P.findArea(30, 30, h.x - 30, h.y + 50, 0, 150);
  const A = P.put('station', a1.x + 13, a1.y + 13, 0), B = P.put('station', a2.x + 13, a2.y + 13, 1);
  const plat = s => BW.W.platformTiles(s).map(([x, y]) => { const e = BW.W.entAt(x, y); return e ? e.type + ':' + e.pairs : '-'; }).join(',');
  const sA = P.put('storage', A.x - 4, A.y, 0); sA.store = { iron_plate: 500 }; sA.tot = 500;
  const k1 = P.connect(P.outP(sA), P.inP(A), 'belt4');
  const sB = P.put('storage', B.x + 1, B.y - 5, 1);
  const k2 = P.connect(P.outP(B), P.inP(sB), 'belt4');
  P.poles(A.x - 6, A.y - 4, A.x + 6, A.y + 6, 8); P.poles(B.x - 4, B.y - 8, B.x + 6, B.y + 5, 8);
  BW.CMD.run({ k: 'mode', id: B.id, m: 'unload' }); BW.CMD.run({ k: 'mode', id: A.id, m: 'load' });
  const err = BW.TR.buildRoute(A, B, true);
  const t = G.trains[G.trains.length - 1], log = [];
  for (let i = 0; i < 10 && t; i++) { P.sim(15); log.push(t.state + ' t' + t.tot + ' A' + A.tot + ' B' + B.tot + ' sB' + (sB.tot || 0)); }
  window.ST = { A, B, sA, sB };
  return [plat(A), plat(B), 'belts ' + k1 + ',' + k2, 'route ' + err, log.join(' / '), P.log.join('|')];
}
