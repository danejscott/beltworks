// Join codes: 8 characters, no look-alikes (0/O, 1/I/L). No imports, so the relay can use this too.
export const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode(rand: () => number = Math.random) { let s = ''; for (let i = 0; i < 8; i++) s += CODE_ABC[Math.floor(rand() * CODE_ABC.length)]; return s; }
export const fmtCode = (c: string) => c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c;
/** tidy what a player typed into a code (or '' if it can't be one) */
export function normCode(s: string) {
  const c = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 8 && [...c].every(ch => CODE_ABC.includes(ch)) ? c : '';
}

