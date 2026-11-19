// Railway signals, the Satisfactory way. A signal head faces one direction of travel; a piece of track can carry one
// head per direction. Trains only obey heads facing the way they're going, and can't pass a signalled piece the wrong
// way (a head on one side only makes that track one-way). Signalled pieces split the network into blocks:
//  - block signal: the train enters only when the whole next block is empty;
//  - path signal: the train reserves just its own route through the next block, so trains on paths that don't cross
//    can go through a junction together ("path in, block out").
// This module works out each block's entries and exits for the colour view (and flags setups that can't work), and
// plans signals for a whole network (the signal assistant).
import { G, railAt, railSides, sigType, Ent, Train } from './world';
import { W } from './terrain';
import { opp } from './util';
import { rStep } from './railgrid';

export const SIG_BLOCK = 1, SIG_PATH = 2;
/** sides of rail piece i that really connect to the next piece */
export function linkedSides(i: number): number[] {
  const r = railAt(i); if (!r) return [];
  const sd = railSides(r.pairs), out: number[] = [];
  for (let s = 0; s < 4; s++) {
    if (!(sd & (1 << s))) continue;
    const n = railAt(rStep(i, s));
    if (n && railSides(n.pairs) & (1 << opp(s))) out.push(s);
  }
  return out;
}
const originOf = (r: Ent) => r.y * W + r.x;

export interface BlockInfo { id: number; tiles: number[]; entries: { i: number; d: number; type: number }[]; exits: { i: number; d: number; type: number }[]; errors: string[] }
/** every block's entry and exit signals and anything wrong with it. blocks = the block id of each unsignalled piece;
 *  goals = pieces trains stop on at stations */
export function blockReport(blocks: Map<number, number>, goals: Set<number>): { blocks: Map<number, BlockInfo>; sigErrors: Map<number, string> } {
  const out = new Map<number, BlockInfo>(), sigErrors = new Map<number, string>();
  for (const [i, id] of blocks) { let b = out.get(id); if (!b) out.set(id, b = { id, tiles: [], entries: [], exits: [], errors: [] }); b.tiles.push(i); }
  for (const r of G.L.rails) {
    if (!r.sig) continue;
    const i = originOf(r), ls = linkedSides(i);
    if (ls.length < 2) sigErrors.set(i, 'Signal at the end of the track: it leads nowhere');
    for (const s of ls) {
      const B = blocks.get(rStep(i, s));
      if (B === undefined) continue;
      const b = out.get(B)!;
      const tIn = sigType(r, s), tOut = sigType(r, opp(s));
      if (tIn) b.entries.push({ i, d: s, type: tIn });        // a train going this way passes the signal into block B
      if (tOut) b.exits.push({ i, d: opp(s), type: tOut });   // …and one leaving B the other way meets this head
    }
  }
  for (const b of out.values()) {
    if (!b.entries.length && !b.exits.length) continue;       // no signals around it at all: fine
    if (b.entries.length && !b.exits.length) b.errors.push('No exit signal: trains can enter this block but there is no signal to leave it by');
    const types = new Set(b.entries.map(e => e.type));
    if (types.size > 1) b.errors.push('Mixed entry signals: every signal into a block must be the same type (all block, or all path)');
    if (types.size === 1 && types.has(SIG_PATH) && b.tiles.some(t => goals.has(t))) b.errors.push('Station inside a path block: put block signals (not path signals) in front of stations');
  }
  return { blocks: out, sigErrors };
}

/** Signal assistant: signal a whole connected network. Path signals into every junction / crossing with block
 *  signals out of it; along one-way lines (Quick Route loops), block signals spaced a train's length apart. Two-way
 *  track between junctions is left as one block (only one train can use single track at a time). Returns the heads
 *  to set per piece (packed like rail.sg), plus the pieces of the network. */
export function planSignals(start: number, trains: Train[], lines: { cells: number[] }[], goals: Set<number>): { net: number[]; heads: Map<number, number> } {
  const net: number[] = [], seen = new Set<number>([start]);
  for (let q = [start]; q.length;) {
    const i = q.pop()!; net.push(i);
    for (const s of linkedSides(i)) { const n = rStep(i, s); if (!seen.has(n)) { seen.add(n); q.push(n); } }
    if (net.length > 20000) break;
  }
  const routes = (i: number) => { const r = railAt(i)!; let n = 0; for (let k = 0; k < 6; k++) if (r.pairs & (1 << k)) n++; return n; };
  const J = new Set(net.filter(i => routes(i) > 1));
  const heads = new Map<number, number>();
  const set = (i: number, d: number, type: number) => { if (goals.has(i)) return; heads.set(i, ((heads.get(i) || 0) & ~(3 << (2 * d))) | (type << (2 * d))); };
  // the travel direction of one-way (Quick Route) track: the move into each piece
  const oneWay = new Map<number, number>();
  for (const l of lines) for (let k = 0; k < l.cells.length; k++) {
    const a = l.cells[(k - 1 + l.cells.length) % l.cells.length], b = l.cells[k];
    for (let s = 0; s < 4; s++) if (rStep(a, s) === b) oneWay.set(b, s);
  }
  // 1) junctions: on the piece just outside each way in, a path head facing in and a block head facing out
  const gate = new Map<number, Set<number>>();   // piece -> the sides it has toward junctions
  for (const j of J) for (const s of linkedSides(j)) {
    const t = rStep(j, s);
    if (J.has(t) || goals.has(t)) continue;
    let g = gate.get(t); if (!g) gate.set(t, g = new Set()); g.add(opp(s));
  }
  for (const [t, toward] of gate) {
    const ls = linkedSides(t);
    for (const c of toward) {
      const o = ls.find(x => x !== c);
      if (o === undefined) continue;
      set(t, opp(o), SIG_PATH);                                // heading in: entering t from its outer side
      if (!toward.has(o)) set(t, opp(c), SIG_BLOCK);           // heading out of the junction
    }
  }
  // 2) one-way lines: block signals every train-length along runs between junctions
  let longest = 4;
  for (const t of trains) if (t.cells.some(c => seen.has(c))) longest = Math.max(longest, t.cells.length);
  const spacing = longest + 3;
  for (const l of lines) {
    if (!l.cells.every(c => seen.has(c))) continue;
    let run = 0;
    for (const c of l.cells) {
      if (J.has(c) || gate.has(c) || goals.has(c)) { run = 0; continue; }
      if (++run >= spacing) { const d = oneWay.get(c); if (d !== undefined) { set(c, d, SIG_BLOCK); run = 0; } }
    }
  }
  // a station right next to a junction ends up inside that junction's block, and stations can't be in path blocks:
  // switch the path signals into any block holding a station to block signals
  const bid = new Map<number, number>(); let nid = 0;
  for (const i of net) {
    if (heads.get(i) || bid.has(i)) continue;
    nid++; bid.set(i, nid);
    for (const q = [i]; q.length;) { const c = q.pop()!; for (const s of linkedSides(c)) { const n = rStep(c, s); if (seen.has(n) && !heads.get(n) && !bid.has(n)) { bid.set(n, nid); q.push(n); } } }
  }
  const withStation = new Set<number>(); for (const g of goals) { const b = bid.get(g); if (b !== undefined) withStation.add(b); }
  for (const [i, sg] of heads) for (const s of linkedSides(i)) {
    const b = bid.get(rStep(i, s));
    if (b !== undefined && withStation.has(b) && ((sg >> (2 * s)) & 3) === SIG_PATH) set(i, s, SIG_BLOCK);
  }
  return { net, heads };
}
