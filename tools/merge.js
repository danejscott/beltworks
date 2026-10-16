// Playthrough: feed more lines into an existing belt that already reaches the elevator, through mergers.
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
/** follow belts from (x, y) to the end; returns the list of belt entities */
export function trace(x, y) {
  const { G, TER } = window.BW, W = TER.W, out = [];
  for (let k = 0; k < 2000; k++) {
    const id = G.grid[y * W + x], e = id && G.ents.get(id);
    if (!e || !e.type.startsWith('belt')) break;
    out.push(e); x += DX[e.rot]; y += DY[e.rot];
  }
  return out;
}
/** turn the belt tile `back` tiles before the end of a line into a merger; returns its two side ports */
export function mergerOn(P, line, back) {
  const { CMD } = window.BW;
  const b = line[line.length - 1 - back], r = b.rot, x = b.x, y = b.y;
  CMD.run({ k: 'rm', id: b.id });
  const m = P.put('merger', x, y, r);
  if (!m) return null;
  const L = (r + 3) & 3, R = (r + 1) & 3;
  return { m, ports: [[x + DX[L], y + DY[L], (L + 2) & 3], [x + DX[R], y + DY[R], (R + 2) & 3]] };
}
