import * as THREE from 'three';
import { Builder, type V3 } from '../engine/builder';
import { environment, mats } from '../engine/materials';
import { shade } from '../engine/util';
import { HEADS } from '../engine/textures';
import { PLAYER_LOOK } from './humanoid';

export type WeaponId = 'tool' | 'ak' | 'pistol' | 'knife';

/**
 * A weapon model. Space: -z is the muzzle direction, +y up, origin near the right-hand grip.
 * `parts` holds the sub-objects that animate (slide, magazine, bolt, drum ...).
 */
export interface WeaponModel {
  root: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  muzzle: THREE.Object3D;
  eject: THREE.Object3D | null;
  gripR: THREE.Vector3;
  gripL: THREE.Vector3 | null;
  /** Height of the sight line above the origin. */
  sightY: number;
  screen?: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
}

const C = {
  gun: 0x32353a,
  gunDark: 0x1e2023,
  gunLight: 0x4a4d54,
  steel: 0xc6cbd3,
  black: 0x121315,
  wood: 0x94572a,
  woodDark: 0x6f3f1c,
  woodLight: 0xb07038,
  poly: 0x1f2023,
  polyLight: 0x34363b,
  brass: 0xc9a13f,
};

function anchor(parent: THREE.Object3D, x: number, y: number, z: number) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

function group(parent: THREE.Object3D, b: Builder, pos: V3 = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.set(pos[0], pos[1], pos[2]);
  g.add(b.build());
  parent.add(g);
  return g;
}

/** Banana-magazine outline: two arcs around a centre in front of the magazine well. */
function arcPts(R: number, hw: number, amax: number, n: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * amax;
    pts.push([-R + (R + hw) * Math.cos(a), -(R + hw) * Math.sin(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = (i / n) * amax;
    pts.push([-R + (R - hw) * Math.cos(a), -(R - hw) * Math.sin(a)]);
  }
  return pts;
}

export function buildAK(): WeaponModel {
  const m = mats();
  const root = new THREE.Group();
  const b = new Builder();
  // receiver and dust cover
  b.box(m.metal, C.gun, [0.034, 0.05, 0.255], [0, 0.025, -0.0425], { chamfer: 0.004 });
  b.box(m.metal, C.gunLight, [0.032, 0.024, 0.185], [0, 0.06, -0.0075], { chamfer: 0.009 });
  for (let i = 0; i < 3; i++) b.box(m.metal, C.gun, [0.0335, 0.013, 0.006], [0, 0.064, 0.03 - i * 0.045]);
  b.box(m.metal, C.gun, [0.034, 0.046, 0.022], [0, 0.024, 0.094], { chamfer: 0.004 });
  // rear sight
  b.box(m.metal, C.gun, [0.03, 0.022, 0.07], [0, 0.059, -0.135], { chamfer: 0.004 });
  b.box(m.metal, C.gunDark, [0.012, 0.005, 0.062], [0, 0.0725, -0.14]);
  b.box(m.metal, C.gunDark, [0.016, 0.004, 0.004], [0, 0.0745, -0.112]);
  for (const s of [1, -1]) b.box(m.metal, C.gunDark, [0.005, 0.012, 0.004], [0.0055 * s, 0.08, -0.112]);
  // barrel, gas system, front sight
  b.cyl(m.metal, C.gunDark, 0.0075, 0.47, [0, 0.032, -0.4], { axis: 'z' });
  b.cyl(m.metal, C.gunDark, 0.0085, 0.1, [0, 0.06, -0.36], { axis: 'z', seg: 8 });
  b.box(m.metal, C.gun, [0.018, 0.042, 0.03], [0, 0.046, -0.405], { chamfer: 0.004 });
  b.box(m.metal, C.gun, [0.012, 0.05, 0.022], [0, 0.056, -0.585], { chamfer: 0.003 });
  for (const s of [1, -1]) b.box(m.metal, C.gunDark, [0.003, 0.02, 0.014], [0.008 * s, 0.088, -0.585]);
  b.box(m.metal, C.gunDark, [0.003, 0.014, 0.003], [0, 0.084, -0.585]);
  b.cyl(m.metal, C.gun, 0.011, 0.04, [0, 0.032, -0.652], { axis: 'z' });
  b.cyl(m.metal, C.black, 0.005, 0.002, [0, 0.032, -0.6725], { axis: 'z', seg: 8 });
  b.cyl(m.metal, C.gunLight, 0.003, 0.25, [0, 0.016, -0.47], { axis: 'z', seg: 6 });
  // furniture
  b.box(m.wood, C.wood, [0.042, 0.04, 0.17], [0, 0.022, -0.255], { chamfer: 0.01 });
  b.box(m.wood, C.woodLight, [0.046, 0.02, 0.09], [0, 0.012, -0.25], { chamfer: 0.008 });
  b.box(m.wood, C.wood, [0.034, 0.024, 0.13], [0, 0.058, -0.245], { chamfer: 0.009 });
  b.box(m.metal, C.gun, [0.044, 0.044, 0.008], [0, 0.03, -0.343]);
  b.prism(
    m.wood,
    C.wood,
    [
      [0.1, 0.046],
      [0.1, 0.006],
      [0.31, -0.05],
      [0.335, -0.05],
      [0.335, 0.03],
      [0.3, 0.04],
    ],
    0.03,
    [0, 0, 0],
    { bevel: 0.006 },
  );
  b.box(m.metal, C.gun, [0.032, 0.086, 0.008], [0, -0.01, 0.339], { chamfer: 0.002 });
  b.prism(
    m.wood,
    C.woodDark,
    [
      [-0.012, 0.004],
      [0.03, 0.004],
      [0.052, -0.088],
      [0.014, -0.094],
    ],
    0.028,
    [0, 0, 0],
    { bevel: 0.006 },
  );
  // trigger group and controls
  b.box(m.metal, C.gunDark, [0.014, 0.003, 0.064], [0, -0.033, -0.045]);
  b.box(m.metal, C.gunDark, [0.014, 0.034, 0.003], [0, -0.016, -0.0765]);
  b.box(m.metal, C.gunLight, [0.005, 0.022, 0.006], [0, -0.014, -0.032], { rot: [0.3, 0, 0] });
  b.box(m.metal, C.gunLight, [0.006, 0.02, 0.008], [0, -0.012, -0.081], { rot: [-0.3, 0, 0] });
  b.box(m.metal, C.gunLight, [0.002, 0.009, 0.078], [0.0178, 0.03, -0.012], { rot: [0.06, 0, 0] });
  b.box(m.metal, C.gunLight, [0.002, 0.006, 0.006], [-0.0178, 0.02, -0.12]);
  b.box(m.metal, C.gunLight, [0.002, 0.006, 0.006], [-0.0178, 0.014, -0.03]);
  root.add(b.build());

  const bb = new Builder();
  bb.box(m.steel, C.steel, [0.004, 0.013, 0.09], [0.0172, 0.05, -0.06]);
  bb.box(m.steel, C.steel, [0.018, 0.009, 0.013], [0.028, 0.05, -0.092], { chamfer: 0.003 });
  const bolt = group(root, bb);

  const mb = new Builder();
  mb.prism(m.metal, C.gunLight, arcPts(0.25, 0.03, 0.72, 7), 0.024, [0, 0, 0], { bevel: 0.004 });
  mb.prism(m.metal, C.gun, arcPts(0.25, 0.011, 0.66, 7), 0.0275);
  const mag = group(root, mb, [0, 0.008, -0.115]);

  return {
    root,
    parts: { bolt, mag },
    muzzle: anchor(root, 0, 0.032, -0.68),
    eject: anchor(root, 0.024, 0.056, -0.05),
    gripR: new THREE.Vector3(0, -0.047, 0.022),
    gripL: new THREE.Vector3(0, -0.028, -0.25),
    sightY: 0.0865,
  };
}

/** Grip axis lean of the pistol (radians from vertical). */
export const PISTOL_GRIP_TILT = 0.172;

export function buildPistol(): WeaponModel {
  const m = mats();
  const root = new THREE.Group();
  const b = new Builder();
  // frame with integral trigger guard
  b.prism(
    m.polymer,
    C.poly,
    [
      [0.052, 0.045],
      [-0.125, 0.045],
      [-0.125, 0.027],
      [-0.07, 0.024],
      [-0.074, -0.002],
      [-0.066, -0.012],
      [-0.025, -0.012],
      [-0.018, -0.006],
      [0.004, -0.078],
      [0.058, -0.078],
      [0.047, -0.01],
      [0.05, 0.02],
      [0.062, 0.034],
    ],
    0.026,
    [0, 0, 0],
    {
      bevel: 0.003,
      holes: [
        [
          [-0.066, 0.02],
          [-0.068, -0.004],
          [-0.062, -0.008],
          [-0.03, -0.008],
          [-0.026, 0.02],
        ],
      ],
    },
  );
  b.prism(
    m.wood,
    0x5e3d24,
    [
      [-0.012, -0.004],
      [0.008, -0.07],
      [0.052, -0.07],
      [0.043, -0.004],
    ],
    0.0315,
    [0, 0, 0],
    { bevel: 0.003 },
  );
  b.cyl(m.steel, C.steel, 0.0065, 0.14, [0, 0.064, -0.065], { axis: 'z' });
  b.cyl(m.metal, C.black, 0.0035, 0.003, [0, 0.064, -0.1365], { axis: 'z', seg: 8 });
  b.cyl(m.metal, C.gunDark, 0.004, 0.02, [0, 0.05, -0.121], { axis: 'z', seg: 8 });
  b.box(m.steel, C.steel, [0.006, 0.022, 0.006], [0, 0.008, -0.042], { rot: [0.25, 0, 0] });
  b.box(m.metal, C.gunLight, [0.002, 0.005, 0.03], [-0.0142, 0.04, -0.03]);
  b.box(m.metal, C.gunLight, [0.002, 0.008, 0.012], [-0.0142, 0.04, 0.04]);
  b.box(m.metal, C.gunDark, [0.007, 0.016, 0.012], [0, 0.066, 0.064], { rot: [-0.5, 0, 0] });
  root.add(b.build());

  const sb = new Builder();
  sb.box(m.metal, C.gunLight, [0.028, 0.032, 0.19], [0, 0.061, -0.035], { chamfer: 0.005 });
  sb.box(m.metal, C.gun, [0.011, 0.002, 0.15], [0, 0.0775, -0.04]);
  for (let i = 0; i < 6; i++) {
    for (const s of [1, -1]) sb.box(m.metal, C.gunDark, [0.0015, 0.022, 0.003], [0.0143 * s, 0.06, 0.02 + i * 0.006]);
  }
  sb.box(m.metal, C.black, [0.012, 0.004, 0.036], [0.006, 0.0768, -0.05]);
  sb.box(m.metal, C.black, [0.002, 0.012, 0.036], [0.0142, 0.07, -0.05]);
  sb.box(m.metal, C.gunDark, [0.004, 0.007, 0.008], [0, 0.0805, -0.122]);
  for (const s of [1, -1]) sb.box(m.metal, C.gunDark, [0.006, 0.008, 0.007], [0.008 * s, 0.081, 0.05]);
  for (const s of [1, -1]) sb.box(m.glow, 0xf4f4f4, [0.003, 0.003, 0.001], [0.008 * s, 0.0815, 0.054]);
  sb.box(m.glow, 0xf4f4f4, [0.0025, 0.003, 0.001], [0, 0.0815, -0.1175]);
  const slide = group(root, sb);

  const mb = new Builder();
  mb.box(m.metal, C.gun, [0.02, 0.11, 0.034], [0, 0.058, 0]);
  mb.box(m.polymer, C.polyLight, [0.025, 0.009, 0.046], [0, -0.003, 0.002], { chamfer: 0.003 });
  const mag = group(root, mb, [0, -0.078, 0.031]);
  mag.rotation.x = -PISTOL_GRIP_TILT;

  return {
    root,
    parts: { slide, mag },
    muzzle: anchor(root, 0, 0.064, -0.145),
    eject: anchor(root, 0.018, 0.076, -0.05),
    gripR: new THREE.Vector3(0, -0.03, 0.03),
    gripL: new THREE.Vector3(-0.012, -0.05, 0.022),
    sightY: 0.085,
  };
}

const BLADE: [number, number][] = [
  [-0.056, 0.016],
  [-0.165, 0.016],
  [-0.205, 0.007],
  [-0.238, -0.005],
  [-0.21, -0.014],
  [-0.185, -0.017],
  [-0.056, -0.017],
];

export function buildKnife(): WeaponModel {
  const m = mats();
  const root = new THREE.Group();
  const b = new Builder();
  for (let i = 0; i < 6; i++) {
    const big = i % 2 === 0;
    b.box(m.polymer, big ? 0x2b2420 : 0x3d342d, [big ? 0.027 : 0.024, big ? 0.032 : 0.029, 0.018], [0, 0, 0.052 - i * 0.018], {
      chamfer: 0.005,
    });
  }
  b.box(m.steel, 0xaab0b8, [0.029, 0.034, 0.013], [0, 0, 0.069], { chamfer: 0.004 });
  b.box(m.steel, 0xaab0b8, [0.014, 0.066, 0.008], [0, 0, -0.052], { chamfer: 0.002 });
  b.prism(m.steel, 0xd6dae0, BLADE, 0.0042, [0, 0, 0], { bevel: 0.0019 });
  b.box(m.steel, 0x8d939b, [0.0046, 0.004, 0.095], [0, 0.007, -0.112]);
  root.add(b.build());

  // Blood coat over the blade; its opacity follows how bloody the knife is.
  const bloodMat = new THREE.MeshStandardMaterial({
    color: 0x8a0a0a,
    roughness: 0.3,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    envMap: environment(),
  });
  const cb = new Builder();
  cb.prism(bloodMat, 0xffffff, BLADE.map(([z, y]) => [z * 1.004, y * 1.03] as [number, number]), 0.0052, [0, 0, 0], {
    bevel: 0.002,
  });
  const blood = cb.build(false, false);
  root.add(blood);

  return {
    root,
    parts: { blood },
    muzzle: anchor(root, 0, 0, -0.2),
    eject: null,
    gripR: new THREE.Vector3(0, 0, 0.012),
    gripL: null,
    sightY: 0,
  };
}

export function buildToolGun(): WeaponModel {
  const m = mats();
  const root = new THREE.Group();
  const b = new Builder();
  const shell = 0xd3d7dc;
  const cyan = 0x5fe3ff;
  // grip and trigger
  b.prism(
    m.polymer,
    C.poly,
    [
      [-0.018, 0.032],
      [0.024, 0.032],
      [0.047, -0.07],
      [0.008, -0.076],
    ],
    0.03,
    [0, 0, 0],
    { bevel: 0.005 },
  );
  b.box(m.polymer, 0xe07b1f, [0.031, 0.012, 0.03], [0, -0.03, 0.022], { rot: [-0.22, 0, 0] });
  b.box(m.polymer, 0xe07b1f, [0.006, 0.02, 0.008], [0, 0.018, -0.03], { rot: [0.25, 0, 0] });
  b.box(m.metal, C.gunDark, [0.012, 0.003, 0.05], [0, 0.004, -0.04]);
  b.box(m.metal, C.gunDark, [0.012, 0.026, 0.003], [0, 0.017, -0.064]);
  // body
  b.box(m.polymer, shell, [0.046, 0.05, 0.16], [0, 0.057, -0.045], { chamfer: 0.008 });
  b.box(m.metal, C.gun, [0.03, 0.012, 0.12], [0, 0.088, -0.05], { chamfer: 0.003 });
  b.box(m.polymer, shade(shell, 0.72), [0.048, 0.008, 0.12], [0, 0.04, -0.05]);
  for (let i = 0; i < 4; i++) b.box(m.metal, C.gunDark, [0.0475, 0.003, 0.012], [0, 0.07, -0.1 + i * 0.016]);
  // barrel with coils and emitter prongs
  b.cyl(m.metal, C.gunDark, 0.013, 0.12, [0, 0.06, -0.18], { axis: 'z' });
  for (let i = 0; i < 3; i++) b.cyl(m.metal, 0xc7722a, 0.019, 0.012, [0, 0.06, -0.15 - i * 0.03], { axis: 'z', seg: 12 });
  b.cyl(m.metal, C.gun, 0.017, 0.022, [0, 0.06, -0.244], { axis: 'z', seg: 12 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    b.box(m.steel, C.steel, [0.004, 0.004, 0.04], [Math.cos(a) * 0.02, 0.06 + Math.sin(a) * 0.02, -0.262]);
  }
  // battery pack, wires, buttons, antenna
  b.box(m.polymer, 0xe3b23a, [0.032, 0.03, 0.078], [0, 0.02, -0.11], { chamfer: 0.004 });
  for (const z of [-0.085, -0.135]) b.box(m.polymer, C.black, [0.0325, 0.0305, 0.01], [0, 0.02, z]);
  b.box(m.polymer, 0xc8281e, [0.004, 0.004, 0.075], [0.0245, 0.045, -0.055], { rot: [0.45, 0, 0] });
  b.box(m.polymer, 0x2a63c8, [0.004, 0.004, 0.075], [-0.0245, 0.045, -0.055], { rot: [0.45, 0, 0] });
  const btn = [0xd23a2a, 0x39b54a, 0x3a7bd5];
  for (let i = 0; i < 3; i++) b.box(m.glow, btn[i], [0.002, 0.008, 0.008], [-0.0238, 0.066, -0.01 + i * 0.014]);
  b.cyl(m.metal, C.gunLight, 0.0015, 0.075, [-0.016, 0.128, 0.03], { seg: 5 });
  b.box(m.glow, 0xff3b30, [0.006, 0.006, 0.006], [-0.016, 0.168, 0.03]);
  b.box(m.glow, 0xff3b30, [0.004, 0.004, 0.002], [0, 0.02, -0.15]);
  // screen housing
  b.push([0, 0.086, 0.044], [-0.28, 0, 0]);
  b.box(m.polymer, C.poly, [0.066, 0.052, 0.014], [0, 0, 0], { chamfer: 0.004 });
  b.pop();
  root.add(b.build());

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 80;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.056, 0.035),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
  );
  screen.position.set(0, 0.0881, 0.0512);
  screen.rotation.x = -0.28;
  root.add(screen);

  const db = new Builder();
  db.cyl(m.metal, C.gun, 0.03, 0.05, [0, 0, 0], { axis: 'z', seg: 12 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    db.box(m.glow, cyan, [0.009, 0.003, 0.036], [Math.cos(a) * 0.0305, Math.sin(a) * 0.0305, 0], {
      rot: [0, 0, a + Math.PI / 2],
    });
  }
  const drum = group(root, db, [0, 0.054, -0.06]);

  const cb = new Builder();
  cb.cyl(m.glow, cyan, 0.0095, 0.014, [0, 0, 0], { axis: 'z', seg: 10 });
  const core = group(root, cb, [0, 0.06, -0.256]);

  return {
    root,
    parts: { drum, core, screen },
    muzzle: anchor(root, 0, 0.06, -0.285),
    eject: null,
    gripR: new THREE.Vector3(0, -0.022, 0.014),
    gripL: null,
    sightY: 0.1,
    screen: { ctx: canvas.getContext('2d')!, tex },
  };
}

export function buildWeapon(id: WeaponId): WeaponModel {
  return id === 'ak' ? buildAK() : id === 'pistol' ? buildPistol() : id === 'knife' ? buildKnife() : buildToolGun();
}

/**
 * First-person arm: a gloved fist at the origin with the forearm running back along +z.
 * `side` is 1 for the right arm, -1 for the left (mirrors the thumb).
 */
export function buildArm(side: 1 | -1): THREE.Group {
  const m = mats();
  const skin = HEADS[PLAYER_LOOK.head].skin;
  const glove = 0x2a2a2e;
  const b = new Builder();
  // fingerless glove: back of the hand, palm and knuckles
  b.box(m.matte, glove, [0.084, 0.05, 0.088], [0, 0.024, 0.002], { chamfer: 0.01 });
  b.box(m.matte, shade(glove, 0.8), [0.08, 0.05, 0.07], [0, -0.024, 0.012], { chamfer: 0.01 });
  b.box(m.matte, glove, [0.084, 0.032, 0.03], [0, 0.03, -0.05], { chamfer: 0.008 });
  // bare fingers wrapped around the grip, and the thumb
  for (let i = 0; i < 4; i++) {
    b.box(m.matte, i % 2 ? shade(skin, 0.94) : skin, [0.0185, 0.062, 0.03], [-0.0315 + i * 0.021, -0.012, -0.05], {
      chamfer: 0.006,
    });
  }
  b.box(m.matte, skin, [0.026, 0.028, 0.068], [-0.05 * side, 0.022, -0.02], { chamfer: 0.008 });
  // wrist strap, forearm, sleeve
  b.box(m.matte, shade(glove, 1.9), [0.086, 0.09, 0.02], [0, 0, 0.056], { chamfer: 0.006 });
  b.box(m.matte, skin, [0.07, 0.076, 0.36], [0, 0, 0.245], { chamfer: 0.016 });
  b.box(m.matte, PLAYER_LOOK.shirt, [0.1, 0.106, 0.3], [0, 0, 0.57], { chamfer: 0.02 });
  return b.build(false, false);
}
