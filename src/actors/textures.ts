import * as THREE from "three";

/**
 * Texture store for hair cards.
 *
 * Two sources feed it: PNGs dropped into `src/assets/hair/`, which Vite finds
 * automatically, and textures painted in the tuner, which live on a canvas and
 * persist to localStorage. Both look the same to the rig.
 */

const STORAGE_KEY = "fsc.paintedTextures.v1";
const STORAGE_VERSION = 1;

/**
 * Pixels along a texture's longer side. The shorter side is scaled to the
 * piece's proportions so texels stay square.
 *
 * Fixed and small. A head can carry twenty painted pieces and three characters
 * share the scene, so every texture is a GPU upload and a localStorage entry
 * that has to stay cheap. At the size these read on screen, 64 is plenty.
 */
export const PAINT_RESOLUTION = 64;

/** Never go below this on the short side, however thin the piece is. */
const MIN_PAINT_SIDE = 12;

/**
 * Canvas size for a piece with the given aspect (width / height), with the
 * longer side at `PAINT_RESOLUTION`.
 */
export function paintSize(aspect: number): { width: number; height: number } {
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  if (safe >= 1) {
    return {
      width: PAINT_RESOLUTION,
      height: Math.max(MIN_PAINT_SIDE, Math.round(PAINT_RESOLUTION / safe)),
    };
  }
  return {
    width: Math.max(MIN_PAINT_SIDE, Math.round(PAINT_RESOLUTION * safe)),
    height: PAINT_RESOLUTION,
  };
}

export interface TextureEntry {
  id: string;
  label: string;
  /** Painted textures expose their canvas so the paint board can edit them. */
  canvas?: HTMLCanvasElement;
}

interface PaintedEntry {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
}

const painted = new Map<string, PaintedEntry>();
const assets = new Map<string, THREE.Texture>();

// Any PNG in src/assets/hair shows up in the tuner without a code change.
const assetUrls = import.meta.glob("../assets/hair/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const loader = new THREE.TextureLoader();

for (const [path, url] of Object.entries(assetUrls)) {
  const name = path.split("/").pop()?.replace(/\.png$/i, "") ?? path;
  const texture = loader.load(url);
  configure(texture);
  assets.set(`asset:${name}`, texture);
}

/**
 * Shared setup for every hair texture.
 *
 * `NearestFilter` on magnification keeps painted pixels crisp instead of
 * smearing them, which matters because the paint board is deliberately
 * low-resolution. Mipmaps stay on: these cards get small on screen and
 * unfiltered minification crawls badly when the camera moves.
 */
function configure(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
}

/** Every texture the tuner can offer, assets first. */
export function listTextures(): TextureEntry[] {
  const entries: TextureEntry[] = [];
  for (const id of assets.keys()) {
    entries.push({ id, label: id.replace(/^asset:/, "") });
  }
  for (const [id, entry] of painted) {
    entries.push({ id, label: id.replace(/^paint:/, "🖌 "), canvas: entry.canvas });
  }
  return entries;
}

export function getTexture(id: string): THREE.Texture | undefined {
  return assets.get(id) ?? painted.get(id)?.texture;
}

/** The canvas behind a painted texture, or undefined for imported assets. */
export function getCanvas(id: string): HTMLCanvasElement | undefined {
  return painted.get(id)?.canvas;
}

/** Push canvas edits to the GPU. Cheap enough to call on every brush stroke. */
export function markDirty(id: string): void {
  const entry = painted.get(id);
  if (entry) entry.texture.needsUpdate = true;
}

/** Create a blank painted texture at a given size and return its id. */
export function createPainted(
  width = PAINT_RESOLUTION,
  height = PAINT_RESOLUTION,
  id?: string,
): string {
  const key = id ?? `paint:${Date.now().toString(36)}`;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  registerCanvas(key, canvas);
  return key;
}

function registerCanvas(id: string, canvas: HTMLCanvasElement): void {
  const texture = new THREE.CanvasTexture(canvas);
  configure(texture);
  painted.set(id, { canvas, texture });
}

/** Every painted texture, for bundling into an export. */
export function paintedEntries(): Array<{ id: string; canvas: HTMLCanvasElement }> {
  return [...painted].map(([id, entry]) => ({ id, canvas: entry.canvas }));
}

/**
 * Register a painted texture from raw PNG bytes, replacing any existing one
 * with the same id. Used when loading an exported bundle.
 */
export async function registerPng(id: string, bytes: Uint8Array): Promise<void> {
  const blob = new Blob([bytes as BlobPart], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    registerCanvas(id, canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not decode ${src}`));
    image.src = src;
  });
}

/** Drop every painted texture. Used before loading a bundle. */
export function clearPainted(): void {
  for (const entry of painted.values()) entry.texture.dispose();
  painted.clear();
}

/** Persist every painted texture to localStorage. */
export function savePainted(): number {
  const payload: Record<string, string> = {};
  for (const [id, entry] of painted) {
    payload[id] = entry.canvas.toDataURL("image/png");
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, textures: payload }),
    );
  } catch (error) {
    console.warn("could not save painted textures", error);
    return 0;
  }
  return painted.size;
}

/**
 * Reload painted textures from localStorage. Images decode asynchronously, so
 * this resolves once every canvas has its pixels back.
 */
export async function loadPainted(): Promise<number> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;

  let parsed: { version?: number; textures?: Record<string, string> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (parsed.version !== STORAGE_VERSION || !parsed.textures) return 0;

  const jobs = Object.entries(parsed.textures).map(
    ([id, dataUrl]) =>
      new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          canvas.getContext("2d")?.drawImage(image, 0, 0);
          registerCanvas(id, canvas);
          resolve();
        };
        image.onerror = () => resolve();
        image.src = dataUrl;
      }),
  );

  await Promise.all(jobs);
  return painted.size;
}

/** Download a painted texture as a PNG, ready to drop into src/assets/hair. */
export function exportPng(id: string, filename?: string): boolean {
  const canvas = painted.get(id)?.canvas;
  if (!canvas) return false;
  const link = document.createElement("a");
  link.download = filename ?? `${id.replace(/^paint:/, "hair_")}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
  return true;
}
