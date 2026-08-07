import { palette } from "../../world/palette";
import type { RigSpec } from "../Rig";

/**
 * Per-character data. Appearance is drawn from `ref/`; personality weights are
 * still blank because the character bible has not landed yet -- they get added
 * here, as data, without touching any AI code.
 *
 * These numbers are meant to be edited by the in-game rig tuner (press `~`) and
 * pasted back over the `spec` blocks below.
 */
export interface CharacterProfile {
  id: string;
  displayName: string;
  spec: Partial<RigSpec>;
  /** Where they stand when the game first loads. */
  spawn: { x: number; z: number };
}

export const profiles: CharacterProfile[] = [
  {
    id: "heath",
    displayName: "Heath",
    // Tallest. Black suit, white collar, brown hair in a 3:7 side part with a
    // long high ponytail.
    spec: {
      scale: 1.06,
      hair: palette.heathHair,
      hairShade: palette.heathHairShade,
      hairTie: palette.suitCharcoal,
      partRatio: 0.32,
      fringeDrop: 0.15,
      fringeAsym: 0.35,
      sideLockLength: 0.19,
      sideLockAsym: 0.25,
      tailLength: 0.58,
      tailThickness: 0.08,
      tailAnchorY: 0.62,
      tailTilt: 0.72,
      body: palette.suitBlack,
      hem: palette.suitCharcoal,
      accent: palette.shirtWhite,
      boots: palette.bootBlack,
    },
    spawn: { x: -2.0, z: -0.9 },
  },
  {
    id: "honglu",
    displayName: "Honglu",
    // Dark coat, almost no contrast. The short high ponytail and the fringe
    // sweeping across one eye are the whole silhouette, plus a teal hair tie
    // as the single spot of colour.
    spec: {
      scale: 1.0,
      hair: palette.hongluHair,
      hairShade: palette.hongluHairShade,
      hairTie: palette.hongluTie,
      capDepth: 1.05,
      partRatio: 0.72,
      fringeDrop: 0.17,
      fringeAsym: 0.55,
      sideLockLength: 0.22,
      sideLockAsym: -0.3,
      tailLength: 0.3,
      tailThickness: 0.075,
      tailAnchorY: 0.68,
      tailTilt: 0.95,
      body: palette.hongluCoat,
      hem: palette.suitBlack,
      accent: palette.suitCharcoal,
      boots: palette.bootBlack,
    },
    spawn: { x: 0.3, z: 0.4 },
  },
  {
    id: "sinclair",
    displayName: "Sinclair",
    // Shortest of the three. Soft blonde hair with no tail, so the head reads
    // as one round mass; olive field gear.
    spec: {
      scale: 0.93,
      hair: palette.sinclairHair,
      hairShade: palette.sinclairHairShade,
      hairTie: palette.sinclairHairShade,
      headRadius: 0.235,
      capDepth: 1.05,
      backDepth: 1.95,
      faceGap: 1.55,
      partRatio: 0.44,
      fringeDrop: 0.16,
      fringeAsym: 0.15,
      sideLockLength: 0.21,
      tailLength: 0,
      blush: 0.035,
      body: palette.sinclairGear,
      hem: palette.suitCharcoal,
      // Grey webbing rather than a bright collar: a pale ring under a blonde
      // head turned the whole silhouette into a bowl.
      accent: palette.metalDark,
      boots: palette.bootBlack,
    },
    spawn: { x: 2.1, z: 1.5 },
  },
];
