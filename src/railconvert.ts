// Worlds saved before railways became 2 tiles wide: their 1-tile track is rebuilt on the 2 x 2 rail grid. Every old
// track tile falls inside one 2 x 2 block; blocks are joined wherever the old track crossed between them, so lines,
// junctions and crossings keep their shape. Track that no longer fits (a building in the way) is refunded, and so is
// a train that no longer has room to stand.
import { BLD } from './data';
import { W } from './terrain';
import { DX, DY, opp } from './util';
import { addInv, G, markDirty, pairBit, place, railAt, railExits, railSides, refund, Train } from './world';
import { addTrainToLine, addWagonFree, buildRoute } from './trains';
import { MP, useTeam } from './teams';
import { RS, rOrigin, rStep, rTiles } from './railgrid';

const OLD_RAIL_COST = { iron_rod: 1, iron_plate: 1 };

export function convertOldRails(old: any[]): { pieces: number; lost: number; trainsLost: number; linesLost: number; rebuilt: number } {
  const cur0 = MP.cur;
  const byTile = new Map<number, any>();
  for (const q of old) byTile.set(q.y * W + q.x, q);
  type Cell = { sides: number; n: number; sig: number; o: number; firstPairs: number };
  const cells = new Map<number, Cell>();
  for (const q of old) {
    const c = rOrigin(q.x, q.y);
    let cell = cells.get(c);
    if (!cell) cells.set(c, cell = { sides: 0, n: 0, sig: 0, o: q.o || 0, firstPairs: q.pairs || 0 });
    cell.n++;
    if (q.sig && !cell.sig) cell.sig = q.sig;
    const sd = railSides(q.pairs || 0);
    for (let s = 0; s < 4; s++) {
      if (!(sd & (1 << s))) continue;
      const n = byTile.get((q.y + DY[s]) * W + q.x + DX[s]);
      if (!n || !(railSides(n.pairs || 0) & (1 << opp(s)))) continue;
      if (rOrigin(n.x, n.y) !== c) cell.sides |= 1 << s;   // the old track crosses into the next block this way
    }
  }
  const pairsOf = (cell: Cell) => {
    const S = [0, 1, 2, 3].filter(s => cell.sides & (1 << s));
    if (S.length === 1) return pairBit(S[0], opp(S[0]));                      // an end of the line
    if (S.length === 2) return pairBit(S[0], S[1]);                           // straight or a bend
    if (S.length === 3) return pairBit(S[0], S[1]) | pairBit(S[0], S[2]) | pairBit(S[1], S[2]);   // a junction
    if (S.length === 4) return pairBit(0, 2) | pairBit(1, 3);                 // a crossing
    // a lone piece: keep its direction
    return cell.firstPairs & 1 ? pairBit(0, 2) : pairBit(1, 3);
  };
  let pieces = 0, lost = 0;
  for (const c of [...cells.keys()].sort((a, b) => a - b)) {
    const cell = cells.get(c)!, x = c % W, y = Math.floor(c / W);
    let ok = x >= 1 && y >= 1 && x + RS < W && y + RS < G.tiles.length / W;
    if (ok) for (const k of rTiles(c)) if (G.grid[k] || G.nodeGrid[k] || (G.featGrid && G.featGrid[k])) { ok = false; break; }
    if (!ok) { useTeam(cell.o); refund(OLD_RAIL_COST, cell.n); lost += cell.n; continue; }
    const e = place('rail', x, y, 0, { free: true, quiet: true, owner: cell.o });
    e.pairs = pairsOf(cell);
    if (cell.sig) e.sig = cell.sig;
    pieces++;
  }
  const isRail = (i: number) => { const r = railAt(i); return !!r && r.y * W + r.x === i; };
  const sideTo = (a: number, b: number) => { for (let s = 0; s < 4; s++) if (rStep(a, s) === b) return s; return -1; };
  const linked = (a: number, b: number) => { const s = sideTo(a, b), ra = railAt(a), rb = railAt(b); return s >= 0 && !!ra && !!rb && !!(railSides(ra.pairs) & (1 << s)) && !!(railSides(rb.pairs) & (1 << opp(s))); };
  // Quick Route loops: follow them onto the new blocks. A loop that no longer joins up all the way round is rebuilt
  // below (free) as a proper 2-wide loop between its two stations, and its trains are put back on it.
  type Stash = { name: string; cars: number; cargo: Record<string, number>; o: number };
  const broken: { id: number; a: number; b: number; o: number; blocks: number[]; trains: Stash[] }[] = [];
  const brokenIds = new Set<number>();
  const allLines: any[] = [];
  for (const S of MP.teams ? [...MP.teams.values()] : [G.S]) {
    if (!S.lines) continue;
    S.lines = S.lines.filter((l: any) => {
      const seq: number[] = [];
      for (const c of l.cells) { const b = rOrigin(c % W, Math.floor(c / W)); if (seq[seq.length - 1] !== b) seq.push(b); }
      while (seq.length > 1 && seq[0] === seq[seq.length - 1]) seq.pop();
      const ok = seq.length >= 4 && new Set(seq).size === seq.length && seq.every((c, i) => isRail(c) && linked(c, seq[(i + 1) % seq.length]));
      if (!ok) { brokenIds.add(l.id); broken.push({ id: l.id, a: l.a, b: l.b, o: G.ents.get(l.a)?.o || 0, blocks: seq, trains: [] }); return false; }
      const sc = l.cells[l.split] ?? l.cells[0], sb = rOrigin(sc % W, Math.floor(sc / W));
      l.split = Math.max(1, seq.indexOf(sb));
      l.cells = seq;
      allLines.push(l);
      return true;
    });
  }
  // trains: stand them on the new track, two blocks per car
  const taken = new Set<number>();
  let trainsLost = 0;
  const keep: Train[] = [];
  const later: { line: any; st: Stash }[] = [];
  const stash = (t: Train): Stash => ({ name: t.name, cars: t.cars.length, cargo: { ...t.cargo }, o: t.o || 0 });
  for (const t of G.trains) {
    if (t.line !== undefined && brokenIds.has(t.line)) { broken.find(b => b.id === t.line)?.trains.push(stash(t)); continue; }
    const need = t.cars.length * 2;
    const seq: number[] = [];
    for (const c of t.cells) {
      const b = rOrigin(c % W, Math.floor(c / W));
      if (seq[seq.length - 1] === b) continue;
      if (!isRail(b) || taken.has(b) || (seq.length && !linked(seq[seq.length - 1], b))) break;
      seq.push(b);
    }
    // too short now (each block is twice as long): extend backwards along the track
    while (seq.length && seq.length < need) {
      const tail = seq[seq.length - 1], prev = seq[seq.length - 2];
      const entry = prev !== undefined ? sideTo(tail, prev) : -1;
      const r = railAt(tail)!;
      const exits = entry >= 0 ? railExits(r.pairs, entry) : [0, 1, 2, 3].filter(s => railSides(r.pairs) & (1 << s));
      const ex = exits.find(s => { const n = rStep(tail, s); return isRail(n) && linked(tail, n) && !taken.has(n) && !seq.includes(n); });
      if (ex === undefined) break;
      seq.push(rStep(tail, ex));
    }
    if (seq.length < need) {
      const line = t.line !== undefined ? allLines.find(l => l.id === t.line) : null;
      if (line) { later.push({ line, st: stash(t) }); continue; }     // put back on its loop below
      useTeam(t.o || 0);
      refund(BLD.locomotive.cost); refund(BLD.wagon.cost, t.cars.filter(c => c === 'wagon').length);
      for (const k in t.cargo) addInv(k, t.cargo[k]);
      trainsLost++; continue;
    }
    t.cells = seq.slice(0, need);
    for (const c of t.cells) taken.add(c);
    t.route = []; t.frac = 0; t.v = 0; t.state = 'idle'; t.waitT = 99; t.blockT = 0;
    keep.push(t);
  }
  G.trains = keep;
  // a stashed train back onto a loop, same name, length and cargo
  const putBack = (line: any, st: Stash) => {
    useTeam(st.o);
    if (addTrainToLine(line, true, true)) return false;
    const t = G.trains[G.trains.length - 1];
    t.name = st.name; t.cargo = st.cargo; t.tot = Object.values(st.cargo).reduce((a, b) => a + b, 0);
    while (t.cars.length < st.cars && addWagonFree(t)) { /* longer trains */ }
    return true;
  };
  const refundTrain = (st: Stash) => { useTeam(st.o); refund(BLD.locomotive.cost); refund(BLD.wagon.cost, st.cars - 1); for (const k in st.cargo) addInv(k, st.cargo[k]); trainsLost++; };
  for (const { line, st } of later) if (!putBack(line, st)) refundTrain(st);
  // rebuild the loops that broke
  let linesLost = 0, rebuilt = 0;
  const onLines = new Set<number>(); for (const l of allLines) for (const c of l.cells) onLines.add(c);
  for (const br of broken) {
    // clear what's left of the old loop (plain pieces nothing else uses), so the new one has room
    for (const c of br.blocks) {
      const r = railAt(c);
      if (!r || r.y * W + r.x !== c || onLines.has(c) || G.trains.some(t => t.cells.includes(c))) continue;
      for (const k of rTiles(c)) if (G.grid[k] === r.id) G.grid[k] = 0;
      G.ents.delete(r.id);
    }
    const A = G.ents.get(br.a), B = G.ents.get(br.b);
    useTeam(br.o);
    const err = A && B ? buildRoute(A, B, false, true) : 'gone';
    if (err) { linesLost++; for (const st of br.trains) refundTrain(st); continue; }
    rebuilt++;
    const line = G.S.lines[G.S.lines.length - 1];
    for (const st of br.trains) if (!putBack(line, st)) refundTrain(st);
  }
  markDirty('rail');
  useTeam(cur0);
  return { pieces, lost, trainsLost, linesLost, rebuilt };
}
