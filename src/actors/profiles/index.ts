import { palette } from "../../world/palette";
import type { RigSpec } from "../Rig";
import { DEFAULT_PIECE, fringe, pair, type SurfacePiece } from "../SurfacePiece";

/**
 * Per-character appearance data. Story, weapons, personality and home spots
 * live in `docs/DESIGN.md` — do not reshape silhouettes without an explicit ask.
 *
 * Personality / utility weights will hang off this type later as plain numbers;
 * the AI should only ever read data from here, not hard-code character names.
 *
 * Spec numbers are edited by the in-game rig tuner (press `~`) and pasted back
 * over the blocks below.
 */
export interface CharacterProfile {
  id: string;
  displayName: string;
  spec: Partial<RigSpec>;
  /**
   * Fallback spawn if furniture has no preferred spot for this id.
   * Runtime prefers `Furniture.preferredSpotFor(id)` (see main.ts).
   */
  spawn: { x: number; z: number };
}

/** Eyes and blush, shared by all three. Tune per character from here. */
function face(options: { eyeWidth?: number; eyeLength?: number; blush?: boolean } = {}) {
  const { eyeWidth = 0.07, eyeLength = 0.085, blush = true } = options;
  const pieces: SurfacePiece[] = [
    ...pair({
      ...DEFAULT_PIECE,
      shape: "disc",
      color: palette.suitBlack,
      note: "眼睛",
      azimuth: 0.34,
      elevation: 0.165,
      lift: 0.004,
      width: eyeWidth,
      length: eyeLength,
      thickness: 0.012,
    }),
  ];
  if (blush) {
    pieces.push(
      ...pair({
        ...DEFAULT_PIECE,
        shape: "disc",
        color: palette.skinDark,
        note: "腮红",
        azimuth: 0.74,
        elevation: -0.2,
        lift: 0.003,
        width: 0.07,
        length: 0.045,
        thickness: 0.01,
      }),
    );
  }
  return pieces;
}

export const profiles: CharacterProfile[] = [
  {
    id: "heath",
    displayName: "Heath",
    // Appearance only — lore/weapons/home: docs/DESIGN.md (sniper, naps on sofa).
    // Tallest. Black suit, white collar, brown hair in a 3:7 side part with a
    // long high ponytail. The part shows as a heavy sweep to one side and a
    // short remainder on the other.
    spec: {
      scale: 1.06,
      hair: palette.heathHair,
      hairShade: palette.heathHairShade,
      hairTie: palette.suitCharcoal,
      pieces: [
        ...face(),
        // Heavy side of the 3:7 part: long, swept hard across the brow.
        ...fringe({
          from: -0.15,
          to: 1.25,
          count: 4,
          length: 0.2,
          lengthBias: 0.65,
          skew: -0.05,
          width: 0.13,
          color: palette.heathHair,
        }),
        // Light side: short and tucked.
        ...fringe({
          from: -1.15,
          to: -0.3,
          count: 2,
          length: 0.13,
          skew: 0.03,
          width: 0.12,
          color: palette.heathHair,
        }),
        ...pair({
          ...DEFAULT_PIECE,
          shape: "lock",
          color: palette.heathHair,
          note: "鬓发",
          azimuth: 1.45,
          elevation: 0.16,
          width: 0.1,
          length: 0.26,
          taper: 0.35,
          pitch: 0.04,
        }),
      ],
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
    // Appearance only — lore/weapons/home: docs/DESIGN.md (boss; pistol + knife).
    // Dark coat, almost no contrast. The short high ponytail and the fringe
    // falling across one eye are the whole silhouette, plus a teal hair tie as
    // the single spot of colour.
    spec: {
      scale: 1.0,
      hair: palette.hongluHair,
      hairShade: palette.hongluHairShade,
      hairTie: palette.hongluTie,
      capDepth: 1.05,
      pieces: [
        ...face({ eyeLength: 0.075 }),
        // The half-fringe: one long curtain over the left eye...
        ...fringe({
          from: -1.2,
          to: 0.1,
          count: 4,
          length: 0.26,
          lengthBias: 0.55,
          skew: 0.04,
          width: 0.13,
          color: palette.hongluHair,
        }),
        // ...and almost nothing on the other side.
        ...fringe({
          from: 0.45,
          to: 1.15,
          count: 2,
          length: 0.11,
          width: 0.11,
          color: palette.hongluHair,
        }),
        // Long lock in front of the ear, on the covered side only.
        {
          ...DEFAULT_PIECE,
          shape: "lock",
          color: palette.hongluHair,
          note: "长鬓发",
          azimuth: -1.5,
          elevation: 0.1,
          width: 0.1,
          length: 0.34,
          taper: 0.3,
        },
        {
          ...DEFAULT_PIECE,
          shape: "lock",
          color: palette.hongluHair,
          note: "短鬓发",
          azimuth: 1.5,
          elevation: 0.12,
          width: 0.09,
          length: 0.2,
          taper: 0.35,
        },
      ],
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
    // Appearance only — lore/weapons/home: docs/DESIGN.md (SMG; ops table studious).
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
      pieces: [
        ...face({ eyeLength: 0.07 }),
        // Soft, near-centre part with pointed tips: messier than the other two.
        ...fringe({
          from: -1.2,
          to: 1.2,
          count: 6,
          length: 0.19,
          shape: "spike",
          width: 0.11,
          color: palette.sinclairHair,
        }),
        ...pair({
          ...DEFAULT_PIECE,
          shape: "lock",
          color: palette.sinclairHair,
          note: "鬓发",
          azimuth: 1.5,
          elevation: 0.05,
          width: 0.11,
          length: 0.22,
          taper: 0.45,
          pitch: 0.08,
        }),
      ],
      tailLength: 0,
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
