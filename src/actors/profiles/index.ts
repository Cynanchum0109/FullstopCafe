import { palette } from "../../world/palette";
import type { RigSpec } from "../Rig";

/**
 * Per-character data. Appearance is drawn from `ref/`; personality weights are
 * still blank because the character bible has not landed yet -- they get added
 * here, as data, without touching any AI code.
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
    // Black suit, white collar, long brown hair pulled into a high ponytail.
    spec: {
      scale: 1.05,
      hair: palette.heathHair,
      hairStyle: "ponytail",
      tailLength: 0.44,
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
    // Long dark coat, almost no contrast; the deep purple bob does the work.
    spec: {
      scale: 1.0,
      hair: palette.hongluHair,
      hairStyle: "bob",
      tailLength: 0.2,
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
    // Shortest of the three, olive field gear, messy blonde hair and goggles.
    spec: {
      scale: 0.93,
      hair: palette.sinclairHair,
      hairStyle: "spiky",
      tailLength: 0,
      body: palette.sinclairGear,
      hem: palette.suitCharcoal,
      // Grey webbing rather than a bright collar: a pale ring under a blonde
      // head turned the whole silhouette into a bowl.
      accent: palette.metalDark,
      boots: palette.bootBlack,
      goggles: true,
      gogglesColor: palette.sinclairGoggle,
    },
    spawn: { x: 2.1, z: 1.5 },
  },
];
