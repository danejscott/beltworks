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
  } catch { AC = null; }
}
function tone(f: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, f2 = 0, delay = 0) {
  if (!AC || !audio.on) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
}
function hiss(dur: number, vol: number, freq: number, delay = 0) {
  if (!AC || !audio.on) return;
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
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
export function setSound(on: boolean) { audio.on = on; try { localStorage.setItem('bw-sound', on ? '1' : '0'); } catch { } }
