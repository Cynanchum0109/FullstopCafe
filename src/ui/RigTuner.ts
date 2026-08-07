import type { Actor } from "../actors/Actor";
import { DEFAULT_RIG_SPEC, type RigSpec } from "../actors/Rig";
import {
  RIG_COLOR_CONTROLS,
  RIG_CONTROL_GROUPS,
  TUNABLE_KEYS,
  type NumberControl,
} from "../actors/rigControls";

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
  private current: Actor;
  private open = false;
  /** Rebuilt on every actor switch, so sliders show the right values. */
  private inputs: Array<() => void> = [];

  constructor(
    container: HTMLElement,
    private readonly actors: Actor[],
    private readonly camera: TunerCamera,
  ) {
    const first = actors[0];
    if (!first) throw new Error("RigTuner needs at least one actor");
    this.current = first;
    for (const actor of actors) {
      this.specs.set(actor.id, { ...actor.rig.spec });
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

    const footer = document.createElement("div");
    footer.className = "tuner__footer";
    footer.appendChild(
      // The camera snaps to fixed corners, so spinning the character is the
      // only way to inspect the face.
      this.button("转 45°", () => this.current.setYaw(this.current.yaw + Math.PI / 4)),
    );
    footer.appendChild(this.button("复制 spec", () => this.copySpec()));
    footer.appendChild(this.button("重置", () => this.reset()));
    this.root.appendChild(footer);

    this.status = document.createElement("div");
    this.status.className = "tuner__status";
    this.root.appendChild(this.status);

    container.appendChild(this.root);

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
    if (this.open) this.focusCurrent();
    else this.camera.clearFocus();
  }

  private buildTabs(): void {
    this.tabs.replaceChildren();
    for (const actor of this.actors) {
      const tab = document.createElement("button");
      tab.textContent = actor.displayName;
      tab.className =
        actor.id === this.current.id ? "tuner__tab tuner__tab--on" : "tuner__tab";
      tab.addEventListener("click", () => {
        this.current = actor;
        this.buildTabs();
        this.buildControls();
        this.focusCurrent();
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
    this.current.applySpec(this.spec());
  }

  private reset(): void {
    this.specs.set(this.current.id, { ...DEFAULT_RIG_SPEC });
    this.rebuild();
    for (const refresh of this.inputs) refresh();
    this.say("已重置为默认值");
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
      const value = spec[key];
      if (value === DEFAULT_RIG_SPEC[key]) continue;
      if (typeof value === "number") {
        const isColor = RIG_COLOR_CONTROLS.some((c) => c.key === key);
        lines.push(`  ${key}: ${isColor ? toHexLiteral(value) : round(value)},`);
      } else {
        lines.push(`  ${key}: ${value},`);
      }
    }
    const text = `spec: {\n${lines.join("\n")}\n},`;

    try {
      await navigator.clipboard.writeText(text);
      this.say(`已复制 ${this.current.displayName} 的 spec（${lines.length} 项）`);
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
  }

  private say(message: string): void {
    this.status.textContent = message;
    window.setTimeout(() => {
      if (this.status.textContent === message) this.status.textContent = "";
    }, 2600);
  }
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
