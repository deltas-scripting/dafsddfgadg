export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const sat = (x: number) => clamp(x, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (x: number) => {
  x = sat(x);
  return x * x * (3 - 2 * x);
};
/** Eased 0..1 progress of t through [a, b]. */
export const seg = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
/** Rises over [a, b], holds, falls over [c, d]. */
export const hump = (t: number, a: number, b: number, c: number, d: number) => seg(t, a, b) * (1 - seg(t, c, d));
/** Frame-rate independent exponential approach. */
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const rand = (a = 1, b?: number) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const pick = <T>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Multiply an sRGB hex colour by a brightness factor. */
export function shade(hex: number, f: number): number {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
export const css = (hex: number) => '#' + (hex & 0xffffff).toString(16).padStart(6, '0');

/** Damped spring used for recoil, flinches and view kicks. */
export class Spring {
  x = 0;
  v = 0;
  constructor(
    public k = 140,
    public d = 16,
  ) {}
  update(dt: number, target = 0) {
    this.v += (-this.k * (this.x - target) - this.d * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
  kick(impulse: number) {
    this.v += impulse;
  }
  reset() {
    this.x = 0;
    this.v = 0;
  }
}

/** Piecewise keyframes: rows of [time, ...values], eased between rows. */
export function keys(t: number, rows: readonly (readonly number[])[], out: number[]): number[] {
  const n = rows[0].length - 1;
  let a = rows[0];
  let b = rows[0];
  for (let r = 0; r < rows.length; r++) {
    b = rows[r];
    if (t <= b[0]) break;
    a = b;
  }
  const k = b === a ? 0 : smooth((t - a[0]) / (b[0] - a[0]));
  for (let i = 0; i < n; i++) out[i] = a[i + 1] + (b[i + 1] - a[i + 1]) * k;
  return out;
}
