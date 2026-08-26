import type { PrimitiveName } from "./primitiveNames";

class OverlayPrimitiveWarningManager {
  #hasWarnedOverlayPrimitiveInsideIsometric = false;
  #isometricRenderCallbackDepth = 0;

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

  warnIfOverlayPrimitiveInsideIsometric(primitiveType?: PrimitiveName): void {
    if (
      this.#isometricRenderCallbackDepth === 0 ||
      this.#hasWarnedOverlayPrimitiveInsideIsometric
    ) {
      return;
    }

    this.#hasWarnedOverlayPrimitiveInsideIsometric = true;

    const resolvedPrimitiveName = primitiveType ?? "this primitive";

    console.warn(
      `[liminalis] 2D primitive "${resolvedPrimitiveName}" was called inside isometric(). ` +
        "This mixed-pass call is not guaranteed to preserve expected z-order for overlays or animations. " +
        "Move 2D primitives to the parent onRender scope after isometric() for deterministic stacking.",
    );
  }
}

export default OverlayPrimitiveWarningManager;
