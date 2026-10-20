// "Download the game": the website build is one self-contained HTML file, so the page can save a copy of itself.
// The downloaded file runs offline by double-clicking it (and can still join online worlds while it's up to date).
import { GAME_URL } from './codes';
import { esc } from './util';

export const FILE_NAME = 'Play Beltworks.html';
/** running from a downloaded copy (file://) rather than the website */
export const isFileCopy = () => location.protocol === 'file:';

/** save this page (the whole game) as "Play Beltworks.html" */
export async function downloadGame(): Promise<boolean> {
  try {
    const r = await fetch(location.href.split(/[?#]/)[0], { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const blob = new Blob([await r.text()], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = FILE_NAME;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return true;
  } catch (e) { console.warn('game download failed', e); return false; }
}

// ---- installing the website as an app (Chrome / Edge on computers and Android; Safari "Add to Home Screen" on
// iPhone / iPad). The browser offers the install itself; we keep its offer to show our own button.
let deferredInstall: any = null;
let onInstallChange: () => void = () => { };
/** playing as an installed app (its own window, from the Start menu / home screen) */
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** the browser will show its install prompt when asked */
export const canPromptInstall = () => !!deferredInstall;
export function initInstall(changed: () => void) {
  onInstallChange = changed;
  window.addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); deferredInstall = e; onInstallChange(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; onInstallChange(); });
  // the offline copy of the site (only on the website, not the downloaded file or the dev server)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !(import.meta as any).env?.DEV) navigator.serviceWorker.register('sw.js').catch(() => { });
}
/** ask the browser to install the app; false = it can't here (then show the steps instead) */
export async function promptInstall(): Promise<boolean> {
  if (!deferredInstall) return false;
  const e = deferredInstall; deferredInstall = null;
  e.prompt();
  try { await e.userChoice; } catch { }
  onInstallChange();
  return true;
}

/** what to send a friend: the link plus the same steps as the install guide */
export function shareText() {
  return `Play Beltworks (a 3D factory-building game) — free, no account needed.

Play in your browser: ${GAME_URL}

Install it as an app (plays offline, opens in its own window):
- Computer (Chrome or Edge): open the link and click "📲 Install app" on the title screen (or the install icon at the right end of the address bar).
- Android (Chrome): open the link, then menu ⋮ → "Install app" (or "Add to Home screen").
- iPhone / iPad (Safari): open the link, tap Share → "Add to Home Screen".

Or keep it as a single file: on the title screen click "⬇ Download the game", move "${FILE_NAME}" to your Desktop and double-click it to play.

Online worlds work from the app and the file too. Your worlds save on your device; use ☰ → Export save file to back them up or move them to another computer.`;
}

/** the install guide (shown after the download starts, or from the "How to install" link) */
export function installGuideHTML(started: boolean) {
  const app = [
    `<b>Computer (Chrome or Edge):</b> click <b>📲 Install app</b> on the title screen, or the install icon at the right end of the address bar. Beltworks then opens in its own window from your Start menu / Dock, like any other app.`,
    `<b>Android (Chrome):</b> menu <b>⋮</b> → <b>Install app</b> (or <b>Add to Home screen</b>).`,
    `<b>iPhone / iPad (Safari):</b> tap <b>Share</b> → <b>Add to Home Screen</b>.`,
    `The app <b>works offline</b> and updates itself whenever you open it with internet.`,
  ];
  const steps = [
    `${started ? 'Your download has started' : 'Click <b>⬇ Download the game</b>'}: the file <b>${FILE_NAME}</b> lands in your <b>Downloads</b> folder (about 1.3 MB).`,
    `Move it somewhere easy to find, like your <b>Desktop</b>. It's the whole game in one file: no installer and no account.`,
    `<b>Double-click it to play.</b> It opens in your web browser and works with no internet. Chrome or Edge work best (Firefox and Safari work too). If it opens in the wrong app, right-click it → <b>Open with</b> → Chrome.`,
    `Your worlds save in that browser automatically. To keep them safe, use <b>☰ → Export save file</b>, or <b>📁 Also save to a folder</b> on the title screen (Chrome/Edge).`,
    `<b>Online worlds</b> work from the file too. When the game is updated it will ask you to get the new version: download it again from <b>${esc(GAME_URL)}</b>, or play on the website (always the newest).`,
    `<b>Take an online world offline:</b> in the online world open <b>☰ → ⬇ Download a copy to this device</b>, then on the title screen use <b>⬆ Import a save file</b>. It becomes a single-player world you own.`,
  ];
  return `<div class="getgame-back" data-tact="ggclose" style="position:fixed;inset:0;background:#0009;display:flex;align-items:center;justify-content:center;z-index:50">
    <div class="tpanel" data-tact="ggstay" style="max-width:560px;width:calc(100% - 32px);max-height:calc(100% - 32px);overflow:auto;padding:22px 24px;text-align:left">
      <h3 style="margin-top:0">📲 Install Beltworks as an app <span class="dim" style="font-weight:normal">(recommended)</span></h3>
      <ul style="padding-left:20px;line-height:1.5">${app.map(s => `<li style="margin-bottom:6px">${s}</li>`).join('')}</ul>
      <h3>💾 Or keep it as a single file</h3>
      <ol style="padding-left:20px;line-height:1.5">${steps.map(s => `<li style="margin-bottom:8px">${s}</li>`).join('')}</ol>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">
        ${canPromptInstall() ? `<button class="go" data-tact="install">📲 Install app</button>` : ''}
        ${started ? '' : `<button data-tact="dlgame">⬇ Download the game</button>`}
        <button data-tact="ggshare" title="Copies the link and these steps, ready to paste into a text or email">📋 Copy link + steps for a friend</button>
        <button data-tact="ggclose">Close</button>
      </div>
    </div></div>`;
}
