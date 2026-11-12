import * as THREE from 'three';
import { chamferBox } from '../engine/builder';
import { CG, RAPIER } from '../engine/physics';
import type { HeadDef } from '../engine/textures';
import { rand } from '../engine/util';
import type { Game } from './game';

interface Gib {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  life: number;
  trail: number;
  acc: number;
}

const MAX_GIBS = 70;
const FLESH = [0x6e0b0b, 0x8a1515, 0x9c3a3a];
const BONE = 0xe9dfca;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Physical chunks of meat, bone and debris that fly off and leave blood trails. */
export class Gibs {
  private list: Gib[] = [];
  private geo = chamferBox(1, 1, 1, 0.14);
  private mats = new Map<number, THREE.MeshLambertMaterial>();

  constructor(private game: Game) {}

  private material(color: number) {
    let m = this.mats.get(color);
    if (!m) this.mats.set(color, (m = new THREE.MeshLambertMaterial({ color })));
    return m;
  }

  /** `trail` is how long (seconds) the chunk drips blood while flying; 0 for dry debris. */
  add(pos: THREE.Vector3, vel: THREE.Vector3, size: readonly [number, number, number], color: number, trail = 0.9) {
    const g = this.game;
    if (this.list.length >= MAX_GIBS) this.remove(0);
    const mesh = new THREE.Mesh(this.geo, this.material(color));
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    g.scene.add(mesh);
    _q.setFromEuler(_e.set(rand(6.28), rand(6.28), rand(6.28)));
    const body = g.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation(_q)
        .setLinvel(vel.x, vel.y, vel.z)
        .setAngvel({ x: rand(-14, 14), y: rand(-14, 14), z: rand(-14, 14) })
        .setLinearDamping(0.1)
        .setAngularDamping(0.8),
    );
    const collider = g.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
        .setDensity(500)
        .setFriction(0.9)
        .setRestitution(0.25)
        .setCollisionGroups(CG.debris),
      body,
    );
    this.list.push({ mesh, body, collider, life: rand(14, 20), trail, acc: 0 });
  }

  /** A few scraps of flesh thrown from a wound. */
  chunks(pos: THREE.Vector3, dir: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      _v.set(dir.x * rand(1, 3) + rand(-1.5, 1.5), rand(1.5, 4), dir.z * rand(1, 3) + rand(-1.5, 1.5));
      this.add(pos, _v, [rand(0.03, 0.06), rand(0.025, 0.045), rand(0.03, 0.06)], FLESH[i % 3]);
    }
  }

  /** Skull, scalp and brain fragments of a destroyed head. */
  headBurst(pos: THREE.Vector3, dir: THREE.Vector3, head: HeadDef) {
    const top = head.style === 'mask' ? 0x1b1b1e : head.style === 'bald' ? head.skin : head.hair;
    const bits: [number, number, number, number][] = [
      [BONE, 0.075, 0.03, 0.06],
      [BONE, 0.05, 0.025, 0.07],
      [BONE, 0.04, 0.03, 0.04],
      [head.skin, 0.07, 0.05, 0.03],
      [head.skin, 0.05, 0.06, 0.03],
      [top, 0.08, 0.035, 0.07],
      [FLESH[2], 0.06, 0.045, 0.05],
      [FLESH[1], 0.05, 0.04, 0.05],
      [FLESH[0], 0.045, 0.035, 0.045],
    ];
    for (const [color, w, h, d] of bits) {
      _v.set(dir.x * rand(0.5, 4) + rand(-3, 3), rand(1.5, 5.5), dir.z * rand(0.5, 4) + rand(-3, 3));
      this.add(pos, _v, [w, h, d], color);
    }
  }

  private remove(i: number) {
    const gib = this.list[i];
    gib.mesh.removeFromParent();
    this.game.discardBody(gib.body, [gib.collider]);
    this.list.splice(i, 1);
  }

  update(dt: number) {
    const drops = this.game.blood.drops;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const gib = this.list[i];
      gib.life -= dt;
      if (gib.life <= 0) {
        this.remove(i);
        continue;
      }
      if (!gib.body.isSleeping()) {
        gib.body.translation(gib.mesh.position);
        gib.body.rotation(gib.mesh.quaternion);
      }
      if (gib.life < 0.6) gib.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 3));
      if (gib.trail > 0) {
        gib.trail -= dt;
        gib.acc += dt * 34;
        const p = gib.mesh.position;
        while (gib.acc >= 1) {
          gib.acc -= 1;
          gib.body.linvel(_v);
          drops.spawn(
            p.x,
            p.y,
            p.z,
            _v.x * 0.35 + rand(-0.4, 0.4),
            _v.y * 0.35 + rand(-0.2, 0.5),
            _v.z * 0.35 + rand(-0.4, 0.4),
            rand(0.008, 0.016),
            rand(1.2, 2),
          );
        }
      }
    }
  }

  clear() {
    while (this.list.length) this.remove(this.list.length - 1);
  }
}
