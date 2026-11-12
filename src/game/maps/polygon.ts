import * as THREE from 'three';
import { Builder, type BoxOpts, type V3 } from '../../engine/builder';
import { mats } from '../../engine/materials';
import type { Physics } from '../../engine/physics';
import { mulberry32 } from '../../engine/util';
import {
  CONTAINER,
  addAmmoBox,
  addCar,
  addContainer,
  addJerryCan,
  addSandbags,
  addTable,
  addTarget,
  addTree,
  buildClouds,
} from '../../models/props';

export interface MapInstance {
  name: string;
  spawn: THREE.Vector3;
  yaw: number;
  /** x, y, z, yaw of the dolls standing around at the start. */
  dolls: [number, number, number, number][];
  /** x, y, z (centre) and edge length of the loose crates. */
  crates: [number, number, number, number][];
  /** x, y (base), z of the explosive barrels. */
  barrels: [number, number, number][];
  /** Vantage point for the map thumbnail. */
  view: { pos: V3; look: V3 };
  update(dt: number): void;
}

/** [from, to, sill height, lintel height] along the wall. */
type Opening = [number, number, number, number];

/** Static level geometry: every `solid` is a visible box with a matching collider. */
class Level {
  readonly b = new Builder();
  readonly boxes: { half: V3; pos: V3; rot?: V3 }[] = [];

  solid(mat: THREE.Material, color: number, size: V3, pos: V3, o: BoxOpts = {}) {
    this.b.box(mat, color, size, pos, o);
    this.collide([size[0] / 2, size[1] / 2, size[2] / 2], pos, o.rot);
  }

  collide(half: V3, pos: V3, rot?: V3) {
    this.boxes.push({ half, pos, rot });
  }

  /** Wall running along `axis` from `a` to `b` at cross position `c`, with door/window openings. */
  wall(
    mat: THREE.Material,
    color: number,
    axis: 'x' | 'z',
    a: number,
    b: number,
    c: number,
    h: number,
    t: number,
    tile: number,
    openings: Opening[] = [],
  ) {
    const part = (from: number, to: number, y0: number, y1: number) => {
      if (to - from < 0.01 || y1 - y0 < 0.01) return;
      const len = to - from;
      const mid = (from + to) / 2;
      const size: V3 = axis === 'x' ? [len, y1 - y0, t] : [t, y1 - y0, len];
      const pos: V3 = axis === 'x' ? [mid, (y0 + y1) / 2, c] : [c, (y0 + y1) / 2, mid];
      this.solid(mat, color, size, pos, { tile });
    };
    let cur = a;
    for (const [o0, o1, sill, lintel] of [...openings].sort((p, q) => p[0] - q[0])) {
      part(cur, o0, 0, h);
      part(o0, o1, 0, sill);
      part(o0, o1, lintel, h);
      cur = o1;
    }
    part(cur, b, 0, h);
  }
}

/** Height of the paved yard above the grass. */
const YARD = 0.04;

/**
 * Polygon: a walled training ground with a paved yard, a covered shooting range, an open-top
 * kill house, stacked shipping containers and a watchtower. Pass `physics = null` to build
 * only the visuals (used for the menu thumbnail).
 */
export function buildPolygon(scene: THREE.Scene, physics: Physics | null): MapInstance {
  const m = mats();
  const L = new Level();
  const b = L.b;
  const rnd = mulberry32(77);
  const W = 0xffffff;

  // ---- ground, yard, road
  L.solid(m.grass, W, [420, 1, 420], [0, -0.5, 0], { tile: 7 });
  L.solid(m.tiles, W, [56, YARD, 40], [0, YARD / 2, 16], { tile: 2 });
  L.solid(m.asphalt, W, [9, YARD + 0.006, 12.4], [0, (YARD + 0.006) / 2, 34], { tile: 4 });
  for (const sx of [1, -1]) b.box(m.matte, 0xe6e2d6, [0.16, 0.004, 12], [4 * sx, YARD + 0.009, 34]);

  // ---- perimeter wall and gate
  const PW = 40;
  L.wall(m.panels, W, 'x', -PW, PW, -PW, 3, 0.4, 2);
  L.wall(m.panels, W, 'x', -PW, PW, PW, 3, 0.4, 2, [[-4.7, 4.7, 0, 3]]);
  L.wall(m.panels, W, 'z', -PW, PW, -PW, 3, 0.4, 2);
  L.wall(m.panels, W, 'z', -PW, PW, PW, 3, 0.4, 2);
  L.solid(m.corrugated, 0x4d6e58, [9.4, 2.7, 0.12], [0, 1.35, PW + 0.05], { tile: 1.2 });
  for (const sx of [1, -1]) {
    L.solid(m.concrete, 0xd8d6cf, [0.7, 3.5, 0.7], [5 * sx, 1.75, PW], { tile: 3 });
    b.box(m.hazard, W, [0.72, 0.5, 0.72], [5 * sx, 0.9, PW]);
  }

  // ---- shooting range (north-west)
  L.solid(m.concrete, W, [27, 0.05, 5.4], [-22, 0.025, -4.6], { tile: 3 });
  L.solid(m.corrugated, 0x8d4c3c, [27.6, 0.12, 6], [-22, 2.95, -4.6], { tile: 1.2 });
  for (const x of [-35.2, -28.6, -22, -15.4, -8.8]) {
    for (const z of [-2.1, -7.1]) L.solid(m.matte, 0x474c52, [0.18, 2.9, 0.18], [x, 1.45, z]);
  }
  L.solid(m.planks, W, [27, 0.1, 0.75], [-22, 1.0, -6.75], { tile: 1.5 });
  L.solid(m.planks, 0xcdbfa8, [27, 0.95, 0.08], [-22, 0.475, -7.05], { tile: 1.5 });
  for (const x of [-28.6, -22, -15.4]) L.solid(m.planks, W, [0.08, 1.2, 1.7], [x, 1.65, -6.5], { tile: 1.5 });
  for (const x of [-28.75, -22.25, -15.75]) L.solid(m.concrete, W, [0.25, 0.28, 27], [x, 0.14, -21.5], { tile: 3 });
  const lanes = [-32, -25.5, -19, -12.5];
  lanes.forEach((x, i) => {
    for (const z of [-14 - (i % 2) * 3, -24 + (i % 2) * 2, -32]) {
      addTarget(b, [x, 0, z]);
      L.collide([0.38, 0.38, 0.03], [x, 1.45, z + 0.045]);
    }
  });
  L.solid(m.dirt, W, [31, 4.6, 6], [-22, 0.5, -37.4], { tile: 4, rot: [0.7, 0, 0] });
  L.wall(m.concrete, 0xe2dfd6, 'z', -39.8, -9.5, -7.2, 2.2, 0.3, 3);

  // ---- kill house (north-east), open to the sky
  const KC = 0xe6e2d8;
  const KI = 0xcfcbc0;
  L.solid(m.concrete, 0xd9d6cc, [24.6, 0.05, 24.6], [20, 0.025, -22], { tile: 3 });
  L.wall(m.concrete, KC, 'x', 8, 32, -10, 2.8, 0.3, 3, [
    [11, 12.4, 0, 2.15],
    [16, 17.6, 1, 2],
    [24, 25.6, 1, 2],
  ]);
  L.wall(m.concrete, KC, 'x', 8, 32, -34, 2.8, 0.3, 3, [[20.6, 22.2, 1, 2]]);
  L.wall(m.concrete, KC, 'z', -34, -10, 8, 2.8, 0.3, 3, [
    [-24, -22.6, 0, 2.15],
    [-16, -14.4, 1, 2],
  ]);
  L.wall(m.concrete, KC, 'z', -34, -10, 32, 2.8, 0.3, 3, [[-28, -26.4, 1, 2]]);
  L.wall(m.concrete, KI, 'z', -34, -18, 20, 2.8, 0.25, 3, [[-27, -25.6, 0, 2.15]]);
  L.wall(m.concrete, KI, 'x', 8, 20, -20, 2.8, 0.25, 3, [[13, 14.4, 0, 2.15]]);
  L.wall(m.concrete, KI, 'x', 22.5, 32, -18, 2.8, 0.25, 3, [[27, 28.4, 0, 2.15]]);
  L.solid(m.planks, W, [2.2, 1.3, 0.08], [15, 0.65, -14.5], { tile: 1.5 });
  L.solid(m.planks, W, [0.08, 1.3, 2.2], [26, 0.65, -13.2], { tile: 1.5 });
  L.solid(m.planks, W, [2.4, 1, 0.08], [25.5, 0.5, -27], { tile: 1.5, rot: [0, 0.5, 0] });

  // ---- shipping containers (east)
  const { w: CW, h: CH, l: CL } = CONTAINER;
  const container = (x: number, y: number, z: number, turned: boolean, color: number) => {
    addContainer(b, [x, y, z], turned ? Math.PI / 2 : 0, color);
    L.collide(turned ? [CL / 2, CH / 2, CW / 2] : [CW / 2, CH / 2, CL / 2], [x, y + CH / 2, z]);
  };
  container(24, YARD, 8, false, 0x2f5f9e);
  container(30.6, YARD, 8, false, 0xa33a2a);
  container(30.6, YARD + CH, 8, false, 0x3d7a4a);
  container(27.4, YARD, 23, true, 0xc9a227);
  // plank ramp onto the blue container
  L.solid(m.planks, W, [1.8, 0.12, 6.05], [24, 1.26, 13.85], { tile: 1.5, rot: [0.4487, 0, 0] });

  // ---- watchtower (south-west)
  const TX = -27;
  const TZ = 27;
  const PH = 4;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) L.solid(m.planks, 0xa8947c, [0.24, 6.7, 0.24], [TX + 2 * sx, 3.35, TZ + 2 * sz], { tile: 1.5 });
    b.box(m.planks, 0xa8947c, [0.1, 0.16, 5.2], [TX + 2 * sx, 2, TZ], { rot: [0.72, 0, 0] });
  }
  L.solid(m.planks, W, [4.4, 0.15, 4.4], [TX, PH - 0.075, TZ], { tile: 1.5 });
  L.solid(m.corrugated, 0x7a3d32, [5.3, 0.1, 5.3], [TX, 6.72, TZ], { tile: 1.2 });
  const rail = (axis: 'x' | 'z', from: number, to: number, c: number) => {
    const len = to - from;
    const mid = (from + to) / 2;
    for (const y of [PH + 1.02, PH + 0.55]) {
      b.box(m.planks, 0xa8947c, axis === 'x' ? [len, 0.07, 0.07] : [0.07, 0.07, len], axis === 'x' ? [mid, y, c] : [c, y, mid]);
    }
    L.collide(axis === 'x' ? [len / 2, 0.55, 0.05] : [0.05, 0.55, len / 2], axis === 'x' ? [mid, PH + 0.55, c] : [c, PH + 0.55, mid]);
  };
  rail('z', TZ - 2.1, TZ + 2.1, TX - 2.1);
  rail('z', TZ - 2.1, TZ + 2.1, TX + 2.1);
  rail('x', TX - 2.1, TX + 2.1, TZ + 2.1);
  rail('x', TX - 2.1, TX - 0.8, TZ - 2.1);
  rail('x', TX + 0.8, TX + 2.1, TZ - 2.1);
  // stairs: visual treads over a ramp collider that follows the step noses
  const STEPS = 16;
  const RISE = PH / STEPS;
  const RUN = 0.4;
  const top = TZ - 2.2;
  for (let i = 0; i < STEPS - 1; i++) {
    b.box(m.planks, W, [1.4, 0.05, RUN + 0.04], [TX, PH - (i + 1) * RISE - 0.025, top - (i + 0.5) * RUN], { tile: 1.5 });
  }
  const run = STEPS * RUN;
  const slope = Math.atan2(PH, run);
  const len = Math.hypot(PH, run);
  L.collide([0.7, 0.1, len / 2], [TX, PH / 2 - 0.1 * Math.cos(slope), top - run / 2 + 0.1 * Math.sin(slope)], [-slope, 0, 0]);
  for (const sx of [1, -1]) {
    b.box(m.planks, 0xa8947c, [0.08, 0.26, len], [TX + 0.74 * sx, PH / 2 - 0.2, top - run / 2 + 0.1], { rot: [-slope, 0, 0] });
  }

  // ---- parked car, workbench, cover
  const carYaw = 2.25;
  b.push([13, YARD, 31], [0, carYaw, 0]);
  addCar(b);
  b.pop();
  L.collide([0.87, 0.4, 2.2], [13, YARD + 0.45, 31], [0, carYaw, 0]);
  L.collide([0.76, 0.3, 1.15], [13 + 0.32 * Math.sin(carYaw), YARD + 1.12, 31 + 0.32 * Math.cos(carYaw)], [0, carYaw, 0]);

  b.push([-7.5, YARD, 31.5], [0, 0.3, 0]);
  addTable(b);
  addAmmoBox(b, [-0.9, 0.975, 0.05], 0.3);
  addAmmoBox(b, [-0.5, 0.975, -0.12], -0.2);
  addAmmoBox(b, [0.7, 0.975, 0.1], 1.4);
  addJerryCan(b, [0.9, 0.32, 0], 0xd9d6cc, 0.2);
  addJerryCan(b, [0.3, 0.32, 0.05], 0x2f4f8f, -0.1);
  b.pop();
  L.collide([1.5, 0.49, 0.43], [-7.5, YARD + 0.49, 31.5], [0, 0.3, 0]);

  const bags = (x: number, z: number, yaw: number, count: number, rows: number) => {
    addSandbags(b, [x, YARD, z], yaw, count, rows);
    L.collide([count * 0.31, rows * 0.1, 0.17], [x, YARD + rows * 0.1, z], [0, yaw, 0]);
  };
  bags(-9, 13, 0.2, 4, 4);
  bags(8.5, 9, -0.3, 4, 4);
  bags(0, 2, 0, 5, 3);
  bags(-19, 17, 1.2, 3, 4);

  for (const [x, z] of [
    [-27.4, 0.6],
    [27.4, -3],
    [27.4, 35.4],
    [-20, 35.4],
  ]) {
    L.solid(m.matte, 0x3a3f45, [0.2, 8, 0.2], [x, 4, z]);
    b.box(m.matte, 0x2a2d31, [1.3, 0.5, 0.34], [x, 8.15, z], { chamfer: 0.04 });
    b.box(m.glow, 0xfff6d8, [1.1, 0.36, 0.02], [x, 8.15, z + (z > 0 ? -0.18 : 0.18)]);
  }

  // ---- scenery beyond the wall
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 50 + rnd() * 95;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < 44 && Math.abs(z) < 44) continue;
    addTree(b, x, z, rnd);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.4;
    const r = 250 + rnd() * 60;
    b.blob(m.matte, i % 2 ? 0x57894a : 0x4a7c43, 80 + rnd() * 30, [Math.cos(a) * r, -22, Math.sin(a) * r], [1.7, 0.55, 1.3]);
  }

  scene.add(b.build());
  const clouds = buildClouds(rnd, 18, 420, 95);
  scene.add(clouds);

  if (physics) {
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (const c of L.boxes) {
      physics.staticBox(c.half, c.pos, c.rot ? q.setFromEuler(e.set(c.rot[0], c.rot[1], c.rot[2])) : undefined);
    }
  }

  const G = YARD;
  return {
    name: 'Polygon',
    spawn: new THREE.Vector3(0, G + 0.01, 30),
    yaw: 0,
    dolls: [
      [-3, G, 12.5, 0],
      [0, G, 11, 0],
      [3, G, 12.5, 0],
    ],
    crates: [
      [16, G + 0.5, 20, 1],
      [17.15, G + 0.5, 20.3, 1],
      [16.5, G + 1.5, 20.2, 1],
      [-14, G + 0.35, 24, 0.7],
      [-13.2, G + 0.35, 24.7, 0.7],
      [20, G + 0.35, 2, 0.7],
      [-16, G + 0.5, 4, 1],
      [11.2, G + 0.35, -7, 0.7],
    ],
    barrels: [
      [10, G, 16],
      [10.8, G, 16.6],
      [-12, G, 7],
      [5, G, -1],
      [18.5, 0.05, -13],
      [-21, G, 31],
    ],
    view: { pos: [-33, 13, 47], look: [5, 0.5, 2] },
    update(dt: number) {
      clouds.position.x += dt * 1.5;
      if (clouds.position.x > 300) clouds.position.x = -300;
    },
  };
}
