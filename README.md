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

## Rig tuner

Press `` ` ``. Every number in `RigSpec` is a slider — proportions, polygon
counts, face, hair, ponytail, hand and foot size — plus colour swatches. The
character rebuilds on every change, the camera frames whoever is selected, and
**转 45°** spins them so you can check the face.

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

There is no `hairStyle` switch. Every head is the same five parts — crown,
back-and-sides shell with a wedge cut out for the face, fringe slabs either side
of a parting, side locks, ponytail — and only the numbers differ. That is what
makes the whole design tunable from sliders rather than from three hard-coded
special cases.

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
