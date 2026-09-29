import { BLD, isFluid, ITEMS, RECIPES, Recipe } from './data';
import { H, W } from './terrain';
import { DX, DY, opp } from './util';
import { addInv, borderTiles, canAfford, chopTree, def, Ent, entAt, frontTiles, G, inPort, missingText, pay, PORTED, tickRegrow } from './world';
import { addPoints, delivered, elevatorAccept } from './progress';
import { updateTrains } from './trains';
import { updateDrones } from './drones';
import { updateTrucks } from './trucks';
import { updateShips } from './ships';
import { solarFactor } from './daynight';
import { asTeam, MP, TS, useTeam } from './teams';

export const SP = 0.5; // min spacing between items on a belt (tiles)
export const PIPE_CAP = 20;
export const clockPow = (c: number) => Math.pow(c, 1.321);
export const PURITY = [{ n: 'Impure', m: 0.5 }, { n: 'Normal', m: 1 }, { n: 'Pure', m: 2 }];

// ---------------------------------------------------------------------------
// Stats (rolling 60 one-second buckets)
const STAT_N = 60;
export const stats = { P: {} as Record<string, Float32Array>, C: {} as Record<string, Float32Array>, D: {} as Record<string, Float32Array>, idx: 0, sec: -1, elapsed: 0 };
export function stat(m: Record<string, Float32Array>, item: string, n: number) {
  let a = m[item]; if (!a) a = m[item] = new Float32Array(STAT_N); a[stats.idx] += n;
  if (m === stats.P && G.S) G.S.made[item] = (G.S.made[item] || 0) + n;
}
export function rate(m: Record<string, Float32Array>, item: string) {
  const a = m[item]; if (!a) return 0; let s = 0;
  for (let i = 0; i < STAT_N; i++) if (i !== stats.idx) s += a[i];
  const el = Math.min(STAT_N - 1, Math.max(1, stats.elapsed));
  return s * 60 / el;
}
export function resetStats() { stats.P = {}; stats.C = {}; stats.D = {}; stats.elapsed = 0; }
/** long history for the graphs: one sample every 30 s of game time, the last hour kept */
export interface HistSample { t: number; cap: number; dem: number; p: Record<string, number>; c: Record<string, number> }
export const hist = { s: [] as HistSample[], every: 30, keep: 120 };
function sampleHistory() {
  if (MP.teams) { const prev = MP.cur; for (const o of MP.teams.keys()) { useTeam(o); sampleHistory1(o); } useTeam(prev); }
  else sampleHistory1(-1);
}
function sampleHistory1(team: number) {
  const p: Record<string, number> = {}, c: Record<string, number> = {};
  for (const k in stats.P) { const v = rate(stats.P, k); if (v > 0.01) p[k] = Math.round(v * 10) / 10; }
  for (const k in stats.C) { const v = rate(stats.C, k); if (v > 0.01) c[k] = Math.round(v * 10) / 10; }
  let cap = 0, dem = 0; for (const n of G.pnets) if (team < 0 || n.o === team) { cap += n.cap; dem += n.lastDemand; }
  hist.s.push({ t: Math.round(G.S.time), cap: Math.round(cap), dem: Math.round(dem), p, c });
  if (hist.s.length > hist.keep) hist.s.shift();
  if (cap > (G.S.flags.peakMW || 0)) G.S.flags.peakMW = Math.round(cap);
}

// ---------------------------------------------------------------------------
// Rebuild caches
export function ensureFresh() {
  if (G.dirty.links) rebuildLinks();
  if (G.dirty.fluid) rebuildFluids();
  if (G.dirty.power) rebuildPower();
}

export function rebuildLinks() {
  const L: any = { outposts: [], ports: [], belts: [], order: [], machines: [], miners: [], extractors: [], harvesters: [], logi: [], gens: [], bats: [], poles: [], stations: [], tstations: [], drones: [], sinks: [], pipes: [], rails: [], cnt: Object.create(null), powered: [] };
  for (const e of G.ents.values()) {
    const d = BLD[e.type];
    L.cnt[e.type] = (L.cnt[e.type] || 0) + 1;
    switch (d.kind) {
      case 'belt': case 'lift': L.belts.push(e); break;
      case 'tunnel': if (!e.isExit) L.belts.push(e); break;
      case 'machine': L.machines.push(e); break;
      case 'miner': L.miners.push(e); break;
      case 'extractor': L.extractors.push(e); break;
      case 'harvester': L.harvesters.push(e); break;
      case 'splitter': case 'merger': case 'sorter': case 'storage': L.logi.push(e); break;
      case 'sink': L.sinks.push(e); break;
      case 'gen': L.gens.push(e); break;
      case 'battery': L.bats.push(e); break;
      case 'pole': L.poles.push(e); break;
      case 'hub': L.poles.push(e); L.hub = e; break;
      case 'outpost': L.poles.push(e); L.outposts.push(e); break;
      case 'station': L.stations.push(e); break;
      case 'tstation': L.tstations.push(e); break;
      case 'port': L.ports.push(e); break;
      case 'drone': L.drones.push(e); break;
      case 'pipe': case 'ptunnel': case 'tank': L.pipes.push(e); break;
      case 'rail': L.rails.push(e); break;
      case 'elevator': L.elevator = e; break;
    }
    if (d.kind !== 'belt' && d.kind !== 'tunnel' && d.kind !== 'rail' && d.kind !== 'lift') { e.ft = frontTiles(e); e.ip = inPort(e); }
  }
  for (const b of L.belts) { b.nb = null; b.nbld = null; b.back = false; b.sides = 0; b.side = -1; }
  const feed = (b: Ent, dir: number) => {
    if (b.rot === dir) b.back = true;
    else if (dir !== opp(b.rot)) { b.sides++; b.side = dir; }
  };
  for (const b of L.belts) {
    let tx: number, ty: number;
    if (b.type === 'tunnel') {
      const ex = b.pair ? G.ents.get(b.pair) : null;
      if (!ex) { b.len = 1; continue; }
      b.len = Math.abs(ex.x - b.x) + Math.abs(ex.y - b.y) + 1;
      tx = ex.x + DX[b.rot]; ty = ex.y + DY[b.rot]; b.srcX = ex.x; b.srcY = ex.y;
    } else { b.len = 1; tx = b.x + DX[b.rot]; ty = b.y + DY[b.rot]; b.srcX = b.x; b.srcY = b.y; }
    const zo = b.type.startsWith('lift') ? b.z2 : (b.z || 0);   // lifts come out on another floor
    const t = entAt(tx, ty, zo);
    if (!t) continue;
    const k = BLD[t.type].kind;
    if (k === 'belt' || (k === 'tunnel' && !t.isExit)) { if (t.rot !== opp(b.rot)) { b.nb = t; feed(t, b.rot); } }
    else if (k === 'lift') { if ((t.z || 0) === zo && t.rot !== opp(b.rot)) b.nb = t; }
    else if (k !== 'tunnel') b.nbld = t;
  }
  for (const e of G.ents.values()) {
    const d = BLD[e.type];
    if (!e.ft || d.kind === 'hub' || d.kind === 'elevator' || d.kind === 'pipe' || d.kind === 'pole' || d.kind === 'decor') continue;
    if (d.kind === 'splitter' || d.kind === 'sorter') {
      for (const dd of [e.rot, (e.rot + 3) & 3, (e.rot + 1) & 3]) { const t = entAt(e.x + DX[dd], e.y + DY[dd], e.z || 0); if (t && (t.type.startsWith('belt'))) feed(t, dd); }
    } else for (const [x, y] of e.ft) { const t = entAt(x, y, e.z || 0); if (t && t.type.startsWith('belt')) feed(t, e.rot); }
  }
  for (const b of L.belts) {
    b.curve = (!b.back && b.sides === 1 && b.type !== 'tunnel') ? b.side : -1;
    const cx = b.x + 0.5, cy = b.y + 0.5, f = b.curve >= 0 ? b.curve : b.rot;
    b.pts = [cx - DX[f] * 0.5, cy - DY[f] * 0.5, cx, cy, cx + DX[b.rot] * 0.5, cy + DY[b.rot] * 0.5];
  }
  const seen = new Set<Ent>();
  for (const b of L.belts) {
    if (seen.has(b)) continue;
    const path: Ent[] = []; let c: Ent = b;
    while (c && !seen.has(c)) { seen.add(c); path.push(c); c = c.nb; }
    for (let i = path.length - 1; i >= 0; i--) L.order.push(path[i]);
  }
  L.wrong = [];
  const checkFeed = (x: number, y: number, z: number, dir: number, src: Ent) => {
    const t = entAt(x + DX[dir], y + DY[dir], z);
    if (!t || t === src || !PORTED.has(BLD[t.type].kind) || t.anyIn) return;
    const ip = inPort(t);
    if (ip[0] !== x || ip[1] !== y) { L.wrong.push({ x, y, z, dir, t }); t.wrongFeed = (t.wrongFeed || 0) + 1; }
  };
  for (const e of G.ents.values()) e.wrongFeed = 0;
  for (const b of L.belts) if (b.nbld && !b.type.startsWith('lift')) checkFeed(b.srcX ?? b.x, b.srcY ?? b.y, b.z || 0, b.rot, b);
  for (const e of L.logi) {
    const k = BLD[e.type].kind;
    if (k === 'splitter' || k === 'sorter') for (const dd of [e.rot, (e.rot + 3) & 3, (e.rot + 1) & 3]) checkFeed(e.x, e.y, e.z || 0, dd, e);
    else if (k === 'merger') checkFeed(e.x, e.y, e.z || 0, e.rot, e);
  }
  L.powered = [...L.machines, ...L.miners, ...L.extractors, ...L.harvesters, ...L.sinks, ...L.stations, ...L.tstations, ...L.ports, ...L.drones];
  G.L = L;
  G.dirty.links = false;
}

// ---------------------------------------------------------------------------
// Power
export function poleReach(e: Ent) { return (BLD[e.type].reach || 0) * (TS(e.o).shop.wires ? 1.5 : 1); }
export function rebuildPower() {
  if (G.dirty.links) rebuildLinks();
  const L = G.L;
  if (!G.covGrid || G.covGrid.length !== W * H) G.covGrid = new Int32Array(W * H); else G.covGrid.fill(0);
  const cov = G.covGrid;
  const poles: Ent[] = L.poles;
  const parent = new Map<number, number>();
  const find = (a: number): number => { let r = a; while (parent.get(r) !== r) r = parent.get(r); let c = a; while (c !== r) { const n = parent.get(c); parent.set(c, r); c = n; } return r; };
  const unite = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const p of poles) {
    parent.set(p.id, p.id); p.wires = [];
    const r = BLD[p.type].area;
    for (let y = Math.max(0, p.y - r); y < Math.min(H, p.y + p.h + r); y++)
      for (let x = Math.max(0, p.x - r); x < Math.min(W, p.x + p.w + r); x++) cov[y * W + x] = p.id;
  }
  // spatial buckets for wiring
  const B = 64, buckets = new Map<number, Ent[]>();
  for (const p of poles) { const k = Math.floor(p.x / B) * 1000 + Math.floor(p.y / B); let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(p); }
  for (const p of poles) {
    const rp = poleReach(p), cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const bx = Math.floor(p.x / B), by = Math.floor(p.y / B), rr = Math.ceil(rp / B);
    const cands: [number, Ent][] = [];
    for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) {
      const a = buckets.get((bx + i) * 1000 + by + j); if (!a) continue;
      for (const q of a) {
        if (q === p || (q.o || 0) !== (p.o || 0)) continue;   // wires only join a team's own poles
        const d = Math.hypot(q.x + q.w / 2 - cx, q.y + q.h / 2 - cy);
        if (d <= Math.min(rp, poleReach(q))) cands.push([d, q]);
      }
    }
    cands.sort((a, b) => a[0] - b[0]);
    for (const [, q] of cands.slice(0, 6)) { unite(p.id, q.id); if (p.id < q.id) p.wires.push(q); }
  }
  const nets = new Map<number, any>();
  const netOf = (poleId: number) => {
    const r = find(poleId);
    let n = nets.get(r);
    if (!n) { n = { id: r, o: G.ents.get(r)?.o || 0, outposts: 0, gens: [], cons: [], bats: [], poles: 0, cap: 0, demand: 0, lastDemand: 0, sat: 1, load: 0, batFlow: 0, hist: [], hub: null }; nets.set(r, n); }
    return n;
  };
  for (const p of poles) { const n = netOf(p.id); n.poles++; p.pnet = n; if (BLD[p.type].kind === 'hub') n.hub = p; else if (BLD[p.type].kind === 'outpost') n.outposts++; }
  const attach = (e: Ent) => {
    const o = e.o || 0;
    let foreign = false;
    for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++) {
      const id = cov[(e.y + j) * W + e.x + i];
      if (!id) continue;
      if (!MP.teams || (G.ents.get(id)!.o || 0) === o) return netOf(id);
      foreign = true;
    }
    // another team's pole covers this spot: look for one of our own poles that reaches it (they never share power)
    if (foreign) for (const p of poles) {
      if ((p.o || 0) !== o) continue;
      const r = BLD[p.type].area;
      if (e.x + e.w > p.x - r && e.x < p.x + p.w + r && e.y + e.h > p.y - r && e.y < p.y + p.h + r) return netOf(p.id);
    }
    return null;
  };
  // keep history from previous nets where possible
  const oldHist = new Map<number, any[]>();
  for (const n of G.pnets) oldHist.set(n.id, n.hist);
  for (const e of L.powered) { e.pnet = attach(e); if (e.pnet) e.pnet.cons.push(e); }
  for (const e of L.gens) { e.pnet = attach(e); if (e.pnet) e.pnet.gens.push(e); }
  for (const e of L.bats) { e.pnet = attach(e); if (e.pnet) e.pnet.bats.push(e); }
  G.pnets = [...nets.values()];
  for (const n of G.pnets) { const h = oldHist.get(n.id); if (h) n.hist = h; }
  G.dirty.power = false;
}

function genAvail(g: Ent) {
  const d = BLD[g.type];
  if (d.kind === 'hub') return d.mw;
  if (g.type === 'geothermal') return d.mw * (g.node ? PURITY[g.node.p].m : 1) * g.clock;
  if (d.solar) return d.mw * solarFactor();
  if (d.waste && g.ob) { for (const k in g.ob) if (g.ob[k] >= 100) return 0; }   // waste backed up: shut down
  let fueled = g.fuelT > 0;
  if (!fueled) for (const k in d.fuels) if ((g.fbuf[k] || 0) >= (isFluid(k) ? 0.5 : 1)) { fueled = true; break; }
  if (!fueled) return 0;
  if (d.water && g.water < 0.5) return 0;
  return d.mw * g.clock;
}

function updatePower(dt: number) {
  for (const n of G.pnets) {
    let cap = 0;
    if (n.hub) cap += BLD.hub.mw;
    cap += (n.outposts || 0) * BLD.outpost.mw;
    for (const g of n.gens) { g.avail = genAvail(g); cap += g.avail; }
    const demand = n.demand;
    n.lastDemand = demand; n.demand = 0;
    let batOut = 0, batIn = 0;
    if (demand > cap) {
      let need = demand - cap;
      for (const b of n.bats) { const give = Math.min(b.stored / dt, BLD.battery.mw, need); b.stored -= give * dt; need -= give; batOut += give; }
    } else {
      let sur = cap - demand;
      for (const b of n.bats) { const take = Math.min(BLD.battery.mw, (BLD.battery.cap - b.stored) / dt, sur); if (take > 0) { b.stored += take * dt; sur -= take; batIn += take; } }
    }
    n.cap = cap; n.batFlow = batIn - batOut;
    n.sat = demand > 0 ? Math.min(1, (cap + batOut) / demand) : 1;
    n.load = cap > 0 ? Math.min(1, (demand - batOut + batIn) / cap) : 0;
  }
  // burn fuel
  for (const g of G.L.gens) {
    const d = BLD[g.type], n = g.pnet;
    const load = n ? n.load : 0;
    g.out = (g.avail || 0) * load;
    if (!d.fuels) { g.st = g.avail > 0 ? 'work' : 'idle'; continue; }
    const burn = dt * load * g.clock;
    if (burn > 0 && g.avail > 0) {
      if (g.fuelT <= 0) {
        for (const k in d.fuels) {
          const unit = isFluid(k) ? 1 : 1;
          if ((g.fbuf[k] || 0) >= unit) {
            g.fbuf[k] -= unit; g.fuelT += d.fuels[k]; stat(stats.C, k, unit);
            const w = d.waste && d.waste[k]; if (w) { g.ob = g.ob || {}; g.ob[w[0]] = (g.ob[w[0]] || 0) + w[1]; stat(stats.P, w[0], w[1]); }
            break;
          }
        }
      }
      g.fuelT -= burn;
      if (d.water) { const w = d.water / 60 * burn; g.water = Math.max(0, g.water - w); stat(stats.C, 'water', w); }
    }
    g.st = g.avail > 0 ? (load > 0 ? 'work' : 'idle') : d.waste && g.ob && Object.values(g.ob).some((v: any) => v >= 100) ? 'block' : 'starve';
  }
}

// ---------------------------------------------------------------------------
// Fluids
export function fluidConnSide(e: Ent): number {
  // for pipe tunnels: the one side that connects to pipes
  return e.isExit ? e.rot : opp(e.rot);
}
function fluidNode(e: Ent | null) { if (!e) return false; const k = BLD[e.type].kind; return k === 'pipe' || k === 'tank' || k === 'ptunnel'; }
/** does fluid node `n` accept a connection from tile (fx,fy)? */
function nodeAccepts(n: Ent, fx: number, fy: number) {
  if (BLD[n.type].kind !== 'ptunnel') return true;
  const s = fluidConnSide(n);
  return n.x + DX[s] === fx && n.y + DY[s] === fy;
}
export function fluidNeighbors(e: Ent): Ent[] {
  const out: Ent[] = [];
  const k = BLD[e.type].kind;
  if (k === 'ptunnel') {
    const s = fluidConnSide(e), n = entAt(e.x + DX[s], e.y + DY[s], e.z || 0);
    if (fluidNode(n) && nodeAccepts(n, e.x, e.y)) out.push(n);
    if (e.pair) { const p = G.ents.get(e.pair); if (p) out.push(p); }
    return out;
  }
  for (const lv of e.z2 !== undefined ? [e.z || 0, e.z2] : [e.z || 0]) for (const [x, y] of borderTiles(e)) {
    const n = entAt(x, y, lv);
    if (!fluidNode(n) || n === e) continue;
    // which tile of e is adjacent to (x,y)?
    const ax = Math.min(Math.max(x, e.x), e.x + e.w - 1), ay = Math.min(Math.max(y, e.y), e.y + e.h - 1);
    if (nodeAccepts(n, ax, ay) && !out.includes(n)) out.push(n);
  }
  return out;
}
const nodeCap = (e: Ent) => BLD[e.type].kind === 'tank' ? BLD.tank.cap : PIPE_CAP;

export function syncFluidMembers() {
  for (const n of G.fnets) for (const m of n.members) {
    if (!G.ents.has(m.id)) continue;
    m.famt = n.cap > 0 ? n.amount * nodeCap(m) / n.cap : 0; m.ffluid = n.fluid;
  }
}
export function rebuildFluids() {
  if (G.dirty.links) rebuildLinks();
  syncFluidMembers();
  const nets: any[] = [];
  const seen = new Set<Ent>();
  for (const s of G.L.pipes) {
    if (seen.has(s)) continue;
    const net = { id: nets.length + 1, fluid: null as string | null, amount: 0, cap: 0, rate: Infinity, members: [] as Ent[], flow: 0, flowEMA: 0, budget: 0 };
    const q = [s]; seen.add(s);
    while (q.length) {
      const e = q.pop();
      net.members.push(e); e.fnet = net;
      net.cap += nodeCap(e); net.amount += e.famt || 0;
      if (e.ffluid && !net.fluid) net.fluid = e.ffluid;
      const pr = BLD[e.type].pipeRate; if (pr) net.rate = Math.min(net.rate, pr / 60);
      for (const n of fluidNeighbors(e)) if (!seen.has(n)) { seen.add(n); q.push(n); }
    }
    if (net.rate === Infinity) net.rate = 20;
    net.amount = Math.min(net.amount, net.cap);
    nets.push(net);
  }
  G.fnets = nets;
  // attach machines / extractors / generators
  const users = [...G.L.machines, ...G.L.extractors, ...G.L.gens];
  for (const e of users) {
    e.fnets = [];
    for (const [x, y] of borderTiles(e)) {
      const n = entAt(x, y, e.z || 0);
      if (!fluidNode(n)) continue;
      const ax = Math.min(Math.max(x, e.x), e.x + e.w - 1), ay = Math.min(Math.max(y, e.y), e.y + e.h - 1);
      if (nodeAccepts(n, ax, ay) && !e.fnets.includes(n.fnet)) e.fnets.push(n.fnet);
    }
  }
  G.dirty.fluid = false;
}
/** fluids of networks a new pipe at these tiles would join */
export function fluidsTouching(tiles: number[][], isTunnel?: { rot: number; exit: boolean } | null, z = 0): string[] {
  if (G.dirty.fluid || G.dirty.links) { rebuildLinks(); rebuildFluids(); }
  const fl = new Set<string>();
  for (const [x, y] of tiles) for (let d = 0; d < 4; d++) {
    if (isTunnel) { const s = isTunnel.exit ? isTunnel.rot : opp(isTunnel.rot); if (d !== s) continue; }
    const n = entAt(x + DX[d], y + DY[d], z);
    if (fluidNode(n) && nodeAccepts(n, x, y) && n.fnet && n.fnet.fluid && n.fnet.amount > 0.01) fl.add(n.fnet.fluid);
    else if (fluidNode(n) && n.fnet && n.fnet.fluid) fl.add(n.fnet.fluid);
  }
  return [...fl];
}
function pullFluid(e: Ent, k: string, want: number) {
  if (want <= 0 || !e.fnets) return 0;
  for (const n of e.fnets) if (n.fluid === k && n.amount > 0) { const t = Math.min(want, n.amount); n.amount -= t; return t; }
  return 0;
}
function pushFluid(e: Ent, k: string, have: number, avoid?: string[]) {
  if (have <= 0 || !e.fnets) return 0;
  let net = e.fnets.find((n: any) => n.fluid === k);
  if (!net) net = e.fnets.find((n: any) => !n.fluid && !(avoid && avoid.includes(n.fluid)));
  if (!net) return 0;
  const t = Math.min(have, net.cap - net.amount, net.budget);
  if (t <= 0) return 0;
  net.amount += t; net.budget -= t; net.flow += t;
  if (!net.fluid) net.fluid = k;
  return t;
}
export function flushNet(net: any) { net.amount = 0; net.fluid = null; for (const m of net.members) { m.famt = 0; m.ffluid = null; } }

// ---------------------------------------------------------------------------
// Item transfer
export function deliverTo(tx: number, ty: number, dir: number, item: string, z = 0): boolean {
  const t = entAt(tx, ty, z);
  if (!t) return false;
  const k = BLD[t.type].kind;
  if (k === 'lift' && (t.z || 0) !== z) return false;
  if (k === 'belt' || k === 'lift' || (k === 'tunnel' && !t.isExit)) {
    if (t.rot === opp(dir)) return false;
    const l = t.items[t.items.length - 1];
    if (l && l.pos < SP) return false;
    t.items.push({ it: item, pos: 0 });
    return true;
  }
  return acceptInto(t, item, dir, tx - DX[dir], ty - DY[dir]);
}

export function autoRecipe(e: Ent, item: string) {
  const m = BLD[e.type].machine;
  for (const k in RECIPES) { const r = RECIPES[k]; if (r.m === m && !r.alt && r.in[item] && G.S.unlocked.has(k)) return k; }
  return null;
}
export const inCap = (r: Recipe, k: string) => isFluid(k) ? Math.max(r.in[k] * 2, 20) : Math.max(r.in[k] * (Object.keys(r.in).length > 1 ? 4 : 2), 4);
export const outCap = (r: Recipe, k: string) => isFluid(k) ? Math.max(r.out[k] * 3, 20) : Math.max(r.out[k] * 2, 5);

export function acceptInto(e: Ent, item: string, dir: number, fx?: number, fy?: number): boolean {
  // items arriving at a building count for the building's owner (a rival's belt can feed your HUB)
  if (MP.teams && (e.o || 0) !== MP.cur) return asTeam(e.o || 0, () => acceptInto(e, item, dir, fx, fy));
  const d = BLD[e.type], side = opp(dir);
  if (PORTED.has(d.kind) && fx !== undefined) {
    if (e.anyIn) { if (side === e.rot && d.kind !== 'sink' && d.kind !== 'gen') return false; }   // older buildings: any side but the front
    else { const ip = e.ip || (e.ip = inPort(e)); if (fx !== ip[0] || fy !== ip[1]) return false; }
  }
  switch (d.kind) {
    case 'hub': addInv(item, 1); delivered(e, item); return true;
    case 'elevator': elevatorAccept(item); delivered(e, item); return true;
    case 'machine': {
      if (!e.recipe) { const k = autoRecipe(e, item); if (!k) return false; setRecipe(e, k); }
      let r = RECIPES[e.recipe];
      if (!r.in[item] && !isFluid(item)) {
        // an empty single-ingredient machine switches to a recipe that uses what's arriving
        const k = autoRecipe(e, item);
        const empty = !e.work && !Object.values(e.ib).some((v: any) => v > 0) && !Object.values(e.ob).some((v: any) => v > 0);
        if (k && empty && Object.keys(r.in).length === 1 && Object.keys(RECIPES[k].in).length === 1) { setRecipe(e, k); r = RECIPES[k]; }
        else { e.wrongItem = item; return false; }
      }
      if (!r.in[item] || isFluid(item)) return false;
      const have = e.ib[item] || 0;
      if (have >= inCap(r, item)) return false;
      e.ib[item] = have + 1; return true;
    }
    case 'storage': case 'station': case 'tstation': case 'port':
      if (e.tot >= d.cap) return false;
      e.store[item] = (e.store[item] || 0) + 1; e.tot++; return true;
    case 'drone':
      if (e.obTot >= d.cap) return false;
      e.outbox[item] = (e.outbox[item] || 0) + 1; e.obTot++; return true;
    case 'sink':
      if (item === 'uranium_waste') return false;
      addPoints(ITEMS[item].val || 1); e.sunk++; e.sinkT = 1; stat(stats.C, item, 1); return true;
    case 'splitter': case 'sorter':
      if (side !== opp(e.rot) || e.buf.length >= 2) return false;
      e.buf.push(item); return true;
    case 'merger':
      if (side === e.rot || e.slot[side]) return false;
      e.slot[side] = item; return true;
    case 'gen': {
      if (!d.fuels || !(item in d.fuels)) return false;
      let tot = 0; for (const k in e.fbuf) tot += e.fbuf[k];
      if (tot >= 50) return false;
      e.fbuf[item] = (e.fbuf[item] || 0) + 1; return true;
    }
  }
  return false;
}
export function pushOut(e: Ent, item: string) {
  const ft = e.ft, n = ft.length;
  for (let k = 0; k < n; k++) {
    const i = ((e.rr || 0) + k) % n, p = ft[i];
    if (deliverTo(p[0], p[1], e.rot, item, e.z || 0)) { e.rr = (i + 1) % n; return true; }
  }
  return false;
}
export function setRecipe(e: Ent, k: string | null) {
  if (e.recipe === k) return;
  for (const i in e.ib) if (e.ib[i] && !isFluid(i)) addInv(i, Math.floor(e.ib[i]));
  for (const i in e.ob) if (e.ob[i] && !isFluid(i)) addInv(i, Math.floor(e.ob[i]));
  e.recipe = k; e.ib = {}; e.ob = {}; e.prog = 0; e.work = false; e.pop = 1;
}
function takeFromStore(e: Ent) {
  const keys = Object.keys(e.store);
  if (!keys.length) return null;
  return keys[(e.kr || 0) % keys.length];
}

// ---------------------------------------------------------------------------
// Hand crafting
export interface CraftQ { q: string[]; active: boolean; t: number }
/** the local team's hand-crafting queue (each team has its own) */
export function myCraft(): CraftQ { const S: any = G.S; return S.cq || (S.cq = { q: [], active: false, t: 0 }); }
export const handTime = (r: Recipe) => Math.max(0.3, r.t * 0.5 / (G.S.shop.hands ? 3 : 1));

// ---------------------------------------------------------------------------
export function update(dt: number) {
  ensureFresh();
  const S = G.S;
  S.time += dt;
  const sec = Math.floor(S.time);
  if (sec !== stats.sec) {
    stats.sec = sec; stats.idx = (stats.idx + 1) % STAT_N; stats.elapsed++;
    for (const m of [stats.P, stats.C, stats.D]) for (const k in m) m[k][stats.idx] = 0;
    for (const n of G.pnets) { n.hist.push([n.cap, n.lastDemand, n.batFlow]); if (n.hist.length > 90) n.hist.shift(); }
    for (const n of G.fnets) { n.flowEMA = n.flowEMA * 0.5 + n.flow * 0.5; n.flow = 0; }
    tickRegrow();
    if (sec % hist.every === 0 && stats.elapsed > 3) sampleHistory();
  }
  for (const n of G.fnets) n.budget = n.rate * dt;
  updatePower(dt);
  const L = G.L;
  // team worlds: run each building in its owner's context; teams with nobody online stand still
  const T = MP.teams ? (e: { o?: number }) => { const o = e.o || 0; if (MP.paused.has(o)) return false; if (o !== MP.cur) useTeam(o); return true; } : null;

  // miners
  for (const e of L.miners) {
    if (T && !T(e)) continue;
    if (!e.node) { e.st = 'idle'; e.req = 0; continue; }   // (a miner whose node vanished must never stall the factory)
    const d = BLD[e.type], res = e.node.res, sat = e.pnet ? e.pnet.sat : 0;
    const cap = 20;
    if (!e.pnet) { e.st = 'nopower'; e.req = 0; }
    else {
      const blocked = e.ob >= cap;
      e.req = blocked ? 0 : d.power * clockPow(e.clock);
      if (!blocked) { e.tm += dt * d.rate * PURITY[e.node.p].m * e.clock * sat / 60; }
      while (e.tm >= 1 && e.ob < cap) { e.tm -= 1; e.ob++; stat(stats.P, res, 1); }
      e.st = blocked ? 'block' : sat < 0.999 ? 'lowpower' : 'work';
      e.pnet.demand += e.req;
    }
    if (e.ob > 0 && pushOut(e, res)) e.ob--;
    if (e.ob > 1 && pushOut(e, res)) e.ob--;
  }
  // extractors
  for (const e of L.extractors) {
    if (T && !T(e)) continue;
    const d = BLD[e.type], res = d.on === 'water' ? 'water' : 'crude_oil', sat = e.pnet ? e.pnet.sat : 0;
    const cap = 100;
    if (!e.pnet) { e.st = 'nopower'; e.req = 0; }
    else {
      const blocked = e.ob >= cap;
      const pm = d.on === 'water' || !e.node ? 1 : PURITY[e.node.p].m;
      e.req = blocked ? 0 : d.power * clockPow(e.clock);
      if (!blocked) { const amt = dt * d.rate * pm * e.clock * sat / 60; e.ob = Math.min(cap, e.ob + amt); stat(stats.P, res, amt); }
      e.st = !e.fnets || !e.fnets.length ? 'noout' : blocked ? 'block' : sat < 0.999 ? 'lowpower' : 'work';
      e.pnet.demand += e.req;
    }
    if (e.ob > 0) e.ob -= pushFluid(e, res, e.ob);
  }
  // harvesters
  for (const e of L.harvesters) {
    if (T && !T(e)) continue;
    const d = BLD[e.type], sat = e.pnet ? e.pnet.sat : 0;
    if (!e.pnet) { e.st = 'nopower'; e.req = 0; }
    else if (e.ob >= 20) { e.st = 'block'; e.req = 0; }
    else {
      if (!e.targets || !e.targets.length) e.targets = findTrees(e);
      if (!e.targets.length) { e.st = 'idle'; e.req = 0; }
      else {
        e.req = d.power; e.st = 'work'; e.tm += dt * sat / 2.5;
        if (e.tm >= 1) {
          e.tm = 0;
          while (e.targets.length) {
            const i = e.targets.pop();
            if (G.trees[i]) { chopTree(i % W, Math.floor(i / W), false); e.ob += 5; stat(stats.P, 'wood', 5); break; }
          }
        }
      }
      e.pnet.demand += e.req;
    }
    if (e.ob > 0 && pushOut(e, 'wood')) e.ob--;
  }
  // machines
  for (const e of L.machines) { if (T && !T(e)) continue; updateMachine(e, dt); }
  // generators: fluid intake (and waste out)
  for (const g of L.gens) {
    if (T && !T(g)) continue;
    const d = BLD[g.type];
    if (d.waste && g.ob) for (const k in g.ob) if (g.ob[k] >= 1 && g.ft && pushOut(g, k)) g.ob[k]--;
    if (d.water && g.water < 60) g.water += pullFluid(g, 'water', 60 - g.water);
    if (d.fuels) for (const k in d.fuels) if (isFluid(k)) { const have = g.fbuf[k] || 0; if (have < 30) g.fbuf[k] = have + pullFluid(g, k, 30 - have); }
  }
  // logistics
  for (const e of L.logi) {
    if (T && !T(e)) continue;
    const d = BLD[e.type];
    if (d.kind === 'splitter') {
      if (e.buf.length) {
        const dirs = [e.rot, (e.rot + 3) & 3, (e.rot + 1) & 3];
        for (let k = 0; k < 3; k++) { const i = (e.rr + k) % 3, dd = dirs[i]; if (deliverTo(e.x + DX[dd], e.y + DY[dd], dd, e.buf[0], e.z || 0)) { e.buf.shift(); e.rr = (i + 1) % 3; break; } }
      }
    } else if (d.kind === 'sorter') {
      if (e.buf.length) sorterStep(e);
    } else if (d.kind === 'merger') {
      for (let k = 0; k < 4; k++) { const s = (e.rr + k) & 3, it = e.slot[s]; if (it && deliverTo(e.x + DX[e.rot], e.y + DY[e.rot], e.rot, it, e.z || 0)) { e.slot[s] = null; e.rr = (s + 1) & 3; break; } }
    } else if (d.kind === 'storage') {
      if (e.tot > 0) {
        const k = takeFromStore(e);
        if (k && pushOut(e, k)) { e.store[k]--; e.tot--; e.kr = (e.kr || 0) + 1; if (!e.store[k]) delete e.store[k]; }
      }
    }
  }
  for (const e of L.sinks) {
    if (T && !T(e)) continue;
    if (e.sinkT > 0) e.sinkT -= dt;
    e.req = e.sinkT > 0 ? BLD.sink.power : 0;
    if (e.pnet) e.pnet.demand += e.req;
  }
  for (const e of [...L.stations, ...L.tstations, ...L.ports]) {
    if (T && !T(e)) continue;
    e.req = BLD[e.type].power; if (e.pnet) e.pnet.demand += e.req;
    if (e.mode === 'unload' && e.tot > 0) {
      const k = takeFromStore(e);
      if (k && pushOut(e, k)) { e.store[k]--; e.tot--; e.kr = (e.kr || 0) + 1; if (!e.store[k]) delete e.store[k]; }
    }
  }
  // belts, downstream first
  for (const b of L.order) {
    const items = b.items;
    if (!items.length) continue;
    if (T && !T(b)) continue;
    const nb = b.nb, len = b.len;
    let limit: number;
    if (nb) { const l = nb.items[nb.items.length - 1]; limit = l ? l.pos + len - SP : len + 0.99; } else limit = len;
    const mv = BLD[b.type].speed! * dt;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let np = it.pos + mv;
      const cap = i === 0 ? limit : items[i - 1].pos - SP;
      if (np > cap) np = cap;
      if (np > it.pos) it.pos = np;
    }
    while (items.length && items[0].pos >= len) {
      const it = items[0];
      if (nb) { it.pos -= len; items.shift(); nb.items.push(it); }
      else if (b.nbld && acceptInto(b.nbld, it.it, b.rot, b.srcX ?? b.x, b.srcY ?? b.y)) items.shift();
      else { it.pos = len; break; }
    }
  }
  updateTrains(dt);
  updateTrucks(dt);
  updateShips(dt);
  updateDrones(dt);
  // hand crafting (each team has its own queue)
  if (MP.teams) { for (const o of MP.teams.keys()) if (!MP.paused.has(o)) { useTeam(o); craftStep(dt); } useTeam(MP.myTeam); }
  else craftStep(dt);
}
function craftStep(dt: number) {
  const craft = myCraft();
  if (craft.q.length) {
    const r = RECIPES[craft.q[0]];
    if (!craft.active) {
      if (canAfford(r.in)) { pay(r.in); craft.active = true; craft.t = 0; }
      else { G.fx.toast(`Can't craft ${r.n}: need ${missingText(r.in)}`, 'bad'); craft.q.shift(); }
    } else {
      craft.t += dt;
      if (craft.t >= handTime(r)) { for (const k in r.out) addInv(k, r.out[k]); craft.q.shift(); craft.active = false; G.fx.sfx('craft'); }
    }
  }
}

function sorterStep(e: Ent) {
  const item = e.buf[0];
  const dirs = [e.rot, (e.rot + 3) & 3, (e.rot + 1) & 3];
  const exact: number[] = [], any: number[] = [], over: number[] = [];
  for (let i = 0; i < 3; i++) { const f = e.filt[i]; if (f === item) exact.push(i); else if (f === 'any') any.push(i); else if (f === 'overflow') over.push(i); }
  const tryList = (list: number[]) => {
    for (let k = 0; k < list.length; k++) {
      const i = list[(e.rr + k) % list.length], dd = dirs[i];
      if (deliverTo(e.x + DX[dd], e.y + DY[dd], dd, item, e.z || 0)) { e.rr++; return true; }
    }
    return false;
  };
  const ok = exact.length ? (tryList(exact) || tryList(over)) : (tryList(any) || tryList(over));
  if (ok) e.buf.shift();
}

function findTrees(e: Ent): number[] {
  const R = 8, cx = e.x + 1, cy = e.y + 1, out: [number, number][] = [];
  for (let y = Math.max(0, cy - R); y < Math.min(H, cy + R); y++) for (let x = Math.max(0, cx - R); x < Math.min(W, cx + R); x++) {
    const i = y * W + x;
    if (G.trees[i]) out.push([Math.hypot(x - cx, y - cy), i]);
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.map(o => o[1]);
}

function updateMachine(e: Ent, dt: number) {
  const r = e.recipe ? RECIPES[e.recipe] : null;
  const d = BLD[e.type];
  if (!r) { e.st = 'idle'; e.req = 0; e.eff += (0 - e.eff) * Math.min(1, dt / 8); return; }
  // fluid intake
  if (e.fnets && e.fnets.length) {
    for (const k in r.in) if (isFluid(k)) { const have = e.ib[k] || 0, cap = inCap(r, k); if (have < cap) e.ib[k] = have + pullFluid(e, k, cap - have); }
  }
  const sat = e.pnet ? e.pnet.sat : 0;
  const mult = e.amp ? 2 : 1;
  if (!e.pnet) e.st = 'nopower';
  if (e.work && e.pnet) {
    e.prog += dt * e.clock * sat / r.t;
    if (e.prog >= 1) {
      e.prog = 0; e.work = false; e.pop = 1;
      for (const k in r.out) { e.ob[k] = (e.ob[k] || 0) + r.out[k] * mult; stat(stats.P, k, r.out[k] * mult); }
    }
  }
  let blocked = false;
  if (!e.work) {
    for (const k in r.out) if ((e.ob[k] || 0) + r.out[k] * mult > outCap(r, k) * mult) { blocked = true; break; }
    if (!blocked && e.pnet) {
      let ok = true;
      for (const k in r.in) if ((e.ib[k] || 0) < r.in[k] - 1e-6) { ok = false; break; }
      if (ok) { for (const k in r.in) { e.ib[k] -= r.in[k]; stat(stats.C, k, r.in[k]); } e.work = true; }
    }
  }
  // outputs
  const inFluids = Object.keys(r.in).filter(isFluid);
  for (const k in r.out) {
    const have = e.ob[k] || 0;
    if (have <= 0) continue;
    if (isFluid(k)) e.ob[k] = have - pushFluid(e, k, have, inFluids);
    else if (have >= 1 && pushOut(e, k)) e.ob[k] = have - 1;
  }
  e.req = e.work ? d.power * clockPow(e.clock) * (e.amp ? 4 : 1) : 0;
  if (e.pnet) {
    e.pnet.demand += e.req;
    e.st = e.work ? (sat < 0.999 ? 'lowpower' : 'work') : blocked ? 'block' : 'starve';
  }
  e.eff += ((e.work ? sat : 0) - e.eff) * Math.min(1, dt / 8);
}
