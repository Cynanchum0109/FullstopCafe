import * as THREE from "three";
import { Rig, type RigSpec, type Pose } from "./Rig";
import { animations, type AnimName, type AnimContext } from "./animations";

/** Metres per second at full walk speed. */
const WALK_SPEED = 1.35;
/** How fast the actor turns to face its heading, radians per second. */
const TURN_SPEED = 9;
/** Seconds to blend out of the previous animation. */
const CROSSFADE = 0.18;
/** Stop when this close to the walk target. */
const ARRIVE_RADIUS = 0.08;

export interface ActorOptions {
  id: string;
  displayName: string;
  spec: Partial<RigSpec>;
  position?: THREE.Vector3;
}

/**
 * A character in the world: a rig, a position, and an animation player.
 *
 * Deliberately knows nothing about needs or decisions -- the AI layer drives it
 * through `walkTo` and `play`, which keeps movement debuggable on its own.
 */
export class Actor {
  readonly id: string;
  readonly displayName: string;
  /** Swapped out wholesale by `applySpec`; never hold a reference across frames. */
  rig: Rig;
  /** Stable container. The rig hangs off this so it can be rebuilt in place. */
  readonly object: THREE.Object3D;

  /** Current normalised speed, 0..1. Read by animations. */
  speed = 0;

  private currentAnim: AnimName = "idle";
  /** Set by `play`; blocks the automatic walk/idle switch while non-null. */
  private forcedAnim: AnimName | null = null;
  private animTime = 0;
  private fadePose: Pose | null = null;
  private fadeRemaining = 0;

  private readonly target = new THREE.Vector3();
  private hasTarget = false;
  private desiredYaw = 0;
  /** Per-actor animation offset so a group never moves in lockstep. */
  private readonly phaseOffset: number;

  private readonly context: AnimContext = { time: 0, elapsed: 0, speed: 0 };
  private readonly scratch = new THREE.Vector3();

  constructor(options: ActorOptions) {
    this.id = options.id;
    this.displayName = options.displayName;
    this.object = new THREE.Group();
    this.object.name = `actor:${options.id}`;
    this.rig = new Rig(options.spec);
    this.object.add(this.rig.root);
    this.tagForPicking();
    if (options.position) this.object.position.copy(options.position);
    this.phaseOffset = Math.random() * 100;
    this.desiredYaw = this.object.rotation.y;
  }

  /**
   * Rebuild the body from a new spec, in place. Used by the rig tuner; the
   * actor keeps its position, heading and animation state across the swap.
   */
  applySpec(spec: Partial<RigSpec>, options: { highlight?: number } = {}): void {
    this.object.remove(this.rig.root);
    this.rig.dispose();
    this.rig = new Rig(spec, options);
    this.object.add(this.rig.root);
    this.tagForPicking();
    // The captured pose points at joints that no longer exist.
    this.fadePose = null;
    this.fadeRemaining = 0;
  }

  /** Tag every mesh so a raycast hit can be traced back to this actor. */
  private tagForPicking(): void {
    this.object.traverse((child) => {
      child.userData["actorId"] = this.id;
    });
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  /** Head for a floor position. Movement is a straight line; pathing is above. */
  walkTo(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.hasTarget = true;
  }

  /** Cancel any walk target and come to a stop. */
  stop(): void {
    this.hasTarget = false;
  }

  get isMoving(): boolean {
    return this.hasTarget;
  }

  /** Snap to an absolute heading. Used by the rig tuner to inspect the face. */
  setYaw(yaw: number): void {
    this.desiredYaw = yaw;
    this.object.rotation.y = yaw;
  }

  get yaw(): number {
    return this.object.rotation.y;
  }

  /** Face a world position without moving toward it. */
  faceTowards(x: number, z: number): void {
    this.desiredYaw = Math.atan2(
      -(x - this.object.position.x),
      -(z - this.object.position.z),
    );
  }

  /**
   * Force a specific animation. Pass null to hand control back to the
   * automatic walk / idle switch.
   */
  play(name: AnimName | null): void {
    this.forcedAnim = name;
  }

  update(delta: number, elapsed: number): void {
    this.advanceMovement(delta);
    this.advanceAnimation(delta, elapsed);
  }

  private advanceMovement(delta: number): void {
    if (this.hasTarget) {
      this.scratch.subVectors(this.target, this.object.position);
      this.scratch.y = 0;
      const distance = this.scratch.length();

      if (distance <= ARRIVE_RADIUS) {
        this.hasTarget = false;
        this.speed = 0;
      } else {
        this.scratch.divideScalar(distance);
        // Ease down over the last stride so arrivals do not snap to a halt.
        const approach = THREE.MathUtils.clamp(distance / 0.5, 0.25, 1);
        this.speed = approach;
        const step = Math.min(WALK_SPEED * approach * delta, distance);
        this.object.position.addScaledVector(this.scratch, step);
        this.desiredYaw = Math.atan2(-this.scratch.x, -this.scratch.z);
      }
    } else {
      // Coast to a stop rather than cutting the walk cycle mid-stride.
      this.speed = Math.max(0, this.speed - delta * 4);
    }

    // Shortest-arc turn toward the desired heading.
    const current = this.object.rotation.y;
    let difference = this.desiredYaw - current;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    this.object.rotation.y =
      current + difference * (1 - Math.exp(-TURN_SPEED * delta));
  }

  private advanceAnimation(delta: number, elapsed: number): void {
    const wanted: AnimName =
      this.forcedAnim ?? (this.speed > 0.05 ? "walk" : "idle");

    if (wanted !== this.currentAnim) {
      // Freeze the pose we are leaving, then blend out of it over CROSSFADE.
      this.fadePose = this.rig.capturePose();
      this.fadeRemaining = CROSSFADE;
      this.currentAnim = wanted;
      this.animTime = 0;
    }

    this.animTime += delta;
    this.context.time = this.animTime;
    this.context.elapsed = elapsed + this.phaseOffset;
    this.context.speed = this.speed;

    this.rig.resetPose();
    animations[this.currentAnim](this.rig, this.context);

    if (this.fadePose && this.fadeRemaining > 0) {
      this.fadeRemaining -= delta;
      // Weight starts at 1 (fully the old pose) and falls to 0.
      const weight = THREE.MathUtils.clamp(this.fadeRemaining / CROSSFADE, 0, 1);
      this.rig.blendToward(this.fadePose, weight);
      if (this.fadeRemaining <= 0) this.fadePose = null;
    }
  }
}
