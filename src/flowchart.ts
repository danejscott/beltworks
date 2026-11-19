// Production flow chart: the planner's result drawn as a graph, left to right — raw resources, each production step
// (machines x recipe), and the target at the right. Edges carry items, as thick as the flow, labelled with the rate.
import { BLD, isFluid, ITEMS } from './data';
import { machineName, Plan } from './planner';
import { esc, fmtR } from './util';

const NW = 196, NH = 70, CW = 280, RH = 88, PAD = 18;
interface Node { id: string; item: string; col: number; row: number; raw: boolean; y: number }

const MINER_RATE = 120;
const MINED = ['iron_ore', 'copper_ore', 'limestone', 'coal', 'caterium_ore', 'raw_quartz', 'bauxite', 'sulfur', 'uranium'];

export function flowChart(p: Plan, target: string, ic: (k: string, s: number) => string): string {
  if (!p.steps.length) return '<div class="dim">Nothing to make.</div>';
  const maxD = Math.max(...p.steps.map(s => s.depth));
  const nodes = new Map<string, Node>();
  for (const s of p.steps) nodes.set(s.item, { id: s.item, item: s.item, col: maxD + 1 - s.depth, row: 0, raw: false, y: 0 });
  for (const k in p.raw) nodes.set('raw:' + k, { id: 'raw:' + k, item: k, col: 0, row: 0, raw: true, y: 0 });
  const edges = p.edges.filter(e => nodes.has(e.from) && nodes.has(e.to));
  // columns, then order each column by where its neighbours sit (a few sweeps both ways)
  const cols: Node[][] = [];
  for (const n of nodes.values()) (cols[n.col] ||= []).push(n);
  cols.forEach(c => c.forEach((n, i) => n.row = i));
  const nb = (n: Node, left: boolean) => edges.filter(e => (left ? e.to : e.from) === n.id).map(e => nodes.get(left ? e.from : e.to)!.row);
  for (let sweep = 0; sweep < 4; sweep++) {
    const order = sweep % 2 ? [...cols].reverse() : cols;
    for (const c of order) {
      if (!c) continue;
      for (const n of c) { const r = [...nb(n, true), ...nb(n, false)]; (n as any).bc = r.length ? r.reduce((a, b) => a + b, 0) / r.length : n.row; }
      c.sort((a, b) => (a as any).bc - (b as any).bc); c.forEach((n, i) => n.row = i);
    }
  }
  const tallest = Math.max(...cols.map(c => c ? c.length : 0));
  for (const c of cols) if (c) { const off = (tallest - c.length) * RH / 2; for (const n of c) n.y = PAD + off + n.row * RH; }
  const xOf = (n: Node) => PAD + n.col * CW;
  const Wd = PAD * 2 + (cols.length - 1) * CW + NW, Ht = PAD * 2 + tallest * RH - (RH - NH);
  // ports: spread the edges along each side, in the order of the node at the other end
  const outs = new Map<string, typeof edges>(), ins = new Map<string, typeof edges>();
  for (const e of edges) { (outs.get(e.from) || outs.set(e.from, []).get(e.from)!).push(e); (ins.get(e.to) || ins.set(e.to, []).get(e.to)!).push(e); }
  const portY = (list: typeof edges, e: (typeof edges)[0], n: Node, other: (x: (typeof edges)[0]) => Node) => {
    const sorted = [...list].sort((a, b) => other(a).y - other(b).y), k = sorted.indexOf(e);
    return n.y + NH * (k + 1) / (sorted.length + 1);
  };
  const maxRate = Math.max(...edges.map(e => e.rate), 1);
  let svg = '', labels = '';
  for (const e of edges) {
    const a = nodes.get(e.from)!, b = nodes.get(e.to)!;
    const x1 = xOf(a) + NW, y1 = portY(outs.get(e.from)!, e, a, x => nodes.get(x.to)!);
    const x2 = xOf(b), y2 = portY(ins.get(e.to)!, e, b, x => nodes.get(x.from)!);
    const mx = (x1 + x2) / 2, w = 1.6 + 6 * Math.sqrt(e.rate / maxRate);
    const col = (ITEMS[e.item] && ITEMS[e.item].c) || '#9b9484';
    svg += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" stroke="${col}" stroke-opacity=".75" stroke-width="${w.toFixed(1)}" fill="none"/>`;
    svg += `<circle cx="${x2}" cy="${y2}" r="3" fill="${col}"/>`;
    const lx = x1 + (x2 - x1) * 0.5, ly = (y1 + y2) / 2;
    labels += `<div class="fl-lab" style="left:${lx}px;top:${ly}px">${fmtR(e.rate)}${isFluid(e.item) ? ' m³' : ''}/min</div>`;
  }
  let html = '';
  for (const n of nodes.values()) {
    const x = xOf(n), it = ITEMS[n.item];
    if (n.raw) {
      const r = p.raw[n.item];
      const hint = MINED.includes(n.item) ? `≈ ${fmtR(r / MINER_RATE)} Mk1 miners (normal node)` : n.item === 'water' ? `≈ ${fmtR(r / 120)} Water Extractors` : 'raw input';
      html += `<div class="fl-node raw" style="left:${x}px;top:${n.y}px"><div class="fl-h">${ic(n.item, 20)}<b>${esc(it.n)}</b></div><div class="fl-r">${fmtR(r)}/min</div><div class="fl-s">${hint}</div></div>`;
      continue;
    }
    const s = p.steps.find(q => q.item === n.item)!;
    const full = Math.ceil(s.count - 1e-6), clock = s.count / full;
    const bys = Object.keys(s.recipe.out).filter(o => o !== s.item);
    html += `<div class="fl-node ${n.item === target ? 'tgt' : ''}" style="left:${x}px;top:${n.y}px"><div class="fl-h">${ic(n.item, 20)}<b>${esc(it.n)}</b><span class="fl-r">${fmtR(s.rate)}/min</span></div>
      <div class="fl-m"><b>${fmtR(s.count)}</b> × ${esc(machineName(s.machine))}</div>
      <div class="fl-s">${full} at ${Math.round(clock * 100)}% · ${fmtR(s.power)} MW${bys.length ? ` · +${bys.map(o => esc(ITEMS[o].n)).join(', ')}` : ''}</div></div>`;
  }
  return `<div class="flow" style="width:${Wd}px;height:${Ht}px"><svg width="${Wd}" height="${Ht}" class="fl-svg">${svg}</svg>${labels}${html}</div>`;
}
export const FLOW_CSS = `.flowwrap{overflow:auto;max-height:62vh;border:1px solid var(--line);background:#141311 linear-gradient(#ffffff06 1px,transparent 1px) 0 0/22px 22px,linear-gradient(90deg,#ffffff06 1px,transparent 1px) 0 0/22px 22px;border-radius:2px;margin-top:8px}
.flow{position:relative}.fl-svg{position:absolute;inset:0}
.fl-node{position:absolute;width:${NW}px;height:${NH}px;background:#22201c;border:1px solid #4a453c;border-left:3px solid #6c9ec4;padding:5px 8px;display:flex;flex-direction:column;gap:1px;font-size:12px;overflow:hidden}
.fl-node.raw{border-left-color:#8a7a5a;background:#1c1b18}.fl-node.tgt{border-color:var(--accent);border-left-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.fl-h{display:flex;align-items:center;gap:5px;white-space:nowrap}.fl-h b{overflow:hidden;text-overflow:ellipsis;flex:1}
.fl-r{font-variant-numeric:tabular-nums;color:#ffcf73;font-weight:600}.fl-m{color:#e8e3d6}.fl-s{color:var(--dim);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fl-lab{position:absolute;transform:translate(-50%,-50%);font-size:10.5px;background:#141311e6;color:#cfc7b6;padding:0 4px;border:1px solid #3a3630;white-space:nowrap;font-variant-numeric:tabular-nums;pointer-events:none}`;
void BLD;
