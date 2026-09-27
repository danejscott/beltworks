// Title screen: pick a saved world or create a new one (name, size, difficulty).
import { audioInit, sfx } from './audio';
import { deleteWorld, importSave, listWorlds, WorldMeta } from './save';
import { SIZES } from './terrain';
import { TIER_NAMES } from './data';
import { $, esc } from './util';

export const title = { open: false };
export interface NewWorldOpts { name: string; size: number; mode: string; dayNight: boolean }
let handlers: { play: (id: string) => void; create: (o: NewWorldOpts) => void; imported: () => void };
let sel = { size: 'medium', mode: 'easy', dn: 'on' };

export const MODES: Record<string, { label: string; icon: string; desc: string }> = {
  easy: { label: 'Easy', icon: '🌱', desc: 'Rich resources, lots of pure nodes, a generous starting kit. Trees grow back quickly.' },
  hard: { label: 'Hard', icon: '⛏️', desc: 'Scarce, mostly impure nodes and a small starting kit. Trees take ages to grow back.' },
  creative: { label: 'Creative', icon: '🎨', desc: 'Everything unlocked, unlimited materials, trees regrow fast. Just build.' },
};
const ADJ = ['Rusty', 'Copper', 'Iron', 'Misty', 'Golden', 'Quiet', 'Windy', 'Sunny', 'Humming', 'Silver', 'Northern', 'Lazy', 'Busy', 'Crimson'];
const NOUN = ['Valley', 'Ridge', 'Plains', 'Hollow', 'Basin', 'Meadow', 'Outpost', 'Frontier', 'Mesa', 'Harbor', 'Works', 'Crossing', 'Heights', 'Fields'];
const randName = () => `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`;
const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} days ago`;
};
const playTime = (t: number) => t < 3600 ? `${Math.floor(t / 60)} min` : `${(t / 3600).toFixed(1)} h`;

export async function showTitle(h: typeof handlers) {
  handlers = h;
  title.open = true;
  const el = $('#title');
  el.classList.remove('hidden');
  const worlds = await listWorlds();
  let list = '';
  if (!worlds.length) list = '<div class="empty">No worlds yet — create your first one on the right!</div>';
  for (const w of worlds) {
    const size = Object.values(SIZES).find(s => s.n === w.size)?.label || `${w.size}`;
    const m = MODES[w.mode] || MODES.easy;
    list += `<div class="wcard" data-tact="play:${w.id}">
      <div class="wmain"><div class="wname">${esc(w.name)}</div>
      <div class="wsub">${m.icon} ${m.label} · ${size} · Tier ${w.tier} ${TIER_NAMES[w.tier] ? '— ' + TIER_NAMES[w.tier] : ''}</div>
      <div class="wsub dim">Played ${playTime(w.time)} · last played ${ago(w.updated)}</div></div>
      <button class="go" data-tact="play:${w.id}">▶ Play</button><button class="danger mini" data-tact="del:${w.id}" title="Delete world">🗑</button></div>`;
  }
  el.innerHTML = `<div class="tpanel">
    <div class="tlogo">BELTWORKS</div><div class="ttag">Build it. Belt it. Automate everything.</div>
    <div class="tcols">
      <div class="tcol"><h3>Your worlds</h3><div class="wlist">${list}</div>
        <div class="row" style="margin-top:10px"><button data-tact="import">⬆ Import a save file</button></div></div>
      <div class="tcol"><h3>New world</h3>
        <label class="flabel">World name</label>
        <div class="row"><input id="wname" type="text" maxlength="28" value="${esc(randName())}" style="flex:1;font-size:15px"><button class="mini" data-tact="dice" title="Random name">🎲</button></div>
        <label class="flabel">Map size</label>
        <div class="opts">${Object.entries(SIZES).map(([k, s]) => `<div class="opt ${sel.size === k ? 'sel' : ''}" data-tact="size:${k}"><b>${s.label}</b><span>${s.desc}</span></div>`).join('')}</div>
        <label class="flabel">Difficulty</label>
        <div class="opts">${Object.entries(MODES).map(([k, m]) => `<div class="opt ${sel.mode === k ? 'sel' : ''}" data-tact="mode:${k}"><b>${m.icon} ${m.label}</b><span>${m.desc}</span></div>`).join('')}</div>
        <label class="flabel">Day / night cycle</label>
        <div class="opts two">${[['on', '🌗 On', 'A 12-minute day. Solar power only works in daylight.'], ['off', '☀️ Off', 'Always sunny. (You can change this later in the menu.)']].map(([k, l, d]) => `<div class="opt ${sel.dn === k ? 'sel' : ''}" data-tact="dn:${k}"><b>${l}</b><span>${d}</span></div>`).join('')}</div>
        <button class="go big" data-tact="create">Create world</button>
      </div>
    </div></div>`;
}
export function hideTitle() { title.open = false; $('#title').classList.add('hidden'); }

export function initTitle() {
  $('#title').addEventListener('pointerdown', async ev => {
    const a = (ev.target as HTMLElement).closest('[data-tact]') as HTMLElement | null;
    if (!a) return;
    audioInit();
    const [cmd, arg] = a.dataset.tact!.split(':');
    if (cmd === 'play') { sfx('click'); handlers.play(arg); }
    else if (cmd === 'del') {
      ev.stopPropagation();
      if (confirm('Delete this world forever? (Export it from the in-game menu first if you want a backup.)')) { await deleteWorld(arg); showTitle(handlers); }
    } else if (cmd === 'size' || cmd === 'mode' || cmd === 'dn') {
      (sel as any)[cmd] = arg; sfx('click');
      a.parentElement!.querySelectorAll('.opt').forEach(o => o.classList.toggle('sel', o === a));
    } else if (cmd === 'dice') { ($('#wname') as HTMLInputElement).value = randName(); sfx('click'); }
    else if (cmd === 'create') {
      const name = (($('#wname') as HTMLInputElement).value || '').trim() || randName();
      sfx('place');
      handlers.create({ name, size: SIZES[sel.size].n, mode: sel.mode, dayNight: sel.dn === 'on' });
    } else if (cmd === 'import') importSave(ok => { if (ok) handlers.imported(); else alert('That is not a valid Beltworks save file.'); });
  });
}
