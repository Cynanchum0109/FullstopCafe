import type { AnimFn } from "./types";
import { idle } from "./idle";
import { walk } from "./walk";

/** Every animation the game can play, by name. */
export const animations = {
  idle,
  walk,
} satisfies Record<string, AnimFn>;

export type AnimName = keyof typeof animations;

export type { AnimFn, AnimContext } from "./types";
