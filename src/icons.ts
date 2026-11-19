// One line-icon set for the whole UI. The interface text was written with emoji; instead of hunting through every
// template, emoji that reach the page are swapped for these icons (same stroke, same size, coloured by the text
// around them), and the purely decorative ones are dropped.
const P: Record<string, string> = {
  train: '<rect x="6" y="3" width="12" height="13" rx="2"/><path d="M6 11h12M9 19l-2 2M15 19l2 2"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/><path d="M9 6h6"/>',
  truck: '<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  ship: '<path d="M3 15l2 5h14l2-5zM6 15V9h12v6M12 4v5M9 6h6"/>',
  drone: '<rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 9L6 6M15 9l3-3M9 15l-3 3M15 15l3 3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>',
  rocket: '<path d="M12 2c3 2.5 4.5 6 4.5 10v4h-9v-4C7.5 8 9 4.5 12 2z"/><circle cx="12" cy="9.5" r="1.6"/><path d="M7.5 13L5 16v3l2.5-1.5M16.5 13l2.5 3v3l-2.5-1.5M10 19.5l2 2.5 2-2.5"/>',
  home: '<path d="M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  gem: '<path d="M6 4h12l3 5-9 11L3 9zM3 9h18M9 4l3 5 3-5M12 9v11"/>',
  list: '<rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 4V2.5h6V4M8.5 10h7M8.5 14h7M8.5 18h4"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  device: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 017.5-2"/>',
  team: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c.5-4 3-6 5.5-6s5 2 5.5 6M14 14.5c3 0 5.5 1.5 6 5"/>',
  pick: '<path d="M4 7c5-4 11-4 16 0M12 5l-1 2M12 6L5 21"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 10a1.5 1.5 0 001.3 2h11.4A1.5 1.5 0 0019 19l-5-10V3M7.5 15h9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  daynight: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" fill="currentColor"/>',
  coupon: '<path d="M3 7h18v3a2 2 0 000 4v3H3v-3a2 2 0 000-4z"/><path d="M14 7v10" stroke-dasharray="2 2"/>',
  crown: '<path d="M3 18h18M4 18L3 7l5 4 4-6 4 6 5-4-1 11"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  bulb: '<path d="M9 18h6M10 21h4M8.5 14.5A6 6 0 1115.5 14.5c-.8.8-1 1.5-1 2.5h-5c0-1-.2-1.7-1-2.5z"/>',
  antenna: '<path d="M5 19a9 9 0 010-14M19 5a9 9 0 010 14M8 16a5 5 0 010-8M16 8a5 5 0 010 8"/><circle cx="12" cy="12" r="1.5"/>',
  save: '<path d="M4 4h13l3 3v13H4z"/><path d="M8 4v5h8V4M7 20v-6h10v6"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2h4"/>',
  sprout: '<path d="M12 21v-9M12 12C12 7 8 5 4 5c0 4 3 7 8 7zM12 14c0-4 3-6 7-6 0 3.5-2.5 6-7 6z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/><circle cx="12" cy="12" r="7"/>',
  plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 01-12 0zM12 17v5"/>',
  rails: '<path d="M8 2L5 22M16 2l3 20M6.5 6h11M6 11h12M5.5 16h13"/>',
  flag: '<path d="M5 22V3M5 4h12l-2.5 4L17 12H5"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  flame: '<path d="M12 22c-4 0-7-3-7-7 0-4 3-6 4-10 2 2 3 4 3 6 1-1 2-2 2-4 3 2 5 5 5 8 0 4-3 7-7 7z"/>',
  factory: '<path d="M2 21V10l6 4V10l6 4V4h4v17zM2 21h20"/>',
  brush: '<path d="M19 3l2 2-9 9-2-2zM10 12c-3 0-5 2-5 5 0 1.5-1 3-3 3 4 1 9 0 10-4z"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  chart: '<path d="M3 3v18h18M7 16l4-5 3 3 6-7"/>',
  trophy: '<path d="M8 3h8v6a4 4 0 01-8 0zM8 5H4c0 3 1.5 5 4 5.5M16 5h4c0 3-1.5 5-4 5.5M12 13v4M8 21h8M9 17h6v4"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01M9 16h6"/><circle cx="12" cy="3.5" r="1"/>',
  water: '<path d="M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z"/>',
  barrel: '<ellipse cx="12" cy="5" rx="6" ry="2"/><path d="M6 5v14c0 1.1 2.7 2 6 2s6-.9 6-2V5M6 10c0 1.1 2.7 2 6 2s6-.9 6-2M6 15c0 1.1 2.7 2 6 2s6-.9 6-2"/>',
  recycle: '<path d="M7 19H4l3.5-6M17 19h3l-3.5-6M9 5l1.5-2.5h3L15 5M8 12l-2.5-4M16 12l2.5-4M9.5 19h5"/>',
  crane: '<path d="M6 21V3M3 21h6M6 3l14 4M6 7h14M18 7v6M16.5 13h3v2.5h-3z"/>',
  palette: '<path d="M12 3a9 9 0 000 18c1.5 0 2-1 2-2 0-1.5-1-1.8-1-3 0-1 1-2 2.5-2H18a3 3 0 003-3c0-4.5-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
  trash: '<path d="M4 6h16M9 6V3.5h6V6M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 21h8M12 16v5"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  pin: '<path d="M12 22s-7-7-7-12a7 7 0 0114 0c0 5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
  bag: '<path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 016 0v2"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  tree: '<path d="M12 2l6 8h-3l4 6H5l4-6H6zM12 16v6"/>',
  hammer: '<path d="M14 4l6 6-3 3-6-6zM11 7L3 15l3 3 8-8M15 3l2-1"/>',
  ffwd: '<path d="M3 6l8 6-8 6zM12 6l8 6-8 6z"/>',
  door: '<path d="M5 21V3h11v18M3 21h16M13 12h.01"/>',
  bolt2: '<path d="M14 3l7 7-11 11-7-7z"/><circle cx="14" cy="10" r="2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-3 1-3 2.3 0 3 6 1.6 6 4.6 0 1.4-1.3 2.4-3 2.4-1.2 0-2.3-.6-2.7-1.6M12 5.5v13"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 013 0V11M11 10V4a1.5 1.5 0 013 0v7M14 10.5V6a1.5 1.5 0 013 0v8c0 4-2.5 7-6 7s-5-2-6.5-5L3 13a1.5 1.5 0 012.5-1.5L8 14"/>',
  anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0014 0M8 10h8"/>',
  climb: '<path d="M4 20l5-7 3 3 4-8 4 12"/>',
  lift: '<rect x="6" y="3" width="12" height="18"/><path d="M12 3v18M9 8l1.5-1.5L12 8M15 16l-1.5 1.5L12 16"/>',
  axe: '<path d="M14 3c3 1 5 3 6 6l-5 1-2-2zM14 8L4 20"/>',
  hat: '<path d="M8 4h8v10H8zM4 14h16v2H4z"/>',
  loop: '<path d="M4 12a4 4 0 008 0 4 4 0 018 0 4 4 0 01-8 0 4 4 0 00-8 0z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  up: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 4v15M6 13l6 6 6-6"/>',
  warn: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>',
};
/** an icon as markup; size in px (defaults to the text size) */
export function icon(name: string, size?: number, cls = '') {
  const s = size ? ` width="${size}" height="${size}"` : '';
  return `<svg class="ico ${cls}"${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
// emoji -> icon ('' = drop it)
const E: Record<string, string> = {
  '🛸': 'drone', '🚀': 'rocket', '🏠': 'home', '🌐': 'globe', '💎': 'gem', '📋': 'list', '📁': 'folder', '📂': 'folder', '⚡': 'bolt',
  '📲': 'device', '📱': 'device', '🔒': 'lock', '🔓': 'unlock', '🤝': 'team', '👥': 'team', '⛏': 'pick', '🚂': 'train', '🚆': 'train', '🚚': 'truck',
  '🧪': 'flask', '☀': 'sun', '🎟': 'coupon', '👑': 'crown', '🧭': 'compass', '🌙': 'moon', '💡': 'bulb', '🚢': 'ship', '📡': 'antenna',
  '💾': 'save', '⏱': 'clock', '🌱': 'sprout', '⚙': 'gear', '🔌': 'plug', '🛤': 'rails', '⛺': 'flag', '📐': 'ruler', '🔥': 'flame',
  '🏭': 'factory', '🖌': 'brush', '🎲': 'dice', '🌗': 'daynight', '🎉': '', '🔗': 'link', '📊': 'chart', '📈': 'chart', '🥇': 'trophy',
  '🥈': 'trophy', '🥉': 'trophy', '🏅': 'trophy', '🏆': 'trophy', '🤖': 'robot', '➰': 'loop', '🧗': 'climb', '🛗': 'lift', '🪓': 'axe',
  '🎩': 'hat', '💧': 'water', '🛢': 'barrel', '♻': 'recycle', '🏗': 'crane', '🎨': 'palette', '🎥': 'camera', '🗑': 'trash', '💻': 'monitor',
  '🖥': 'monitor', '✅': 'check', '✖': 'cross', '📍': 'pin', '⏸': 'pause', '🗺': 'map', '🎒': 'bag', '🔊': 'sound', '🔇': 'mute',
  '🎵': 'music', '🌲': 'tree', '🔨': 'hammer', '⏩': 'ffwd', '🚪': 'door', '🔩': 'bolt2', '🔍': 'search', '🎯': 'target', '💰': 'coin',
  '🙋': 'hand', '⚓': 'anchor', '⭐': 'star', '🌟': 'star', '✨': '', '👋': '', '😀': '', '🙂': '', '👍': 'check', '⚠': 'warn',
};
const RE = /(?:[\u{1F000}-\u{1FAFF}]|[☀-➿]|⭐)️?/u;
const REG = /(?:[\u{1F000}-\u{1FAFF}]|[☀-➿]|⭐)️?\s?/gu;
// typographic symbols that already look fine as text
const KEEP = new Set(['✕', '✓', '✔', '☰', '★', '☆', '✦', '❯', '❮']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SVG', 'svg', 'CANVAS', 'OPTION']);

function fix(t: Text) {
  const s = t.data;
  if (!RE.test(s)) return;
  const p = t.parentNode as Element | null;
  if (!p || SKIP.has(p.nodeName)) return;
  if (p.nodeName === 'OPTION' || p.closest?.('select')) { t.data = s.replace(REG, m => KEEP.has(m.trim()) ? m : ''); return; }
  const frag = document.createDocumentFragment();
  let last = 0;
  s.replace(REG, (m, off: number) => {
    const ch = m.trim().replace('️', '');
    if (KEEP.has(ch)) return m;
    if (off > last) frag.appendChild(document.createTextNode(s.slice(last, off)));
    const name = E[ch];
    if (name) {
      const span = document.createElement('span'); span.className = 'icw';
      span.innerHTML = icon(name); frag.appendChild(span);
      if (m.endsWith(' ')) frag.appendChild(document.createTextNode(' '));
    }
    last = off + m.length;
    return m;
  });
  if (last === 0) return;
  if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
  p.replaceChild(frag, t);
}
function walk(n: Node) {
  if (n.nodeType === 3) { fix(n as Text); return; }
  if (n.nodeType !== 1 || SKIP.has(n.nodeName)) return;
  const el = n as Element;
  const ti = el.getAttribute('title'); if (ti && RE.test(ti)) el.setAttribute('title', ti.replace(REG, '').trim());
  const ph = el.getAttribute('placeholder'); if (ph && RE.test(ph)) el.setAttribute('placeholder', ph.replace(REG, '').trim());
  for (let c = n.firstChild; c;) { const nx = c.nextSibling; walk(c); c = nx; }
}
/** swap emoji for icons everywhere in the page, now and whenever the UI redraws */
export function initIcons() {
  walk(document.body);
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'characterData') fix(m.target as Text);
      else for (const n of m.addedNodes) walk(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
/** for canvas text and labels: the text without emoji */
export const noEmoji = (s: string) => s.replace(REG, '').trim();
