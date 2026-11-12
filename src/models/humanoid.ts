import * as THREE from 'three';
import { Builder, type FaceUV, type V3 } from '../engine/builder';
import { mats } from '../engine/materials';
import { HEADS, WHITE_UV, faceTile } from '../engine/textures';
import { shade } from '../engine/util';

/** Outfit of a blocky humanoid; skin and hair come from the head variant. */
export interface Look {
  /** Row in the face atlas (see HEADS). */
  head: number;
  shirt: number;
  sleeves: 'short' | 'long';
  pants: number;
  shoes: number;
  gloves?: number;
  vest?: number;
  belt?: number;
  cap?: number;
}

export const PART_NAMES = [
  'pelvis',
  'chest',
  'head',
  'upperArmL',
  'lowerArmL',
  'upperLegL',
  'lowerLegL',
  'upperArmR',
  'lowerArmR',
  'upperLegR',
  'lowerLegR',
] as const;
export type PartName = (typeof PART_NAMES)[number];

export interface StumpSpec {
  pos: V3;
  dir: V3;
  size: readonly [number, number];
}

/**
 * One rigid segment of the body. Positions are in doll space (feet at y = 0, facing +z).
 * The same table drives the visual rig, the ragdoll colliders and the dismemberment points.
 */
export interface PartSpec {
  name: PartName;
  parent: PartName | null;
  center: V3;
  /** Collider half extents. Neighbouring parts meet at the joint so there are no gaps to shoot through. */
  half: V3;
  /** Joint to the parent. */
  joint: V3;
  mass: number;
  hp: number;
  /** Share of damage that drains the doll's life. */
  vital: number;
  /** Hinge limits about x (knees, elbows). */
  hinge?: readonly [number, number];
  /** Soft cone limit for ball joints: bone direction, parent-space reference direction, max swing/twist. */
  cone?: { axis: V3; ref: V3; lim: number; twist: number };
  /** Cut surfaces created when this part is severed from its parent. */
  stumpSelf?: StumpSpec;
  stumpParent?: StumpSpec;
  /** Second collider on the same body (foot, neck). */
  extra?: { half: V3; offset: V3 };
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

function limbs(side: 1 | -1): PartSpec[] {
  const S = side > 0 ? 'L' : 'R';
  const ax = 0.268 * side;
  const lx = 0.1 * side;
  return [
    {
      name: `upperArm${S}`,
      parent: 'chest',
      center: [ax, 1.335, 0],
      half: [0.05, 0.15, 0.05],
      joint: [ax, 1.475, 0],
      mass: 2.2,
      hp: 60,
      vital: 0.35,
      cone: { axis: [0, -1, 0], ref: norm([0.6 * side, -0.8, 0.15]), lim: 1.7, twist: 2.2 },
      stumpSelf: { pos: [0, 0.15, 0], dir: [0, 1, 0], size: [0.1, 0.1] },
      stumpParent: { pos: [0.212 * side, 0.1, 0], dir: [side, 0, 0], size: [0.11, 0.11] },
    },
    {
      name: `lowerArm${S}`,
      parent: `upperArm${S}`,
      center: [ax, 0.995, 0],
      half: [0.046, 0.19, 0.046],
      joint: [ax, 1.185, 0],
      mass: 1.8,
      hp: 45,
      vital: 0.3,
      hinge: [-2.4, 0],
      stumpSelf: { pos: [0, 0.192, 0], dir: [0, 1, 0], size: [0.085, 0.085] },
      stumpParent: { pos: [0, -0.152, 0], dir: [0, -1, 0], size: [0.09, 0.09] },
    },
    {
      name: `upperLeg${S}`,
      parent: 'pelvis',
      center: [lx, 0.725, 0],
      half: [0.078, 0.215, 0.082],
      joint: [lx, 0.94, 0],
      mass: 7.5,
      hp: 85,
      vital: 0.4,
      cone: { axis: [0, -1, 0], ref: norm([0.15 * side, -0.9, 0.4]), lim: 1.15, twist: 1 },
      stumpSelf: { pos: [0, 0.222, 0], dir: [0, 1, 0], size: [0.15, 0.16] },
      stumpParent: { pos: [lx, -0.104, 0], dir: [0, -1, 0], size: [0.15, 0.16] },
    },
    {
      name: `lowerLeg${S}`,
      parent: `upperLeg${S}`,
      center: [lx, 0.255, 0],
      half: [0.07, 0.25, 0.075],
      joint: [lx, 0.505, 0],
      mass: 4.5,
      hp: 60,
      vital: 0.3,
      hinge: [0, 2.3],
      extra: { half: [0.07, 0.04, 0.06], offset: [0, -0.205, 0.125] },
      stumpSelf: { pos: [0, 0.252, 0], dir: [0, 1, 0], size: [0.13, 0.14] },
      stumpParent: { pos: [0, -0.222, 0], dir: [0, -1, 0], size: [0.14, 0.15] },
    },
  ];
}

export const SPECS: PartSpec[] = [
  { name: 'pelvis', parent: null, center: [0, 1.03, 0], half: [0.19, 0.1, 0.1], joint: [0, 1.03, 0], mass: 11, hp: 130, vital: 0.8 },
  {
    name: 'chest',
    parent: 'pelvis',
    center: [0, 1.315, 0],
    half: [0.205, 0.185, 0.108],
    extra: { half: [0.055, 0.03, 0.055], offset: [0, 0.213, -0.005] },
    joint: [0, 1.13, 0],
    mass: 22,
    hp: 150,
    vital: 1,
    cone: { axis: [0, 1, 0], ref: norm([0, 1, 0.14]), lim: 0.7, twist: 0.7 },
    stumpSelf: { pos: [0, -0.19, 0], dir: [0, -1, 0], size: [0.36, 0.19] },
    stumpParent: { pos: [0, 0.107, 0], dir: [0, 1, 0], size: [0.34, 0.18] },
  },
  {
    name: 'head',
    parent: 'chest',
    center: [0, 1.675, 0],
    half: [0.12, 0.125, 0.12],
    joint: [0, 1.545, 0],
    mass: 5,
    hp: 30,
    vital: 4,
    cone: { axis: [0, 1, 0], ref: [0, 1, 0], lim: 0.75, twist: 1 },
    stumpSelf: { pos: [0, -0.131, 0], dir: [0, -1, 0], size: [0.11, 0.11] },
    stumpParent: { pos: [0, 0.257, -0.005], dir: [0, 1, 0], size: [0.105, 0.105] },
  },
  ...limbs(1),
  ...limbs(-1),
];
export const SPEC: Record<PartName, PartSpec> = Object.fromEntries(SPECS.map((s) => [s.name, s])) as Record<
  PartName,
  PartSpec
>;

export const PLAYER_LOOK: Look = {
  head: 0,
  shirt: 0x8a8d91,
  sleeves: 'short',
  pants: 0x5d7087,
  shoes: 0x5b4a2a,
  gloves: 0x1c1c1e,
};
export const BANDIT_LOOK: Look = {
  head: 1,
  shirt: 0x3d9d97,
  sleeves: 'long',
  pants: 0x4c607c,
  shoes: 0x2a2623,
  gloves: 0x1c1c1e,
  vest: 0x1d1d20,
};
export const DOLL_LOOKS: Look[] = [
  { head: 2, shirt: 0xdcdad2, sleeves: 'short', pants: 0x3f4a63, shoes: 0x2c2a28 },
  { head: 3, shirt: 0xd9772b, sleeves: 'long', pants: 0xc96a22, shoes: 0x1e1e1e, belt: 0x9a4f18 },
  { head: 4, shirt: 0x5c8a3e, sleeves: 'short', pants: 0x6b5a45, shoes: 0x3b2c1e },
  { head: 5, shirt: 0xe3c84a, sleeves: 'short', pants: 0x2f3440, shoes: 0xdedede },
  { head: 6, shirt: 0xe9e7e0, sleeves: 'long', pants: 0xd9d7cf, shoes: 0xbdbdb6, belt: 0xb0aea6 },
  { head: 7, shirt: 0x3d62a8, sleeves: 'short', pants: 0x8b8f96, shoes: 0x4a3a2a, cap: 0xb02a2a },
  { head: 2, shirt: 0x9a2d2d, sleeves: 'long', pants: 0x23262d, shoes: 0x191919 },
  { head: 4, shirt: 0xcfd6e2, sleeves: 'short', pants: 0x2e3a4f, shoes: 0x2c2a28 },
];

const FABRIC = 0x1b1b1e;

function buildParts(look: Look, noNeck: boolean): Record<PartName, THREE.BufferGeometry> {
  const M = mats().doll;
  const H = HEADS[look.head];
  const mask = H.style === 'mask';
  const skin = H.skin;
  const { shirt, pants, shoes } = look;
  const out = {} as Record<PartName, THREE.BufferGeometry>;
  const part = (fn: (b: Builder) => void) => {
    const b = new Builder();
    b.constUV = WHITE_UV;
    fn(b);
    return b.geometry(M);
  };

  out.pelvis = part((b) => {
    b.box(M, shirt, [0.375, 0.1, 0.208], [0, 0.055, 0], { chamfer: 0.015 });
    b.box(M, look.belt ?? 0x2b2118, [0.39, 0.045, 0.218], [0, -0.004, 0], { chamfer: 0.006 });
    b.box(M, 0xb9a45c, [0.05, 0.036, 0.012], [0, -0.004, 0.109]);
    b.box(M, pants, [0.385, 0.105, 0.212], [0, -0.052, 0], { chamfer: 0.015 });
  });

  out.chest = part((b) => {
    b.box(M, shirt, [0.42, 0.385, 0.225], [0, 0, 0], { chamfer: 0.025 });
    if (!noNeck) {
      b.box(M, mask ? FABRIC : skin, [0.115, 0.085, 0.115], [0, 0.213, -0.005], { chamfer: 0.01 });
      b.box(M, shade(shirt, 0.78), [0.17, 0.022, 0.15], [0, 0.186, 0]);
    }
    if (look.vest !== undefined) {
      const v = look.vest;
      const trim = shade(v, 1.7);
      b.box(M, v, [0.436, 0.33, 0.242], [0, -0.012, 0], { chamfer: 0.02 });
      b.box(M, trim, [0.1, 0.085, 0.02], [0.1, -0.09, 0.126], { chamfer: 0.004 });
      b.box(M, trim, [0.1, 0.085, 0.02], [-0.1, -0.09, 0.126], { chamfer: 0.004 });
      b.box(M, trim, [0.07, 0.045, 0.018], [0.11, 0.08, 0.125], { chamfer: 0.004 });
      b.box(M, 0x8a8d91, [0.012, 0.3, 0.006], [0, -0.012, 0.1225]);
    } else {
      b.box(M, shade(shirt, 0.86), [0.075, 0.07, 0.006], [0.1, 0.06, 0.1135]);
    }
  });

  out.head = part((b) => {
    const r = look.head;
    const uv: FaceUV = {
      pz: faceTile(0, r),
      px: faceTile(1, r),
      nz: faceTile(2, r),
      nx: faceTile(3, r),
      py: faceTile(4, r),
      ny: faceTile(5, r),
    };
    b.box(M, 0xffffff, [0.25, 0.26, 0.25], [0, 0, 0], { chamfer: 0.018, uv });
    b.box(M, mask ? FABRIC : shade(skin, 0.95), [0.034, 0.045, 0.024], [0, -0.012, 0.13], { chamfer: 0.006 });
    for (const s of [1, -1]) {
      b.box(M, mask ? FABRIC : shade(skin, 0.9), [0.02, 0.055, 0.04], [0.131 * s, -0.005, 0], { chamfer: 0.005 });
    }
    if (H.style === 'short' && look.cap === undefined) {
      b.box(M, H.hair, [0.264, 0.055, 0.264], [0, 0.112, -0.003], { chamfer: 0.014 });
      b.box(M, H.hair, [0.264, 0.14, 0.034], [0, 0.05, -0.119], { chamfer: 0.01 });
    }
    if (look.cap !== undefined) {
      b.box(M, look.cap, [0.268, 0.08, 0.268], [0, 0.108, 0], { chamfer: 0.02 });
      b.box(M, shade(look.cap, 0.8), [0.2, 0.014, 0.13], [0, 0.076, 0.18], { chamfer: 0.004 });
    }
  });

  for (const side of [1, -1] as const) {
    const S = side > 0 ? 'L' : 'R';
    const long = look.sleeves === 'long';
    out[`upperArm${S}`] = part((b) => {
      if (long) {
        b.box(M, shirt, [0.114, 0.3, 0.114], [0, 0, 0], { chamfer: 0.016 });
      } else {
        b.box(M, shirt, [0.12, 0.165, 0.12], [0, 0.068, 0], { chamfer: 0.016 });
        b.box(M, skin, [0.098, 0.16, 0.098], [0, -0.07, 0], { chamfer: 0.012 });
      }
    });
    out[`lowerArm${S}`] = part((b) => {
      const w = long ? 0.104 : 0.092;
      b.box(M, long ? shirt : skin, [w, 0.275, w], [0, 0.055, 0], { chamfer: 0.012 });
      if (long) b.box(M, shade(shirt, 0.8), [0.11, 0.03, 0.11], [0, -0.072, 0]);
      b.box(M, skin, [0.082, 0.125, 0.096], [0, -0.132, 0], { chamfer: 0.012 });
      b.box(M, skin, [0.03, 0.055, 0.03], [-0.03 * side, -0.125, 0.056], { chamfer: 0.006 });
      if (look.gloves !== undefined) {
        b.box(M, look.gloves, [0.092, 0.075, 0.106], [0, -0.112, 0], { chamfer: 0.008 });
        b.box(M, shade(look.gloves, 2.3), [0.096, 0.018, 0.11], [0, -0.08, 0]);
      }
    });
    out[`upperLeg${S}`] = part((b) => {
      b.box(M, pants, [0.166, 0.445, 0.176], [0, 0, 0], { chamfer: 0.018 });
      b.box(M, shade(pants, 0.84), [0.09, 0.09, 0.006], [0, 0.125, -0.0895]);
    });
    out[`lowerLeg${S}`] = part((b) => {
      b.box(M, pants, [0.146, 0.4, 0.156], [0, 0.05, 0], { chamfer: 0.015 });
      b.box(M, shade(pants, 0.84), [0.156, 0.04, 0.166], [0, -0.135, 0]);
      b.box(M, shoes, [0.15, 0.11, 0.166], [0, -0.195, 0], { chamfer: 0.012 });
      b.box(M, shoes, [0.152, 0.085, 0.275], [0, -0.205, 0.05], { chamfer: 0.02 });
      b.box(M, shade(shoes, 0.45), [0.158, 0.026, 0.285], [0, -0.242, 0.05]);
      b.box(M, shade(shoes, 1.5), [0.07, 0.016, 0.06], [0, -0.158, 0.105]);
    });
  }
  return out;
}

const geoCache = new Map<string, Record<PartName, THREE.BufferGeometry>>();
/** Part geometries are shared between every character with the same look. */
export function partGeometries(look: Look, noNeck = false) {
  const key = JSON.stringify([look, noNeck]);
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = buildParts(look, noNeck)));
  return g;
}

/** Posable blocky character: a pivot per joint with the part mesh hanging off it. */
export class Humanoid {
  root = new THREE.Group();
  pivots = {} as Record<PartName, THREE.Group>;
  meshes = {} as Record<PartName, THREE.Mesh>;

  constructor(
    public look: Look,
    noNeck = false,
  ) {
    const geos = partGeometries(look, noNeck);
    const M = mats().doll;
    for (const s of SPECS) {
      const parent = s.parent ? SPEC[s.parent] : null;
      const pj = parent ? parent.joint : [0, 0, 0];
      const pivot = new THREE.Group();
      pivot.position.set(s.joint[0] - pj[0], s.joint[1] - pj[1], s.joint[2] - pj[2]);
      (parent ? this.pivots[parent.name] : this.root).add(pivot);
      const mesh = new THREE.Mesh(geos[s.name], M);
      mesh.position.set(s.center[0] - s.joint[0], s.center[1] - s.joint[1], s.center[2] - s.joint[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pivot.add(mesh);
      this.pivots[s.name] = pivot;
      this.meshes[s.name] = mesh;
    }
    this.relax();
  }

  /** Natural standing pose: arms slightly away from the body, elbows a touch bent. */
  relax() {
    const p = this.pivots;
    for (const name of PART_NAMES) p[name].rotation.set(0, 0, 0);
    p.upperArmL.rotation.z = 0.07;
    p.upperArmR.rotation.z = -0.07;
    p.lowerArmL.rotation.x = -0.14;
    p.lowerArmR.rotation.x = -0.14;
  }
}
