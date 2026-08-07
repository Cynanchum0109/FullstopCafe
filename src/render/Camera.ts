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

/**
 * Orthographic isometric camera with four fixed viewing corners.
 *
 * Rotation snaps to 90 degree steps so the cutaway room always keeps the same
 * two walls behind the action; dragging or Q/E nudges it to the next corner and
 * it eases the rest of the way.
 */
export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  readonly target = new THREE.Vector3(0, 0.5, 0);

  /** Which of the four corners we are heading to. */
  private quadrant = 0;
  private azimuth = Math.PI / 4;
  private targetAzimuth = Math.PI / 4;
  private zoom = 1;
  private targetZoom = 1;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private dragging = false;
  private dragStartX = 0;
  private dragMoved = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.applyFrustum();
    this.applyTransform();
    this.attachInput();
  }

  /** Step to the next / previous corner. `direction` is +1 or -1. */
  rotate(direction: number): void {
    this.quadrant += direction;
    this.targetAzimuth = Math.PI / 4 + this.quadrant * (Math.PI / 2);
  }

  /** Multiply the zoom level; >1 zooms in. */
  zoomBy(factor: number): void {
    this.targetZoom = THREE.MathUtils.clamp(
      this.targetZoom * factor,
      MIN_ZOOM,
      MAX_ZOOM,
    );
  }

  /**
   * Ease toward the target orientation. Uses unscaled delta on purpose: camera
   * feel should not change when the player fast-forwards the simulation.
   */
  update(delta: number): void {
    const t = 1 - Math.exp(-SMOOTHING * delta);
    this.azimuth += (this.targetAzimuth - this.azimuth) * t;
    this.zoom += (this.targetZoom - this.zoom) * t;
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
      this.dragStartX = event.clientX;
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.dragStartX;
      // One corner per ~120px of horizontal drag, then re-arm.
      if (Math.abs(dx) > 120) {
        this.rotate(dx > 0 ? -1 : 1);
        this.dragStartX = event.clientX;
        this.dragMoved = true;
      }
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

    window.addEventListener("keydown", (event) => {
      if (event.key === "q" || event.key === "Q") this.rotate(-1);
      if (event.key === "e" || event.key === "E") this.rotate(1);
    });
  }
}
