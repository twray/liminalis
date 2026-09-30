import type VideoTransport from "../VideoTransport";
import { drawImageSourceWithFit } from "../common";
import type { VideoProps } from "../types";

// Thin by design. An HTMLVideoElement satisfies CanvasImageSource exactly as a
// decoded bitmap does, so video composites through the same
// cover/contain/stretch path image() uses -- see drawImageSourceWithFit in
// ../common. Nothing about the fit geometry is image-specific, and nothing
// here is video-specific beyond where the source comes from.
//
// Bounds resolution deliberately lives on VideoTransport rather than here:
// it depends on the element's readyState and natural dimensions, which the
// transport already tracks, and duplicating that three-way branch would give
// it two places to drift.
export const video = (
  context: CanvasRenderingContext2D,
  transport: VideoTransport,
  props: VideoProps,
): void => {
  // Not getElement(): during the readiness gap a seek opens, the element has
  // no decoded frame and drawing it is a spec-mandated no-op, so the transport
  // hands back a retained frame instead. Asking it for "whatever is paintable"
  // keeps that choice in one place rather than spreading readiness checks
  // through the render pipeline.
  const source = transport.getFrameSource();

  if (source === null) {
    return;
  }

  const { width, height } = transport.getNaturalDimensions();

  // A video with no intrinsic size yet cannot be composited meaningfully --
  // cover/contain would divide by zero working out its aspect ratio.
  if (width <= 0 || height <= 0) {
    return;
  }

  drawImageSourceWithFit(context, source, width, height, props);
};
