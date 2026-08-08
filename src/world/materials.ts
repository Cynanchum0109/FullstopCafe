import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A toon ramp: a few grey steps sampled with NEAREST, so lighting lands in hard
 * bands instead of a smooth falloff.
 *
 * This replaced flat shading, which gave every facet its own brightness and
 * turned a faceted ball into visual noise. A ramp collapses that same ball into
 * two or three clean shapes, which is what lets a round silhouette read as
 * round -- and it is why the meshes here now carry more segments than they used
 * to. The ramp and the higher tessellation only work as a pair.
 *
 * The dark step is warm rather than neutral: a grey shadow in a warm room is the
 * fastest way to make it feel cold.
 */
function gradientMap(steps: number[]): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Uint8Array(steps),
    steps.length,
    1,
    THREE.RedFormat,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Shadow, mid, light. Four steps drift back toward smooth; two read as paper. */
export const TOON_RAMP = gradientMap([78, 172, 255]);

/**
 * The one material every solid surface uses. Cached by colour so a room full of
 * props shares a handful of GPU programs.
 */
const cache = new Map<number, THREE.MeshToonMaterial>();

export function flatMaterial(color: number): THREE.MeshToonMaterial {
  const existing = cache.get(color);
  if (existing) return existing;
  const material = new THREE.MeshToonMaterial({ color, gradientMap: TOON_RAMP });
  cache.set(color, material);
  return material;
}

/** Same as `flatMaterial` but double sided, for single-plane props like hair. */
const doubleCache = new Map<number, THREE.MeshToonMaterial>();

export function flatMaterialDouble(color: number): THREE.MeshToonMaterial {
  const existing = doubleCache.get(color);
  if (existing) return existing;
  const material = new THREE.MeshToonMaterial({
    color,
    gradientMap: TOON_RAMP,
    side: THREE.DoubleSide,
  });
  doubleCache.set(color, material);
  return material;
}

/** Default rim thickness, in world units. Tuned against a 0.23m head. */
export const OUTLINE_THICKNESS = 0.008;

const outlineCache = new Map<number, THREE.ShaderMaterial>();

/**
 * Inverted-hull outline material: grows a copy of the mesh along its normals
 * and draws back faces only, so the copy peeks out as a dark rim.
 *
 * Warm near-black rather than true black -- a neutral rim on warm wood looks
 * like ink on the wrong paper.
 */
function outlineMaterial(thickness: number): THREE.ShaderMaterial {
  const existing = outlineCache.get(thickness);
  if (existing) return existing;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      thickness: { value: thickness },
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
  outlineCache.set(thickness, material);
  return material;
}

/** Marks a mesh that already carries a hull, and hulls themselves. */
const OUTLINED = "outlined";

/**
 * Give one mesh a rim.
 *
 * The hull's geometry is welded and re-normalled first. Without that, a box's
 * corner normals point three different ways and the hull splits open at every
 * corner -- the classic broken-outline look.
 */
export function outline(mesh: THREE.Mesh, thickness = OUTLINE_THICKNESS): void {
  if (mesh.userData[OUTLINED]) return;
  const welded = mergeVertices(mesh.geometry.clone(), 1e-4);
  welded.computeVertexNormals();
  const hull = new THREE.Mesh(welded, outlineMaterial(thickness));
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.userData[OUTLINED] = true;
  mesh.userData[OUTLINED] = true;
  mesh.add(hull);
}

/**
 * Rim every mesh under `root`.
 *
 * Called once after a group is built rather than per-mesh at each call site:
 * the furniture alone is a couple of hundred boxes, and threading an `outline`
 * flag through every one of them would be noise. Meshes that should stay bare
 * -- the floor, the walls, anything flat against another surface -- opt out by
 * setting `userData.noOutline` when they are built.
 */
export function outlineAll(root: THREE.Object3D, thickness = OUTLINE_THICKNESS): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && !child.userData[OUTLINED] && !child.userData["noOutline"]) {
      meshes.push(child);
    }
  });
  for (const mesh of meshes) outline(mesh, thickness);
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
const cardCache = new Map<string, THREE.MeshToonMaterial>();

export function cardMaterial(texture: THREE.Texture): THREE.MeshToonMaterial {
  const existing = cardCache.get(texture.uuid);
  if (existing) return existing;

  const material = new THREE.MeshToonMaterial({
    map: texture,
    color: 0xffffff,
    gradientMap: TOON_RAMP,
    alphaTest: 0.5,
    transparent: false,
    side: THREE.DoubleSide,
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
