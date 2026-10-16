// Dev test: a new (11 x 5) harbor on a shore with two ships, then point the camera at it.
export async function run() {
  const BW = window.BW, G = BW.G, W = BW.TER.W;
  if (G.S.name !== 'Misty Outpost') {
    const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Play') && b.parentElement.parentElement.textContent.includes('Misty Outpost'));
    if (!b) return 'no test world';
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click();
    for (let i = 0; i < 40 && G.S.name !== 'Misty Outpost'; i++) await new Promise(r => setTimeout(r, 250));
  }
  const P = await import('/tools/pt.js');
  const h = [...G.ents.values()].find(e => e.type === 'hub');
  // find a spot where a harbor fits: try every rotation around rings from the HUB
  let H = null;
  for (let r = 20; r < 300 && !H; r += 3) for (let k = 0; k < 48 && !H; k++) {
    const x = Math.round(h.x + Math.cos(k / 48 * 6.283) * r), y = Math.round(h.y + Math.sin(k / 48 * 6.283) * r);
    for (let rot = 0; rot < 4 && !H; rot++) if (!BW.W.canPlace('harbor', x, y, rot, { free: true })) H = P.put('harbor', x, y, rot);
  }
  if (!H) return 'no shore spot';
  // a second harbor further along the coast for the ships to sail to
  let H2 = null;
  for (let r = 30; r < 300 && !H2; r += 3) for (let k = 0; k < 48 && !H2; k++) {
    const x = Math.round(H.x + Math.cos(k / 48 * 6.283) * r), y = Math.round(H.y + Math.sin(k / 48 * 6.283) * r);
    for (let rot = 0; rot < 4 && !H2; rot++) if (!BW.W.canPlace('harbor', x, y, rot, { free: true })) H2 = P.put('harbor', x, y, rot);
  }
  H.store = { iron_plate: 3000 }; H.tot = 3000;
  const T = (cx, cy) => { const a = P.findArea(2, 2, cx, cy, 2, 14); return a && P.put('tower', a.x, a.y, 0); };
  for (const e of [H, H2]) if (e) for (let f = 0; f <= 1; f += 0.25) T(Math.round(h.x + (e.x - h.x) * f), Math.round(h.y + (e.y - h.y) * f));
  G.dirty.power = true;
  const errs = [];
  if (H2) for (let i = 0; i < 2; i++) { BW.CMD.run({ k: 'buyship', id: H.id, to: H2.id }); }
  BW.CMD.run({ k: 'mode', id: H2 ? H2.id : H.id, m: 'unload' });
  P.sim(40);
  window.HT = { H, H2 };
  return [H.x - h.x, H.y - h.y, H.rot, H.w + 'x' + H.h, H.big, H2 && H2.w, G.ships.length, G.ships.map(s => s.state).join(','), P.log.join('|')];
}
