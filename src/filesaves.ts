// Saves as real files. The browser's own storage is wiped when you clear browsing data, so worlds can also be kept
// as files in a folder you pick (e.g. Documents\Beltworks Saves). Every save writes the world's file there too, and
// the title screen lists (and loads) worlds from the folder — even after the browser's copy is gone.
// Uses the File System Access API (Chrome / Edge). The folder handle is remembered in the browser; if that's cleared
// as well, you pick the same folder again and everything in it comes back.

export interface FolderWorld { id: string; name: string; mode: string; size: number; tier: number; time: number; updated: number; created: number; file: string }
type Perm = 'granted' | 'prompt' | 'denied';
export const FS = {
  supported: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
  dir: null as any,          // FileSystemDirectoryHandle
  perm: 'prompt' as Perm,
  name: '',
};
const EXT = '.beltworks.json';

// the folder handle is kept in its own tiny IndexedDB database (so it doesn't mix with the saves)
function hdb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('beltworks-folder', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kv(op: 'get' | 'put', key: string, val?: any): Promise<any> {
  const d = await hdb();
  return new Promise((res, rej) => {
    const tx = d.transaction('kv', op === 'get' ? 'readonly' : 'readwrite'), st = tx.objectStore('kv');
    const r = op === 'get' ? st.get(key) : st.put(val, key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}

/** on start-up: find the folder chosen earlier (permission may need a click to renew) */
export async function restoreFolder() {
  if (!FS.supported) return;
  try {
    const h = await kv('get', 'dir');
    if (!h) return;
    FS.dir = h; FS.name = h.name;
    FS.perm = await h.queryPermission({ mode: 'readwrite' });
  } catch { FS.dir = null; }
}
/** pick (or re-pick) the save folder — must run from a click */
export async function chooseFolder(): Promise<boolean> {
  if (!FS.supported) return false;
  try {
    const h = await (window as any).showDirectoryPicker({ id: 'beltworks-saves', mode: 'readwrite', startIn: 'documents' });
    FS.dir = h; FS.name = h.name; FS.perm = 'granted';
    await kv('put', 'dir', h);
    return true;
  } catch { return false; }   // (cancelled)
}
/** the browser forgets folder permission between visits unless allowed for good: one click renews it */
export async function reconnectFolder(): Promise<boolean> {
  if (!FS.dir) return chooseFolder();
  try { FS.perm = await FS.dir.requestPermission({ mode: 'readwrite' }); } catch { FS.perm = 'denied'; }
  return FS.perm === 'granted';
}
export const folderReady = () => !!FS.dir && FS.perm === 'granted';

const safe = (s: string) => (s || 'World').replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').trim().slice(0, 40) || 'World';
const fileName = (name: string, id: string) => `${safe(name)} (${id})${EXT}`;

/** write one world's save file (meta first, so the list can be read without loading whole worlds) */
export async function writeWorldFile(meta: { id: string; name: string }, data: string) {
  if (!folderReady()) return;
  const want = fileName(meta.name, meta.id);
  const f = await FS.dir.getFileHandle(want, { create: true });
  const w = await f.createWritable();
  await w.write(`{"beltworks":1,"meta":${JSON.stringify(meta)},"save":${data}}`);
  await w.close();
  // renamed world: remove its old file
  for await (const [n] of FS.dir.entries()) if (n !== want && n.endsWith(`(${meta.id})${EXT}`)) { try { await FS.dir.removeEntry(n); } catch { } }
}
/** every world in the folder (just the summaries) */
export async function listFolderWorlds(): Promise<FolderWorld[]> {
  if (!folderReady()) return [];
  const out: FolderWorld[] = [];
  try {
    for await (const [n, h] of FS.dir.entries()) {
      if (h.kind !== 'file' || !n.endsWith(EXT)) continue;
      try {
        const file = await h.getFile();
        const head = await file.slice(0, 8192).text();
        const pre = '{"beltworks":1,"meta":', end = head.indexOf(',"save":');
        if (head.startsWith(pre) && end > 0) out.push({ ...JSON.parse(head.slice(pre.length, end)), file: n });
      } catch { }
    }
  } catch { }
  return out;
}
/** load one world's save from the folder */
export async function readWorldFile(id: string): Promise<any | null> {
  if (!folderReady()) return null;
  for await (const [n, h] of FS.dir.entries()) {
    if (h.kind === 'file' && n.endsWith(`(${id})${EXT}`)) { const o = JSON.parse(await (await h.getFile()).text()); return o.save; }
  }
  return null;
}
export async function deleteWorldFile(id: string) {
  if (!folderReady()) return;
  for await (const [n] of FS.dir.entries()) if (n.endsWith(`(${id})${EXT}`)) { try { await FS.dir.removeEntry(n); } catch { } }
}
