// Synthesized sound effects (no audio files).
let AC: AudioContext | null = null, master: GainNode, noiseBuf: AudioBuffer;
export const audio = { on: true, vol: 0.55 };
try { audio.on = localStorage.getItem('bw-sound') !== '0'; } catch { }

export function audioInit() {
  if (AC) return;
  try {
    AC = new AudioContext(); master = AC.createGain(); master.gain.value = audio.vol; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.4, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    makeBuses();
  } catch { AC = null; }
}
function tone(f: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, f2 = 0, delay = 0) {
  if (!AC || !audio.on) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxBus || master); o.start(t); o.stop(t + dur + 0.03);
}
function hiss(dur: number, vol: number, freq: number, delay = 0) {
  if (!AC || !audio.on) return;
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus || master); s.start(t); s.stop(t + dur);
}
const last: Record<string, number> = {};
function throttle(k: string, ms: number) { const n = performance.now(); if (n - (last[k] || 0) < ms) return true; last[k] = n; return false; }

const S: Record<string, () => void> = {
  place() { tone(190, 0.14, 'sine', 0.45, 65); hiss(0.07, 0.25, 1800); tone(1300, 0.05, 'triangle', 0.05, 900, 0.03); },
  belt() { tone(560, 0.06, 'triangle', 0.14, 380); hiss(0.04, 0.08, 3000); },
  remove() { tone(330, 0.16, 'triangle', 0.18, 110); hiss(0.1, 0.12, 900); },
  mine() { tone(620 + Math.random() * 260, 0.05, 'square', 0.04, 350); hiss(0.05, 0.18, 2600 + Math.random() * 1500); },
  chop() { if (throttle('chop', 60)) return; hiss(0.12, 0.3, 700 + Math.random() * 300); tone(160, 0.1, 'triangle', 0.12, 90); },
  err() { if (throttle('err', 120)) return; tone(150, 0.12, 'square', 0.07, 110); },
  craft() { tone(880, 0.07, 'sine', 0.14, 1320); },
  click() { if (throttle('click', 30)) return; tone(1000, 0.03, 'sine', 0.05); },
  deliver() { if (throttle('deliver', 140)) return; tone(1500 + Math.random() * 500, 0.035, 'sine', 0.022); },
  coupon() { [1047, 1319, 1568].forEach((f, i) => tone(f, 0.25, 'sine', 0.12, 0, i * 0.06)); },
  milestone() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, 'triangle', 0.16, 0, i * 0.08)); hiss(0.4, 0.05, 6000); },
  tier() { [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tone(f, 0.5, 'triangle', 0.15, 0, i * 0.09); tone(f / 2, 0.5, 'sine', 0.1, 0, i * 0.09); }); },
  train() { if (throttle('train', 800)) return; tone(420, 0.35, 'sawtooth', 0.03, 400); tone(530, 0.35, 'sawtooth', 0.025, 520); },
  paste() { [440, 660, 880].forEach((f, i) => tone(f, 0.08, 'triangle', 0.1, 0, i * 0.04)); hiss(0.1, 0.1, 2000); },
};
export function sfx(name: string) { if (!AC || !audio.on) return; const f = S[name]; if (f) f(); }
export function setSound(on: boolean) { audio.on = on; try { localStorage.setItem('bw-sound', on ? '1' : '0'); } catch { } applyVolumes(); }

// ---------------------------------------------------------------------------
// Volume channels (saved per browser): effects, ambience, music
export const vol = { sfx: 0.8, amb: 0.6, music: 0.35 };
try { const v = JSON.parse(localStorage.getItem('bw-vol') || '{}'); Object.assign(vol, v); } catch { }
let sfxBus: GainNode, ambBus: GainNode, musBus: GainNode;
export function setVolume(k: 'sfx' | 'amb' | 'music', v: number) {
  vol[k] = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('bw-vol', JSON.stringify(vol)); } catch { }
  applyVolumes();
}
function applyVolumes() {
  if (!AC) return;
  const t = AC.currentTime, on = audio.on ? 1 : 0;
  sfxBus.gain.setTargetAtTime(vol.sfx * on, t, 0.05);
  ambBus.gain.setTargetAtTime(vol.amb * on * 0.9, t, 0.3);
  musBus.gain.setTargetAtTime(vol.music * on * 0.7, t, 0.3);
}
function makeBuses() {
  if (!AC || sfxBus) return;
  sfxBus = AC.createGain(); ambBus = AC.createGain(); musBus = AC.createGain();
  sfxBus.connect(master); ambBus.connect(master); musBus.connect(master);
  applyVolumes();
}

// ---------------------------------------------------------------------------
// Ambience: looping filtered noise layers + scheduled birds / crickets, mixed from what's around the camera
export interface AmbMix { wind: number; water: number; forest: number; desert: number; night: number; factory: number }
let amb: { wind: GainNode; windF: BiquadFilterNode; water: GainNode; sand: GainNode; hum: GainNode; humO: OscillatorNode } | null = null;
let ambMix: AmbMix = { wind: 0, water: 0, forest: 0, desert: 0, night: 0, factory: 0 };
function loopNoise(dur = 3) {
  const b = AC!.createBuffer(1, AC!.sampleRate * dur, AC!.sampleRate), d = b.getChannelData(0);
  let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = last * 0.97 + w * 0.03; d[i] = last * 6 + w * 0.15; }   // brown-ish noise
  const s = AC!.createBufferSource(); s.buffer = b; s.loop = true; s.start(); return s;
}
function startAmbience() {
  if (!AC || amb) return;
  makeBuses();
  const layer = (type: BiquadFilterType, f: number, q = 0.7) => { const src = loopNoise(), fl = AC!.createBiquadFilter(), g = AC!.createGain(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0; src.connect(fl); fl.connect(g); g.connect(ambBus); return { g, fl }; };
  const wind = layer('bandpass', 420, 0.6), water = layer('lowpass', 520, 0.8), sand = layer('highpass', 2600, 0.5);
  const humO = AC.createOscillator(), humF = AC.createBiquadFilter(), hum = AC.createGain();
  humO.type = 'sawtooth'; humO.frequency.value = 55; humF.type = 'lowpass'; humF.frequency.value = 180; hum.gain.value = 0;
  humO.connect(humF); humF.connect(hum); hum.connect(ambBus); humO.start();
  amb = { wind: wind.g, windF: wind.fl, water: water.g, sand: sand.g, hum, humO };
}
/** called a few times a second with what's around the camera (each 0..1) */
export function setAmbience(m: AmbMix) {
  ambMix = m;
  if (!AC || !amb) return;
  const t = AC.currentTime, k = 1.5;
  const gust = 0.75 + 0.25 * Math.sin(t * 0.37) * Math.sin(t * 0.11);
  amb.wind.gain.setTargetAtTime(0.05 + m.wind * 0.22 * gust, t, k);
  amb.windF.frequency.setTargetAtTime(300 + m.wind * 400 * gust, t, k);
  amb.water.gain.setTargetAtTime(m.water * 0.22 * (0.8 + 0.2 * Math.sin(t * 0.6)), t, k);
  amb.sand.gain.setTargetAtTime(m.desert * 0.035 * gust, t, k);
  amb.hum.gain.setTargetAtTime(m.factory * 0.05, t, k);
}
function chirp(t: number, f: number, n: number, vol: number, type: OscillatorType = 'sine') {
  for (let i = 0; i < n; i++) {
    const o = AC!.createOscillator(), g = AC!.createGain(), s = t + i * 0.09;
    o.type = type; o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(f * (1.2 + Math.random() * 0.4), s + 0.06);
    g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.08);
    o.connect(g); g.connect(ambBus); o.start(s); o.stop(s + 0.1);
  }
}
let nextCritter = 0;
function tickCritters() {
  if (!AC || !amb) return;
  const t = AC.currentTime;
  if (t < nextCritter) return;
  const m = ambMix;
  if (m.night > 0.5 && (m.forest + (1 - m.desert)) > 0.4) { chirp(t, 4200 + Math.random() * 400, 3 + (Math.random() * 3 | 0), 0.012, 'triangle'); nextCritter = t + 0.3 + Math.random() * 0.8; }   // crickets
  else if (m.night < 0.4 && m.forest > 0.15) { chirp(t, 1800 + Math.random() * 1600, 2 + (Math.random() * 4 | 0), 0.02 * Math.min(1, m.forest * 2)); nextCritter = t + 1.5 + Math.random() * 4 / (0.3 + m.forest); }  // birds
  else nextCritter = t + 2;
}

// ---------------------------------------------------------------------------
// Music: a slow, generated ambient score. Each tier gets a new key/mode and more layers.
const SCALES: number[][] = [[0, 2, 4, 7, 9], [0, 2, 3, 7, 9], [0, 2, 4, 6, 9], [0, 3, 5, 7, 10], [0, 2, 4, 7, 11], [0, 2, 5, 7, 9], [0, 1, 5, 7, 8], [0, 4, 6, 7, 11]];
const ROOTS = [57, 55, 60, 52, 57, 62, 55, 59];   // midi roots per tier
const PROG = [0, 3, 4, 2];                          // scale-degree progression
let musTier = 0, musNight = 0, nextBar = 0, bar = 0, musicOn = false;
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
function note(f: number, t: number, dur: number, v: number, type: OscillatorType, cutoff = 1800, detune = 0) {
  const o = AC!.createOscillator(), fl = AC!.createBiquadFilter(), g = AC!.createGain();
  o.type = type; o.frequency.value = f; o.detune.value = detune; fl.type = 'lowpass'; fl.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + Math.min(0.9, dur * 0.3)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); fl.connect(g); g.connect(musBus); o.start(t); o.stop(t + dur + 0.05);
}
export function setMusicState(tier: number, night: number) { musTier = Math.max(0, Math.min(7, tier)); musNight = night; }
function tickMusic() {
  if (!AC || !musicOn || vol.music <= 0 || !audio.on) return;
  const t = AC.currentTime;
  if (t < nextBar - 0.5) return;
  const start = Math.max(t + 0.05, nextBar), barLen = musNight > 0.5 ? 9 : 7.5;
  const sc = SCALES[musTier], root = ROOTS[musTier] - (musNight > 0.5 ? 3 : 0), deg = PROG[bar % PROG.length];
  const at = (d: number, oct = 0) => root + sc[((d % 5) + 5) % 5] + 12 * (Math.floor(d / 5) + oct);
  // pad: three soft notes of the chord
  for (const d of [deg, deg + 2, deg + 4]) { note(midi(at(d)), start, barLen + 1.5, 0.035, 'triangle', 900, -6); note(midi(at(d)), start, barLen + 1.5, 0.025, 'sine', 1200, 7); }
  if (musTier >= 2) for (let i = 0; i < 3; i++) if (Math.random() < 0.7) note(midi(at(deg + [4, 5, 7, 6][Math.random() * 4 | 0], 1)), start + 1 + i * barLen / 3.4, 2.2, 0.03, 'sine', 2600);  // sparse melody
  if (musTier >= 4) for (let i = 0; i < 4; i++) note(midi(at(deg, -1)), start + i * barLen / 4, barLen / 4.5, 0.035, 'sine', 400);                                          // bass pulse
  if (musTier >= 6) for (let i = 0; i < 8; i++) note(midi(at(deg + (i % 4) * 2, 1)), start + i * barLen / 8, 0.5, 0.012, 'square', 1500);                               // arpeggio
  nextBar = start + barLen; bar++;
}
export function startMusic() { musicOn = true; }
/** drive ambience and music (call every frame) */
export function audioTick() { if (!AC) return; if (!amb) startAmbience(); tickCritters(); tickMusic(); }
