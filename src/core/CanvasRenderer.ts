import type { CanvasProps, SketchSettings } from "../types";

type RenderCallback = (props: CanvasProps) => void;
type SketchFactory = () => RenderCallback;
type PlaybackRate = NonNullable<SketchSettings["playbackRate"]>;
type CanvasDimensionSource = "settings" | "canvas-attributes" | "viewport";
type CanvasDimensions = {
  width: number;
  height: number;
  source: CanvasDimensionSource;
};
type ResolvedCanvasDimensions = CanvasDimensions & {
  pixelRatio: number;
};

const DEFAULTS = {
  CANVAS_WIDTH: 500,
  CANVAS_HEIGHT: 500,
  FPS: 60,
  PLAYBACK_RATE: "throttle" as PlaybackRate,
  AUTO_SCALE_DOWN_VIEWPORT_PADDING_IN_PX: 32,
};

class CanvasRenderer {
  #animationFrameId: number | null = null;
  #isRunning = false;

  #lastThrottleFrameTimeInMs: number | null = null;
  #nextFixedFrameTimeInMs: number | null = null;

  #frame = 0;
  #startTimeInMs = 0;
  #windowResizeListener: EventListener | null = null;

  start(sketchFactory: SketchFactory, settings: SketchSettings): void {
    this.stop();

    const { canvas } = settings;
    const animate = settings.animate;
    const scaleToFit = settings.scaleToFit ?? false;
    const autoScaleDown = settings.autoScaleDown ?? false;

    let resolvedCanvasDimensions = this.#configureCanvasDimensions(
      canvas,
      settings.dimensions,
    );
    this.#attachCanvasToDom(canvas);

    const context = canvas.getContext(
      "2d",
      settings.attributes as CanvasRenderingContext2DSettings | undefined,
    );

    if (!context) {
      throw new Error("Unable to initialize 2D canvas context.");
    }

    this.#configureContextPixelRatio(
      context,
      resolvedCanvasDimensions.pixelRatio,
    );

    const renderCallback = sketchFactory();
    const renderCurrentFrame = (timestampInMs: number) => {
      renderCallback({
        context,
        width: resolvedCanvasDimensions.width,
        height: resolvedCanvasDimensions.height,
        time: animate
          ? Math.max(0, timestampInMs - this.#startTimeInMs) / 1000
          : 0,
        frame: this.#frame,
        playhead: 0,
      });
    };

    this.#frame = 0;
    this.#startTimeInMs = this.#getNowInMs();
    this.#lastThrottleFrameTimeInMs = null;
    this.#nextFixedFrameTimeInMs = this.#startTimeInMs;

    this.#applyScaleToFit(
      canvas,
      scaleToFit,
      resolvedCanvasDimensions,
      autoScaleDown,
      context,
      (nextDimensions) => {
        resolvedCanvasDimensions = nextDimensions;
      },
      () => {
        renderCurrentFrame(this.#getNowInMs());
      },
    );

    const fps = this.#resolveFps(settings.fps);
    const playbackRate = settings.playbackRate ?? DEFAULTS.PLAYBACK_RATE;

    if (!animate) {
      renderCurrentFrame(this.#startTimeInMs);
      return;
    }

    this.#isRunning = true;

    const loop = (timestampInMs: number) => {
      if (!this.#isRunning) {
        return;
      }

      if (this.#shouldRenderFrame(timestampInMs, fps, playbackRate)) {
        renderCurrentFrame(timestampInMs);

        this.#frame += 1;
      }

      this.#animationFrameId = this.#requestAnimationFrame(loop);
    };

    this.#animationFrameId = this.#requestAnimationFrame(loop);
  }

  stop(): void {
    this.#isRunning = false;

    if (this.#animationFrameId !== null) {
      this.#cancelAnimationFrame(this.#animationFrameId);
      this.#animationFrameId = null;
    }

    this.#lastThrottleFrameTimeInMs = null;
    this.#nextFixedFrameTimeInMs = null;

    this.#removeWindowResizeListener();
  }

  #configureCanvasDimensions(
    canvas: HTMLCanvasElement,
    dimensions: SketchSettings["dimensions"],
  ): ResolvedCanvasDimensions {
    const resolvedDimensions = this.#resolveCanvasDimensions(
      canvas,
      dimensions,
    );
    const pixelRatio = this.#resolvePixelRatio();

    canvas.width = Math.max(
      1,
      Math.round(resolvedDimensions.width * pixelRatio),
    );
    canvas.height = Math.max(
      1,
      Math.round(resolvedDimensions.height * pixelRatio),
    );
    canvas.style.width = `${resolvedDimensions.width}px`;
    canvas.style.height = `${resolvedDimensions.height}px`;

    return {
      ...resolvedDimensions,
      pixelRatio,
    };
  }

  #attachCanvasToDom(canvas: HTMLCanvasElement): void {
    if (
      typeof document === "undefined" ||
      !document.body ||
      typeof document.body.appendChild !== "function"
    ) {
      return;
    }

    if (!canvas.isConnected) {
      document.body.appendChild(canvas);
    }
  }

  #applyScaleToFit(
    canvas: HTMLCanvasElement,
    scaleToFit: boolean,
    resolvedCanvasDimensions: ResolvedCanvasDimensions,
    autoScaleDown: boolean,
    context: CanvasRenderingContext2D,
    onResizeDimensionsUpdate: (
      nextDimensions: ResolvedCanvasDimensions,
    ) => void,
    onViewportResizeRepaint: () => void,
  ): void {
    this.#removeWindowResizeListener();

    if (resolvedCanvasDimensions.source === "viewport") {
      this.#setUpViewportResizeDimensionsHandler(
        canvas,
        context,
        scaleToFit,
        onResizeDimensionsUpdate,
        onViewportResizeRepaint,
      );
    }

    if (!scaleToFit) {
      return;
    }

    canvas.style.display = "block";

    if (resolvedCanvasDimensions.source === "viewport") {
      canvas.style.maxWidth = "100vw";
      canvas.style.maxHeight = "100vh";
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
      canvas.style.margin = "0";
      canvas.style.position = "static";
      canvas.style.left = "";
      canvas.style.top = "";
      canvas.style.transform = "";
      canvas.style.boxShadow = "";
      return;
    }

    if (resolvedCanvasDimensions.source === "settings") {
      canvas.style.margin = "0";
      canvas.style.position = "fixed";
      canvas.style.left = "50%";
      canvas.style.top = "50%";
      canvas.style.transform = "translate(-50%, -50%)";
      canvas.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.2)";

      if (autoScaleDown) {
        this.#applyAutoScaleDownDimensions(canvas, resolvedCanvasDimensions);
        return;
      }

      canvas.style.width = `${resolvedCanvasDimensions.width}px`;
      canvas.style.height = `${resolvedCanvasDimensions.height}px`;
      canvas.style.maxWidth = "none";
      canvas.style.maxHeight = "none";
      return;
    }

    canvas.style.maxWidth = "100vw";
    canvas.style.maxHeight = "100vh";
    canvas.style.position = "static";
    canvas.style.left = "";
    canvas.style.top = "";
    canvas.style.transform = "";
    canvas.style.boxShadow = "";

    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.margin = "0 auto";
  }

  #setUpViewportResizeDimensionsHandler(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    scaleToFit: boolean,
    onResizeDimensionsUpdate: (
      nextDimensions: ResolvedCanvasDimensions,
    ) => void,
    onViewportResizeRepaint: () => void,
  ): void {
    if (
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    ) {
      return;
    }

    const applyViewportDimensions = () => {
      const viewportWidth = this.#normalizeDimension(
        window.innerWidth,
        DEFAULTS.CANVAS_WIDTH,
      );
      const viewportHeight = this.#normalizeDimension(
        window.innerHeight,
        DEFAULTS.CANVAS_HEIGHT,
      );
      const pixelRatio = this.#resolvePixelRatio();

      canvas.width = Math.max(1, Math.round(viewportWidth * pixelRatio));
      canvas.height = Math.max(1, Math.round(viewportHeight * pixelRatio));

      if (!scaleToFit) {
        canvas.style.width = `${viewportWidth}px`;
        canvas.style.height = `${viewportHeight}px`;
      }

      this.#configureContextPixelRatio(context, pixelRatio);

      onResizeDimensionsUpdate({
        width: viewportWidth,
        height: viewportHeight,
        source: "viewport",
        pixelRatio,
      });

      onViewportResizeRepaint();
    };

    const resizeListener: EventListener = () => {
      applyViewportDimensions();
    };

    window.addEventListener("resize", resizeListener);
    this.#windowResizeListener = resizeListener;
  }

  #applyAutoScaleDownDimensions(
    canvas: HTMLCanvasElement,
    resolvedCanvasDimensions: ResolvedCanvasDimensions,
  ): void {
    const applyFittedDimensions = () => {
      const viewportWidth =
        typeof window !== "undefined"
          ? window.innerWidth
          : resolvedCanvasDimensions.width;
      const viewportHeight =
        typeof window !== "undefined"
          ? window.innerHeight
          : resolvedCanvasDimensions.height;

      const availableWidth = Math.max(
        1,
        viewportWidth - DEFAULTS.AUTO_SCALE_DOWN_VIEWPORT_PADDING_IN_PX,
      );
      const availableHeight = Math.max(
        1,
        viewportHeight - DEFAULTS.AUTO_SCALE_DOWN_VIEWPORT_PADDING_IN_PX,
      );

      const scale = Math.min(
        1,
        availableWidth / resolvedCanvasDimensions.width,
        availableHeight / resolvedCanvasDimensions.height,
      );

      const fittedWidth = Math.max(
        1,
        Math.floor(resolvedCanvasDimensions.width * scale),
      );
      const fittedHeight = Math.max(
        1,
        Math.floor(resolvedCanvasDimensions.height * scale),
      );

      canvas.style.width = `${fittedWidth}px`;
      canvas.style.height = `${fittedHeight}px`;
      canvas.style.maxWidth = "none";
      canvas.style.maxHeight = "none";
    };

    applyFittedDimensions();

    if (
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function"
    ) {
      const resizeListener: EventListener = () => {
        applyFittedDimensions();
      };

      window.addEventListener("resize", resizeListener);
      this.#windowResizeListener = resizeListener;
    }
  }

  #removeWindowResizeListener(): void {
    if (
      this.#windowResizeListener &&
      typeof window !== "undefined" &&
      typeof window.removeEventListener === "function"
    ) {
      window.removeEventListener("resize", this.#windowResizeListener);
    }

    this.#windowResizeListener = null;
  }

  #resolveCanvasDimensions(
    canvas: HTMLCanvasElement,
    dimensions: SketchSettings["dimensions"],
  ): CanvasDimensions {
    if (dimensions) {
      return {
        width: this.#normalizeDimension(dimensions[0], DEFAULTS.CANVAS_WIDTH),
        height: this.#normalizeDimension(dimensions[1], DEFAULTS.CANVAS_HEIGHT),
        source: "settings",
      };
    }

    if (this.#hasExplicitCanvasDimensionAttributes(canvas)) {
      return {
        width: this.#normalizeDimension(canvas.width, DEFAULTS.CANVAS_WIDTH),
        height: this.#normalizeDimension(canvas.height, DEFAULTS.CANVAS_HEIGHT),
        source: "canvas-attributes",
      };
    }

    const fallbackWidth =
      typeof window !== "undefined" ? window.innerWidth : DEFAULTS.CANVAS_WIDTH;

    const fallbackHeight =
      typeof window !== "undefined"
        ? window.innerHeight
        : DEFAULTS.CANVAS_HEIGHT;

    return {
      width: this.#normalizeDimension(fallbackWidth, DEFAULTS.CANVAS_WIDTH),
      height: this.#normalizeDimension(fallbackHeight, DEFAULTS.CANVAS_HEIGHT),
      source: "viewport",
    };
  }

  #hasExplicitCanvasDimensionAttributes(canvas: HTMLCanvasElement): boolean {
    if (typeof canvas.hasAttribute !== "function") {
      return false;
    }

    return canvas.hasAttribute("width") || canvas.hasAttribute("height");
  }

  #normalizeDimension(value: number, fallback: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return Math.max(1, Math.floor(fallback));
    }

    return Math.max(1, Math.floor(value));
  }

  #resolvePixelRatio(): number {
    if (
      typeof window !== "undefined" &&
      Number.isFinite(window.devicePixelRatio) &&
      window.devicePixelRatio > 0
    ) {
      return window.devicePixelRatio;
    }

    return 1;
  }

  #configureContextPixelRatio(
    context: CanvasRenderingContext2D,
    pixelRatio: number,
  ): void {
    if (typeof context.setTransform !== "function") {
      return;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  #resolveFps(fps: number | undefined): number {
    if (fps === undefined || !Number.isFinite(fps) || fps <= 0) {
      return DEFAULTS.FPS;
    }

    return fps;
  }

  #shouldRenderFrame(
    timestampInMs: number,
    fps: number,
    playbackRate: PlaybackRate,
  ): boolean {
    const frameIntervalInMs = 1000 / fps;

    if (playbackRate === "fixed") {
      if (this.#nextFixedFrameTimeInMs === null) {
        this.#nextFixedFrameTimeInMs = timestampInMs;
      }

      if (timestampInMs < this.#nextFixedFrameTimeInMs) {
        return false;
      }

      while (timestampInMs >= this.#nextFixedFrameTimeInMs) {
        this.#nextFixedFrameTimeInMs += frameIntervalInMs;
      }

      return true;
    }

    if (this.#lastThrottleFrameTimeInMs === null) {
      this.#lastThrottleFrameTimeInMs = timestampInMs;
      return true;
    }

    if (timestampInMs - this.#lastThrottleFrameTimeInMs < frameIntervalInMs) {
      return false;
    }

    this.#lastThrottleFrameTimeInMs = timestampInMs;
    return true;
  }

  #requestAnimationFrame(callback: FrameRequestCallback): number {
    if (typeof requestAnimationFrame === "function") {
      return requestAnimationFrame(callback);
    }

    return setTimeout(
      () => callback(this.#getNowInMs()),
      16,
    ) as unknown as number;
  }

  #cancelAnimationFrame(animationFrameId: number): void {
    if (typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(animationFrameId);
      return;
    }

    clearTimeout(animationFrameId);
  }

  #getNowInMs(): number {
    if (
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
    ) {
      return performance.now();
    }

    return Date.now();
  }
}

export default CanvasRenderer;
