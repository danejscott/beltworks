// Dev test: wye junctions (branch + join), smoothing a jagged stretch, and two-way routing through a wye.
export async function run() {
  const BW = window.BW, G = BW.G, W = BW.TER.W, P = await import('/tools/pt.js');
  const RP = await import(performance.getEntriesByType('resource').map(r => r.name).find(n => n.includes('/src/railplan.ts')) || '/src/railplan.ts');
  const h = [...G.ents.values()].find(e => e.type === 'hub');
  const a = P.findArea(90, 60, h.x - 120, h.y - 90, 0, 260);
  if (!a) return 'no room';
  const ax = (a.x + 6) & ~1, ay = (a.y + 20) & ~1;
  const lay = plan => { if (plan.ok) BW.CMD.run({ k: 'rails', tiles: plan.tiles.map(q => [q.x, q.y, q.p]), junc: plan.junc.map(q => [q.x, q.y, q.p]) }); return plan.ok ? `ok new ${plan.tiles.length} (wye ${plan.tiles.filter(t => t.w).length}) joins ${plan.junc.length}` : 'FAIL ' + plan.why; };
  const out = [];
  out.push('line ' + lay(RP.planRail(ax, ay, ax + 70, ay)));
  out.push('branch ' + lay(RP.planRail(ax + 30, ay, ax + 34, ay + 30)));          // branch off the middle heading south
  out.push('join ' + lay(RP.planRail(ax + 50, ay - 30, ax + 56, ay)));            // come down from the north onto the line
  // routing: from the far west of the line heading east, can a train reach the branch's far end? and from the east heading west?
  const TRm = BW.TR;
  // a jagged stretch: hand-laid zigzag (90° corners every block), then smooth it
  const zx = ax, zy = ay + 44, tiles = [];
  const pb = (a2, b2) => BW.W.pairBit(a2, b2);
  // east 3, then a staircase NE of single-block steps, then east 3
  let x = zx, y = zy; tiles.push([x, y, pb(2, 0)]); x += 2; tiles.push([x, y, pb(2, 0)]); x += 2;
  for (let k = 0; k < 4; k++) { tiles.push([x, y, pb(2, 3)]); y -= 2; tiles.push([x, y, pb(1, 0)]); x += 2; }
  tiles.push([x, y, pb(2, 0)]); x += 2; tiles.push([x, y, pb(2, 0)]); x += 2; tiles.push([x, y, pb(2, 0)]);
  BW.CMD.run({ k: 'rails', tiles, junc: [] });
  const sm = RP.planSmooth(zx + 2, zy, x - 2, y);
  out.push('smooth plan ' + (sm.why !== undefined ? 'why: ' + sm.why : `remove ${sm.remove.length} lay ${sm.plan.tiles.length}`));
  if (sm.plan) BW.CMD.run({ k: 'railsmooth', ax: zx + 2, ay: zy, bx: x - 2, by: y });
  window.WT = { ax, ay, zx, zy };
  BW.view.cam.x = ax + 34; BW.view.cam.y = ay + 6;
  return out;
}
