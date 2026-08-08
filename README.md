# full-stop cafe

A browser 3D idle-sim: three characters living out an ordinary day in a small
detective agency. Low poly, flat shaded, isometric. No win condition — you
watch, and occasionally poke.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

| Key / input | Does |
|---|---|
| `WASD` | Walk the test character (temporary, phase 1 only) |
| drag / `Q` `E` | Rotate the camera between the four corners |
| wheel | Zoom |
| `Space` | Pause |
| `T` | Cycle time scale (1× / 8× / 60×) |
| `` ` `` | Open the rig tuner |
| click a character | Show who it is in the HUD |

## Surface pieces

Fringe, side locks, eyes and blush are **surface pieces**: a small 2D outline
(`THREE.Shape`) extruded to a thin slab (`ExtrudeGeometry`, no bevel), then
placed on the head sphere by azimuth and elevation with three axes of local
rotation on top. Outline presets — rectangle, trapezoid, triangle, hair lock,
spike, leaf, ellipse, disc, plus `custom` for hand-traced ones — each
parameterised by width, length, taper and tip skew. Thickness can go to zero
for a single flat face.

A few vertices per piece, so a whole head of them stays cheap, and any shape
you can describe with those numbers is available without touching code.

The one thing to know: a piece hangs *tangentially* along the skull, so its
`length` is an arc. Starting a fringe at the brow instead of at the hairline
sends it sweeping straight past the eyes and down to the chin.

## Paint board

Press `` ` ``, select a piece, then **🖌 打开画板**. A resizable floating panel
with a fixed 64px canvas; the piece's outline is projected onto it as a guide.

Tools: brush, eraser, line, filled rect, filled ellipse, flood fill, left-right
mirror, undo, clear, and **填满轮廓** which floods the guide outline with the
piece's own colour as a base to paint over.

What the drawing is *for* is a separate decision, and this is the important
part:

| Button | Effect |
|---|---|
| **用作贴图** | The image is painted onto the piece's existing faces, in the colours you painted. The shape does not change. |
| **生成形状** | The old outline is thrown away and the painted alpha is traced into a new one, which extrudes like any other shape. |

Material `color` stays white so painted colours appear as-is — tinting greyscale
art would be more reusable but would make every colour choice on the board
meaningless. `alphaTest` means unpainted areas cut holes, so a partly painted
canvas trims the shape as well as colouring it.

UVs are re-projected through the same rectangle the board uses. `ShapeGeometry`
and `ExtrudeGeometry` emit UVs straight from vertex x,y in metres, which tile
into a smear; the remap puts every pixel back where you drew it.

Painted textures persist to localStorage (**保存**) and can be downloaded as
PNGs (**导出 PNG**). Any PNG dropped into `src/assets/hair/` also shows up in
the texture dropdown, no code change needed.

## Saving a session

**导出存档** downloads a zip of the entire editing session — all three
characters plus every painted texture. **导入存档** loads one back, restoring
both. localStorage keeps work safe across a reload, but it is per-browser and
does not survive a deploy; a file does.

```
spec.json           every character's full RigSpec, machine-readable
profiles.ts.txt     the same specs formatted for pasting into profiles/index.ts
textures/*.png      one per painted texture; filename is the id with ':' → '__'
README.txt          what the bundle is
```

Whole session rather than one character on purpose: pieces reference textures
by id, so a spec on its own is only half the work.

To make an edit permanent, paste the blocks from `profiles.ts.txt` over the
matching `spec` in `src/actors/profiles/index.ts`.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. Pages serves from `/FullstopCafe/`, so the Vite
`base` switches to the repository name under Actions and stays `/` locally.

Painted textures live in localStorage and do **not** ship with a deploy — the
live site always starts from what is committed in `profiles/index.ts`.

## Rig tuner

Press `` ` ``. Every number in `RigSpec` is a slider — proportions, polygon
counts, hair mass, ponytail, hand and foot size — plus colour swatches. The
character rebuilds on every change, the camera frames whoever is selected, and
**转 45°** spins them so you can check the face.

The **贴面部件** section lists every surface piece on the head. Select one and
you get its shape and colour dropdowns plus sliders for placement, outline and
rotation; **新建 / 复制 / 镜像 / 删除** manage the list. 镜像 flips a piece to
the other side of the head, which is how you build symmetric features without
doing the arithmetic twice.

**复制 spec** copies only the values that differ from the default, already
formatted as the `spec` block in `src/actors/profiles/index.ts` — paste it
straight over the old one. (If the clipboard is blocked, it prints to the
console instead.)

This exists because eyeballing a procedural character through code edits means
a page reload per guess.

`npm run typecheck` type-checks, `npm run build` produces `dist/`.

## Design

Characters are **fully procedural** — a sharp truncated cone for the body, a
faceted ball for the head at roughly 2.4 heads tall, and orb hands and feet that
pop into existence only when an animation asks for them. There is no GLTF, no
skinning, and no Blender step: every pose is a TypeScript function writing
`Object3D` transforms.

That choice is deliberate. At the size an isometric camera gives you, jointed
limbs turn to mush, whereas a clean cone-plus-ball silhouette stays readable —
so the entire detail budget goes into hair, which is the only thing that has to
say *which* character this is from across the room.

There is no `hairStyle` switch. The head is a hair *mass* — crown shell,
back-and-sides shell with a wedge cut out for the face, ponytail — plus a list
of surface pieces for everything with a silhouette worth designing. Only the
numbers differ between characters, which is what makes the whole design tunable
from sliders rather than from three hard-coded special cases.

Prop mount points (`joints.handL` / `handR`) are empty `Object3D`s, so swapping
in a `.glb` mug or rifle later needs no rig changes.

## Layout

```
src/
  core/     Clock (in-game time, pause, fast-forward), Events (typed bus)
  render/   Renderer (pluggable post-process chain), IsoCamera, Lighting
  world/    Office shell, palette, material + primitive helpers
  actors/   Rig (procedural body), Actor (movement + anim player),
            animations/ (one module per action), profiles/ (per-character data)
  ui/       HUD
```

## Status

**Phase 1 done** — room, camera, lighting, day/night, rig, walk and idle,
manual test driver.

Next: waypoint navigation, needs-driven utility AI, furniture with interaction
spots, then per-character personality weights and dialogue.
