// Playthrough stage 2: the steel complex (steel beams/pipes, plates/rods/screws, reinforced plates, modular frames,
// versatile frameworks; copper wire/cable, stators, automated wiring). Machines first, then belts.
export async function build(P) {
  const BW = window.BW, G = BW.G, W = BW.TER.W;
  const hub = [...G.ents.values()].find(e => e.type === 'hub');
  const c = [hub.x - 97, hub.y - 88];
  const area = P.findArea(56, 34, c[0] + 14, c[1] + 12, 0, 60);
  const ax = area.x, ay = area.y;
  const pl = (t, dx, dy, rot, o) => P.put(t, ax + dx, ay + dy, rot || 0, o);
  const coalN = P.nodesOf('coal', c[0], c[1], 3)[0], ironN = P.nodesOf('iron_ore', c[0] + 27, c[1] + 2, 3)[0], cuN = P.nodesOf('copper_ore', c[0] + 43, c[1] - 18, 3)[0];
  const S = {};
  S.MC = P.put('miner3', coalN.x, coalN.y, 3); S.MI = P.put('miner3', ironN.x, ironN.y, 2); S.MCU = P.put('miner3', cuN.x, cuN.y, 2);
  S.F1 = pl('foundry', 14, 8, 0, { recipe: 'steel_ingot' }); S.SPL1 = pl('splitter', 20, 9, 0); S.BEAM = pl('constructor', 25, 4, 0, { recipe: 'steel_beam' }); S.PIPE = pl('constructor', 25, 13, 0, { recipe: 'steel_pipe' });
  S.SPI = pl('splitter', 8, 18, 0); S.SM = pl('smelter', 12, 22, 0, { recipe: 'iron_ingot' }); S.SPS = pl('splitter', 17, 22, 0);
  S.PLATE = pl('constructor', 21, 18, 0, { recipe: 'iron_plate' }); S.ROD = pl('constructor', 21, 26, 0, { recipe: 'iron_rod' }); S.SPR = pl('splitter', 26, 26, 0); S.SCREW = pl('constructor', 29, 30, 0, { recipe: 'screw' });
  S.RP = pl('assembler', 31, 18, 0, { recipe: 'reinforced_plate' }); S.MF = pl('assembler', 39, 20, 0, { recipe: 'modular_frame' }); S.VF = pl('assembler', 47, 6, 0, { recipe: 'versatile_framework' });
  S.CUS = pl('smelter', 44, 28, 0, { recipe: 'copper_ingot' }); S.SPW = pl('splitter', 49, 28, 0); S.WIRE = pl('constructor', 52, 24, 0, { recipe: 'wire' }); S.WIRE2 = pl('constructor', 52, 31, 0, { recipe: 'wire' }); S.CABLE = pl('constructor', 58, 31, 0, { recipe: 'cable' });
  S.STAT = pl('assembler', 33, 11, 0, { recipe: 'stator' }); S.AW = pl('assembler', 44, 13, 0, { recipe: 'automated_wiring' });
  return { S, ax, ay, res: wire(P, S, false) };
}
/** lay (or re-lay) the steel complex's belts. With repair = true, only connections whose input end has no belt yet. */
export function wire(P, S, repair = true) {
  const BW = window.BW, W = BW.TER.W, G = BW.G;
  // reserve every port tile so belts route around them
  const K = (x, y) => y * W + x, ports = new Set();
  const add = p => p && ports.add(K(p[0], p[1]));
  for (const e of Object.values(S)) {
    if (!e) continue; const d = BW.DATA.BLD[e.type];
    if (d.kind === 'splitter') { for (let s = 0; s < 4; s++) add([e.x + [1, 0, -1, 0][s], e.y + [0, 1, 0, -1][s]]); continue; }
    add(P.outP(e)); if (d.kind !== 'miner') add(P.inP(e));
    if (d.kind === 'machine' && e.recipe && Object.keys(BW.DATA.RECIPES[e.recipe].in).length > 1) { add(P.sideP(e, 'L')); add(P.sideP(e, 'R')); }
  }
  const back = e => [e.x - 1, e.y, 0], N = e => [e.x, e.y - 1, 3], So = e => [e.x, e.y + 1, 1];
  const res = [];
  const C = (name, a, b) => {
    if (repair && G.grid[K(b[0], b[1])]) return;   // already connected
    const av = new Set(ports); av.delete(K(a[0], a[1])); av.delete(K(b[0], b[1])); const k = P.connect(a, b, 'belt3', av); res.push(name + ':' + (k || 'X'));
  };
  C('F1>SPL1', P.outP(S.F1), back(S.SPL1)); C('SPL1>BEAM', N(S.SPL1), P.inP(S.BEAM)); C('SPL1>PIPE', So(S.SPL1), P.inP(S.PIPE));
  C('SM>SPS', P.outP(S.SM), back(S.SPS)); C('SPS>PLATE', N(S.SPS), P.inP(S.PLATE)); C('SPS>ROD', So(S.SPS), P.inP(S.ROD));
  C('ROD>SPR', P.outP(S.ROD), back(S.SPR)); C('SPR>SCREW', So(S.SPR), P.inP(S.SCREW)); C('PLATE>RP', P.outP(S.PLATE), P.inP(S.RP));
  C('SCREW>RPside', P.outP(S.SCREW), P.sideP(S.RP, 'R')); C('RP>MF', P.outP(S.RP), P.inP(S.MF)); C('SPR>MFside', N(S.SPR), P.sideP(S.MF, 'R'));
  C('MF>VF', P.outP(S.MF), P.inP(S.VF)); C('BEAM>VFside', P.outP(S.BEAM), P.sideP(S.VF, 'L')); C('PIPE>STAT', P.outP(S.PIPE), P.inP(S.STAT)); C('STAT>AW', P.outP(S.STAT), P.inP(S.AW));
  C('CUS>SPW', P.outP(S.CUS), back(S.SPW)); C('SPW>WIRE', N(S.SPW), P.inP(S.WIRE)); C('SPW>WIRE2', So(S.SPW), P.inP(S.WIRE2)); C('WIRE2>CABLE', P.outP(S.WIRE2), P.inP(S.CABLE));
  C('WIRE>STATside', P.outP(S.WIRE), P.sideP(S.STAT, 'R')); C('CABLE>AWside', P.outP(S.CABLE), P.sideP(S.AW, 'R'));
  C('SPI>F1', N(S.SPI), P.inP(S.F1)); C('SPI>SM', So(S.SPI), P.inP(S.SM)); if (S.MC && G.ents.has(S.MC.id)) C('MC>F1side', P.outP(S.MC), P.sideP(S.F1, 'R')); C('MI>SPI', P.outP(S.MI), back(S.SPI)); C('MCU>CUS', P.outP(S.MCU), P.inP(S.CUS));
  return res;
}
