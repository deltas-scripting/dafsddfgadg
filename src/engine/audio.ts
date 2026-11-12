import * as THREE from 'three';
import { clamp } from './util';

export type Sfx =
  | 'ak'
  | 'pistol'
  | 'tool'
  | 'remove'
  | 'dry'
  | 'magOut'
  | 'magIn'
  | 'boltBack'
  | 'boltFwd'
  | 'swing'
  | 'knifeHit'
  | 'flesh'
  | 'sever'
  | 'headPop'
  | 'thud'
  | 'impact'
  | 'shell'
  | 'step'
  | 'land'
  | 'equip'
  | 'spawn'
  | 'splat'
  | 'uiHover'
  | 'uiClick'
  | 'explosion'
  | 'deny';

interface NoiseOpts {
  type?: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  gain: number;
  attack?: number;
  at?: number;
}
interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  gain: number;
  attack?: number;
  at?: number;
}

const _v = new THREE.Vector3();

/** Fully synthesised sound effects (WebAudio), so the game ships without audio assets. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private pos = new THREE.Vector3();
  private right = new THREE.Vector3(1, 0, 0);

  /** Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      master.connect(comp).connect(ctx.destination);
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setListener(camera: THREE.Camera) {
    camera.getWorldPosition(this.pos);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  }

  play(name: Sfx, o: { pos?: THREE.Vector3; vol?: number; rate?: number; gap?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (o.gap) {
      if (now - (this.last.get(name) ?? -1) < o.gap) return;
      this.last.set(name, now);
    }
    let vol = o.vol ?? 1;
    let pan = 0;
    if (o.pos) {
      _v.subVectors(o.pos, this.pos);
      const d = _v.length();
      vol *= 1 / (1 + (d / 7) ** 2);
      if (vol < 0.01) return;
      if (d > 0.3) pan = clamp(_v.dot(this.right) / d, -1, 1) * 0.75;
    }
    const out = ctx.createGain();
    out.gain.value = vol;
    if (pan !== 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p).connect(this.master);
    } else {
      out.connect(this.master);
    }
    RECIPES[name](this, out, now + 0.001, o.rate ?? 1);
  }

  noise(dest: AudioNode, t: number, dur: number, o: NoiseOpts) {
    const ctx = this.ctx!;
    const t0 = t + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + (o.attack ?? 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.02);
  }

  tone(dest: AudioNode, t: number, dur: number, o: ToneOpts) {
    const ctx = this.ctx!;
    const t0 = t + (o.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + (o.attack ?? 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}

type Recipe = (a: AudioEngine, d: AudioNode, t: number, r: number) => void;

const RECIPES: Record<Sfx, Recipe> = {
  ak: (a, d, t, r) => {
    a.noise(d, t, 0.24, { f0: 5200 * r, f1: 650, gain: 1 });
    a.noise(d, t, 0.05, { type: 'highpass', f0: 3200, gain: 0.6 });
    a.tone(d, t, 0.17, { f0: 175 * r, f1: 46, gain: 1 });
    a.tone(d, t, 0.07, { type: 'square', f0: 95, f1: 40, gain: 0.22 });
    a.noise(d, t, 0.5, { f0: 900, f1: 200, gain: 0.16, at: 0.05 });
  },
  pistol: (a, d, t, r) => {
    a.noise(d, t, 0.15, { f0: 6800 * r, f1: 1100, gain: 0.9 });
    a.noise(d, t, 0.035, { type: 'highpass', f0: 4200, gain: 0.5 });
    a.tone(d, t, 0.1, { f0: 270 * r, f1: 70, gain: 0.75 });
    a.noise(d, t, 0.35, { f0: 1200, f1: 300, gain: 0.1, at: 0.04 });
  },
  tool: (a, d, t, r) => {
    a.tone(d, t, 0.17, { type: 'sawtooth', f0: 300 * r, f1: 1500 * r, gain: 0.2 });
    a.tone(d, t, 0.24, { f0: 880 * r, f1: 2500 * r, gain: 0.18 });
    a.noise(d, t, 0.1, { type: 'bandpass', f0: 2600, q: 2, gain: 0.16 });
  },
  remove: (a, d, t) => {
    a.tone(d, t, 0.26, { type: 'sawtooth', f0: 1300, f1: 170, gain: 0.2 });
    a.noise(d, t, 0.2, { type: 'bandpass', f0: 3000, f1: 500, q: 2, gain: 0.2 });
  },
  dry: (a, d, t) => {
    a.noise(d, t, 0.025, { type: 'highpass', f0: 2600, gain: 0.4 });
    a.tone(d, t, 0.02, { type: 'square', f0: 1700, gain: 0.08 });
  },
  magOut: (a, d, t) => {
    a.noise(d, t, 0.06, { type: 'bandpass', f0: 1900, q: 2, gain: 0.5 });
    a.tone(d, t, 0.05, { type: 'triangle', f0: 310, f1: 180, gain: 0.2 });
  },
  magIn: (a, d, t) => {
    a.noise(d, t, 0.07, { type: 'bandpass', f0: 1250, q: 1.5, gain: 0.65 });
    a.tone(d, t, 0.06, { type: 'triangle', f0: 220, f1: 130, gain: 0.3 });
  },
  boltBack: (a, d, t) => {
    a.noise(d, t, 0.08, { type: 'bandpass', f0: 2600, f1: 1500, q: 2, gain: 0.55 });
    a.tone(d, t, 0.04, { type: 'square', f0: 520, f1: 300, gain: 0.07 });
  },
  boltFwd: (a, d, t) => {
    a.noise(d, t, 0.055, { type: 'bandpass', f0: 3300, q: 1.5, gain: 0.75 });
    a.tone(d, t, 0.05, { type: 'triangle', f0: 720, f1: 240, gain: 0.25 });
  },
  swing: (a, d, t, r) => {
    a.noise(d, t, 0.2, { type: 'bandpass', f0: 500 * r, f1: 2300 * r, q: 1.2, gain: 0.32, attack: 0.07 });
  },
  knifeHit: (a, d, t) => {
    a.noise(d, t, 0.12, { f0: 950, f1: 300, gain: 0.7 });
    a.tone(d, t, 0.1, { f0: 140, f1: 58, gain: 0.6 });
    a.noise(d, t, 0.06, { type: 'bandpass', f0: 2600, q: 2, gain: 0.22 });
  },
  flesh: (a, d, t, r) => {
    a.noise(d, t, 0.1, { type: 'bandpass', f0: 720 * r, f1: 280, q: 1.4, gain: 0.75 });
    a.tone(d, t, 0.08, { f0: 112 * r, f1: 54, gain: 0.5 });
  },
  sever: (a, d, t) => {
    a.noise(d, t, 0.26, { f0: 1500, f1: 280, gain: 0.85 });
    a.tone(d, t, 0.2, { f0: 92, f1: 40, gain: 0.6 });
    a.noise(d, t, 0.035, { type: 'highpass', f0: 1900, gain: 0.5, at: 0.012 });
    a.noise(d, t, 0.3, { type: 'bandpass', f0: 500, f1: 200, q: 3, gain: 0.3, at: 0.06 });
  },
  headPop: (a, d, t) => {
    a.noise(d, t, 0.32, { f0: 2300, f1: 190, gain: 1 });
    a.tone(d, t, 0.26, { f0: 150, f1: 34, gain: 0.9 });
    a.noise(d, t, 0.04, { type: 'highpass', f0: 2200, gain: 0.6 });
    a.noise(d, t, 0.4, { type: 'bandpass', f0: 420, f1: 160, q: 3, gain: 0.35, at: 0.08 });
  },
  thud: (a, d, t, r) => {
    a.tone(d, t, 0.19, { f0: 86 * r, f1: 38, gain: 0.8 });
    a.noise(d, t, 0.13, { f0: 420, f1: 160, gain: 0.5 });
  },
  impact: (a, d, t, r) => {
    a.noise(d, t, 0.06, { type: 'highpass', f0: 1800 * r, gain: 0.34 });
    a.tone(d, t, 0.035, { type: 'triangle', f0: 900 * r, f1: 300, gain: 0.14 });
    a.noise(d, t, 0.16, { f0: 700, f1: 250, gain: 0.14 });
  },
  shell: (a, d, t, r) => {
    a.tone(d, t, 0.06, { f0: 5200 * r, f1: 4300 * r, gain: 0.05 });
    a.tone(d, t, 0.035, { f0: 7400 * r, gain: 0.03 });
  },
  step: (a, d, t, r) => {
    a.noise(d, t, 0.08, { f0: 520 * r, f1: 190, gain: 0.26 });
    a.tone(d, t, 0.055, { f0: 96 * r, f1: 58, gain: 0.14 });
  },
  land: (a, d, t) => {
    a.noise(d, t, 0.14, { f0: 650, f1: 170, gain: 0.5 });
    a.tone(d, t, 0.12, { f0: 105, f1: 44, gain: 0.4 });
  },
  equip: (a, d, t) => {
    a.noise(d, t, 0.09, { type: 'bandpass', f0: 1500, f1: 900, q: 1, gain: 0.24, attack: 0.02 });
    a.noise(d, t, 0.03, { type: 'highpass', f0: 3000, gain: 0.18, at: 0.11 });
  },
  spawn: (a, d, t) => {
    a.tone(d, t, 0.2, { f0: 300, f1: 920, gain: 0.17 });
    a.tone(d, t, 0.2, { f0: 600, f1: 1840, gain: 0.07 });
    a.noise(d, t, 0.18, { type: 'bandpass', f0: 1200, f1: 4000, q: 3, gain: 0.08 });
  },
  splat: (a, d, t, r) => {
    a.noise(d, t, 0.055, { type: 'bandpass', f0: 520 * r, f1: 230, q: 1.5, gain: 0.13 });
  },
  uiHover: (a, d, t) => {
    a.tone(d, t, 0.035, { f0: 880, gain: 0.05 });
  },
  uiClick: (a, d, t) => {
    a.tone(d, t, 0.08, { type: 'square', f0: 520, f1: 250, gain: 0.09 });
    a.noise(d, t, 0.04, { type: 'highpass', f0: 2500, gain: 0.12 });
  },
  explosion: (a, d, t) => {
    a.noise(d, t, 1.3, { f0: 3200, f1: 70, gain: 1.4 });
    a.tone(d, t, 0.85, { f0: 112, f1: 24, gain: 1.3 });
    a.noise(d, t, 0.06, { type: 'highpass', f0: 2000, gain: 0.9 });
  },
  deny: (a, d, t) => {
    a.tone(d, t, 0.09, { type: 'square', f0: 190, f1: 150, gain: 0.08 });
  },
};
