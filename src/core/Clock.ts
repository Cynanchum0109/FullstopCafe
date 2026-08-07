import { events } from "./Events";

/** Real-world seconds that make up one full in-game day. */
export const REAL_SECONDS_PER_DAY = 15 * 60;

/** Speed presets exposed through the HUD. */
export const TIME_SCALES = [1, 8, 60] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

/**
 * Game clock. Owns both the frame delta and the in-game time-of-day.
 *
 * Everything that simulates should read `deltaScaled` (already multiplied by the
 * time scale and clamped) rather than measuring time itself, so pausing and
 * fast-forward work everywhere for free.
 */
export class GameClock {
  /** Unscaled seconds since the previous frame, clamped. */
  delta = 0;
  /** `delta` multiplied by the current time scale. Zero while paused. */
  deltaScaled = 0;
  /** Total scaled seconds elapsed. Animations use this as their phase source. */
  elapsed = 0;

  /** Position within the in-game day, 0..1 where 0 is midnight. */
  dayFraction = 0;
  /** How many in-game days have passed since the save was created. */
  day = 0;

  paused = false;
  scale: TimeScale = 1;

  private lastFrameMs = performance.now();
  private lastHour = -1;

  /** Advance the clock. Call exactly once per frame, before anything else. */
  tick(nowMs: number): void {
    // Clamp so a backgrounded tab does not resume with a huge delta that
    // teleports actors through walls.
    this.delta = Math.min((nowMs - this.lastFrameMs) / 1000, 0.1);
    this.lastFrameMs = nowMs;

    this.deltaScaled = this.paused ? 0 : this.delta * this.scale;
    this.elapsed += this.deltaScaled;

    if (this.deltaScaled > 0) {
      this.advanceDay(this.deltaScaled / REAL_SECONDS_PER_DAY);
    }
  }

  /** Push the clock forward by a fraction of a day, firing hour events. */
  private advanceDay(amount: number): void {
    this.dayFraction += amount;
    while (this.dayFraction >= 1) {
      this.dayFraction -= 1;
      this.day += 1;
    }

    const hour = Math.floor(this.dayFraction * 24);
    if (hour !== this.lastHour) {
      this.lastHour = hour;
      events.emit("clock:hour", { hour, day: this.day });
    }
  }

  /** Jump the clock forward, e.g. when applying offline progress from a save. */
  skipSeconds(seconds: number): void {
    this.elapsed += seconds;
    this.advanceDay(seconds / REAL_SECONDS_PER_DAY);
  }

  /** In-game hour and minute, for display. */
  get timeOfDay(): { hour: number; minute: number } {
    const totalMinutes = this.dayFraction * 24 * 60;
    return {
      hour: Math.floor(totalMinutes / 60),
      minute: Math.floor(totalMinutes % 60),
    };
  }

  /** `HH:MM`, zero padded. */
  formatTime(): string {
    const { hour, minute } = this.timeOfDay;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  cycleScale(): TimeScale {
    const index = TIME_SCALES.indexOf(this.scale);
    const next = TIME_SCALES[(index + 1) % TIME_SCALES.length];
    // TIME_SCALES is a non-empty const tuple, so the modulo index always hits.
    this.scale = next ?? 1;
    return this.scale;
  }
}
