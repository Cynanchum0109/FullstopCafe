import { palette } from "../../world/palette";
import type { CharacterProfile } from "./index";

/**
 * Animal versions of the cast: an alternate appearance for the same three
 * actors, toggled from the HUD. Ids match `profiles`, so home spots, selection
 * and the AI all carry over untouched.
 *
 * Shapes and markings live in `actors/animal.ts`, where the primitives are --
 * a `RigSpec` describes a person and has no field that means "muzzle". What is
 * here is the handful of numbers the rig tuner can drive, seeded per animal:
 * size, and the tail and ear settings that share their sliders with a human's
 * ponytail and hair mass.
 *
 * `pieces` is emptied on purpose: the surface-piece system paints faces onto a
 * spherical human head, and the animal heads paint their own.
 */
export const animalProfiles: CharacterProfile[] = [
  {
    id: "heath",
    displayName: "Heath",
    // German shepherd: biggest of the three, tall pointed ears, a heavy tail
    // that sweeps up rather than curling tight.
    spec: {
      animal: "shepherd",
      scale: 0.9,
      headRadius: 0.16,
      pieces: [],
      tailLength: 0.42,
      tailThickness: 0.038,
      tailTilt: 0.55,
      tailCurl: -2.3,
      earLength: 0.3,
      earWidth: 0.15,
      earTilt: 0.16,
    },
    spawn: { x: -2.0, z: -0.9 },
  },
  {
    id: "honglu",
    displayName: "Honglu",
    // Border collie: smaller and rounder, ears folded at the tip, and a tighter
    // tail with the white tip landing at the end of the curl.
    spec: {
      animal: "collie",
      scale: 0.76,
      headRadius: 0.16,
      pieces: [],
      tailLength: 0.38,
      tailThickness: 0.062,
      tailTilt: 0.45,
      tailCurl: -3.2,
      earLength: 0.19,
      earWidth: 0.14,
      earTilt: 0.3,
    },
    spawn: { x: 0.3, z: 0.4 },
  },
  {
    id: "sinclair",
    displayName: "Sinclair",
    // Chick: much the smallest -- it should read as something the dogs could
    // step on. No ears and no proper tail, so those sliders do nothing here.
    spec: {
      animal: "chick",
      scale: 0.6,
      headRadius: 0.16,
      pieces: [],
      skin: palette.chickFeather,
    },
    spawn: { x: 2.1, z: 1.5 },
  },
];
