// Background catch-up for online worlds. When this copy has to reload the world mid-game (it drifted from the others,
// or the connection dropped and came back), the save plus the actions since it are replayed here, off the main thread,
// so the game keeps drawing smoothly. The result comes back as a save that the page swaps in.
// The worker keeps its terrain between jobs (generating it is the slow part), so later reloads are quick.
import { applyCmd } from './cmd';
import { ensureTradePost } from './online';
import { deserialize, serialize } from './save';
import { update } from './sim';
import { MP } from './teams';
import { G } from './world';

let terrainSeed: number | null = null, terrainSize = 0;
const sync = () => { const p = MP.players.get(MP.me); if (p && p.team !== MP.myTeam) { MP.myTeam = p.team; G.dirty.links = true; } };

self.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  if (!m || m.t !== 'catch') return;
  try {
    const save = JSON.parse(m.save);
    MP.me = m.me;
    deserialize(save, terrainSeed === save.S.seed && terrainSize === save.S.size);
    terrainSeed = save.S.seed; terrainSize = save.S.size;
    ensureTradePost();
    G.dirty.links = true;
    sync();
    const log: [number, number, number, any][] = m.log;
    let tick: number = m.baseTick, k = 0;
    while (k < log.length && log[k][0] < tick) k++;
    while (tick < m.n) {
      let any = false;
      while (k < log.length && log[k][0] <= tick) { const [, , team, c] = log[k++]; applyCmd(c, false, team); any = true; }
      if (any) sync();
      update(1 / 60);
      tick++;
    }
    (self as any).postMessage({ t: 'done', job: m.job, tick, save: JSON.stringify(serialize()) });
  } catch (err) {
    terrainSeed = null;
    (self as any).postMessage({ t: 'fail', job: m.job, msg: String(err) });
  }
};
