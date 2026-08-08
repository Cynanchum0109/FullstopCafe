import * as THREE from "three";
import type { RigSpec } from "./Rig";

/**
 * Outline presets. Each is a small 2D polygon that gets extruded to a thin
 * slab, so the whole vocabulary of hair shapes costs 3-5 vertices a piece.
 *
 * All of them except `disc` hang downward from an anchor at the top edge, which
 * is how hair actually behaves and makes `length` mean "how far down it comes".
 */
export type PieceShape =
  | "quad"
  | "wedge"
  | "triangle"
  | "lock"
  | "spike"
  | "disc";

/** Which colour from the rig spec a piece paints itself with. */
export type PieceColor =
  | "hair"
  | "hairShade"
  | "hairTie"
  | "skin"
  | "skinDark"
  | "eye"
  | "accent"
  | "body"
  | "hem";

export interface SurfacePiece {
  shape: PieceShape;
  color: PieceColor;

  // --- Placement on the head sphere ---
  /** Angle around the head. 0 is dead ahead, positive turns to the left. */
  azimuth: number;
  /** Angle up from the equator. Positive is toward the crown. */
  elevation: number;
  /** Extra distance out from the skull. Use to stack pieces in layers. */
  lift: number;

  // --- Outline ---
  width: number;
  length: number;
  /** Tip width as a fraction of `width`. 1 is a rectangle, 0 is a point. */
  taper: number;
  /** Sideways shift of the tip. This is what makes a fringe look swept. */
  skew: number;

  // --- Local orientation, applied after placement ---
  /** Roll in the plane of the slab. */
  bend: number;
  /** Lean the tip away from (or into) the skull. */
  pitch: number;
  /** Twist around the slab's own normal. */
  spin: number;

  thickness: number;
}

export const DEFAULT_PIECE: SurfacePiece = {
  shape: "wedge",
  color: "hair",
  azimuth: 0,
  elevation: 0.3,
  lift: 0,
  width: 0.12,
  length: 0.16,
  taper: 0.7,
  skew: 0,
  bend: 0,
  pitch: 0,
  spin: 0,
  thickness: 0.035,
};

/**
 * Build the 2D outline for a piece.
 *
 * Anchored at the origin with the piece hanging down -Y, so placement code
 * never has to think about where a shape's centre happens to be.
 */
function outline(piece: SurfacePiece): THREE.Shape {
  const shape = new THREE.Shape();
  const halfWidth = piece.width / 2;
  const tipHalf = halfWidth * piece.taper;
  const length = piece.length;
  const skew = piece.skew;

  switch (piece.shape) {
    case "disc": {
      // Ellipse for eyes, blush, and anything else that reads as a dot.
      const sides = 8;
      for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        const x = Math.cos(angle) * halfWidth;
        const y = Math.sin(angle) * (length / 2);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      break;
    }

    case "triangle": {
      shape.moveTo(-halfWidth, 0);
      shape.lineTo(halfWidth, 0);
      shape.lineTo(skew, -length);
      break;
    }

    case "spike": {
      // Narrow base, long point: tufts and cowlicks.
      shape.moveTo(-halfWidth * 0.45, 0);
      shape.lineTo(halfWidth * 0.45, 0);
      shape.lineTo(skew + tipHalf * 0.3, -length);
      shape.lineTo(skew - tipHalf * 0.3, -length);
      break;
    }

    case "lock": {
      // Straight for most of its run, then pulls to a point -- a hair lock.
      shape.moveTo(-halfWidth, 0);
      shape.lineTo(halfWidth, 0);
      shape.lineTo(skew * 0.55 + tipHalf, -length * 0.62);
      shape.lineTo(skew, -length);
      shape.lineTo(skew * 0.55 - tipHalf, -length * 0.62);
      break;
    }

    case "wedge":
    case "quad":
    default: {
      const tip = piece.shape === "quad" ? halfWidth : tipHalf;
      shape.moveTo(-halfWidth, 0);
      shape.lineTo(halfWidth, 0);
      shape.lineTo(skew + tip, -length);
      shape.lineTo(skew - tip, -length);
      break;
    }
  }

  shape.closePath();
  return shape;
}

/** Resolve a piece's colour slot against the character's palette. */
export function pieceColor(slot: PieceColor, spec: RigSpec): number {
  switch (slot) {
    case "hair":
      return spec.hair;
    case "hairShade":
      return spec.hairShade;
    case "hairTie":
      return spec.hairTie;
    case "skin":
      return spec.skin;
    case "skinDark":
      return spec.skinDark;
    case "eye":
      return spec.eye;
    case "accent":
      return spec.accent;
    case "body":
      return spec.body;
    case "hem":
      return spec.hem;
  }
}

/**
 * Build one piece as a positioned `Object3D`, ready to add to the head.
 *
 * The two nested groups matter: the outer one swings around the head and the
 * inner one tilts up and down, so a piece's azimuth and elevation stay
 * independent. Editing one in the tuner never disturbs the other.
 */
export function buildPiece(
  piece: SurfacePiece,
  headRadius: number,
  material: THREE.Material,
): THREE.Object3D {
  const swing = new THREE.Group();
  swing.rotation.y = piece.azimuth;

  const tilt = new THREE.Group();
  tilt.rotation.x = piece.elevation;
  swing.add(tilt);

  const geometry = new THREE.ExtrudeGeometry(outline(piece), {
    depth: piece.thickness,
    bevelEnabled: false,
    curveSegments: 1,
  });
  // Extrude grows along +Z from the outline plane; recentre it so `lift` means
  // the same thing whatever the thickness is.
  geometry.translate(0, 0, -piece.thickness / 2);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Slab sits on the front of the skull (-Z) and faces outward.
  mesh.position.z = -(headRadius + piece.lift);
  mesh.rotation.set(piece.pitch, Math.PI, piece.bend);
  // `spin` twists around the piece's own outward normal, so it has to be
  // applied on top of the flip above rather than folded into it.
  mesh.rotateZ(piece.spin);

  tilt.add(mesh);
  return swing;
}

// --- Authoring helpers ---------------------------------------------------

/**
 * A fringe swept across the forehead: `count` pieces fanned between two
 * azimuths, each one longer than the last so the sweep has direction.
 *
 * A starting point for the tuner, not a constraint -- once generated, every
 * piece is independently editable.
 */
export function fringe(options: {
  from: number;
  to: number;
  count: number;
  length: number;
  /** Length multiplier at the `to` end. >1 makes that side hang lower. */
  lengthBias?: number;
  width?: number;
  skew?: number;
  elevation?: number;
  shape?: PieceShape;
  color?: PieceColor;
}): SurfacePiece[] {
  const {
    from,
    to,
    count,
    length,
    lengthBias = 1,
    width = 0.13,
    skew = 0,
    // The hairline, not the brow. A piece hangs tangentially along the skull,
    // so its length is an arc: start any lower and a normal-length fringe
    // sweeps straight past the eyes and down to the chin.
    elevation = 0.82,
    shape = "lock",
    color = "hair",
  } = options;

  const pieces: SurfacePiece[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const azimuth = THREE.MathUtils.lerp(from, to, t);
    pieces.push({
      ...DEFAULT_PIECE,
      shape,
      color,
      azimuth,
      elevation,
      width,
      length: length * THREE.MathUtils.lerp(1, lengthBias, t),
      taper: 0.55,
      skew,
      // Fan the tips outward from the parting.
      bend: azimuth * 0.28,
      pitch: 0.1,
      lift: 0.004 * i,
    });
  }
  return pieces;
}

/** Mirror a piece to the other side of the head. */
export function mirrored(piece: SurfacePiece): SurfacePiece {
  return {
    ...piece,
    azimuth: -piece.azimuth,
    skew: -piece.skew,
    bend: -piece.bend,
    spin: -piece.spin,
  };
}

/** A piece and its mirror, for symmetric features like eyes. */
export function pair(piece: SurfacePiece): SurfacePiece[] {
  return [piece, mirrored(piece)];
}
