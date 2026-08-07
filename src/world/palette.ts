/**
 * Central colour list for the whole game.
 *
 * The three characters are dressed in near-black tactical clothing (see `ref/`),
 * so the room deliberately goes the other way: warm, light, low contrast. That
 * keeps the silhouettes readable at the small on-screen size an isometric view
 * gives us.
 */
export const palette = {
  // --- Room shell ---
  floor: 0xc9a882,
  floorPlank: 0xbb9873,
  rug: 0x6f9b8c,
  rugTrim: 0x58806f,
  wallBack: 0xe8ded0,
  wallSide: 0xdccfbe,
  skirting: 0x9c8a70,
  windowFrame: 0xf3ece1,
  windowGlassDay: 0x9fd0e8,
  windowGlassNight: 0x2b3a5c,

  // --- Furniture ---
  woodDark: 0x6b4f3a,
  woodMid: 0x8a6a4c,
  woodLight: 0xb08d68,
  metal: 0x8f96a3,
  metalDark: 0x5a606b,
  fabricSofa: 0x8c6b7f,
  fabricCushion: 0xb08aa0,
  paper: 0xf6f2e8,
  plantLeaf: 0x5c9e5a,
  plantPot: 0xc0765a,

  // --- Lighting ---
  skyDay: 0xfff4e2,
  groundBounce: 0x8a7358,
  sunDay: 0xfff0d6,
  sunNight: 0x8fa6d8,
  lampWarm: 0xffc47a,

  // --- Characters (shared) ---
  skin: 0xf0cdaa,
  skinDark: 0xd9a97f,
  suitBlack: 0x24242c,
  suitCharcoal: 0x33333d,
  shirtWhite: 0xe9e9ef,
  bootBlack: 0x1b1b21,
  glovePale: 0xc9c9d2,

  // --- Per character accents ---
  heathHair: 0x53382a,
  heathTie: 0x1a1a20,
  hongluHair: 0x2e2740,
  hongluCoat: 0x1e1e26,
  sinclairHair: 0xd9c26a,
  sinclairGear: 0x5f5f4a,
  sinclairGoggle: 0x7fb0c0,
} as const;

export type PaletteKey = keyof typeof palette;
