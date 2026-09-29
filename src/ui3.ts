// Online HUD: the server badge (join code + who's here), chat, the players panel and the "disconnected" screen.
import { NET, sendChat } from './net';
import { empireScore, fmtCode } from './online';
import { inviteLink, inviteText } from './codes';
import { MP } from './teams';
import { G } from './world';
import { esc } from './util';
import { title } from './title';
import { EXTRA_MODALS, LIVE_MODALS } from './ui2';
import { openModal } from './ui';

const CSS = `
#netbar{position:fixed;left:50%;transform:translateX(-50%);top:46px;z-index:30;display:none;gap:8px;align-items:center;background:rgba(18,22,30,.88);border:1px solid #2c3442;border-radius:999px;padding:4px 12px;font-size:12px;color:#cfd6e2;cursor:pointer;backdrop-filter:blur(4px)}
#netbar b{color:#ffd48a;letter-spacing:.5px}#netbar button{font-size:11px;padding:2px 8px;border-radius:999px}#netbar .dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:2px;vertical-align:-1px}
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
  EXTRA_MODALS.invite = inviteHTML;
  LIVE_MODALS.add('players');
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const bar = document.createElement('div'); bar.id = 'netbar'; document.body.appendChild(bar);
  bar.addEventListener('pointerdown', ev => { const b = (ev.target as HTMLElement).closest('button'); if (b && b.dataset.nb === 'inv') copyInvite(); else openPlayers(); });
  bar.style.pointerEvents = 'auto';
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
  const html = `🌐 <b>${fmtCode(NET.code)}</b> <button data-nb="inv" title="Copy the join code, a link and instructions">📋 Invite</button> <span class="pl">${here.map(p => `<span class="dot" style="background:${p.col}" title="${esc(p.name)}"></span>`).join('')}</span> ${here.length} online${NET.ping ? ` · ${NET.ping} ms` : ''} <button data-nb="pl" title="Players, teams and leaderboard (Y)">👥 Players <kbd>Y</kbd></button>`;
  if (bar.innerHTML !== html) bar.innerHTML = html;
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

/** copy the join code, a link and how-to-join instructions to the clipboard */
export async function copyInvite() {
  const text = inviteText(NET.code, G.S.name || 'Beltworks');
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { }
  if (!ok) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch { }
    ta.remove();
  }
  if (ok) G.fx.toast(`📋 Invite copied — paste it to your friends (code <b>${fmtCode(NET.code)}</b> + link + how to join).`, 'good');
  else { inviteFallback = text; openModal('invite'); }
}
let inviteFallback = '';
function inviteHTML(): [string, string] {
  const text = inviteFallback || inviteText(NET.code, G.S.name || 'Beltworks');
  return ['Invite friends', `<p class="sm" style="margin-top:0">Your browser didn't let the game copy automatically. Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy this (it's already selected), then paste it to your friends:</p>
    <textarea id="invtext" readonly style="width:100%;height:170px;font-size:13px;background:#10141b;color:#e4e8ef;border:1px solid #2c3442;border-radius:8px;padding:8px">${esc(text)}</textarea>
    <p class="sm">Or just share the code <b style="color:#ffd48a">${fmtCode(NET.code)}</b> or the link <b>${esc(inviteLink(NET.code))}</b>.</p>`];
}
/** the players panel (click the server badge, or press Y) */
function playersHTML(): [string, string] {
  const teams = new Map<number, typeof NET.players>();
  for (const p of NET.players) { let l = teams.get(p.team); if (!l) teams.set(p.team, l = []); l.push(p); }
  const ranked = [...teams.keys()].map(t => ({ t, ...empireScore(t) })).sort((a, b) => b.score - a.score);
  const myMates = NET.players.filter(p => p.team === MP.myTeam).length;
  const mates = NET.players.filter(p => p.team === MP.myTeam && p.id !== MP.me).map(p => esc(p.name));
  let h = `<div id="plist"><div class="row" style="align-items:center;gap:10px;margin-bottom:6px"><span>Join code <b style="color:#ffd48a;font-size:16px;letter-spacing:1px">${fmtCode(NET.code)}</b></span><button class="go" data-act="invite">📋 Copy invite (code + link + how to join)</button></div>
    <p class="sm" style="margin-top:0">Anyone with the code can join at any time — even when you're offline — and starts their own base far away. ${mates.length ? `You're on a team with <b>${mates.join(', ')}</b>: you share inventory, research, power and colour.` : `You're playing on your own. Invite someone to your team with the button next to their name (they'll get a prompt to accept) — teams share everything.`}</p><h3 class="ch">🏆 Leaderboard</h3>`;
  ranked.forEach((r, i) => {
    const t = r.t, l = teams.get(t)!, inf = MP.info.get(t), mine = t === MP.myTeam;
    h += `<div class="plrow"${mine ? ' style="background:#2b261655"' : ''}><b style="width:22px">${i + 1}.</b><span class="sw" style="background:${inf?.col || '#888'}"></span><b>${esc(l.map(p => p.name).join(' & '))}</b>${mine ? ' <span class="dim">(you)</span>' : ''}<span class="st">Tier ${r.tier} · ${r.built} built · <b style="color:#ffd48a">${r.score.toLocaleString()}</b></span></div>`;
    for (const p of l) {
      const btn = !mine && p.online ? `<button class="mini" data-act="tinvite:${p.id}">Invite to my team</button>` : mine && p.id === MP.me && myMates > 1 ? `<button class="mini danger" data-act="tleave">Leave team</button>` : '';
      h += `<div class="plrow" style="padding-left:30px"><span>${esc(p.name)}</span>${btn}<span class="st ${p.online ? 'on' : 'off'}">${p.online ? '● online' : '○ offline (paused)'}</span></div>`;
    }
  });
  h += `<p class="sm dim">Score = tiers and milestones reached, plus the value of everything your factory has ever made, plus what you've built. Teams share everything: inventory, research, power and colour.</p>`;
  h += `<p class="sm dim">Press <kbd>Enter</kbd> to chat.</p></div>`;
  return ['Players', h];
}
export function openPlayers() { if (NET.on) openModal('players'); }

/** another player invited you to their team */
export function showInvite(m: { from: string; team: number; col: string }) {
  build();
  const d = document.createElement('div');
  d.className = 'toast big';
  d.style.cssText = 'position:fixed;left:50%;top:90px;transform:translateX(-50%);z-index:96;background:#161b24;border:1px solid ' + m.col + ';border-radius:12px;padding:12px 16px;color:#e4e8ef';
  d.innerHTML = `🤝 <b style="color:${m.col}">${esc(m.from)}</b> invited you to join their team. You'd share everything — inventory, research, power — and your base joins theirs. <div style="margin-top:8px;display:flex;gap:8px;justify-content:center"><button class="go" data-act="taccept:${m.team}">Join their team</button><button data-x="1">No thanks</button></div>`;
  document.body.appendChild(d);
  d.addEventListener('pointerdown', ev => { const t = ev.target as HTMLElement; if (t.closest('button')) setTimeout(() => d.remove(), 50); });
  setTimeout(() => d.remove(), 60000);
}

/** lost the server: stop and offer a way out */
export function showDisconnected(msg: string, toTitle: () => void) {
  build();
  const d = document.getElementById('netdown')!;
  d.innerHTML = `<div class="box"><h2 style="margin-top:0">📡 Disconnected</h2><p>${esc(msg)}</p><p>Your base is safe on the server — it's paused while you're away.</p><button class="go big" id="nd-title">Back to the title screen</button></div>`;
  d.style.display = 'flex';
  (d.querySelector('#nd-title') as HTMLElement).onclick = () => { d.style.display = 'none'; toTitle(); };
}
void G;
