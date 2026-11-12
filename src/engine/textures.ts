import * as THREE from 'three';
import { css, mulberry32, shade } from './util';

type Ctx = CanvasRenderingContext2D;
type Rnd = () => number;

const mk = (w: number, h = w): [HTMLCanvasElement, Ctx] => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
};
const rgb = (r: number, g: number, b: number, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

function grain(x: Ctx, w: number, h: number, amt: number, rnd: Rnd, speck = 0) {
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let n = (rnd() - 0.5) * amt;
    if (speck && rnd() < speck) n += (rnd() < 0.5 ? -1 : 1) * amt * 2.2;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
}

function blotches(x: Ctx, s: number, n: number, rnd: Rnd, lo: number, hi: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const px = rnd() * s;
    const py = rnd() * s;
    const r = 20 + rnd() * 90;
    const v = lo + rnd() * (hi - lo);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, rgb(v, v, v, alpha));
    g.addColorStop(1, rgb(v, v, v, 0));
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
}

function finish(c: HTMLCanvasElement, o: { repeat?: boolean; nearest?: boolean; aniso?: number } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (o.nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
  }
  t.anisotropy = o.aniso ?? 4;
  return t;
}

function tiles(rnd: Rnd) {
  const S = 512;
  const N = 4;
  const [c, x] = mk(S);
  const ts = S / N;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const v = 172 + rnd() * 18;
      x.fillStyle = rgb(v, v + 2, v + 5);
      x.fillRect(i * ts, j * ts, ts, ts);
    }
  }
  blotches(x, S, 14, rnd, 110, 150, 0.1);
  grain(x, S, S, 18, rnd, 0.02);
  for (let i = 0; i <= N; i++) {
    x.fillStyle = 'rgba(92,95,100,0.9)';
    x.fillRect(i * ts - 2, 0, 4, S);
    x.fillRect(0, i * ts - 2, S, 4);
    x.fillStyle = 'rgba(255,255,255,0.2)';
    x.fillRect(i * ts + 2, 0, 1.5, S);
    x.fillRect(0, i * ts + 2, S, 1.5);
  }
  return finish(c, { repeat: true, aniso: 8 });
}

function panels(rnd: Rnd) {
  const S = 512;
  const P = 256;
  const [c, x] = mk(S);
  x.fillStyle = '#9b9d9e';
  x.fillRect(0, 0, S, S);
  blotches(x, S, 46, rnd, 60, 215, 0.13);
  grain(x, S, S, 36, rnd, 0.07);
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const ox = i * P;
      const oy = j * P;
      x.fillStyle = 'rgba(70,72,74,0.85)';
      x.fillRect(ox, oy, P, 4);
      x.fillRect(ox, oy, 4, P);
      x.fillStyle = 'rgba(255,255,255,0.22)';
      x.fillRect(ox + 4, oy + 4, P - 4, 2);
      x.fillRect(ox + 4, oy + 4, 2, P - 4);
      for (const [rx, ry] of [
        [20, 20],
        [P - 16, 20],
        [20, P - 16],
        [P - 16, P - 16],
      ]) {
        x.fillStyle = 'rgba(60,62,64,0.9)';
        x.beginPath();
        x.arc(ox + rx, oy + ry, 5, 0, 7);
        x.fill();
        x.fillStyle = 'rgba(230,230,230,0.5)';
        x.beginPath();
        x.arc(ox + rx - 1.5, oy + ry - 1.5, 2, 0, 7);
        x.fill();
      }
    }
  }
  return finish(c, { repeat: true, aniso: 8 });
}

function concrete(rnd: Rnd) {
  const S = 512;
  const [c, x] = mk(S);
  x.fillStyle = '#a4a39d';
  x.fillRect(0, 0, S, S);
  blotches(x, S, 30, rnd, 70, 200, 0.12);
  for (let i = 0; i < 9; i++) {
    const px = rnd() * S;
    const w = 6 + rnd() * 18;
    const g = x.createLinearGradient(0, 0, 0, S * (0.4 + rnd() * 0.6));
    g.addColorStop(0, 'rgba(50,48,44,0.28)');
    g.addColorStop(1, 'rgba(50,48,44,0)');
    x.fillStyle = g;
    x.fillRect(px, 0, w, S);
  }
  grain(x, S, S, 24, rnd, 0.04);
  x.fillStyle = 'rgba(60,60,58,0.35)';
  for (let y = 0; y < S; y += 128) x.fillRect(0, y, S, 2);
  return finish(c, { repeat: true, aniso: 8 });
}

function asphalt(rnd: Rnd) {
  const S = 256;
  const [c, x] = mk(S);
  x.fillStyle = '#414246';
  x.fillRect(0, 0, S, S);
  blotches(x, S, 12, rnd, 20, 90, 0.14);
  grain(x, S, S, 30, rnd, 0.09);
  return finish(c, { repeat: true, aniso: 8 });
}

function grass(rnd: Rnd) {
  const S = 512;
  const [c, x] = mk(S);
  x.fillStyle = '#4c8437';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const px = rnd() * S;
    const py = rnd() * S;
    const r = 30 + rnd() * 80;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const dark = rnd() < 0.5;
    g.addColorStop(0, dark ? 'rgba(40,96,34,0.35)' : 'rgba(120,160,60,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  for (let i = 0; i < 5200; i++) {
    const v = rnd();
    x.strokeStyle = v < 0.5 ? 'rgba(34,84,28,0.5)' : v < 0.85 ? 'rgba(104,160,62,0.5)' : 'rgba(150,180,80,0.45)';
    x.lineWidth = 1;
    const px = rnd() * S;
    const py = rnd() * S;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (rnd() - 0.5) * 4, py - 2 - rnd() * 5);
    x.stroke();
  }
  grain(x, S, S, 14, rnd);
  return finish(c, { repeat: true, aniso: 8 });
}

function dirt(rnd: Rnd) {
  const S = 256;
  const [c, x] = mk(S);
  x.fillStyle = '#7b5d40';
  x.fillRect(0, 0, S, S);
  blotches(x, S, 24, rnd, 30, 150, 0.14);
  grain(x, S, S, 30, rnd, 0.06);
  return finish(c, { repeat: true });
}

function planks(rnd: Rnd) {
  const S = 256;
  const n = 4;
  const pw = S / n;
  const [c, x] = mk(S);
  for (let i = 0; i < n; i++) {
    const k = 0.84 + rnd() * 0.3;
    x.fillStyle = rgb(156 * k, 110 * k, 64 * k);
    x.fillRect(i * pw, 0, pw, S);
    for (let j = 0; j < 12; j++) {
      x.strokeStyle = rgb(60, 35, 15, 0.1 + rnd() * 0.2);
      x.lineWidth = 1 + rnd();
      const gx = i * pw + rnd() * pw;
      x.beginPath();
      x.moveTo(gx, 0);
      x.bezierCurveTo(gx + rnd() * 8 - 4, S * 0.33, gx + rnd() * 8 - 4, S * 0.66, gx + rnd() * 4 - 2, S);
      x.stroke();
    }
    x.fillStyle = 'rgba(30,18,8,0.8)';
    x.fillRect(i * pw, 0, 2, S);
    x.fillStyle = 'rgba(40,30,22,0.9)';
    for (const ny of [14, S - 14]) {
      x.beginPath();
      x.arc(i * pw + pw / 2, ny, 2.5, 0, 7);
      x.fill();
    }
  }
  grain(x, S, S, 14, rnd);
  return finish(c, { repeat: true });
}

function crate(rnd: Rnd) {
  const S = 256;
  const [c, x] = mk(S);
  for (let i = 0; i < 5; i++) {
    const k = 0.86 + rnd() * 0.22;
    x.fillStyle = rgb(170 * k, 124 * k, 72 * k);
    x.fillRect(0, (i * S) / 5, S, S / 5);
    x.fillStyle = 'rgba(40,24,10,0.7)';
    x.fillRect(0, (i * S) / 5, S, 2);
  }
  x.save();
  x.translate(S / 2, S / 2);
  x.rotate(Math.PI / 4);
  x.fillStyle = '#b98a52';
  x.fillRect(-S, -15, S * 2, 30);
  x.strokeStyle = 'rgba(40,24,10,0.7)';
  x.lineWidth = 2;
  x.strokeRect(-S, -15, S * 2, 30);
  x.restore();
  const F = 26;
  x.fillStyle = '#8f6537';
  x.fillRect(0, 0, S, F);
  x.fillRect(0, S - F, S, F);
  x.fillRect(0, 0, F, S);
  x.fillRect(S - F, 0, F, S);
  x.strokeStyle = 'rgba(36,22,10,0.8)';
  x.lineWidth = 2;
  x.strokeRect(F, F, S - F * 2, S - F * 2);
  x.strokeRect(1, 1, S - 2, S - 2);
  x.fillStyle = 'rgba(30,26,24,0.9)';
  for (const [nx, ny] of [
    [13, 13],
    [S - 13, 13],
    [13, S - 13],
    [S - 13, S - 13],
  ]) {
    x.beginPath();
    x.arc(nx, ny, 3.5, 0, 7);
    x.fill();
  }
  x.fillStyle = 'rgba(25,20,16,0.8)';
  x.font = 'bold 26px monospace';
  x.textAlign = 'center';
  x.fillText('GB-47', S / 2, 70);
  grain(x, S, S, 16, rnd);
  return finish(c);
}

function corrugated(rnd: Rnd) {
  const S = 128;
  const [c, x] = mk(S);
  for (let px = 0; px < S; px++) {
    const v = 196 + 50 * Math.sin((px / S) * Math.PI * 2 * 8);
    x.fillStyle = rgb(v, v, v);
    x.fillRect(px, 0, 1, S);
  }
  grain(x, S, S, 12, rnd, 0.015);
  return finish(c, { repeat: true });
}

function target() {
  const S = 256;
  const [c, x] = mk(S);
  x.fillStyle = '#e9e2cf';
  x.fillRect(0, 0, S, S);
  const rings: [number, string][] = [
    [116, '#16171a'],
    [98, '#e9e2cf'],
    [80, '#16171a'],
    [62, '#e9e2cf'],
    [44, '#16171a'],
    [27, '#c8281e'],
    [10, '#f3d23b'],
  ];
  for (const [r, col] of rings) {
    x.fillStyle = col;
    x.beginPath();
    x.arc(128, 128, r, 0, 7);
    x.fill();
  }
  x.strokeStyle = '#6b4a2a';
  x.lineWidth = 10;
  x.strokeRect(5, 5, S - 10, S - 10);
  return finish(c);
}

function barrel(rnd: Rnd) {
  const W = 512;
  const H = 256;
  const [c, x] = mk(W, H);
  x.fillStyle = '#b3321f';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#e8e4da';
  x.fillRect(0, H * 0.33, W, H * 0.36);
  x.fillStyle = 'rgba(0,0,0,0.28)';
  for (const y of [H * 0.33 - 4, H * 0.69, 8, H - 12]) x.fillRect(0, y, W, 4);
  for (const cx of [W * 0.25, W * 0.75]) {
    x.save();
    x.translate(cx, H * 0.51);
    x.rotate(Math.PI / 4);
    x.fillStyle = '#c8281e';
    x.fillRect(-27, -27, 54, 54);
    x.strokeStyle = '#fff';
    x.lineWidth = 3;
    x.strokeRect(-21, -21, 42, 42);
    x.restore();
    x.fillStyle = '#fff';
    x.fillRect(cx - 14, H * 0.51 - 4, 28, 8);
  }
  for (let i = 0; i < 26; i++) {
    const px = rnd() * W;
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(40,20,10,0)');
    g.addColorStop(1, 'rgba(40,20,10,0.3)');
    x.fillStyle = g;
    x.fillRect(px, rnd() * H * 0.5, 2 + rnd() * 6, H);
  }
  grain(x, W, H, 14, rnd);
  return finish(c, { repeat: true });
}

function hazard() {
  const S = 128;
  const [c, x] = mk(S);
  x.fillStyle = '#e6b81f';
  x.fillRect(0, 0, S, S);
  x.fillStyle = '#17171a';
  for (let i = -S; i < S * 2; i += 64) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 32, 0);
    x.lineTo(i + 32 - S, S);
    x.lineTo(i - S, S);
    x.fill();
  }
  return finish(c, { repeat: true });
}

/** Blood decal atlas: 4x4 cells. 0-5 splats, 6-7 spray, 8-11 wall splats with drips, 12-13 pools, 14 footprint, 15 wound. */
export const BLOOD_CELLS = 4;
function bloodAtlas(rnd: Rnd) {
  const CELL = 256;
  const N = BLOOD_CELLS;
  const [c, x] = mk(CELL * N);
  const cx = 128;
  const cy = 128;
  for (let i = 0; i < N * N; i++) {
    const [cc, g] = mk(CELL);
    g.fillStyle = '#7c0707';
    const blob = (px: number, py: number, r: number) => {
      g.beginPath();
      g.arc(px, py, r, 0, 6.3);
      g.fill();
    };
    let hy = cy;
    if (i < 6) {
      for (let k = 0; k < 14; k++) {
        const a = rnd() * 6.28;
        const d = rnd() * 26;
        blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 16 + rnd() * 22);
      }
      const rays = 6 + ((rnd() * 6) | 0);
      for (let k = 0; k < rays; k++) {
        const a = rnd() * 6.28;
        const len = 45 + rnd() * 58;
        let r = 7 + rnd() * 6;
        for (let d = 25; d < len; d += r * 0.7) {
          blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r);
          // keep a minimum radius: a purely geometric taper would never reach `len`
          r = Math.max(2.4, r * 0.86);
        }
        blob(cx + Math.cos(a) * (len + 6), cy + Math.sin(a) * (len + 6), 3 + rnd() * 5);
      }
      for (let k = 0; k < 22; k++) {
        const a = rnd() * 6.28;
        const d = 55 + rnd() * 60;
        blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.5 + rnd() * 5);
      }
    } else if (i < 8) {
      for (let k = 0; k < 90; k++) {
        const a = rnd() * 6.28;
        const d = Math.pow(rnd(), 0.7) * 112;
        blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.2 + rnd() * rnd() * 9);
      }
    } else if (i < 12) {
      hy = 72;
      for (let k = 0; k < 12; k++) blob(cx + (rnd() - 0.5) * 72, hy + (rnd() - 0.5) * 44, 14 + rnd() * 20);
      for (let k = 0; k < 18; k++) {
        const a = rnd() * 6.28;
        const d = 50 + rnd() * 50;
        blob(cx + Math.cos(a) * d, hy + Math.sin(a) * d * 0.6, 1.5 + rnd() * 5);
      }
      const drips = 4 + ((rnd() * 4) | 0);
      for (let k = 0; k < drips; k++) {
        const dx = cx + (rnd() - 0.5) * 92;
        const w = 3 + rnd() * 5;
        const y1 = 120 + rnd() * 118;
        g.fillRect(dx - w / 2, hy, w, y1 - hy);
        blob(dx, y1, w * 0.5 + 1.5 + rnd() * 2);
      }
    } else if (i < 14) {
      for (let k = 0; k < 12; k++) {
        const a = rnd() * 6.28;
        const d = rnd() * 38;
        blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 50 + rnd() * 26);
      }
    } else if (i === 14) {
      g.beginPath();
      g.ellipse(128, 98, 34, 58, 0, 0, 6.3);
      g.fill();
      g.beginPath();
      g.ellipse(128, 198, 27, 30, 0, 0, 6.3);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      for (let y = 52; y < 226; y += 15) g.fillRect(80, y, 96, 4);
      g.globalCompositeOperation = 'source-over';
    } else {
      for (let k = 0; k < 10; k++) blob(cx + (rnd() - 0.5) * 40, cy + (rnd() - 0.5) * 40, 16 + rnd() * 16);
      for (let k = 0; k < 16; k++) {
        const a = rnd() * 6.28;
        const d = 44 + rnd() * 40;
        blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2 + rnd() * 5);
      }
      for (let k = 0; k < 3; k++) {
        const dx = cx + (rnd() - 0.5) * 50;
        const w = 4 + rnd() * 4;
        const y1 = 170 + rnd() * 60;
        g.fillRect(dx - w / 2, cy, w, y1 - cy);
        blob(dx, y1, w * 0.5 + 2);
      }
    }
    g.globalCompositeOperation = 'source-atop';
    const grad = g.createRadialGradient(cx - 14, hy - 14, 4, cx, hy, 126);
    grad.addColorStop(0, 'rgba(184,24,24,0.9)');
    grad.addColorStop(0.45, 'rgba(132,10,10,0.5)');
    grad.addColorStop(1, 'rgba(60,0,0,0.75)');
    g.fillStyle = grad;
    g.fillRect(0, 0, CELL, CELL);
    if (i === 15) {
      const core = g.createRadialGradient(cx, cy, 2, cx, cy, 30);
      core.addColorStop(0, 'rgba(14,0,0,0.98)');
      core.addColorStop(0.6, 'rgba(40,0,0,0.8)');
      core.addColorStop(1, 'rgba(60,0,0,0)');
      g.fillStyle = core;
      g.fillRect(0, 0, CELL, CELL);
    }
    g.fillStyle = 'rgba(255,128,116,0.17)';
    for (let k = 0; k < 9; k++) {
      g.beginPath();
      g.ellipse(cx + (rnd() - 0.5) * 60, hy + (rnd() - 0.5) * 60, 3 + rnd() * 9, 2 + rnd() * 4, rnd() * 3, 0, 6.3);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    x.drawImage(cc, (i % N) * CELL, ((i / N) | 0) * CELL);
  }
  return finish(c);
}

/** Bullet hole atlas, 2x2 cells. */
function holeAtlas(rnd: Rnd) {
  const CELL = 64;
  const [c, x] = mk(CELL * 2);
  for (let i = 0; i < 4; i++) {
    const ox = (i % 2) * CELL + 32;
    const oy = ((i / 2) | 0) * CELL + 32;
    const poly = (r0: number, r1: number, n: number) => {
      x.beginPath();
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 6.283;
        const r = r0 + rnd() * (r1 - r0);
        x.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
      }
      x.closePath();
      x.fill();
    };
    x.fillStyle = 'rgba(208,206,198,0.55)';
    poly(12, 21, 11);
    x.fillStyle = 'rgba(44,44,46,0.9)';
    poly(6, 11, 9);
    x.fillStyle = '#050505';
    x.beginPath();
    x.arc(ox, oy, 4.5, 0, 7);
    x.fill();
    x.strokeStyle = 'rgba(24,24,24,0.6)';
    x.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const a = rnd() * 6.28;
      x.beginPath();
      x.moveTo(ox + Math.cos(a) * 8, oy + Math.sin(a) * 8);
      x.lineTo(ox + Math.cos(a + 0.2) * (18 + rnd() * 10), oy + Math.sin(a + 0.2) * (18 + rnd() * 10));
      x.stroke();
    }
  }
  return finish(c);
}

export interface HeadDef {
  skin: number;
  hair: number;
  style: 'short' | 'buzz' | 'bald' | 'mask';
  /** >0 angry, <0 worried */
  brow?: number;
  mouth?: 'flat' | 'smile' | 'frown' | 'open';
  beard?: 'stubble' | 'mustache' | 'full';
}

/** Head variants; the row index is the head id used by character looks. */
export const HEADS: HeadDef[] = [
  { skin: 0xe0ac86, hair: 0x17120e, style: 'short', brow: 1, mouth: 'flat' },
  { skin: 0xd9a47c, hair: 0x1a1a1c, style: 'mask' },
  { skin: 0xe6b894, hair: 0x5a3a1e, style: 'short', mouth: 'smile' },
  { skin: 0xc68e5e, hair: 0x1a1512, style: 'short', beard: 'mustache', mouth: 'flat' },
  { skin: 0x7a5236, hair: 0x100e0c, style: 'buzz', mouth: 'frown' },
  { skin: 0xf0c8a6, hair: 0xc9a24a, style: 'short', brow: -1, mouth: 'open' },
  { skin: 0xdcae8c, hair: 0x40342c, style: 'bald', beard: 'stubble', brow: 1, mouth: 'frown' },
  { skin: 0x9c6b47, hair: 0x231a14, style: 'short', beard: 'full', mouth: 'flat' },
];

const FACE_TILE = 32;
const FACE_SIZE = 256;
/** UV rect of a face-atlas tile, inset half a texel against bleeding. */
export function faceTile(col: number, row: number): [number, number, number, number] {
  const e = 0.5 / FACE_SIZE;
  const t = FACE_TILE / FACE_SIZE;
  return [col * t + e, 1 - (row + 1) * t + e, (col + 1) * t - e, 1 - row * t - e];
}
/** A white texel for untextured geometry sharing the atlas material. */
export const WHITE_UV: readonly [number, number] = [7.5 * (FACE_TILE / FACE_SIZE), 1 - 7.5 * (FACE_TILE / FACE_SIZE)];

function faceAtlas(rnd: Rnd) {
  const T = FACE_TILE;
  const [c, x] = mk(FACE_SIZE);
  x.imageSmoothingEnabled = false;
  HEADS.forEach((h, row) => {
    const oy = row * T;
    const skin = css(h.skin);
    const skinD = css(shade(h.skin, 0.84));
    const skinDD = css(shade(h.skin, 0.66));
    const hair = css(h.hair);
    const hairL = css(shade(h.hair, 1.5) + 0x0a0806);
    const px = (col: number, X: number, Y: number, W: number, H: number, colr: string) => {
      x.fillStyle = colr;
      x.fillRect(col * T + X, oy + Y, W, H);
    };
    if (h.style === 'mask') {
      for (let col = 0; col < 6; col++) {
        px(col, 0, 0, T, T, '#1b1b1e');
        for (let k = 0; k < 40; k++) px(col, (rnd() * T) | 0, (rnd() * T) | 0, 1, 1, rnd() < 0.5 ? '#232327' : '#141416');
      }
      px(0, 4, 12, 24, 7, skin);
      px(0, 4, 12, 24, 1, skinD);
      px(0, 7, 14, 6, 3, '#f2f0ea');
      px(0, 19, 14, 6, 3, '#f2f0ea');
      px(0, 10, 14, 2, 3, '#161412');
      px(0, 20, 14, 2, 3, '#161412');
      px(0, 6, 12, 8, 1, '#2a1c14');
      px(0, 18, 12, 8, 1, '#2a1c14');
      px(0, 14, 22, 4, 1, '#0e0e10');
      return;
    }
    const hairRows = h.style === 'short' ? 7 : h.style === 'buzz' ? 5 : 0;
    const hairCol = h.style === 'buzz' ? css(shade(h.hair, 1.25) + 0x181410) : hair;
    // front
    px(0, 0, 0, T, T, skin);
    px(0, 0, 27, T, 5, skinD);
    px(0, 0, 8, 2, 19, skinD);
    px(0, 30, 8, 2, 19, skinD);
    if (hairRows) {
      px(0, 0, 0, T, hairRows - 1, hairCol);
      px(0, 0, hairRows - 1, 4, 6, hairCol);
      px(0, 28, hairRows - 1, 4, 6, hairCol);
      for (let i = 4; i < 28; i += 2) if ((i >> 1) & 1 || h.style === 'buzz') px(0, i, hairRows - 1, 2, 1 + ((i >> 2) & 1), hairCol);
      for (let k = 0; k < 14; k++) px(0, (rnd() * T) | 0, (rnd() * (hairRows - 1)) | 0, 2, 1, hairL);
    } else {
      px(0, 6, 1, 14, 2, css(shade(h.skin, 1.08)));
    }
    const brow = h.brow ?? 0;
    const browCol = h.style === 'bald' ? css(shade(h.hair, 0.8)) : hair;
    px(0, 6, 11 - (brow > 0 ? 1 : 0) + (brow < 0 ? 1 : 0), 4, 2, browCol);
    px(0, 10, 11, 4, 2, browCol);
    px(0, 18, 11, 4, 2, browCol);
    px(0, 22, 11 - (brow > 0 ? 1 : 0) + (brow < 0 ? 1 : 0), 4, 2, browCol);
    px(0, 7, 13, 6, 1, skinD);
    px(0, 19, 13, 6, 1, skinD);
    px(0, 7, 14, 6, 3, '#f4f1ea');
    px(0, 19, 14, 6, 3, '#f4f1ea');
    px(0, 10, 14, 2, 3, '#1c1814');
    px(0, 20, 14, 2, 3, '#1c1814');
    px(0, 15, 15, 2, 6, skinD);
    px(0, 14, 21, 4, 1, skinDD);
    if (h.beard === 'full') {
      px(0, 2, 21, 28, 11, hair);
      px(0, 11, 20, 10, 2, hair);
    } else if (h.beard === 'mustache') {
      px(0, 10, 22, 12, 2, hair);
    } else if (h.beard === 'stubble') {
      for (let k = 0; k < 70; k++) px(0, 3 + ((rnd() * 26) | 0), 21 + ((rnd() * 11) | 0), 1, 1, 'rgba(40,34,30,0.45)');
    }
    const mouth = h.mouth ?? 'flat';
    if (mouth === 'open') {
      px(0, 12, 24, 8, 4, '#3a1212');
      px(0, 12, 24, 8, 1, '#f1eee6');
    } else {
      px(0, 11, 25, 10, 2, '#6a2f2a');
      if (mouth === 'smile') {
        px(0, 10, 24, 1, 1, '#6a2f2a');
        px(0, 21, 24, 1, 1, '#6a2f2a');
      } else if (mouth === 'frown') {
        px(0, 10, 26, 1, 1, '#6a2f2a');
        px(0, 21, 26, 1, 1, '#6a2f2a');
      }
    }
    // sides: column 1 has the face at its left edge, column 3 is the mirror
    for (const col of [1, 3]) {
      const flip = col === 3;
      const X = (v: number, w: number) => (flip ? T - v - w : v);
      px(col, 0, 0, T, T, skin);
      px(col, 0, 27, T, 5, skinD);
      if (hairRows) {
        px(col, 0, 0, T, hairRows + 2, hairCol);
        px(col, X(19, 13), 0, 13, 22, hairCol);
        px(col, X(15, 4), hairRows + 2, 4, 3, hairCol);
      }
      if (h.beard === 'full') px(col, X(0, 14), 21, 14, 11, hair);
      px(col, X(13, 5), 13, 5, 7, skinD);
      px(col, X(14, 2), 15, 2, 3, skinDD);
    }
    // back, top, bottom
    px(2, 0, 0, T, T, skin);
    px(2, 0, 26, T, 6, skinD);
    if (hairRows) {
      px(2, 0, 0, T, h.style === 'buzz' ? 19 : 23, hairCol);
      for (let k = 0; k < 24; k++) px(2, (rnd() * T) | 0, (rnd() * 20) | 0, 2, 1, hairL);
    }
    px(4, 0, 0, T, T, hairRows ? hairCol : css(shade(h.skin, 1.05)));
    if (hairRows) for (let k = 0; k < 26; k++) px(4, (rnd() * T) | 0, (rnd() * T) | 0, 2, 1, hairL);
    px(5, 0, 0, T, T, skinD);
  });
  x.fillStyle = '#fff';
  x.fillRect(7 * T, 7 * T, T, T);
  return finish(c, { nearest: true, aniso: 1 });
}

function muzzle(rnd: Rnd) {
  const S = 128;
  const [c, x] = mk(S);
  x.translate(S / 2, S / 2);
  x.shadowColor = 'rgba(255,170,60,1)';
  x.shadowBlur = 10;
  x.fillStyle = 'rgba(255,196,90,0.85)';
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * 6.283 + rnd() * 0.5;
    const len = 34 + rnd() * 24;
    x.beginPath();
    x.moveTo(Math.cos(a + 1.57) * 8, Math.sin(a + 1.57) * 8);
    x.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    x.lineTo(Math.cos(a - 1.57) * 8, Math.sin(a - 1.57) * 8);
    x.fill();
  }
  x.shadowBlur = 0;
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 40);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.25, 'rgba(255,232,150,0.95)');
  g.addColorStop(0.6, 'rgba(255,150,40,0.45)');
  g.addColorStop(1, 'rgba(255,90,0,0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, 40, 0, 7);
  x.fill();
  return finish(c);
}

function makeTextures() {
  const rnd = mulberry32(1337);
  return {
    tiles: tiles(rnd),
    panels: panels(rnd),
    concrete: concrete(rnd),
    asphalt: asphalt(rnd),
    grass: grass(rnd),
    dirt: dirt(rnd),
    planks: planks(rnd),
    crate: crate(rnd),
    corrugated: corrugated(rnd),
    target: target(),
    barrel: barrel(rnd),
    hazard: hazard(),
    blood: bloodAtlas(rnd),
    holes: holeAtlas(rnd),
    faces: faceAtlas(rnd),
    muzzle: muzzle(rnd),
  };
}

let cache: ReturnType<typeof makeTextures> | null = null;
export const textures = () => (cache ??= makeTextures());
