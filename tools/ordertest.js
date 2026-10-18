// Dev test: per-train orders (drop off ingots + pick up rods at A, drop everything at B) and the rail planner joining
// two offset fragments. Run inside a loaded world.
export async function run() {
  const BW = window.BW, G = BW.G, W = BW.TER.W, P = await import('/tools/pt.js');
  const out = [];
  // ---- orders: reuse the stations / loop from sttest
  const st = [...G.ents.values()].filter(e => e.type === 'station');
  const t = G.trains[0];
  if (st.length >= 2 && t) {
    const [A, B] = t.sched.map(id => G.ents.get(id));
    A.mode = 'both'; A.store = { iron_rod: 300 }; A.tot = 300; A.drop = {}; A.dtot = 0;
    B.mode = 'unload'; B.store = {}; B.tot = 0;
    t.cargo = { iron_ingot: 100 }; t.tot = 100;
    const ia = t.sched.indexOf(A.id), ib = t.sched.indexOf(B.id);
    BW.CMD.run({ k: 'torder', t: t.id, i: ia, w: 'u', v: ['iron_ingot'] });
    BW.CMD.run({ k: 'torder', t: t.id, i: ia, w: 'l', v: ['iron_rod'] });
    BW.CMD.run({ k: 'torder', t: t.id, i: ib, w: 'u', v: ['*'] });
    BW.CMD.run({ k: 'torder', t: t.id, i: ib, w: 'l', v: [] });
    t.si = ia; t.state = 'idle'; t.waitT = 99;
    const log = [];
    for (let k = 0; k < 16; k++) { P.sim(10); log.push(`${t.state[0]}@${t.sched[t.si] === A.id ? 'A' : 'B'} ${JSON.stringify(t.cargo)} Adrop${JSON.stringify(A.drop)} Arod${A.store.iron_rod || 0} B${JSON.stringify(B.store)}`); }
    out.push('orders ' + JSON.stringify(t.orders), log.filter((l, i) => i % 3 === 0 || i === log.length - 1).join(' || '));
  } else out.push('no stations/train');
  // ---- planner: two straight fragments, offset sideways, joined end to end
  const h = [...G.ents.values()].find(e => e.type === 'hub');
  const a = P.findArea(80, 30, h.x - 120, h.y + 60, 0, 220);
  if (a) {
    const ax = (a.x + 4) & ~1, ay = (a.y + 6) & ~1;
    const pieces = (x0, y0, n) => { const tiles = []; for (let k = 0; k < n; k++) tiles.push([x0 + k * 2, y0, BW.W.pairBit(0, 2)]); BW.CMD.run({ k: 'rails', tiles, junc: [] }); };
    pieces(ax, ay, 6);             // fragment 1: blocks ax .. ax+10
    pieces(ax + 34, ay + 10, 6);   // fragment 2: further east, 10 tiles (5 blocks) south
    // drag from just past fragment 1's east end (start snapping) to near fragment 2's west end (end snapping)
    const p = BW.PL ? null : null;
    const RP = await import(performance.getEntriesByType('resource').map(r => r.name).find(n => n.includes('/src/railplan.ts')) || '/src/railplan.ts');
    const plan = RP.planRail(ax + 13, ay + 1, ax + 32, ay + 11);
    out.push('plan ok ' + plan.ok + ' ' + (plan.why || '') + ' pieces ' + plan.tiles.length + ' snap ' + JSON.stringify(plan.snapEnd));
    if (plan.ok) BW.CMD.run({ k: 'rails', tiles: plan.tiles.map(q => [q.x, q.y, q.p]), junc: plan.junc.map(q => [q.x, q.y, q.p]) });
    BW.view.cam.x = ax + 22; BW.view.cam.y = ay + 6; BW.view.cam.s = 18;
    window.PT = { ax, ay };
  }
  return out;
}
