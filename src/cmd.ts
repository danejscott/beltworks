// Commands: every change a player makes to the world goes through here as a small, serializable message.
// Single-player applies it at once; online, the server orders everyone's commands and every copy of the
// world applies the same list at the same tick (so all copies stay identical).
import { BLD, Cost, HANDCRAFT, ITEMS, RECIPES } from './data';
import { H, W } from './terrain';
import { DX, DY } from './util';
import { addWagon, buildRoute, addTrainToLine, lineOf, placeTrain, removeTrain, removeWagon, canPlaceTrain } from './trains';
import { buyTruck, removeTruck } from './trucks';
import { buyShip, removeShip } from './ships';
import { analyseDrive, collectCrystal, lootSite, pickAlt } from './explore';
import { buyShop, loadElevator, submitMilestone } from './progress';
import { flushNet, fluidsTouching, myCraft, setRecipe } from './sim';
import { asTeam, MP } from './teams';
import { nearRivalBase } from './online';
import { addInv, canAfford, canPlace, canRemove, chopTree, Ent, entAt, floorBlocked, G, groundOnly, hasFloor, markDirty, missingText, nodeAt, pairBit, PAIRS, pay, place, refund, remove, rotateEnt, setFloor } from './world';
import { clamp } from './util';

export type Cmd = { k: string; [x: string]: any };

let sender: ((c: Cmd) => void) | null = null;
/** online: commands go to the server instead of being applied here */
export function setSender(f: ((c: Cmd) => void) | null) { sender = f; }
export const online = () => !!sender;

/** issue a command as the local player */
export function run(c: Cmd): any {
  if (sender) { sender(c); return undefined; }
  return applyCmd(c, true, MP.myTeam);
}

let actorMe = true;
/** apply a command for a team; `me` = it came from this player (only they see its toasts and sounds) */
export function applyCmd(c: Cmd, me: boolean, team: number): any {
  const fx = G.fx, keep = { toast: fx.toast, sfx: fx.sfx, ui: fx.ui };
  const prevMe = actorMe;
  actorMe = me;
  if (!me) { fx.toast = () => { }; fx.sfx = () => { }; fx.ui = () => { }; }
  try { return asTeam(team, () => exec(c)); }
  catch (err) { console.warn('command failed', c.k, err); return undefined; }
  finally { actorMe = prevMe; fx.toast = keep.toast; fx.sfx = keep.sfx; fx.ui = keep.ui; }
}
const toast = (h: string, k = '') => G.fx.toast(h, k);
const sfx = (n: string) => G.fx.sfx(n);

/** does the current team own this? (single-player: always) */
export const owns = (e: any) => !!e && (!MP.teams || (e.o || 0) === MP.cur);
const NOT_YOURS = 'That belongs to another player';
function mine(e: Ent | null | undefined): e is Ent {
  if (!e) return false;
  if (!owns(e)) { toast(NOT_YOURS, 'bad'); sfx('err'); return false; }
  return true;
}
const ent = (id: any): Ent | null => G.ents.get(+id) || null;

// ---------------------------------------------------------------------------
/** can a belt/pipe/rail go on this tile (or upgrade the one there)? */
export function tileFree(x: number, y: number, kind: string, z: number) {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  if (MP.teams && nearRivalBase(x, y, 1, 1, MP.cur)) return false;
  const e = entAt(x, y, z);
  if (e) return BLD[e.type].kind === kind && !BLD[e.type].dz && owns(e);
  if (z > 0) return kind !== 'rail' && hasFloor(x, y, z);
  if (G.nodeGrid[y * W + x]) return false;
  return G.tiles[y * W + x] !== 6 || kind === 'rail';
}
/** When a drag meets existing track, make friendly two-way junctions instead of one-way turnouts / crossings. */
export function smartJunction(existing: number, add: number, path: { x: number; y: number; d: number }[], i: number): number {
  const straight = (a: number) => pairBit(a, (a + 2) & 3);
  let sides: number[] = [];
  for (let k = 0; k < 6; k++) if (add & (1 << k)) sides = [PAIRS[k][0], PAIRS[k][1]];
  if (sides.length !== 2) return add;
  const [a, b] = sides;
  const isStraight = ((a + 2) & 3) === b;
  if (isStraight) {
    const perp = straight((a + 1) & 3);
    if ((existing & perp) && (i === 0 || i === path.length - 1) && path.length > 1) {
      const toward = i === 0 ? path[0].d : (path[i - 1].d + 2) & 3;
      return pairBit(toward, (toward + 1) & 3) | pairBit(toward, (toward + 3) & 3);
    }
    return add;
  }
  let out = add;
  for (const [sIn, sOut] of [[a, b], [b, a]]) if (existing & straight(sIn)) out |= pairBit((sIn + 2) & 3, sOut);
  return out;
}
export function railPairsForPath(path: { x: number; y: number; d: number }[]) {
  const out: number[] = [];
  for (let i = 0; i < path.length; i++) {
    let entry: number, exit: number;
    if (path.length === 1) { exit = path[0].d; entry = (exit + 2) & 3; }
    else if (i === 0) { exit = path[0].d; entry = (exit + 2) & 3; }
    else { entry = (path[i - 1].d + 2) & 3; exit = i === path.length - 1 ? path[i - 1].d : path[i].d; }
    out.push(pairBit(entry, exit));
  }
  return out;
}

// ---------------------------------------------------------------------------
function dragLay(type: string, path: { x: number; y: number; d: number }[], z: number) {
  const d = BLD[type];
  if (!G.S.unlocked.has(type)) return;
  const at = (x: number, y: number) => entAt(x, y, z);
  let placed = 0, out = false;
  if (d.kind === 'belt') {
    for (const p of path) {
      if (!tileFree(p.x, p.y, 'belt', z)) continue;
      const e = at(p.x, p.y);
      if (e) {
        if (e.type === type) { if (e.rot !== p.d) { e.rot = p.d; markDirty('belt'); placed++; } }
        else { refund(BLD[e.type].cost); if (!canAfford(d.cost)) { pay(BLD[e.type].cost); out = true; break; } pay(d.cost); e.type = type; markDirty('belt'); placed++; }
      } else {
        if (!canAfford(d.cost)) { out = true; break; }
        place(type, p.x, p.y, p.d, { z }); placed++;
      }
    }
  } else if (d.kind === 'pipe') {
    const fl = fluidsTouching(path.map(p => [p.x, p.y]), null, z);
    if (fl.length > 1) { toast(`That would mix ${fl.map(f => ITEMS[f].n).join(' and ')}!`, 'bad'); sfx('err'); return; }
    for (const p of path) {
      if (!tileFree(p.x, p.y, 'pipe', z)) continue;
      const e = at(p.x, p.y);
      if (e) { if (e.type !== type) { refund(BLD[e.type].cost); if (!canAfford(d.cost)) { pay(BLD[e.type].cost); out = true; break; } pay(d.cost); e.type = type; markDirty('pipe'); placed++; } }
      else { if (!canAfford(d.cost)) { out = true; break; } place(type, p.x, p.y, 0, { z }); placed++; }
    }
  } else if (d.kind === 'rail') {
    if (z > 0) return;
    const pairs = railPairsForPath(path);
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      if (!tileFree(p.x, p.y, 'rail', 0)) continue;
      const e = at(p.x, p.y);
      if (e) { const np = e.pairs | smartJunction(e.pairs, pairs[i], path, i); if (np !== e.pairs) { e.pairs = np; placed++; markDirty('rail'); } }
      else { if (!canAfford(d.cost)) { out = true; break; } const r = place(type, p.x, p.y, 0); r.pairs = pairs[i]; placed++; markDirty('rail'); }
    }
  }
  if (placed) sfx('belt');
  if (out) { toast(`Out of materials: ${missingText(d.cost)}`, 'bad'); sfx('err'); }
}

function placeOne(c: Cmd) {
  const d = BLD[c.type];
  if (!d) return;
  const z = c.z || 0;
  let reason = canPlace(c.type, c.x, c.y, c.rot, { z });
  if (!reason && (d.kind === 'ptunnel' || d.kind === 'tank')) {
    const fl = fluidsTouching([[c.x, c.y], [c.x + d.w - 1, c.y + d.h - 1], [c.x + d.w - 1, c.y], [c.x, c.y + d.h - 1]], null, z);
    if (fl.length > 1) reason = 'That would mix fluids';
  }
  if (reason) { if (c.loud) { toast(reason, 'bad'); sfx('err'); } return; }
  const e = place(c.type, c.x, c.y, c.rot, { z });
  if (c.recipe && d.machine && G.S.unlocked.has(c.recipe)) setRecipe(e, c.recipe);
  if (c.clock && e.clock !== undefined) e.clock = Math.min(c.clock, 1);
  if (c.filt && e.filt) e.filt = [...c.filt];
  if (c.mode && e.mode) e.mode = c.mode;
  sfx('place');
  if (d.kind === 'extractor' && !G.S.flags.tipExtr) { G.S.flags.tipExtr = 1; toast('Connect a pipe to any side of the extractor.', ''); }
  return e;
}

function foundations(x0: number, y0: number, x1: number, y1: number, z: number) {
  const d = BLD.foundation;
  if (z === 0) { toast('Foundations go on upper floors — press PageUp (or ▲ on the floor buttons) first', 'bad'); sfx('err'); return; }
  if (!G.S.unlocked.has('foundation')) return;
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  if ((xb - xa + 1) * (yb - ya + 1) > 40000) return;
  let n = 0, out = false, why = '';
  for (let y = ya; y <= yb && !out; y++) for (let x = xa; x <= xb; x++) {
    const r = floorBlocked(x, y, z);
    if (r) { if (r !== 'Already has a foundation') why = r; continue; }
    if (!canAfford(d.cost)) { out = true; break; }
    pay(d.cost); setFloor(x, y, z, true); n++;
  }
  if (n) sfx('place');
  if (out) toast(`Out of materials: ${missingText(d.cost)}`, 'bad');
  else if (!n && why) { toast(why, 'bad'); sfx('err'); }
}

function deconRect(x0: number, y0: number, x1: number, y1: number, z: number) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  if ((xb - xa + 1) * (yb - ya + 1) > 40000) return;
  const seen = new Set<Ent>();
  let n = 0, wood = 0, blocked = '', decks = 0;
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const e = entAt(x, y, z);
    if (e && !seen.has(e)) {
      seen.add(e);
      if (!owns(e)) { blocked = NOT_YOURS; continue; }
      const why = canRemove(e); if (why) blocked = why; else if (remove(e, { quiet: seen.size > 40 })) n++;
    }
    if (z === 0 && G.trees[y * W + x]) wood += chopTree(x, y);
  }
  if (z > 0) for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (hasFloor(x, y, z) && !entAt(x, y, z)) { setFloor(x, y, z, false); refund(BLD.foundation.cost); decks++; }
  if (decks && !n) { sfx('remove'); toast(`Removed ${decks} foundation tile${decks > 1 ? 's' : ''}`, 'good'); }
  if (z === 0) for (const t of [...G.trains]) if (owns(t) && t.cells.some(c => { const cx = c % W, cy = Math.floor(c / W); return cx >= xa && cx <= xb && cy >= ya && cy <= yb; })) { removeTrain(t); n++; }
  if (n) { sfx('remove'); if (n > 1) toast(`Removed ${n} things (fully refunded)`, 'good'); }
  if (wood) toast(`+${wood} Wood`, 'good');
  if (blocked && !n) { toast(blocked, 'bad'); sfx('err'); }
}

function paste(bp: any, ox: number, oy: number, z: number) {
  const tileOK = (o: any) => {
    const d = BLD[o.t], x = ox + o.x, y = oy + o.y;
    if (!d || !G.S.unlocked.has(o.t)) return false;
    if (z > 0 && groundOnly(o.t)) return false;
    if (d.kind === 'rail' || d.kind === 'belt' || d.kind === 'pipe') return tileFree(x, y, d.kind, z);
    return !canPlace(o.t, x, y, o.r, { free: true, z });
  };
  let placed = 0, skipped = 0, broke = false;
  const order = [...bp.ents].sort((a: any, b: any) => (a.ex ? 1 : 0) - (b.ex ? 1 : 0));
  const need: Cost = {};
  for (const o of order) {
    if (!tileOK(o)) { skipped++; continue; }
    const d = BLD[o.t], x = ox + o.x, y = oy + o.y;
    const ex = entAt(x, y, z);
    if (ex && d.kind === 'rail') { ex.pairs |= o.pr || 0; markDirty('rail'); placed++; continue; }
    if (ex && d.kind === 'belt') { if (ex.rot !== o.r || ex.type !== o.t) { if (ex.type !== o.t) { refund(BLD[ex.type].cost); if (!canAfford(d.cost)) { pay(BLD[ex.type].cost); broke = true; break; } pay(d.cost); ex.type = o.t; } ex.rot = o.r; markDirty('belt'); } placed++; continue; }
    if (ex && d.kind === 'pipe') { placed++; continue; }
    if (!canAfford(d.cost)) { broke = true; for (const k in d.cost) need[k] = d.cost[k]; break; }
    const e = place(o.t, x, y, o.r, { quiet: bp.ents.length > 30, z });
    if (o.pr) { e.pairs = o.pr; markDirty('rail'); }
    if (o.rc && G.S.unlocked.has(o.rc)) setRecipe(e, o.rc);
    if (o.fl) e.filt = [...o.fl];
    if (o.md) e.mode = o.md;
    if (o.ck && e.clock !== undefined) e.clock = o.ck;
    placed++;
  }
  if (placed) { sfx('paste'); G.fx.ui('pasted', { x: ox + bp.w / 2, y: oy + bp.h / 2, w: bp.w, h: bp.h }); }
  let msg = `Pasted ${placed} piece${placed === 1 ? '' : 's'}`;
  if (skipped) msg += ` · ${skipped} blocked`;
  if (broke) msg += ` · ran out of materials (${missingText(need)})`;
  toast(msg, broke || skipped ? 'bad' : 'good');
}

function signal(x: number, y: number, sig: number, type: string) {
  const r = entAt(x, y);
  if (!r || r.type !== 'rail') { toast('Put signals on a railway tile', 'bad'); sfx('err'); return; }
  if (!mine(r)) return;
  if (r.sig === sig) { toast('That tile already has this signal', 'bad'); return; }
  const d = BLD[type];
  if (!d || !G.S.unlocked.has(type)) return;
  if (!canAfford(d.cost)) { toast('Need: ' + missingText(d.cost), 'bad'); sfx('err'); return; }
  if (r.sig) refund(BLD[r.sig === 1 ? 'rail_signal' : 'path_signal'].cost);
  pay(d.cost); r.sig = sig; markDirty('rail'); sfx('place');
}

const findTrain = (id: any) => G.trains.find(t => t.id === +id) || null;
const findTruck = (id: any) => G.trucks.find(t => t.id === +id) || null;
const findShip = (id: any) => G.ships.find((t: any) => t.id === +id) || null;
const feat = (id: any) => G.feats[+id - 1] || null;

// ---------------------------------------------------------------------------
function exec(c: Cmd): any {
  const S = G.S;
  switch (c.k) {
    // ---- building
    case 'place': return placeOne(c);
    case 'drag': return dragLay(c.type, (c.path as number[][]).slice(0, 400).map(([x, y, d]) => ({ x, y, d })), c.z || 0);
    case 'found': return foundations(c.x0, c.y0, c.x1, c.y1, c.z);
    case 'decon': return deconRect(c.x0, c.y0, c.x1, c.y1, c.z || 0);
    case 'paste': return paste(c.bp, c.ox, c.oy, c.z || 0);
    case 'signal': return signal(c.x, c.y, c.sig, c.type);
    case 'train': {
      if (!G.S.unlocked.has('locomotive')) return;
      const tr = placeTrain(c.x, c.y, c.rot);
      if (tr) G.fx.ui('train', tr);
      return tr;
    }
    case 'rm': {   // remove one building (or just the signal on a rail tile)
      const e = ent(c.id);
      if (!mine(e)) return;
      if (c.sig && e.type === 'rail' && e.sig) { refund(BLD[e.sig === 1 ? 'rail_signal' : 'path_signal'].cost); e.sig = 0; markDirty('rail'); sfx('remove'); return; }
      const why = canRemove(e);
      if (why) { toast(why, 'bad'); sfx('err'); return; }
      if (remove(e)) { sfx('remove'); G.fx.ui('removed', e); }
      return;
    }
    case 'rmv': {  // remove a vehicle
      const v = c.v === 't' ? findTrain(c.id) : c.v === 'k' ? findTruck(c.id) : findShip(c.id);
      if (!mine(v as any)) return;
      if (c.v === 't') removeTrain(v as any); else if (c.v === 'k') removeTruck(v as any); else removeShip(v as any);
      G.fx.ui('vremoved', v);
      return;
    }
    case 'rot': { const e = ent(c.id); if (mine(e) && rotateEnt(e, c.dir || 1)) sfx('click'); return; }
    // ---- gathering
    case 'mine': {
      const n = nodeAt(c.x, c.y);
      if (!n || n.res === 'crude_oil' || n.res === 'geyser' || entAt(c.x, c.y)) return;
      addInv(n.res, S.shop.pick ? 5 : 1); S.flags.mined = true;
      G.fx.ui('mined', n);
      return;
    }
    case 'chop': { if (G.trees[c.y * W + c.x] && !entAt(c.x, c.y)) chopTree(c.x, c.y); return; }
    case 'crystal': { const f = feat(c.f); if (f && f.kind === 'crystal' && !S.looted.includes(f.id)) collectCrystal(f); return; }
    case 'loot': {
      const f = feat(c.f);
      if (!f || f.kind !== 'site' || S.looted.includes(f.id)) { toast('Someone already looted that crash site', 'bad'); return; }
      const err = lootSite(f);
      if (err) { toast(err, 'bad'); sfx('err'); }
      else toast(`🛸 Looted! <b>+1 Hard Drive</b>${f.shards ? ` and <b>+${f.shards} Power Shard${f.shards > 1 ? 's' : ''}</b>` : ''}. Press <kbd>U</kbd> to research it.`, 'big');
      return;
    }
    // ---- machines
    case 'recipe': { const e = ent(c.id); if (mine(e) && BLD[e.type].machine && (!c.r || S.unlocked.has(c.r))) { setRecipe(e, c.r || null); sfx('click'); } return; }
    case 'shard': {
      const e = ent(c.id); if (!mine(e) || e.clock === undefined) return;
      if (c.n > 0 && (S.inv.power_shard || 0) > 0 && (e.shards || 0) < 3) { S.inv.power_shard--; e.shards = (e.shards || 0) + 1; sfx('craft'); }
      else if (c.n < 0 && e.shards > 0) { e.shards--; addInv('power_shard', 1); e.clock = Math.min(e.clock, 1 + 0.5 * e.shards); sfx('click'); }
      return;
    }
    case 'amp': {
      const e = ent(c.id); if (!mine(e) || !BLD[e.type].machine) return;
      if (e.amp) { e.amp = 0; addInv('amplifier', 1); } else if ((S.inv.amplifier || 0) > 0) { S.inv.amplifier--; e.amp = 1; sfx('craft'); }
      return;
    }
    case 'mode': { const e = ent(c.id); if (mine(e) && e.mode) { e.mode = c.m; sfx('click'); } return; }
    case 'collect': {
      const e = ent(c.id); if (!mine(e) || !e.store) return;
      let n = 0; for (const k in e.store) { addInv(k, e.store[k]); n += e.store[k]; } e.store = {}; e.tot = 0;
      sfx('craft'); toast(`Moved ${n} items to inventory`, 'good');
      return;
    }
    case 'fuel': {
      const e = ent(c.id); if (!mine(e)) return;
      const d = BLD[e.type]; let moved = 0;
      for (const k in d.fuels) { let tot = 0; for (const q in e.fbuf) tot += e.fbuf[q]; const n = Math.min(Math.floor(S.inv[k] || 0), 50 - tot); if (n > 0) { S.inv[k] -= n; e.fbuf[k] = (e.fbuf[k] || 0) + n; moved += n; } }
      toast(moved ? `Loaded ${moved} fuel` : 'No fuel in inventory — chop trees for Wood', moved ? 'good' : 'bad'); sfx(moved ? 'craft' : 'err');
      return;
    }
    case 'flush': { const e = ent(c.id); if (mine(e) && e.fnet) { flushNet(e.fnet); sfx('remove'); toast('Network flushed', 'good'); } return; }
    case 'set': {   // a setting typed or picked in the inspector
      const e = ent(c.id); if (!mine(e)) return;
      const v = c.v;
      if (c.f === 'clock' && e.clock !== undefined) e.clock = clamp(+v, 0.01, 1 + 0.5 * (e.shards || 0));
      else if (c.f === 'filt' && e.filt) e.filt[clamp(+c.i | 0, 0, 2)] = String(v);
      else if (c.f === 'name' && e.name !== undefined) e.name = String(v).slice(0, 40) || e.name;
      else if (c.f === 'target' || c.f === 'routeTo' || c.f === 'truckTo' || c.f === 'shipTo') e[c.f] = +v;
      return;
    }
    // ---- progress
    case 'submit': return submitMilestone(c.m);
    case 'loadElev': return loadElevator();
    case 'craft': {
      const r = RECIPES[c.r];
      if (!r || !HANDCRAFT.has(r.m) || !S.unlocked.has(r.id)) return;
      const q = myCraft(); for (let i = 0; i < clamp(c.n | 0, 1, 100); i++) q.q.push(c.r);
      sfx('click'); return;
    }
    case 'clearq': {
      const q = myCraft();
      if (q.active && q.q.length) { const r = RECIPES[q.q[0]]; for (const k in r.in) addInv(k, r.in[k]); }
      q.q = []; q.active = false; return;
    }
    case 'buy': return buyShop(c.s);
    case 'analyse': { const err = analyseDrive(); if (err) { toast(err, 'bad'); sfx('err'); } else sfx('craft'); return; }
    case 'pickalt': return pickAlt(c.a);
    case 'disc': {   // things this team has discovered (scanner, exploring)
      const dn = G.S.discN, df = G.S.discF;
      for (const i of c.n || []) if (!dn.includes(i)) dn.push(i);
      for (const i of c.f || []) if (!df.includes(i)) df.push(i);
      return;
    }
    // ---- trains
    case 'route': {
      const e = ent(c.id), tgt = ent(c.to);
      if (!mine(e) || !tgt || !owns(tgt)) return;
      const err = buildRoute(e, tgt, !!c.train);
      if (err) { toast(err, 'bad'); sfx('err'); }
      else { toast(c.train ? `🚆 Track laid and a train is running between <b>${e.name}</b> and <b>${tgt.name}</b>!` : `Track laid to <b>${tgt.name}</b>`, 'good'); sfx('paste'); }
      return;
    }
    case 'lineadd': { const l = lineOf(+c.l); if (l) { const err = addTrainToLine(l); if (err) { toast('Can\'t add a train: ' + err, 'bad'); sfx('err'); } else toast('🚂 Another train joined the line', 'good'); } return; }
    case 'wagon': { const t = findTrain(c.t); if (mine(t as any)) { if (c.n > 0) addWagon(t!); else removeWagon(t!); } return; }
    case 'trun': { const t = findTrain(c.t); if (mine(t as any)) { t!.running = !t!.running; if (t!.running) { t!.state = 'idle'; t!.waitT = 99; } sfx('click'); } return; }
    case 'tup': { const t = findTrain(c.t); if (!mine(t as any)) return; const i = +c.i; if (i > 0) { const s = t!.sched.splice(i, 1)[0]; t!.sched.splice(i - 1, 0, s); } else { const s = t!.sched.shift()!; t!.sched.push(s); } return; }
    case 'tdel': { const t = findTrain(c.t); if (!mine(t as any)) return; t!.sched.splice(+c.i, 1); if (t!.si >= t!.sched.length) t!.si = 0; t!.state = 'idle'; t!.waitT = 99; return; }
    case 'tname': { const t = findTrain(c.t); if (mine(t as any)) t!.name = String(c.v).slice(0, 40) || t!.name; return; }
    case 'tstop': {
      const t = findTrain(c.t), st = ent(c.v); if (!mine(t as any) || !st || !owns(st)) return;
      t!.sched.push(st.id); if (t!.state === 'noschedule' || t!.state === 'nopath') { t!.state = 'idle'; t!.waitT = 99; } sfx('click'); return;
    }
    // ---- trucks & ships
    case 'buytruck': case 'buyship': {
      const e = ent(c.id), tgt = c.to ? ent(c.to) : null;
      if (!mine(e) || (tgt && !owns(tgt))) return;
      const err = c.k === 'buytruck' ? buyTruck(e, tgt) : buyShip(e, tgt);
      if (err) { toast(err, 'bad'); sfx('err'); }
      else toast(c.k === 'buytruck' ? `🚚 A truck is on its way${tgt ? ` between <b>${e.name}</b> and <b>${tgt.name}</b>` : ''}!` : `🚢 A ship is sailing${tgt ? ` between <b>${e.name}</b> and <b>${tgt.name}</b>` : ''}!`, 'good');
      return;
    }
    case 'vdel': {  // drop a stop from a truck's / ship's schedule
      const v: any = c.v === 'k' ? findTruck(c.id) : findShip(c.id); if (!mine(v)) return;
      v.sched.splice(+c.i, 1); if (v.si >= v.sched.length) v.si = 0; v.state = 'idle'; v.retryT = 0; return;
    }
    case 'vstop': {
      const v: any = c.v === 'k' ? findTruck(c.id) : findShip(c.id), st = ent(c.to); if (!mine(v) || !st || !owns(st)) return;
      if (!v.sched.includes(st.id)) v.sched.push(st.id);
      if (v.state === 'noschedule' || v.state === 'nopath') { v.state = 'idle'; v.retryT = 0; }
      sfx('click'); return;
    }
    case 'vname': { const v: any = c.v === 'k' ? findTruck(c.id) : findShip(c.id); if (mine(v)) v.name = String(c.name).slice(0, 40) || v.name; return; }
    // ---- system messages from the server (never accepted from players)
    case '_presence': {
      MP.paused = new Set(c.paused);
      for (const p of MP.players.values()) p.online = c.online.includes(p.id);
      return;
    }
    // ---- world settings (single-player only; servers fix these when they're created)
    case 'speed': if (!MP.teams) S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 4 : 1; return;
    case 'dn': if (!MP.teams) S.dayNight = !S.dayNight; return;
  }
}
export { canPlaceTrain };
