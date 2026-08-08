import * as THREE from "three";
import { palette } from "../world/palette";
import {
  cone,
  sphere,
  flatMaterial,
  flatMaterialDouble,
  cardMaterial,
  cardDepthMaterial,
  invisibleMaterial,
} from "../world/materials";
import { getTexture } from "./textures";
import {
  buildPiece,
  pieceColor,
  fringe,
  pair,
  DEFAULT_PIECE,
  type SurfacePiece,
} from "./SurfacePiece";

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

  // --- Hair mass ---
  /** How far down the front the crown reaches, radians from the top. */
  capDepth: number;
  /** How far down the back and sides reach, radians from the top. */
  backDepth: number;
  /** Angular size of the opening left for the face, radians. */
  faceGap: number;

  /**
   * Everything stuck to the surface of the head: fringe, side locks, eyes,
   * blush, brows. Each is an independently shaped and placed slab, editable
   * one by one in the rig tuner.
   */
  pieces: SurfacePiece[];

  // --- Ponytail ---
  tailLength: number;
  tailThickness: number;
  /** How high up the back of the skull the tail is tied, as a fraction of r. */
  tailAnchorY: number;
  /** How far the tail kicks backwards from straight down, radians. */
  tailTilt: number;

  // --- Limbs ---
  handRadius: number;

  goggles: boolean;

  // --- Colours ---
  skin: number;
  skinDark: number;
  eye: number;
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

  capDepth: 1.0,
  backDepth: 1.75,
  faceGap: 1.7,
  pieces: defaultPieces(),

  tailLength: 0.4,
  tailThickness: 0.075,
  tailAnchorY: 0.55,
  tailTilt: 0.5,

  handRadius: 0.062,

  goggles: false,

  skin: palette.skin,
  skinDark: palette.skinDark,
  eye: palette.suitBlack,
  hair: palette.heathHair,
  hairShade: palette.heathHair,
  hairTie: palette.suitCharcoal,
  body: palette.suitBlack,
  hem: palette.suitCharcoal,
  accent: palette.shirtWhite,
  boots: palette.bootBlack,
  gogglesColor: palette.sinclairGoggle,
};

/**
 * The starting face and fringe: two eyes, a centre-parted fringe, and a lock
 * either side. Profiles override this wholesale; the tuner edits it piece by
 * piece.
 */
export function defaultPieces(): SurfacePiece[] {
  return [
    // Eyes. `disc` with length < width gives the squashed almond that reads as
    // an eye at this size; a circle reads as a bug.
    ...pair({
      ...DEFAULT_PIECE,
      shape: "disc",
      color: "eye",
      azimuth: 0.34,
      elevation: 0.165,
      lift: 0.004,
      width: 0.07,
      length: 0.085,
      thickness: 0.012,
    }),
    // Blush.
    ...pair({
      ...DEFAULT_PIECE,
      shape: "disc",
      color: "skinDark",
      azimuth: 0.72,
      elevation: -0.17,
      lift: 0.003,
      width: 0.07,
      length: 0.05,
      thickness: 0.01,
    }),
    ...fringe({ from: -1.1, to: 1.1, count: 5, length: 0.16 }),
    // Side locks, hanging past the jaw.
    ...pair({
      ...DEFAULT_PIECE,
      shape: "lock",
      azimuth: 1.42,
      elevation: 0.18,
      width: 0.1,
      length: 0.2,
      taper: 0.4,
      pitch: 0.05,
    }),
  ];
}

/** Named joints an animation is allowed to drive. */
export interface RigJoints {
  bob: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  hair: THREE.Group;
  hairTail: THREE.Group;
  handL: THREE.Group;
  handR: THREE.Group;
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
  /** Index of the piece the tuner has selected, or -1. */
  private readonly highlight: number;

  constructor(spec: Partial<RigSpec> = {}, options: { highlight?: number } = {}) {
    this.spec = { ...DEFAULT_RIG_SPEC, ...spec };
    this.highlight = options.highlight ?? -1;
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

    // Surface pieces ride on the head, not on the hair group -- the hair group
    // swings, and eyes that swing with it look seasick.
    const pieceRoot = new THREE.Group();
    pieceRoot.name = "pieces";
    pieceRoot.position.y = centre;
    head.add(pieceRoot);
    s.pieces.forEach((piece, index) => {
      const texture = piece.texture ? getTexture(piece.texture) : undefined;
      // A piece can be invisible and still be selectable and editable, which is
      // how you scaffold a shape you only ever intend to paint.
      // An invisible material rather than `visible = false`, so the selection
      // outline -- which hangs off the mesh -- still draws.
      const material = texture
        ? cardMaterial(texture)
        : piece.color === "none"
          ? invisibleMaterial()
          : flatMaterial(pieceColor(piece.color, s));
      const node = buildPiece(piece, s.headRadius, material);

      if (texture) {
        node.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.customDepthMaterial = cardDepthMaterial(texture);
          }
        });
      }

      if (index === this.highlight) markHighlighted(node);
      pieceRoot.add(node);
    });

    const hair = new THREE.Group();
    hair.name = "hair";
    head.add(hair);
    const hairTail = new THREE.Group();
    hairTail.name = "hairTail";
    hair.add(hairTail);
    this.buildHair(hair, hairTail, centre, s);

    if (s.goggles) this.buildGoggles(head, centre, s);

    // --- Floating hands ----------------------------------------------------
    // Hidden at rest. Animations opt in, which is what makes "pop out a hand to
    // hold a mug" a two-line change rather than a rig change.
    //
    // No feet: orbs peeking out from under the cone read as debris rather than
    // as feet, and the hop already carries the walk on its own.
    const handY = s.bodyHeight * 0.6;
    const handX = s.bodyBottomRadius * 0.88;
    const handL = this.buildOrb("handL", -handX, handY, -0.04, s.handRadius, s.skin);
    const handR = this.buildOrb("handR", handX, handY, -0.04, s.handRadius, s.skin);
    bodyGroup.add(handL, handR);

    return { bob, body: bodyGroup, head, hair, hairTail, handL, handR };
  }

  /**
   * The hair *mass*: a crown, a back-and-sides shell with a wedge cut out for
   * the face, and the ponytail. Everything with a silhouette worth designing --
   * fringe, side locks -- is a surface piece instead, so it can be shaped and
   * placed one item at a time.
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

    // 3. Tail. Two tapering segments chained so a single rotation on `hairTail`
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

/**
 * Trace the selected piece's silhouette.
 *
 * `EdgesGeometry` rather than a wireframe: a wireframe draws every triangle
 * edge, which on an extruded outline is a mess of diagonals that hides the
 * shape you are trying to judge. This keeps only the feature edges. An overlay
 * rather than a swapped material, because you need to see the piece's real
 * colour while editing it, and `depthTest: false` so the outline stays visible
 * even where the piece is buried in the hair mass.
 */
function markHighlighted(node: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  node.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  for (const mesh of meshes) {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 20),
      new THREE.LineBasicMaterial({
        color: 0x7fe7ff,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }),
    );
    outline.renderOrder = 999;
    mesh.add(outline);
  }
}

/** A captured pose, used for blending between animations. */
export type Pose = Array<{
  joint: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}>;
