// Retains one decoded video frame as a paintable bitmap, so there is
// something to show during the window where the element itself has none.
//
// That window is short but unavoidable: seeking drops an element's readyState
// below HAVE_CURRENT_DATA for a frame or two, and per the canvas spec
// drawImage on a video below that threshold returns without drawing. So a
// loop's reseek would otherwise paint nothing at all -- a blank flash on every
// iteration, which is what this exists to remove.
//
// Split out from VideoTransport rather than inlined because the two decisions
// are genuinely different: the transport knows WHEN a frame needs holding (it
// is the thing that initiates seeks), and this knows only HOW one is retained.
// The seam also lets the transport's behaviour be tested without a DOM.
export interface FrameHold {
  capture(source: CanvasImageSource, width: number, height: number): void;
  get(): CanvasImageSource | null;
  release(): void;
}

class VideoFrameHold implements FrameHold {
  #canvas: HTMLCanvasElement | null = null;
  #context: CanvasRenderingContext2D | null = null;
  #hasFrame = false;

  capture(source: CanvasImageSource, width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      return;
    }

    const context = this.#ensureSurface(width, height);

    if (!context) {
      return;
    }

    try {
      // Cleared first: a capture that fails partway would otherwise leave the
      // previous frame's pixels showing through the new one.
      context.clearRect(0, 0, width, height);
      context.drawImage(source, 0, 0, width, height);
      this.#hasFrame = true;
    } catch {
      // Holding nothing degrades to the old blank-flash behaviour, which is
      // strictly better than letting a decode failure escape into the render
      // loop and take the whole frame down.
      this.#hasFrame = false;
    }
  }

  // Note this introduces no new canvas-tainting exposure: an intermediate
  // canvas inherits the source's origin-clean status, so drawing video ->
  // hold -> scene taints exactly what drawing video -> scene would.
  get(): CanvasImageSource | null {
    return this.#hasFrame ? this.#canvas : null;
  }

  release(): void {
    this.#canvas = null;
    this.#context = null;
    this.#hasFrame = false;
  }

  #ensureSurface(
    width: number,
    height: number,
  ): CanvasRenderingContext2D | null {
    if (typeof document === "undefined") {
      return null;
    }

    if (!this.#canvas) {
      this.#canvas = document.createElement("canvas");
      this.#context = this.#canvas.getContext("2d");
    }

    // Resizing clears the canvas, so it is only done when the dimensions
    // actually changed -- otherwise every capture would discard the surface it
    // is about to draw into.
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }

    return this.#context;
  }
}

export default VideoFrameHold;
