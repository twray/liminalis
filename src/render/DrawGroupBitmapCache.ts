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
  // Whether descendants already author coordinates relative to this group's
  // own (0,0) (layer()/place()/text-with-local-context) or relative to the
  // space the group itself was declared in (group(), shape-as-frame clips).
  // Determines whether the local surface needs an internal offset translate
  // to line up authored coordinates with its own small pixel grid, and where
  // the finished surface gets blitted back onto the parent.
  useLocalCoordinateContext: boolean;
  // Only consulted for its optional postProcessLocalSurface hook (e.g.
  // text()'s destination-in glyph masking) — everything else about this
  // group's own transform has already been applied to targetContext by the
  // caller before renderGroup is invoked.
  scope: ClipScope | null;
  draw: (
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ) => void;
}

type CachedSurface = OffscreenCanvas | HTMLCanvasElement;
type RenderSurfaceContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

interface CachedGroupEntry {
  signature: string;
  surface: CachedSurface;
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
      | { getContext?: unknown }
      | undefined;
    const canUseBitmapCaching =
      !!targetCanvas && typeof targetCanvas.getContext === "function";

    // A scope with its own post-processing step (e.g. text()'s
    // destination-in glyph masking) needs an isolated local surface to
    // operate on regardless of whether the generic bitmap-caching duck-type
    // check passes — masking the shared target context directly would erase
    // whatever unrelated content already sits on it.
    const requiresLocalSurface = canUseBitmapCaching || !!scope?.postProcessLocalSurface;

    if (!requiresLocalSurface) {
      draw(targetContext);
      return;
    }

    const cachedEntry = this.#cachedGroups.get(groupId);

    if (cachedEntry && cachedEntry.signature === signature) {
      targetContext.drawImage(cachedEntry.surface, drawImageX, drawImageY, width, height);
      return;
    }

    const surface =
      cachedEntry?.surface ?? createSurface(backingWidth, backingHeight);

    if (!surface) {
      draw(targetContext);
      return;
    }

    resizeSurfaceIfNeeded(surface, backingWidth, backingHeight);

    const surfaceContext = surface.getContext("2d");

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

    this.#cachedGroups.set(groupId, {
      signature,
      surface,
    });

    targetContext.drawImage(surface, drawImageX, drawImageY, width, height);
  }
}

export default DrawGroupBitmapCache;
