import * as THREE from "three";
import { palette } from "../world/palette";
import { cone, flatMaterial, sphere, TOON_RAMP } from "../world/materials";
import type { RigJoints, RigSpec } from "./Rig";

/**
 * Which creature a rig is. `none` is the human build.
 *
 * Three hand-authored bodies rather than a generic quadruped system: each is
 * about thirty primitives, and the charm is entirely in proportions nudged by
 * eye. A parameterised leg-and-snout generator would be more code and less cute.
 */
export type AnimalKind = "none" | "chick" | "shepherd" | "collie";

/**
 * Roughly how tall these stand, before `scale`. Close enough for name tags and
 * for the tuner's framing; not worth measuring per kind.
 */
export const ANIMAL_HEIGHT = 0.78;

/**
 * Everything that separates one animal from another and is *not* worth a
 * slider: colours, markings, ear style, body stretch.
 *
 * The numbers you actually want to argue with -- tail length, curl, angle, ear
 * size -- live on `RigSpec` instead, so the rig tuner drives them with the same
 * sliders it already uses for a human's ponytail and hair mass.
 */
interface Breed {
  fur: number;
  /** Belly and inner ear. */
  under: number;
  /** Chest bib, socks, tail tip. */
  sock: number;
  muzzle: number;
  /** Dark shell over the back, or null for none. */
  saddle: number | null;
  bodyStretch: [number, number, number];
  headScale: number;
  muzzleLength: number;
  ruff: number;
  ruffStretch: [number, number, number];
  earKind: "prick" | "semi";
  /** Outer ear, when it differs from the coat. */
  earFur: number;
  earThickness: number;
  earSpread: number;
  earBaseY: number;
  /** Dark cap over the top of the skull, or null. */
  headCap: number | null;
  /** White stripe from brow to muzzle. */
  blaze: boolean;
  /**
   * A chunk missing from one ear, or null. `-1` is the creature's own left.
   * Scars are per-character history, not per-breed -- see `docs/DESIGN.md`.
   */
  earNotch: -1 | 1 | null;
  /** From the creature's own point of view -- it faces -Z, so left is -X. */
  eyeLeft: number;
  eyeRight: number;
  leg: { top: number; height: number; y: number; spread: number };
  /** Bead radius across the tail, root to tip. Not a taper -- see `addTail`. */
  tailProfile: number[];
  /** Tail colour, when it differs from the coat. */
  tailFur: number;
  /** Pale tip on the last few beads, or null for a tail that stays one colour. */
  tailTip: number | null;
  /** A ring at the base of the tail, or null. */
  tailRing: number | null;
}

const BREEDS: Record<Exclude<AnimalKind, "none" | "chick">, Breed> = {
  /** Heath: German shepherd. Big, tan, black-saddled, sharp-eared. */
  shepherd: {
    fur: palette.gsdTan,
    under: palette.gsdTanLight,
    sock: palette.gsdTanLight,
    muzzle: palette.gsdBlack,
    saddle: palette.gsdBlack,
    bodyStretch: [0.9, 0.82, 1.4],
    headScale: 0.95,
    muzzleLength: 1.45,
    ruff: 0.115,
    ruffStretch: [1, 1.05, 0.8],
    earKind: "prick",
    // Black outside, tan inside.
    earFur: palette.gsdBlack,
    earThickness: 0.05,
    earSpread: 0.104,
    // Black skullcap, so the black ears grow out of a black head rather than
    // sprouting from solid tan.
    headCap: palette.gsdBlack,
    // Low on the side of the skull. An ear that starts at the crown reads as a
    // party hat rather than as an ear.
    earBaseY: 0.028,
    // Heath's left ear has a bite out of it.
    earNotch: -1,
    blaze: false,
    eyeLeft: palette.gsdEye,
    eyeRight: palette.gsdEye,
    leg: { top: 0.058, height: 0.2, y: 0.105, spread: 0.105 },
    tailProfile: [0.6, 0.92, 1.0, 0.97, 0.86, 0.7, 0.52, 0.34, 0.18],
    // Black tail and black rump: the saddle runs all the way off the back
    // rather than stopping at the hips.
    tailFur: palette.gsdBlack,
    tailTip: null,
    tailRing: null,
  },
  /** Honglu: border collie. Small, black and white, one mint eye. */
  collie: {
    fur: palette.collieBlack,
    under: palette.shirtWhite,
    sock: palette.shirtWhite,
    muzzle: palette.shirtWhite,
    saddle: null,
    bodyStretch: [0.88, 0.9, 1.14],
    headScale: 1.08,
    muzzleLength: 1.1,
    ruff: 0.14,
    ruffStretch: [0.72, 1.1, 0.85],
    earKind: "semi",
    earFur: palette.collieBlack,
    earThickness: 0.045,
    earSpread: 0.088,
    earBaseY: 0.098,
    headCap: null,
    earNotch: null,
    blaze: true,
    eyeLeft: palette.collieMint,
    eyeRight: palette.suitBlack,
    leg: { top: 0.055, height: 0.15, y: 0.082, spread: 0.098 },
    // Fuller for longer than the shepherd's, then a quick point: a collie tail
    // is mostly feathering.
    tailProfile: [0.58, 0.9, 1.0, 1.0, 0.92, 0.78, 0.58, 0.36, 0.2],
    tailFur: palette.collieBlack,
    tailTip: palette.shirtWhite,
    // A mint band at the root, picking up her eye. The only saturated thing on
    // an otherwise black-and-white dog, so it does not have to be large.
    tailRing: palette.collieMint,
  },
};

/**
 * Build a whole animal under `bob` and return the joints the animations drive.
 *
 * Nothing of the human rig is reused -- no cone body, no ball head, no surface
 * pieces. Only the *joint names* are shared, which is what lets the existing
 * walk and idle cycles drive these without a line of change:
 *
 * - `body`      the whole creature, for the breathing squash and the walk lean
 * - `head`      the skull, which lags the body
 * - `hair`      ears and comb, so they wobble with the head
 * - `hairTail`  the tail, on the joint that used to swing a ponytail
 * - `handL/R`   empty mounts, kept so props still have somewhere to go
 */
export interface AnimalRig {
  joints: Omit<RigJoints, "bob">;
  /** Hip pivots, front-left, front-right, back-left, back-right. Empty for a chick. */
  legs: THREE.Group[];
  /** Shoulder pivots for a chick's wings. Empty for the dogs. */
  wings: THREE.Group[];
}

export function buildAnimal(bob: THREE.Group, s: RigSpec): AnimalRig {
  const body = new THREE.Group();
  body.name = "body";
  bob.add(body);

  const head = new THREE.Group();
  head.name = "head";
  body.add(head);

  const hair = new THREE.Group();
  hair.name = "hair";
  head.add(hair);

  const hairTail = new THREE.Group();
  hairTail.name = "hairTail";
  body.add(hairTail);

  const legs: THREE.Group[] = [];
  const wings: THREE.Group[] = [];
  if (s.animal === "chick") wings.push(...buildChick(body, head, hair, hairTail, s));
  else if (s.animal !== "none") {
    legs.push(...buildDog(body, head, hair, hairTail, s, BREEDS[s.animal]));
  }

  // Empty on purpose: a floating hand orb belongs to the human design.
  const handL = new THREE.Group();
  handL.name = "handL";
  handL.visible = false;
  const handR = new THREE.Group();
  handR.name = "handR";
  handR.visible = false;
  body.add(handL, handR);

  return { joints: { body, head, hair, hairTail, handL, handR }, legs, wings };
}

// --- Faces -----------------------------------------------------------------

/**
 * The face, painted into a canvas and mapped onto a cap of the head.
 *
 * Eyes, glints and blush have no thickness -- they are markings on a surface --
 * and modelling them as little balls in front of the skull is exactly why a
 * glint drifts off its eye as soon as the camera moves off axis. One texture
 * instead: no parallax, no z-fighting, one draw call, and the expression is
 * something you draw rather than something you position.
 *
 * The cap is a slice of a sphere at the same centre and a hair more radius, so
 * it lies on the head at every angle. Its UVs run 0..1 across the slice, so the
 * canvas *is* the face -- no equirect maths.
 */
interface FaceSpec {
  eyeLeft: number;
  eyeRight: number;
  eye: { x: number; y: number; rx: number; ry: number };
  blush?: { x: number; y: number; rx: number; ry: number; color: number };
  /**
   * Ring each eye in near-black. Needed only where the coat behind the eye is
   * close to it in value; on a pale face it just makes the eye look drawn on.
   */
  rim?: boolean;
  width: number;
  height: number;
  lift: number;
}

function faceTexture(spec: FaceSpec): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 192;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("2d context unavailable");

  const hex = (value: number) => `#${value.toString(16).padStart(6, "0")}`;
  const ellipse = (
    u: number,
    v: number,
    rx: number,
    ry: number,
    color: string,
    alpha = 1,
  ) => {
    g.save();
    g.globalAlpha = alpha;
    g.beginPath();
    g.ellipse(
      u * canvas.width,
      v * canvas.height,
      rx * canvas.width,
      ry * canvas.height,
      0,
      0,
      Math.PI * 2,
    );
    g.fillStyle = color;
    g.fill();
    g.restore();
  };

  // Blush first, so an eye drawn over it wins.
  const blush = spec.blush;
  if (blush) {
    for (const side of [-1, 1]) {
      ellipse(0.5 + side * blush.x, blush.y, blush.rx, blush.ry, hex(blush.color), 0.5);
    }
  }

  for (const side of [-1, 1]) {
    // u grows toward -X across the cap, which is the creature's own left, so
    // the left eye is the one at +side. This is the bit that silently mirrors
    // heterochromia if you get it wrong.
    const color = side > 0 ? spec.eyeLeft : spec.eyeRight;
    const u = 0.5 + side * spec.eye.x;
    if (spec.rim) ellipse(u, spec.eye.y, spec.eye.rx * 1.28, spec.eye.ry * 1.22, "#181419");
    ellipse(u, spec.eye.y, spec.eye.rx, spec.eye.ry, hex(color));
    // Glint, up and inboard. Painted, so it can never leave the eye.
    ellipse(
      u - side * spec.eye.rx * 0.3,
      spec.eye.y - spec.eye.ry * 0.34,
      spec.eye.rx * 0.3,
      spec.eye.ry * 0.28,
      "#ffffff",
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Lay a painted face onto a head. `phi = 3pi/2` is where -Z lands on a three.js
 * sphere, which is the direction a rig faces, so the cap centres there.
 */
function addFace(head: THREE.Group, radius: number, spec: FaceSpec): void {
  const geometry = new THREE.SphereGeometry(
    radius * 1.008,
    28,
    20,
    Math.PI * 1.5 - spec.width / 2,
    spec.width,
    Math.PI / 2 - spec.height / 2 + spec.lift,
    spec.height,
  );
  const face = new THREE.Mesh(
    geometry,
    new THREE.MeshToonMaterial({
      map: faceTexture(spec),
      gradientMap: TOON_RAMP,
      transparent: true,
      // Discard the unpainted canvas so the head's own colour shows through
      // rather than a wash over the whole cap.
      alphaTest: 0.5,
    }),
  );
  face.castShadow = false;
  face.receiveShadow = false;
  face.userData["noOutline"] = true;
  head.add(face);
}

// --- Shared parts ----------------------------------------------------------

/**
 * A flat trapezoid plate -- wide at the base, narrow at the top -- optionally
 * with a small triangle bitten out of one edge.
 *
 * Extruded from a 2D outline rather than assembled from boxes. That is what
 * makes the notch a genuine cut: it is three points inserted into the outline,
 * so the ear stays one plate with one silhouette. The earlier attempt stacked
 * two offset plates to fake the same step, which left a seam straight down the
 * middle of the ear and could only ever make a rectangular chunk.
 *
 * `notch` is a side (-1 or 1); the bite lands on that edge, partway up.
 */
function earPlate(
  topWidth: number,
  bottomWidth: number,
  height: number,
  thickness: number,
  color: number,
  notch: -1 | 1 | null = null,
): THREE.Mesh {
  const corners: Array<[number, number]> = [
    [-bottomWidth / 2, 0],
    [bottomWidth / 2, 0],
    [topWidth / 2, height],
    [-topWidth / 2, height],
  ];

  const outline: Array<[number, number]> = [];
  for (let i = 0; i < corners.length; i += 1) {
    const from = corners[i]!;
    const to = corners[(i + 1) % corners.length]!;
    outline.push(from);

    // Only the outer edge of the requested side gets bitten: on the right edge
    // that is corner 1 -> 2, on the left it is 3 -> 0.
    const isNotchEdge = notch === 1 ? i === 1 : notch === -1 ? i === 3 : false;
    if (!isNotchEdge) continue;

    const at = (t: number): [number, number] => [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
    ];
    // Bite between 45% and 68% along the edge, cut in toward the middle of the
    // ear. Anything deeper starts to look like the ear is split in two.
    const lip = at(0.45);
    const heel = at(0.68);
    const inward = Math.sign(lip[0]) || 1;
    outline.push(lip, [(lip[0] + heel[0]) / 2 - inward * bottomWidth * 0.3, (lip[1] + heel[1]) / 2], heel);
  }

  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  // A small bevel rounds every edge where the front face meets the sides. It is
  // what stops a folded ear from looking like two pieces of cardboard taped
  // together: the join catches its own band of light instead of being a hard
  // seam. `bevelSize` is inset from the outline, so it also softens the corners.
  const bevel = Math.min(thickness * 0.32, bottomWidth * 0.12);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  // Extrusion grows along +Z from the outline; recentre it on the plate.
  geometry.translate(0, 0, -thickness / 2);

  const mesh = new THREE.Mesh(geometry, flatMaterial(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * An ear, built on a pivot at its base rather than as a plate floating at head
 * height.
 *
 * Cone and cylinder geometry is centred on its own middle, so rotating one to
 * fold it swings the whole thing around its waist and the tip lands somewhere
 * unrelated to the ear. Every segment here hangs off a group placed where the
 * joint actually is, with the mesh pushed half its length up so it grows *out*
 * of that joint.
 */
function addEar(hair: THREE.Group, breed: Breed, s: RigSpec, side: number): void {
  const root = new THREE.Group();
  root.position.set(side * breed.earSpread, breed.earBaseY, 0.015);
  root.rotation.z = side * s.earTilt;
  root.rotation.x = 0.12;
  hair.add(root);

  const semi = breed.earKind === "semi";
  const standing = semi ? s.earLength * 0.55 : s.earLength;
  // The shepherd's plate closes to a point; the collie's stays broad so the
  // fold has a flat top edge to hinge on.
  const tip = semi ? s.earWidth * 0.85 : s.earWidth * 0.02;

  // The bite goes on the outer edge, which is +side in the ear's own space.
  const notch = breed.earNotch === side ? ((side > 0 ? 1 : -1) as -1 | 1) : null;
  root.add(earPlate(tip, s.earWidth, standing, breed.earThickness, breed.earFur, notch));

  if (!semi) {
    // Pale inner ear, set into the front of the plate. The collie skips it --
    // its fold covers its own inside, so a pale surface there would just be a
    // wrong-coloured stripe along the crease.
    const inner = earPlate(
      s.earWidth * 0.12,
      s.earWidth * 0.6,
      standing * 0.72,
      breed.earThickness * 0.4,
      breed.under,
      notch,
    );
    inner.position.z = -breed.earThickness * 0.45;
    inner.userData["noOutline"] = true;
    root.add(inner);
    return;
  }

  // The fold: hinged at the top edge of the standing plate and dropped forward,
  // slightly wider than what it folds over so it overhangs instead of lining up.
  const fold = new THREE.Group();
  fold.position.y = standing;
  fold.rotation.x = -2.1;
  root.add(fold);

  fold.add(
    earPlate(
      s.earWidth * 0.5,
      s.earWidth * 0.95,
      s.earLength * 0.6,
      breed.earThickness,
      breed.earFur,
    ),
  );
}

/** Read a thickness profile at `t`, lerping between its control values. */
function sampleProfile(profile: number[], t: number): number {
  const span = (profile.length - 1) * THREE.MathUtils.clamp(t, 0, 1);
  const index = Math.min(Math.floor(span), profile.length - 2);
  return THREE.MathUtils.lerp(profile[index] ?? 1, profile[index + 1] ?? 1, span - index);
}

/** How many balls a tail is made of. Dense enough that they read as one tube. */
const TAIL_BEADS = 26;

/**
 * A tail as a string of overlapping balls along a curl.
 *
 * Two earlier shapes failed for the same reason. One cone can only point in one
 * direction, so it reads as a dowel glued to the rump. A chain of jointed
 * cylinders bends, but every bend opens a wedge on its outer side, and the balls
 * patching those gaps make the whole thing look like plumbing.
 *
 * Beads have neither problem: overlapping spheres have no seam to open, and the
 * curl is a walk rather than a stack of rotations. `tailTilt` is the starting
 * heading -- 0 points straight up, positive leans back -- and `tailCurl` is the
 * total turn from root to tip, negative turning the tip forward over the rump.
 * Walking the curve directly matters: parametrise it as a circle instead and
 * sweeping the angle downward moves *against* the tangent, so the tail sets off
 * in the opposite direction to the one the numbers suggest.
 *
 * The beads live directly under `hairTail`, so the joint the ponytail
 * animations already swing wags the whole tail from the rump.
 */
function addTail(hairTail: THREE.Group, breed: Breed, s: RigSpec): void {
  hairTail.position.set(0, s.bodyHeight * 0.42 + s.tailAnchorY * 0.1, 0.19);

  if (breed.tailRing !== null) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(s.tailThickness * 1.15, s.tailThickness * 0.34, 6, 12),
      flatMaterial(breed.tailRing),
    );
    ring.castShadow = true;
    // Torus lies in XY; turn it to face along the tail, which leaves at the
    // heading `tailTilt` points.
    ring.rotation.x = Math.PI / 2 - s.tailTilt;
    ring.position.set(0, s.tailThickness * 0.9, 0);
    hairTail.add(ring);
  }

  let y = 0;
  let z = 0;
  let heading = s.tailTilt;
  const step = s.tailLength / (TAIL_BEADS - 1);
  const turn = s.tailCurl / (TAIL_BEADS - 1);

  for (let index = 0; index < TAIL_BEADS; index += 1) {
    const t = index / (TAIL_BEADS - 1);
    // A dog's tail is not a cone. The bone tapers, but the fur does not: it is
    // pinched where it leaves the rump, swells into a brush across the first
    // third, then falls away to a point.
    const radius = s.tailThickness * sampleProfile(breed.tailProfile, t);
    const tip = breed.tailTip;
    const bead = sphere(radius, tip !== null && t > 0.82 ? tip : breed.tailFur, 12, 9);
    bead.position.set(0, y, z);
    // Rimming every bead draws a line between each pair of overlapping balls.
    // Only the tip needs a hull to hold the silhouette.
    if (index < TAIL_BEADS - 1) bead.userData["noOutline"] = true;
    hairTail.add(bead);

    // Steps shorten toward the tip, so the curl tightens to a point.
    const shrink = 1 - 0.4 * t;
    y += Math.cos(heading) * step * shrink;
    z += Math.sin(heading) * step * shrink;
    heading += turn;
  }
}

/**
 * A leg, hanging from a pivot at the hip.
 *
 * The pivot is what makes a walk possible: rotating it swings the whole limb
 * from the shoulder, where a leg actually turns. Meshes placed directly on the
 * body would have to be moved individually and would pivot around their own
 * middles.
 *
 * `CapsuleGeometry` rather than a cylinder, so the knee reads soft. Short is the
 * operative word -- a leg long enough to be anatomical puts daylight under the
 * body and the animal reads as a model of a dog; stubby legs with the belly near
 * the floor read as a toy.
 */
function addLeg(body: THREE.Group, breed: Breed, side: number, lz: number): THREE.Group {
  const spec = breed.leg;

  const hip = new THREE.Group();
  hip.name = "leg";
  hip.position.set(side * spec.spread, spec.y + spec.height / 2, lz);
  hip.rotation.x = lz < 0 ? 0.04 : -0.04;
  body.add(hip);

  const leg = new THREE.Mesh(
    new THREE.CapsuleGeometry(spec.top, spec.height, 4, 10),
    flatMaterial(breed.fur),
  );
  leg.castShadow = true;
  leg.receiveShadow = true;
  leg.position.y = -spec.height / 2;
  hip.add(leg);

  const paw = sphere(spec.top * 1.15, breed.sock, 10, 8);
  paw.position.set(0, -spec.height, -0.012);
  paw.scale.set(1, 0.8, 1.2);
  paw.userData["noOutline"] = true;
  hip.add(paw);

  return hip;
}

// --- Dogs ------------------------------------------------------------------

function buildDog(
  body: THREE.Group,
  head: THREE.Group,
  hair: THREE.Group,
  hairTail: THREE.Group,
  s: RigSpec,
  breed: Breed,
): THREE.Group[] {
  const bodyY = 0.28;

  // A sphere, not an icosahedron. An icosahedron's vertices do not line up with
  // the axes, so stretching one along z pulls the rump off to one side -- the
  // body looked subtly crooked and no amount of tweaking the saddle fixed it,
  // because the lopsidedness was in the torso underneath.
  const torso = sphere(0.2, breed.fur, 14, 11);
  torso.position.set(0, bodyY, 0.02);
  torso.scale.set(...breed.bodyStretch);
  body.add(torso);

  // The shepherd's saddle: a dark shell over the back. It runs off the rump
  // rather than stopping at the hips, so the black tail leaves a black body
  // instead of sprouting out of tan fur.
  if (breed.saddle !== null) {
    const saddle = sphere(0.2, breed.saddle, 12, 9);
    saddle.position.set(0, bodyY + 0.03, 0.09);
    saddle.scale.set(0.88, 0.76, 1.3);
    saddle.userData["noOutline"] = true;
    body.add(saddle);
  }

  const chest = sphere(breed.ruff, breed.sock, 12, 9);
  chest.position.set(0, bodyY - 0.02, -0.16);
  chest.scale.set(...breed.ruffStretch);
  chest.userData["noOutline"] = true;
  body.add(chest);

  // Front pair first, then back, left before right -- the order the walk cycle
  // assumes when it pairs them diagonally.
  const legs: THREE.Group[] = [];
  for (const lz of [-0.11, 0.14]) {
    for (const side of [-1, 1]) legs.push(addLeg(body, breed, side, lz));
  }

  head.position.set(0, 0.5, -0.17);
  head.scale.setScalar(breed.headScale);

  const skull = sphere(s.headRadius, breed.fur, 14, 11);
  skull.scale.set(1, 0.95, 0.95);
  head.add(skull);

  // The shepherd's black skullcap, reaching forward over the bridge so it joins
  // the dark muzzle instead of stopping at the brow.
  if (breed.headCap !== null) {
    const cap = sphere(s.headRadius * 0.98, breed.headCap, 12, 9);
    // Far enough forward to cover the brow, but stopping just short of the face
    // texture. An earlier version pushed it out to reach the muzzle and, being
    // a solid sphere, it came out *in front of* the face and buried the eyes --
    // which is where the violet kept disappearing to. Its front now sits about
    // a centimetre behind the painted face at every point.
    cap.position.set(0, 0.038, 0.005);
    cap.scale.set(0.95, 0.85, 0.99);
    cap.userData["noOutline"] = true;
    head.add(cap);
  }

  // Collie blaze: a white stripe from brow to muzzle, the marking that makes
  // the breed readable in one glance.
  if (breed.blaze) {
    const blaze = sphere(0.05, palette.shirtWhite, 10, 8);
    blaze.position.set(0, 0.05, -0.115);
    blaze.scale.set(0.7, 1.55, 0.62);
    blaze.userData["noOutline"] = true;
    head.add(blaze);
  }

  const muzzle = sphere(0.082, breed.muzzle, 12, 9);
  muzzle.position.set(0, -0.05, -0.145);
  muzzle.scale.set(0.95, 0.78, breed.muzzleLength);
  head.add(muzzle);

  const nose = sphere(0.034, palette.dogNose, 8, 6);
  nose.position.set(0, -0.028, -0.145 - 0.082 * breed.muzzleLength);
  nose.userData["noOutline"] = true;
  head.add(nose);

  for (const side of [-1, 1]) addEar(hair, breed, s, side);

  addFace(head, s.headRadius, {
    eyeLeft: breed.eyeLeft,
    eyeRight: breed.eyeRight,
    // Big. At the isometric camera's distance a realistically sized eye is
    // three pixels of dark, which is why the first pass looked blank-faced.
    eye: { x: 0.21, y: 0.4, rx: 0.115, ry: 0.155 },
    // Only the collie needs a rim: her eyes sit on black fur, and a dark eye
    // on a dark coat is nothing at all. The shepherd's face is tan.
    ...(breed.blaze ? { rim: true } : {}),
    width: 1.5,
    height: 1.15,
    lift: -0.05,
  });

  addTail(hairTail, breed, s);

  return legs;
}

// --- Chick -----------------------------------------------------------------

/**
 * Sinclair the chick. One plump egg with a beak on it.
 *
 * No neck, no legs to speak of, nothing sticking out but the beak, a comb and
 * two stubby feet. Everything is tucked tight against the egg, because the
 * silhouette *is* the character -- so this one ignores the breed table and the
 * tail machinery entirely.
 */
function buildChick(
  body: THREE.Group,
  head: THREE.Group,
  hair: THREE.Group,
  hairTail: THREE.Group,
  s: RigSpec,
): THREE.Group[] {
  // Longer front to back than it is wide, and a touch squat: a chick seen from
  // the side is an egg lying down, not standing up.
  const torso = sphere(0.21, palette.chickFeather, 14, 11);
  torso.position.y = 0.225;
  torso.scale.set(0.98, 0.96, 1.34);
  body.add(torso);

  head.position.set(0, 0.375, -0.06);
  const skull = sphere(s.headRadius, palette.chickFeather, 14, 11);
  skull.scale.set(1, 0.94, 1.05);
  head.add(skull);

  // Beak: short and blunt. Anything longer turns a chick into a bird of prey.
  const beak = cone(0, 0.05, 0.085, palette.chickBeak, 4);
  beak.rotation.x = -Math.PI / 2;
  beak.rotation.y = Math.PI / 4;
  beak.position.set(0, -0.02, -0.155);
  head.add(beak);

  // Comb: three soft lobes rather than one hard slab, so it stays round.
  for (const [cx, cy, r] of [
    [-0.035, 0.15, 0.032],
    [0, 0.168, 0.04],
    [0.035, 0.15, 0.032],
  ] as const) {
    const lobe = sphere(r, palette.chickComb, 8, 6);
    lobe.position.set(cx, cy, -0.02);
    lobe.scale.set(0.7, 1.25, 0.85);
    lobe.userData["noOutline"] = true;
    hair.add(lobe);
  }

  addFace(head, s.headRadius, {
    eyeLeft: palette.suitBlack,
    eyeRight: palette.suitBlack,
    // Bean eyes: tall ovals, flat black, no rim. Oversized on purpose -- the
    // chick is scale 0.6 and the face is only a painted cap, so dog-sized
    // numbers collapse to a couple of pixels in the isometric view.
    eye: { x: 0.2, y: 0.4, rx: 0.135, ry: 0.19 },
    blush: { x: 0.38, y: 0.63, rx: 0.09, ry: 0.055, color: palette.chickBeak },
    width: 1.6,
    height: 1.2,
    lift: -0.05,
  });

  // Wings hang off a shoulder pivot so the walk can flap them. Rotating the
  // mesh itself would spin it about its own middle and push the tip through
  // the body.
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.name = "wing";
    shoulder.position.set(side * 0.13, 0.3, 0.0);
    shoulder.rotation.z = side * 0.12;
    body.add(shoulder);
    wings.push(shoulder);

    const wing = sphere(0.105, palette.chickWing, 12, 9);
    wing.position.set(side * 0.042, -0.065, 0);
    wing.scale.set(0.32, 1.02, 1.05);
    shoulder.add(wing);

    const foot = sphere(0.055, palette.chickBeak, 8, 6);
    foot.position.set(side * 0.07, 0.028, -0.05);
    foot.scale.set(0.8, 0.5, 1.4);
    foot.userData["noOutline"] = true;
    body.add(foot);
  }

  // One upswept feather wedge, on the joint that used to swing a ponytail.
  hairTail.position.set(0, 0.31, 0.22);
  const tail = cone(0, 0.07, 0.13, palette.chickWing, 5);
  tail.scale.set(1, 1, 0.45);
  tail.rotation.x = -2.2;
  hairTail.add(tail);

  return wings;
}
