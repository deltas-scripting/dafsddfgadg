import * as THREE from 'three';
import { addAtmosphere, addLights } from '../engine/lighting';
import { buildPolygon } from '../game/maps/polygon';
import { buildWeapon, type WeaponId } from '../models/weapons';

const _size = new THREE.Vector2();

/**
 * Renders a scene into an image at a fixed size. The main canvas is resized just for the draw
 * and read back in the same task, so nothing flickers on screen.
 */
function snapshot(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  w: number,
  h: number,
  type: string,
): string {
  renderer.getSize(_size);
  const ratio = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.clear();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL(type, 0.86);
  renderer.setPixelRatio(ratio);
  renderer.setSize(_size.x, _size.y, false);
  return url;
}

/** Transparent side-on picture of a weapon for the hotbar. */
export function weaponIcon(renderer: THREE.WebGLRenderer, id: WeaponId): string {
  const W = 256;
  const H = 128;
  const model = buildWeapon(id);
  const scene = new THREE.Scene();
  scene.add(model.root);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 2));
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(2, 3, -1);
  scene.add(key);
  const box = new THREE.Box3().setFromObject(model.root);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  let halfW = (s.z / 2) * 1.1;
  let halfH = halfW * (H / W);
  if ((s.y / 2) * 1.2 > halfH) {
    halfH = (s.y / 2) * 1.2;
    halfW = halfH * (W / H);
  }
  // looking along -x puts the muzzle (-z) on the right of the picture
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 20);
  cam.position.set(c.x + 3, c.y + 0.5, c.z - 0.35);
  cam.lookAt(c);
  renderer.setClearColor(0x000000, 0);
  const url = snapshot(renderer, scene, cam, W, H, 'image/png');
  renderer.setClearColor(0x000000, 1);
  scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  return url;
}

/** Picture of the Polygon map for the map-select screen. */
export function mapThumbnail(renderer: THREE.WebGLRenderer): string {
  const scene = new THREE.Scene();
  addAtmosphere(scene);
  const sun = addLights(scene, 70, 260);
  const map = buildPolygon(scene, null);
  const cam = new THREE.PerspectiveCamera(48, 16 / 10, 0.5, 900);
  cam.position.fromArray(map.view.pos);
  cam.lookAt(new THREE.Vector3().fromArray(map.view.look));
  sun.target.position.set(0, 0, 0);
  sun.target.updateMatrixWorld();
  const url = snapshot(renderer, scene, cam, 800, 500, 'image/jpeg');
  scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  sun.shadow.map?.dispose();
  return url;
}
