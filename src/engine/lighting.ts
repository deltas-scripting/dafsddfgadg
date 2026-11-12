import * as THREE from 'three';
import { HORIZON, buildSky } from '../models/props';

/** Direction from the scene towards the sun. */
export const SUN_DIR = new THREE.Vector3(-0.5, 0.85, 0.45).normalize();
export const SHADOW_SIZE = 2048;

/** Sky + sun lighting shared by the menu, the map and thumbnails. */
export function addLights(scene: THREE.Scene, shadowRange = 0, shadowFar = 170): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x7c776a, 1.45));
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.5);
  sun.position.copy(SUN_DIR).multiplyScalar(70);
  if (shadowRange > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
    const c = sun.shadow.camera;
    c.left = c.bottom = -shadowRange;
    c.right = c.top = shadowRange;
    c.near = 1;
    c.far = shadowFar;
    c.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
  }
  scene.add(sun, sun.target);
  return sun;
}

export function addAtmosphere(scene: THREE.Scene) {
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 110, 470);
  scene.add(buildSky());
}

/**
 * Prefiltered environment for reflections on metal and wet blood. It is a desaturated version of
 * the sky: mirroring the saturated blue would tint gun metal blue and blood magenta.
 */
export function makeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  scene.add(buildSky([0x9db0c8, 0xd6dee6, 0xf0efe9]));
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(470, 24),
    new THREE.MeshBasicMaterial({ color: 0x77736a, fog: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  scene.add(ground);
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(42, 12, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.7, 3.2), fog: false, toneMapped: false }),
  );
  sun.position.copy(SUN_DIR).multiplyScalar(400);
  scene.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.03, 1, 1000).texture;
  pmrem.dispose();
  return tex;
}
