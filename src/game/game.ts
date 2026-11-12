import * as THREE from 'three';
import type { AudioEngine } from '../engine/audio';
import type { Input } from '../engine/input';
import { SHADOW_SIZE, SUN_DIR, addAtmosphere, addLights } from '../engine/lighting';
import { CG, Physics, RAPIER } from '../engine/physics';
import { pick, rand } from '../engine/util';
import { DOLL_LOOKS, type Look } from '../models/humanoid';
import { BARREL, buildBarrelMesh, buildCrate } from '../models/props';
import type { Hud } from '../ui/hud';
import { Blood } from './blood';
import { Doll, type Part } from './doll';
import { Effects } from './effects';
import { Gibs } from './gibs';
import { buildPolygon, type MapInstance } from './maps/polygon';
import { Player } from './player';
import { Weapons } from './weapons';

interface Prop {
  mesh: THREE.Object3D;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  barrel: boolean;
  hp: number;
}

export interface GameHost {
  renderer: THREE.WebGLRenderer;
  audio: AudioEngine;
  input: Input;
  hud: Hud;
}

const SHADOW_RANGE = 34;
const BLAST_RADIUS = 6.5;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3();
const _n = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _o = new THREE.Vector3();

/** One running sandbox session on a map. */
export class Game {
  readonly scene = new THREE.Scene();
  readonly physics = new Physics();
  /** Collider handle -> doll part, for hit detection. */
  readonly partOf = new Map<number, Part>();
  readonly dolls: Doll[] = [];
  readonly maxDolls = 24;
  readonly audio: AudioEngine;
  readonly hud: Hud;
  readonly fx: Effects;
  readonly blood: Blood;
  readonly gibs: Gibs;
  readonly player: Player;
  readonly weapons: Weapons;
  kills = 0;
  private renderer: THREE.WebGLRenderer;
  private input: Input;
  private map: MapInstance;
  private props: Prop[] = [];
  private propOf = new Map<number, Prop>();
  private trash: RAPIER.RigidBody[] = [];
  private fuses: { prop: Prop; t: number }[] = [];
  private sun: THREE.DirectionalLight;
  private sunRight = new THREE.Vector3();
  private sunUp = new THREE.Vector3();
  private shade = 1;
  private shadeTarget = 1;
  private shadeTimer = 0;

  constructor(host: GameHost) {
    this.renderer = host.renderer;
    this.audio = host.audio;
    this.input = host.input;
    this.hud = host.hud;
    const scene = this.scene;
    addAtmosphere(scene);
    this.sun = addLights(scene, SHADOW_RANGE);
    this.sunRight.crossVectors(UP, SUN_DIR).normalize();
    this.sunUp.crossVectors(SUN_DIR, this.sunRight);

    this.map = buildPolygon(scene, this.physics);
    this.fx = new Effects(scene, this.audio);
    this.blood = new Blood(scene, this.physics, this.audio, this.fx.puffs);
    this.gibs = new Gibs(this);
    this.player = new Player(this, this.map.spawn, this.map.yaw);
    this.weapons = new Weapons(this);
    for (const [x, y, z, size] of this.map.crates) this.addCrate(x, y, z, size);
    for (const [x, y, z] of this.map.barrels) this.addBarrel(x, y, z);
    for (const [x, y, z, yaw] of this.map.dolls) this.spawnDoll(new THREE.Vector3(x, y, z), yaw);
    // scene queries only see colliders after a step
    this.physics.world.step();
    this.resize();
    this.hud.setStats(this.dolls.length, this.maxDolls, this.kills);
  }

  // ---------------------------------------------------------------- props

  private addProp(mesh: THREE.Object3D, desc: RAPIER.ColliderDesc, x: number, y: number, z: number, barrel: boolean) {
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const world = this.physics.world;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.1).setAngularDamping(0.4),
    );
    const collider = world.createCollider(desc.setCollisionGroups(CG.prop).setFriction(0.8).setRestitution(0.1), body);
    const prop: Prop = { mesh, body, collider, barrel, hp: 3 };
    this.props.push(prop);
    this.propOf.set(collider.handle, prop);
  }

  private addCrate(x: number, y: number, z: number, size: number) {
    this.addProp(buildCrate(size), RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2).setDensity(70), x, y, z, false);
  }

  private addBarrel(x: number, y: number, z: number) {
    // the barrel model sits on its base; the body origin is its centre
    const holder = new THREE.Group();
    const mesh = buildBarrelMesh();
    mesh.position.y = -BARREL.height / 2;
    holder.add(mesh);
    const desc = RAPIER.ColliderDesc.cylinder(BARREL.height / 2, BARREL.radius).setDensity(160);
    this.addProp(holder, desc, x, y + BARREL.height / 2 + 0.01, z, true);
  }

  /** Disables a body's colliders immediately and removes it before the next physics step. */
  discardBody(body: RAPIER.RigidBody, colliders: RAPIER.Collider[]) {
    for (const c of colliders) {
      this.partOf.delete(c.handle);
      c.setCollisionGroups(0);
    }
    this.trash.push(body);
  }

  // ---------------------------------------------------------------- dolls

  spawnDoll(pos: THREE.Vector3, yaw: number, look?: Look) {
    if (this.dolls.length >= this.maxDolls) {
      const i = this.dolls.findIndex((d) => !d.alive);
      this.removeDoll(this.dolls[Math.max(0, i)], false);
    }
    const doll = new Doll(this, look ?? pick(DOLL_LOOKS), pos, yaw);
    this.dolls.push(doll);
    this.weapons.drawScreen();
    return doll;
  }

  removeDoll(doll: Doll, sparkle: boolean) {
    const i = this.dolls.indexOf(doll);
    if (i < 0) return;
    if (sparkle) {
      for (const p of doll.parts) if (!p.gone) this.fx.dissolve(p.mesh.getWorldPosition(_a));
    }
    doll.dispose();
    this.dolls.splice(i, 1);
    this.weapons.drawScreen();
  }

  onKill(_doll: Doll) {
    this.kills++;
  }

  clearAll() {
    for (const d of this.dolls) d.dispose();
    this.dolls.length = 0;
    this.gibs.clear();
    this.blood.clear();
    this.fx.clear();
    this.weapons.drawScreen();
    this.hud.toast('Map cleaned up');
  }

  // ---------------------------------------------------------------- combat

  /** Hitscan bullet. Returns where it stopped (for the tracer). */
  fireBullet(origin: THREE.Vector3, dir: THREE.Vector3, damage: number, power: number, pen: number): THREE.Vector3 {
    const end = new THREE.Vector3().copy(origin).addScaledVector(dir, 90);
    const skip = new Set<number>();
    _o.copy(origin);
    let range = 260;
    for (let i = 0; i <= pen; i++) {
      const hit = this.physics.raycast(_o, dir, range, CG.qBullet, skip.size ? (c) => !skip.has(c.handle) : undefined);
      if (!hit) break;
      const t = hit.timeOfImpact;
      const point = new THREE.Vector3().copy(_o).addScaledVector(dir, t);
      end.copy(point);
      const part = this.partOf.get(hit.collider.handle);
      if (part) {
        for (const c of part.colliders) skip.add(c.handle);
        const wasAlive = part.doll.alive;
        part.doll.hit(part, point, dir, damage, 'bullet', power);
        this.hud.hitMarker(wasAlive && !part.doll.alive);
        // the round carries on through the body, weakened
        _o.copy(point).addScaledVector(dir, 0.01);
        range -= t;
        damage *= 0.65;
        power *= 0.6;
        continue;
      }
      _n.set(hit.normal.x, hit.normal.y, hit.normal.z);
      const prop = this.propOf.get(hit.collider.handle);
      this.fx.impact(point, _n, hit.collider, !prop);
      if (prop) {
        const k = power * 0.4;
        prop.body.applyImpulseAtPoint({ x: dir.x * k, y: dir.y * k, z: dir.z * k }, point, true);
        if (prop.barrel && --prop.hp <= 0) this.explode(prop);
      }
      break;
    }
    return end;
  }

  /** Knife attack. `side` is the direction the blade travels (-1 right-to-left, 1 left-to-right). */
  melee(stab: boolean, side: number, damage: number, power: number): 'flesh' | 'world' | null {
    const cam = this.player.camera;
    cam.getWorldDirection(_fwd);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const cut = stab ? _fwd.clone() : _right.clone().multiplyScalar(side).addScaledVector(_fwd, 0.35).normalize();
    const seen = new Set<Part>();
    let world: 'world' | null = null;
    // a slash sweeps a fan of rays; a stab is a single thrust
    for (const a of stab ? [0] : [0, -0.13, 0.13, -0.27, 0.27]) {
      _dir.copy(_fwd).addScaledVector(_right, Math.tan(a)).normalize();
      const hit = this.physics.raycast(cam.position, _dir, stab ? 2.1 : 1.9, CG.qBullet);
      if (!hit) continue;
      const point = new THREE.Vector3().copy(cam.position).addScaledVector(_dir, hit.timeOfImpact);
      const part = this.partOf.get(hit.collider.handle);
      if (part) {
        if (seen.size >= 3 || seen.has(part)) continue;
        seen.add(part);
        const wasAlive = part.doll.alive;
        part.doll.hit(part, point, cut, damage, 'blade', power);
        this.hud.hitMarker(wasAlive && !part.doll.alive);
      } else if (a === 0) {
        _n.set(hit.normal.x, hit.normal.y, hit.normal.z);
        const prop = this.propOf.get(hit.collider.handle);
        this.fx.impact(point, _n, hit.collider, false);
        if (prop) prop.body.applyImpulseAtPoint({ x: _dir.x * power, y: _dir.y * power, z: _dir.z * power }, point, true);
        world = 'world';
      }
    }
    return seen.size ? 'flesh' : world;
  }

  /** Tool gun primary: spawn a goredoll where the player is aiming. Returns the beam end point. */
  toolSpawn(): THREE.Vector3 | null {
    const cam = this.player.camera;
    cam.getWorldDirection(_dir);
    const hit = this.physics.raycast(cam.position, _dir, 45, CG.qBullet);
    if (!hit) return null;
    const end = new THREE.Vector3().copy(cam.position).addScaledVector(_dir, hit.timeOfImpact);
    const p = end.clone();
    if (hit.normal.y < 0.7) {
      // aimed at a wall, prop or another doll: step off the surface and drop to the ground
      p.x += hit.normal.x * 0.5;
      p.z += hit.normal.z * 0.5;
      p.y += 0.3;
      const down = this.physics.raycast(p, DOWN, 8, CG.qSolid);
      if (!down || down.normal.y < 0.7) return null;
      p.y -= down.timeOfImpact;
    }
    if (p.distanceTo(this.player.pos) < 0.9) return null;
    this.spawnDoll(p, Math.atan2(this.player.pos.x - p.x, this.player.pos.z - p.z));
    this.fx.spawnBurst(p);
    return end;
  }

  /** Tool gun secondary: delete the doll being aimed at. */
  toolRemove(): THREE.Vector3 | null {
    const cam = this.player.camera;
    cam.getWorldDirection(_dir);
    const hit = this.physics.raycast(cam.position, _dir, 45, CG.qBullet);
    const part = hit ? this.partOf.get(hit.collider.handle) : undefined;
    if (!hit || !part) return null;
    const end = new THREE.Vector3().copy(cam.position).addScaledVector(_dir, hit.timeOfImpact);
    this.removeDoll(part.doll, true);
    return end;
  }

  private explode(prop: Prop) {
    const i = this.props.indexOf(prop);
    if (i < 0) return;
    const pos = new THREE.Vector3();
    prop.body.translation(pos);
    this.props.splice(i, 1);
    this.propOf.delete(prop.collider.handle);
    prop.mesh.removeFromParent();
    this.discardBody(prop.body, [prop.collider]);
    this.fx.explosion(pos);

    const ground = this.physics.raycast(pos, DOWN, 2.5, CG.qStatic);
    if (ground) {
      _a.copy(pos);
      _a.y -= ground.timeOfImpact;
      this.fx.holes.add(_a, UP, 1.9, 0, { shade: 0.1, alpha: 0.9 });
    }
    for (let k = 0; k < 7; k++) {
      _a.set(rand(-9, 9), rand(3, 10), rand(-9, 9));
      this.gibs.add(pos, _a, [rand(0.1, 0.24), 0.02, rand(0.1, 0.24)], k % 3 ? 0xb3321f : 0xd9d5cb, 0);
    }

    // damage first (it may turn standing dolls into ragdolls), then throw everything outwards
    const blast = (p: THREE.Vector3) => {
      const d = p.distanceTo(pos);
      if (d > BLAST_RADIUS) return 0;
      _dir.subVectors(p, pos);
      _dir.y = Math.abs(_dir.y) * 0.5 + 0.5;
      _dir.normalize();
      return 1 - d / BLAST_RADIUS;
    };
    for (const d of this.dolls) {
      for (const part of d.parts) {
        if (part.gone) continue;
        const p = part.mesh.getWorldPosition(new THREE.Vector3());
        const f = blast(p);
        if (f > 0) d.hit(part, p, _dir.clone(), (190 * f * f + 20 * f) * rand(0.35, 1.15), 'blast', 0);
      }
      for (const part of d.parts) {
        if (part.gone || !part.dynamic) continue;
        const f = blast(part.mesh.getWorldPosition(_a));
        if (f <= 0) continue;
        const k = part.spec.mass * 15 * f;
        part.body.applyImpulse({ x: _dir.x * k, y: _dir.y * k, z: _dir.z * k }, true);
      }
    }
    for (const q of this.props) {
      q.body.translation(_a);
      const f = blast(_a);
      if (f <= 0) continue;
      const k = q.body.mass() * 11 * f;
      q.body.applyImpulse({ x: _dir.x * k, y: _dir.y * k, z: _dir.z * k }, true);
      if (q.barrel && q.hp > 0) {
        q.hp = 0;
        this.fuses.push({ prop: q, t: rand(0.12, 0.35) });
      }
    }
    const shake = 1 - this.player.camera.position.distanceTo(pos) / 14;
    if (shake > 0) this.player.kick(0.07 * shake, rand(-0.04, 0.04) * shake);
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, active: boolean) {
    const input = this.input;
    this.player.update(dt, input, active);
    this.weapons.update(dt, input, this.player, active);
    if (active && input.pressed('KeyX')) this.clearAll();

    for (const d of this.dolls) d.update(dt);
    for (let i = this.fuses.length - 1; i >= 0; i--) {
      const f = this.fuses[i];
      if ((f.t -= dt) <= 0) {
        this.fuses.splice(i, 1);
        this.explode(f.prop);
      }
    }

    for (const b of this.trash) this.physics.world.removeRigidBody(b);
    this.trash.length = 0;
    this.physics.step(dt);

    for (const d of this.dolls) d.sync();
    for (const p of this.props) {
      if (p.body.isSleeping()) continue;
      p.body.translation(p.mesh.position);
      p.body.rotation(p.mesh.quaternion);
    }
    this.gibs.update(dt);
    this.blood.update(dt);
    const cam = this.player.camera;
    this.fx.update(dt, this.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360)));
    this.map.update(dt);
    this.updateSun(dt);
    this.audio.setListener(cam);

    const w = this.weapons;
    this.hud.setAmmo(w.ammoText, w.reloading);
    this.hud.setCrosshair(w.crosshairGap, w.ads, w.current);
    this.hud.setStats(this.dolls.length, this.maxDolls, this.kills);
  }

  private updateSun(dt: number) {
    // Follow the player, snapped to shadow-map texels so shadow edges do not crawl while walking.
    const texel = (SHADOW_RANGE * 2) / SHADOW_SIZE;
    const p = this.player.pos;
    const x = Math.round(p.dot(this.sunRight) / texel) * texel;
    const y = Math.round(p.dot(this.sunUp) / texel) * texel;
    _a.set(0, 0, 0).addScaledVector(this.sunRight, x).addScaledVector(this.sunUp, y).addScaledVector(SUN_DIR, p.dot(SUN_DIR));
    this.sun.target.position.copy(_a);
    this.sun.position.copy(_a).addScaledVector(SUN_DIR, 80);
    this.sun.target.updateMatrixWorld();

    // dim the weapon's sunlight while the player stands in shadow
    if ((this.shadeTimer -= dt) <= 0) {
      this.shadeTimer = 0.15;
      this.shadeTarget = this.physics.raycast(this.player.camera.position, SUN_DIR, 60, CG.qStatic) ? 0.12 : 1;
    }
    this.shade += (this.shadeTarget - this.shade) * Math.min(1, dt * 8);
    this.weapons.setLight(SUN_DIR, this.shade);
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.player.camera);
    r.clearDepth();
    r.render(this.weapons.scene, this.weapons.camera);
  }

  resize() {
    const c = this.renderer.domElement;
    const aspect = c.width / Math.max(1, c.height);
    for (const cam of [this.player.camera, this.weapons.camera]) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
  }

  dispose() {
    for (const scene of [this.scene, this.weapons.scene]) {
      scene.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        if (g) g.dispose();
      });
    }
    this.sun.shadow.map?.dispose();
    this.physics.dispose();
  }
}
