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

  constructor(container: HTMLElement, private readonly clock: GameClock) {
    this.root = document.createElement("div");
    this.root.className = "panel panel--hud";
    this.root.innerHTML = `
      <div class="hud__row"><span class="hud__label">时间</span><span data-time>--:--</span></div>
      <div class="hud__row"><span class="hud__label">倍速</span><span data-scale>1×</span></div>
      <div class="hud__row"><span class="hud__label">选中</span><span data-focus>-</span></div>
      <div class="hud__hint">
        WASD 走动 · 拖拽 / Q E 转视角 · 滚轮缩放<br />
        空格 暂停 · T 切倍速 · <b>\` 调模型</b>
      </div>
    `;
    container.appendChild(this.root);

    this.timeValue = this.query("[data-time]");
    this.scaleValue = this.query("[data-scale]");
    this.focusValue = this.query("[data-focus]");
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

  private query(selector: string): HTMLSpanElement {
    const element = this.root.querySelector<HTMLSpanElement>(selector);
    if (!element) throw new Error(`HUD element missing: ${selector}`);
    return element;
  }
}
