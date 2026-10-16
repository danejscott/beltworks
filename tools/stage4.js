// Playthrough: overclock helper and a batch of final-assembly blocks around the Space Elevator.
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
export function overclock(e) {
  const C = window.BW.CMD;
  for (let i = 0; i < 3; i++) C.run({ k: 'shard', id: e.id, n: 1 });
  C.run({ k: 'set', id: e.id, f: 'clock', v: 1 + 0.5 * (e.shards || 0) });
  return e.clock;
}
/** free merger side ports next to the elevator: belts entering it are turned into mergers (2 extra inputs each) */
function mergePorts(P, ELV) {
  const { G, TER, CMD } = window.BW, W = TER.W, out = [];
  for (let k = 0; k < 5; k++) for (const [x, y, d] of [[ELV.x + k, ELV.y - 1, 1], [ELV.x + k, ELV.y + 5, 3], [ELV.x - 1, ELV.y + k, 0], [ELV.x + 5, ELV.y + k, 2]]) {
    const id = G.grid[y * W + x], e = id && G.ents.get(id);
    if (!e) continue;
    if (e.type.startsWith('belt') && e.rot === d) { CMD.run({ k: 'rm', id: e.id }); if (!P.put('merger', x, y, d)) continue; }
    else if (e.type !== 'merger' || e.rot !== d) continue;
    for (const s of [(d + 3) & 3, (d + 1) & 3]) { const px = x + DX[s], py = y + DY[s]; if (P.tileOK(px, py)) out.push([px, py, (s + 2) & 3]); }
  }
  return out;
}
/** belt tiles near (x, y) whose line runs into the elevator: candidates for a mid-line merger */
function feedTiles(P, ELV, x, y, R = 45) {
  const { G } = window.BW, out = [];
  const inE = (bx, by) => bx >= ELV.x && bx < ELV.x + 5 && by >= ELV.y && by < ELV.y + 5;
  for (const e of G.ents.values()) {
    if (!e.type.startsWith('belt') || Math.abs(e.x - x) > R || Math.abs(e.y - y) > R) continue;
    let bx = e.x, by = e.y, ok = false;
    for (let k = 0; k < 300; k++) {
      const id = G.grid[by * window.BW.TER.W + bx], b = id && G.ents.get(id);
      if (!b) { ok = false; break; }
      if (b.id === ELV.id) { ok = true; break; }
      if (!(b.type.startsWith('belt') || b.type === 'merger')) break;
      bx += DX[b.rot]; by += DY[b.rot];
      if (inE(bx, by)) { ok = true; break; }
    }
    if (!ok) continue;
    for (const s of [(e.rot + 3) & 3, (e.rot + 1) & 3]) { const px = e.x + DX[s], py = e.y + DY[s]; if (P.tileOK(px, py)) out.push({ e, port: [px, py, (s + 2) & 3], d: Math.hypot(e.x - x, e.y - y) }); }
  }
  return out.sort((a, b) => a.d - b.d);
}
export function mergeInto(P, ELV, M, R = 45, N = 8) {
  const { CMD } = window.BW;
  for (const c of feedTiles(P, ELV, M.x, M.y, R).slice(0, N)) {
    const { e, port } = c, x = e.x, y = e.y, r = e.rot, type = e.type;
    CMD.run({ k: 'rm', id: e.id });
    if (!P.put('merger', x, y, r)) { P.belts([[x, y, r]], type); continue; }
    const k = P.connect(P.outP(M), port, 'belt4');
    if (k) return 'mid' + k;
    CMD.run({ k: 'rm', id: window.BW.W.entAt(x, y, 0).id }); P.belts([[x, y, r]], type);
  }
  return 'X';
}
/** refill a block's depots for n more crafts (depots matched to the input port their belt ends at) */
export function refill(P, S3, m, n) {
  const { G, TER, DATA } = window.BW, W = TER.W, r = DATA.RECIPES[m.recipe];
  const keys = Object.keys(r.in).filter(k => !DATA.ITEMS[k].fluid);
  const ins = S3.inputTiles(P, m);
  const end = d => { let [x, y] = P.outP(d), px = x, py = y; for (let k = 0; k < 300; k++) { const id = G.grid[y * W + x], e = id && G.ents.get(id); if (!e || e.id === m.id) return [px, py]; px = x; py = y; if (e.type === 'tunnel' && e.pair && !e.isExit) { const q = G.ents.get(e.pair); x = q.x; y = q.y; continue; } x += DX[e.rot]; y += DY[e.rot]; } return [0, 0]; };
  const out = [];
  for (const d of [...G.ents.values()].filter(d => d.type === 'storage' && Math.abs(d.x - m.x) < 14 && Math.abs(d.y - m.y) < 14)) {
    const [ex, ey] = end(d), i = ins.findIndex(p => p[0] === ex && p[1] === ey);
    // which item: the block put ingredient i on port i (see stage3.block)
    const depKeys = Object.keys(m.ib || {});
    if (i < 0) continue;
    const k = BLOCK_ORDER[m.recipe] ? BLOCK_ORDER[m.recipe][i] : keys[i];
    if (!k) continue;
    d.store = { [k]: r.in[k] * n }; d.tot = r.in[k] * n; out.push(k);
  }
  return out;
}
// ingredient order each block was built with (= port order)
const BLOCK_ORDER = {
  turbo_motor: ['cooling_system', 'radio_control_unit', 'motor', 'rubber'],
  quantum_core: ['cooling_system', 'crystal_oscillator', 'alclad_sheet'],
  assembly_director: ['adaptive_control_unit', 'supercomputer'],
  supercomputer: ['plastic', 'computer', 'ai_limiter', 'high_speed_connector'],
};
/** build blocks: list of [machine, recipe, depots]; returns a summary per block */
export function blocks(P, S3, ELV, list) {
  const out = [];
  for (const [m, r, dep] of list) {
    const b = S3.block(P, m, r, dep, [ELV.x + 2, ELV.y + 2], ELV);
    if (b.M) overclock(b.M);
    if (b.M && b.out === 'X') {
      const ports = mergePorts(P, ELV).sort((a, c) => Math.hypot(a[0] - b.M.x, a[1] - b.M.y) - Math.hypot(c[0] - b.M.x, c[1] - b.M.y));
      for (const p of ports.slice(0, 6)) { const k = P.connect(P.outP(b.M), p, 'belt4'); if (k) { b.out = 'm' + k; break; } }
    }
    if (b.M && b.out === 'X') b.out = mergeInto(P, ELV, b.M);
    out.push(r + ' ' + (b.err || (b.res.join(',') + ' out:' + b.out)));
  }
  return out;
}
