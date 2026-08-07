import * as THREE from "three";
import { palette } from "../world/palette";
import { cone, sphere, flatMaterial, flatMaterialDouble } from "../world/materials";

/**
 * Everything about how a character looks. Profiles supply one of these and
 * nothing else, so adding a character never means touching rig code.
 */
export interface RigSpec {
  /** Overall size multiplier. 1 gives a ~1.0 unit tall character. */
  scale: number;
  skin: number;
  hair: number;
  /** Main colour of the cone body. */
  body: number;
  /** Hem band around the bottom of the cone. */
  hem: number;
  /** Collar / scarf ring under the head. */
  accent: number;
  /** Colour of the little feet that pop out when walking. */
  boots: number;
  hairStyle: "ponytail" | "bob" | "spiky";
  /** Length of the ponytail, in local units. 0 disables it. */
  tailLength: number;
  /** Goggles pushed up on the forehead. */
  goggles: boolean;
  gogglesColor: number;
}

export const DEFAULT_RIG_SPEC: RigSpec = {
  scale: 1,
  skin: palette.skin,
  hair: palette.heathHair,
  body: palette.suitBlack,
  hem: palette.suitCharcoal,
  accent: palette.shirtWhite,
  boots: palette.bootBlack,
  hairStyle: "bob",
  tailLength: 0,
  goggles: false,
  gogglesColor: palette.sinclairGoggle,
};

/** Named joints an animation is allowed to drive. */
export interface RigJoints {
  /** Bounce and squash live here, above everything else. */
  bob: THREE.Group;
  /** The cone. Lean and sway go here. */
  body: THREE.Group;
  head: THREE.Group;
  /** Whole hair mass; small counter-rotations sell the head's weight. */
  hair: THREE.Group;
  /** Ponytail, swings behind. */
  hairTail: THREE.Group;
  /**
   * Floating orb hands. Hidden at rest -- an animation that needs hands sets
   * `visible = true` and positions them. Also usable as prop mount points.
   */
  handL: THREE.Group;
  handR: THREE.Group;
  /** Floating orb feet, same deal: they only appear while walking. */
  footL: THREE.Group;
  footR: THREE.Group;
}

/** One joint's rest state, captured at build time. */
interface RestTransform {
  joint: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  visible: boolean;
}

/**
 * A procedural low-poly character: a cone for a body, a ball for a head, and
 * limbs that only exist when an animation asks for them.
 *
 * Dropping jointed arms and legs is what makes this readable at 80 pixels tall.
 * There is no skinning to go wrong, the silhouette stays a clean triangle, and
 * all the character comes from the head -- which is why the hair gets far more
 * geometry than anything else here.
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

  private build(): RigJoints {
    const s = this.spec;
    this.root.scale.setScalar(s.scale);

    const bob = new THREE.Group();
    bob.name = "bob";
    this.root.add(bob);

    // --- Body ------------------------------------------------------------
    const bodyHeight = 0.52;
    const bodyGroup = new THREE.Group();
    bodyGroup.name = "body";
    bodyGroup.position.y = 0.02;
    bob.add(bodyGroup);

    const bodyMesh = cone(0.13, 0.31, bodyHeight, s.body);
    bodyMesh.position.y = bodyHeight / 2;
    bodyGroup.add(bodyMesh);

    // Hem band: a slightly wider, shorter cone slice at the base. Gives the
    // silhouette a foot to stand on instead of tapering into the floor.
    const hem = cone(0.30, 0.33, 0.07, s.hem);
    hem.position.y = 0.035;
    bodyGroup.add(hem);

    // Collar ring right under the head.
    const collar = cone(0.115, 0.17, 0.06, s.accent);
    collar.position.y = bodyHeight - 0.02;
    bodyGroup.add(collar);

    // --- Head ------------------------------------------------------------
    const head = new THREE.Group();
    head.name = "head";
    head.position.y = bodyHeight + 0.03;
    bodyGroup.add(head);

    const headRadius = 0.245;
    const headMesh = sphere(headRadius, s.skin, 12, 8);
    headMesh.position.y = headRadius * 0.88;
    head.add(headMesh);

    // Eyes: flat discs pressed onto the front of the ball (-Z is forward).
    for (const side of [-1, 1] as const) {
      const eye = new THREE.Mesh(
        new THREE.CircleGeometry(0.036, 8),
        flatMaterial(palette.suitBlack),
      );
      eye.position.set(side * 0.082, headRadius * 0.9, -headRadius * 0.93);
      eye.rotation.y = Math.PI;
      head.add(eye);
    }

    // Blush: the one warm accent on an otherwise dark character.
    for (const side of [-1, 1] as const) {
      const blush = new THREE.Mesh(
        new THREE.CircleGeometry(0.032, 7),
        flatMaterial(palette.skinDark),
      );
      blush.position.set(side * 0.155, headRadius * 0.72, -headRadius * 0.78);
      blush.rotation.y = Math.PI + side * 0.5;
      head.add(blush);
    }

    const hair = new THREE.Group();
    hair.name = "hair";
    head.add(hair);
    const hairTail = new THREE.Group();
    hairTail.name = "hairTail";
    hair.add(hairTail);
    this.buildHair(hair, hairTail, headRadius, s);

    if (s.goggles) this.buildGoggles(head, headRadius, s);

    // --- Floating limbs --------------------------------------------------
    // All four start hidden. Animations opt in, which is what makes "pop out a
    // hand to hold a mug" a two-line change rather than a rig change.
    const handL = this.buildOrb("handL", -0.27, 0.36, -0.04, 0.072, s.skin);
    const handR = this.buildOrb("handR", 0.27, 0.36, -0.04, 0.072, s.skin);
    bodyGroup.add(handL, handR);

    // Feet hang off `root`, not `bob`. That keeps them on the floor while the
    // body hops, which is what opens the gap you actually see them through.
    // Far enough forward to clear the flare of the cone -- tucked underneath
    // they are geometrically present but never visible.
    const footL = this.buildOrb("footL", -0.115, 0.055, -0.28, 0.055, s.boots);
    const footR = this.buildOrb("footR", 0.115, 0.055, -0.28, 0.055, s.boots);
    this.root.add(footL, footR);

    return { bob, body: bodyGroup, head, hair, hairTail, handL, handR, footL, footR };
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
    group.add(sphere(radius, color, 8, 6));
    return group;
  }

  /**
   * Hair gets the detail budget. Everything else on this rig is two primitives,
   * so the hair is the only place a silhouette can say which character this is
   * from across the room.
   */
  private buildHair(
    hair: THREE.Group,
    hairTail: THREE.Group,
    headRadius: number,
    s: RigSpec,
  ): void {
    const centre = headRadius * 0.88;

    // Hair shell in two pieces. A single dome cannot work: pull it low enough
    // to cover the back of the head and it swallows the face too, which is what
    // turns the character into a bowl.
    const shellRadius = headRadius * 1.07;

    // 1. Crown -- a full ring around the top of the skull.
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(shellRadius, 12, 8, 0, Math.PI * 2, 0, 0.95),
      flatMaterialDouble(s.hair),
    );
    crown.position.y = centre;
    crown.castShadow = true;
    hair.add(crown);

    // 2. Back and sides -- reaches below the ear, with a gap left open at the
    // front for the face. In three.js phi runs from -X, so the face at -Z sits
    // at phi = 3pi/2; the covered arc starts just past the far edge of the gap.
    const faceGap = s.hairStyle === "spiky" ? 1.9 : 1.55;
    const back = new THREE.Mesh(
      new THREE.SphereGeometry(
        shellRadius,
        12,
        8,
        Math.PI * 1.5 + faceGap / 2,
        Math.PI * 2 - faceGap,
        0.8,
        s.hairStyle === "spiky" ? 1.05 : 1.3,
      ),
      flatMaterialDouble(s.hair),
    );
    back.position.y = centre;
    back.castShadow = true;
    hair.add(back);

    // Fringe: a row of overlapping balls across the brow. Uneven radii keep it
    // from reading as a machined part.
    const fringeCount = s.hairStyle === "spiky" ? 5 : 6;
    for (let i = 0; i < fringeCount; i++) {
      const t = i / (fringeCount - 1);
      const angle = THREE.MathUtils.lerp(-1.15, 1.15, t);
      const radius = 0.055 + Math.cos(angle) * 0.028;
      const lock = sphere(radius, s.hair, 7, 5);
      lock.position.set(
        Math.sin(angle) * headRadius * 0.92,
        centre + headRadius * (s.hairStyle === "spiky" ? 0.5 : 0.34),
        -Math.cos(angle) * headRadius * 0.86,
      );
      hair.add(lock);
    }

    if (s.hairStyle === "spiky") {
      // Short and messy: a few tufts sticking up out of the cap.
      const tufts: Array<[number, number, number]> = [
        [-0.1, 0.2, -0.02],
        [0.06, 0.24, 0.04],
        [0.17, 0.16, -0.08],
        [-0.18, 0.15, 0.06],
      ];
      for (const [x, y, z] of tufts) {
        const tuft = cone(0.005, 0.055, 0.13, s.hair, 6);
        tuft.position.set(x, centre + headRadius * 0.72 + y * 0.35, z);
        tuft.rotation.set(z * 2.2, 0, -x * 2.4);
        hair.add(tuft);
      }
    } else {
      // Side locks framing the face, longer on the bob.
      const lockLength = s.hairStyle === "bob" ? 0.26 : 0.17;
      for (const side of [-1, 1] as const) {
        const lock = cone(0.07, 0.04, lockLength, s.hair, 6);
        lock.position.set(
          side * headRadius * 0.88,
          centre - lockLength * 0.35,
          -headRadius * 0.12,
        );
        lock.rotation.z = side * 0.12;
        hair.add(lock);
      }
    }

    if (s.hairStyle === "bob") {
      // Mass at the nape, which is what makes a bob a bob from behind.
      const nape = sphere(headRadius * 0.72, s.hair, 9, 6);
      nape.position.set(0, centre - headRadius * 0.42, headRadius * 0.52);
      nape.scale.set(1.05, 0.85, 0.75);
      hair.add(nape);
    } else {
      // Smaller version for the other two, so the skull cap does not end in a
      // hard rim halfway down the back of the head.
      const nape = sphere(headRadius * 0.55, s.hair, 8, 6);
      nape.position.set(0, centre - headRadius * 0.18, headRadius * 0.62);
      nape.scale.set(1.1, 0.9, 0.7);
      hair.add(nape);
    }

    // --- Ponytail --------------------------------------------------------
    hairTail.position.set(0, centre + headRadius * 0.55, headRadius * 0.78);
    if (s.tailLength <= 0) return;

    const tie = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.022, 5, 8),
      flatMaterial(s.hem),
    );
    tie.rotation.x = Math.PI / 2;
    tie.castShadow = true;
    hairTail.add(tie);

    // Chain of shrinking balls. Each one is parented to the last, so a single
    // rotation on `hairTail` makes the whole tail arc rather than pivot rigidly.
    const segments = 4;
    let parent: THREE.Object3D = hairTail;
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      const segment = new THREE.Group();
      segment.name = `tail${i}`;
      segment.position.y = i === 0 ? -0.04 : -(s.tailLength / segments);
      // Each link droops a little more than the one above it.
      segment.rotation.x = i === 0 ? -0.35 : 0.12;
      parent.add(segment);

      const ball = sphere(
        THREE.MathUtils.lerp(0.085, 0.042, t),
        s.hair,
        8,
        6,
      );
      ball.position.y = -(s.tailLength / segments) * 0.4;
      segment.add(ball);

      parent = segment;
    }
  }

  private buildGoggles(head: THREE.Group, headRadius: number, s: RigSpec): void {
    const y = headRadius * 1.28;
    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(headRadius * 0.98, 0.028, 5, 12),
      flatMaterial(palette.metalDark),
    );
    strap.rotation.x = Math.PI / 2 - 0.25;
    strap.position.y = y;
    strap.castShadow = true;
    head.add(strap);

    for (const side of [-1, 1] as const) {
      const lens = cone(0.062, 0.052, 0.05, s.gogglesColor, 8);
      lens.rotation.x = Math.PI / 2 + 0.3;
      lens.position.set(side * 0.085, y + 0.02, -headRadius * 0.88);
      head.add(lens);
    }
  }

  private captureRest(): void {
    const record = (joint: THREE.Object3D) => {
      this.rest.push({
        joint,
        position: joint.position.clone(),
        quaternion: joint.quaternion.clone(),
        scale: joint.scale.clone(),
        visible: joint.visible,
      });
    };
    for (const joint of Object.values(this.joints)) record(joint);
  }
}

/** A captured pose, used for blending between animations. */
export type Pose = Array<{
  joint: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}>;
