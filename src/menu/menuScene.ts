import * as THREE from 'three';
import { Builder } from '../engine/builder';
import { SUN_DIR, addAtmosphere, addLights } from '../engine/lighting';
import { mats } from '../engine/materials';
import { mulberry32 } from '../engine/util';
import { BANDIT_LOOK, Humanoid, PLAYER_LOOK } from '../models/humanoid';
import {
  addAmmoBox,
  addBarrel,
  addBottle,
  addCar,
  addDumpster,
  addJerryCan,
  addTable,
  buildClouds,
} from '../models/props';
import { buildWeapon, type WeaponId } from '../models/weapons';

/** The 3D backdrop of the main menu: a yard with the player character, a car and a workbench. */
export class MenuScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  private hero: Humanoid;
  private bandit: Humanoid;
  private clouds: THREE.Mesh;
  private t = 0;

  constructor() {
    const scene = this.scene;
    addAtmosphere(scene);
    const sun = addLights(scene, 13, 140);
    sun.target.position.set(0.5, 0, -1);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 70);
    sun.target.updateMatrixWorld();

    const m = mats();
    const b = new Builder();
    b.box(m.tiles, 0xffffff, [160, 0.2, 160], [0, -0.1, 0], { tile: 2 });
    // concrete panel wall behind the workbench
    b.box(m.panels, 0xffffff, [12, 3, 0.3], [6.7, 1.5, -1.7], { tile: 2 });
    b.box(m.concrete, 0xd8d6d0, [12.1, 0.1, 0.4], [6.7, 3.05, -1.7], { tile: 3 });
    b.push([-3.7, 0, -2.9], [0, -Math.PI / 2 + 0.16, 0]);
    addCar(b);
    b.pop();
    b.push([1.05, 0, 0.5]);
    addBarrel(b);
    b.pop();
    b.push([3.55, 0, 0.6], [0, -0.03, 0]);
    addTable(b);
    addBottle(b, [1.05, 0.9725, -0.12]);
    addAmmoBox(b, [1.32, 0.9725, 0.12], 0.4);
    addJerryCan(b, [0.55, 0.32, 0.02], 0xd9d6cc, 0.1);
    addJerryCan(b, [1.05, 0.32, 0.05], 0x2f4f8f, -0.15);
    b.pop();
    addDumpster(b, [6.6, 0, 0.95], -0.08);
    scene.add(b.build());

    // the arsenal laid out on the bench
    const lay = (id: WeaponId, x: number, z: number, yaw: number, lift: number) => {
      const holder = new THREE.Group();
      const model = buildWeapon(id).root;
      model.rotation.z = Math.PI / 2;
      holder.add(model);
      holder.position.set(3.55 + x, 0.9725 + lift, 0.6 + z);
      holder.rotation.y = yaw;
      holder.traverse((o) => {
        o.castShadow = true;
      });
      scene.add(holder);
    };
    lay('ak', -0.75, 0.02, 1.45, 0.024);
    lay('pistol', 0.05, 0.14, 1.9, 0.018);
    lay('knife', 0.38, -0.15, 1.2, 0.018);
    lay('tool', 0.62, 0.12, 1.75, 0.03);

    this.hero = new Humanoid(PLAYER_LOOK);
    this.hero.root.position.set(-1.5, 0, 2.3);
    this.hero.root.rotation.y = 0.28;
    scene.add(this.hero.root);

    this.bandit = new Humanoid(BANDIT_LOOK);
    this.bandit.root.position.set(-0.2, 0, -6.4);
    this.bandit.root.rotation.y = 0.12;
    scene.add(this.bandit.root);

    this.clouds = buildClouds(mulberry32(5), 14, 380, 80);
    scene.add(this.clouds);

    this.camera.position.set(0.5, 1.42, 6.6);
    this.camera.lookAt(0.7, 1.12, 0);
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const breathe = Math.sin(t * 1.5);
    const h = this.hero.pivots;
    h.chest.rotation.x = breathe * 0.012;
    h.head.rotation.y = -0.18 + Math.sin(t * 0.45) * 0.12;
    h.head.rotation.x = Math.sin(t * 0.3) * 0.03;
    h.upperArmL.rotation.z = 0.09 + breathe * 0.014;
    h.upperArmR.rotation.z = -0.09 - breathe * 0.014;
    const q = this.bandit.pivots;
    q.chest.rotation.x = Math.sin(t * 1.3 + 2) * 0.012;
    q.head.rotation.y = Math.sin(t * 0.33 + 1) * 0.3;
    this.clouds.position.x += dt * 1.2;
    if (this.clouds.position.x > 280) this.clouds.position.x = -280;
    // slow handheld drift
    this.camera.position.x = 0.5 + Math.sin(t * 0.21) * 0.07;
    this.camera.position.y = 1.42 + Math.sin(t * 0.33) * 0.02;
    this.camera.lookAt(0.7, 1.12, 0);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
