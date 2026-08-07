import type { AnimFn } from "./types";
import { swingHair } from "./idle";

/** Hops per second at full speed. */
const CADENCE = 4.2;

/**
 * Walk cycle. With no legs to swing, the entire read comes from four things:
 * a hard vertical hop, squash on landing and stretch at the top, a forward
 * lean, and two orb feet that pop into existence and alternate underneath.
 *
 * The feet only exist while moving, which is why the walk feels bouncy rather
 * than like a cone being dragged across the floor.
 */
export const walk: AnimFn = (rig, ctx) => {
  const speed = Math.max(ctx.speed, 0.001);
  const phase = ctx.time * CADENCE * speed;
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

  // --- Feet --------------------------------------------------------------
  rig.joints.footL.visible = true;
  rig.joints.footR.visible = true;

  // One foot forward and planted while the other is back and lifted.
  const stride = 0.16 * speed;
  const stepL = swing;
  const stepR = -swing;

  rig.joints.footL.position.set(
    -0.115,
    0.055 + Math.max(0, stepL) * 0.1 * speed,
    -0.28 - stepL * stride,
  );
  rig.joints.footR.position.set(
    0.115,
    0.055 + Math.max(0, stepR) * 0.1 * speed,
    -0.28 - stepR * stride,
  );

  // Squash each foot as it takes the weight.
  const squashL = 1 - Math.max(0, -stepL) * 0.25 * speed;
  const squashR = 1 - Math.max(0, -stepR) * 0.25 * speed;
  rig.joints.footL.scale.set(1 / squashL, squashL, 1 / squashL);
  rig.joints.footR.scale.set(1 / squashR, squashR, 1 / squashR);

  // --- Hands -------------------------------------------------------------
  // Hands pop out and pump only once the character is properly moving; at a
  // shuffle they stay tucked away.
  if (speed > 0.45) {
    rig.joints.handL.visible = true;
    rig.joints.handR.visible = true;
    const reach = 0.1 * speed;
    rig.joints.handL.position.set(-0.26, 0.36 + swing * 0.04, -0.04 - swing * reach);
    rig.joints.handR.position.set(0.26, 0.36 - swing * 0.04, -0.04 + swing * reach);
  }
};
