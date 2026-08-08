import { unzipSync, zipSync } from "fflate";
import { DEFAULT_RIG_SPEC, type RigSpec } from "./Rig";
import { RIG_COLOR_CONTROLS, TUNABLE_KEYS } from "./rigControls";
import { clearPainted, paintedEntries, registerPng } from "./textures";
import {
  resolveLegacyColor,
  type LegacyPieceColor,
  type SurfacePiece,
} from "./SurfacePiece";

/**
 * Import and export of a complete editing session: every character's spec plus
 * every painted texture, in one zip.
 *
 * The bundle is the handoff format between a tuning session and the repository.
 * localStorage keeps work safe across a reload, but it is per-browser and does
 * not survive a deploy -- a file does.
 */

const BUNDLE_VERSION = 1;
const SPEC_FILE = "spec.json";
const TEXTURE_DIR = "textures/";

interface BundleManifest {
  version: number;
  created: string;
  /** Character id to full spec. */
  characters: Record<string, RigSpec>;
}

export interface LoadedBundle {
  characters: Record<string, RigSpec>;
  textureCount: number;
}

/** Build the zip. Returns a blob ready to hand to a download link. */
export async function exportBundle(
  characters: Record<string, RigSpec>,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();

  const manifest: BundleManifest = {
    version: BUNDLE_VERSION,
    created: new Date().toISOString(),
    characters,
  };
  files[SPEC_FILE] = encoder.encode(JSON.stringify(manifest, null, 2));

  // A paste-ready copy alongside the machine-readable one, so the bundle is
  // useful even without loading it back into the tuner.
  const blocks = Object.entries(characters)
    .map(([id, spec]) => `// --- ${id} ---\n${formatSpecBlock(spec)}`)
    .join("\n\n");
  files["profiles.ts.txt"] = encoder.encode(blocks);

  for (const { id, canvas } of paintedEntries()) {
    files[`${TEXTURE_DIR}${toFilename(id)}.png`] = await canvasToPng(canvas);
  }

  files["README.txt"] = encoder.encode(READ_ME);

  // Store only. PNGs and JSON of this size gain almost nothing from deflate,
  // and zipping stays instant.
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped as BlobPart], { type: "application/zip" });
}

/**
 * Read a bundle back. Textures are registered before the specs are returned,
 * so a rig rebuilt against the returned specs finds its images already there.
 */
export async function importBundle(file: File): Promise<LoadedBundle> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(bytes);

  const specFile = entries[SPEC_FILE];
  if (!specFile) throw new Error(`压缩包里没有 ${SPEC_FILE}`);

  const manifest = JSON.parse(new TextDecoder().decode(specFile)) as BundleManifest;
  if (manifest.version !== BUNDLE_VERSION) {
    throw new Error(`不支持的存档版本 ${manifest.version}`);
  }
  if (!manifest.characters || typeof manifest.characters !== "object") {
    throw new Error("存档里没有角色数据");
  }

  clearPainted();

  let textureCount = 0;
  for (const [path, data] of Object.entries(entries)) {
    if (!path.startsWith(TEXTURE_DIR) || !path.endsWith(".png")) continue;
    const id = fromFilename(path.slice(TEXTURE_DIR.length, -".png".length));
    await registerPng(id, data);
    textureCount += 1;
  }

  // Fill in anything a spec from an older edit is missing, so loading a bundle
  // written before a field existed does not produce an undefined in the rig.
  const characters: Record<string, RigSpec> = {};
  for (const [id, spec] of Object.entries(manifest.characters)) {
    const merged = { ...DEFAULT_RIG_SPEC, ...spec };
    merged.pieces = merged.pieces.map((piece) => migratePiece(piece, merged));
    characters[id] = merged;
  }

  return { characters, textureCount };
}

/**
 * Bring a piece forward from the old colour-slot format.
 *
 * Pieces used to name a slot in the character palette ("hair", "skinDark",
 * "none"); they now carry their own colour and a hidden flag. Bundles saved
 * before that change still say `color: "hair"`, so resolve it once on load
 * rather than teaching the rig two formats.
 */
function migratePiece(piece: SurfacePiece, spec: RigSpec): SurfacePiece {
  if (typeof piece.color === "number") return piece;

  const legacy = piece.color as unknown as LegacyPieceColor;
  const resolved = resolveLegacyColor(legacy, spec);
  const migrated: SurfacePiece = { ...piece, color: resolved.color };
  if (resolved.hidden) migrated.hidden = true;
  return migrated;
}

/** Trigger a download of a blob under a given filename. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function bundleFilename(): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `fullstopcafe-rig-${stamp}.zip`;
}

/**
 * Format a spec as the `spec` block in `profiles/index.ts`.
 *
 * Only fields that differ from the default are emitted, except the piece list,
 * which always ships in full -- "differs from default" is not a meaningful
 * question to ask of an array.
 */
export function formatSpecBlock(spec: RigSpec): string {
  const lines: string[] = [];

  for (const key of TUNABLE_KEYS) {
    if (key === "pieces") continue;
    const value = spec[key];
    if (value === DEFAULT_RIG_SPEC[key]) continue;
    if (typeof value === "number") {
      const isColor = RIG_COLOR_CONTROLS.some((control) => control.key === key);
      lines.push(`  ${key}: ${isColor ? toHexLiteral(value) : round(value)},`);
    } else {
      lines.push(`  ${key}: ${JSON.stringify(value)},`);
    }
  }

  lines.push("  pieces: [");
  for (const piece of spec.pieces) {
    const fields = Object.entries(piece)
      .map(([key, value]) => {
        if (key === "color" && typeof value === "number") {
          return `color: ${toHexLiteral(value)}`;
        }
        return typeof value === "number"
          ? `${key}: ${round(value)}`
          : `${key}: ${JSON.stringify(value)}`;
      })
      .join(", ");
    lines.push(`    { ${fields} },`);
  }
  lines.push("  ],");

  return `spec: {\n${lines.join("\n")}\n},`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toHexLiteral(value: number): string {
  return `0x${value.toString(16).padStart(6, "0")}`;
}

/** Texture ids contain a colon, which is not safe in a filename on Windows. */
function toFilename(id: string): string {
  return id.replace(/:/g, "__");
}

function fromFilename(name: string): string {
  return name.replace(/__/g, ":");
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("could not encode canvas"));
        return;
      }
      blob.arrayBuffer().then(
        (buffer) => resolve(new Uint8Array(buffer)),
        (error) => reject(error),
      );
    }, "image/png");
  });
}

const READ_ME = `full-stop cafe — rig bundle

spec.json         Every character's full RigSpec. Load this back with
                  「导入存档」 in the rig tuner (press \` in game).
profiles.ts.txt   The same specs formatted for pasting into
                  src/actors/profiles/index.ts.
textures/*.png    Painted piece textures, one per texture id. The filename
                  is the id with ':' replaced by '__'.

To make an edit permanent in the repository, paste the blocks from
profiles.ts.txt over the matching spec in profiles/index.ts. Painted
textures are referenced by id, so they need to be loaded from a bundle or
kept in localStorage — or exported as PNGs into src/assets/hair/ and
re-pointed at from the texture dropdown.
`;
