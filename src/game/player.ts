import * as THREE from 'three';
import type { Input } from '../engine/input';
import { mats } from '../engine/materials';
import { CG, RAPIER } from '../engine/physics';
import { Spring, clamp, damp, lerp, rand } from '../engine/util';
import { Humanoid, PLAYER_LOOK } from '../models/humanoid';
import type { Game } from './game';

const HALF = 0.55;
const RADIUS = 0.3;
const EYE = 1.64;
const EYE_CROUCH = 1.05;
const WALK = 4.6;
const SPRINT = 7.4;
const CROUCH = 2.2;
const GRAVITY = 18;
const JUMP = 5.6;
/** Gap the character controller keeps above the ground. */
const SKIN = 0.02;

const _move = new THREE.Vector3();
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

/** First-person character: kinematic capsule driven by Rapier's character controller. */
export class Player {
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.05, 900);
  /** Feet position. */
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = true;
  sprinting = false;
  crouch = 0;
  /** Horizontal speed actually achieved this frame. */
  speed = 0;
  /** Walk-cycle phase, advances with distance. */
  stride = 0;
  strafe = 0;
  /** 0..1 aim-down-sights amount, set by the weapon system. */
  aim = 0;
  fovTarget = 72;
  sensitivity = 0.0022;
  readonly dip = new Spring(170, 19);
  private kickP = new Spring(120, 15);
  private kickY = new Spring(120, 15);
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private ctrl: RAPIER.KinematicCharacterController;
  private model: Humanoid;
  private stepSide = 1;
  private bloodySteps = 0;
  private spawn = new THREE.Vector3();
  private spawnYaw = 0;

  constructor(
    private game: Game,
    spawn: THREE.Vector3,
    yaw: number,
  ) {
    const world = game.physics.world;
    this.spawn.copy(spawn);
    this.spawnYaw = yaw;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(HALF, RADIUS).setCollisionGroups(CG.player).setFriction(0),
      this.body,
    );
    const c = world.createCharacterController(SKIN);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.enableAutostep(0.42, 0.2, false);
    c.enableSnapToGround(0.35);
    c.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((42 * Math.PI) / 180);
    c.setApplyImpulsesToDynamicBodies(true);
    c.setCharacterMass(85);
    this.ctrl = c;

    // Visible body: torso and legs when looking down; head and arms only cast shadows
    // (the first-person arms belong to the weapon view).
    const m = new Humanoid(PLAYER_LOOK, true);
    const hidden = mats().shadowOnly;
    for (const name of ['head', 'upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR'] as const) {
      m.meshes[name].material = hidden;
      m.meshes[name].receiveShadow = false;
    }
    m.pivots.upperArmL.rotation.set(-1.15, 0, -0.3);
    m.pivots.upperArmR.rotation.set(-1.15, 0, 0.1);
    m.pivots.lowerArmL.rotation.x = -0.5;
    m.pivots.lowerArmR.rotation.x = -0.5;
    game.scene.add(m.root);
    this.model = m;
    this.teleport(spawn, yaw);
  }

  teleport(p: THREE.Vector3, yaw: number) {
    this.pos.copy(p);
    this.pos.y += SKIN;
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.body.setTranslation({ x: this.pos.x, y: this.pos.y + HALF + RADIUS, z: this.pos.z }, true);
  }

  /** Recoil: a springy view kick plus a small lasting climb. */
  kick(up: number, side: number) {
    this.kickP.kick(up * 11);
    this.kickY.kick(side * 11);
    this.pitch = Math.min(1.5, this.pitch + up * 0.3);
  }

  update(dt: number, input: Input, active: boolean) {
    const g = this.game;
    if (active) {
      const k = this.sensitivity * (this.camera.fov / 72);
      this.yaw -= input.dx * k;
      this.pitch = clamp(this.pitch - input.dy * k, -1.5, 1.5);
    }
    let ix = 0;
    let iz = 0;
    if (active) {
      if (input.key('KeyW') || input.key('ArrowUp')) iz -= 1;
      if (input.key('KeyS') || input.key('ArrowDown')) iz += 1;
      if (input.key('KeyA') || input.key('ArrowLeft')) ix -= 1;
      if (input.key('KeyD') || input.key('ArrowRight')) ix += 1;
    }
    const len = Math.hypot(ix, iz);
    if (len > 0) {
      ix /= len;
      iz /= len;
    }
    this.strafe = ix;
    const wantCrouch = active && input.key('KeyC');
    this.crouch = damp(this.crouch, wantCrouch ? 1 : 0, 12, dt);
    this.sprinting =
      active && (input.key('ShiftLeft') || input.key('ShiftRight')) && iz < 0 && this.grounded && !wantCrouch && this.aim < 0.3;
    const max = wantCrouch ? CROUCH : this.sprinting ? SPRINT : lerp(WALK, 2.8, this.aim);

    // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wx = (cos * ix + sin * iz) * max;
    const wz = (-sin * ix + cos * iz) * max;
    const step = (this.grounded ? 60 : 14) * dt;
    const dvx = wx - this.vel.x;
    const dvz = wz - this.vel.z;
    const dl = Math.hypot(dvx, dvz);
    if (dl <= step) {
      this.vel.x = wx;
      this.vel.z = wz;
    } else {
      this.vel.x += (dvx / dl) * step;
      this.vel.z += (dvz / dl) * step;
    }

    if (this.grounded) {
      // a little downward speed keeps the controller reporting ground contact
      this.vel.y = -2;
      if (active && input.pressed('Space')) {
        this.vel.y = JUMP;
        this.grounded = false;
      }
    } else {
      this.vel.y -= GRAVITY * dt;
    }

    _move.copy(this.vel).multiplyScalar(dt);
    this.ctrl.computeColliderMovement(this.collider, _move, undefined, CG.qMove);
    const m = this.ctrl.computedMovement();
    const wasGrounded = this.grounded;
    const fall = this.vel.y;
    this.grounded = this.ctrl.computedGrounded() && this.vel.y <= 0;
    this.pos.x += m.x;
    this.pos.y += m.y;
    this.pos.z += m.z;
    if (this.vel.y > 0 && m.y < _move.y * 0.5) this.vel.y = 0;
    this.speed = Math.hypot(m.x, m.z) / Math.max(dt, 1e-4);
    if (this.grounded && !wasGrounded && fall < -4) {
      this.dip.kick(clamp(fall * 0.1, -1.4, 0));
      g.audio.play('land', { vol: clamp(-fall / 12, 0.3, 1) });
    }
    if (this.pos.y < -30) this.teleport(this.spawn, this.spawnYaw);
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + HALF + RADIUS, z: this.pos.z });

    if (this.grounded && this.speed > 0.6) {
      const prev = this.stride;
      this.stride += this.speed * dt * 3.6;
      if (Math.floor(this.stride / Math.PI) !== Math.floor(prev / Math.PI)) this.footstep(sin, cos);
    }

    // camera
    const bob = clamp(this.speed / WALK, 0, 1.6) * (this.grounded ? 1 : 0) * (1 - this.aim * 0.7);
    const eye = lerp(EYE, EYE_CROUCH, this.crouch) + this.dip.update(dt) * 0.22 + Math.sin(this.stride * 2) * 0.014 * bob;
    const cam = this.camera;
    cam.position.set(this.pos.x, this.pos.y + eye, this.pos.z);
    cam.rotation.set(
      clamp(this.pitch + this.kickP.update(dt), -1.55, 1.55),
      this.yaw + this.kickY.update(dt),
      -ix * 0.012 * bob + Math.sin(this.stride) * 0.003 * bob,
      'YXZ',
    );
    if (Math.abs(cam.fov - this.fovTarget) > 0.01) {
      cam.fov = damp(cam.fov, this.fovTarget, 14, dt);
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();

    this.poseBody(sin, cos);
  }

  private footstep(sin: number, cos: number) {
    const g = this.game;
    g.audio.play('step', { vol: this.sprinting ? 1 : 0.7, rate: rand(0.85, 1.15) });
    this.stepSide = -this.stepSide;
    if (g.blood.inPool(this.pos)) {
      this.bloodySteps = 10;
    } else if (this.bloodySteps > 0) {
      // right = (cos, -sin), forward = (-sin, -cos)
      _v.set(this.pos.x + cos * 0.11 * this.stepSide, this.pos.y - SKIN, this.pos.z - sin * 0.11 * this.stepSide);
      g.blood.footprint(_v, _f.set(-sin, 0, -cos), (this.bloodySteps / 10) * 0.85);
      this.bloodySteps--;
    }
  }

  private poseBody(sin: number, cos: number) {
    const m = this.model;
    const p = m.pivots;
    const c = this.crouch;
    // sit the body slightly behind the eyes so looking down shows chest, legs and feet
    m.root.position.set(this.pos.x + sin * 0.2, this.pos.y - SKIN - c * 0.43, this.pos.z + cos * 0.2);
    m.root.rotation.y = this.yaw + Math.PI;
    const k = clamp(this.speed / WALK, 0, 1.4) * (this.grounded ? 1 : 0.3);
    const s = Math.sin(this.stride);
    const s2 = Math.sin(this.stride + 1.2);
    p.upperLegL.rotation.x = -s * 0.55 * k - c * 1.2;
    p.upperLegR.rotation.x = s * 0.55 * k - c * 1.2;
    p.lowerLegL.rotation.x = Math.max(0, s2) * 0.9 * k + c * 2;
    p.lowerLegR.rotation.x = Math.max(0, -s2) * 0.9 * k + c * 2;
    p.chest.rotation.x = c * 0.3;
  }
}
