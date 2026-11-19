// Sound: ambience, oar strokes, lantern chimes, all made with Web Audio.
import { tune } from './config';
import { audioContext } from './hook';

/** The running audio graph, made on the first input. */
interface Audio { ac: AudioContext; out: GainNode; noise: AudioBuffer }
export let audio: Audio | null = null;
/** Whether sound is muted (M). */
export let muted = false;

/** White noise from a fixed LCG (sound only, never gameplay). */
export function noiseBuffer(ac: AudioContext, secs: number): AudioBuffer {
  const b = ac.createBuffer(1, Math.floor(ac.sampleRate * secs), ac.sampleRate), d = b.getChannelData(0);
  let x = 12345; for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = x / 0x3fffffff - 1; }
  return b;
}
/** Starts sound on the first input: lapping water and a soft drone. */
export function startAudio(): void {
  if (!audio) {
    const ac = audioContext();
    const out = ac.createGain(); out.gain.value = muted ? 0 : tune.volume;
    out.connect(ac.destination); audio = { ac, out, noise: noiseBuffer(ac, 2) };
    const src = ac.createBufferSource(); src.buffer = audio.noise; src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ac.createGain(); g.gain.value = 0.05; src.connect(lp).connect(g).connect(out); src.start();
    for (const [f, v] of [[110, 0.018], [164.8, 0.012], [220.5, 0.006]]) {
      const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = f; og.gain.value = v;
      o.connect(og).connect(out); o.start();
    }
  }
  if (audio.ac.state === 'suspended') void audio.ac.resume();
}
/** Mutes or unmutes everything. */
export function setMuted(m: boolean): void { muted = m; if (audio) audio.out.gain.value = m ? 0 : tune.volume; }
addEventListener('tune', () => setMuted(muted)); // the tweak panel moved a value: the volume follows
/** One soft note. */
export function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, delay = 0): void {
  if (!audio || muted) return;
  const t = audio.ac.currentTime + delay, o = audio.ac.createOscillator(), g = audio.ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.out); o.start(t); o.stop(t + dur);
}
/** A short burst of filtered noise: water. */
export function splash(vol = 0.12, freq = 900): void {
  if (!audio || muted) return;
  const t = audio.ac.currentTime, s = audio.ac.createBufferSource(), f = audio.ac.createBiquadFilter(), g = audio.ac.createGain();
  s.buffer = audio.noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  s.connect(f).connect(g).connect(audio.out); s.start(t, (t * 7) % 1.4); s.stop(t + 0.55);
}
/** The game's sounds. */
export const sfx = {
  stroke: (): void => splash(0.1, 700),
  light: (): void => [659.3, 987.8, 1318.5].forEach((f, i) => tone(f, 1.8 - i * 0.3, 'sine', 0.12, i * 0.09)),
  gate: (): void => { tone(98, 1.6, 'triangle', 0.18); [523.3, 784, 1046.5].forEach((f, i) => tone(f, 1.5, 'sine', 0.08, 0.3 + i * 0.15)); },
  bump: (): void => splash(0.08, 300),
  ending: (): void => [392, 493.9, 587.3, 784, 987.8].forEach((f, i) => tone(f, 5, 'sine', 0.09, i * 0.35)),
};
