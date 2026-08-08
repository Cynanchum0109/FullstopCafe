import { cardBounds, outlinePoints, type SurfacePiece } from "../actors/SurfacePiece";
import {
  PAINT_RESOLUTION,
  createPainted,
  exportPng,
  getCanvas,
  markDirty,
  paintSize,
  savePainted,
} from "../actors/textures";
import { traceOutline } from "../actors/trace";

/** How many undo snapshots to keep. */
const HISTORY_LIMIT = 40;

/**
 * Pixels along the guide overlay's longer side. Generous and independent of the
 * paint resolution: the panel is resizable and the overlay is stretched by CSS
 * rather than re-rasterised, so this only needs to be high enough that the
 * outline never looks chunky.
 */
const GUIDE_LONG_SIDE = 512;

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

type FlipKind = "flip-x" | "flip-y";

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

  /** The drawing as it was before the current rotate session, and its angle. */
  private rotateBase: HTMLCanvasElement | undefined;
  private rotation = 0;
  private rotationInput: HTMLInputElement | undefined;
  private rotationReadout: HTMLSpanElement | undefined;

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
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    if (!this.root.hidden) this.refresh();
  }

  /** Called when the selection or the piece's shape changes. */
  refresh(): void {
    const piece = this.host.piece();
    this.resizeToPiece();

    const source = piece?.texture ? getCanvas(piece.texture) : undefined;
    const context = this.context();
    context.clearRect(0, 0, this.paint.width, this.paint.height);
    if (source) {
      // Scaled, not blitted: resizing the piece changes the board's aspect, and
      // an existing painting should follow the shape rather than be cropped.
      context.drawImage(source, 0, 0, this.paint.width, this.paint.height);
    }

    this.history = [];
    this.endRotate();
    this.drawGuide();
  }

  /**
   * Follow a live change to the piece's proportions without disturbing the
   * painting or the undo history.
   *
   * Called while width, length and pad sliders are being dragged, so it has to
   * be cheap and non-destructive -- `refresh` would reload from the stored
   * texture and drop undo steps on every tick.
   */
  resync(): void {
    if (this.root.hidden) return;

    const piece = this.host.piece();
    const wanted = paintSize(piece ? aspectOf(piece) : 1);
    if (wanted.width !== this.paint.width || wanted.height !== this.paint.height) {
      // Resizing a canvas clears it, so keep a copy and scale it back in.
      const backup = document.createElement("canvas");
      backup.width = this.paint.width;
      backup.height = this.paint.height;
      backup.getContext("2d")?.drawImage(this.paint, 0, 0);

      this.resizeToPiece();
      this.context().drawImage(backup, 0, 0, this.paint.width, this.paint.height);
      // The snapshot the rotation slider holds is the old size, and the board's
      // aspect just changed, so the session cannot be carried across.
      this.endRotate();
      this.commit();
    } else {
      this.resizeToPiece();
    }

    this.drawGuide();
  }

  /**
   * Match the board to the piece's proportions.
   *
   * Both the pixel grid and the on-screen box follow the card rectangle, so
   * texels stay square and a circle drawn here is a circle on the model.
   */
  private resizeToPiece(): void {
    const piece = this.host.piece();
    const aspect = piece ? aspectOf(piece) : 1;

    const size = paintSize(aspect);
    if (this.paint.width !== size.width || this.paint.height !== size.height) {
      this.paint.width = size.width;
      this.paint.height = size.height;
    }

    const guide = guideSize(aspect);
    if (this.guide.width !== guide.width || this.guide.height !== guide.height) {
      this.guide.width = guide.width;
      this.guide.height = guide.height;
    }

    // Fit the box inside the panel while keeping the aspect exactly. Letting
    // CSS clamp the height instead would break the aspect, and the drawing
    // would be stretched again -- the very thing this is here to prevent.
    const available = this.root.clientWidth - 20 || 300;
    const maxHeight = Math.max(160, window.innerHeight * 0.5);
    const width = Math.min(available, maxHeight * aspect);
    this.stack.style.width = `${Math.round(width)}px`;
    this.stack.style.height = `${Math.round(width / aspect)}px`;
    this.stack.style.aspectRatio = "auto";
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

    const transforms = document.createElement("div");
    transforms.className = "paint__buttons";
    transforms.append(
      this.button("左右翻转", () => this.flip("flip-x")),
      this.button("上下翻转", () => this.flip("flip-y")),
    );
    tools.appendChild(transforms);

    tools.appendChild(this.buildRotationRow());

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
    const { width, height } = this.guide;
    context.clearRect(0, 0, width, height);

    const piece = this.host.piece();
    if (!piece) return;

    const path = this.outlinePath(piece, width, height);
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
      context.moveTo(width / 2, 0);
      context.lineTo(width / 2, height);
      context.strokeStyle = "rgba(255, 255, 255, 0.35)";
      context.setLineDash([8, 8]);
      context.lineWidth = 2;
      context.stroke();
      context.setLineDash([]);
    }
  }

  /** The outline in canvas pixels, at whatever resolution is asked for. */
  private outlinePath(
    piece: SurfacePiece,
    width: number,
    height: number,
  ): Array<[number, number]> {
    const bounds = cardBounds(piece);
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    if (spanX <= 0 || spanY <= 0) return [];

    // Piece space has +Y up; canvas has +Y down.
    return outlinePoints(piece).map((point) => [
      ((point.x - bounds.minX) / spanX) * width,
      ((bounds.maxY - point.y) / spanY) * height,
    ]);
  }

  // --- Drawing -----------------------------------------------------------

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
      this.endRotate();
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
        this.paint.width,
        this.paint.height,
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
    context.setTransform(-1, 0, 0, 1, this.paint.width, 0);
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
    const width = this.paint.width;
    const height = this.paint.height;
    const image = context.getImageData(0, 0, width, height);
    const { data } = image;

    const startX = Math.floor(px);
    const startY = Math.floor(py);
    if (
      startX < 0 ||
      startY < 0 ||
      startX >= width ||
      startY >= height
    ) {
      return;
    }

    const at = (x: number, y: number) => (y * width + x) * 4;
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
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
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

  // --- Transforms --------------------------------------------------------

  /**
   * Mirror the drawing in place. Lossless: no scaling, so flipping twice
   * returns exactly the pixels you started with.
   *
   * The guide outline belongs to the piece, not the drawing, so it stays put
   * and you can see how the flipped image now lands on the shape.
   */
  private flip(kind: FlipKind): void {
    if (!this.host.piece()) return;
    this.endRotate();
    this.pushHistory();

    const width = this.paint.width;
    const height = this.paint.height;
    const backup = this.snapshot();

    const context = this.context();
    context.save();
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, width, height);
    if (kind === "flip-x") context.setTransform(-1, 0, 0, 1, width, 0);
    else context.setTransform(1, 0, 0, -1, 0, height);
    context.drawImage(backup, 0, 0);
    context.restore();

    this.commit();
    this.say(kind === "flip-x" ? "已左右翻转" : "已上下翻转");
  }

  /**
   * Free rotation on a slider.
   *
   * The angle is *absolute*, not a series of nudges. Dragging opens a session
   * that snapshots the drawing once, and every tick re-renders that same
   * snapshot at the slider's angle. Rendering each tick on top of the previous
   * one is what made an earlier version shrink a little further every time you
   * touched it: the board is locked to the piece's aspect, so a turned image
   * has to be scaled down to fit back inside, and repeating that compounds.
   * Against a fixed snapshot the scale is a function of the angle alone --
   * dragging back to 0° restores the original exactly.
   *
   * The session ends when anything else changes the pixels, at which point the
   * rotated result becomes the new starting point.
   */
  private buildRotationRow(): HTMLElement {
    const row = document.createElement("label");
    row.className = "tuner__row";

    const name = document.createElement("span");
    name.className = "tuner__label";
    name.textContent = "旋转";

    const input = document.createElement("input");
    input.type = "range";
    input.min = "-180";
    input.max = "180";
    input.step = "1";
    input.value = "0";

    const readout = document.createElement("span");
    readout.className = "tuner__value";
    readout.textContent = "0°";

    input.addEventListener("input", () => {
      if (!this.host.piece()) {
        input.value = String(this.rotation);
        return;
      }
      this.beginRotate();
      this.rotation = Number(input.value);
      readout.textContent = `${this.rotation}°`;
      this.applyRotation();
    });

    this.rotationInput = input;
    this.rotationReadout = readout;
    row.append(name, input, readout);
    return row;
  }

  /** Snapshot the drawing once, at the start of a rotate session. */
  private beginRotate(): void {
    if (this.rotateBase) return;
    // Only the first tick of a drag is an undo step; the rest of the drag is
    // the same edit being adjusted.
    this.pushHistory();
    this.rotateBase = this.snapshot();
  }

  /** Draw the session's snapshot at the current angle. */
  private applyRotation(): void {
    const base = this.rotateBase;
    if (!base) return;

    const width = this.paint.width;
    const height = this.paint.height;
    const angle = (this.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    // Bounding box of the turned rectangle, then the largest scale that still
    // fits it back inside the board. Exactly 1 at 0°, so a round trip is free.
    const fit = Math.min(
      1,
      width / (width * cos + height * sin),
      height / (width * sin + height * cos),
    );

    const context = this.context();
    context.save();
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, width, height);
    context.setTransform(1, 0, 0, 1, width / 2, height / 2);
    context.rotate(angle);
    context.scale(fit, fit);
    context.drawImage(base, -width / 2, -height / 2);
    context.restore();

    this.commit();
  }

  /**
   * Close any rotate session and put the slider back to 0.
   *
   * Called wherever the pixels change by other means -- a stroke, undo, a
   * reload -- because the snapshot the slider was working from no longer
   * describes what is on the board.
   */
  private endRotate(): void {
    this.rotateBase = undefined;
    this.rotation = 0;
    if (this.rotationInput) this.rotationInput.value = "0";
    if (this.rotationReadout) this.rotationReadout.textContent = "0°";
  }

  /** A copy of the board, as a canvas that can be drawn through a transform. */
  private snapshot(): HTMLCanvasElement {
    const copy = document.createElement("canvas");
    copy.width = this.paint.width;
    copy.height = this.paint.height;
    copy.getContext("2d")?.drawImage(this.paint, 0, 0);
    return copy;
  }

  /** Flood the piece's outline with its current colour, as a base to paint on. */
  private fillOutline(): void {
    const piece = this.host.piece();
    if (!piece) return;

    this.endRotate();
    this.pushHistory();
    const path = this.outlinePath(piece, this.paint.width, this.paint.height);
    if (path.length < 3) {
      this.say("这个部件没有可用的轮廓");
      return;
    }

    const context = this.context();
    context.save();
    context.globalCompositeOperation = "source-over";
    context.fillStyle = `#${piece.color.toString(16).padStart(6, "0")}`;
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
    // Scaled: a texture created before the piece was resized has the old
    // dimensions, and cropping it would silently lose part of the painting.
    context.drawImage(this.paint, 0, 0, target.width, target.height);
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
      piece.texture = createPainted(this.paint.width, this.paint.height);
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
      this.context().getImageData(0, 0, this.paint.width, this.paint.height),
    );
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  private undo(): void {
    this.endRotate();
    const previous = this.history.pop();
    if (!previous) {
      this.say("没有可撤回的步骤");
      return;
    }
    this.context().putImageData(previous, 0, 0);
    this.commit();
  }

  private clear(): void {
    this.endRotate();
    this.pushHistory();
    this.context().clearRect(0, 0, this.paint.width, this.paint.height);
    this.commit();
  }

  private say(message: string): void {
    this.host.say(message);
  }
}

/** Width over height of a piece's card rectangle. */
function aspectOf(piece: SurfacePiece): number {
  const bounds = cardBounds(piece);
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  if (spanX <= 0 || spanY <= 0) return 1;
  return spanX / spanY;
}

/** Guide overlay size for an aspect, with the longer side at GUIDE_LONG_SIDE. */
function guideSize(aspect: number): { width: number; height: number } {
  if (aspect >= 1) {
    return {
      width: GUIDE_LONG_SIDE,
      height: Math.max(64, Math.round(GUIDE_LONG_SIDE / aspect)),
    };
  }
  return {
    width: Math.max(64, Math.round(GUIDE_LONG_SIDE * aspect)),
    height: GUIDE_LONG_SIDE,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
