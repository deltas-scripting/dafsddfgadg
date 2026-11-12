import * as THREE from 'three';
import type { Sfx } from '../engine/audio';
import type { Input } from '../engine/input';
import { textures } from '../engine/textures';
import { Spring, clamp, damp, hump, keys, lerp, rand, seg, smooth } from '../engine/util';
import { PISTOL_GRIP_TILT, buildArm, buildWeapon, type WeaponId, type WeaponModel } from '../models/weapons';
import type { Game } from './game';
import type { Player } from './player';

export const WEAPON_ORDER: WeaponId[] = ['tool', 'ak', 'pistol', 'knife'];

interface Stats {
  name: string;
  mag: number;
  /** Seconds between shots. */
  interval: number;
  auto: boolean;
  damage: number;
  /** Impulse delivered to what is hit. */
  power: number;
  /** How many bodies a bullet passes through. */
  pen: number;
  spread: number;
  reload: number;
  kickUp: number;
  kickSide: number;
  adsFov: number;
  recoilZ: number;
  recoilX: number;
}

export const STATS: Record<WeaponId, Stats> = {
  tool: { name: 'ToolGun', mag: 0, interval: 0.24, auto: false, damage: 0, power: 0, pen: 0, spread: 0, reload: 0, kickUp: 0.006, kickSide: 0.002, adsFov: 72, recoilZ: 0.45, recoilX: 1.1 },
  ak: { name: 'AK-47', mag: 30, interval: 0.1, auto: true, damage: 36, power: 62, pen: 2, spread: 0.011, reload: 2.5, kickUp: 0.017, kickSide: 0.009, adsFov: 50, recoilZ: 0.62, recoilX: 0.7 },
  pistol: { name: 'Pistol', mag: 12, interval: 0.14, auto: false, damage: 24, power: 34, pen: 0, spread: 0.007, reload: 1.7, kickUp: 0.026, kickSide: 0.006, adsFov: 58, recoilZ: 0.5, recoilX: 2.3 },
  knife: { name: 'Knife', mag: 0, interval: 0.42, auto: true, damage: 55, power: 26, pen: 0, spread: 0, reload: 0, kickUp: 0, kickSide: 0, adsFov: 72, recoilZ: 0, recoilX: 0 },
};
const STAB_DAMAGE = 95;

interface Slot {
  id: WeaponId;
  stats: Stats;
  model: WeaponModel;
  node: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group | null;
  ammo: number;
  hipP: THREE.Vector3;
  hipR: THREE.Vector3;
  adsP: THREE.Vector3 | null;
  /** Elbow anchors in camera space; the forearms always point back at them. */
  elbowR: THREE.Vector3;
  elbowL: THREE.Vector3;
  /** Left-hand position in weapon space, animated during reloads. */
  handL: THREE.Vector3;
  rest: Record<string, THREE.Vector3>;
  /** Pistol slide locked back on an empty magazine. */
  empty: boolean;
}

const POSES: Record<WeaponId, { p: number[]; r: number[]; ads?: number[]; er: number[]; el: number[] }> = {
  tool: { p: [0.16, -0.15, -0.36], r: [0.03, 0.06, 0], er: [0.3, -0.44, 0.1], el: [-0.3, -0.44, 0.05] },
  ak: { p: [0.15, -0.155, -0.36], r: [0.005, 0.05, -0.05], ads: [0, -0.0865, -0.26], er: [0.3, -0.44, 0.12], el: [-0.3, -0.46, 0.02] },
  pistol: { p: [0.13, -0.135, -0.4], r: [0, 0.04, 0], ads: [0, -0.085, -0.34], er: [0.3, -0.44, 0.1], el: [-0.32, -0.44, 0.1] },
  knife: { p: [0.2, -0.2, -0.36], r: [0.75, 0.32, -0.2], er: [0.34, -0.5, 0.15], el: [-0.3, -0.44, 0.05] },
};

// Knife swings: [time, x, y, z, rx, ry, rz] offsets on top of the idle pose.
const SLASH_A = [
  [0, 0, 0, 0, 0, 0, 0],
  [0.2, 0.1, 0.05, 0.05, 0.25, -0.55, -0.5],
  [0.45, -0.34, -0.05, -0.15, -0.2, 0.95, 0.9],
  [0.62, -0.36, -0.1, -0.08, -0.3, 1.05, 1],
  [1, 0, 0, 0, 0, 0, 0],
];
const SLASH_B = [
  [0, 0, 0, 0, 0, 0, 0],
  [0.2, -0.28, 0.05, -0.04, 0.1, 0.85, 0.7],
  [0.45, 0.1, -0.04, -0.15, -0.15, -0.7, -0.9],
  [0.62, 0.12, -0.09, -0.08, -0.25, -0.8, -1],
  [1, 0, 0, 0, 0, 0, 0],
];
const STAB = [
  [0, 0, 0, 0, 0, 0, 0],
  [0.22, 0.03, 0.03, 0.14, -0.3, -0.1, 0],
  [0.42, -0.15, 0.08, -0.34, -0.75, 0.1, 0.25],
  [0.6, -0.14, 0.07, -0.3, -0.72, 0.1, 0.25],
  [1, 0, 0, 0, 0, 0, 0],
];

const UP = new THREE.Vector3(0, 1, 0);
const MAG_DOWN = new THREE.Vector3(0, -Math.cos(PISTOL_GRIP_TILT), Math.sin(PISTOL_GRIP_TILT));
const _pos = new THREE.Vector3();
const _rot = new THREE.Vector3();
const _h = new THREE.Vector3();
const _elb = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _look = new THREE.Matrix4();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _upv = new THREE.Vector3();
const _muz = new THREE.Vector3();
const _ej = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _k: number[] = [];

function aimArm(arm: THREE.Object3D, hand: THREE.Vector3, elbow: THREE.Vector3) {
  arm.position.copy(hand);
  // lookAt(eye, target): +z ends up pointing from target to eye, i.e. from the hand to the elbow
  _look.lookAt(elbow, hand, UP);
  arm.quaternion.setFromRotationMatrix(_look);
}

/**
 * First-person weapons. The view model lives in its own scene that is drawn after the world with
 * a cleared depth buffer, so guns never clip into walls and keep a fixed field of view.
 */
export class Weapons {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.01, 30);
  current: WeaponId = 'tool';
  /** 0..1 aim-down-sights. */
  ads = 0;
  private slots = {} as Record<WeaponId, Slot>;
  private root = new THREE.Group();
  private holder = new THREE.Group();
  private sun = new THREE.DirectionalLight(0xfff3dd, 2.2);
  private flash = new THREE.Group();
  private flashLight = new THREE.PointLight(0xffb060, 0, 2.5, 2);
  private flashT = 0;
  private pending: WeaponId | null = null;
  private raise = 0;
  private cooldown = 0;
  private reloadT = -1;
  private fireAge = 10;
  private heat = 0;
  private time = 0;
  private sprint = 0;
  private lean = 0;
  private swing = -1;
  private swingKind = 0;
  private nextSlash = 0;
  private meleeDue = false;
  private knifeBlood = 0;
  private drumSpin = 0.6;
  private toolPulse = 0;
  private rz = new Spring(260, 22);
  private rx = new Spring(230, 20);
  private ry = new Spring(200, 18);
  private rr = new Spring(200, 18);
  private swX = new Spring(110, 14);
  private swY = new Spring(110, 14);
  private ex = new THREE.Vector3();
  private er = new THREE.Vector3();

  constructor(private game: Game) {
    this.scene.add(new THREE.HemisphereLight(0xdfeeff, 0x8a8478, 1.5));
    this.scene.add(this.sun, this.sun.target, this.root);
    this.root.add(this.holder);

    for (const id of WEAPON_ORDER) {
      const model = buildWeapon(id);
      const node = new THREE.Group();
      node.add(model.root);
      const armR = buildArm(1);
      node.add(armR);
      let armL: THREE.Group | null = null;
      if (model.gripL) {
        armL = buildArm(-1);
        node.add(armL);
      }
      node.visible = false;
      this.holder.add(node);
      const pose = POSES[id];
      const rest: Record<string, THREE.Vector3> = {};
      for (const [name, part] of Object.entries(model.parts)) rest[name] = part.position.clone();
      this.slots[id] = {
        id,
        stats: STATS[id],
        model,
        node,
        armR,
        armL,
        ammo: STATS[id].mag,
        hipP: new THREE.Vector3().fromArray(pose.p),
        hipR: new THREE.Vector3().fromArray(pose.r),
        adsP: pose.ads ? new THREE.Vector3().fromArray(pose.ads) : null,
        elbowR: new THREE.Vector3().fromArray(pose.er),
        elbowL: new THREE.Vector3().fromArray(pose.el),
        handL: new THREE.Vector3(),
        rest,
        empty: false,
      };
    }

    const mat = new THREE.MeshBasicMaterial({
      map: textures().muzzle,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const plane = new THREE.PlaneGeometry(1, 1);
    const front = new THREE.Mesh(plane, mat);
    const side = new THREE.Mesh(plane, mat);
    side.rotation.y = Math.PI / 2;
    const top = new THREE.Mesh(plane, mat);
    top.rotation.x = Math.PI / 2;
    side.position.z = top.position.z = -0.3;
    this.flash.add(front, side, top, this.flashLight);
    this.flash.visible = false;

    this.equip('tool', true);
  }

  get slot() {
    return this.slots[this.current];
  }

  /** Text for the HUD ammo counter. */
  get ammoText() {
    const s = this.slot;
    return s.stats.mag > 0 ? `${s.ammo}` : '';
  }

  get reloading() {
    return this.reloadT >= 0;
  }

  /** Crosshair gap in pixels (grows with movement and sustained fire). */
  get crosshairGap() {
    const p = this.game.player;
    return 6 + this.heat * 16 + clamp(p.speed / 5, 0, 1.4) * 7 + (p.grounded ? 0 : 10);
  }

  select(id: WeaponId) {
    if (id === this.current && !this.pending) return;
    this.pending = id === this.current ? null : id;
  }

  private equip(id: WeaponId, silent = false) {
    this.slots[this.current].node.visible = false;
    this.current = id;
    const s = this.slots[id];
    s.node.visible = true;
    s.model.muzzle.add(this.flash);
    this.raise = 0;
    this.reloadT = -1;
    this.swing = -1;
    this.meleeDue = false;
    this.fireAge = 10;
    this.cooldown = 0.25;
    for (const sp of [this.rz, this.rx, this.ry, this.rr]) sp.reset();
    if (id === 'tool') this.drawScreen();
    if (!silent) this.game.audio.play('equip');
    this.game.hud.setWeapon(WEAPON_ORDER.indexOf(id), s.stats.name);
  }

  /** Redraws the little display on the back of the tool gun. */
  drawScreen() {
    const sc = this.slots.tool.model.screen;
    if (!sc) return;
    const x = sc.ctx;
    x.fillStyle = '#03161d';
    x.fillRect(0, 0, 128, 80);
    x.strokeStyle = '#2b9fbd';
    x.lineWidth = 3;
    x.strokeRect(2, 2, 124, 76);
    x.textAlign = 'center';
    x.fillStyle = '#5fe3ff';
    x.font = 'bold 13px monospace';
    x.fillText('TOOL: SPAWN', 64, 20);
    x.fillStyle = '#ffffff';
    x.font = 'bold 20px monospace';
    x.fillText('GOREDOLL', 64, 46);
    x.fillStyle = '#5fe3ff';
    x.font = 'bold 12px monospace';
    x.fillText(`${this.game.dolls.length} / ${this.game.maxDolls}`, 64, 68);
    sc.tex.needsUpdate = true;
  }

  /** Matches the view model's sun light to the world (direction and whether the player is in shade). */
  setLight(sunDir: THREE.Vector3, shade: number) {
    this.sun.target.position.copy(this.camera.position);
    this.sun.position.copy(this.camera.position).addScaledVector(sunDir, 10);
    this.sun.intensity = 0.5 + 1.9 * shade;
  }

  /**
   * World-space position of a view-model object. The view model uses its own field of view, so the
   * point is re-projected to where it appears on screen through the world camera.
   */
  private worldPoint(obj: THREE.Object3D, out: THREE.Vector3) {
    const cam = this.game.player.camera;
    obj.getWorldPosition(out);
    cam.worldToLocal(out);
    const k = Math.tan((cam.fov * Math.PI) / 360) / Math.tan((this.camera.fov * Math.PI) / 360);
    out.x *= k;
    out.y *= k;
    return cam.localToWorld(out);
  }

  update(dt: number, input: Input, player: Player, active: boolean) {
    const g = this.game;
    this.time += dt;
    this.cooldown -= dt;
    this.fireAge += dt;
    this.heat = Math.max(0, this.heat - dt * 1.4);

    if (active) {
      for (let i = 0; i < 4; i++) if (input.pressed(`Digit${i + 1}`)) this.select(WEAPON_ORDER[i]);
      if (input.wheel) {
        const i = WEAPON_ORDER.indexOf(this.pending ?? this.current);
        this.select(WEAPON_ORDER[(i + Math.sign(input.wheel) + 4) % 4]);
      }
    }
    if (this.pending && this.swing < 0) {
      this.reloadT = -1;
      this.raise -= dt / 0.15;
      if (this.raise <= 0) {
        this.equip(this.pending);
        this.pending = null;
      }
    } else if (this.raise < 1) {
      this.raise = Math.min(1, this.raise + dt / 0.34);
    }
    const s = this.slot;
    const st = s.stats;
    const gun = s.id === 'ak' || s.id === 'pistol';
    const ready = active && this.raise >= 1 && !this.pending;

    const wantAds = ready && gun && input.button(2) && this.reloadT < 0 && !player.sprinting;
    this.ads = damp(this.ads, wantAds ? 1 : 0, 16, dt);
    player.aim = this.ads;
    player.fovTarget = lerp(player.sprinting ? 78 : 72, st.adsFov, this.ads);

    if (this.reloadT >= 0) {
      const prev = this.reloadT;
      this.reloadT += dt / st.reload;
      this.reloadCues(s, prev, this.reloadT);
      if (this.reloadT >= 1) {
        this.reloadT = -1;
        s.ammo = st.mag;
        s.empty = false;
      }
    }
    if (this.swing >= 0) {
      const prev = this.swing;
      const stab = this.swingKind === 2;
      this.swing += dt / (stab ? 0.62 : 0.4);
      const at = stab ? 0.4 : 0.34;
      if (prev < at && this.swing >= at) this.meleeDue = true;
      if (this.swing >= 1) this.swing = -1;
    }

    this.pose(dt, s, input, player);

    const cam = player.camera;
    this.root.position.copy(cam.position);
    this.root.quaternion.copy(cam.quaternion);
    this.camera.position.copy(cam.position);
    this.camera.quaternion.copy(cam.quaternion);
    this.root.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();

    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.flash.visible = false;
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 120);

    if (ready) {
      if (gun) {
        const trigger = st.auto ? input.button(0) : input.clicked(0);
        if (trigger && this.cooldown <= 0 && this.reloadT < 0) {
          if (s.ammo > 0) {
            this.fire(s, player);
          } else if (input.clicked(0)) {
            g.audio.play('dry');
            this.reloadT = 0;
          }
        }
        if (input.pressed('KeyR') && this.reloadT < 0 && s.ammo < st.mag) this.reloadT = 0;
      } else if (s.id === 'knife') {
        if (this.swing < 0 && this.cooldown <= 0) {
          if (input.button(0)) {
            this.swing = 0;
            this.swingKind = this.nextSlash;
            this.nextSlash = 1 - this.nextSlash;
            this.cooldown = st.interval;
            g.audio.play('swing', { rate: rand(0.9, 1.15) });
          } else if (input.clicked(2)) {
            this.swing = 0;
            this.swingKind = 2;
            this.cooldown = 0.7;
            g.audio.play('swing', { rate: 0.75 });
          }
        }
      } else if (this.cooldown <= 0) {
        if (input.clicked(0)) this.useTool(s, true);
        else if (input.clicked(2)) this.useTool(s, false);
      }
    }
    if (this.meleeDue) {
      this.meleeDue = false;
      this.strike(player);
    }
  }

  private reloadCues(s: Slot, prev: number, cur: number) {
    const cue = (at: number, name: Sfx) => {
      if (prev < at && cur >= at) this.game.audio.play(name);
    };
    if (s.id === 'ak') {
      cue(0.24, 'magOut');
      cue(0.52, 'magIn');
      cue(0.7, 'boltBack');
      cue(0.765, 'boltFwd');
    } else {
      cue(0.14, 'magOut');
      cue(0.55, 'magIn');
      if (s.empty) cue(0.715, 'boltFwd');
    }
  }

  private fire(s: Slot, player: Player) {
    const g = this.game;
    const st = s.stats;
    const cam = player.camera;
    s.ammo--;
    this.cooldown = st.interval;
    this.fireAge = 0;
    if (s.ammo === 0 && s.id === 'pistol') s.empty = true;

    const spread =
      st.spread *
      (1 + this.heat * 2.2) *
      lerp(1, 0.2, this.ads) *
      (1 + clamp(player.speed / 5, 0, 1.2)) *
      (player.grounded ? 1 : 2.2);
    cam.getWorldDirection(_dir);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _upv.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const a = Math.random() * 6.283;
    const r = Math.sqrt(Math.random()) * spread;
    _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_upv, Math.sin(a) * r).normalize();
    const end = g.fireBullet(cam.position, _dir, st.damage, st.power, st.pen);
    this.heat = Math.min(1, this.heat + (st.auto ? 0.1 : 0.16));

    const k = lerp(1, 0.55, this.ads);
    this.rz.kick(st.recoilZ * k);
    this.rx.kick(st.recoilX * k);
    this.ry.kick(rand(-0.6, 0.6) * k);
    this.rr.kick(rand(-0.8, 0.8) * k);
    player.kick(st.kickUp * (1 + this.heat * 0.6), rand(-1, 1) * st.kickSide);

    this.flashT = 0.05;
    this.flash.visible = true;
    this.flash.scale.setScalar(s.id === 'ak' ? rand(0.2, 0.3) : rand(0.13, 0.19));
    this.flash.rotation.z = rand(6.283);
    this.flashLight.intensity = 6;

    this.worldPoint(s.model.muzzle, _muz);
    g.fx.flash(_muz, 24);
    g.fx.tracer(_muz, end);
    if (s.model.eject) {
      this.worldPoint(s.model.eject, _ej);
      _vel
        .copy(player.vel)
        .addScaledVector(_right, rand(1.8, 2.8))
        .addScaledVector(_upv, rand(1.4, 2.4))
        .addScaledVector(_dir, rand(-0.6, 0.4));
      g.fx.shell(_ej, _vel, player.pos.y);
    }
    g.audio.play(s.id === 'ak' ? 'ak' : 'pistol', { rate: rand(0.96, 1.04) });
  }

  private useTool(s: Slot, spawn: boolean) {
    const g = this.game;
    this.cooldown = s.stats.interval;
    const end = spawn ? g.toolSpawn() : g.toolRemove();
    if (end) {
      this.worldPoint(s.model.muzzle, _muz);
      g.fx.toolBeam(_muz, end);
    }
    this.rz.kick(s.stats.recoilZ);
    this.rx.kick(s.stats.recoilX);
    this.drumSpin = 24;
    this.toolPulse = 1;
    g.audio.play(end ? (spawn ? 'tool' : 'remove') : 'deny');
    this.drawScreen();
  }

  private strike(player: Player) {
    const g = this.game;
    const stab = this.swingKind === 2;
    const hit = g.melee(stab, this.swingKind === 0 ? -1 : 1, stab ? STAB_DAMAGE : STATS.knife.damage, STATS.knife.power);
    if (hit === 'flesh') {
      this.knifeBlood = Math.min(1, this.knifeBlood + (stab ? 0.5 : 0.3));
      g.audio.play('knifeHit');
      player.kick(0.004, 0);
      g.hud.bloodSplash(stab ? 3 : 2);
    } else if (hit === 'world') {
      g.audio.play('impact', { rate: 1.4 });
    }
  }

  // ---------------------------------------------------------------- animation

  private pose(dt: number, s: Slot, input: Input, player: Player) {
    const a = this.ads;
    const gun = s.id === 'ak' || s.id === 'pistol';
    const P = _pos.copy(s.hipP);
    const R = _rot.copy(s.hipR);
    if (s.adsP) {
      P.lerp(s.adsP, a);
      R.multiplyScalar(1 - a);
    }
    // draw / holster
    const low = 1 - smooth(this.raise);
    P.y -= 0.32 * low;
    R.x -= 0.9 * low;
    R.z += 0.25 * low;
    // sprinting lowers the weapon across the body
    this.sprint = damp(this.sprint, player.sprinting ? 1 : 0, 10, dt);
    const sp = this.sprint;
    if (gun) {
      P.x -= 0.05 * sp;
      P.y -= 0.05 * sp;
      R.x -= 0.35 * sp;
      R.y += 0.55 * sp;
      R.z += 0.2 * sp;
    } else {
      P.y -= 0.03 * sp;
      R.x -= 0.2 * sp;
    }
    // walk bob and idle breathing
    const k = clamp(player.speed / 4.6, 0, 1.7) * (player.grounded ? 1 : 0.25) * (1 - 0.85 * a);
    P.x += Math.sin(player.stride) * 0.011 * k;
    P.y += Math.sin(player.stride * 2) * 0.006 * k - 0.004 * k;
    R.z += Math.sin(player.stride) * 0.012 * k;
    const idle = 1 - 0.8 * a;
    P.y += Math.sin(this.time * 1.5) * 0.0022 * idle;
    R.x += Math.sin(this.time * 1.5 + 1) * 0.004 * idle;
    R.z += Math.sin(this.time * 0.9) * 0.003 * idle;
    // the weapon lags behind view rotation
    this.swX.v += clamp(input.dx, -80, 80) * 0.0032;
    this.swY.v += clamp(input.dy, -80, 80) * 0.0032;
    const sx = clamp(this.swX.update(dt), -0.12, 0.12) * (1 - 0.7 * a);
    const sy = clamp(this.swY.update(dt), -0.12, 0.12) * (1 - 0.7 * a);
    R.y += sx;
    R.x += sy;
    P.x -= sx * 0.05;
    P.y += sy * 0.04;
    this.lean = damp(this.lean, player.strafe, 8, dt);
    R.z -= this.lean * 0.035 * (1 - a);
    P.y += player.dip.x * 0.06 - (player.grounded ? 0 : clamp(player.vel.y, -6, 6) * 0.004);
    // recoil
    P.z += this.rz.update(dt);
    R.x += this.rx.update(dt);
    R.y += this.ry.update(dt) * 0.5;
    R.z += this.rr.update(dt) * 0.5;

    this.ex.set(0, 0, 0);
    this.er.set(0, 0, 0);
    if (s.id === 'ak') this.animAK(s);
    else if (s.id === 'pistol') this.animPistol(s);
    else if (s.id === 'knife') this.animKnife(s, dt);
    else this.animTool(s, dt);
    P.add(this.ex);
    R.add(this.er);

    const h = this.holder;
    h.position.copy(P);
    h.rotation.set(R.x, R.y, R.z);
    h.updateMatrix();
    _mat.copy(h.matrix).invert();
    aimArm(s.armR, s.model.gripR, _elb.copy(s.elbowR).applyMatrix4(_mat));
    if (s.armL) aimArm(s.armL, s.handL, _elb.copy(s.elbowL).applyMatrix4(_mat));
  }

  private animAK(s: Slot) {
    const { bolt, mag } = s.model.parts;
    let boltZ = Math.max(0, 1 - this.fireAge / 0.075) * 0.062;
    if (s.model.gripL) s.handL.copy(s.model.gripL);
    mag.position.copy(s.rest.mag);
    mag.rotation.set(0, 0, 0);
    const t = this.reloadT;
    if (t >= 0) {
      // tilt for the magazine change, then roll the other way to rack the charging handle
      const tiltA = hump(t, 0, 0.12, 0.54, 0.66);
      const tiltB = hump(t, 0.56, 0.66, 0.8, 0.95);
      this.er.set(0.34 * tiltA + 0.12 * tiltB, -0.3 * tiltA - 0.1 * tiltB, -0.55 * tiltA + 0.5 * tiltB);
      this.ex.set(-0.06 * tiltA - 0.02 * tiltB, 0.07 * tiltA + 0.03 * tiltB, 0.02 * tiltA);
      const drop = seg(t, 0.22, 0.32) - seg(t, 0.42, 0.53);
      mag.position.y -= 0.3 * drop;
      mag.position.z -= 0.05 * drop;
      mag.rotation.x = 0.5 * drop;
      this.ex.y -= 0.014 * hump(t, 0.51, 0.535, 0.545, 0.6);
      boltZ += 0.07 * hump(t, 0.67, 0.74, 0.755, 0.78);
      this.ex.z += 0.012 * hump(t, 0.755, 0.775, 0.78, 0.84);
      // left hand: handguard -> magazine -> charging handle -> handguard
      const wMag = seg(t, 0.08, 0.2) * (1 - seg(t, 0.55, 0.64));
      const wBolt = seg(t, 0.57, 0.67) * (1 - seg(t, 0.8, 0.93));
      _h.copy(mag.position);
      _h.y -= 0.13;
      _h.z -= 0.035;
      s.handL.lerp(_h, wMag);
      s.handL.lerp(_h.set(0.05, 0.085, -0.085 + boltZ), wBolt);
    }
    bolt.position.z = boltZ;
  }

  private animPistol(s: Slot) {
    const { slide, mag } = s.model.parts;
    const a = this.fireAge;
    let slideZ = a < 0.03 ? a / 0.03 : Math.max(0, 1 - (a - 0.03) / 0.075);
    let lock = s.empty ? 0.85 : 0;
    if (s.model.gripL) s.handL.copy(s.model.gripL);
    mag.position.copy(s.rest.mag);
    const t = this.reloadT;
    if (t >= 0) {
      const tilt = hump(t, 0, 0.13, 0.62, 0.82);
      this.er.set(0.32 * tilt, 0.15 * tilt, -0.55 * tilt);
      this.ex.set(-0.04 * tilt, 0.05 * tilt, 0.04 * tilt);
      const drop = seg(t, 0.12, 0.22) - seg(t, 0.4, 0.56);
      mag.position.addScaledVector(MAG_DOWN, 0.26 * drop);
      this.ex.y += 0.016 * hump(t, 0.54, 0.57, 0.58, 0.66);
      lock *= 1 - seg(t, 0.7, 0.73);
      const away = seg(t, 0.04, 0.15) * (1 - seg(t, 0.6, 0.74));
      _h.copy(mag.position).addScaledVector(MAG_DOWN, 0.05);
      s.handL.lerp(_h, away);
    }
    slideZ = Math.max(slideZ, lock);
    slide.position.z = slideZ * 0.042;
  }

  private animKnife(s: Slot, dt: number) {
    if (this.swing >= 0) {
      keys(this.swing, this.swingKind === 2 ? STAB : this.swingKind === 0 ? SLASH_A : SLASH_B, _k);
      this.ex.set(_k[0], _k[1], _k[2]);
      this.er.set(_k[3], _k[4], _k[5]);
    }
    this.knifeBlood = Math.max(0, this.knifeBlood - dt * 0.012);
    const coat = s.model.parts.blood.children[0] as THREE.Mesh;
    (coat.material as THREE.MeshStandardMaterial).opacity = this.knifeBlood * 0.92;
    coat.visible = this.knifeBlood > 0.01;
  }

  private animTool(s: Slot, dt: number) {
    const { drum, core } = s.model.parts;
    this.drumSpin = damp(this.drumSpin, 0.6, 3, dt);
    drum.rotation.z += this.drumSpin * dt;
    this.toolPulse = Math.max(0, this.toolPulse - dt * 4);
    core.scale.setScalar(1 + this.toolPulse * 1.6 + Math.sin(this.time * 6) * 0.08);
  }
}
