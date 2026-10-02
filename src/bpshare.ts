// Blueprint sharing: upload a blueprint to the relay and get a short code; anyone can import it with the code.
import { serverURL } from './net';

const httpBase = () => serverURL().replace(/^ws(s?):\/\//, 'http$1://').replace(/\/$/, '');
/** tidy a typed blueprint code ('' if it can't be one) */
export const normBPCode = (s: string) => { const c = s.toUpperCase().replace(/^BP-?/, '').replace(/[^A-Z0-9]/g, ''); return c.length === 6 ? c : ''; };
export const fmtBPCode = (c: string) => 'BP-' + c;

/** upload a blueprint; resolves to its code */
export async function shareBP(bp: any): Promise<string> {
  const body = JSON.stringify({ name: bp.name, w: bp.w, h: bp.h, ents: bp.ents, fl: bp.fl });
  if (body.length > 400_000) throw new Error('That blueprint is too big to share (try a smaller area)');
  // text/plain keeps it a "simple" request (no CORS preflight)
  const r = await fetch(httpBase() + '/bp', { method: 'POST', body, headers: { 'content-type': 'text/plain' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.code) throw new Error(j.err || 'Could not reach the Beltworks server');
  return j.code;
}
/** download a shared blueprint by its code */
export async function fetchBP(code: string): Promise<any> {
  const c = normBPCode(code);
  if (!c) throw new Error('Blueprint codes look like BP-K7QM2X');
  const r = await fetch(httpBase() + '/bp/' + c);
  if (r.status === 404) throw new Error('No blueprint has that code');
  if (!r.ok) throw new Error('Could not reach the Beltworks server');
  const bp = await r.json();
  if (!bp || !Array.isArray(bp.ents) || !(bp.w > 0) || !(bp.h > 0)) throw new Error('That blueprint is damaged');
  return bp;
}
