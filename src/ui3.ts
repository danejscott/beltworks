// Online HUD: the server badge (join code + who's here), chat, the players panel and the "disconnected" screen.
import { NET, sendChat } from './net';
import { fmtCode } from './online';
import { MP } from './teams';
import { G } from './world';
import { esc } from './util';
import { title } from './title';
import { EXTRA_MODALS, LIVE_MODALS } from './ui2';
import { openModal } from './ui';

const CSS = `
#netbar{position:fixed;left:50%;transform:translateX(-50%);top:46px;z-index:30;display:none;gap:8px;align-items:center;background:rgba(18,22,30,.88);border:1px solid #2c3442;border-radius:999px;padding:4px 12px;font-size:12px;color:#cfd6e2;cursor:pointer;backdrop-filter:blur(4px)}
#netbar b{color:#ffd48a;letter-spacing:.5px}#netbar .dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:2px;vertical-align:-1px}
#netbar .pl{display:inline-flex;gap:3px}
#chat{position:fixed;left:12px;bottom:118px;z-index:30;width:340px;max-width:calc(100vw - 24px);display:none;flex-direction:column;gap:3px;pointer-events:none}
#chat .msg{background:rgba(14,18,24,.78);border-radius:8px;padding:4px 8px;font-size:12.5px;color:#e4e8ef;transition:opacity 1s}
#chat .msg.old{opacity:0}#chat.typing .msg.old{opacity:1}
#chat input{pointer-events:auto;display:none;background:#10141b;border:1px solid #f5a524;border-radius:8px;color:#fff;padding:6px 8px;font-size:13px}
#chat.typing input{display:block}
#netdown{position:fixed;inset:0;z-index:95;display:none;align-items:center;justify-content:center;background:rgba(6,8,12,.72)}
#netdown .box{background:#161b24;border:1px solid #2c3442;border-radius:14px;padding:22px 26px;max-width:420px;text-align:center;color:#e4e8ef}
#netdown .box p{color:#aab3c2;font-size:14px}
.plrow{display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid #232a36}.plrow .sw{width:14px;height:14px;border-radius:4px}
.plrow .st{margin-left:auto;font-size:12px}.plrow .on{color:#4cc38a}.plrow .off{color:#7d8696}
`;
let built = false;
function build() {
  if (built) return; built = true;
  EXTRA_MODALS.players = playersHTML;
  LIVE_MODALS.add('players');
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const bar = document.createElement('div'); bar.id = 'netbar'; document.body.appendChild(bar);
  bar.addEventListener('pointerdown', () => openPlayers());
  const chat = document.createElement('div'); chat.id = 'chat';
  chat.innerHTML = '<div id="chatlog" style="display:flex;flex-direction:column;gap:3px"></div><input id="chatin" maxlength="200" placeholder="Say something… (Enter to send, Esc to cancel)">';
  document.body.appendChild(chat);
  const inp = chat.querySelector('#chatin') as HTMLInputElement;
  inp.addEventListener('keydown', ev => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { sendChat(inp.value); inp.value = ''; closeChat(); }
    else if (ev.key === 'Escape') { inp.value = ''; closeChat(); }
  });
  addEventListener('keydown', ev => {
    if (!NET.on || title.open || ev.key !== 'Enter') return;
    const tg = ev.target as HTMLElement;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
    ev.preventDefault(); openChat();
  });
  const down = document.createElement('div'); down.id = 'netdown'; document.body.appendChild(down);
}
function openChat() { const c = document.getElementById('chat')!; c.classList.add('typing'); (c.querySelector('#chatin') as HTMLInputElement).focus(); }
function closeChat() { const c = document.getElementById('chat')!; c.classList.remove('typing'); (c.querySelector('#chatin') as HTMLInputElement).blur(); }

/** show / hide the online HUD (called every so often from the UI tick) */
export function netHud() {
  build();
  const bar = document.getElementById('netbar')!, chat = document.getElementById('chat')!;
  const on = NET.on && NET.ready && !title.open;
  bar.style.display = on ? 'flex' : 'none';
  chat.style.display = on ? 'flex' : 'none';
  if (!on) return;
  const here = NET.players.filter(p => p.online);
  bar.innerHTML = `🌐 <b>${fmtCode(NET.code)}</b> <span class="pl">${here.map(p => `<span class="dot" style="background:${p.col}" title="${esc(p.name)}"></span>`).join('')}</span> ${here.length} online${NET.ping ? ` · ${NET.ping} ms` : ''}`;
}
export function refreshPlayers() { netHud(); }
export function chatMessage(c: { from: string; col: string; text: string }) {
  build();
  const log = document.getElementById('chatlog')!;
  const d = document.createElement('div'); d.className = 'msg';
  d.innerHTML = `<b style="color:${c.col}">${esc(c.from)}</b>: ${esc(c.text)}`;
  log.appendChild(d);
  while (log.children.length > 8) log.firstChild!.remove();
  setTimeout(() => d.classList.add('old'), 12000);
}

/** the players panel (click the server badge, or press Y) */
function playersHTML(): [string, string] {
  const teams = new Map<number, typeof NET.players>();
  for (const p of NET.players) { let l = teams.get(p.team); if (!l) teams.set(p.team, l = []); l.push(p); }
  let h = `<div id="plist"><p class="sm" style="margin-top:0">Share the join code <b style="color:#ffd48a;font-size:15px">${fmtCode(NET.code)}</b> — anyone with it can join this world and start their own base.</p>`;
  for (const [t, l] of teams) {
    const inf = MP.info.get(t), mine = t === MP.myTeam;
    h += `<div class="plrow"><span class="sw" style="background:${inf?.col || '#888'}"></span><b>${esc(inf?.name || 'Team ' + t)}</b>${mine ? ' <span class="dim">(you)</span>' : ''}<span class="st">Tier ${MP.teams?.get(t)?.maxTier ?? 0}</span></div>`;
    for (const p of l) h += `<div class="plrow" style="padding-left:24px"><span>${esc(p.name)}</span><span class="st ${p.online ? 'on' : 'off'}">${p.online ? '● online' : '○ offline (their factory is paused)'}</span></div>`;
  }
  h += `<p class="sm dim">Press <kbd>Enter</kbd> to chat.</p></div>`;
  return ['Players', h];
}
export function openPlayers() { if (NET.on) openModal('players'); }

/** lost the server: stop and offer a way out */
export function showDisconnected(msg: string, toTitle: () => void) {
  build();
  const d = document.getElementById('netdown')!;
  d.innerHTML = `<div class="box"><h2 style="margin-top:0">📡 Disconnected</h2><p>${esc(msg)}</p><p>Your base is safe on the server — it's paused while you're away.</p><button class="go big" id="nd-title">Back to the title screen</button></div>`;
  d.style.display = 'flex';
  (d.querySelector('#nd-title') as HTMLElement).onclick = () => { d.style.display = 'none'; toTitle(); };
}
void G;
