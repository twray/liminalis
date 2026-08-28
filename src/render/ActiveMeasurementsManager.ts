import type { Measurements } from "./types";

// Tracks which Measurements a primitive should fall back to when it doesn't
// know its own size — e.g. isometric()'s default viewport. A stack so a
// container (group()/layer()/place()) can push its own local measurements
// for the duration of its frameCallback; primitives called inside then see
// the nearest enclosing container's size rather than the outermost canvas's.
// The stack is always seeded with the canvas's own measurements for the
// duration of a frame (see createDrawContext), so it's never empty during
// an actual primitive call.
class ActiveMeasurementsManager {
  #stack: Array<() => Measurements> = [];

  withMeasurements<T>(getMeasurements: () => Measurements, frame: () => T): T {
    this.#stack.push(getMeasurements);

    try {
      return frame();
    } finally {
      this.#stack.pop();
    }
  }

  getActiveMeasurements(): Measurements | undefined {
    const getMeasurements = this.#stack[this.#stack.length - 1];

    return getMeasurements?.();
  }
}

export default ActiveMeasurementsManager;
