import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * Style test for the new look. Scratch file, not part of the game.
 *
 * Round primitives, a toon ramp, inverted-hull outlines, and a warm indoor
 * grade. The three switches at the top turn the shading layers off one at a
 * time so each can still be judged on its own.
 *
 * Open at /demo/style-compare.html with `npm run dev`.
 */

// --- Palette ---------------------------------------------------------------
const C = {
  floor: 0xc9a882,
  floorPlank: 0xbb9873,
  wall: 0xe8ded0,
  woodDark: 0x6b4f3a,
  woodMid: 0x8a6a4c,
  metal: 0x8f96a3,
  metalDark: 0x5a606b,
  rug: 0x6f9b8c,
  leaf: 0x5c9e5a,
  pot: 0xc0765a,
  skin: 0xf0cdaa,
  suit: 0x24242c,
  charcoal: 0x33333d,
  white: 0xe9e9ef,
  hair: 0x5b3d2b,
  lampShade: 0xffc47a,
  gsdTan: 0xc98f4e,
  gsdTanLight: 0xe0b479,
  gsdBlack: 0x2b2419,
  collieBlack: 0x2f2b33,
  dogNose: 0x2b2b33,
  mint: 0x7fd9c0,
  chickFeather: 0xf5d873,
  chickWing: 0xe9c552,
  chickBeak: 0xef9d3c,
  chickComb: 0xdf4b3f,
  black: 0x111118,
};

/**
 * Everything that separates one dog from another.
 *
 * The two are meant to be told apart across the room, so the differences are
 * pushed well past what a photo would support: the shepherd is big, tan,
 * black-saddled, long-muzzled and sharp-eared with a heavy low tail; the collie
 * is small, black-and-white, round-headed, with folded ear tips and a white
 * blaze. Size, colour, ear and muzzle all disagree -- any one of them alone is
 * too subtle at eighty pixels tall.
 */
const BREEDS = {
  /** Heath: German shepherd. */
  shepherd: {
    fur: C.gsdTan,
    under: C.gsdTanLight,
    sock: C.gsdTanLight,
    muzzle: C.gsdBlack,
    saddle: C.gsdBlack,
    scale: 1.12,
    bodyStretch: [0.9, 0.82, 1.4],
    headScale: 0.95,
    muzzleLength: 1.45,
    ruff: 0.115,
    ruffStretch: [1, 1.05, 0.8],
    // Tall, wide-based, standing straight up. `y` sits the base *on* the skull
    // at this x, not at the top of it -- a shared height for both ears leaves
    // them hovering over the curve, which is what made them look glued on.
    // Comes to a point, and the base is set low on the side of the skull rather
    // than perched on top of it -- an ear that starts at the crown reads as a
    // party hat, not as an ear.
    ear: { kind: "prick", length: 0.3, width: 0.15, thickness: 0.05, tilt: 0.16, spread: 0.104, y: 0.028 },
    blaze: false,
    // Character's own left / right: a rig faces -Z, so its left is -X.
    eyeLeft: C.black,
    eyeRight: C.black,
    leg: { top: 0.058, bottom: 0.052, height: 0.2, y: 0.105, spread: 0.105 },
    // A lazy sweep up and back rather than a tight curl -- a shepherd's tail is
    // heavy. `from` starts the sweep pointing up-and-back; walking `to` down
    // past it turns the tip forward over the rump.
    tail: {
      y: 0.3,
      z: 0.2,
      from: 0.55,
      curl: -2.3,
      length: 0.42,
      tighten: 0.35,
      radius: 0.038,
      // Pinched at the rump, brush across the first half, point at the end.
      profile: [0.6, 0.92, 1.0, 0.97, 0.86, 0.7, 0.52, 0.34, 0.18],
      // Dense enough that consecutive balls overlap by most of their radius,
      // which is what turns a row of beads into one smooth tube.
      beads: 26,
      tip: null,
    },
  },
  /** Honglu: border collie. */
  collie: {
    fur: C.collieBlack,
    under: C.white,
    sock: C.white,
    muzzle: C.white,
    saddle: null,
    scale: 0.92,
    bodyStretch: [0.88, 0.9, 1.14],
    headScale: 1.08,
    muzzleLength: 1.1,
    ruff: 0.14,
    ruffStretch: [0.72, 1.1, 0.85],
    // A standing plate with a wider plate folded forward over it: the
    // semi-prick ear. Shorter and broader than the shepherd's.
    ear: { kind: "semi", length: 0.19, width: 0.14, thickness: 0.045, tilt: 0.3, spread: 0.088, y: 0.098 },
    blaze: true,
    eyeLeft: C.mint,
    eyeRight: C.black,
    leg: { top: 0.055, bottom: 0.05, height: 0.15, y: 0.082, spread: 0.098 },
    // Tighter and perkier than the shepherd's, with the white tip collies are
    // known for landing right at the top of the curl.
    tail: {
      y: 0.28,
      z: 0.17,
      from: 0.45,
      curl: -3.2,
      length: 0.38,
      tighten: 0.45,
      radius: 0.062,
      // Fuller than the shepherd's for longer, then a quick point -- a collie
      // tail is mostly feathering.
      profile: [0.58, 0.9, 1.0, 1.0, 0.92, 0.78, 0.58, 0.36, 0.2],
      // Dense enough that consecutive balls overlap by most of their radius,
      // which is what turns a row of beads into one smooth tube.
      beads: 26,
      tip: C.white,
    },
  },
};

// ---------------------------------------------------------------------------
// Material layer
// ---------------------------------------------------------------------------

/**
 * A toon ramp: a few grey steps sampled with NEAREST, so lighting lands in
 * hard bands instead of a smooth falloff.
 *
 * Flat shading gives every facet its own brightness, so a faceted ball becomes
 * visual noise. A ramp collapses that same ball into two or three clean shapes
 * -- which is what lets a round silhouette actually read as round, and why the
 * ramp and a higher-poly mesh have to arrive together.
 */
function gradientMap(steps) {
  const texture = new THREE.DataTexture(new Uint8Array(steps), steps.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

// Three bands: shadow, mid, light. Four drifts back toward smooth shading; two
// reads as a hard cut-out. The dark step is warm rather than neutral -- a grey
// shadow in a warm room is the fastest way to make it feel cold.
const RAMP = gradientMap([78, 172, 255]);

const caches = { flat: new Map(), toon: new Map() };

function material(shading, color) {
  const cache = caches[shading];
  const existing = cache.get(color);
  if (existing) return existing;
  const made =
    shading === "toon"
      ? new THREE.MeshToonMaterial({ color, gradientMap: RAMP })
      : new THREE.MeshLambertMaterial({ color, flatShading: true });
  cache.set(color, made);
  return made;
}

/**
 * Inverted-hull outline: a second copy of the mesh grown along its normals,
 * drawn back-faces-only in a dark colour so it peeks out as a rim.
 *
 * The copy is welded and re-normalled first. Without that a box's corner
 * normals point three different ways and the hull splits open at every corner
 * -- the classic broken-outline look.
 */
const outlineMaterials = new Map();

function outlineMaterial(thickness) {
  const existing = outlineMaterials.get(thickness);
  if (existing) return existing;
  const made = new THREE.ShaderMaterial({
    uniforms: {
      thickness: { value: thickness },
      // Warm near-black. A neutral black rim on warm wood looks like ink on
      // the wrong paper.
      tint: { value: new THREE.Color(0x30241c) },
    },
    vertexShader: `
      uniform float thickness;
      void main() {
        vec3 grown = position + normal * thickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(grown, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 tint;
      void main() { gl_FragColor = vec4(tint, 1.0); }
    `,
    side: THREE.BackSide,
  });
  outlineMaterials.set(thickness, made);
  return made;
}

function addOutline(mesh, thickness) {
  const welded = mergeVertices(mesh.geometry.clone(), 1e-4);
  welded.computeVertexNormals();
  const hull = new THREE.Mesh(welded, outlineMaterial(thickness));
  hull.castShadow = false;
  hull.receiveShadow = false;
  mesh.add(hull);
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/**
 * A flat trapezoid plate -- wide at the base, narrow at the top.
 *
 * `CylinderGeometry` with four radial segments is a tapered box; turning it an
 * eighth of a turn puts the flats on the axes, and squashing z leaves a plate.
 * This is the ear shape from the reference models: a hard-edged trapezoid, not
 * a cone. A cone comes to a point and reads as a horn.
 */
function trapezoid(topWidth, bottomWidth, height, thickness) {
  const geometry = new THREE.CylinderGeometry(
    (topWidth / 2) * Math.SQRT2,
    (bottomWidth / 2) * Math.SQRT2,
    height,
    4,
    1,
  );
  geometry.rotateY(Math.PI / 4);
  geometry.scale(1, 1, thickness / (bottomWidth || 1));
  return geometry;
}

/** Build a mesh, place it, and rim it when the options ask for one. */
function put(ctx, parent, geometry, color, x, y, z, options = {}) {
  const mesh = new THREE.Mesh(geometry, material(ctx.shading, color));
  mesh.position.set(x, y, z);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  if (ctx.outline && options.outline !== false) {
    addOutline(mesh, options.thickness ?? ctx.thickness);
  }
  return mesh;
}

// ---------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------

/**
 * The face, painted into a canvas and mapped onto a cap of the head.
 *
 * Eyes, glints and blush have no thickness -- they are markings on a surface --
 * and modelling them as little balls in front of the skull is exactly why a
 * glint drifts off its eye as soon as the camera moves off axis. One texture
 * instead: no parallax, no z-fighting, one draw call, and the expression
 * becomes something you can draw rather than something you position.
 *
 * The cap is a slice of a sphere at the same centre and a hair more radius, so
 * it lies on the head at every angle. Its UVs run 0..1 across the slice, so the
 * canvas *is* the face -- no equirect maths.
 */
function faceTexture(spec) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 192;
  const g = canvas.getContext("2d");

  const hex = (value) => `#${value.toString(16).padStart(6, "0")}`;
  const ellipse = (u, v, rx, ry, color, alpha = 1) => {
    g.save();
    g.globalAlpha = alpha;
    g.beginPath();
    g.ellipse(u * canvas.width, v * canvas.height, rx * canvas.width, ry * canvas.height, 0, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    g.restore();
  };

  // Blush first, so an eye drawn over it wins.
  if (spec.blush) {
    for (const side of [-1, 1]) {
      ellipse(0.5 + side * spec.blush.x, spec.blush.y, spec.blush.rx, spec.blush.ry, hex(spec.blush.color), 0.5);
    }
  }

  for (const side of [-1, 1]) {
    // u grows toward -X across the cap, which is the creature's own left, so
    // the left eye is the one at +side. This is the bit that silently mirrors
    // heterochromia if you get it wrong.
    const color = side > 0 ? spec.eyeLeft : spec.eyeRight;
    const u = 0.5 + side * spec.eye.x;
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
 * Lay a painted face onto a head. `phi = 3pi/2` is where -Z lands on a
 * three.js sphere, which is the direction a rig faces, so the cap centres
 * there.
 */
function addFace(ctx, head, radius, spec) {
  const width = spec.width ?? 1.5;
  const height = spec.height ?? 1.15;
  const geometry = new THREE.SphereGeometry(
    radius * 1.008,
    28,
    20,
    Math.PI * 1.5 - width / 2,
    width,
    Math.PI / 2 - height / 2 + (spec.lift ?? 0),
    height,
  );
  const Klass = ctx.shading === "toon" ? THREE.MeshToonMaterial : THREE.MeshLambertMaterial;
  const faceMaterial = new Klass({
    map: faceTexture(spec),
    transparent: true,
    // Discard the unpainted canvas so the head's own colour shows through
    // rather than a wash over the whole cap.
    alphaTest: 0.5,
    ...(ctx.shading === "toon" ? { gradientMap: RAMP } : {}),
  });
  const face = new THREE.Mesh(geometry, faceMaterial);
  face.castShadow = false;
  face.receiveShadow = false;
  head.add(face);
  return face;
}

// ---------------------------------------------------------------------------
// Room and props
// ---------------------------------------------------------------------------

function buildRoom(ctx, root) {
  const plain = { castShadow: false, outline: false };
  put(ctx, root, box(7, 0.2, 6), C.floor, 0, -0.1, 0, plain);
  for (let i = -2; i <= 2; i += 1) {
    put(ctx, root, box(7, 0.01, 0.05), C.floorPlank, 0, 0.005, i * 1.1, plain);
  }
  put(ctx, root, box(7, 2.6, 0.2), C.wall, 0, 1.3, -3, plain);
  put(ctx, root, box(0.2, 2.6, 6), C.wall, -3.5, 1.3, 0, plain);
  put(ctx, root, box(3.2, 0.04, 2.3), C.rug, 0.6, 0.02, 0.9, plain);
}

function buildDesk(ctx, root, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  root.add(g);
  put(ctx, g, box(1.6, 0.08, 0.9), C.woodDark, 0, 0.76, 0);
  put(ctx, g, box(0.9, 0.02, 0.55), C.charcoal, 0, 0.81, 0.02, { outline: false });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      put(ctx, g, box(0.09, 0.74, 0.09), C.woodMid, sx * 0.7, 0.37, sz * 0.36);
    }
  }
  put(ctx, g, box(0.44, 0.07, 0.44), C.woodMid, 0, 0.44, 0.75);
  put(ctx, g, box(0.44, 0.5, 0.07), C.woodMid, 0, 0.72, 0.95);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      put(ctx, g, box(0.06, 0.42, 0.06), C.woodDark, sx * 0.17, 0.21, 0.75 + sz * 0.17);
    }
  }

  // Desk lamp. Its warm pool of light is most of what makes the room read as
  // somewhere you would want to sit.
  put(ctx, g, new THREE.CylinderGeometry(0.09, 0.11, 0.03, 10), C.metalDark, 0.6, 0.81, -0.2);
  put(ctx, g, new THREE.CylinderGeometry(0.015, 0.015, 0.26, 8), C.metalDark, 0.6, 0.94, -0.2);
  const shade = put(ctx, g, new THREE.CylinderGeometry(0.05, 0.13, 0.14, 10), C.lampShade, 0.6, 1.09, -0.2);
  shade.material = new THREE.MeshBasicMaterial({ color: C.lampShade });
}

function buildCabinet(ctx, root, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  root.add(g);
  put(ctx, g, box(0.62, 1.25, 0.5), C.metal, 0, 0.63, 0);
  for (const y of [0.3, 0.65, 1.0]) {
    put(ctx, g, box(0.5, 0.28, 0.03), C.metalDark, 0, y, -0.26, { thickness: 0.005 });
  }
}

/**
 * A potted plant out of icosahedra.
 *
 * The cheapest demonstration of the shape rule: a cube of leaves reads as
 * Minecraft, a faceted ball of leaves reads as clay.
 */
function buildPlant(ctx, root, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  root.add(g);
  put(ctx, g, new THREE.CylinderGeometry(0.17, 0.13, 0.26, 10), C.pot, 0, 0.13, 0);
  for (const [bx, by, bz, r] of [
    [0, 0.46, 0, 0.22],
    [0.15, 0.62, 0.05, 0.16],
    [-0.13, 0.58, -0.06, 0.14],
    [0.02, 0.74, -0.02, 0.12],
  ]) {
    put(ctx, g, new THREE.IcosahedronGeometry(r, 0), C.leaf, bx, by, bz);
  }
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

/**
 * The human, silhouette untouched: cone body, ball head, hair shell.
 *
 * The only change is tessellation. The game builds the head at 8x5, which under
 * flat shading is a faceted lump -- fine when every facet is a different value,
 * wrong once the ramp collapses them into bands. Under a ramp a rounder mesh
 * costs nothing and finally reads as a ball.
 */
function buildHuman(ctx, root, x, z, yaw) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  root.add(g);

  put(ctx, g, new THREE.CylinderGeometry(0.06, 0.24, 0.62, 8), C.suit, 0, 0.31, 0);
  put(ctx, g, new THREE.CylinderGeometry(0.24, 0.255, 0.05, 8), C.charcoal, 0, 0.025, 0);
  put(ctx, g, new THREE.CylinderGeometry(0.057, 0.114, 0.05, 8), C.white, 0, 0.59, 0);
  put(ctx, g, new THREE.SphereGeometry(0.235, 16, 12), C.skin, 0, 0.84, 0);

  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.251, 16, 12, 0, Math.PI * 2, 0, 1.05),
    material(ctx.shading, C.hair),
  );
  crown.position.y = 0.84;
  crown.castShadow = true;
  g.add(crown);
  if (ctx.outline) addOutline(crown, ctx.thickness);

  const face = new THREE.Group();
  face.position.y = 0.84;
  g.add(face);
  addFace(ctx, face, 0.235, {
    eyeLeft: C.black,
    eyeRight: C.black,
    eye: { x: 0.155, y: 0.44, rx: 0.052, ry: 0.1 },
    blush: { x: 0.28, y: 0.62, rx: 0.075, ry: 0.045, color: 0xd9a97f },
    width: 1.45,
    height: 1.1,
    lift: -0.02,
  });
}

/**
 * An ear, built on a pivot at its base rather than as a cone floating at head
 * height.
 *
 * Cone geometry is centred on its own middle, so rotating one to fold it swings
 * the whole thing around its waist and the tip lands somewhere unrelated to the
 * ear. Every segment here hangs off a group placed where the joint actually is,
 * with the mesh pushed half its length up so it grows *out* of that joint. Same
 * fix the tail needs, and the reason the first collie ear looked broken.
 */
function addEar(ctx, head, breed, side) {
  const spec = breed.ear;

  const root = new THREE.Group();
  root.position.set(side * spec.spread, spec.y, 0.015);
  root.rotation.z = side * spec.tilt;
  root.rotation.x = 0.12;
  head.add(root);

  // Both ears are trapezoid plates, taken from the reference models. The
  // shepherd's is one tall plate narrowing to a near-point; the collie's is a
  // short plate with a second, wider plate hinged forward over it. A folded
  // trapezoid keeps a flat top edge, which is what makes it read as a flap of
  // skin -- fold a cone and the two points meeting look like a beak.
  const standing = spec.kind === "semi" ? spec.length * 0.55 : spec.length;
  const tip = spec.kind === "semi" ? spec.width * 0.85 : spec.width * 0.02;
  put(
    ctx,
    root,
    trapezoid(tip, spec.width, standing, spec.thickness),
    breed.fur,
    0,
    standing / 2,
    0,
  );

  if (spec.kind === "prick") {
    // Pale inner ear. Only the shepherd gets one -- the collie's fold covers
    // its own inside, so a pale surface there would just be a wrong-coloured
    // stripe along the fold.
    put(
      ctx,
      root,
      trapezoid(spec.width * 0.12, spec.width * 0.62, standing * 0.7, spec.thickness * 0.5),
      breed.under,
      0,
      standing * 0.4,
      -spec.thickness * 0.45,
      { outline: false },
    );
    return;
  }

  // The fold: hinged at the top edge of the standing plate and dropped forward,
  // slightly wider than what it folds over so it overhangs instead of lining up.
  const fold = new THREE.Group();
  fold.position.y = standing;
  fold.rotation.x = -2.1;
  root.add(fold);
  put(
    ctx,
    fold,
    trapezoid(spec.width * 0.5, spec.width * 0.95, spec.length * 0.6, spec.thickness),
    breed.fur,
    0,
    spec.length * 0.3,
    0,
  );
}

/**
 * Read a thickness profile at `t`, lerping between its control values.
 *
 * A dog's tail is not a cone. The bone tapers, but the *fur* does not: it is
 * pinched where it leaves the rump, swells into a brush across the first third,
 * then falls away to a point. Straight root-to-tip taper is what made the last
 * version look like a carrot. A profile array says the shape out loud and takes
 * one number to argue with.
 */
function sampleProfile(profile, t) {
  const span = (profile.length - 1) * THREE.MathUtils.clamp(t, 0, 1);
  const index = Math.min(Math.floor(span), profile.length - 2);
  return THREE.MathUtils.lerp(profile[index], profile[index + 1], span - index);
}

/**
 * A tail as a string of overlapping balls along a spiral.
 *
 * Two earlier attempts failed for the same reason. One cone can only point in
 * one direction, so it reads as a dowel glued to the rump. A chain of jointed
 * cylinders bends, but every bend opens a wedge on its outer side, and the
 * balls patching those gaps make the whole thing look like plumbing.
 *
 * Beads have neither problem: overlapping spheres have no seam to open, the
 * taper is just a shrinking radius, and the curl is a formula rather than a
 * stack of rotations. It is also how the reference site draws its pig's curly
 * tail -- three spheres arcing back, nothing more.
 *
 * The spiral is walked in the YZ plane. `from`/`to` sweep the angle, and the
 * arm shortens as it goes, which is the difference between a curl and a plain
 * circle.
 */
function addTail(ctx, g, breed) {
  const spec = breed.tail;

  const root = new THREE.Group();
  root.position.set(0, spec.y, spec.z);
  g.add(root);

  // Walk the curve one step at a time rather than evaluating a circle. With a
  // circle, sweeping the angle downward moves *against* the tangent, so the
  // tail sets off in the opposite direction to the one the numbers suggest --
  // which is how the first attempt ended up drilling into the floor. Here
  // `heading` is the direction of travel itself: 0 is straight up, positive
  // leans back, and `curl` is the total turn from root to tip, negative
  // turning the tip forward over the rump.
  let y = 0;
  let z = 0;
  let heading = spec.from;
  const step = spec.length / (spec.beads - 1);
  const turn = spec.curl / (spec.beads - 1);

  for (let index = 0; index < spec.beads; index += 1) {
    const t = index / (spec.beads - 1);
    const radius = spec.radius * sampleProfile(spec.profile, t);
    // The last beads take the breed's tip colour, which is how a collie's
    // white tail tip lands at the end of the curl.
    const color = spec.tip && t > 0.82 ? spec.tip : breed.fur;
    put(ctx, root, new THREE.SphereGeometry(radius, 12, 9), color, 0, y, z, {
      // Rimming every bead draws a line between each pair of overlapping
      // balls. Only the tip needs a hull to hold the silhouette; rimming the
      // rest just turns the tail into corduroy.
      outline: index === spec.beads - 1,
    });

    // Steps shorten toward the tip, which is what makes it a curl tightening
    // to a point rather than a uniform arc.
    y += Math.cos(heading) * step * (1 - spec.tighten * t);
    z += Math.sin(heading) * step * (1 - spec.tighten * t);
    heading += turn;
  }
}

/**
 * A short leg.
 *
 * `CapsuleGeometry` rather than a cylinder: it comes with rounded ends, so the
 * knee reads soft and the paw does not need a separate ball welded to the
 * bottom. Same trick the reference site uses on its pig.
 */
function addLeg(ctx, g, breed, side, lz) {
  const spec = breed.leg;
  const leg = put(
    ctx,
    g,
    new THREE.CapsuleGeometry(spec.top, spec.height, 4, 10),
    breed.fur,
    side * spec.spread,
    spec.y,
    lz,
  );
  leg.rotation.x = lz < 0 ? 0.04 : -0.04;
  const paw = put(
    ctx,
    g,
    new THREE.SphereGeometry(spec.top * 1.15, 10, 8),
    breed.sock,
    side * spec.spread,
    spec.y - spec.height / 2,
    lz - 0.012,
    { outline: false },
  );
  paw.scale.set(1, 0.8, 1.2);
}

/**
 * A dog. `breed` carries everything that differs between the two, so they share
 * one body plan and argue only about size, colour, ears, muzzle and markings.
 */
function buildDog(ctx, root, breed, x, z, yaw) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  g.scale.setScalar(breed.scale);
  root.add(g);

  const bodyY = 0.28;

  const torso = put(ctx, g, new THREE.IcosahedronGeometry(0.2, 1), breed.fur, 0, bodyY, 0.02);
  torso.scale.set(...breed.bodyStretch);

  // The shepherd's saddle: a dark shell over the back only. It says "German
  // shepherd" before the ears get a chance to.
  if (breed.saddle) {
    const saddle = put(ctx, g, new THREE.SphereGeometry(0.19, 12, 9), breed.saddle, 0, bodyY + 0.04, 0.06, {
      outline: false,
    });
    saddle.scale.set(0.88, 0.7, 1.34);
  }

  const chest = put(ctx, g, new THREE.SphereGeometry(breed.ruff, 12, 9), breed.sock, 0, bodyY - 0.02, -0.16, {
    outline: false,
  });
  chest.scale.set(...breed.ruffStretch);

  for (const side of [-1, 1]) {
    for (const lz of [-0.11, 0.14]) addLeg(ctx, g, breed, side, lz);
  }

  const head = new THREE.Group();
  head.position.set(0, 0.5, -0.17);
  head.scale.setScalar(breed.headScale);
  g.add(head);

  const skull = put(ctx, head, new THREE.IcosahedronGeometry(0.16, 1), breed.fur, 0, 0, 0);
  skull.scale.set(1, 0.95, 0.95);

  // Collie blaze: a white stripe from brow to muzzle, the marking that makes
  // the breed readable in one glance.
  if (breed.blaze) {
    const blaze = put(ctx, head, new THREE.SphereGeometry(0.05, 10, 8), C.white, 0, 0.05, -0.115, {
      outline: false,
    });
    blaze.scale.set(0.7, 1.55, 0.62);
  }

  const muzzle = put(ctx, head, new THREE.SphereGeometry(0.082, 12, 9), breed.muzzle, 0, -0.05, -0.145);
  muzzle.scale.set(0.95, 0.78, breed.muzzleLength);
  put(ctx, head, new THREE.SphereGeometry(0.034, 8, 6), C.dogNose, 0, -0.028, -0.145 - 0.082 * breed.muzzleLength, {
    outline: false,
  });

  for (const side of [-1, 1]) addEar(ctx, head, breed, side);

  addFace(ctx, head, 0.16, {
    eyeLeft: breed.eyeLeft,
    eyeRight: breed.eyeRight,
    eye: { x: 0.185, y: 0.4, rx: 0.072, ry: 0.11 },
    width: 1.5,
    height: 1.15,
    lift: -0.05,
  });

  addTail(ctx, g, breed);
}

/**
 * Sinclair the chick. One plump egg with a beak on it.
 *
 * No neck, no legs to speak of, nothing sticking out but the beak, a comb and
 * two stubby feet. Everything is tucked tight against the egg, because the
 * silhouette *is* the character.
 */
function buildChick(ctx, root, x, z, yaw) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  root.add(g);

  const torso = put(ctx, g, new THREE.SphereGeometry(0.21, 14, 11), C.chickFeather, 0, 0.235, 0);
  torso.scale.set(1.02, 1.1, 0.96);

  const head = new THREE.Group();
  head.position.set(0, 0.4, -0.012);
  g.add(head);
  const skull = put(ctx, head, new THREE.SphereGeometry(0.16, 14, 11), C.chickFeather, 0, 0, 0);
  skull.scale.set(1, 0.97, 1);

  // Beak: short and blunt. Anything longer turns a chick into a bird of prey.
  const beak = put(ctx, head, new THREE.ConeGeometry(0.05, 0.085, 4), C.chickBeak, 0, -0.02, -0.155);
  beak.rotation.x = -Math.PI / 2;
  beak.rotation.y = Math.PI / 4;

  // Comb: three soft lobes rather than one hard slab, so it stays round.
  for (const [cx, cy, r] of [
    [-0.035, 0.15, 0.032],
    [0, 0.168, 0.04],
    [0.035, 0.15, 0.032],
  ]) {
    const lobe = put(ctx, head, new THREE.SphereGeometry(r, 8, 6), C.chickComb, cx, cy, -0.02, {
      outline: false,
    });
    lobe.scale.set(0.7, 1.25, 0.85);
  }

  addFace(ctx, head, 0.16, {
    eyeLeft: C.black,
    eyeRight: C.black,
    eye: { x: 0.2, y: 0.4, rx: 0.078, ry: 0.115 },
    blush: { x: 0.34, y: 0.6, rx: 0.085, ry: 0.055, color: 0xef9d3c },
    width: 1.6,
    height: 1.2,
    lift: -0.05,
  });

  for (const side of [-1, 1]) {
    const wing = put(ctx, g, new THREE.SphereGeometry(0.105, 12, 9), C.chickWing, side * 0.175, 0.235, -0.01);
    wing.scale.set(0.34, 1.02, 0.8);
    wing.rotation.z = side * 0.12;
  }

  for (const side of [-1, 1]) {
    const foot = put(ctx, g, new THREE.SphereGeometry(0.055, 8, 6), C.chickBeak, side * 0.07, 0.028, -0.03, {
      outline: false,
    });
    foot.scale.set(0.8, 0.5, 1.35);
  }

  const tail = put(ctx, g, new THREE.ConeGeometry(0.07, 0.13, 5), C.chickWing, 0, 0.31, 0.17);
  tail.scale.set(1, 1, 0.45);
  tail.rotation.x = -2.2;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

/**
 * Warm interior light.
 *
 * Three sources doing three jobs: a hemisphere that keeps shadows warm instead
 * of grey, one soft key from the window side for the shadow shapes, and a small
 * point light at the desk lamp that decays fast. The last one is what turns
 * "lit room" into "cosy room" -- a bright pool near the desk falling off into
 * a dimmer corner reads as somewhere lived in.
 */
function addLighting(scene) {
  // Low. Fill light is what kills contrast, and a toon ramp needs the dark
  // band to actually be reached or every object turns into one flat colour.
  scene.add(new THREE.HemisphereLight(0xffe0b8, 0x5a4634, 0.75));

  const key = new THREE.DirectionalLight(0xffe6bd, 1.7);
  // Across the room, not over the camera's shoulder. A key light behind the
  // viewer hides every shadow behind the thing that cast it, which is how the
  // first version of this demo managed to look shadowless.
  key.position.set(4.5, 6.5, -2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const d = 6;
  key.shadow.camera.left = -d;
  key.shadow.camera.right = d;
  key.shadow.camera.top = d;
  key.shadow.camera.bottom = -d;
  key.shadow.camera.far = 24;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key);

  const lamp = new THREE.PointLight(0xffb45f, 3.2, 3.4, 2);
  lamp.position.set(-1.3, 1.05, -1.8);
  scene.add(lamp);
}

function buildScene(ctx) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1f1c);
  // Just enough haze to keep the far corner from being as crisp as the
  // foreground. Any more and an indoor room starts to look foggy.
  scene.fog = new THREE.Fog(0x3a2b24, 11, 26);

  addLighting(scene);

  const root = new THREE.Group();
  scene.add(root);

  buildRoom(ctx, root);
  buildDesk(ctx, root, -1.9, -1.6);
  buildCabinet(ctx, root, -3.0, -0.5);
  buildPlant(ctx, root, 2.6, -2.2);

  buildHuman(ctx, root, -1.35, 0.55, 0.45);
  buildDog(ctx, root, BREEDS.shepherd, 0.4, -0.4, -0.35);
  buildDog(ctx, root, BREEDS.collie, 1.8, 0.6, 0.5);
  buildChick(ctx, root, 0.55, 1.4, 0.15);

  return scene;
}

/**
 * Colour grade: warm push, a little saturation and contrast, and a vignette.
 * Cheap, and it does more for "does this feel like a place" than any amount of
 * extra geometry.
 */
const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 1 } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, 1.16);
      color = (color - 0.5) * 1.05 + 0.5;
      // Warm the lights and let the shadows keep a little of the room's amber
      // rather than sliding blue.
      color *= mix(vec3(1.06, 1.0, 0.9), vec3(1.02, 1.0, 0.97), smoothstep(0.0, 0.7, luma));
      vec2 d = vUv - 0.5;
      color *= 1.0 - smoothstep(0.3, 0.85, dot(d, d) * 2.0) * 0.4;
      gl_FragColor = vec4(mix(texel.rgb, clamp(color, 0.0, 1.0), amount), texel.a);
    }
  `,
};

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

const view = { azimuth: Math.PI / 4, elevation: 0.5, distance: 6.2 };
const target = new THREE.Vector3(0, 0.6, -0.2);

const options = { ramp: true, outline: true, post: true, thickness: 0.008 };

const host = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
let scene = null;
let composer = null;

/**
 * Rebuild everything from `options`.
 *
 * Each switch changes geometry, materials or the pass chain, none of which can
 * be flipped on a live mesh without a pile of bookkeeping. The scene is a few
 * dozen meshes; rebuilding is instant and keeps every toggle honest.
 */
function rebuild() {
  scene?.traverse((object) => {
    if (object.isMesh) object.geometry.dispose();
  });

  scene = buildScene({
    shading: options.ramp ? "toon" : "flat",
    outline: options.outline,
    thickness: options.thickness,
  });

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  if (!options.post) {
    composer = null;
    return;
  }
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new BokehPass(scene, camera, { focus: view.distance, aperture: 0.00016, maxblur: 0.005 }),
  );
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.75, 0.9));
  composer.addPass(new ShaderPass(GRADE_SHADER));
  composer.addPass(new SMAAPass());
  composer.addPass(new OutputPass());
  composer.setSize(host.clientWidth || 1, host.clientHeight || 1);
}
rebuild();

const toggleBar = document.getElementById("toggles");
for (const [key, label] of [
  ["ramp", "Toon ramp"],
  ["outline", "描边"],
  ["post", "后期 + 暖调"],
]) {
  const button = document.createElement("button");
  button.textContent = label;
  button.classList.toggle("off", !options[key]);
  button.addEventListener("click", () => {
    options[key] = !options[key];
    rebuild();
    button.classList.toggle("off", !options[key]);
  });
  toggleBar.appendChild(button);
}

const thicknessInput = document.getElementById("thickness");
thicknessInput.addEventListener("input", () => {
  options.thickness = Number(thicknessInput.value) / 1000;
  document.getElementById("thicknessValue").textContent = options.thickness.toFixed(3);
  rebuild();
});

let dragging = false;
let lastX = 0;
let lastY = 0;

host.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  host.setPointerCapture(event.pointerId);
});
host.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  view.azimuth -= (event.clientX - lastX) * 0.006;
  view.elevation = THREE.MathUtils.clamp(
    view.elevation - (event.clientY - lastY) * 0.005,
    0.08,
    1.4,
  );
  lastX = event.clientX;
  lastY = event.clientY;
});
const endDrag = () => {
  dragging = false;
};
host.addEventListener("pointerup", endDrag);
host.addEventListener("pointercancel", endDrag);
host.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    view.distance = THREE.MathUtils.clamp(view.distance * (event.deltaY > 0 ? 1.08 : 0.92), 2.5, 20);
  },
  { passive: false },
);

function resize() {
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!width || !height) return;
  if (camera.aspect === width / height && renderer.domElement.clientWidth === width) return;
  renderer.setSize(width, height, false);
  composer?.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function frame() {
  requestAnimationFrame(frame);
  resize();
  const horizontal = Math.cos(view.elevation) * view.distance;
  camera.position.set(
    target.x + Math.sin(view.azimuth) * horizontal,
    target.y + Math.sin(view.elevation) * view.distance,
    target.z + Math.cos(view.azimuth) * horizontal,
  );
  camera.lookAt(target);
  if (composer) composer.render();
  else renderer.render(scene, camera);
}
frame();
