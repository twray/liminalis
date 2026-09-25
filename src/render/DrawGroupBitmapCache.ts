import type { Bounds, ClipScope } from "./types";

interface BitmapCacheEnvironment {
  width: number;
  height: number;
  devicePixelRatio: number;
}

interface RenderGroupParams {
  groupId: string;
  signature: string;
  targetContext: CanvasRenderingContext2D;
  bounds: Bounds;
  useLocalCoordinateContext: boolean;
  scope: ClipScope | null;
  draw: (
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ) => void;
}

type CachedSurface = OffscreenCanvas | HTMLCanvasElement;
type RenderSurfaceContext =
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface CachedGroupEntry {
  signature: string;
  surface: CachedSurface | null;
}

const getEnvironmentSignature = ({
  width,
  height,
  devicePixelRatio,
}: BitmapCacheEnvironment): string =>
  `w:${width}|h:${height}|dpr:${devicePixelRatio}`;

const clearSurface = (
  context: RenderSurfaceContext,
  width: number,
  height: number,
): void => {
  if (
    typeof context.setTransform !== "function" &&
    typeof context.clearRect !== "function"
  ) {
    return;
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.restore();
};

const createSurface = (width: number, height: number): CachedSurface | null => {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  return null;
};

const resizeSurfaceIfNeeded = (
  surface: CachedSurface,
  width: number,
  height: number,
): void => {
  if (surface.width === width && surface.height === height) {
    return;
  }

  surface.width = width;
  surface.height = height;
};

class DrawGroupBitmapCache {
  #cachedGroups = new Map<string, CachedGroupEntry>();
  #environmentSignature = "";
  #environment: BitmapCacheEnvironment = {
    width: 0,
    height: 0,
    devicePixelRatio: 1,
  };

  beginFrame(environment: BitmapCacheEnvironment): void {
    this.#environment = environment;

    const nextSignature = getEnvironmentSignature(environment);

    if (nextSignature === this.#environmentSignature) {
      return;
    }

    this.#environmentSignature = nextSignature;
    this.#cachedGroups.clear();
  }

  clear(): void {
    this.#cachedGroups.clear();
  }

  // Builds (or resizes/reuses) the group's offscreen surface, renders into
  // it, runs any post-process step, caches the result, and blits it onto
  // targetContext. This is the one place that surface-lifecycle work
  // happens, shared by both call sites in renderGroup below (a
  // stability-confirmed promotion, and a masking scope's every-frame
  // requirement) rather than two near-duplicate copies.
  #buildRenderAndCacheSurface({
    groupId,
    signature,
    targetContext,
    draw,
    scope,
    bounds,
    backingWidth,
    backingHeight,
    pixelRatio,
    useLocalCoordinateContext,
    drawImageX,
    drawImageY,
    width,
    height,
  }: {
    groupId: string;
    signature: string;
    targetContext: CanvasRenderingContext2D;
    draw: RenderGroupParams["draw"];
    scope: ClipScope | null;
    bounds: Bounds;
    backingWidth: number;
    backingHeight: number;
    pixelRatio: number;
    useLocalCoordinateContext: boolean;
    drawImageX: number;
    drawImageY: number;
    width: number;
    height: number;
  }): void {
    const { x: boundsX, y: boundsY } = bounds;
    const existingSurface = this.#cachedGroups.get(groupId)?.surface;
    const surface =
      existingSurface ?? createSurface(backingWidth, backingHeight);

    if (!surface) {
      draw(targetContext);
      return;
    }

    resizeSurfaceIfNeeded(surface, backingWidth, backingHeight);

    // "2d" always yields a 2D context on either constituent of CachedSurface
    // -- TypeScript can't line up OffscreenCanvas's and HTMLCanvasElement's
    // differently-shaped getContext overload lists when called on their
    // union, so it falls back to each one's most general overload
    // (HTMLCanvasElement's being `RenderingContext | null`, which drags in
    // ImageBitmapRenderingContext/WebGL types that were never actually
    // possible here). Asserting the known-correct return type sidesteps
    // that overload-resolution limitation rather than fighting it.
    const surfaceContext = surface.getContext(
      "2d",
    ) as RenderSurfaceContext | null;

    if (!surfaceContext) {
      draw(targetContext);
      return;
    }

    clearSurface(surfaceContext, backingWidth, backingHeight);

    if (typeof surfaceContext.setTransform === "function") {
      surfaceContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }

    if (!useLocalCoordinateContext) {
      surfaceContext.translate?.(-boundsX, -boundsY);
    }

    draw(surfaceContext);
    scope?.postProcessLocalSurface?.(surfaceContext, bounds);

    this.#cachedGroups.set(groupId, { signature, surface });

    targetContext.drawImage(surface, drawImageX, drawImageY, width, height);
  }

  renderGroup({
    groupId,
    signature,
    targetContext,
    bounds,
    useLocalCoordinateContext,
    scope,
    draw,
  }: RenderGroupParams): void {
    const { x: boundsX, y: boundsY, width, height } = bounds;
    const pixelRatio = Math.max(1, this.#environment.devicePixelRatio || 1);
    const backingWidth = Math.max(1, Math.round(width * pixelRatio));
    const backingHeight = Math.max(1, Math.round(height * pixelRatio));

    // When useLocalCoordinateContext is true, the caller's own apply() has
    // already translated the parent context's origin to (boundsX, boundsY)
    // before we were invoked — descendants already author 0,0-relative, so
    // the surface blits at the (now-shifted) origin. When false, descendants
    // author coordinates in the pre-group frame, so the surface needs an
    // internal translate(-boundsX, -boundsY) to remap them onto its own
    // small pixel grid, and blits back at (boundsX, boundsY) since the
    // parent's origin was never shifted. Both are sign-agnostic: a negative
    // boundsX just becomes a positive internal translate and a negative
    // blit target x, both valid canvas operations.
    const drawImageX = useLocalCoordinateContext ? 0 : boundsX;
    const drawImageY = useLocalCoordinateContext ? 0 : boundsY;

    const targetCanvas = (targetContext as { canvas?: unknown }).canvas as
      { getContext?: unknown } | undefined;
    const canUseBitmapCaching =
      !!targetCanvas && typeof targetCanvas.getContext === "function";

    // A scope with its own post-processing step (e.g. text()'s
    // destination-in glyph masking) needs an isolated local surface to
    // operate on regardless of whether the generic bitmap-caching duck-type
    // check passes — masking the shared target context directly would erase
    // whatever unrelated content already sits on it. Unlike the generic
    // caching case below, this is a CORRECTNESS requirement, not a
    // performance one, so it can't be deferred behind the stability gate --
    // it needs a real, isolated surface on every single frame, regardless
    // of whether this group's signature has ever repeated.
    const needsImmediateSurfaceForMasking = !!scope?.postProcessLocalSurface;

    const requiresLocalSurface =
      canUseBitmapCaching || needsImmediateSurfaceForMasking;

    if (!requiresLocalSurface) {
      draw(targetContext);
      return;
    }

    const cachedEntry = this.#cachedGroups.get(groupId);
    const isStableRepeat = cachedEntry?.signature === signature;

    if (isStableRepeat && cachedEntry?.surface) {
      // Real cache hit: skip re-rendering entirely, just blit the existing
      // surface.
      targetContext.drawImage(
        cachedEntry.surface,
        drawImageX,
        drawImageY,
        width,
        height,
      );
      return;
    }

    // Only build a surface now if either (a) this signature has genuinely
    // repeated once already -- stability proven, promote to a cached
    // surface -- or (b) a masking scope needs one unconditionally. A
    // brand-new or just-changed signature with no masking requirement takes
    // the cheap direct-render path instead, and records {surface: null} so
    // the NEXT frame can detect a repeat and promote.
    if (!isStableRepeat && !needsImmediateSurfaceForMasking) {
      draw(targetContext);
      this.#cachedGroups.set(groupId, { signature, surface: null });
      return;
    }

    this.#buildRenderAndCacheSurface({
      groupId,
      signature,
      targetContext,
      draw,
      scope,
      bounds,
      backingWidth,
      backingHeight,
      pixelRatio,
      useLocalCoordinateContext,
      drawImageX,
      drawImageY,
      width,
      height,
    });
  }
}

export default DrawGroupBitmapCache;
