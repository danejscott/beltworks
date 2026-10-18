// Dev test: rail planner over existing track (start mid-line, run along it, cross it, join it) + crossing highlights.
export async function run() {
  const BW = window.BW, G = BW.G, P = await import('/tools/pt.js');
  const RP = await import(performance.getEntriesByType('resource').map(r => r.name).find(n => n.includes('/src/railplan.ts')) || '/src/railplan.ts');
  const h = [...G.ents.values()].find(e => e.type === 'hub');
  const a = P.findArea(70, 50, h.x + 120, h.y - 80, 0, 260);
  if (!a) return 'no room';
  const ax = (a.x + 4) & ~1, ay = (a.y + 20) & ~1;
  const lay = plan => { if (plan.ok) BW.CMD.run({ k: 'rails', tiles: plan.tiles.map(q => [q.x, q.y, q.p]), junc: plan.junc.map(q => [q.x, q.y, q.p]) }); return plan.ok ? `ok new ${plan.tiles.length} joins ${plan.junc.length}` : 'FAIL ' + plan.why; };
  const out = [];
  // a straight east-west line
  out.push('line ' + lay(RP.planRail(ax, ay, ax + 40, ay)));
  // a north-south line across it (level crossing)
  out.push('cross ' + lay(RP.planRail(ax + 20, ay - 16, ax + 20, ay + 16)));
  // branch off from the middle of the first line, heading south-east
  out.push('branch ' + lay(RP.planRail(ax + 8, ay, ax + 30, ay + 22)));
  // start on the line, run along it and carry on past its end
  out.push('extend ' + lay(RP.planRail(ax + 30, ay, ax + 60, ay)));
  BW.view.cam.x = ax + 22; BW.view.cam.y = ay + 2; BW.view.cam.s = 14;
  BW.INP.selectType('rail');
  window.CT = { ax, ay };
  return out;
}
