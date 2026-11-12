import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type V3 = readonly [number, number, number];
export type Rect = readonly [number, number, number, number];
/** Atlas rectangles (u0, v0, u1, v1) per box face. */
export interface FaceUV {
  px?: Rect;
  nx?: Rect;
  py?: Rect;
  ny?: Rect;
  pz?: Rect;
  nz?: Rect;
  all?: Rect;
}
export interface BoxOpts {
  rot?: V3;
  chamfer?: number;
  uv?: FaceUV;
  /** World size of one texture repeat, for tiling materials. */
  tile?: number;
}
type UVFn = (axis: number, sign: number, u: number, v: number) => readonly [number, number];

const FACE_KEYS = [
  ['nx', 'px'],
  ['ny', 'py'],
  ['nz', 'pz'],
] as const;
const KEEP = ['position', 'normal', 'uv', 'color'];
const ZERO: V3 = [0, 0, 0];

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();

export function xform(pos: V3 = ZERO, rot: V3 = ZERO, out = new THREE.Matrix4()) {
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  return out.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s);
}

/**
 * Box with chamfered edges and flat normals: 6 faces, 12 edge bevels and 8 corner triangles.
 * Winding is fixed against the centroid, which is valid because the solid is convex.
 */
export function chamferBox(w: number, h: number, d: number, c = 0, uvFn?: UVFn): THREE.BufferGeometry {
  const half = [w / 2, h / 2, d / 2];
  const dims = [w, h, d];
  c = Math.max(0, Math.min(c, half[0] * 0.95, half[1] * 0.95, half[2] * 0.95));
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const P = (s: number[], axis: number) => [0, 1, 2].map((i) => s[i] * (i === axis ? half[i] : half[i] - c));

  const tri = (a: number[], b: number[], cc: number[], axis: number, sign: number) => {
    let nx = (b[1] - a[1]) * (cc[2] - a[2]) - (b[2] - a[2]) * (cc[1] - a[1]);
    let ny = (b[2] - a[2]) * (cc[0] - a[0]) - (b[0] - a[0]) * (cc[2] - a[2]);
    let nz = (b[0] - a[0]) * (cc[1] - a[1]) - (b[1] - a[1]) * (cc[0] - a[0]);
    if (nx * (a[0] + b[0] + cc[0]) + ny * (a[1] + b[1] + cc[1]) + nz * (a[2] + b[2] + cc[2]) < 0) {
      const t = b;
      b = cc;
      cc = t;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    if (axis < 0) {
      const ax = Math.abs(nx);
      const ay = Math.abs(ny);
      const az = Math.abs(nz);
      axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
      sign = [nx, ny, nz][axis] >= 0 ? 1 : -1;
    }
    for (const p of [a, b, cc]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(nx, ny, nz);
      let u: number;
      let v: number;
      if (axis === 0) {
        u = (sign > 0 ? -p[2] : p[2]) / dims[2] + 0.5;
        v = p[1] / dims[1] + 0.5;
      } else if (axis === 1) {
        u = p[0] / dims[0] + 0.5;
        v = (sign > 0 ? -p[2] : p[2]) / dims[2] + 0.5;
      } else {
        u = (sign > 0 ? p[0] : -p[0]) / dims[0] + 0.5;
        v = p[1] / dims[1] + 0.5;
      }
      const o = uvFn ? uvFn(axis, sign, u, v) : [u, v];
      uvs.push(o[0], o[1]);
    }
  };
  const quad = (a: number[], b: number[], cc: number[], dd: number[], axis: number, sign: number) => {
    tri(a, b, cc, axis, sign);
    tri(a, cc, dd, axis, sign);
  };
  const corner = (axis: number, sa: number, i1: number, s1: number, i2: number, s2: number) => {
    const s = [0, 0, 0];
    s[axis] = sa;
    s[i1] = s1;
    s[i2] = s2;
    return s;
  };

  for (let axis = 0; axis < 3; axis++) {
    const i1 = (axis + 1) % 3;
    const i2 = (axis + 2) % 3;
    for (const sign of [-1, 1]) {
      quad(
        P(corner(axis, sign, i1, -1, i2, -1), axis),
        P(corner(axis, sign, i1, 1, i2, -1), axis),
        P(corner(axis, sign, i1, 1, i2, 1), axis),
        P(corner(axis, sign, i1, -1, i2, 1), axis),
        axis,
        sign,
      );
    }
  }
  if (c > 0) {
    for (let k = 0; k < 3; k++) {
      const a = (k + 1) % 3;
      const b = (k + 2) % 3;
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          const lo = corner(k, -1, a, sa, b, sb);
          const hi = corner(k, 1, a, sa, b, sb);
          quad(P(lo, a), P(hi, a), P(hi, b), P(lo, b), -1, 0);
        }
      }
    }
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const s = [sx, sy, sz];
          tri(P(s, 0), P(s, 1), P(s, 2), -1, 0);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/**
 * Collects vertex-coloured primitives per material and merges them into one mesh per material,
 * so a whole model costs a handful of draw calls.
 */
export class Builder {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private cur = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];
  /** When set, untextured primitives sample this single atlas texel. */
  constUV: readonly [number, number] | null = null;

  push(pos: V3 = ZERO, rot: V3 = ZERO) {
    this.stack.push(this.cur.clone());
    this.cur.multiply(xform(pos, rot, _m2));
    return this;
  }

  pop() {
    const m = this.stack.pop();
    if (m) this.cur.copy(m);
    return this;
  }

  private put(mat: THREE.Material, color: number, g: THREE.BufferGeometry, pos: V3, rot: V3, constUV: boolean) {
    if (g.index) {
      const flat = g.toNonIndexed();
      g.dispose();
      g = flat;
    }
    g.applyMatrix4(_m.copy(this.cur).multiply(xform(pos, rot, _m2)));
    const n = g.attributes.position.count;
    _c.set(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (constUV || !g.attributes.uv) {
      const uv = new Float32Array(n * 2);
      const k = this.constUV;
      if (k) {
        for (let i = 0; i < n; i++) {
          uv[i * 2] = k[0];
          uv[i * 2 + 1] = k[1];
        }
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
    g.clearGroups();
    let list = this.buckets.get(mat);
    if (!list) this.buckets.set(mat, (list = []));
    list.push(g);
    return this;
  }

  box(mat: THREE.Material, color: number, size: V3, pos: V3 = ZERO, o: BoxOpts = {}) {
    const k = this.constUV;
    let fn: UVFn | undefined;
    if (o.uv) {
      const f = o.uv;
      fn = (a, s, u, v) => {
        const r = f[FACE_KEYS[a][s > 0 ? 1 : 0]] ?? f.all;
        return r ? [r[0] + u * (r[2] - r[0]), r[1] + v * (r[3] - r[1])] : (k ?? [u, v]);
      };
    } else if (o.tile) {
      const t = o.tile;
      fn = (a, _sgn, u, v) =>
        a === 0
          ? [(u * size[2]) / t, (v * size[1]) / t]
          : a === 1
            ? [(u * size[0]) / t, (v * size[2]) / t]
            : [(u * size[0]) / t, (v * size[1]) / t];
    } else if (k) {
      fn = () => k;
    }
    return this.put(mat, color, chamferBox(size[0], size[1], size[2], o.chamfer ?? 0, fn), pos, o.rot ?? ZERO, false);
  }

  /** Cylinder along `axis` (default y). Radius may be [top, bottom]. */
  cyl(
    mat: THREE.Material,
    color: number,
    r: number | readonly [number, number],
    len: number,
    pos: V3 = ZERO,
    o: { rot?: V3; seg?: number; axis?: 'x' | 'y' | 'z'; open?: boolean } = {},
  ) {
    const rt = typeof r === 'number' ? r : r[0];
    const rb = typeof r === 'number' ? r : r[1];
    const g = new THREE.CylinderGeometry(rt, rb, len, o.seg ?? 10, 1, o.open ?? false);
    if (o.axis === 'z') g.rotateX(Math.PI / 2);
    else if (o.axis === 'x') g.rotateZ(-Math.PI / 2);
    return this.put(mat, color, g, pos, o.rot ?? ZERO, this.constUV !== null);
  }

  /** Flat-shaded low-poly blob (icosahedron), optionally squashed. */
  blob(mat: THREE.Material, color: number, radius: number, pos: V3 = ZERO, scale: V3 = [1, 1, 1], detail = 1) {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);
    if (g.index) g = g.toNonIndexed();
    g.scale(scale[0], scale[1], scale[2]);
    g.computeVertexNormals();
    return this.put(mat, color, g, pos, ZERO, true);
  }

  /**
   * Extrude a side profile across x. Points are (z, y); z is the model's forward axis.
   * `bevel` chamfers the outline without growing it.
   */
  prism(
    mat: THREE.Material,
    color: number,
    pts: readonly (readonly [number, number])[],
    width: number,
    pos: V3 = ZERO,
    o: { rot?: V3; bevel?: number; holes?: readonly (readonly (readonly [number, number])[])[] } = {},
  ) {
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
    for (const h of o.holes ?? []) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
    const bevel = Math.min(o.bevel ?? 0, width * 0.45);
    const depth = width - 2 * bevel;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      steps: 1,
      curveSegments: 4,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: 1,
    });
    g.translate(0, 0, -depth / 2);
    g.rotateY(-Math.PI / 2);
    return this.put(mat, color, g, pos, o.rot ?? ZERO, true);
  }

  geo(mat: THREE.Material, color: number, g: THREE.BufferGeometry, pos: V3 = ZERO, rot: V3 = ZERO) {
    return this.put(mat, color, g, pos, rot, this.constUV !== null);
  }

  /** Merged geometry for one material (and removes it from the builder). */
  geometry(mat: THREE.Material): THREE.BufferGeometry {
    const list = this.buckets.get(mat);
    if (!list || !list.length) throw new Error('Builder: no geometry for material');
    this.buckets.delete(mat);
    if (list.length === 1) return list[0];
    const merged = mergeGeometries(list, false);
    if (!merged) throw new Error('Builder: merge failed');
    for (const g of list) g.dispose();
    return merged;
  }

  build(castShadow = true, receiveShadow = true): THREE.Group {
    const group = new THREE.Group();
    for (const mat of [...this.buckets.keys()]) {
      const mesh = new THREE.Mesh(this.geometry(mat), mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    return group;
  }
}
