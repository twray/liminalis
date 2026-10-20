const MAX_FRAME_DELTA_IN_MS = 250;

export const readWallClockInMs = (): number => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

// The scene's single time base. Everything that schedules or evaluates
// animation -- frame times handed to the draw context, and the moments the
// reactive layer envelopes stamp on attack/decay/release -- reads it, so a
// timeOf.* value and an animateTo({ at }) are always in the same units.
//
// It is monotonic and clamped: a gap longer than MAX_FRAME_DELTA_IN_MS
// between frames (a hidden tab, a debugger pause, a slow export frame) only
// advances scene time by that much, so the scene resumes where it left off
// instead of jumping every animation to its end.
class SceneClock {
  #elapsedInMs = 0;
  #lastTickWallTimeInMs: number | null = null;
  #readWallTimeInMs: () => number;

  constructor(readWallTimeInMs: () => number = readWallClockInMs) {
    this.#readWallTimeInMs = readWallTimeInMs;
  }

  reset(): void {
    this.#elapsedInMs = 0;
    this.#lastTickWallTimeInMs = null;
  }

  // Advances scene time to the given wall time. Called once per frame; the
  // returned value is that frame's time.
  tick(wallTimeInMs: number = this.#readWallTimeInMs()): number {
    this.#elapsedInMs = this.#elapsedAt(wallTimeInMs);
    this.#lastTickWallTimeInMs = wallTimeInMs;

    return Math.floor(this.#elapsedInMs);
  }

  // Scene time at this instant, without advancing the clock -- for events
  // that land between frames. Applies the same clamp as tick(), so it never
  // runs ahead of the time the next frame will be given.
  now(): number {
    return Math.floor(this.#elapsedAt(this.#readWallTimeInMs()));
  }

  #elapsedAt(wallTimeInMs: number): number {
    if (this.#lastTickWallTimeInMs === null) {
      return this.#elapsedInMs;
    }

    const deltaInMs = Math.min(
      Math.max(wallTimeInMs - this.#lastTickWallTimeInMs, 0),
      MAX_FRAME_DELTA_IN_MS,
    );

    return this.#elapsedInMs + deltaInMs;
  }
}

export default SceneClock;
