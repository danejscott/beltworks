// Playthrough stages 3-4: final-assembly blocks around the Space Elevator. Each block is one real machine; every
// ingredient comes from its own depot (a storage) on its own belt into a different input tile (back / sides), and
// the product is belted straight into the elevator.
export function inputTiles(P, e) {
  // back middle, then side middles, then the other tiles along the sides
  const BW = window.BW, r = e.rot, w = e.w, h = e.h, out = [P.inP(e), P.sideP(e, 'L'), P.sideP(e, 'R')];
  for (const s of [(r + 3) & 3, (r + 1) & 3]) for (let k = 0; k < (s & 1 ? w : h); k++) {
    const x = s === 0 ? e.x + w : s === 2 ? e.x - 1 : e.x + k, y = s === 1 ? e.y + h : s === 3 ? e.y - 1 : e.y + k;
    if (!out.some(q => q[0] === x && q[1] === y)) out.push([x, y, (s + 2) & 3]);
  }
  return out;
}
/** tiles next to the elevator a belt can come in on: [x, y, dir into the elevator] */
export function elevatorDoors(P, el) {
  const out = [];
  for (let k = 0; k < 5; k++) {
    out.push([el.x + k, el.y - 1, 1], [el.x + k, el.y + 5, 3], [el.x - 1, el.y + k, 0], [el.x + 5, el.y + k, 2]);
  }
  return out.filter(([x, y]) => P.tileOK(x, y));
}
/**
 * One final-assembly block. machine = building type, recipe, depots = { item: amount }, near = where to look for room,
 * into = the elevator (or any building) to deliver to.
 */
export function block(P, machine, recipe, depots, near, into) {
  const BW = window.BW, D = BW.DATA.BLD[machine];
  const items = Object.keys(depots);
  const span = D.w + 14;
  const a = P.findArea(span, span, near[0], near[1], 6, 140);
  if (!a) return { err: 'no room' };
  const mx = a.x + 7, my = a.y + 7;
  const M = P.put(machine, mx, my, 0, { recipe });
  if (!M) return { err: 'machine' };
  const ins = inputTiles(P, M);
  const res = [];
  items.forEach((it, i) => {
    const port = ins[i];
    // a depot a few tiles out from that input
    const dir = port[2], bx = port[0] - [1, 0, -1, 0][dir] * 4, by = port[1] - [0, 1, 0, -1][dir] * 4;
    let dep = null;
    for (let r = 0; r < 6 && !dep; r++) for (let j = -r; j <= r && !dep; j++) for (let k = -r; k <= r && !dep; k++) {
      const x = bx + k - 1, y = by + j - 1;
      if (P.areaOK(x, y, 2, 2) && P.areaOK(x - 1, y - 1, 4, 4)) dep = P.put('storage', x, y, dir);
    }
    if (!dep) { res.push(it + ':no depot'); return; }
    dep.store = { [it]: depots[it] }; dep.tot = depots[it]; dep.depot = 1;
    const k = P.connect(P.outP(dep), port, 'belt4');
    res.push(it + ':' + (k || 'X'));
  });
  let out = 'X';
  if (into) for (const door of elevatorDoors(P, into)) { const k = P.connect(P.outP(M), door, 'belt4'); if (k) { out = k; break; } }
  P.poles(a.x - 2, a.y - 2, a.x + span + 2, a.y + span + 2, 8);
  return { M, res, out };
}
