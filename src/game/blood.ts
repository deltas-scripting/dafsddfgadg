import * as THREE from 'three';
import type { AudioEngine } from '../engine/audio';
import { mats } from '../engine/materials';
import { CG, RAPIER, type Physics } from '../engine/physics';
import { BLOOD_CELLS } from '../engine/textures';
import { clamp, lerp, rand } from '../engine/util';
import type { Particles } from './particles';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _l = new THREE.Vector3();
const _ln = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Tangent frame of a surface, rotated by `angle` about the normal. `a x b = n`. */
function basis(n: THREE.Vector3, angle: number, a: THREE.Vector3, b: THREE.Vector3) {
  _t1.crossVectors(n, Math.abs(n.y) > 0.9 ? X : Y).normalize();
  _t2.crossVectors(n, _t1);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  a.copy(_t1).multiplyScalar(c).addScaledVector(_t2, s);
  b.copy(_t1).multiplyScalar(-s).addScaledVector(_t2, c);
}

/**
 * Keeps a decal on the box face it landed on: shrinks it to the face and slides it away from
 * the edges, so splats never hang in the air past a wall or crate edge. Returns the new radius.
 */
export function fitToCollider(col: RAPIER.Collider, p: THREE.Vector3, n: THREE.Vector3, size: number): number {
  if (col.shapeType() !== RAPIER.ShapeType.Cuboid) return size;
  const he = col.halfExtents();
  if (!he) return size;
  const t = col.translation();
  const r = col.rotation();
  _q.set(r.x, r.y, r.z, r.w);
  _qi.copy(_q).invert();
  _l.set(p.x - t.x, p.y - t.y, p.z - t.z).applyQuaternion(_qi);
  _ln.copy(n).applyQuaternion(_qi);
  const ax = Math.abs(_ln.x);
  const ay = Math.abs(_ln.y);
  const az = Math.abs(_ln.z);
  const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const h = [he.x, he.y, he.z];
  const l = [_l.x, _l.y, _l.z];
  let s = size;
  for (let i = 0; i < 3; i++) if (i !== axis) s = Math.min(s, h[i]);
  // 0.9: the outer rim of every decal texture is transparent
  for (let i = 0; i < 3; i++) if (i !== axis) l[i] = clamp(l[i], -h[i] + s * 0.9, h[i] - s * 0.9);
  p.set(l[0], l[1], l[2]).applyQuaternion(_q);
  p.x += t.x;
  p.y += t.y;
  p.z += t.z;
  return s;
}

interface Grow {
  i: number;
  stamp: number;
  c: THREE.Vector3;
  a: THREE.Vector3;
  b: THREE.Vector3;
  r0: number;
  r1: number;
  t: number;
  dur: number;
}

/** Ring buffer of textured quads in one draw call. The oldest decal is recycled when full. */
export class DecalLayer {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private nor: Float32Array;
  private uv: Float32Array;
  private col: Float32Array;
  private attrs: [THREE.BufferAttribute, number][];
  private stamp: Uint32Array;
  private serial = 1;
  private cursor = 0;
  private count = 0;
  private lo = Infinity;
  private hi = -1;
  private grow: Grow[] = [];

  constructor(
    scene: THREE.Scene,
    material: THREE.Material,
    private max: number,
    private cells: number,
    renderOrder: number,
  ) {
    this.pos = new Float32Array(max * 12);
    this.nor = new Float32Array(max * 12);
    this.uv = new Float32Array(max * 8);
    this.col = new Float32Array(max * 16);
    this.stamp = new Uint32Array(max);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    const g = new THREE.BufferGeometry();
    const mk = (arr: Float32Array, size: number) => new THREE.BufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage);
    const aPos = mk(this.pos, 3);
    const aNor = mk(this.nor, 3);
    const aUv = mk(this.uv, 2);
    const aCol = mk(this.col, 4);
    g.setAttribute('position', aPos);
    g.setAttribute('normal', aNor);
    g.setAttribute('uv', aUv);
    g.setAttribute('color', aCol);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.attrs = [
      [aPos, 3],
      [aNor, 3],
      [aUv, 2],
      [aCol, 4],
    ];
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = renderOrder;
    scene.add(this.mesh);
  }

  private touch(i: number) {
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  private writePos(i: number, c: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number) {
    const p = this.pos;
    const o = i * 12;
    const sx = [-1, 1, 1, -1];
    const sy = [-1, -1, 1, 1];
    for (let k = 0; k < 4; k++) {
      p[o + k * 3] = c.x + (a.x * sx[k] + b.x * sy[k]) * r;
      p[o + k * 3 + 1] = c.y + (a.y * sx[k] + b.y * sy[k]) * r;
      p[o + k * 3 + 2] = c.z + (a.z * sx[k] + b.z * sy[k]) * r;
    }
    this.touch(i);
  }

  /** Adds a quad of half-size `r` lying on the surface at `p`. Returns its slot. */
  add(
    p: THREE.Vector3,
    n: THREE.Vector3,
    r: number,
    cell: number,
    o: { angle?: number; alpha?: number; shade?: number; lift?: number } = {},
  ): number {
    const i = this.cursor;
    this.cursor = (i + 1) % this.max;
    this.count = Math.min(this.count + 1, this.max);
    this.stamp[i] = this.serial++;
    basis(n, o.angle ?? Math.random() * 6.283, _a, _b);
    _c.copy(p).addScaledVector(n, o.lift ?? 0.004 + Math.random() * 0.005);
    this.writePos(i, _c, _a, _b, r);
    const N = this.cells;
    const e = 0.003;
    const cu = cell % N;
    const cv = Math.floor(cell / N);
    const u0 = cu / N + e;
    const u1 = (cu + 1) / N - e;
    const v1 = 1 - cv / N - e;
    const v0 = 1 - (cv + 1) / N + e;
    this.uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    const s = o.shade ?? 1;
    const al = o.alpha ?? 1;
    for (let k = 0; k < 4; k++) {
      this.nor.set([n.x, n.y, n.z], i * 12 + k * 3);
      this.col.set([s, s, s, al], i * 16 + k * 4);
    }
    this.mesh.geometry.setDrawRange(0, this.count * 6);
    return i;
  }

  /** A decal that spreads from `r0` to `r1` over `dur` seconds (blood pools). */
  addGrowing(p: THREE.Vector3, n: THREE.Vector3, r0: number, r1: number, dur: number, cell: number) {
    const i = this.add(p, n, r0, cell, { lift: 0.003 + Math.random() * 0.002 });
    this.grow.push({ i, stamp: this.stamp[i], c: _c.clone(), a: _a.clone(), b: _b.clone(), r0, r1, t: 0, dur });
  }

  update(dt: number) {
    for (let k = this.grow.length - 1; k >= 0; k--) {
      const g = this.grow[k];
      g.t += dt;
      const done = g.t >= g.dur;
      // stop if the slot was recycled for a newer decal
      if (this.stamp[g.i] === g.stamp) {
        const f = Math.min(1, g.t / g.dur);
        this.writePos(g.i, g.c, g.a, g.b, lerp(g.r0, g.r1, 1 - (1 - f) * (1 - f)));
      }
      if (done || this.stamp[g.i] !== g.stamp) this.grow.splice(k, 1);
    }
    if (this.hi < 0) return;
    const n = this.hi - this.lo + 1;
    for (const [attr, size] of this.attrs) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(this.lo * 4 * size, n * 4 * size);
      attr.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -1;
  }

  clear() {
    this.cursor = 0;
    this.count = 0;
    this.grow.length = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }
}

type DropHit = (x: number, y: number, z: number, n: RAPIER.Vector, col: RAPIER.Collider, size: number) => void;

/** Ballistic blood droplets rendered as one instanced mesh, stretched along their velocity. */
export class Droplets {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private p: Float32Array;
  private v: Float32Array;
  private size: Float32Array;
  private life: Float32Array;

  constructor(
    scene: THREE.Scene,
    private max: number,
  ) {
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mats().droplet, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  get active() {
    return this.n;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number) {
    const i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.size[i] = size;
    this.life[i] = life;
  }

  private kill(i: number) {
    const l = --this.n;
    if (i === l) return;
    this.p.copyWithin(i * 3, l * 3, l * 3 + 3);
    this.v.copyWithin(i * 3, l * 3, l * 3 + 3);
    this.size[i] = this.size[l];
    this.life[i] = this.life[l];
  }

  update(dt: number, physics: Physics, onHit: DropHit) {
    const { p, v, size, life } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      const o = i * 3;
      life[i] -= dt;
      if (life[i] <= 0 || p[o + 1] < -10) {
        this.kill(i);
        continue;
      }
      v[o + 1] -= 15 * dt;
      const dx = v[o] * dt;
      const dy = v[o + 1] * dt;
      const dz = v[o + 2] * dt;
      const len = Math.hypot(dx, dy, dz);
      if (len > 1e-5) {
        _o.set(p[o], p[o + 1], p[o + 2]);
        _d.set(dx / len, dy / len, dz / len);
        const hit = physics.raycast(_o, _d, len + 0.01, CG.qSolid);
        if (hit) {
          const t = hit.timeOfImpact;
          onHit(_o.x + _d.x * t, _o.y + _d.y * t, _o.z + _d.z * t, hit.normal, hit.collider, size[i]);
          this.kill(i);
          continue;
        }
      }
      p[o] += dx;
      p[o + 1] += dy;
      p[o + 2] += dz;
    }
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      const sp = Math.hypot(v[o], v[o + 1], v[o + 2]);
      if (sp > 1e-4) _q.setFromUnitVectors(Y, _d.set(v[o] / sp, v[o + 1] / sp, v[o + 2] / sp));
      else _q.identity();
      const s = size[i];
      _m.compose(_p.set(p[o], p[o + 1], p[o + 2]), _q, _s.set(s, s * Math.min(4.5, 1 + sp * 0.3), s));
      _m.toArray(arr, i * 16);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.n = 0;
    this.mesh.count = 0;
  }
}

/** The blood system: droplets that fly and splatter, surface decals, growing pools, mist. */
export class Blood {
  readonly decals: DecalLayer;
  readonly drops: Droplets;
  /** Pool positions, used for bloody footprints. */
  private pools: { x: number; y: number; z: number; r: number }[] = [];

  constructor(
    scene: THREE.Scene,
    private physics: Physics,
    private audio: AudioEngine,
    private puffs: Particles,
  ) {
    this.decals = new DecalLayer(scene, mats().blood, 2600, BLOOD_CELLS, 3);
    this.drops = new Droplets(scene, 1100);
  }

  /** Droplets in a cone around `dir`. `size` scales droplet (and resulting splat) size. */
  spray(pos: THREE.Vector3, dir: THREE.Vector3, count: number, v0: number, v1: number, spread: number, size = 1) {
    for (let i = 0; i < count; i++) {
      _d.set(dir.x + rand(-spread, spread), dir.y + rand(-spread, spread), dir.z + rand(-spread, spread)).normalize();
      const sp = rand(v0, v1);
      this.drops.spawn(pos.x, pos.y, pos.z, _d.x * sp, _d.y * sp, _d.z * sp, size * rand(0.009, 0.024), rand(1.4, 2.6));
    }
  }

  /** Omnidirectional burst with an upward bias (dismemberment, head shots). */
  burst(pos: THREE.Vector3, count: number, speed: number) {
    for (let i = 0; i < count; i++) {
      _d.set(rand(-1, 1), rand(-0.35, 1), rand(-1, 1)).normalize();
      const sp = rand(0.25, 1) * speed;
      this.drops.spawn(pos.x, pos.y, pos.z, _d.x * sp, _d.y * sp, _d.z * sp, rand(0.012, 0.032), rand(1.4, 2.8));
    }
  }

  /** Fine red mist puff. */
  mist(pos: THREE.Vector3, dir: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      this.puffs.emit(
        pos.x,
        pos.y,
        pos.z,
        dir.x * rand(0.3, 1.8) + rand(-0.5, 0.5),
        dir.y * rand(0.3, 1.8) + rand(-0.2, 0.7),
        dir.z * rand(0.3, 1.8) + rand(-0.5, 0.5),
        rand(0.3, 0.7),
        rand(0.05, 0.12),
        rand(0.3, 0.6),
        0.3,
        0.004,
        0.004,
        rand(0.35, 0.6),
        0.8,
        1.5,
      );
    }
  }

  /** Places a splat decal; walls get dripping variants. */
  splat(p: THREE.Vector3, n: THREE.Vector3, r: number, col: RAPIER.Collider | null, drips = true) {
    if (col) r = fitToCollider(col, p, n, r);
    if (r < 0.012) return;
    const flat = Math.abs(n.y) > 0.6;
    let cell: number;
    let angle = Math.random() * 6.283;
    if (!flat && drips && r > 0.07) {
      cell = 8 + ((Math.random() * 4) | 0);
      angle = Math.PI;
    } else if (r < 0.09 && Math.random() < 0.5) {
      cell = 6 + ((Math.random() * 2) | 0);
    } else {
      cell = (Math.random() * 6) | 0;
    }
    this.decals.add(p, n, r, cell, { angle, alpha: rand(0.84, 1), shade: rand(0.72, 1) });
  }

  /** Blood thrown onto whatever is behind a gunshot wound. */
  exitSplatter(pos: THREE.Vector3, dir: THREE.Vector3) {
    let primary = false;
    for (let k = 0; k < 4; k++) {
      const j = k === 0 ? 0 : 0.2;
      _d.set(dir.x + rand(-j, j), dir.y - 0.1 + rand(-j, j), dir.z + rand(-j, j)).normalize();
      const hit = this.physics.raycast(pos, _d, 4.5, CG.qStatic);
      if (!hit) continue;
      const t = hit.timeOfImpact;
      _p.copy(pos).addScaledVector(_d, t);
      _n.set(hit.normal.x, hit.normal.y, hit.normal.z);
      const r = k === 0 ? lerp(0.5, 0.2, t / 4.5) * rand(0.8, 1.25) : rand(0.07, 0.2);
      this.splat(_p, _n, r, hit.collider, k === 0);
      if (k === 0) primary = true;
    }
    if (primary) return;
    // nothing close behind: the spray arcs down onto the ground a couple of metres on
    const reach = rand(1.2, 2.8);
    _o.set(pos.x + dir.x * reach, pos.y, pos.z + dir.z * reach);
    const down = this.physics.raycast(_o, _d.set(0, -1, 0), 3, CG.qStatic);
    if (!down) return;
    _o.y -= down.timeOfImpact;
    _n.set(down.normal.x, down.normal.y, down.normal.z);
    this.splat(_o, _n, rand(0.2, 0.42), down.collider);
  }

  /** Slowly spreading pool on the ground. */
  pool(p: THREE.Vector3, n: THREE.Vector3, r: number, col: RAPIER.Collider | null) {
    if (col) r = fitToCollider(col, p, n, r);
    if (r < 0.05) return;
    this.decals.addGrowing(p, n, r * 0.22, r, rand(6, 11), 12 + ((Math.random() * 2) | 0));
    this.pools.push({ x: p.x, y: p.y, z: p.z, r });
    if (this.pools.length > 90) this.pools.shift();
  }

  inPool(p: THREE.Vector3) {
    for (const k of this.pools) {
      if (Math.abs(k.y - p.y) < 0.4 && (k.x - p.x) ** 2 + (k.z - p.z) ** 2 < (k.r * 0.8) ** 2) return true;
    }
    return false;
  }

  /** `forward` is the horizontal walking direction. */
  footprint(p: THREE.Vector3, forward: THREE.Vector3, alpha: number) {
    this.decals.add(p, Y, 0.15, 14, { angle: Math.atan2(forward.z, -forward.x), alpha, lift: 0.006 });
  }

  private onDrop: DropHit = (x, y, z, n, col, size) => {
    const body = col.parent();
    if (body && !body.isFixed()) return;
    _p.set(x, y, z);
    _n.set(n.x, n.y, n.z);
    this.splat(_p, _n, clamp(size * rand(6, 11), 0.035, 0.34), col);
    this.audio.play('splat', { pos: _p, gap: 0.07, rate: rand(0.8, 1.3) });
  };

  update(dt: number) {
    this.drops.update(dt, this.physics, this.onDrop);
    this.decals.update(dt);
  }

  clear() {
    this.drops.clear();
    this.decals.clear();
    this.pools.length = 0;
  }
}
