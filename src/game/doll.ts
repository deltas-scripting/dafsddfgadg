import * as THREE from 'three';
import { Builder } from '../engine/builder';
import { mats } from '../engine/materials';
import { CG, RAPIER } from '../engine/physics';
import { BLOOD_CELLS, HEADS } from '../engine/textures';
import { Spring, clamp, rand } from '../engine/util';
import { Humanoid, SPECS, type Look, type PartName, type PartSpec, type StumpSpec } from '../models/humanoid';
import type { Game } from './game';

export type DamageKind = 'bullet' | 'blade' | 'blast';

/** One rigid body part of a doll. */
export interface Part {
  spec: PartSpec;
  doll: Doll;
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  parent: Part | null;
  children: Part[];
  hp: number;
  /** Still connected to its parent. */
  attached: boolean;
  /** Simulated as a ragdoll body (otherwise posed by the standing rig). */
  dynamic: boolean;
  /** Destroyed outright (exploded head). */
  gone: boolean;
  joint: RAPIER.ImpulseJoint | null;
  wounds: THREE.Mesh[];
}

interface Emitter {
  part: Part;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  age: number;
  strength: number;
  acc: number;
  /** stump: arterial spurts; wound: brief trickle; seep: no droplets, just feeds a pool */
  kind: 'stump' | 'wound' | 'seep';
  pooled: boolean;
}

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const DOWN = new THREE.Vector3(0, -1, 0);
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _ref = new THREE.Vector3();
const _w1 = new THREE.Vector3();
const _w2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const v3 = (a: readonly [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2]);

const woundGeos = new Map<number, THREE.BufferGeometry>();
/** Unit quad mapped to one cell of the blood atlas. */
function woundGeo(cell: number) {
  let g = woundGeos.get(cell);
  if (!g) {
    g = new THREE.PlaneGeometry(1, 1);
    const n = BLOOD_CELLS;
    const cu = cell % n;
    const cv = Math.floor(cell / n);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cu + uv.getX(i)) / n, 1 - (cv + 1 - uv.getY(i)) / n);
    woundGeos.set(cell, g);
  }
  return g;
}

const stumpGeos = new Map<string, THREE.BufferGeometry>();
/** Cut surface: raw meat with a bone end, facing +y. */
function stumpGeo(w: number, d: number) {
  const key = `${w}x${d}`;
  let g = stumpGeos.get(key);
  if (!g) {
    const M = mats().matte;
    const b = new Builder();
    b.box(M, 0x5a0909, [w, 0.014, d], [0, 0.001, 0], { chamfer: 0.004 });
    b.box(M, 0x8e1515, [w * 0.72, 0.016, d * 0.72], [0, 0.005, 0], { chamfer: 0.004 });
    b.box(M, 0xa62a2a, [w * 0.2, 0.024, d * 0.24], [w * 0.24, 0.008, -d * 0.2], { chamfer: 0.004 });
    b.box(M, 0x741010, [w * 0.22, 0.03, d * 0.18], [-w * 0.25, 0.01, d * 0.22], { chamfer: 0.004 });
    const bone = Math.min(0.045, Math.min(w, d) * 0.34);
    b.box(M, 0xe9dfca, [bone, 0.04, bone], [0, 0.016, 0], { chamfer: 0.006 });
    b.box(M, 0x8a7e6a, [bone * 0.5, 0.042, bone * 0.5], [0, 0.017, 0]);
    g = b.geometry(M);
    stumpGeos.set(key, g);
  }
  return g;
}

/** Where a ray entering a box at `l` along `d` leaves it again (all in box space). */
function exitPoint(l: THREE.Vector3, d: THREE.Vector3, h: readonly [number, number, number]) {
  const lc = [l.x, l.y, l.z];
  const dc = [d.x, d.y, d.z];
  let t = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dc[i]) < 1e-5) continue;
    const ti = ((dc[i] > 0 ? h[i] : -h[i]) - lc[i]) / dc[i];
    if (ti > 1e-4 && ti < t) t = ti;
  }
  if (t === Infinity) t = 0;
  return new THREE.Vector3(l.x + d.x * t, l.y + d.y * t, l.z + d.z * t);
}

function subtree(part: Part, out: Part[] = []) {
  out.push(part);
  for (const c of part.children) if (c.attached && !c.gone) subtree(c, out);
  return out;
}

/**
 * A goredoll: stands on a posed rig with kinematic colliders until it is killed or loses a leg,
 * then every part becomes a jointed ragdoll body. Parts take damage individually, can be cut off
 * at their joint, and bleed from every wound and stump.
 */
export class Doll {
  readonly rig: Humanoid;
  readonly parts: Part[] = [];
  readonly by = {} as Record<PartName, Part>;
  alive = true;
  standing = true;
  removed = false;
  vital = 100;
  /** Litres of blood left; emitters stop when it runs out. */
  blood = 5;
  age = 0;
  private flX = new Spring(90, 9);
  private flZ = new Spring(90, 9);
  private phase = Math.random() * 10;
  private emitters: Emitter[] = [];
  private thud = -1;
  private bleedOut = -1;

  constructor(
    private game: Game,
    readonly look: Look,
    pos: THREE.Vector3,
    yaw: number,
  ) {
    this.rig = new Humanoid(look);
    this.rig.root.position.copy(pos);
    this.rig.root.rotation.y = yaw;
    game.scene.add(this.rig.root);
    this.rig.root.updateMatrixWorld(true);
    const world = game.physics.world;
    for (const spec of SPECS) {
      const mesh = this.rig.meshes[spec.name];
      mesh.getWorldPosition(_p);
      mesh.getWorldQuaternion(_q);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(_p.x, _p.y, _p.z)
          .setRotation(_q)
          .setLinearDamping(0.12)
          .setAngularDamping(1.5)
          .setCcdEnabled(true),
      );
      const desc = (half: readonly [number, number, number]) =>
        RAPIER.ColliderDesc.cuboid(half[0], half[1], half[2])
          .setCollisionGroups(CG.doll)
          .setFriction(0.9)
          .setRestitution(0.05);
      const colliders = [world.createCollider(desc(spec.half).setMass(spec.mass), body)];
      if (spec.extra) {
        const o = spec.extra.offset;
        colliders.push(world.createCollider(desc(spec.extra.half).setTranslation(o[0], o[1], o[2]).setMass(0.4), body));
      }
      const parent = spec.parent ? this.by[spec.parent] : null;
      const part: Part = {
        spec,
        doll: this,
        mesh,
        body,
        colliders,
        parent,
        children: [],
        hp: spec.hp,
        attached: parent !== null,
        dynamic: false,
        gone: false,
        joint: null,
        wounds: [],
      };
      parent?.children.push(part);
      for (const c of colliders) game.partOf.set(c.handle, part);
      this.parts.push(part);
      this.by[spec.name] = part;
    }
  }

  /** Approximate world position (chest). */
  center(out: THREE.Vector3) {
    return this.by.chest.mesh.getWorldPosition(out);
  }

  // ---------------------------------------------------------------- damage

  /**
   * @param point world-space impact point
   * @param dir   normalised travel direction of the bullet, blade or blast
   * @param power impulse applied to the part
   */
  hit(part: Part, point: THREE.Vector3, dir: THREE.Vector3, dmg: number, kind: DamageKind, power: number) {
    if (part.gone || this.removed) return;
    const g = this.game;
    if (kind !== 'blast') {
      part.mesh.updateWorldMatrix(true, false);
      const local = part.mesh.worldToLocal(point.clone());
      const ldir = dir.clone().transformDirection(_m.copy(part.mesh.matrixWorld).invert());
      const exit = exitPoint(local, ldir, part.spec.half);
      const exitWorld = part.mesh.localToWorld(exit.clone());
      this.addWound(part, local, kind === 'bullet' ? rand(0.05, 0.075) : rand(0.075, 0.11), 15);
      if (kind === 'bullet') {
        this.addWound(part, exit, rand(0.085, 0.14), (Math.random() * 6) | 0);
        g.blood.exitSplatter(exitWorld, dir);
      }
      g.blood.spray(exitWorld, dir, kind === 'bullet' ? 14 : 11, 2, 8.5, 0.42);
      g.blood.spray(point, dir.clone().negate(), 5, 0.8, 3, 0.75, 0.8);
      g.blood.mist(point, dir, 4);
      this.emit(part, local, ldir.clone().negate(), 0.4, 'wound');
    } else if (dmg > 40) {
      g.blood.burst(point, 5, 5);
    }
    g.audio.play('flesh', { pos: point, gap: 0.03, rate: rand(0.85, 1.2) });

    part.hp -= dmg;
    this.vital -= dmg * part.spec.vital;

    if (this.standing) {
      // lean away from the impact; the springs bring the torso back upright
      const yaw = this.rig.root.rotation.y;
      const lx = dir.x * Math.cos(yaw) - dir.z * Math.sin(yaw);
      const lz = dir.x * Math.sin(yaw) + dir.z * Math.cos(yaw);
      const k = 2.4 * Math.min(1.5, dmg / 30);
      this.flX.kick(lz * k);
      this.flZ.kick(-lx * k);
    }

    if (part.hp <= 0) this.destroy(part, dir, kind);
    if (this.alive && this.vital <= 0) this.die();

    if (part.dynamic && !part.gone && power > 0) {
      const k = power * Math.min(1, part.spec.mass / 8);
      part.body.applyImpulseAtPoint({ x: dir.x * k, y: dir.y * k, z: dir.z * k }, point, true);
    }
  }

  private destroy(part: Part, dir: THREE.Vector3, kind: DamageKind) {
    const name = part.spec.name;
    if (name === 'head') {
      if (kind === 'blade') this.sever(part, dir);
      else this.explodeHead(dir);
    } else if (name === 'chest' || name === 'pelvis') {
      // a shredded torso comes apart at the waist
      this.sever(this.by.chest, dir);
    } else {
      this.sever(part, dir);
    }
  }

  /** Cuts `part` (and everything hanging off it) loose from its parent. */
  sever(part: Part, dir: THREE.Vector3) {
    const parent = part.parent;
    if (!part.attached || !parent || part.gone) return;
    const g = this.game;
    const spec = part.spec;
    const wasStanding = this.standing;
    if (wasStanding) this.endSpawnAnim();
    part.attached = false;
    if (part.joint) {
      g.physics.world.removeImpulseJoint(part.joint, true);
      part.joint = null;
    }
    const piece = subtree(part);
    for (const p of piece) this.toDynamic(p);
    for (const p of piece) this.link(p);

    if (spec.stumpSelf) this.addStump(part, spec.stumpSelf, 0.55);
    if (spec.stumpParent && !parent.gone) this.addStump(parent, spec.stumpParent, 1);

    const at = part.mesh.localToWorld(
      new THREE.Vector3(spec.joint[0] - spec.center[0], spec.joint[1] - spec.center[1], spec.joint[2] - spec.center[2]),
    );
    g.blood.burst(at, 28, 5.5);
    g.blood.mist(at, dir, 9);
    g.gibs.chunks(at, dir, 2);
    g.audio.play('sever', { pos: at });

    let mass = 0;
    for (const p of piece) mass += p.spec.mass;
    part.body.applyImpulse(
      {
        x: (dir.x * rand(1.5, 3.2) + rand(-0.8, 0.8)) * mass,
        y: rand(1.4, 3) * mass,
        z: (dir.z * rand(1.5, 3.2) + rand(-0.8, 0.8)) * mass,
      },
      true,
    );
    part.body.applyTorqueImpulse({ x: rand(-1, 1) * mass * 0.06, y: rand(-1, 1) * mass * 0.06, z: rand(-1, 1) * mass * 0.06 }, true);

    const name = spec.name;
    if (name === 'head' || name === 'chest') this.vital = 0;
    if (this.alive && this.vital <= 0) {
      this.die();
    } else if (this.alive) {
      // a living doll that loses a limb bleeds out; without a leg it also goes down
      if (this.bleedOut < 0) this.bleedOut = rand(5, 8);
      if (wasStanding && this.standing && name.includes('Leg')) this.collapse();
    }
  }

  private explodeHead(dir: THREE.Vector3) {
    const head = this.by.head;
    if (head.gone) return;
    const g = this.game;
    const pos = head.mesh.getWorldPosition(new THREE.Vector3());
    const wasAttached = head.attached;
    head.gone = true;
    head.attached = false;
    if (head.joint) {
      g.physics.world.removeImpulseJoint(head.joint, true);
      head.joint = null;
    }
    head.mesh.removeFromParent();
    g.discardBody(head.body, head.colliders);
    this.emitters = this.emitters.filter((e) => e.part !== head);
    const sp = head.spec.stumpParent;
    if (wasAttached && sp) this.addStump(this.by.chest, sp, 1.3);
    g.blood.burst(pos, 46, 7);
    g.blood.mist(pos, dir, 14);
    g.gibs.headBurst(pos, dir, HEADS[this.look.head]);
    g.audio.play('headPop', { pos });
    if (wasAttached) {
      this.vital = 0;
      this.die();
    }
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.game.onKill(this);
    this.collapse();
    // every corpse ends up lying in a pool
    this.emit(this.by.chest, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1, 0), 1, 'seep');
  }

  /** Switches the whole doll from the standing rig to ragdoll physics. */
  collapse() {
    if (!this.standing) return;
    this.endSpawnAnim();
    this.standing = false;
    for (const p of this.parts) this.toDynamic(p);
    for (const p of this.parts) this.link(p);
    const m = this.by.chest.spec.mass;
    this.by.chest.body.applyImpulse({ x: rand(-0.5, 0.5) * m, y: 0, z: rand(-0.5, 0.5) * m }, true);
    this.thud = 0.45;
  }

  private endSpawnAnim() {
    this.rig.root.scale.setScalar(1);
    this.rig.root.updateMatrixWorld(true);
  }

  private toDynamic(p: Part) {
    if (p.dynamic || p.gone) return;
    this.game.scene.attach(p.mesh);
    p.body.setTranslation(p.mesh.position, true);
    p.body.setRotation(p.mesh.quaternion, true);
    p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    for (const c of p.colliders) c.setCollisionGroups(CG.ragdoll);
    p.dynamic = true;
  }

  /** Creates the joint between a ragdoll part and its parent, if both are simulated. */
  private link(p: Part) {
    const parent = p.parent;
    if (!parent || !p.attached || p.joint || p.gone || parent.gone || !p.dynamic || !parent.dynamic) return;
    const s = p.spec;
    const ps = parent.spec;
    const a1 = { x: s.joint[0] - ps.center[0], y: s.joint[1] - ps.center[1], z: s.joint[2] - ps.center[2] };
    const a2 = { x: s.joint[0] - s.center[0], y: s.joint[1] - s.center[1], z: s.joint[2] - s.center[2] };
    const data = s.hinge ? RAPIER.JointData.revolute(a1, a2, { x: 1, y: 0, z: 0 }) : RAPIER.JointData.spherical(a1, a2);
    const joint = this.game.physics.world.createImpulseJoint(data, parent.body, p.body, true);
    if (s.hinge) (joint as RAPIER.RevoluteImpulseJoint).setLimits(s.hinge[0], s.hinge[1]);
    joint.setContactsEnabled(false);
    p.joint = joint;
  }

  // ---------------------------------------------------------------- gore dressing

  private addWound(part: Part, l: THREE.Vector3, size: number, cell: number) {
    const h = part.spec.half;
    const gap = [h[0] - Math.abs(l.x), h[1] - Math.abs(l.y), h[2] - Math.abs(l.z)];
    const axis = gap[0] <= gap[1] && gap[0] <= gap[2] ? 0 : gap[1] <= gap[2] ? 1 : 2;
    const c = [l.x, l.y, l.z];
    const sign = c[axis] >= 0 ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      if (i === axis) {
        c[i] = sign * (h[i] + 0.007);
      } else {
        const lim = Math.max(0, h[i] - size * 0.4);
        c[i] = clamp(c[i], -lim, lim);
      }
    }
    const mesh = new THREE.Mesh(woundGeo(cell), mats().wound);
    mesh.position.set(c[0], c[1], c[2]);
    mesh.quaternion.setFromUnitVectors(Z, _n.set(0, 0, 0).setComponent(axis, sign));
    mesh.rotateZ(Math.random() * 6.283);
    const s = Math.min(size, Math.max(h[(axis + 1) % 3], h[(axis + 2) % 3]) * 1.25) * 2;
    mesh.scale.set(s, s, 1);
    mesh.renderOrder = 4;
    part.mesh.add(mesh);
    part.wounds.push(mesh);
    if (part.wounds.length > 8) part.wounds.shift()?.removeFromParent();
  }

  private addStump(part: Part, s: StumpSpec, strength: number) {
    const mesh = new THREE.Mesh(stumpGeo(s.size[0], s.size[1]), mats().matte);
    mesh.position.set(s.pos[0], s.pos[1], s.pos[2]);
    mesh.quaternion.setFromUnitVectors(Y, _n.set(s.dir[0], s.dir[1], s.dir[2]));
    mesh.castShadow = true;
    part.mesh.add(mesh);
    this.emit(part, v3(s.pos), v3(s.dir), strength, 'stump');
  }

  private emit(part: Part, pos: THREE.Vector3, dir: THREE.Vector3, strength: number, kind: Emitter['kind']) {
    if (this.emitters.length >= 16) {
      const i = this.emitters.findIndex((e) => e.kind === 'wound');
      this.emitters.splice(Math.max(0, i), 1);
    }
    this.emitters.push({ part, pos, dir, age: 0, strength, acc: 0, kind, pooled: false });
  }

  // ---------------------------------------------------------------- per-frame

  update(dt: number) {
    this.age += dt;
    const g = this.game;
    if (this.standing) {
      const p = this.rig.pivots;
      const fx = this.flX.update(dt);
      const fz = this.flZ.update(dt);
      const breathe = Math.sin(this.age * 1.6 + this.phase);
      p.chest.rotation.set(fx + breathe * 0.008, 0, fz);
      p.head.rotation.set(fx * 0.5, Math.sin(this.age * 0.37 + this.phase) * 0.16, fz * 0.5);
      p.upperArmL.rotation.z = 0.07 + breathe * 0.012;
      p.upperArmR.rotation.z = -0.07 - breathe * 0.012;
      const spawning = this.age < 0.3;
      if (spawning) {
        const k = Math.min(1, this.age / 0.24);
        this.rig.root.scale.setScalar(0.82 + 0.18 * (1 - (1 - k) * (1 - k)));
      }
      const flinching = Math.abs(fx) + Math.abs(fz) > 0.002 || Math.abs(this.flX.v) + Math.abs(this.flZ.v) > 0.02;
      if (spawning || flinching) this.syncKinematic();
    } else {
      this.limitJoints(dt);
      if (this.thud > 0 && (this.thud -= dt) <= 0) g.audio.play('thud', { pos: this.center(_p), rate: rand(0.85, 1.15) });
    }
    if (this.alive && this.bleedOut > 0 && (this.bleedOut -= dt) <= 0) this.die();
    this.bleed(dt);
  }

  private syncKinematic() {
    this.rig.root.updateMatrixWorld(true);
    for (const p of this.parts) {
      if (p.dynamic || p.gone) continue;
      p.mesh.getWorldPosition(_p);
      p.mesh.getWorldQuaternion(_q);
      p.body.setNextKinematicTranslation(_p);
      p.body.setNextKinematicRotation(_q);
    }
  }

  /** Copies ragdoll body transforms onto the meshes; call after the physics step. */
  sync() {
    for (const p of this.parts) {
      if (!p.dynamic || p.gone || p.body.isSleeping()) continue;
      p.body.translation(p.mesh.position);
      p.body.rotation(p.mesh.quaternion);
    }
  }

  /**
   * Ball joints have no built-in limits, so limbs are steered back inside a cone around their
   * rest direction with a velocity nudge. Keeps heads and limbs from folding through the torso.
   */
  private limitJoints(dt: number) {
    for (const p of this.parts) {
      const c = p.spec.cone;
      const parent = p.parent;
      if (!c || !p.joint || !parent) continue;
      if (p.body.isSleeping() && parent.body.isSleeping()) continue;
      parent.body.rotation(_qp);
      p.body.rotation(_qc);
      _d.set(c.axis[0], c.axis[1], c.axis[2]).applyQuaternion(_qc);
      _ref.set(c.ref[0], c.ref[1], c.ref[2]).applyQuaternion(_qp);
      this.pull(p, parent, c.lim, dt);
      _d.set(1, 0, 0).applyQuaternion(_qc);
      _ref.set(1, 0, 0).applyQuaternion(_qp);
      this.pull(p, parent, c.twist, dt);
    }
  }

  /** Rotates `p` (direction `_d`) toward `_ref` when the angle between them exceeds `lim`. */
  private pull(p: Part, parent: Part, lim: number, dt: number) {
    const ang = Math.acos(clamp(_d.dot(_ref), -1, 1));
    if (ang <= lim) return;
    _ax.crossVectors(_d, _ref);
    const l = _ax.length();
    if (l < 1e-5) return;
    _ax.divideScalar(l);
    p.body.angvel(_w1);
    parent.body.angvel(_w2);
    // a body resting slightly past its limit is left alone, otherwise the nudges keep it awake forever
    if (ang - lim < 0.6 && _w1.lengthSq() < 0.05 && _w2.lengthSq() < 0.05) return;
    const rel = (_w1.x - _w2.x) * _ax.x + (_w1.y - _w2.y) * _ax.y + (_w1.z - _w2.z) * _ax.z;
    const want = Math.min(9, (ang - lim) * 14);
    if (rel >= want) return;
    const dv = (want - rel) * Math.min(1, dt * 24);
    const mc = p.spec.mass;
    const mp = parent.spec.mass;
    const kc = dv * (mp / (mc + mp));
    const kp = dv * (mc / (mc + mp));
    p.body.setAngvel({ x: _w1.x + _ax.x * kc, y: _w1.y + _ax.y * kc, z: _w1.z + _ax.z * kc }, true);
    parent.body.setAngvel({ x: _w2.x - _ax.x * kp, y: _w2.y - _ax.y * kp, z: _w2.z - _ax.z * kp }, true);
  }

  private bleed(dt: number) {
    const g = this.game;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.age += dt;
      const life = e.kind === 'stump' ? 16 : e.kind === 'seep' ? 12 : 4.5;
      if (e.part.gone || e.age > life || (this.blood <= 0 && e.kind !== 'seep')) {
        this.emitters.splice(i, 1);
        continue;
      }
      const mesh = e.part.mesh;
      mesh.updateWorldMatrix(true, false);
      _p.copy(e.pos);
      mesh.localToWorld(_p);
      if (e.kind !== 'seep') {
        _d.copy(e.dir).transformDirection(mesh.matrixWorld);
        let rate: number;
        let v0: number;
        let v1: number;
        let spread: number;
        if (e.kind === 'stump') {
          const pressure = Math.exp(-e.age / 3.2) * e.strength;
          if (pressure > 0.06) {
            // heartbeat: sharp spurts that weaken as the pressure drops
            const pulse = Math.pow(Math.max(0, Math.sin(e.age * 9.5)), 3);
            rate = (10 + 85 * pulse) * pressure;
            v0 = 0.6 + 3.2 * pulse * pressure;
            v1 = 1.2 + 5.2 * pulse * pressure;
            spread = 0.22;
          } else {
            rate = 2.5;
            v0 = 0.1;
            v1 = 0.5;
            spread = 0.6;
          }
        } else {
          const k = 1 - e.age / life;
          rate = 18 * k * e.strength;
          v0 = 0.2;
          v1 = 0.4 + 1.2 * k;
          spread = 0.5;
        }
        e.acc += rate * dt;
        const n = Math.min(8, e.acc | 0);
        if (n > 0) {
          e.acc -= n;
          g.blood.spray(_p, _d, n, v0, v1, spread, e.kind === 'stump' ? 1.1 : 0.8);
          this.blood -= n * 0.006;
        }
      }
      if (!e.pooled && e.age > 1 && e.part.dynamic) {
        e.part.body.linvel(_w1);
        if (_w1.lengthSq() < 0.09) {
          const hit = g.physics.raycast(_p, DOWN, 0.7, CG.qStatic);
          if (hit && hit.normal.y > 0.7) {
            _p.y -= hit.timeOfImpact;
            const r = e.kind === 'seep' ? rand(0.45, 0.8) : e.kind === 'stump' ? rand(0.28, 0.5) * (0.6 + e.strength * 0.5) : rand(0.14, 0.26);
            g.blood.pool(_p, Y, r, hit.collider);
            e.pooled = true;
          }
        }
      }
    }
  }

  /** Removes the doll and every severed piece of it from the world. */
  dispose() {
    if (this.removed) return;
    this.removed = true;
    for (const p of this.parts) {
      p.mesh.removeFromParent();
      if (!p.gone) this.game.discardBody(p.body, p.colliders);
    }
    this.rig.root.removeFromParent();
    this.emitters.length = 0;
  }
}
