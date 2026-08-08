import type { AnimFn } from "./types";
import type { Rig } from "../Rig";

/**
 * Standing around. Slow breathing plus a lazy weight shift, offset by a
 * per-actor phase so three characters standing together never sync up.
 *
 * Hands and feet stay hidden: at rest the character is a clean cone-plus-ball,
 * and that silhouette is the whole point of the design.
 */
export const idle: AnimFn = (rig, ctx) => {
  const t = ctx.elapsed;
  const breath = Math.sin(t * 1.5);
  const sway = Math.sin(t * 0.62);

  rig.joints.bob.position.y = breath * 0.009;
  // Breathe on the body, not the head: scaling a ball head looks like a balloon.
  rig.joints.body.scale.set(
    1 - breath * 0.012,
    1 + breath * 0.02,
    1 - breath * 0.012,
  );
  rig.joints.body.rotation.z = sway * 0.035;

  rig.joints.head.rotation.y = Math.sin(t * 0.4) * 0.22;
  rig.joints.head.rotation.z = -sway * 0.05;
  rig.joints.head.rotation.x = breath * 0.03;

  // A standing quadruped shifts its weight through its legs, not by leaning the
  // whole body: the sway above would otherwise slide it off its own feet.
  if (rig.legs.length > 0) {
    rig.joints.body.rotation.z = sway * 0.012;
    rig.legs.forEach((leg, index) => {
      const diagonal = index === 0 || index === 3 ? 1 : -1;
      leg.rotation.x += sway * 0.03 * diagonal;
    });
  }

  swingHair(rig, -sway * 0.09, 0.04 + breath * 0.03);
};

/**
 * Shared helper: hair trails behind the head's motion.
 *
 * `lateral` twists the tail sideways, `lag` swings it back. Called from every
 * animation, because hair that ignores the body is the fastest way to make a
 * rig look dead.
 */
export function swingHair(rig: Rig, lateral: number, lag: number): void {
  rig.joints.hair.rotation.z = lateral * 0.3;
  rig.joints.hairTail.rotation.z = lateral;
  rig.joints.hairTail.rotation.x = lag;
}
