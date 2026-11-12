import * as THREE from 'three';
import { textures } from './textures';

function make() {
  const t = textures();
  const lam = (map?: THREE.Texture) => new THREE.MeshLambertMaterial(map ? { vertexColors: true, map } : { vertexColors: true });
  const std = (roughness: number, metalness: number) =>
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness });
  const decal = { transparent: true, depthWrite: false, polygonOffset: true } as const;
  return {
    /** Flat vertex-coloured surfaces. */
    matte: lam(),
    /** Characters: vertex colours plus the face atlas. */
    doll: lam(t.faces),
    metal: std(0.48, 0.6),
    steel: std(0.24, 0.9),
    polymer: std(0.62, 0.05),
    wood: std(0.52, 0),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x22323f,
      roughness: 0.08,
      metalness: 0.6,
      transparent: true,
      opacity: 0.85,
    }),
    tiles: lam(t.tiles),
    panels: lam(t.panels),
    concrete: lam(t.concrete),
    asphalt: lam(t.asphalt),
    grass: lam(t.grass),
    dirt: lam(t.dirt),
    planks: lam(t.planks),
    crate: lam(t.crate),
    corrugated: lam(t.corrugated),
    target: lam(t.target),
    barrel: lam(t.barrel),
    hazard: lam(t.hazard),
    /** Wet, glossy blood decals (vertex alpha fades them). */
    blood: new THREE.MeshStandardMaterial({
      map: t.blood,
      vertexColors: true,
      roughness: 0.3,
      metalness: 0,
      envMapIntensity: 0.45,
      ...decal,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
    holes: new THREE.MeshLambertMaterial({
      map: t.holes,
      vertexColors: true,
      ...decal,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    /** Blood stains parented to body parts. */
    wound: new THREE.MeshLambertMaterial({
      map: t.blood,
      ...decal,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    droplet: new THREE.MeshStandardMaterial({ color: 0x8c0808, roughness: 0.3, metalness: 0, envMapIntensity: 0.45 }),
    /** Invisible in the colour pass but still rendered into shadow maps. */
    shadowOnly: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
  };
}

let cache: ReturnType<typeof make> | null = null;
let env: THREE.Texture | null = null;

/**
 * Reflections for the PBR materials. The map is assigned per material instead of through
 * scene.environment, which would also light every Lambert surface with sky-blue irradiance.
 */
export function setEnvironment(texture: THREE.Texture) {
  env = texture;
  const m = mats();
  for (const mat of [m.metal, m.steel, m.polymer, m.wood, m.glass, m.blood, m.droplet]) {
    mat.envMap = texture;
    mat.needsUpdate = true;
  }
}
export const environment = () => env;
export const mats = () => (cache ??= make());
export type Mats = ReturnType<typeof make>;
