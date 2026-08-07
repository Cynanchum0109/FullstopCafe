import * as THREE from "three";
import { palette } from "../world/palette";

/** Keyframes describing the sky over one in-game day. */
interface SkyKey {
  /** Position in the day, 0..1 where 0 is midnight. */
  at: number;
  sun: number;
  sky: number;
  sunIntensity: number;
  ambientIntensity: number;
  /** Sun azimuth in radians; sweeps across the window during the day. */
  azimuth: number;
}

/**
 * Azimuths stay inside the +X/+Z quadrant on purpose. The room is a cutaway
 * with only its -X and -Z walls standing, so their lit sides are the ones
 * facing the camera; a sun anywhere else leaves the whole interior in shade.
 */
const SKY_KEYS: SkyKey[] = [
  { at: 0.0, sun: palette.sunNight, sky: 0x3a4670, sunIntensity: 0.35, ambientIntensity: 0.55, azimuth: 0.3 },
  { at: 0.25, sun: 0xffd0a0, sky: 0xffe0c0, sunIntensity: 1.0, ambientIntensity: 0.85, azimuth: 0.45 },
  { at: 0.5, sun: palette.sunDay, sky: palette.skyDay, sunIntensity: 1.6, ambientIntensity: 1.05, azimuth: 0.8 },
  { at: 0.75, sun: 0xffb27a, sky: 0xffd8b8, sunIntensity: 1.15, ambientIntensity: 0.85, azimuth: 1.2 },
  { at: 1.0, sun: palette.sunNight, sky: 0x3a4670, sunIntensity: 0.35, ambientIntensity: 0.55, azimuth: 1.35 },
];

/**
 * Two lights, no more: a hemisphere fill that keeps shadowed faces from going
 * muddy, and one directional sun that casts the shadows. Both are driven by the
 * time of day so the room warms up and cools down over the cycle.
 */
export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly hemisphere: THREE.HemisphereLight;

  private readonly sunColor = new THREE.Color();
  private readonly skyColor = new THREE.Color();
  private readonly keyA = new THREE.Color();
  private readonly keyB = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.hemisphere = new THREE.HemisphereLight(
      palette.skyDay,
      palette.groundBounce,
      0.85,
    );
    scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(palette.sunDay, 1.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    // Tight ortho box around the room keeps shadow texels large and crisp.
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -6;
    shadowCamera.right = 6;
    shadowCamera.top = 6;
    shadowCamera.bottom = -6;
    shadowCamera.near = 1;
    shadowCamera.far = 30;
    shadowCamera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;

    scene.add(this.sun);
    scene.add(this.sun.target);

    this.apply(0.5);
  }

  /** Set the lighting for a point in the day, 0..1. */
  apply(dayFraction: number): void {
    const { a, b, t } = findSpan(dayFraction);

    this.keyA.setHex(a.sun);
    this.keyB.setHex(b.sun);
    this.sunColor.copy(this.keyA).lerp(this.keyB, t);

    this.keyA.setHex(a.sky);
    this.keyB.setHex(b.sky);
    this.skyColor.copy(this.keyA).lerp(this.keyB, t);

    this.sun.color.copy(this.sunColor);
    this.sun.intensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
    this.hemisphere.color.copy(this.skyColor);
    this.hemisphere.intensity = THREE.MathUtils.lerp(
      a.ambientIntensity,
      b.ambientIntensity,
      t,
    );

    // Keep the sun above the horizon even at night, so the moon still reads as
    // a light source rather than lighting the room from underneath.
    const azimuth = THREE.MathUtils.lerp(a.azimuth, b.azimuth, t);
    const height = 8 + Math.sin(dayFraction * Math.PI * 2 - Math.PI / 2) * 2;
    this.sun.position.set(Math.sin(azimuth) * 7, height, Math.cos(azimuth) * 7);
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();
  }
}

/** Locate the two keyframes surrounding `at` and the blend factor between them. */
function findSpan(at: number): { a: SkyKey; b: SkyKey; t: number } {
  const clamped = THREE.MathUtils.clamp(at, 0, 1);
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const a = SKY_KEYS[i];
    const b = SKY_KEYS[i + 1];
    if (!a || !b) continue;
    if (clamped >= a.at && clamped <= b.at) {
      const span = b.at - a.at;
      return { a, b, t: span > 0 ? (clamped - a.at) / span : 0 };
    }
  }
  const first = SKY_KEYS[0];
  const last = SKY_KEYS[SKY_KEYS.length - 1];
  // SKY_KEYS is a non-empty literal, so both ends always exist.
  return { a: first!, b: last!, t: 0 };
}
