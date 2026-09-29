// Join codes: 8 characters, no look-alikes (0/O, 1/I/L). No imports, so the relay can use this too.
export const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode(rand: () => number = Math.random) { let s = ''; for (let i = 0; i < 8; i++) s += CODE_ABC[Math.floor(rand() * CODE_ABC.length)]; return s; }
/** where the game lives on the web */
export const GAME_URL = 'https://danejscott.github.io/beltworks/';
/** a link that opens the game with this world's code already filled in */
export const inviteLink = (code: string) => `${GAME_URL}?join=${code}`;
/** what to paste to a friend */
export function inviteText(code: string, world: string) {
  const c = fmtCode(code);
  return `Join my Beltworks world "${world}"!\n\n` +
    `1. Open ${inviteLink(code)}\n` +
    `2. On the title screen, go to 🌐 Play online (the link opens it for you), pick a name and a colour\n` +
    `3. The code ${c} is already filled in, just press Join. (Or type ${c} into "Join a world".)\n\n` +
    `Works in Chrome or Edge on a computer. Your base starts somewhere far from mine; your progress saves automatically, and your base pauses while you're offline.`;
}
export const fmtCode = (c: string) => c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c;
/** tidy what a player typed into a code (or '' if it can't be one) */
export function normCode(s: string) {
  const c = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 8 && [...c].every(ch => CODE_ABC.includes(ch)) ? c : '';
}

