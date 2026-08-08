import {
  cardBounds,
  outlinePoints,
  pieceColor,
  type SurfacePiece,
} from "../actors/SurfacePiece";
import type { RigSpec } from "../actors/Rig";
import {
  PAINT_RESOLUTION,
  createPainted,
  exportPng,
  getCanvas,
  markDirty,
  savePainted,
} from "../actors/textures";
import { traceOutline } from "../actors/trace";

/** How many undo snapshots to keep. */
const HISTORY_LIMIT = 40;

/**
 * Internal resolution of the guide overlay. Fixed and generous: the panel is
 * resizable, and the overlay is stretched by CSS rather than re-rasterised, so
 * this only needs to be high enough that the outline never looks chunky.
 */
const GUIDE_RES = 512;

const SWATCHES = [
  "#ffffff",
  "#d8d8d8",
  "#9a9aa4",
  "#5c5c66",
  "#2a2a32",
  "#f0cdaa",
  "#5b3d2b",
  "#342c4c",
  "#d9b96a",
  "#4fb3a5",
];

type Tool = "brush" | "eraser" | "line" | "rect" | "ellipse" | "fill";

const TOOLS: Array<{ value: Tool; label: string }> = [
  { value: "brush", label: "笔" },
  { value: "eraser", label: "橡皮" },
  { value: "line", label: "直线" },
  { value: "rect", label: "矩形" },
  { value: "ellipse", label: "椭圆" },
  { value: "fill", label: "填充" },
];

export interface PaintBoardHost {
  /** The piece being edited, or undefined when nothing is selected. */
  piece(): SurfacePiece | undefined;
  /** The spec that piece belongs to, for resolving its colour slot. */
  spec(): RigSpec;
  /** Rebuild the character, e.g. after assigning a texture for the first time. */
  rebuild(): void;
  /** Show a transient message in the tuner's status line. */
  say(message: string): void;
}

/**
 * A small pixel painter for surface pieces.
 *
 * The selected piece's outline is projected onto the canvas as a guide. What
 * you draw has two possible uses, and the buttons decide which:
 *
 * - 用作贴图 paints the image onto the piece's existing faces, in the colours
 *   you painted. The shape does not change.
 * - 生成形状 throws the old outline away and traces the painted alpha into a
 *   new one, which then extrudes like any other shape.
 *
 * The canvas covers a rectangle larger than the outline (`piece.pad`), so a
 * traced shape can be bigger than the one it replaces. That margin is dead
 * space for texturing -- there is no geometry out there to paint on.
 */
export class PaintBoard {
  readonly root: HTMLElement;

  private readonly stack: HTMLDivElement;
  private readonly paint: HTMLCanvasElement;
  private readonly guide: HTMLCanvasElement;

  private color = "#ffffff";
  private brush = 4;
  private tool: Tool = "brush";
  private mirror = false;

  private drawing = false;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  /** Canvas state at the start of the current stroke, for shape previews. */
  private preview: ImageData | undefined;
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
    this.paint.width = PAINT_RESOLUTION;
    this.paint.height = PAINT_RESOLUTION;
    this.guide = document.createElement("canvas");
    this.guide.className = "paint__guide";
    this.guide.width = GUIDE_RES;
    this.guide.height = GUIDE_RES;
    this.stack.append(this.paint, this.guide);
    body.appendChild(this.stack);

    body.appendChild(this.buildTools());
    this.attachPointer();
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    if (!this.root.hidden) this.refresh();
  }

  /** Called when the selection or the piece's shape changes. */
  refresh(): void {
    const piece = this.host.piece();
    const source = piece?.texture ? getCanvas(piece.texture) : undefined;
    const context = this.context();

    context.clearRect(0, 0, PAINT_RESOLUTION, PAINT_RESOLUTION);
    if (source) context.drawImage(source, 0, 0);

    this.history = [];
    this.drawGuide();
  }

  private context(): CanvasRenderingContext2D {
    const context = this.paint.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2d context unavailable");
    return context;
  }

  // --- Chrome ------------------------------------------------------------

  private buildHeader(): HTMLElement {
    const header = document.createElement("div");
    header.className = "paint-panel__header";

    const title = document.createElement("strong");
    title.textContent = `贴图画板 ${PAINT_RESOLUTION}px`;
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
      // Keep a sliver on screen so the panel can always be grabbed back.
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
        if (this.tool === "eraser") this.tool = "brush";
        this.markActive(swatches, swatch);
        this.refreshToolButtons?.();
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
      if (this.tool === "eraser") this.tool = "brush";
      this.refreshToolButtons?.();
    });
    tools.appendChild(custom);

    const toolRow = document.createElement("div");
    toolRow.className = "paint__toolgrid";
    const toolButtons: HTMLButtonElement[] = [];
    for (const entry of TOOLS) {
      const button = this.button(entry.label, () => {
        this.tool = entry.value;
        this.refreshToolButtons?.();
      });
      toolButtons.push(button);
      toolRow.appendChild(button);
    }
    this.refreshToolButtons = () => {
      toolButtons.forEach((button, index) => {
        button.classList.toggle("is-active", TOOLS[index]?.value === this.tool);
      });
    };
    this.refreshToolButtons();
    tools.appendChild(toolRow);

    tools.appendChild(this.slider("笔粗", 1, 20, 1, this.brush, (value) => {
      this.brush = value;
    }));

    const toggles = document.createElement("div");
    toggles.className = "paint__buttons";
    const mirrorButton = this.button("左右镜像", () => {
      this.mirror = !this.mirror;
      mirrorButton.classList.toggle("is-active", this.mirror);
      this.say(this.mirror ? "镜像开：画一半自动对称" : "镜像关");
    });
    toggles.append(
      mirrorButton,
      this.button("撤回", () => this.undo()),
      this.button("清空", () => this.clear()),
    );
    tools.appendChild(toggles);

    const fillRow = document.createElement("div");
    fillRow.className = "paint__buttons";
    fillRow.append(
      this.button("填满轮廓", () => this.fillOutline()),
      this.button("生成形状", () => this.traceToShape()),
      this.button("用作贴图", () => this.useAsTexture()),
    );
    tools.appendChild(fillRow);

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

  private refreshToolButtons: (() => void) | undefined;

  private slider(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onInput: (value: number) => void,
  ): HTMLElement {
    const row = document.createElement("label");
    row.className = "tuner__row";
    const name = document.createElement("span");
    name.className = "tuner__label";
    name.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const readout = document.createElement("span");
    readout.className = "tuner__value";
    readout.textContent = String(value);
    input.addEventListener("input", () => {
      onInput(Number(input.value));
      readout.textContent = input.value;
    });
    row.append(name, input, readout);
    return row;
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

  // --- Guide -------------------------------------------------------------

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

    const path = this.outlinePath(piece, GUIDE_RES);
    if (path.length > 1) {
      context.beginPath();
      path.forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.strokeStyle = "rgba(127, 231, 255, 0.85)";
      context.lineWidth = 3;
      context.stroke();
    }

    if (this.mirror) {
      context.beginPath();
      context.moveTo(GUIDE_RES / 2, 0);
      context.lineTo(GUIDE_RES / 2, GUIDE_RES);
      context.strokeStyle = "rgba(255, 255, 255, 0.35)";
      context.setLineDash([8, 8]);
      context.lineWidth = 2;
      context.stroke();
      context.setLineDash([]);
    }
  }

  /** The outline in canvas pixels, at whatever resolution is asked for. */
  private outlinePath(piece: SurfacePiece, size: number): Array<[number, number]> {
    const bounds = cardBounds(piece);
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    if (spanX <= 0 || spanY <= 0) return [];

    // Piece space has +Y up; canvas has +Y down.
    return outlinePoints(piece).map((point) => [
      ((point.x - bounds.minX) / spanX) * size,
      ((bounds.maxY - point.y) / spanY) * size,
    ]);
  }

  // --- Drawing -----------------------------------------------------------

  private attachPointer(): void {
    const toPixel = (event: PointerEvent): [number, number] => {
      const rect = this.paint.getBoundingClientRect();
      return [
        ((event.clientX - rect.left) / rect.width) * PAINT_RESOLUTION,
        ((event.clientY - rect.top) / rect.height) * PAINT_RESOLUTION,
      ];
    };

    this.stack.addEventListener("pointerdown", (event) => {
      if (!this.host.piece()) return;
      // Painting deliberately does not change the piece. The drawing is just a
      // drawing until you say what it is for -- geometry or texture -- which
      // keeps a stray stroke from silently altering the model.
      this.pushHistory();
      [this.startX, this.startY] = toPixel(event);
      this.lastX = this.startX;
      this.lastY = this.startY;

      if (this.tool === "fill") {
        this.floodFill(this.startX, this.startY);
        this.commit();
        return;
      }

      this.drawing = true;
      this.preview = this.context().getImageData(
        0,
        0,
        PAINT_RESOLUTION,
        PAINT_RESOLUTION,
      );
      if (this.tool === "brush" || this.tool === "eraser") {
        this.strokeSegment(this.startX, this.startY, this.startX, this.startY);
      }
      this.stack.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    this.stack.addEventListener("pointermove", (event) => {
      if (!this.drawing) return;
      const [x, y] = toPixel(event);

      if (this.tool === "brush" || this.tool === "eraser") {
        this.strokeSegment(this.lastX, this.lastY, x, y);
        this.lastX = x;
        this.lastY = y;
        return;
      }

      // Line, rect and ellipse: repaint from the pre-stroke snapshot every move
      // so the shape follows the cursor instead of smearing a trail.
      if (this.preview) this.context().putImageData(this.preview, 0, 0);
      this.drawShape(this.startX, this.startY, x, y);
      this.commit();
    });

    const end = (event: PointerEvent) => {
      if (!this.drawing) return;
      this.drawing = false;
      this.preview = undefined;
      if (this.stack.hasPointerCapture(event.pointerId)) {
        this.stack.releasePointerCapture(event.pointerId);
      }
    };
    this.stack.addEventListener("pointerup", end);
    this.stack.addEventListener("pointercancel", end);
  }

  /**
   * Run a drawing operation, then run it again mirrored when symmetry is on.
   *
   * Mirroring through the canvas transform rather than by mirroring
   * coordinates: it works for every tool, including ones with asymmetric
   * shapes, without each of them having to know about it.
   */
  private paintOp(draw: (context: CanvasRenderingContext2D) => void): void {
    const context = this.context();
    context.save();
    draw(context);
    context.restore();

    if (!this.mirror) return;
    context.save();
    context.setTransform(-1, 0, 0, 1, PAINT_RESOLUTION, 0);
    draw(context);
    context.restore();
  }

  private applyBrush(context: CanvasRenderingContext2D): void {
    context.globalCompositeOperation =
      this.tool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = this.color;
    context.fillStyle = this.color;
    context.lineWidth = this.brush;
    context.lineCap = "round";
    context.lineJoin = "round";
  }

  private strokeSegment(x0: number, y0: number, x1: number, y1: number): void {
    this.paintOp((context) => {
      this.applyBrush(context);
      context.beginPath();
      context.moveTo(x0, y0);
      context.lineTo(x1, y1);
      context.stroke();
    });
    this.commit();
  }

  private drawShape(x0: number, y0: number, x1: number, y1: number): void {
    this.paintOp((context) => {
      this.applyBrush(context);
      context.beginPath();
      if (this.tool === "line") {
        context.moveTo(x0, y0);
        context.lineTo(x1, y1);
      } else if (this.tool === "rect") {
        context.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      } else if (this.tool === "ellipse") {
        context.ellipse(
          (x0 + x1) / 2,
          (y0 + y1) / 2,
          Math.abs(x1 - x0) / 2,
          Math.abs(y1 - y0) / 2,
          0,
          0,
          Math.PI * 2,
        );
      }
      // Shapes fill rather than outline: at 64px a hollow rectangle is four
      // lines of pixels and almost never what you wanted.
      context.fill();
    });
  }

  /**
   * Flood fill from a point.
   *
   * Compares the full RGBA tuple, so filling into transparent regions works the
   * same as filling into a colour -- which is the common case here, since the
   * canvas starts out empty.
   */
  private floodFill(px: number, py: number): void {
    const context = this.context();
    const image = context.getImageData(0, 0, PAINT_RESOLUTION, PAINT_RESOLUTION);
    const { data } = image;

    const startX = Math.floor(px);
    const startY = Math.floor(py);
    if (
      startX < 0 ||
      startY < 0 ||
      startX >= PAINT_RESOLUTION ||
      startY >= PAINT_RESOLUTION
    ) {
      return;
    }

    const at = (x: number, y: number) => (y * PAINT_RESOLUTION + x) * 4;
    const target = at(startX, startY);
    const seed = [
      data[target] ?? 0,
      data[target + 1] ?? 0,
      data[target + 2] ?? 0,
      data[target + 3] ?? 0,
    ];

    const replacement = hexToRgb(this.color);
    if (
      seed[0] === replacement[0] &&
      seed[1] === replacement[1] &&
      seed[2] === replacement[2] &&
      seed[3] === 255
    ) {
      return;
    }

    const matches = (index: number): boolean =>
      data[index] === seed[0] &&
      data[index + 1] === seed[1] &&
      data[index + 2] === seed[2] &&
      data[index + 3] === seed[3];

    const stack: Array<[number, number]> = [[startX, startY]];
    while (stack.length > 0) {
      const next = stack.pop();
      if (!next) break;
      const [x, y] = next;
      if (x < 0 || y < 0 || x >= PAINT_RESOLUTION || y >= PAINT_RESOLUTION) continue;
      const index = at(x, y);
      if (!matches(index)) continue;

      data[index] = replacement[0];
      data[index + 1] = replacement[1];
      data[index + 2] = replacement[2];
      data[index + 3] = 255;

      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    context.putImageData(image, 0, 0);
  }

  /** Flood the piece's outline with its current colour, as a base to paint on. */
  private fillOutline(): void {
    const piece = this.host.piece();
    if (!piece) return;

    this.pushHistory();
    const path = this.outlinePath(piece, PAINT_RESOLUTION);
    if (path.length < 3) {
      this.say("这个部件没有可用的轮廓");
      return;
    }

    const context = this.context();
    context.save();
    context.globalCompositeOperation = "source-over";
    context.fillStyle =
      piece.color === "none"
        ? this.color
        : `#${pieceColor(piece.color, this.host.spec()).toString(16).padStart(6, "0")}`;
    context.beginPath();
    path.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.fill();
    context.restore();

    this.commit();
    this.say("已用部件底色填满轮廓");
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
    context.drawImage(this.paint, 0, 0);
    markDirty(piece.texture);
  }

  // --- Applying ----------------------------------------------------------

  /**
   * Trace what has been painted into a new outline and extrude it.
   *
   * The texture is dropped in the process: once the drawing has become the
   * shape, keeping it as a colour map as well would just repeat it.
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

  /** Paint the drawing onto the piece's existing faces, shape untouched. */
  private useAsTexture(): void {
    const piece = this.host.piece();
    if (!piece) return;
    if (!piece.texture) {
      piece.texture = createPainted();
      this.host.rebuild();
    }
    this.commit();
    this.say("已贴到部件表面，形状不变");
  }

  private detach(): void {
    const piece = this.host.piece();
    if (!piece?.texture) return;
    delete piece.texture;
    this.host.rebuild();
    this.say("已移除贴图，恢复纯色");
  }

  // --- History -----------------------------------------------------------

  private pushHistory(): void {
    this.history.push(
      this.context().getImageData(0, 0, PAINT_RESOLUTION, PAINT_RESOLUTION),
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
    this.context().clearRect(0, 0, PAINT_RESOLUTION, PAINT_RESOLUTION);
    this.commit();
  }

  private say(message: string): void {
    this.host.say(message);
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
