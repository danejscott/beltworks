// Title screen: pick a saved world or create a new one (name, size, difficulty).
import { audioInit, sfx, startMusic } from './audio';
import { deleteWorld, importSave, listWorlds, WorldMeta } from './save';
import { SIZES } from './terrain';
import { TIER_NAMES } from './data';
import { DIFF } from './difficulty';
import { loadRecords } from './progress';
import { $, esc } from './util';
import { me, recentServers, saveMe, serverURL, setServerURL } from './net';
import { fmtCode, normCode, PLAYER_COLS } from './online';

export const title = { open: false };
export interface NewWorldOpts { name: string; size: number; mode: string; dayNight: boolean }
let handlers: { play: (id: string) => void; create: (o: NewWorldOpts) => void; imported: () => void; online: (o: { code?: string; create?: NewWorldOpts }) => void };
let sel = { size: 'medium', mode: 'normal', dn: 'on', tab: 'new', osize: 'large', omode: 'normal', odn: 'on', col: '' };

export const MODES = DIFF;
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
        <div class="row" style="margin-top:10px"><button data-tact="import">⬆ Import a save file</button></div>${bestsHTML()}</div>
      <div class="tcol"><div class="ttabs"><button class="${sel.tab === 'new' ? 'sel' : ''}" data-tact="tab:new">🌱 New world</button><button class="${sel.tab === 'online' ? 'sel' : ''}" data-tact="tab:online">🌐 Play online</button></div>
      ${sel.tab === 'online' ? onlineHTML() : `
        <label class="flabel">World name</label>
        <div class="row"><input id="wname" type="text" maxlength="28" value="${esc(randName())}" style="flex:1;font-size:15px"><button class="mini" data-tact="dice" title="Random name">🎲</button></div>
        <label class="flabel">Map size</label>
        <div class="opts">${Object.entries(SIZES).filter(([, s]) => !s.online).map(([k, s]) => `<div class="opt ${sel.size === k ? 'sel' : ''}" data-tact="size:${k}"><b>${s.label}</b><span>${s.desc}</span></div>`).join('')}</div>
        <label class="flabel">Difficulty</label>
        <div class="opts two">${Object.entries(MODES).map(([k, m]) => `<div class="opt ${sel.mode === k ? 'sel' : ''}" data-tact="mode:${k}"><b>${m.icon} ${m.label} <span class="hrs">${m.hours}</span></b><span>${m.desc}</span></div>`).join('')}</div>
        <label class="flabel">Day / night cycle</label>
        <div class="opts two">${[['on', '🌗 On', 'A 12-minute day. Solar power only works in daylight.'], ['off', '☀️ Off', 'Always sunny. (You can change this later in the menu.)']].map(([k, l, d]) => `<div class="opt ${sel.dn === k ? 'sel' : ''}" data-tact="dn:${k}"><b>${l}</b><span>${d}</span></div>`).join('')}</div>
        <button class="go big" data-tact="create">Create world</button>`}
      </div>
    </div></div>`;
}
function onlineHTML() {
  const p = me();
  if (!sel.col) sel.col = p.col || PLAYER_COLS[Math.floor(Math.random() * PLAYER_COLS.length)];
  const recent = recentServers();
  return `<p class="sm" style="margin:2px 0 8px">Build on a shared island with other players. Everyone starts their own base far apart and races to build the biggest empire. Worlds stay online forever; your base pauses while you're away.</p>
    <label class="flabel">Your name</label>
    <input id="oname" type="text" maxlength="24" value="${esc(p.name)}" placeholder="What should others call you?" style="width:100%;font-size:15px">
    <label class="flabel">Your colour <span class="dim">(your vehicles and base trim)</span></label>
    <div class="swatches">${PLAYER_COLS.map(c => `<span class="swatch ${c === sel.col ? 'sel' : ''}" data-tact="col:${c}" style="background:${c}"></span>`).join('')}</div>
    <label class="flabel">Join a world</label>
    <div class="row"><input id="ocode" type="text" maxlength="9" placeholder="Join code, e.g. K7QM-2XRP" style="flex:1;font-size:15px;text-transform:uppercase;letter-spacing:1px"><button class="go" data-tact="join">Join</button></div>
    ${recent.length ? `<div class="recent">${recent.map(r => `<div class="rrow" data-tact="joinc:${r.code}"><b>${esc(r.name)}</b> <span class="dim">${fmtCode(r.code)}</span><button class="mini go" data-tact="joinc:${r.code}">▶ Rejoin</button></div>`).join('')}</div>` : ''}
    <details class="ocreate"><summary><b>Create a new server</b></summary>
      <label class="flabel">World name</label>
      <div class="row"><input id="owname" type="text" maxlength="28" value="${esc(randName())}" style="flex:1;font-size:15px"><button class="mini" data-tact="odice">🎲</button></div>
      <label class="flabel">Map size</label>
      <div class="opts">${Object.entries(SIZES).map(([k, s]) => `<div class="opt ${sel.osize === k ? 'sel' : ''}" data-tact="osize:${k}"><b>${s.label}</b><span>${s.desc}</span></div>`).join('')}</div>
      <label class="flabel">Difficulty <span class="dim">(for everyone on the server)</span></label>
      <div class="opts two">${Object.entries(MODES).map(([k, m]) => `<div class="opt ${sel.omode === k ? 'sel' : ''}" data-tact="omode:${k}"><b>${m.icon} ${m.label}</b><span>${m.desc}</span></div>`).join('')}</div>
      <label class="flabel">Day / night cycle</label>
      <div class="opts two">${[['on', '🌗 On'], ['off', '☀️ Off']].map(([k, l]) => `<div class="opt ${sel.odn === k ? 'sel' : ''}" data-tact="odn:${k}"><b>${l}</b></div>`).join('')}</div>
      <button class="go big" data-tact="ocreate">Create server</button>
      <p class="sm dim">You'll get an 8-character join code to share. It never changes.</p>
    </details>
    <details class="sm dim" style="margin-top:8px"><summary>Server address</summary><div class="row"><input id="osrv" value="${esc(serverURL())}" style="flex:1"><button class="mini" data-tact="osrv">Save</button></div></details>`;
}
function onlineName(): string | null {
  const n = (($('#oname') as HTMLInputElement)?.value || '').trim();
  if (!n) { alert('Pick a name first — it floats above your base.'); ($('#oname') as HTMLInputElement)?.focus(); return null; }
  saveMe(n, sel.col);
  return n;
}
function bestsHTML() {
  const rec = loadRecords(), keys = Object.keys(rec);
  if (!keys.length) return '';
  const size = (n: number) => Object.values(SIZES).find(s => s.n === n)?.label || n;
  return `<h3 style="margin-top:14px">🏆 Personal bests</h3><div class="bests">${keys.map(k => { const [mode, sz] = k.split('|'); const r = rec[k]; const m = MODES[mode]; const h = Math.floor(r.t / 3600), mm = Math.floor(r.t / 60) % 60; return `<div>${m ? m.icon + ' ' + m.label : mode} · ${size(+sz)} <b>${h}h ${String(mm).padStart(2, '0')}m</b> <span class="dim">${esc(r.name)}</span></div>`; }).join('')}</div>`;
}
export function hideTitle() { title.open = false; $('#title').classList.add('hidden'); }

export function initTitle() {
  $('#title').addEventListener('pointerdown', async ev => {
    const a = (ev.target as HTMLElement).closest('[data-tact]') as HTMLElement | null;
    if (!a) return;
    audioInit(); startMusic();
    const [cmd, arg] = a.dataset.tact!.split(':');
    if (cmd === 'play') { sfx('click'); handlers.play(arg); }
    else if (cmd === 'tab') { const n = ($('#oname') as HTMLInputElement)?.value; if (n !== undefined) saveMe(n.trim(), sel.col); sel.tab = arg; sfx('click'); showTitle(handlers); }
    else if (cmd === 'col') { sel.col = arg; sfx('click'); a.parentElement!.querySelectorAll('.swatch').forEach(o => o.classList.toggle('sel', o === a)); }
    else if (cmd === 'osize' || cmd === 'omode' || cmd === 'odn') {
      (sel as any)[cmd] = arg; sfx('click');
      a.parentElement!.querySelectorAll('.opt').forEach(o => o.classList.toggle('sel', o === a));
    }
    else if (cmd === 'odice') { ($('#owname') as HTMLInputElement).value = randName(); sfx('click'); }
    else if (cmd === 'join' || cmd === 'joinc') {
      ev.stopPropagation();
      const code = cmd === 'joinc' ? arg : normCode(($('#ocode') as HTMLInputElement).value);
      if (!code) { alert('A join code is 8 letters and numbers, like K7QM-2XRP.'); return; }
      if (!onlineName()) return;
      sfx('place'); handlers.online({ code });
    }
    else if (cmd === 'ocreate') {
      if (!onlineName()) return;
      const name = (($('#owname') as HTMLInputElement).value || '').trim() || randName();
      sfx('place');
      handlers.online({ create: { name, size: SIZES[sel.osize].n, mode: sel.omode, dayNight: sel.odn === 'on' } });
    }
    else if (cmd === 'osrv') { setServerURL((($('#osrv') as HTMLInputElement).value || '').trim()); sfx('click'); showTitle(handlers); }
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
