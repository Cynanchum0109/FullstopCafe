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
| click a character | Show who it is in the HUD |

`npm run typecheck` type-checks, `npm run build` produces `dist/`.

## Design

Characters are **fully procedural** — a truncated cone for the body, a faceted
ball for the head, and orb hands and feet that pop into existence only when an
animation asks for them. There is no GLTF, no skinning, and no Blender step:
every pose is a TypeScript function writing `Object3D` transforms.

That choice is deliberate. At the size an isometric camera gives you, jointed
limbs turn to mush, whereas a clean cone-plus-ball silhouette stays readable —
so the entire detail budget goes into hair, which is the only thing that has to
say *which* character this is from across the room.

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
