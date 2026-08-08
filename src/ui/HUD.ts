import type { GameClock } from "../core/Clock";

/**
 * Debug / status panel. Deliberately plain DOM sitting over the canvas -- the
 * needs bars and thought cards will hang off the same overlay later.
 */
export class HUD {
  private readonly root: HTMLDivElement;
  private readonly timeValue: HTMLSpanElement;
  private readonly scaleValue: HTMLSpanElement;
  private readonly focusValue: HTMLSpanElement;
  private readonly buttons: HTMLDivElement;

  constructor(container: HTMLElement, private readonly clock: GameClock) {
    this.root = document.createElement("div");
    this.root.className = "panel panel--hud";
    this.root.innerHTML = `
      <div class="hud__row"><span class="hud__label">时间</span><span data-time>--:--</span></div>
      <div class="hud__row"><span class="hud__label">倍速</span><span data-scale>1×</span></div>
      <div class="hud__row"><span class="hud__label">选中</span><span data-focus>-</span></div>
      <div class="hud__buttons" data-buttons></div>
      <div class="hud__hint">
        点角色选中 · WASD 走动 · 拖拽平移 · 滚轮缩放<br />
        空格 暂停 · T 切倍速 · <b>\` 调模型</b>
      </div>
    `;
    container.appendChild(this.root);

    this.timeValue = this.query("[data-time]");
    this.scaleValue = this.query("[data-scale]");
    this.focusValue = this.query("[data-focus]");
    this.buttons = this.query<HTMLDivElement>("[data-buttons]");
  }

  /**
   * Add a small action button to the HUD.
   *
   * Returns the element so the caller can relabel it -- the toggles here flip
   * between two words rather than lighting up, since the effect is visible in
   * the scene itself.
   */
  addButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "tuner__button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    this.buttons.appendChild(button);
    return button;
  }

  setFocus(text: string): void {
    this.focusValue.textContent = text;
  }

  update(): void {
    this.timeValue.textContent = this.clock.formatTime();
    this.scaleValue.textContent = this.clock.paused
      ? "暂停"
      : `${this.clock.scale}×`;
  }

  private query<T extends HTMLElement = HTMLSpanElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`HUD element missing: ${selector}`);
    return element;
  }
}
