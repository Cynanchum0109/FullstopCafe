import * as THREE from "three";

/**
 * Flat-shaded Lambert is the whole look. Materials are cached by colour so a
 * room full of props shares a handful of GPU programs.
 */
const cache = new Map<number, THREE.MeshLambertMaterial>();

export function flatMaterial(color: number): THREE.MeshLambertMaterial {
  const existing = cache.get(color);
  if (existing) return existing;
  const material = new THREE.MeshLambertMaterial({ color, flatShading: true });
  cache.set(color, material);
  return material;
}

/** Same as `flatMaterial` but double sided, for single-plane props like hair. */
const doubleCache = new Map<number, THREE.MeshLambertMaterial>();

export function flatMaterialDouble(color: number): THREE.MeshLambertMaterial {
  const existing = doubleCache.get(color);
  if (existing) return existing;
  const material = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  doubleCache.set(color, material);
  return material;
}

/**
 * Build a box mesh positioned by its centre. Almost every prop and body part in
 * the game goes through here.
 */
export function box(
  width: number,
  height: number,
  depth: number,
  color: number,
  options: { castShadow?: boolean; receiveShadow?: boolean } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    flatMaterial(color),
  );
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

/**
 * Material for a painted piece.
 *
 * `color` stays white so the map shows exactly the colours that were painted.
 * Tinting a greyscale card would be more reusable, but it would also make every
 * colour choice on the paint board meaningless.
 *
 * `alphaTest` rather than `transparent`: transparency needs back-to-front
 * sorting, and a head carrying twenty overlapping pieces flickers badly when
 * the camera moves. Discarding pixels below a threshold sidesteps sorting
 * entirely at the cost of hard edges, which suits this art style anyway. It
 * also means unpainted areas cut holes in the piece, so a partly painted
 * canvas trims the shape as well as colouring it.
 */
const cardCache = new Map<string, THREE.MeshLambertMaterial>();

export function cardMaterial(texture: THREE.Texture): THREE.MeshLambertMaterial {
  const existing = cardCache.get(texture.uuid);
  if (existing) return existing;

  const material = new THREE.MeshLambertMaterial({
    map: texture,
    color: 0xffffff,
    alphaTest: 0.5,
    transparent: false,
    side: THREE.DoubleSide,
    flatShading: true,
    // The textured mesh sits exactly on top of the base-coloured one. Without a
    // depth nudge the two z-fight and the surface speckles.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  cardCache.set(texture.uuid, material);
  return material;
}

/**
 * Fully transparent, casts nothing, writes no depth.
 *
 * Used by pieces set to the "none" colour: they stay in the list, keep their
 * shape and stay selectable, but draw nothing. Handy for blocking out a shape
 * you only intend to paint, and for hiding a piece without deleting it.
 */
let invisible: THREE.MeshBasicMaterial | undefined;

export function invisibleMaterial(): THREE.MeshBasicMaterial {
  invisible ??= new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  return invisible;
}

/**
 * Depth material matching a card, so its shadow follows the alpha cutout
 * instead of being a solid rectangle. three.js will not infer this.
 */
const cardDepthCache = new Map<string, THREE.MeshDepthMaterial>();

export function cardDepthMaterial(texture: THREE.Texture): THREE.MeshDepthMaterial {
  const existing = cardDepthCache.get(texture.uuid);
  if (existing) return existing;

  const material = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: texture,
    alphaTest: 0.5,
  });
  cardDepthCache.set(texture.uuid, material);
  return material;
}

/**
 * Faceted ball. Low segment counts on purpose: with flat shading the facets are
 * the style, and a smooth sphere would look out of place next to the boxes.
 */
export function sphere(
  radius: number,
  color: number,
  segments = 10,
  rings = 7,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, rings),
    flatMaterial(color),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Truncated cone, the shape every character's body is made of.
 * `topRadius` of 0 gives a true cone; a small non-zero value reads better
 * because it gives the shoulders somewhere to be.
 */
export function cone(
  topRadius: number,
  bottomRadius: number,
  height: number,
  color: number,
  segments = 10,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, bottomRadius, height, segments, 1),
    flatMaterial(color),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Convenience: build a box and place its centre in one call. */
export function boxAt(
  width: number,
  height: number,
  depth: number,
  color: number,
  x: number,
  y: number,
  z: number,
  options: { castShadow?: boolean; receiveShadow?: boolean } = {},
): THREE.Mesh {
  const mesh = box(width, height, depth, color, options);
  mesh.position.set(x, y, z);
  return mesh;
}
