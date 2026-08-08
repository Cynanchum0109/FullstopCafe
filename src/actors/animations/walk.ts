import type { AnimContext, AnimFn } from "./types";
import type { Rig } from "../Rig";
import { swingHair } from "./idle";

/**
 * Four-legged walk: a trot.
 *
 * Diagonal pairs move together -- front-left with back-right -- which is what a
 * dog actually does and, more usefully here, what keeps the body from rocking
 * side to side like a rowboat. The hop the two-legged cycle relies on is nearly
 * gone; with legs visibly reaching, a big vertical bounce reads as a rabbit.
 *
 * Legs arrive front pair then back, left before right, so index 0 and 3 are one
 * diagonal and 1 and 2 are the other.
 */
function trot(rig: Rig, ctx: AnimContext, phase: number, speed: number): void {
  const swing = Math.sin(phase);
  const counterSwing = Math.cos(phase);
  // Two pushes per cycle, one per diagonal pair.
  const hop = Math.abs(swing);

  // A proper bounce. The first version kept the body almost level and read as a
  // toy on wheels: at this scale these are puppies, and a puppy's walk is much
  // closer to a series of small jumps than to a horse's gait.
  rig.joints.bob.position.y = hop * 0.075 * speed;
  // Stretch at the top of the bounce, squash on landing, with the horizontal
  // axes taking the inverse square root so the volume holds.
  const stretch = 1 + (hop - 0.45) * 0.13 * speed;
  const flat = 1 / Math.sqrt(stretch);
  rig.joints.bob.scale.set(flat, stretch, flat);

  rig.joints.body.rotation.x = -0.09 * speed + swing * 0.11 * speed;
  rig.joints.body.rotation.y = swing * 0.09 * speed;
  rig.joints.body.rotation.z = counterSwing * 0.05 * speed;

  const reach = 1.15 * speed;
  rig.legs.forEach((leg, index) => {
    const diagonal = index === 0 || index === 3 ? 1 : -1;
    leg.rotation.x += swing * reach * diagonal;
  });

  // The head lags the body by a quarter cycle. That delay is what makes an
  // animal look like it has weight instead of being one rigid piece.
  rig.joints.head.rotation.x = 0.12 * speed - hop * 0.1;
  rig.joints.head.rotation.y = -swing * 0.1 * speed;
  rig.joints.head.rotation.z = -counterSwing * 0.09 * speed;

  // Ears and tail carry the same swing, one beat behind.
  swingHair(rig, -counterSwing * 0.3 * speed, 0.18 * speed + hop * 0.3);
  void ctx;
}

/** Hops per second at full speed. */
const CADENCE = 4.2;

/**
 * Walk cycle. With no legs to swing, the entire read comes from a hard vertical
 * hop, squash on landing and stretch at the top, a forward lean, and a head
 * that lags the body.
 */
export const walk: AnimFn = (rig, ctx) => {
  const speed = Math.max(ctx.speed, 0.001);
  const phase = ctx.time * CADENCE * speed;

  if (rig.legs.length > 0) {
    trot(rig, ctx, phase, speed);
    return;
  }

  // A chick keeps the two-legged hop -- it *is* a hopping egg -- but beats its
  // wings on the way. Twice per hop, because a bird's wingbeat is faster than
  // its stride and matching them one to one looks like paddling.
  rig.wings.forEach((wing, index) => {
    const side = index === 0 ? -1 : 1;
    wing.rotation.z += side * (0.55 + Math.sin(phase * 2) * 0.5) * speed;
    wing.rotation.x += Math.cos(phase * 2) * 0.18 * speed;
  });
  const swing = Math.sin(phase);
  const counterSwing = Math.cos(phase);
  // Two hops per cycle, one per foot.
  const hop = Math.abs(Math.sin(phase));

  // --- Body ------------------------------------------------------------
  const lift = hop * 0.075 * speed;
  // Stretch peaks mid-air, squash on contact. The horizontal axes take the
  // inverse square root so the character's volume stays constant.
  const stretch = 1 + (hop - 0.45) * 0.16 * speed;
  const flat = 1 / Math.sqrt(stretch);

  rig.joints.bob.position.y = lift;
  rig.joints.bob.scale.set(flat, stretch, flat);

  rig.joints.body.rotation.x = -0.14 * speed;
  rig.joints.body.rotation.z = counterSwing * 0.09 * speed;
  rig.joints.body.rotation.y = swing * 0.1 * speed;

  // --- Head ------------------------------------------------------------
  // The head lags the body by a quarter cycle. That small delay is what makes
  // the character look like it has weight instead of being one rigid piece.
  rig.joints.head.rotation.x = 0.1 * speed - hop * 0.06;
  rig.joints.head.rotation.z = -counterSwing * 0.07 * speed;
  rig.joints.head.rotation.y = -swing * 0.06 * speed;

  swingHair(rig, -counterSwing * 0.22 * speed, 0.18 * speed + hop * 0.14);

  // --- Hands -------------------------------------------------------------
  // Hands pop out and pump only once the character is properly moving; at a
  // shuffle they stay tucked away.
  if (speed > 0.45) {
    rig.joints.handL.visible = true;
    rig.joints.handR.visible = true;
    // Offsets from the rest pose rather than absolute positions, so retuning
    // the body proportions never leaves the hands floating in the wrong place.
    const reach = 0.1 * speed;
    rig.joints.handL.position.y += swing * 0.04;
    rig.joints.handL.position.z -= swing * reach;
    rig.joints.handR.position.y -= swing * 0.04;
    rig.joints.handR.position.z += swing * reach;
  }
};
