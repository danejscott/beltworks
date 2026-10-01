// Shared blueprints: POST /bp (the blueprint as JSON) -> { code }, GET /bp/CODE -> the blueprint.
import { CODE_ABC } from '../src/codes';

export interface BPStore { get(code: string): Promise<string | undefined>; put(code: string, json: string): Promise<void> }
const CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
const json = (o: any, status = 200) => ({ status, headers: CORS, body: JSON.stringify(o) });

export async function handleBP(method: string, path: string, body: string, st: BPStore): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  if (method === 'OPTIONS') return { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type' }, body: '' };
  if (method === 'POST' && path === '/bp') {
    if (body.length > 400_000) return json({ err: 'That blueprint is too big to share' }, 413);
    let bp: any; try { bp = JSON.parse(body); } catch { return json({ err: 'Not a blueprint' }, 400); }
    if (!bp || !Array.isArray(bp.ents) || !bp.ents.length || !(bp.w > 0) || !(bp.h > 0)) return json({ err: 'Not a blueprint' }, 400);
    const clean = JSON.stringify({ name: String(bp.name || 'Shared blueprint').slice(0, 30), w: +bp.w, h: +bp.h, ents: bp.ents });
    for (let tries = 0; tries < 8; tries++) {
      let c = ''; for (let i = 0; i < 6; i++) c += CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)];
      if (await st.get(c)) continue;
      await st.put(c, clean);
      return json({ code: c });
    }
    return json({ err: 'Please try again' }, 500);
  }
  const m = /^\/bp\/([A-Z0-9]{6})$/.exec(path);
  if (method === 'GET' && m) {
    const v = await st.get(m[1]);
    return v ? { status: 200, headers: CORS, body: v } : json({ err: 'No blueprint has that code' }, 404);
  }
  return json({ err: 'Not found' }, 404);
}
