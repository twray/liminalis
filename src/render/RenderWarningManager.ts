const WARNING_TYPE = {
  NON_ISOMETRIC_SHAPE_INSIDE_ISOMETRIC: "NON_ISOMETRIC_SHAPE_INSIDE_ISOMETRIC",
} as const;

class RenderWarningManager {
  #isometricRenderCallbackDepth = 0;

  #hasWarnedBasedOnType: Record<string, boolean> = Object.values(
    WARNING_TYPE,
  ).reduce(
    (acc, type) => {
      acc[type] = false;
      return acc;
    },
    {} as Record<string, boolean>,
  );

  beginFrame(): void {
    this.#isometricRenderCallbackDepth = 0;
  }

  withIsometricRenderCallback<T>(callbackFn: () => T): T {
    this.#isometricRenderCallbackDepth++;

    try {
      return callbackFn();
    } finally {
      this.#isometricRenderCallbackDepth--;
    }
  }

  warnIfOverlayPrimitiveInsideIsometric(): void {
    if (
      this.#isometricRenderCallbackDepth === 0 ||
      this.#hasWarnedBasedOnType[
        WARNING_TYPE.NON_ISOMETRIC_SHAPE_INSIDE_ISOMETRIC
      ]
    ) {
      return;
    }

    this.#hasWarnedBasedOnType[
      WARNING_TYPE.NON_ISOMETRIC_SHAPE_INSIDE_ISOMETRIC
    ] = true;

    console.warn(
      `[liminalis] 2D shape primitive was called inside isometric(). 2D shapes, such as lines ` +
        "rects and circles will not be rendered inside of isometric(). Please move these calls " +
        "outside of isometric() for proper rendering.",
    );
  }
}

export default RenderWarningManager;
