import * as THREE from 'three';
import type { AudioEngine } from '../engine/audio';
import { environment, mats } from '../engine/materials';
import type { RAPIER } from '../engine/physics';
import { rand } from '../engine/util';
import { DecalLayer, fitToCollider } from './blood';
import { Particles } from './particles';

const Z = new THREE.Vector3(0, 0, 1);
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);

interface Streak {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  dir: THREE.Vector3;
  dist: number;
  t: number;
  len: number;
}
interface Shell {
  p: THREE.Vector3;
  v: THREE.Vector3;
  e: THREE.Euler;
  w: THREE.Vector3;
  life: number;
  ground: number;
  rang: boolean;
}

const TRACER_SPEED = 240;
const MAX_SHELLS = 48;

/** Short-lived visual effects: impacts, tracers, casings, flashes, the tool gun beam. */
export class Effects {
  readonly puffs: Particles;
  readonly sparks: Particles;
  readonly holes: DecalLayer;
  private streaks: Streak[] = [];
  private shells: Shell[] = [];
  private shellMesh: THREE.InstancedMesh;
  private light: THREE.PointLight;
  private beam: THREE.Mesh;
  private beamLife = 0;

  constructor(
    scene: THREE.Scene,
    private audio: AudioEngine,
  ) {
    this.holes = new DecalLayer(scene, mats().holes, 400, 2, 2);
    this.puffs = new Particles(scene, 500, false);
    this.sparks = new Particles(scene, 500, true);

    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffe2a0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(box, tracerMat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.streaks.push({ mesh, from: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, t: 0, len: 1 });
    }

    this.beam = new THREE.Mesh(
      box,
      new THREE.MeshBasicMaterial({
        color: 0x62e4ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    scene.add(this.beam);

    this.shellMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.024, 6),
      new THREE.MeshStandardMaterial({ color: 0xc9a13f, metalness: 0.9, roughness: 0.3, envMap: environment() }),
      MAX_SHELLS,
    );
    this.shellMesh.count = 0;
    this.shellMesh.frustumCulled = false;
    this.shellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.shellMesh);

    this.light = new THREE.PointLight(0xffc27a, 0, 18, 2);
    scene.add(this.light);
  }

  /** Bullet or blade striking the world. */
  impact(point: THREE.Vector3, normal: THREE.Vector3, col: RAPIER.Collider | null, decal: boolean) {
    if (decal && col) {
      _p.copy(point);
      const r = fitToCollider(col, _p, normal, rand(0.045, 0.07));
      if (r > 0.02) this.holes.add(_p, normal, r, (Math.random() * 4) | 0);
    }
    const g = 0.5 + Math.random() * 0.12;
    for (let i = 0; i < 5; i++) {
      this.puffs.emit(
        point.x + normal.x * 0.03,
        point.y + normal.y * 0.03,
        point.z + normal.z * 0.03,
        normal.x * rand(0.4, 1.8) + rand(-0.4, 0.4),
        normal.y * rand(0.4, 1.8) + rand(-0.2, 0.5),
        normal.z * rand(0.4, 1.8) + rand(-0.4, 0.4),
        rand(0.35, 0.85),
        0.05,
        rand(0.3, 0.6),
        g,
        g,
        g * 0.95,
        0.45,
        -0.2,
        2.5,
      );
    }
    for (let i = 0; i < 5; i++) {
      this.sparks.emit(
        point.x,
        point.y,
        point.z,
        normal.x * rand(1, 5) + rand(-2, 2),
        normal.y * rand(1, 5) + rand(-1, 3),
        normal.z * rand(1, 5) + rand(-2, 2),
        rand(0.1, 0.3),
        0.04,
        0.008,
        1,
        0.72,
        0.3,
        1,
        9,
        0.5,
      );
    }
    this.audio.play('impact', { pos: point, gap: 0.02, rate: rand(0.8, 1.3) });
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3) {
    const dist = from.distanceTo(to);
    if (dist < 2) return;
    const s = this.streaks.find((k) => !k.mesh.visible) ?? this.streaks[0];
    s.from.copy(from);
    s.dir.subVectors(to, from).divideScalar(dist);
    s.dist = dist;
    s.len = Math.min(7, dist * 0.4);
    s.t = 0.8;
    s.mesh.quaternion.setFromUnitVectors(Z, s.dir);
    s.mesh.scale.set(0.014, 0.014, s.len);
    s.mesh.position.copy(from).addScaledVector(s.dir, s.t);
    s.mesh.visible = true;
  }

  /** Tool gun energy beam between two points. */
  toolBeam(from: THREE.Vector3, to: THREE.Vector3) {
    const dist = from.distanceTo(to);
    if (dist < 0.05) return;
    _p.subVectors(to, from).divideScalar(dist);
    this.beam.position.copy(from).addScaledVector(_p, dist / 2);
    this.beam.quaternion.setFromUnitVectors(Z, _p);
    this.beam.scale.set(0.03, 0.03, dist);
    this.beam.visible = true;
    this.beamLife = 0.16;
  }

  shell(pos: THREE.Vector3, vel: THREE.Vector3, ground: number) {
    if (this.shells.length >= MAX_SHELLS) this.shells.shift();
    this.shells.push({
      p: pos.clone(),
      v: vel.clone(),
      e: new THREE.Euler(rand(6), rand(6), rand(6)),
      w: new THREE.Vector3(rand(-20, 20), rand(-20, 20), rand(-20, 20)),
      life: 5,
      ground,
      rang: false,
    });
  }

  /** Brief point light (muzzle flash, explosions, tool gun). */
  flash(pos: THREE.Vector3, intensity: number, color = 0xffc27a) {
    this.light.position.copy(pos);
    this.light.color.setHex(color);
    this.light.intensity = intensity;
  }

  /** Column of rising sparks where the tool gun materialises something. */
  spawnBurst(pos: THREE.Vector3) {
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * 6.283;
      const r = rand(0.25, 0.5);
      this.sparks.emit(
        pos.x + Math.cos(a) * r,
        pos.y + rand(0, 1.8),
        pos.z + Math.sin(a) * r,
        Math.cos(a) * 0.3,
        rand(0.6, 2.4),
        Math.sin(a) * 0.3,
        rand(0.3, 0.75),
        rand(0.04, 0.08),
        0.01,
        0.3,
        0.85,
        1,
        0.9,
        0,
        1,
      );
    }
    _p.copy(pos);
    _p.y += 1;
    this.flash(_p, 14, 0x62e4ff);
  }

  /** Outward sparkle when the tool gun deletes something. */
  dissolve(pos: THREE.Vector3) {
    for (let i = 0; i < 12; i++) {
      this.sparks.emit(
        pos.x,
        pos.y,
        pos.z,
        rand(-2.5, 2.5),
        rand(-1, 3),
        rand(-2.5, 2.5),
        rand(0.25, 0.6),
        rand(0.05, 0.09),
        0.01,
        0.35,
        0.85,
        1,
        0.9,
        2,
        1.5,
      );
    }
  }

  explosion(pos: THREE.Vector3) {
    for (let i = 0; i < 30; i++) {
      this.sparks.emit(
        pos.x,
        pos.y + 0.4,
        pos.z,
        rand(-5, 5),
        rand(0, 7),
        rand(-5, 5),
        rand(0.25, 0.6),
        rand(0.6, 1.2),
        rand(1.6, 3),
        1,
        rand(0.4, 0.65),
        0.12,
        0.85,
        -2,
        2.5,
      );
    }
    for (let i = 0; i < 36; i++) {
      const g = rand(0.1, 0.24);
      this.puffs.emit(
        pos.x + rand(-0.5, 0.5),
        pos.y + rand(0.2, 1),
        pos.z + rand(-0.5, 0.5),
        rand(-3.5, 3.5),
        rand(1, 6),
        rand(-3.5, 3.5),
        rand(1.4, 3.2),
        rand(0.6, 1),
        rand(2.5, 4.5),
        g,
        g,
        g,
        0.75,
        -0.8,
        1.6,
      );
    }
    for (let i = 0; i < 50; i++) {
      this.sparks.emit(
        pos.x,
        pos.y + 0.4,
        pos.z,
        rand(-14, 14),
        rand(2, 16),
        rand(-14, 14),
        rand(0.4, 1.1),
        0.06,
        0.01,
        1,
        0.75,
        0.3,
        1,
        12,
        0.6,
      );
    }
    _p.copy(pos);
    _p.y += 1;
    this.flash(_p, 120, 0xffa040);
    this.audio.play('explosion', { pos });
  }

  update(dt: number, pixelScale: number) {
    this.puffs.setScale(pixelScale);
    this.sparks.setScale(pixelScale);
    this.puffs.update(dt);
    this.sparks.update(dt);
    this.holes.update(dt);

    for (const s of this.streaks) {
      if (!s.mesh.visible) continue;
      s.t += TRACER_SPEED * dt;
      if (s.t + s.len * 0.5 >= s.dist) {
        s.mesh.visible = false;
        continue;
      }
      s.mesh.position.copy(s.from).addScaledVector(s.dir, s.t);
    }

    if (this.beamLife > 0) {
      this.beamLife -= dt;
      const k = Math.max(0, this.beamLife / 0.16);
      this.beam.scale.x = this.beam.scale.y = 0.004 + 0.03 * k;
      if (this.beamLife <= 0) this.beam.visible = false;
    }

    if (this.light.intensity > 0) {
      this.light.intensity *= Math.exp(-dt * 26);
      if (this.light.intensity < 0.05) this.light.intensity = 0;
    }

    const arr = this.shellMesh.instanceMatrix.array as Float32Array;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.shells.splice(i, 1);
        continue;
      }
      s.v.y -= 14 * dt;
      s.p.addScaledVector(s.v, dt);
      s.e.x += s.w.x * dt;
      s.e.y += s.w.y * dt;
      s.e.z += s.w.z * dt;
      if (s.p.y < s.ground + 0.006) {
        s.p.y = s.ground + 0.006;
        if (!s.rang) {
          s.rang = true;
          this.audio.play('shell', { pos: s.p, rate: rand(0.85, 1.2) });
        }
        s.v.set(s.v.x * 0.5, Math.abs(s.v.y) > 0.6 ? -s.v.y * 0.35 : 0, s.v.z * 0.5);
        s.w.multiplyScalar(0.45);
      }
    }
    for (let i = 0; i < this.shells.length; i++) {
      const s = this.shells[i];
      _m.compose(s.p, _q.setFromEuler(_e.copy(s.e)), _s);
      _m.toArray(arr, i * 16);
    }
    this.shellMesh.count = this.shells.length;
    this.shellMesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.holes.clear();
    this.puffs.clear();
    this.sparks.clear();
    this.shells.length = 0;
  }
}
