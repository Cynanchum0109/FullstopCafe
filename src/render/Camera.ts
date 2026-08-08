import * as THREE from "three";

/** Elevation of the camera above the floor plane, in radians. */
const ELEVATION = THREE.MathUtils.degToRad(34);
/** Distance from the orbit target. Orthographic, so this only affects clipping. */
const ORBIT_RADIUS = 30;
/** Half-height of the orthographic frustum at zoom 1, in world units. */
const BASE_VIEW_HEIGHT = 3.1;

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.4;
/** How fast the camera eases toward its target azimuth / zoom, per second. */
const SMOOTHING = 9;

/** How far the view may be panned from the middle of the room, in world units. */
const PAN_LIMIT = 4;

/**
 * Orthographic isometric camera at a fixed angle.
 *
 * The view never rotates: the cutaway room only has two walls, and turning past
 * them shows the room from behind its own missing walls. Dragging pans instead,
 * which is what you actually want when the room is bigger than the screen.
 */
export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  readonly target = new THREE.Vector3(0, 0.5, 0);

  /** Where the camera drifts back to when nothing is focused. */
  private readonly homeTarget = new THREE.Vector3(0, 0.5, 0);
  private readonly desiredTarget = new THREE.Vector3(0, 0.5, 0);
  private homeZoom = 1;

  private readonly azimuth = Math.PI / 4;
  private zoom = 1;
  private targetZoom = 1;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private dragging = false;
  private dragMoved = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  /** Screen-space pan axes, derived from the fixed camera angle. */
  private readonly panRight = new THREE.Vector3();
  private readonly panForward = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.applyFrustum();
    this.applyTransform();
    this.attachInput();
  }

  /**
   * Slide the view across the floor. `dx` and `dy` are in pixels, mapped so
   * the world appears to follow the cursor.
   */
  pan(dx: number, dy: number): void {
    const worldPerPixel =
      (this.camera.top - this.camera.bottom) /
      (this.canvas.clientHeight || window.innerHeight);

    this.panRight.set(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    this.panForward.set(Math.sin(this.azimuth), 0, Math.cos(this.azimuth));

    this.desiredTarget
      .addScaledVector(this.panRight, -dx * worldPerPixel)
      // Dragging down should pull the far end of the room toward the viewer.
      .addScaledVector(this.panForward, -dy * worldPerPixel / Math.cos(ELEVATION));

    this.desiredTarget.x = THREE.MathUtils.clamp(
      this.desiredTarget.x,
      this.homeTarget.x - PAN_LIMIT,
      this.homeTarget.x + PAN_LIMIT,
    );
    this.desiredTarget.z = THREE.MathUtils.clamp(
      this.desiredTarget.z,
      this.homeTarget.z - PAN_LIMIT,
      this.homeTarget.z + PAN_LIMIT,
    );
  }

  /** Multiply the zoom level; >1 zooms in. */
  zoomBy(factor: number): void {
    this.targetZoom = THREE.MathUtils.clamp(
      this.targetZoom * factor,
      MIN_ZOOM,
      MAX_ZOOM,
    );
  }

  /** Frame a point in the world. Used by the rig tuner to inspect a character. */
  focusOn(x: number, y: number, z: number, zoom: number): void {
    if (this.desiredTarget.equals(this.homeTarget)) this.homeZoom = this.targetZoom;
    this.desiredTarget.set(x, y, z);
    this.targetZoom = THREE.MathUtils.clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  }

  /** Return to the room-wide view. */
  clearFocus(): void {
    this.desiredTarget.copy(this.homeTarget);
    this.targetZoom = this.homeZoom;
  }

  /** Recentre without changing zoom. */
  recentre(): void {
    this.desiredTarget.copy(this.homeTarget);
  }

  /**
   * Ease toward the target orientation. Uses unscaled delta on purpose: camera
   * feel should not change when the player fast-forwards the simulation.
   */
  update(delta: number): void {
    const t = 1 - Math.exp(-SMOOTHING * delta);
    this.zoom += (this.targetZoom - this.zoom) * t;
    this.target.lerp(this.desiredTarget, t);
    this.applyFrustum();
    this.applyTransform();
  }

  resize(): void {
    this.applyFrustum();
  }

  /**
   * Raycast from a pointer position against `objects`.
   * Returns the closest intersection, or null.
   */
  pick(
    clientX: number,
    clientY: number,
    objects: THREE.Object3D[],
  ): THREE.Intersection | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(objects, true);
    return hits[0] ?? null;
  }

  /** True when the last pointer-up ended a drag rather than a click. */
  get lastGestureWasDrag(): boolean {
    return this.dragMoved;
  }

  private applyFrustum(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const aspect = width / height;
    const halfHeight = BASE_VIEW_HEIGHT / this.zoom;
    const halfWidth = halfHeight * aspect;

    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  private applyTransform(): void {
    const horizontal = Math.cos(ELEVATION) * ORBIT_RADIUS;
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * horizontal,
      this.target.y + Math.sin(ELEVATION) * ORBIT_RADIUS,
      this.target.z + Math.cos(this.azimuth) * horizontal,
    );
    this.camera.lookAt(this.target);
  }

  private attachInput(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.dragMoved = false;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.lastPointerX;
      const dy = event.clientY - this.lastPointerY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      // A few pixels of slop so a slightly shaky click still counts as a click.
      if (Math.abs(dx) + Math.abs(dy) > 2) this.dragMoved = true;
      this.pan(dx, dy);
    });

    const endDrag = (event: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    };
    this.canvas.addEventListener("pointerup", endDrag);
    this.canvas.addEventListener("pointercancel", endDrag);

    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.zoomBy(event.deltaY > 0 ? 0.9 : 1.1);
      },
      { passive: false },
    );

  }
}
