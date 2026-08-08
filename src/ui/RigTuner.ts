import type { Actor } from "../actors/Actor";
import { events } from "../core/Events";
import { DEFAULT_RIG_SPEC, type RigSpec } from "../actors/Rig";
import {
  PIECE_COLORS,
  PIECE_CONTROLS,
  PIECE_SHAPES,
  RIG_COLOR_CONTROLS,
  RIG_CONTROL_GROUPS,
  TUNABLE_KEYS,
  type NumberControl,
  type PieceControl,
} from "../actors/rigControls";
import {
  DEFAULT_PIECE,
  mirrored,
  type PieceColor,
  type PieceShape,
  type SurfacePiece,
} from "../actors/SurfacePiece";
import { listTextures } from "../actors/textures";
import { PaintBoard } from "./PaintBoard";

/** What the tuner needs from the camera. Keeps it decoupled from IsoCamera. */
export interface TunerCamera {
  focusOn(x: number, y: number, z: number, zoom: number): void;
  clearFocus(): void;
}

/**
 * Live character editor. Every number in `RigSpec` becomes a slider, the rig is
 * rebuilt on change, and the result can be copied out as a `spec` block to
 * paste straight into `actors/profiles/index.ts`.
 *
 * This exists because eyeballing a procedural character through code edits is
 * miserable -- the feedback loop is a page reload per guess. Sliders turn that
 * into a few seconds.
 */
export class RigTuner {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly status: HTMLDivElement;

  /** Working copy per actor, seeded from whatever they were built with. */
  private readonly specs = new Map<string, RigSpec>();
  /** Untouched copy of each actor's authored look, for the reset button. */
  private readonly baselines = new Map<string, RigSpec>();
  private current: Actor;
  private open = false;
  /** Rebuilt on every actor switch, so sliders show the right values. */
  private inputs: Array<() => void> = [];
  /** Index into the current spec's `pieces`, or -1 when none is selected. */
  private pieceIndex = 0;
  private yawInput: HTMLInputElement | undefined;
  private yawValue: HTMLSpanElement | undefined;
  private paint: PaintBoard | undefined;
  private refreshPieceList: (() => void) | undefined;

  constructor(
    container: HTMLElement,
    private readonly actors: Actor[],
    private readonly camera: TunerCamera,
  ) {
    const first = actors[0];
    if (!first) throw new Error("RigTuner needs at least one actor");
    this.current = first;
    for (const actor of actors) {
      // Deep-copy the piece list: the working copy must not alias the array the
      // profile module exports, or editing one character mutates the source.
      this.specs.set(actor.id, copySpec(actor.rig.spec));
      this.baselines.set(actor.id, copySpec(actor.rig.spec));
    }

    this.root = document.createElement("div");
    this.root.className = "panel panel--tuner";
    this.root.hidden = true;

    const header = document.createElement("div");
    header.className = "tuner__header";
    header.innerHTML = `<strong>模型调整器</strong><span class="tuner__hint">\` 开关</span>`;
    this.root.appendChild(header);

    this.tabs = document.createElement("div");
    this.tabs.className = "tuner__tabs";
    this.root.appendChild(this.tabs);

    this.body = document.createElement("div");
    this.body.className = "tuner__body";
    this.root.appendChild(this.body);

    // The camera snaps to fixed corners, so turning the character is the only
    // way to inspect a profile or the back of the head.
    this.root.appendChild(this.buildYawRow());

    const footer = document.createElement("div");
    footer.className = "tuner__footer";
    footer.appendChild(this.button("复制 spec", () => this.copySpec()));
    footer.appendChild(this.button("重置", () => this.reset()));
    this.root.appendChild(footer);

    this.status = document.createElement("div");
    this.status.className = "tuner__status";
    this.root.appendChild(this.status);

    container.appendChild(this.root);

    // One instance for the whole session, living outside the sidebar so it can
    // be dragged and resized freely.
    this.paint = new PaintBoard({
      piece: () => this.piece(),
      spec: () => this.spec(),
      rebuild: () => {
        this.rebuild();
        this.refreshPieceList?.();
        for (const refresh of this.inputs) refresh();
      },
      say: (message) => this.say(message),
    });
    container.appendChild(this.paint.root);

    this.buildTabs();
    this.buildControls();

    window.addEventListener("keydown", (event) => {
      // Backquote, and the tilde it shares a key with.
      if (event.key === "`" || event.key === "~") this.toggle();
    });
  }

  toggle(): void {
    this.open = !this.open;
    this.root.hidden = !this.open;
    if (this.open) {
      this.focusCurrent();
      this.paint?.refresh();
    } else {
      this.camera.clearFocus();
    }
    // Adds or removes the selection cage.
    this.rebuild();
  }

  /** Point the tuner at an actor. Safe to call whether or not the panel is open. */
  select(actor: Actor): void {
    if (actor === this.current) return;
    this.current = actor;
    this.pieceIndex = 0;
    this.buildTabs();
    this.buildControls();
    if (this.open) this.focusCurrent();
    else this.syncYaw();
  }

  private buildTabs(): void {
    this.tabs.replaceChildren();
    for (const actor of this.actors) {
      const tab = document.createElement("button");
      tab.textContent = actor.displayName;
      tab.className =
        actor.id === this.current.id ? "tuner__tab tuner__tab--on" : "tuner__tab";
      tab.addEventListener("click", () => {
        this.select(actor);
        // Same event a click in the 3D view raises, so selection stays one
        // concept: the HUD and the WASD driver both follow it.
        events.emit("actor:clicked", { actorId: actor.id });
      });
      this.tabs.appendChild(tab);
    }
  }

  private buildControls(): void {
    this.body.replaceChildren();
    this.inputs = [];

    for (const group of RIG_CONTROL_GROUPS) {
      const section = document.createElement("section");
      section.className = "tuner__group";

      const title = document.createElement("h4");
      title.textContent = group.title;
      section.appendChild(title);

      for (const control of group.controls) {
        section.appendChild(this.slider(control));
      }
      this.body.appendChild(section);
    }

    this.body.appendChild(this.buildPieceEditor());

    const colors = document.createElement("section");
    colors.className = "tuner__group";
    const colorTitle = document.createElement("h4");
    colorTitle.textContent = "颜色";
    colors.appendChild(colorTitle);
    for (const { key, label } of RIG_COLOR_CONTROLS) {
      colors.appendChild(this.swatch(key, label));
    }
    colors.appendChild(this.toggleRow("goggles", "护目镜"));
    this.body.appendChild(colors);

    // Piece sliders are built before a selection is guaranteed, so seed them.
    for (const refresh of this.inputs) refresh();
  }

  /**
   * Editor for the surface pieces -- fringe, side locks, eyes, blush.
   *
   * A list plus one set of sliders for whichever piece is selected, rather than
   * every piece expanded at once: a head can easily carry fifteen of them and
   * a wall of two hundred sliders is unusable.
   */
  private buildPieceEditor(): HTMLElement {
    const section = document.createElement("section");
    section.className = "tuner__group";

    const title = document.createElement("h4");
    title.textContent = "贴面部件";
    section.appendChild(title);

    const list = document.createElement("select");
    list.className = "tuner__list";
    list.size = 6;
    const refreshList = () => {
      list.replaceChildren();
      this.spec().pieces.forEach((piece, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `${index + 1}. ${labelFor(piece)}`;
        option.selected = index === this.pieceIndex;
        list.appendChild(option);
      });
    };
    refreshList();
    list.addEventListener("change", () => {
      this.pieceIndex = Number(list.value);
      for (const refresh of this.inputs) refresh();
      this.paint?.refresh();
      // Rebuild so the wireframe cage moves to the newly selected piece.
      this.rebuild();
    });
    section.appendChild(list);

    const buttons = document.createElement("div");
    buttons.className = "tuner__pieceButtons";
    const after = (mutate: () => void) => {
      mutate();
      refreshList();
      for (const refresh of this.inputs) refresh();
      this.rebuild();
    };
    buttons.append(
      this.button("新建", () =>
        after(() => {
          this.spec().pieces.push({ ...DEFAULT_PIECE });
          this.pieceIndex = this.spec().pieces.length - 1;
        }),
      ),
      this.button("复制", () =>
        after(() => {
          const piece = this.piece();
          if (!piece) return;
          this.spec().pieces.splice(this.pieceIndex + 1, 0, { ...piece });
          this.pieceIndex += 1;
        }),
      ),
      this.button("镜像", () =>
        after(() => {
          const piece = this.piece();
          if (!piece) return;
          this.spec().pieces.splice(this.pieceIndex + 1, 0, mirrored(piece));
          this.pieceIndex += 1;
        }),
      ),
      this.button("删除", () =>
        after(() => {
          if (this.spec().pieces.length === 0) return;
          this.spec().pieces.splice(this.pieceIndex, 1);
          this.pieceIndex = Math.max(0, this.pieceIndex - 1);
        }),
      ),
    );
    section.appendChild(buttons);

    this.refreshPieceList = refreshList;

    section.appendChild(
      this.pieceDropdown("shape", "形状", PIECE_SHAPES, refreshList),
    );
    section.appendChild(
      this.pieceDropdown("color", "颜色", PIECE_COLORS, refreshList),
    );
    section.appendChild(this.noteInput(refreshList));
    section.appendChild(this.textureDropdown());

    const paintRow = document.createElement("div");
    paintRow.className = "tuner__pieceButtons";
    paintRow.appendChild(
      this.button("🖌 打开画板", () => {
        this.paint?.toggle();
      }),
    );
    section.appendChild(paintRow);

    for (const control of PIECE_CONTROLS) {
      section.appendChild(this.pieceSlider(control));
    }

    return section;
  }

  /** Free-text label for a piece. A head of twenty "发绺·头发·82°" is unusable. */
  private noteInput(onChange: () => void): HTMLElement {
    const row = document.createElement("label");
    row.className = "tuner__row";

    const name = document.createElement("span");
    name.className = "tuner__label";
    name.textContent = "备注名";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tuner__text";
    input.placeholder = "左刘海…";

    input.addEventListener("input", () => {
      const piece = this.piece();
      if (!piece) return;
      if (input.value.trim()) piece.note = input.value.trim();
      else delete piece.note;
      onChange();
    });

    row.append(name, input);
    this.inputs.push(() => {
      const piece = this.piece();
      input.disabled = !piece;
      input.value = piece?.note ?? "";
    });
    return row;
  }

  /** Texture selector. The image paints the piece's faces; the shape stays. */
  private textureDropdown(): HTMLElement {
    const row = document.createElement("label");
    row.className = "tuner__row";

    const name = document.createElement("span");
    name.className = "tuner__label";
    name.textContent = "贴图";

    const select = document.createElement("select");
    select.className = "tuner__select";

    const rebuildOptions = () => {
      select.replaceChildren();
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "（无，用多边形）";
      select.appendChild(none);
      for (const entry of listTextures()) {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.label;
        select.appendChild(option);
      }
    };
    rebuildOptions();

    select.addEventListener("change", () => {
      const piece = this.piece();
      if (!piece) return;
      if (select.value) piece.texture = select.value;
      else delete piece.texture;
      this.rebuild();
      this.paint?.refresh();
    });

    row.append(name, select);
    this.inputs.push(() => {
      const piece = this.piece();
      select.disabled = !piece;
      rebuildOptions();
      select.value = piece?.texture ?? "";
    });
    return row;
  }

  /**
   * Turntable for the selected character. Lives outside `buildControls` so it
   * survives actor switches, and reads the actor's yaw back each frame the
   * panel is open -- otherwise walking around would desync the handle.
   */
  private buildYawRow(): HTMLElement {
    const row = document.createElement("label");
    row.className = "tuner__row tuner__row--turntable";

    const name = document.createElement("span");
    name.className = "tuner__label";
    name.textContent = "转身";

    const input = document.createElement("input");
    input.type = "range";
    input.min = "-180";
    input.max = "180";
    input.step = "1";
    input.value = "0";

    const value = document.createElement("span");
    value.className = "tuner__value";
    value.textContent = "0°";

    input.addEventListener("input", () => {
      const degrees = Number(input.value);
      value.textContent = `${degrees}°`;
      this.current.setYaw((degrees * Math.PI) / 180);
    });

    this.yawInput = input;
    this.yawValue = value;
    row.append(name, input, value);
    return row;
  }

  /** Pull the handle back in line with the actor. Called when focus changes. */
  private syncYaw(): void {
    if (!this.yawInput || !this.yawValue) return;
    let degrees = Math.round((this.current.yaw * 180) / Math.PI);
    while (degrees > 180) degrees -= 360;
    while (degrees < -180) degrees += 360;
    this.yawInput.value = String(degrees);
    this.yawValue.textContent = `${degrees}°`;
  }

  private piece(): SurfacePiece | undefined {
    return this.spec().pieces[this.pieceIndex];
  }

  private pieceSlider(control: PieceControl): HTMLElement {
    const row = document.createElement("label");
    row.className = "tuner__row";

    const name = document.createElement("span");
    name.className = "tuner__label";
    name.textContent = control.label;

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(control.min);
    input.max = String(control.max);
    input.step = String(control.step);

    const value = document.createElement("span");
    value.className = "tuner__value";

    input.addEventListener("input", () => {
      const piece = this.piece();
      if (!piece) return;
      piece[control.key] = Number(input.value);
      value.textContent = format(piece[control.key]);
      this.rebuild();
    });

    row.append(name, input, value);
    this.inputs.push(() => {
      const piece = this.piece();
      input.disabled = !piece;
      if (!piece) {
        value.textContent = "-";
        return;
      }
      input.value = String(piece[control.key]);
      value.textContent = format(piece[control.key]);
    });
    return row;
  }

  private pieceDropdown(
    key: "shape" | "color",
    label: string,
    options: ReadonlyArray<{ value: string; label: string }>,
    onChange: () => void,
  ): HTMLElement {
    const row = document.createElement("label");
    row.className = "tuner__row";

    const name = document.createElement("span");
    name.className = "tuner__label";
    name.textContent = label;

    const select = document.createElement("select");
    select.className = "tuner__select";
    for (const option of options) {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      select.appendChild(element);
    }

    select.addEventListener("change", () => {
      const piece = this.piece();
      if (!piece) return;
      if (key === "shape") piece.shape = select.value as PieceShape;
      else piece.color = select.value as PieceColor;
      onChange();
      this.rebuild();
    });

    row.append(name, select);
    this.inputs.push(() => {
      const piece = this.piece();
      select.disabled = !piece;
      if (piece) select.value = piece[key];
    });
    return row;
  }

  private slider(control: NumberControl): HTMLElement {
    const spec = this.spec();
    const row = document.createElement("label");
    row.className = "tuner__row";

    const name = document.createElement("span");
    name.className = "tuner__label";
    name.textContent = control.label;

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(control.min);
    input.max = String(control.max);
    input.step = String(control.step);
    input.value = String(spec[control.key]);

    const value = document.createElement("span");
    value.className = "tuner__value";
    value.textContent = format(spec[control.key]);

    input.addEventListener("input", () => {
      const parsed = Number(input.value);
      this.spec()[control.key] = parsed;
      value.textContent = format(parsed);
      this.rebuild();
    });

    row.append(name, input, value);
    this.inputs.push(() => {
      input.value = String(this.spec()[control.key]);
      value.textContent = format(this.spec()[control.key]);
    });
    return row;
  }

  private swatch(key: keyof RigSpec, label: string): HTMLElement {
    const row = document.createElement("label");
    row.className = "tuner__row";

    const name = document.createElement("span");
    name.className = "tuner__label";
    name.textContent = label;

    const input = document.createElement("input");
    input.type = "color";
    input.value = toHex(this.spec()[key] as number);

    input.addEventListener("input", () => {
      (this.spec()[key] as number) = Number.parseInt(input.value.slice(1), 16);
      this.rebuild();
    });

    row.append(name, input);
    this.inputs.push(() => {
      input.value = toHex(this.spec()[key] as number);
    });
    return row;
  }

  private toggleRow(key: "goggles", label: string): HTMLElement {
    const row = document.createElement("label");
    row.className = "tuner__row";

    const name = document.createElement("span");
    name.className = "tuner__label";
    name.textContent = label;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.spec()[key];
    input.addEventListener("change", () => {
      this.spec()[key] = input.checked;
      this.rebuild();
    });

    row.append(name, input);
    this.inputs.push(() => {
      input.checked = this.spec()[key];
    });
    return row;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "tuner__button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  private spec(): RigSpec {
    const spec = this.specs.get(this.current.id);
    if (!spec) throw new Error(`no spec for ${this.current.id}`);
    return spec;
  }

  private rebuild(): void {
    // Only cage the selected piece while the panel is open; a wireframe box
    // floating on a character's head during normal play would be nonsense.
    this.current.applySpec(this.spec(), {
      highlight: this.open ? this.pieceIndex : -1,
    });
  }

  /**
   * Back to the character's authored look, not to `DEFAULT_RIG_SPEC` -- that
   * default carries Heath's colours, so resetting anyone else used to repaint
   * them brown.
   */
  private reset(): void {
    const baseline = this.baselines.get(this.current.id);
    if (!baseline) return;
    this.specs.set(this.current.id, copySpec(baseline));
    this.pieceIndex = 0;
    this.buildControls();
    this.rebuild();
    this.say(`已还原 ${this.current.displayName} 的初始设定`);
  }

  /**
   * Emit only the fields that differ from the default, formatted as the `spec`
   * object in `profiles/index.ts`. Colours come out as hex so they stay
   * readable when pasted.
   */
  private async copySpec(): Promise<void> {
    const spec = this.spec();
    const lines: string[] = [];
    for (const key of TUNABLE_KEYS) {
      if (key === "pieces") continue;
      const value = spec[key];
      if (value === DEFAULT_RIG_SPEC[key]) continue;
      if (typeof value === "number") {
        const isColor = RIG_COLOR_CONTROLS.some((c) => c.key === key);
        lines.push(`  ${key}: ${isColor ? toHexLiteral(value) : round(value)},`);
      } else {
        lines.push(`  ${key}: ${value},`);
      }
    }
    // Pieces always ship in full: they are an array, so "differs from default"
    // is not a useful question to ask of them.
    lines.push(`  pieces: [`);
    for (const piece of spec.pieces) {
      const fields = Object.entries(piece)
        .map(([key, value]) =>
          typeof value === "number"
            ? `${key}: ${round(value)}`
            : `${key}: ${JSON.stringify(value)}`,
        )
        .join(", ");
      lines.push(`    { ${fields} },`);
    }
    lines.push(`  ],`);

    const text = `spec: {\n${lines.join("\n")}\n},`;

    try {
      await navigator.clipboard.writeText(text);
      this.say(`已复制 ${this.current.displayName} 的 spec（含 ${spec.pieces.length} 个部件）`);
    } catch {
      // Clipboard needs a secure context and a user gesture; the console is a
      // reliable fallback and just as easy to copy from.
      console.log(text);
      this.say("剪贴板不可用，spec 已打印到 console");
    }
  }

  private focusCurrent(): void {
    const { x, z } = this.current.position;
    this.camera.focusOn(x, this.current.rig.height * 0.55, z, 2.2);
    this.syncYaw();
  }

  private say(message: string): void {
    this.status.textContent = message;
    window.setTimeout(() => {
      if (this.status.textContent === message) this.status.textContent = "";
    }, 2600);
  }
}

/** Clone a spec, including the piece array, so edits never alias the source. */
function copySpec(spec: RigSpec): RigSpec {
  return { ...spec, pieces: spec.pieces.map((piece) => ({ ...piece })) };
}

/** Label for a piece in the list: its note if it has one, else what it is. */
function labelFor(piece: SurfacePiece): string {
  const degrees = Math.round((piece.azimuth * 180) / Math.PI);
  if (piece.note) return `${piece.note} · ${degrees}°`;

  const shape =
    PIECE_SHAPES.find((s) => s.value === piece.shape)?.label ?? piece.shape;
  const color =
    PIECE_COLORS.find((c) => c.value === piece.color)?.label ?? piece.color;
  const mark = piece.texture ? "🖌 " : "";
  return `${mark}${shape} · ${color} · ${degrees}°`;
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toHex(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function toHexLiteral(value: number): string {
  return `0x${value.toString(16).padStart(6, "0")}`;
}
