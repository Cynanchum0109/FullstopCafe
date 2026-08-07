import type { Rig } from "../Rig";

export interface AnimContext {
  /** Seconds since this animation started playing. */
  time: number;
  /** Total scaled game time. Use for effects that should not restart on switch. */
  elapsed: number;
  /** Current movement speed as a fraction of the actor's top speed, 0..1. */
  speed: number;
}

/**
 * An animation is a pure function that writes joint transforms. The rig is
 * reset to its rest pose before every call, so a function only has to describe
 * the joints it actually moves.
 */
export type AnimFn = (rig: Rig, ctx: AnimContext) => void;
