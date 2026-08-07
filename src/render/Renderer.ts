import * as THREE from "three";

/**
 * A post-processing step. Reads `input`, writes to `output` (or to the canvas
 * when `output` is null). Phase 1 ships zero passes; pixelate / outline get
 * added later without anything else in the codebase changing.
 */
export interface RenderPass {
  readonly name: string;
  setSize(width: number, height: number): void;
  render(
    renderer: THREE.WebGLRenderer,
    input: THREE.Texture,
    output: THREE.WebGLRenderTarget | null,
  ): void;
  dispose(): void;
}

/**
 * Owns the WebGL renderer plus an optional chain of post passes.
 *
 * With no passes it draws the scene straight to the canvas, which is what we
 * want for the flat-shaded look. Adding passes swaps in an offscreen target
 * automatically.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;

  private passes: RenderPass[] = [];
  private targetA: THREE.WebGLRenderTarget | null = null;
  private targetB: THREE.WebGLRenderTarget | null = null;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.shadowMap.enabled = true;
    // Soft shadows suit the toy-like look better than hard edges.
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.setClearColor(0x10101a, 1);

    this.resize();
  }

  /** Replace the post chain. Pass an empty array to render direct to canvas. */
  setPasses(passes: RenderPass[]): void {
    this.passes = passes;
    this.ensureTargets();
    for (const pass of passes) pass.setSize(this.width, this.height);
  }

  /** Match the drawing buffer to the canvas' CSS size. Safe to call per frame. */
  resize(): void {
    const canvas = this.gl.domElement;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    if (width === this.width && height === this.height) return;

    this.width = width;
    this.height = height;
    // Cap DPR: this art style gains nothing from 3x pixels but pays full cost.
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.setSize(width, height, false);

    if (this.targetA && this.targetB) {
      const ratio = this.gl.getPixelRatio();
      this.targetA.setSize(width * ratio, height * ratio);
      this.targetB.setSize(width * ratio, height * ratio);
    }
    for (const pass of this.passes) pass.setSize(width, height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.passes.length === 0) {
      this.gl.setRenderTarget(null);
      this.gl.render(scene, camera);
      return;
    }

    const targetA = this.targetA;
    const targetB = this.targetB;
    if (!targetA || !targetB) return;

    this.gl.setRenderTarget(targetA);
    this.gl.clear();
    this.gl.render(scene, camera);

    // Ping-pong between the two targets; the last pass writes to the canvas.
    let source = targetA;
    let destination = targetB;
    for (let i = 0; i < this.passes.length; i++) {
      const pass = this.passes[i];
      if (!pass) continue;
      const isLast = i === this.passes.length - 1;
      pass.render(this.gl, source.texture, isLast ? null : destination);
      if (!isLast) {
        const swap = source;
        source = destination;
        destination = swap;
      }
    }
    this.gl.setRenderTarget(null);
  }

  private ensureTargets(): void {
    if (this.passes.length === 0) {
      this.targetA?.dispose();
      this.targetB?.dispose();
      this.targetA = null;
      this.targetB = null;
      return;
    }
    if (this.targetA && this.targetB) return;

    const ratio = this.gl.getPixelRatio();
    const options: THREE.RenderTargetOptions = {
      colorSpace: THREE.SRGBColorSpace,
      depthBuffer: true,
    };
    this.targetA = new THREE.WebGLRenderTarget(
      this.width * ratio,
      this.height * ratio,
      options,
    );
    this.targetB = new THREE.WebGLRenderTarget(
      this.width * ratio,
      this.height * ratio,
      options,
    );
  }

  dispose(): void {
    for (const pass of this.passes) pass.dispose();
    this.targetA?.dispose();
    this.targetB?.dispose();
    this.gl.dispose();
  }
}
