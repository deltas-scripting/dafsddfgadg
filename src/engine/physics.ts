import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export { RAPIER };

/** Collision membership bits. */
export const G = { WORLD: 1, PROP: 2, PLAYER: 4, DOLL: 8, RAGDOLL: 16, DEBRIS: 32 } as const;
const grp = (member: number, filter: number) => ((member << 16) | filter) >>> 0;
const ALL = 0xffff;

/** Interaction groups for colliders (`member`, `filter`) and for scene queries (`q*`). */
export const CG = {
  world: grp(G.WORLD, ALL),
  prop: grp(G.PROP, ALL),
  player: grp(G.PLAYER, G.WORLD | G.PROP | G.DOLL | G.RAGDOLL),
  /** Standing (kinematic) doll parts. */
  doll: grp(G.DOLL, G.PROP | G.PLAYER | G.RAGDOLL | G.DEBRIS),
  ragdoll: grp(G.RAGDOLL, G.WORLD | G.PROP | G.PLAYER | G.DOLL | G.RAGDOLL),
  debris: grp(G.DEBRIS, G.WORLD | G.PROP | G.DOLL),
  /** Player movement: ragdolls are pushed by the capsule instead of blocking it. */
  qMove: grp(ALL, G.WORLD | G.PROP | G.DOLL),
  qBullet: grp(ALL, G.WORLD | G.PROP | G.DOLL | G.RAGDOLL),
  qStatic: grp(ALL, G.WORLD),
  qSolid: grp(ALL, G.WORLD | G.PROP),
} as const;

let ready: Promise<void> | null = null;
export const initPhysics = () => (ready ??= RAPIER.init());

export type RayHit = RAPIER.RayColliderIntersection;

export class Physics {
  world = new RAPIER.World({ x: 0, y: -14, z: 0 });
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  /** Steps in sub-steps of at most 1/60 s so joints stay stable at low frame rates. */
  step(dt: number) {
    const n = Math.max(1, Math.ceil(dt * 60 - 1e-3));
    this.world.timestep = dt / n;
    for (let i = 0; i < n; i++) this.world.step();
  }

  /** `dir` must be normalised. */
  raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    max: number,
    groups: number,
    predicate?: (c: RAPIER.Collider) => boolean,
  ): RayHit | null {
    const r = this.ray;
    r.origin.x = origin.x;
    r.origin.y = origin.y;
    r.origin.z = origin.z;
    r.dir.x = dir.x;
    r.dir.y = dir.y;
    r.dir.z = dir.z;
    return this.world.castRayAndGetNormal(r, max, true, undefined, groups, undefined, undefined, predicate);
  }

  /** Fixed box collider; `rot` is an optional world rotation. */
  staticBox(half: readonly [number, number, number], pos: readonly [number, number, number], rot?: THREE.Quaternion) {
    const d = RAPIER.ColliderDesc.cuboid(half[0], half[1], half[2])
      .setTranslation(pos[0], pos[1], pos[2])
      .setCollisionGroups(CG.world)
      .setFriction(0.9);
    if (rot) d.setRotation(rot);
    return this.world.createCollider(d);
  }

  dispose() {
    this.world.free();
  }
}
