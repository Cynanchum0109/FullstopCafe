import * as THREE from "three";
import { palette } from "../world/palette";
import { box, cone, sphere, flatMaterial, flatMaterialDouble } from "../world/materials";

/**
 * Everything about how a character looks, as plain numbers.
 *
 * There is deliberately no `hairStyle` switch any more. Every head is built
 * from the same handful of parts and only the numbers differ, which is what
 * lets the in-game tuner expose the whole design as sliders instead of three
 * hard-coded special cases.
 */
export interface RigSpec {
  scale: number;

  // --- Proportions ---
  /** Head radius. Body height is what sets the head-to-body ratio against it. */
  headRadius: number;
  bodyHeight: number;
  bodyTopRadius: number;
  bodyBottomRadius: number;
  hemHeight: number;
  hemRadius: number;

  // --- Tessellation. Lower is blockier and cheaper. ---
  bodySegments: number;
  headSegments: number;
  headRings: number;

  // --- Face ---
  eyeSize: number;
  /** Horizontal eye offset, as a fraction of head radius. */
  eyeSpacing: number;
  /** Vertical eye offset from the head centre, as a fraction of head radius. */
  eyeHeight: number;
  blush: number;

  // --- Hair ---
  /** How far down the front the crown reaches, radians from the top. */
  capDepth: number;
  /** How far down the back and sides reach, radians from the top. */
  backDepth: number;
  /** Angular size of the opening left for the face, radians. */
  faceGap: number;
  /** Parting position. 0.5 is centred; 0.3 is a 3:7 side part. */
  partRatio: number;
  fringeDrop: number;
  /** Makes one side of the fringe hang lower than the other, 0..1. */
  fringeAsym: number;
  sideLockLength: number;
  sideLockAsym: number;
  tailLength: number;
  tailThickness: number;
  /** How high up the back of the skull the tail is tied, as a fraction of r. */
  tailAnchorY: number;
  /** How far the tail kicks backwards from straight down, radians. */
  tailTilt: number;

  // --- Limbs ---
  handRadius: number;
  footRadius: number;

  goggles: boolean;

  // --- Colours ---
  skin: number;
  hair: number;
  /** Slightly darker hair tone used on the fringe, for cheap depth. */
  hairShade: number;
  hairTie: number;
  body: number;
  hem: number;
  accent: number;
  boots: number;
  gogglesColor: number;
}

export const DEFAULT_RIG_SPEC: RigSpec = {
  scale: 1,

  // Roughly 2.4 heads tall: head 0.46 across, body 0.62 -- big head, small
  // sharp body, which is where all the cuteness comes from.
  headRadius: 0.23,
  bodyHeight: 0.62,
  bodyTopRadius: 0.06,
  bodyBottomRadius: 0.24,
  hemHeight: 0.05,
  hemRadius: 0.255,

  bodySegments: 6,
  headSegments: 8,
  headRings: 5,

  eyeSize: 0.038,
  eyeSpacing: 0.36,
  eyeHeight: 0.0,
  blush: 0.03,

  capDepth: 1.0,
  backDepth: 1.75,
  faceGap: 1.7,
  partRatio: 0.5,
  fringeDrop: 0.14,
  fringeAsym: 0,
  sideLockLength: 0.16,
  sideLockAsym: 0,
  tailLength: 0.4,
  tailThickness: 0.075,
  tailAnchorY: 0.55,
  tailTilt: 0.5,

  handRadius: 0.062,
  footRadius: 0.05,

  goggles: false,

  skin: palette.skin,
  hair: palette.heathHair,
  hairShade: palette.heathHair,
  hairTie: palette.suitCharcoal,
  body: palette.suitBlack,
  hem: palette.suitCharcoal,
  accent: palette.shirtWhite,
  boots: palette.bootBlack,
  gogglesColor: palette.sinclairGoggle,
};

/** Named joints an animation is allowed to drive. */
export interface RigJoints {
  bob: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  hair: THREE.Group;
  hairTail: THREE.Group;
  handL: THREE.Group;
  handR: THREE.Group;
  footL: THREE.Group;
  footR: THREE.Group;
}

interface RestTransform {
  joint: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  visible: boolean;
}

/**
 * A procedural low-poly character: a sharp cone for a body, a faceted ball for
 * a head, and limbs that only exist when an animation asks for them.
 *
 * Dropping jointed arms and legs is what makes this readable at 80 pixels tall.
 * There is no skinning to go wrong, the silhouette stays a clean triangle, and
 * all the character comes from the head -- which is why the hair gets most of
 * the parameters here.
 */
export class Rig {
  /** Attach this to the scene. Drive its position / rotation.y to move. */
  readonly root = new THREE.Group();
  readonly joints: RigJoints;
  readonly spec: RigSpec;

  private readonly rest: RestTransform[] = [];

  constructor(spec: Partial<RigSpec> = {}) {
    this.spec = { ...DEFAULT_RIG_SPEC, ...spec };
    this.joints = this.build();
    this.captureRest();
  }

  /** Total height, useful for placing bubbles and name tags above the head. */
  get height(): number {
    const s = this.spec;
    return (s.bodyHeight + s.headRadius * 2) * s.scale;
  }

  /** Restore every joint to its rest transform and rest visibility. */
  resetPose(): void {
    for (const entry of this.rest) {
      entry.joint.position.copy(entry.position);
      entry.joint.quaternion.copy(entry.quaternion);
      entry.joint.scale.copy(entry.scale);
      entry.joint.visible = entry.visible;
    }
  }

  /** Snapshot the current pose, for blending out of it. */
  capturePose(): Pose {
    return this.rest.map((entry) => ({
      joint: entry.joint,
      position: entry.joint.position.clone(),
      quaternion: entry.joint.quaternion.clone(),
      scale: entry.joint.scale.clone(),
    }));
  }

  /**
   * Blend the current pose toward a captured one. `weight` 1 means fully the
   * captured pose, 0 leaves the current pose untouched. Visibility is not
   * blended -- an orb either exists this frame or it does not.
   */
  blendToward(pose: Pose, weight: number): void {
    for (const entry of pose) {
      entry.joint.position.lerp(entry.position, weight);
      entry.joint.quaternion.slerp(entry.quaternion, weight);
      entry.joint.scale.lerp(entry.scale, weight);
    }
  }

  /** Free the geometry this rig owns. Materials are shared and stay cached. */
  dispose(): void {
    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  }

  private build(): RigJoints {
    const s = this.spec;
    this.root.scale.setScalar(s.scale);

    const bob = new THREE.Group();
    bob.name = "bob";
    this.root.add(bob);

    // --- Body ------------------------------------------------------------
    const bodyGroup = new THREE.Group();
    bodyGroup.name = "body";
    bob.add(bodyGroup);

    const bodyMesh = cone(
      s.bodyTopRadius,
      s.bodyBottomRadius,
      s.bodyHeight,
      s.body,
      s.bodySegments,
    );
    bodyMesh.position.y = s.bodyHeight / 2;
    bodyGroup.add(bodyMesh);

    // Hem: a slightly wider ring at the base so the cone has a foot to stand
    // on rather than tapering into the floor.
    const hem = cone(
      s.hemRadius * 0.94,
      s.hemRadius,
      s.hemHeight,
      s.hem,
      s.bodySegments,
    );
    hem.position.y = s.hemHeight / 2;
    bodyGroup.add(hem);

    // Collar right under the head.
    const collar = cone(
      s.bodyTopRadius * 0.95,
      s.bodyTopRadius * 1.9,
      0.05,
      s.accent,
      s.bodySegments,
    );
    collar.position.y = s.bodyHeight - 0.03;
    bodyGroup.add(collar);

    // --- Head ------------------------------------------------------------
    const head = new THREE.Group();
    head.name = "head";
    head.position.y = s.bodyHeight;
    bodyGroup.add(head);

    const centre = s.headRadius * 0.95;
    const headMesh = sphere(s.headRadius, s.skin, s.headSegments, s.headRings);
    headMesh.position.y = centre;
    head.add(headMesh);

    this.buildFace(head, centre, s);

    const hair = new THREE.Group();
    hair.name = "hair";
    head.add(hair);
    const hairTail = new THREE.Group();
    hairTail.name = "hairTail";
    hair.add(hairTail);
    this.buildHair(hair, hairTail, centre, s);

    if (s.goggles) this.buildGoggles(head, centre, s);

    // --- Floating limbs --------------------------------------------------
    // All four start hidden. Animations opt in, which is what makes "pop out a
    // hand to hold a mug" a two-line change rather than a rig change.
    const handY = s.bodyHeight * 0.6;
    const handX = s.bodyBottomRadius * 0.88;
    const handL = this.buildOrb("handL", -handX, handY, -0.04, s.handRadius, s.skin);
    const handR = this.buildOrb("handR", handX, handY, -0.04, s.handRadius, s.skin);
    bodyGroup.add(handL, handR);

    // Feet hang off `root`, not `bob`, so they stay on the floor while the body
    // hops -- that gap is the only reason you ever see them. They also sit well
    // forward of the cone's flare, or they would be permanently hidden inside it.
    const footX = s.bodyBottomRadius * 0.48;
    const footZ = -(s.bodyBottomRadius + s.footRadius * 0.55);
    const footL = this.buildOrb("footL", -footX, s.footRadius, footZ, s.footRadius, s.boots);
    const footR = this.buildOrb("footR", footX, s.footRadius, footZ, s.footRadius, s.boots);
    this.root.add(footL, footR);

    return { bob, body: bodyGroup, head, hair, hairTail, handL, handR, footL, footR };
  }

  private buildFace(head: THREE.Group, centre: number, s: RigSpec): void {
    const r = s.headRadius;
    for (const side of [-1, 1] as const) {
      const eye = new THREE.Mesh(
        new THREE.CircleGeometry(s.eyeSize, 6),
        flatMaterial(palette.suitBlack),
      );
      eye.position.set(side * s.eyeSpacing * r, centre + s.eyeHeight * r, -r * 0.95);
      eye.rotation.y = Math.PI;
      head.add(eye);
    }

    if (s.blush <= 0) return;
    for (const side of [-1, 1] as const) {
      const blush = new THREE.Mesh(
        new THREE.CircleGeometry(s.blush, 6),
        flatMaterial(palette.skinDark),
      );
      blush.position.set(
        side * r * 0.66,
        centre + (s.eyeHeight - 0.28) * r,
        -r * 0.72,
      );
      blush.rotation.y = Math.PI + side * 0.6;
      head.add(blush);
    }
  }

  /**
   * Hair, built from five parametric parts: a crown, a back-and-sides shell
   * with a wedge cut out for the face, two fringe slabs either side of a
   * parting, two side locks, and a tail.
   *
   * Slabs rather than clusters of little spheres: at this size the detail just
   * turns to noise, and the flat planes read as stylised hair instead of as a
   * bad attempt at strands.
   */
  private buildHair(
    hair: THREE.Group,
    hairTail: THREE.Group,
    centre: number,
    s: RigSpec,
  ): void {
    const r = s.headRadius;
    const shellRadius = r * 1.07;
    const seg = s.headSegments;
    const rings = s.headRings;

    // 1. Crown. A full ring around the top -- this is the piece the face gap
    //    does not apply to, so it must stop above the eyes.
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(shellRadius, seg, rings, 0, Math.PI * 2, 0, s.capDepth),
      flatMaterialDouble(s.hair),
    );
    crown.position.y = centre;
    crown.castShadow = true;
    hair.add(crown);

    // 2. Back and sides. Reaches below the ear, with a wedge left open at the
    //    front. In three.js phi runs from -X, so the face at -Z sits at
    //    phi = 3pi/2 and the covered arc starts just past the gap's far edge.
    const back = new THREE.Mesh(
      new THREE.SphereGeometry(
        shellRadius,
        seg,
        rings,
        Math.PI * 1.5 + s.faceGap / 2,
        Math.PI * 2 - s.faceGap,
        0,
        s.backDepth,
      ),
      flatMaterialDouble(s.hair),
    );
    back.position.y = centre;
    back.castShadow = true;
    hair.add(back);

    // 3. Fringe. Slabs laid around the front of the skull, split at a parting
    //    line; `partRatio` slides that line sideways, which is the whole
    //    difference between a centre part and a 3:7 one.
    //
    //    Laid out by ANGLE, not by x. A flat slab wide enough to span the face
    //    in x punches straight out through the sides of the head, because the
    //    skull is far narrower at the front than it is across the middle.
    const halfSpan = 1.2;
    const partAngle = (s.partRatio - 0.5) * 2 * halfSpan;
    const sides: Array<{ from: number; to: number; drop: number }> = [
      { from: -halfSpan, to: partAngle, drop: s.fringeDrop * (1 + s.fringeAsym) },
      { from: partAngle, to: halfSpan, drop: s.fringeDrop * (1 - s.fringeAsym) },
    ];
    const surface = r * 0.9;
    for (const side of sides) {
      if (side.to - side.from < 0.05 || side.drop < 0.01) continue;
      // Two pieces per side: enough to follow the curve, few enough to stay
      // schematic instead of turning into a fringe of individual strands.
      const pieces = 2;
      for (let i = 0; i < pieces; i++) {
        const from = THREE.MathUtils.lerp(side.from, side.to, i / pieces);
        const to = THREE.MathUtils.lerp(side.from, side.to, (i + 1) / pieces);
        const mid = (from + to) / 2;
        const chord = 2 * surface * Math.sin((to - from) / 2);
        const slab = box(chord * 1.08, side.drop, 0.05, s.hairShade);
        // Hung from a fixed hairline rather than centred on one, so
        // `fringeDrop` reads as "how far down the face it comes" and a short
        // fringe stays clear of the eyes.
        slab.position.set(
          Math.sin(mid) * surface,
          centre + r * 0.75 - side.drop / 2,
          -Math.cos(mid) * surface,
        );
        slab.rotation.y = Math.PI - mid;
        slab.rotation.x = 0.08;
        hair.add(slab);
      }
    }

    // 4. Side locks framing the face.
    const lockLengths = [
      s.sideLockLength * (1 + s.sideLockAsym),
      s.sideLockLength * (1 - s.sideLockAsym),
    ];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const length = lockLengths[i] ?? 0;
      if (length < 0.02) continue;
      const lock = cone(r * 0.3, r * 0.14, length, s.hair, 5);
      lock.position.set(side * r * 0.9, centre - length * 0.35, -r * 0.08);
      lock.rotation.z = side * 0.1;
      hair.add(lock);
    }

    // 5. Tail. Two tapering segments chained so a single rotation on `hairTail`
    //    makes the whole thing arc rather than pivot like a stick.
    hairTail.position.set(0, centre + r * s.tailAnchorY, r * 0.82);
    hairTail.rotation.x = s.tailTilt;
    if (s.tailLength < 0.02) return;

    const tie = cone(s.tailThickness * 1.15, s.tailThickness * 1.15, 0.04, s.hairTie, 6);
    hairTail.add(tie);

    const upperLength = s.tailLength * 0.55;
    const upper = cone(s.tailThickness, s.tailThickness * 0.8, upperLength, s.hair, 6);
    upper.position.y = -upperLength / 2;
    hairTail.add(upper);

    const lowerJoint = new THREE.Group();
    lowerJoint.name = "tailLower";
    lowerJoint.position.y = -upperLength;
    lowerJoint.rotation.x = 0.25;
    hairTail.add(lowerJoint);

    const lowerLength = s.tailLength * 0.5;
    const lower = cone(
      s.tailThickness * 0.8,
      s.tailThickness * 0.22,
      lowerLength,
      s.hair,
      6,
    );
    lower.position.y = -lowerLength / 2;
    lowerJoint.add(lower);
  }

  private buildGoggles(head: THREE.Group, centre: number, s: RigSpec): void {
    const r = s.headRadius;
    const y = centre + r * 0.55;
    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.02, 0.026, 4, 10),
      flatMaterial(palette.metalDark),
    );
    strap.rotation.x = Math.PI / 2 - 0.22;
    strap.position.y = y;
    strap.castShadow = true;
    head.add(strap);

    for (const side of [-1, 1] as const) {
      const lens = cone(0.058, 0.048, 0.045, s.gogglesColor, 6);
      lens.rotation.x = Math.PI / 2 + 0.28;
      lens.position.set(side * r * 0.38, y + 0.02, -r * 0.9);
      head.add(lens);
    }
  }

  /** A hidden group holding a single ball. Doubles as a prop mount point. */
  private buildOrb(
    name: string,
    x: number,
    y: number,
    z: number,
    radius: number,
    color: number,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, y, z);
    group.visible = false;
    group.add(sphere(radius, color, 6, 4));
    return group;
  }

  private captureRest(): void {
    for (const joint of Object.values(this.joints)) {
      this.rest.push({
        joint,
        position: joint.position.clone(),
        quaternion: joint.quaternion.clone(),
        scale: joint.scale.clone(),
        visible: joint.visible,
      });
    }
  }
}

/** A captured pose, used for blending between animations. */
export type Pose = Array<{
  joint: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}>;
