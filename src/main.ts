import * as THREE from "three";
import "./style.css";

import { GameClock } from "./core/Clock";
import { events } from "./core/Events";
import { Renderer } from "./render/Renderer";
import { IsoCamera } from "./render/Camera";
import {
  FROZEN_DAY_FRACTION,
  Lighting,
  TIME_OF_DAY_LIGHTING,
} from "./render/Lighting";
import { Office, ROOM_MAX_X, ROOM_MAX_Z, ROOM_MIN_X, ROOM_MIN_Z } from "./world/Office";
import { Furniture } from "./world/furniture";
import { Actor } from "./actors/Actor";
import { profiles } from "./actors/profiles";
import { loadPainted } from "./actors/textures";
import { HUD } from "./ui/HUD";
import { RigTuner } from "./ui/RigTuner";

const canvas = document.querySelector<HTMLCanvasElement>("#app");
const overlay = document.querySelector<HTMLDivElement>("#overlay");
if (!canvas || !overlay) throw new Error("missing #app canvas or #overlay");

const clock = new GameClock();
const renderer = new Renderer(canvas);
const camera = new IsoCamera(canvas);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10101a);

const lighting = new Lighting(scene);
const office = new Office();
scene.add(office.group);

const furniture = new Furniture();
scene.add(furniture.group);

const actors = profiles.map((profile) => {
  // Prefer documented home anchors (boss desk / sofa / ops table) over raw numbers.
  const home = furniture.preferredSpotFor(profile.id);
  const x = home?.position.x ?? profile.spawn.x;
  const z = home?.position.z ?? profile.spawn.z;
  const actor = new Actor({
    id: profile.id,
    displayName: profile.displayName,
    spec: profile.spec,
    position: new THREE.Vector3(x, 0, z),
  });
  if (home) actor.setYaw(home.yaw);
  return actor;
});
for (const actor of actors) scene.add(actor.object);

const hud = new HUD(overlay, clock);
const tuner = new RigTuner(overlay, actors, camera);

// --- Temporary phase-1 driver -------------------------------------------
// Manual control exists only to validate the walk cycle and camera feel. The
// utility AI replaces it in phase 2 and this block goes away.
const keys = new Set<string>();
/** WASD drives whoever is selected. Reassigned by the `actor:clicked` handler. */
let driven = actors[0];

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  if (event.code === "Space") {
    event.preventDefault();
    clock.paused = !clock.paused;
  }
  if (event.key === "t" || event.key === "T") clock.cycleScale();
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

const inputDirection = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();

function applyManualInput(): void {
  if (!driven) return;

  inputDirection.set(0, 0, 0);
  if (keys.has("w")) inputDirection.z -= 1;
  if (keys.has("s")) inputDirection.z += 1;
  if (keys.has("a")) inputDirection.x -= 1;
  if (keys.has("d")) inputDirection.x += 1;

  if (inputDirection.lengthSq() === 0) {
    if (driven.isMoving) driven.stop();
    return;
  }

  // Interpret input relative to where the camera is looking, so "W" always
  // means "away from the viewer" regardless of which corner we rotated to.
  camera.camera.getWorldDirection(cameraForward);
  cameraForward.y = 0;
  cameraForward.normalize();
  cameraRight.crossVectors(cameraForward, THREE.Object3D.DEFAULT_UP).normalize();

  const move = new THREE.Vector3()
    .addScaledVector(cameraForward, -inputDirection.z)
    .addScaledVector(cameraRight, inputDirection.x)
    .normalize();

  // Aim at a point a stride ahead; the actor's own arrival easing does the rest.
  const x = THREE.MathUtils.clamp(
    driven.position.x + move.x * 0.8,
    ROOM_MIN_X + 0.4,
    ROOM_MAX_X - 0.4,
  );
  const z = THREE.MathUtils.clamp(
    driven.position.z + move.z * 0.8,
    ROOM_MIN_Z + 0.4,
    ROOM_MAX_Z - 0.4,
  );
  driven.walkTo(x, z);
}

// --- Picking -------------------------------------------------------------
canvas.addEventListener("click", (event) => {
  if (camera.lastGestureWasDrag) return;
  const hit = camera.pick(
    event.clientX,
    event.clientY,
    actors.map((actor) => actor.object),
  );
  const actorId = hit?.object.userData["actorId"];
  if (typeof actorId === "string") {
    events.emit("actor:clicked", { actorId });
  } else {
    events.emit("world:clicked", {});
  }
});

events.on("actor:clicked", ({ actorId }) => {
  const actor = actors.find((candidate) => candidate.id === actorId);
  if (!actor) return;
  hud.setFocus(actor.displayName);
  // One selection concept: clicking in the 3D view, or picking a tab in the
  // tuner, both point the camera, the HUD and the WASD driver at the same actor.
  driven?.stop();
  driven = actor;
  tuner.select(actor);
});
events.on("world:clicked", () => hud.setFocus("-"));

// --- Main loop -----------------------------------------------------------
function frame(nowMs: number): void {
  requestAnimationFrame(frame);

  clock.tick(nowMs);
  renderer.resize();
  camera.resize();

  applyManualInput();

  // Actors move on scaled time so fast-forward speeds up the simulation, but
  // the camera eases on real time so the view never feels twitchy.
  for (const actor of actors) actor.update(clock.deltaScaled, clock.elapsed);
  camera.update(clock.delta);

  // The clock keeps running for the HUD either way; only the light is pinned.
  const lightFraction = TIME_OF_DAY_LIGHTING
    ? clock.dayFraction
    : FROZEN_DAY_FRACTION;
  lighting.apply(lightFraction);
  // Night factor peaks at midnight, zero through the middle of the day.
  const night = THREE.MathUtils.clamp(
    Math.cos(lightFraction * Math.PI * 2) * 0.5 + 0.5,
    0,
    1,
  );
  office.setNight(night);

  hud.update();
  renderer.render(scene, camera.camera);
}

// Start at mid-morning rather than midnight so the first frame is well lit.
clock.skipSeconds(0.4 * (15 * 60));
requestAnimationFrame(frame);

// Painted hair textures survive a reload. Rebuild once they are decoded, since
// pieces referencing them were built against a texture that did not exist yet.
loadPainted().then((count) => {
  if (count === 0) return;
  for (const actor of actors) actor.applySpec(actor.rig.spec);
});

// This module owns a render loop and a WebGL context, neither of which can be
// hot-swapped. Without this, every edit stacks another loop on the same canvas
// until the tab locks up.
if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload());
}
