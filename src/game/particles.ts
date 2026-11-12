import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d) * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <colorspace_fragment>
}`;

/** Pooled soft point sprites for smoke, dust, blood mist (normal) and sparks (additive). */
export class Particles {
  readonly points: THREE.Points;
  private n = 0;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  /** life, maxLife, size0, size1, alpha0, gravity, drag */
  private meta: Float32Array;
  private mat: THREE.ShaderMaterial;

  constructor(
    scene: THREE.Scene,
    private max: number,
    additive: boolean,
  ) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.meta = new Float32Array(max * 7);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  /** Pixels per world unit at distance 1 (viewport height / (2 tan(fov / 2))). */
  setScale(s: number) {
    this.mat.uniforms.uScale.value = s;
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size0: number,
    size1: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
    gravity = 0,
    drag = 0,
  ) {
    // When full, recycle a random particle rather than dropping the new one.
    const i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([r, g, b, alpha], i * 4);
    this.size[i] = size0;
    this.meta.set([life, life, size0, size1, alpha, gravity, drag], i * 7);
  }

  update(dt: number) {
    const { pos, vel, col, size, meta } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      const m = i * 7;
      meta[m] -= dt;
      if (meta[m] <= 0) {
        const l = --this.n;
        if (i !== l) {
          pos.copyWithin(i * 3, l * 3, l * 3 + 3);
          vel.copyWithin(i * 3, l * 3, l * 3 + 3);
          col.copyWithin(i * 4, l * 4, l * 4 + 4);
          meta.copyWithin(m, l * 7, l * 7 + 7);
          size[i] = size[l];
        }
        continue;
      }
      const k = 1 - meta[m] / meta[m + 1];
      const o = i * 3;
      const damp = Math.max(0, 1 - meta[m + 6] * dt);
      vel[o] *= damp;
      vel[o + 1] = vel[o + 1] * damp - meta[m + 5] * dt;
      vel[o + 2] *= damp;
      pos[o] += vel[o] * dt;
      pos[o + 1] += vel[o + 1] * dt;
      pos[o + 2] += vel[o + 2] * dt;
      size[i] = meta[m + 2] + (meta[m + 3] - meta[m + 2]) * k;
      col[i * 4 + 3] = meta[m + 4] * (1 - k * k);
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    if (this.n > 0) {
      g.attributes.position.needsUpdate = true;
      g.attributes.aColor.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
    }
  }

  clear() {
    this.n = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}
