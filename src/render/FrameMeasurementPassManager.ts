import {
  DynamicMeasurementContext,
  MeasurementContext,
  Measurements,
  StaticMeasurementContext,
} from "./types";

class FrameMeasurementPassManager {
  #frameBoundsMeasurementDepth = 0;

  isMeasuringFrameBounds(): boolean {
    return this.#frameBoundsMeasurementDepth > 0;
  }

  withFrameBoundsMeasurementPass<T>(callbackFn: () => T): T {
    this.#frameBoundsMeasurementDepth++;

    try {
      return callbackFn();
    } finally {
      this.#frameBoundsMeasurementDepth--;
    }
  }

  createMeasurementContext(
    getMeasurements: () => Measurements,
    hasMeasurements: true,
    warnOnUnavailableRead: boolean,
  ): StaticMeasurementContext;
  createMeasurementContext(
    getMeasurements: () => Measurements,
    hasMeasurements: false,
    warnOnUnavailableRead: boolean,
  ): DynamicMeasurementContext;
  createMeasurementContext(
    getMeasurements: () => Measurements,
    hasMeasurements: boolean,
    warnOnUnavailableRead: boolean,
  ): MeasurementContext;
  createMeasurementContext(
    getMeasurements: () => Measurements,
    hasMeasurements: boolean,
    warnOnUnavailableRead: boolean,
  ): MeasurementContext {
    let hasWarnedOnMeasureRead = false;

    const context: DynamicMeasurementContext = {
      hasMeasurements,
      getMeasurements: () => {
        if (
          !hasMeasurements &&
          warnOnUnavailableRead &&
          !hasWarnedOnMeasureRead
        ) {
          hasWarnedOnMeasureRead = true;
          console.warn(
            "getMeasurements() was called while dimensions are unknown, as liminalis " +
              "needs to know how big a frame is before measurements can be derived. " +
              "Use the hasMeasurements guard to check if measurements are available.",
          );
        }

        return getMeasurements();
      },
    };

    if (hasMeasurements) {
      const staticContext = context as StaticMeasurementContext;

      Object.defineProperty(staticContext, "measurements", {
        enumerable: true,
        configurable: false,
        get: () => getMeasurements(),
      });

      return staticContext;
    }

    return context;
  }
}

export default FrameMeasurementPassManager;
