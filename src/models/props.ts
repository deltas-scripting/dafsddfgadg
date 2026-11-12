import * as THREE from 'three';
import { Builder, type V3 } from '../engine/builder';
import { mats } from '../engine/materials';
import { shade } from '../engine/util';

/** Sedan, 4.4 m long along z (front at -z), origin on the ground under its centre. */
export function addCar(b: Builder, color = 0xaab0b6) {
  const m = mats();
  const dark = 0x1b1c1f;
  b.box(m.matte, 0x121214, [1.6, 0.22, 3.9], [0, 0.3, 0]);
  b.prism(
    m.matte,
    color,
    [
      [-2.2, 0.3],
      [-2.2, 0.62],
      [-2.1, 0.73],
      [-0.82, 0.82],
      [1.4, 0.84],
      [2.12, 0.8],
      [2.2, 0.62],
      [2.2, 0.3],
    ],
    1.74,
    [0, 0, 0],
    { bevel: 0.05 },
  );
  b.prism(
    m.matte,
    color,
    [
      [-0.84, 0.8],
      [-0.28, 1.38],
      [0.92, 1.4],
      [1.52, 0.82],
    ],
    1.52,
    [0, 0, 0],
    { bevel: 0.06 },
  );
  // glazing
  b.prism(
    m.glass,
    0xffffff,
    [
      [-0.66, 0.87],
      [-0.27, 1.31],
      [0.88, 1.33],
      [1.32, 0.88],
    ],
    1.54,
  );
  b.box(m.glass, 0xffffff, [1.36, 0.7, 0.02], [0, 1.098, -0.569], { rot: [0.768, 0, 0] });
  b.box(m.glass, 0xffffff, [1.36, 0.72, 0.02], [0, 1.119, 1.228], { rot: [-0.802, 0, 0] });
  b.box(m.matte, color, [1.56, 0.5, 0.07], [0, 1.09, 0.3]);
  // wheels
  for (const sx of [1, -1]) {
    for (const z of [-1.36, 1.36]) {
      b.cyl(m.matte, 0x17171a, 0.33, 0.24, [0.78 * sx, 0.33, z], { axis: 'x', seg: 14 });
      b.cyl(m.matte, 0xc2c6cb, 0.2, 0.25, [0.78 * sx, 0.33, z], { axis: 'x', seg: 10 });
      b.cyl(m.matte, 0x3a3c40, 0.07, 0.262, [0.78 * sx, 0.33, z], { axis: 'x', seg: 8 });
    }
    // doors, handles, mirrors
    for (const z of [-0.78, 0.3, 1.3]) b.box(m.matte, shade(color, 0.6), [0.006, 0.46, 0.012], [0.871 * sx, 0.6, z]);
    for (const z of [-0.1, 0.95]) b.box(m.matte, dark, [0.012, 0.022, 0.11], [0.874 * sx, 0.74, z]);
    b.box(m.matte, color, [0.11, 0.07, 0.05], [0.85 * sx, 0.93, -0.68], { chamfer: 0.012 });
    // lights
    b.box(m.matte, 0xf4f0e2, [0.34, 0.1, 0.04], [0.62 * sx, 0.63, -2.19], { chamfer: 0.01 });
    b.box(m.matte, 0xb3201e, [0.3, 0.1, 0.04], [0.64 * sx, 0.66, 2.19], { chamfer: 0.01 });
  }
  b.box(m.matte, 0x2b2d31, [1.78, 0.17, 0.16], [0, 0.37, -2.18], { chamfer: 0.035 });
  b.box(m.matte, 0x2b2d31, [1.78, 0.17, 0.16], [0, 0.37, 2.18], { chamfer: 0.035 });
  b.box(m.matte, dark, [0.82, 0.11, 0.03], [0, 0.61, -2.2]);
  b.box(m.matte, 0xe8e8e2, [0.4, 0.1, 0.012], [0, 0.4, -2.265]);
  b.box(m.matte, 0xe8e8e2, [0.4, 0.1, 0.012], [0, 0.52, 2.21]);
  return b;
}

/** Red and white fuel barrel, origin at the bottom centre. */
export function addBarrel(b: Builder) {
  const m = mats();
  const R = 0.29;
  const H = 0.88;
  const red = 0xb3321f;
  b.cyl(m.barrel, 0xffffff, R, H, [0, H / 2, 0], { seg: 14, open: true });
  b.cyl(m.matte, shade(red, 0.82), R, 0.012, [0, H - 0.01, 0], { seg: 14 });
  b.cyl(m.matte, shade(red, 0.6), R, 0.012, [0, 0.006, 0], { seg: 14 });
  for (const y of [0.014, H * 0.33, H * 0.69, H - 0.014]) {
    b.cyl(m.matte, y > 0.2 && y < 0.7 ? 0xd9d5cb : shade(red, 0.9), R + 0.012, 0.026, [0, y, 0], { seg: 14 });
  }
  b.cyl(m.matte, 0x24211f, 0.035, 0.02, [0.14, H + 0.002, 0.05], { seg: 8 });
  return b;
}
export const BARREL = { radius: 0.3, height: 0.88 };

/** Steel workshop cart, 3 m long along x, origin on the floor. */
export function addTable(b: Builder) {
  const m = mats();
  const steel = 0x86909a;
  const dark = 0x5f6872;
  b.box(m.matte, steel, [3.0, 0.045, 0.86], [0, 0.95, 0], { chamfer: 0.012 });
  b.box(m.matte, dark, [2.92, 0.035, 0.8], [0, 0.3, 0], { chamfer: 0.01 });
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      b.box(m.matte, dark, [0.055, 0.86, 0.055], [1.44 * sx, 0.52, 0.39 * sz]);
      b.cyl(m.matte, 0x1c1c1e, 0.055, 0.04, [1.44 * sx, 0.055, 0.39 * sz], { axis: 'x', seg: 10 });
    }
    b.box(m.matte, dark, [0.03, 0.03, 0.78], [1.44 * sx, 0.62, 0]);
  }
  b.box(m.matte, dark, [2.9, 0.03, 0.03], [0, 0.9, 0.4]);
  b.box(m.matte, dark, [2.9, 0.03, 0.03], [0, 0.9, -0.4]);
  return b;
}

export function addBottle(b: Builder, pos: V3) {
  const m = mats();
  b.push(pos);
  b.cyl(m.matte, 0x6a3a14, 0.045, 0.16, [0, 0.08, 0], { seg: 8 });
  b.cyl(m.matte, 0x6a3a14, [0.016, 0.045], 0.05, [0, 0.185, 0], { seg: 8 });
  b.cyl(m.matte, 0x6a3a14, 0.016, 0.05, [0, 0.235, 0], { seg: 8 });
  b.cyl(m.matte, 0x1a1a1c, 0.019, 0.022, [0, 0.27, 0], { seg: 8 });
  b.cyl(m.matte, 0x1c1814, 0.0465, 0.07, [0, 0.085, 0], { seg: 8, open: true });
  b.cyl(m.matte, 0xe8e2d0, 0.0468, 0.03, [0, 0.085, 0], { seg: 8, open: true });
  b.pop();
  return b;
}

export function addJerryCan(b: Builder, pos: V3, color: number, rotY = 0) {
  const m = mats();
  b.push(pos, [0, rotY, 0]);
  b.box(m.matte, color, [0.34, 0.42, 0.17], [0, 0.21, 0], { chamfer: 0.03 });
  b.box(m.matte, shade(color, 0.8), [0.2, 0.2, 0.172], [0, 0.2, 0], { chamfer: 0.02 });
  b.box(m.matte, shade(color, 0.7), [0.16, 0.03, 0.05], [-0.03, 0.445, 0], { chamfer: 0.01 });
  b.cyl(m.matte, 0x1c1c1e, 0.03, 0.05, [0.12, 0.44, 0], { seg: 8 });
  b.pop();
  return b;
}

export function addAmmoBox(b: Builder, pos: V3, rotY = 0) {
  const m = mats();
  b.push(pos, [0, rotY, 0]);
  b.box(m.matte, 0x4d5a36, [0.3, 0.18, 0.15], [0, 0.09, 0], { chamfer: 0.012 });
  b.box(m.matte, 0x3c472a, [0.31, 0.03, 0.16], [0, 0.175, 0], { chamfer: 0.008 });
  b.box(m.matte, 0x2a2c24, [0.12, 0.015, 0.03], [0, 0.2, 0]);
  b.box(m.matte, 0xd8c84a, [0.12, 0.05, 0.002], [0, 0.09, 0.076]);
  b.pop();
  return b;
}

export function addDumpster(b: Builder, pos: V3, rotY = 0) {
  const m = mats();
  b.push(pos, [0, rotY, 0]);
  b.box(m.matte, 0x33483c, [1.9, 1.15, 1.1], [0, 0.65, 0], { chamfer: 0.04 });
  b.box(m.matte, 0x263329, [1.96, 0.08, 1.16], [0, 1.24, 0], { chamfer: 0.02 });
  for (const sx of [1, -1]) {
    b.box(m.matte, 0x263329, [0.06, 0.9, 0.06], [0.7 * sx, 0.65, 0.56]);
    b.cyl(m.matte, 0x151515, 0.07, 0.05, [0.8 * sx, 0.07, 0.4], { axis: 'x', seg: 8 });
    b.cyl(m.matte, 0x151515, 0.07, 0.05, [0.8 * sx, 0.07, -0.4], { axis: 'x', seg: 8 });
  }
  b.pop();
  return b;
}

/** Wooden crate mesh centred on its origin. */
export function buildCrate(size: number): THREE.Mesh {
  const b = new Builder();
  b.box(mats().crate, 0xffffff, [size, size, size], [0, 0, 0], { chamfer: 0.012 });
  return b.build().children[0] as THREE.Mesh;
}

export function buildBarrelMesh(): THREE.Group {
  return addBarrel(new Builder()).build();
}

export const CONTAINER = { w: 2.44, h: 2.6, l: 6.06 };
/** Shipping container, long axis along z, origin on the ground. */
export function addContainer(b: Builder, pos: V3, rotY: number, color: number) {
  const m = mats();
  const { w, h, l } = CONTAINER;
  const frame = shade(color, 0.68);
  b.push(pos, [0, rotY, 0]);
  b.box(m.corrugated, color, [w, h, l], [0, h / 2, 0], { tile: 1.6 });
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) b.box(m.matte, frame, [0.13, h + 0.02, 0.13], [(w / 2 - 0.04) * sx, h / 2, (l / 2 - 0.04) * sz]);
    for (const y of [0.06, h - 0.05]) b.box(m.matte, frame, [0.1, 0.11, l + 0.02], [(w / 2 - 0.03) * sx, y, 0]);
    // door lock rods and handles on the +z end
    for (const dx of [0.28, 0.85]) {
      b.cyl(m.matte, 0xb5b8bb, 0.02, h - 0.3, [dx * sx, h / 2, l / 2 + 0.02], { seg: 6 });
      b.box(m.matte, 0x8b8e91, [0.16, 0.03, 0.03], [dx * sx, 1.15, l / 2 + 0.04]);
    }
  }
  for (const sz of [1, -1]) {
    for (const y of [0.06, h - 0.05]) b.box(m.matte, frame, [w + 0.02, 0.11, 0.1], [0, y, (l / 2 - 0.03) * sz]);
  }
  b.box(m.matte, frame, [0.03, h - 0.2, 0.02], [0, h / 2, l / 2 + 0.012]);
  b.pop();
  return b;
}

/** Bullseye target on a wooden stand, facing +z, origin on the ground. */
export function addTarget(b: Builder, pos: V3, rotY = 0) {
  const m = mats();
  const wood = 0x8b6a45;
  b.push(pos, [0, rotY, 0]);
  for (const sx of [1, -1]) {
    b.box(m.matte, wood, [0.06, 1.35, 0.06], [0.27 * sx, 0.675, 0]);
    b.box(m.matte, shade(wood, 0.8), [0.08, 0.06, 0.62], [0.27 * sx, 0.03, 0]);
  }
  b.box(m.matte, wood, [0.6, 0.05, 0.05], [0, 0.45, 0]);
  b.box(m.target, 0xffffff, [0.76, 0.76, 0.03], [0, 1.45, 0.045]);
  b.pop();
  return b;
}

export function addSandbags(b: Builder, pos: V3, rotY: number, count: number, rows: number) {
  const m = mats();
  const tan = 0xb39b6e;
  b.push(pos, [0, rotY, 0]);
  for (let r = 0; r < rows; r++) {
    const n = count - (r % 2);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.62;
      const k = 0.88 + ((i * 7 + r * 13) % 5) * 0.045;
      b.box(m.matte, shade(tan, k), [0.6, 0.2, 0.34], [x, 0.1 + r * 0.19, 0], { chamfer: 0.06 });
    }
  }
  b.pop();
  return b;
}

export function addTree(b: Builder, x: number, z: number, rnd: () => number) {
  const m = mats();
  const pine = rnd() < 0.6;
  const h = pine ? 6 + rnd() * 5 : 4.5 + rnd() * 2.5;
  b.push([x, 0, z], [0, rnd() * 6.28, 0]);
  b.cyl(m.matte, 0x5a4028, [0.13, 0.22], h * 0.5, [0, h * 0.25, 0], { seg: 6 });
  if (pine) {
    for (let i = 0; i < 3; i++) {
      const r = (1.9 - i * 0.5) * (0.85 + rnd() * 0.3);
      const hh = h * 0.42;
      b.cyl(m.matte, i % 2 ? 0x2f6b34 : 0x285c2e, [0.02, r], hh, [0, h * (0.38 + i * 0.24), 0], { seg: 7 });
    }
  } else {
    const green = [0x3f7d36, 0x4a8a3c, 0x35702f];
    for (let i = 0; i < 4; i++) {
      b.blob(
        m.matte,
        green[i % 3],
        1.1 + rnd() * 0.7,
        [(rnd() - 0.5) * 1.6, h * 0.62 + rnd() * 1.3, (rnd() - 0.5) * 1.6],
        [1, 0.8, 1],
      );
    }
  }
  b.pop();
  return b;
}

/** A handful of chunky low-poly clouds as one mesh. */
export function buildClouds(rnd: () => number, count: number, spread: number, height: number): THREE.Mesh {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x8a8f96, fog: false });
  const b = new Builder();
  for (let i = 0; i < count; i++) {
    const cx = (rnd() - 0.5) * spread * 2;
    const cz = (rnd() - 0.5) * spread * 2;
    const cy = height + rnd() * 40;
    const s = 9 + rnd() * 12;
    const puffs = 4 + ((rnd() * 4) | 0);
    for (let k = 0; k < puffs; k++) {
      b.blob(
        mat,
        0xffffff,
        s * (0.45 + rnd() * 0.5),
        [cx + (k - puffs / 2) * s * 0.55, cy + rnd() * s * 0.2, cz + (rnd() - 0.5) * s * 0.7],
        [1.25, 0.5, 1],
      );
    }
  }
  const mesh = b.build(false, false).children[0] as THREE.Mesh;
  mesh.frustumCulled = false;
  return mesh;
}

export const HORIZON = 0xb9dcf7;

/** Gradient sky dome coloured per vertex (top, middle, horizon). */
export function buildSky(colors: readonly [number, number, number] = [0x2f7fe6, 0x63a9f2, HORIZON]): THREE.Mesh {
  const g = new THREE.SphereGeometry(480, 24, 14);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(colors[0]);
  const mid = new THREE.Color(colors[1]);
  const low = new THREE.Color(colors[2]);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / 480);
    if (t < 0.25) c.copy(low).lerp(mid, t / 0.25);
    else c.copy(mid).lerp(top, Math.min(1, (t - 0.25) / 0.6));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}
