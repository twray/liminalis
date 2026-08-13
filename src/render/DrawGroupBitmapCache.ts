interface BitmapCacheEnvironment {
  width: number;
  height: number;
  devicePixelRatio: number;
}

interface RenderGroupParams {
  groupId: string;
  signature: string;
  targetContext: CanvasRenderingContext2D;
  width: number;
  height: number;
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
    width,
    height,
    draw,
  }: RenderGroupParams): void {
    const pixelRatio = Math.max(1, this.#environment.devicePixelRatio || 1);
    const backingWidth = Math.max(1, Math.round(width * pixelRatio));
    const backingHeight = Math.max(1, Math.round(height * pixelRatio));

    const targetCanvas = (targetContext as { canvas?: unknown }).canvas as
      | { getContext?: unknown }
      | undefined;
    const canUseBitmapCaching =
      !!targetCanvas && typeof targetCanvas.getContext === "function";

    if (!canUseBitmapCaching) {
      draw(targetContext);
      return;
    }

    const cachedEntry = this.#cachedGroups.get(groupId);

    if (cachedEntry && cachedEntry.signature === signature) {
      targetContext.drawImage(cachedEntry.surface, 0, 0, width, height);
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

    draw(surfaceContext);

    this.#cachedGroups.set(groupId, {
      signature,
      surface,
    });

    targetContext.drawImage(surface, 0, 0, width, height);
  }
}

export default DrawGroupBitmapCache;
