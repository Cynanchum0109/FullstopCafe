import { cardBounds, outlinePoints, type SurfacePiece } from "../actors/SurfacePiece";
import {
  createPainted,
  exportPng,
  getCanvas,
  markDirty,
  savePainted,
} from "../actors/textures";
import { traceOutline } from "../actors/trace";

/** Canvas resolutions offered in the toolbar. Small on purpose. */
const RESOLUTIONS = [64, 96, 128, 192] as const;
/** How many undo snapshots to keep. */
const HISTORY_LIMIT = 30;
/**
 * Internal resolution of the guide overlay. Fixed and generous: the panel is
 * resizable, and the overlay is stretched by CSS rather than re-rasterised, so
 * this only needs to be high enough that the outline never looks chunky.
 */
const GUIDE_RES = 512;

const SWATCHES = [
  "#ffffff",
  "#d8d8d8",
  "#a8a8a8",
  "#787878",
  "#4a4a4a",
  "#1c1c1c",
  "#e8c9a0",
  "#c08a5a",
];

export interface PaintBoardHost {
  /** The piece being edited, or undefined when nothing is selected. */
  piece(): SurfacePiece | undefined;
  /** Rebuild the character, e.g. after assigning a texture for the first time. */
  rebuild(): void;
  /** Show a transient message in the tuner's status line. */
  say(message: string): void;
}

/**
 * A small pixel painter for hair cards.
 *
 * The selected piece's outline is projected onto the canvas as a guide, but it
 * does not clip anything: the canvas covers a rectangle larger than the outline
 * (`piece.pad`), so strokes can spill past the original shape and the card just
 * grows to hold them. That is the whole point -- the drawn alpha becomes the
 * silhouette, and the polygon stops mattering.
 *
 * Canvas is square while the card usually is not, so the guide is drawn with
 * the same distortion the texture will get. What you draw is what appears.
 */
export class PaintBoard {
  readonly root: HTMLElement;

  private readonly stack: HTMLDivElement;
  private readonly paint: HTMLCanvasElement;
  private readonly guide: HTMLCanvasElement;

  private color = "#ffffff";
  private brush = 6;
  private erasing = false;
  private resolution: number = 128;

  private drawing = false;
  private lastX = 0;
  private lastY = 0;
  private history: ImageData[] = [];

  constructor(private readonly host: PaintBoardHost) {
    this.root = document.createElement("div");
    this.root.className = "panel paint-panel";
    this.root.hidden = true;

    this.root.appendChild(this.buildHeader());

    const body = document.createElement("div");
    body.className = "paint-panel__body";
    this.root.appendChild(body);

    this.stack = document.createElement("div");
    this.stack.className = "paint__stack";

    this.paint = document.createElement("canvas");
    this.paint.className = "paint__canvas";
    this.guide = document.createElement("canvas");
    this.guide.className = "paint__guide";
    this.stack.append(this.paint, this.guide);
    body.appendChild(this.stack);

    body.appendChild(this.buildTools());
    this.attachPointer();
    this.resizeGuide();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    if (!this.root.hidden) this.refresh();
  }

  /**
   * Title bar: drags the panel around. The panel itself is CSS-resizable from
   * its bottom-right corner, which is plenty of chrome for a dev tool.
   */
  private buildHeader(): HTMLElement {
    const header = document.createElement("div");
    header.className = "paint-panel__header";

    const title = document.createElement("strong");
    title.textContent = "贴图画板";
    header.appendChild(title);

    const close = document.createElement("button");
    close.className = "paint-panel__close";
    close.textContent = "×";
    close.addEventListener("click", () => {
      this.root.hidden = true;
    });
    header.appendChild(close);

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener("pointerdown", (event) => {
      if (event.target === close) return;
      const rect = this.root.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      dragging = true;
      header.setPointerCapture(event.pointerId);
    });

    header.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      // Keep at least a sliver on screen so the panel can always be grabbed back.
      const maxLeft = window.innerWidth - 60;
      const maxTop = window.innerHeight - 40;
      this.root.style.left = `${Math.min(Math.max(event.clientX - offsetX, 0), maxLeft)}px`;
      this.root.style.top = `${Math.min(Math.max(event.clientY - offsetY, 0), maxTop)}px`;
      this.root.style.right = "auto";
    });

    const end = (event: PointerEvent) => {
      dragging = false;
      if (header.hasPointerCapture(event.pointerId)) {
        header.releasePointerCapture(event.pointerId);
      }
    };
    header.addEventListener("pointerup", end);
    header.addEventListener("pointercancel", end);

    return header;
  }

  /** Called when the selection or the piece's shape changes. */
  refresh(): void {
    const piece = this.host.piece();
    const canvas = piece?.texture ? getCanvas(piece.texture) : undefined;

    if (canvas) {
      this.paint.width = canvas.width;
      this.paint.height = canvas.height;
      this.resolution = canvas.width;
      this.context().drawImage(canvas, 0, 0);
      this.paint.style.display = "block";
    } else {
      // No texture yet: show an empty board at the current resolution so the
      // guide is still useful for planning a shape.
      this.paint.width = this.resolution;
      this.paint.height = this.resolution;
      this.context().clearRect(0, 0, this.resolution, this.resolution);
    }

    this.history = [];
    this.drawGuide();
  }

  private context(): CanvasRenderingContext2D {
    const context = this.paint.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2d context unavailable");
    return context;
  }

  private resizeGuide(): void {
    this.guide.width = GUIDE_RES;
    this.guide.height = GUIDE_RES;
  }

  /**
   * Project the piece's outline onto the board.
   *
   * Drawn on a separate overlay canvas, never into the texture -- it is a
   * reference for the eye, not part of the image.
   */
  private drawGuide(): void {
    const context = this.guide.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, GUIDE_RES, GUIDE_RES);

    const piece = this.host.piece();
    if (!piece) return;

    const bounds = cardBounds(piece);
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    if (spanX <= 0 || spanY <= 0) return;

    // Piece space has +Y up; canvas has +Y down.
    const toCanvas = (x: number, y: number): [number, number] => [
      ((x - bounds.minX) / spanX) * GUIDE_RES,
      ((bounds.maxY - y) / spanY) * GUIDE_RES,
    ];

    const points = outlinePoints(piece);
    if (points.length > 1) {
      context.beginPath();
      points.forEach((point, index) => {
        const [x, y] = toCanvas(point.x, point.y);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.strokeStyle = "rgba(127, 231, 255, 0.85)";
      context.lineWidth = 3;
      context.stroke();
      context.fillStyle = "rgba(127, 231, 255, 0.08)";
      context.fill();
    }

    // The root line: hair meets scalp along the top edge of the outline.
    const [, rootY] = toCanvas(0, 0);
    context.beginPath();
    context.moveTo(0, rootY);
    context.lineTo(GUIDE_RES, rootY);
    context.strokeStyle = "rgba(255, 180, 120, 0.7)";
    context.setLineDash([10, 10]);
    context.lineWidth = 2;
    context.stroke();
    context.setLineDash([]);
  }

  private buildTools(): HTMLElement {
    const tools = document.createElement("div");
    tools.className = "paint__tools";

    const swatches = document.createElement("div");
    swatches.className = "paint__swatches";
    for (const value of SWATCHES) {
      const swatch = document.createElement("button");
      swatch.className = "paint__swatch";
      swatch.style.background = value;
      swatch.addEventListener("click", () => {
        this.color = value;
        this.erasing = false;
        this.markActive(swatches, swatch);
      });
      swatches.appendChild(swatch);
    }
    tools.appendChild(swatches);

    const custom = document.createElement("input");
    custom.type = "color";
    custom.value = this.color;
    custom.className = "paint__custom";
    custom.addEventListener("input", () => {
      this.color = custom.value;
      this.erasing = false;
    });
    tools.appendChild(custom);

    const brushRow = document.createElement("label");
    brushRow.className = "tuner__row";
    const brushLabel = document.createElement("span");
    brushLabel.className = "tuner__label";
    brushLabel.textContent = "笔粗";
    const brushInput = document.createElement("input");
    brushInput.type = "range";
    brushInput.min = "1";
    brushInput.max = "24";
    brushInput.step = "1";
    brushInput.value = String(this.brush);
    const brushValue = document.createElement("span");
    brushValue.className = "tuner__value";
    brushValue.textContent = String(this.brush);
    brushInput.addEventListener("input", () => {
      this.brush = Number(brushInput.value);
      brushValue.textContent = brushInput.value;
    });
    brushRow.append(brushLabel, brushInput, brushValue);
    tools.appendChild(brushRow);

    const resRow = document.createElement("label");
    resRow.className = "tuner__row";
    const resLabel = document.createElement("span");
    resLabel.className = "tuner__label";
    resLabel.textContent = "分辨率";
    const resSelect = document.createElement("select");
    resSelect.className = "tuner__select";
    for (const value of RESOLUTIONS) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value}px`;
      option.selected = value === this.resolution;
      resSelect.appendChild(option);
    }
    resSelect.addEventListener("change", () => {
      this.resolution = Number(resSelect.value);
      this.say(`新建贴图时使用 ${this.resolution}px`);
    });
    resRow.append(resLabel, resSelect);
    tools.appendChild(resRow);

    const buttons = document.createElement("div");
    buttons.className = "paint__buttons";
    buttons.append(
      this.button("橡皮", () => {
        this.erasing = !this.erasing;
        this.say(this.erasing ? "橡皮开" : "橡皮关");
      }),
      this.button("撤回", () => this.undo()),
      this.button("清空", () => this.clear()),
    );
    tools.appendChild(buttons);

    const shapeActions = document.createElement("div");
    shapeActions.className = "paint__buttons";
    shapeActions.append(
      this.button("生成形状", () => this.traceToShape()),
      this.button("用作贴图", () => this.useAsTexture()),
    );
    tools.appendChild(shapeActions);

    const actions = document.createElement("div");
    actions.className = "paint__buttons";
    actions.append(
      this.button("保存", () => {
        const count = savePainted();
        this.say(count ? `已保存 ${count} 张贴图到本地` : "保存失败");
      }),
      this.button("导出 PNG", () => {
        const piece = this.host.piece();
        if (!piece?.texture || !exportPng(piece.texture)) {
          this.say("这个部件还没有贴图");
        }
      }),
      this.button("移除贴图", () => this.detach()),
    );
    tools.appendChild(actions);

    return tools;
  }

  private markActive(container: HTMLElement, active: HTMLElement): void {
    for (const child of container.children) child.classList.remove("is-active");
    active.classList.add("is-active");
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "tuner__button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  private attachPointer(): void {
    const toPixel = (event: PointerEvent): [number, number] => {
      const rect = this.paint.getBoundingClientRect();
      return [
        ((event.clientX - rect.left) / rect.width) * this.paint.width,
        ((event.clientY - rect.top) / rect.height) * this.paint.height,
      ];
    };

    this.stack.addEventListener("pointerdown", (event) => {
      if (!this.host.piece()) return;
      // Painting deliberately does not change the piece. The drawing is just a
      // drawing until you say what it is for -- geometry or texture -- which
      // keeps a stray stroke from silently flipping the piece into card mode.
      this.pushHistory();
      this.drawing = true;
      [this.lastX, this.lastY] = toPixel(event);
      this.stroke(this.lastX, this.lastY, this.lastX, this.lastY);
      this.stack.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    this.stack.addEventListener("pointermove", (event) => {
      if (!this.drawing) return;
      const [x, y] = toPixel(event);
      this.stroke(this.lastX, this.lastY, x, y);
      this.lastX = x;
      this.lastY = y;
    });

    const end = (event: PointerEvent) => {
      if (!this.drawing) return;
      this.drawing = false;
      if (this.stack.hasPointerCapture(event.pointerId)) {
        this.stack.releasePointerCapture(event.pointerId);
      }
    };
    this.stack.addEventListener("pointerup", end);
    this.stack.addEventListener("pointercancel", end);
  }

  private stroke(x0: number, y0: number, x1: number, y1: number): void {
    const context = this.context();
    context.globalCompositeOperation = this.erasing ? "destination-out" : "source-over";
    context.strokeStyle = this.color;
    context.fillStyle = this.color;
    context.lineWidth = this.brush;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    context.stroke();
    context.globalCompositeOperation = "source-over";
    this.commit();
  }

  /** Copy the board onto the stored canvas and push it to the GPU. */
  private commit(): void {
    const piece = this.host.piece();
    if (!piece?.texture) return;
    const target = getCanvas(piece.texture);
    if (!target) return;
    const context = target.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(this.paint, 0, 0, target.width, target.height);
    markDirty(piece.texture);
  }

  /** Give the piece a fresh texture holding whatever is on the board. */
  private attach(piece: SurfacePiece): void {
    piece.texture = createPainted(this.paint.width);
    this.host.rebuild();
    this.host.say("已切换为贴图卡片，轮廓改由图片的 alpha 决定");
  }

  /**
   * Trace what has been painted into a real outline and extrude it.
   *
   * The texture is dropped in the process: once the drawing has become
   * geometry, keeping it as an alpha mask as well would just clip the shape a
   * second time.
   */
  private traceToShape(): void {
    const piece = this.host.piece();
    if (!piece) return;

    const points = traceOutline(this.paint);
    if (points.length < 3) {
      this.say("画布上没有可追踪的形状");
      return;
    }

    piece.path = points.flatMap((point) => [point.x, point.y]);
    piece.shape = "custom";
    delete piece.texture;
    this.host.rebuild();
    this.drawGuide();
    this.say(`已生成形状：${points.length} 个顶点，厚度角度照常可调`);
  }

  /** Keep the drawing as an alpha-cut card instead of turning it into geometry. */
  private useAsTexture(): void {
    const piece = this.host.piece();
    if (!piece) return;
    if (!piece.texture) this.attach(piece);
    this.commit();
    this.say("已作为贴图卡片使用");
  }

  private detach(): void {
    const piece = this.host.piece();
    if (!piece?.texture) return;
    delete piece.texture;
    this.host.rebuild();
    this.refresh();
    this.say("已移回多边形轮廓");
  }

  private pushHistory(): void {
    const context = this.context();
    this.history.push(
      context.getImageData(0, 0, this.paint.width, this.paint.height),
    );
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  private undo(): void {
    const previous = this.history.pop();
    if (!previous) {
      this.say("没有可撤回的步骤");
      return;
    }
    this.context().putImageData(previous, 0, 0);
    this.commit();
  }

  private clear(): void {
    this.pushHistory();
    this.context().clearRect(0, 0, this.paint.width, this.paint.height);
    this.commit();
  }

  private say(message: string): void {
    this.host.say(message);
  }
}
