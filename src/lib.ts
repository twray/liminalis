// Main library entry point for npm package
export { createScene, logMessage } from "./core";
export { createLayer } from "./core/factories/createLayer";
export { createReactiveLayer } from "./core/factories/createReactiveLayer";
export { default as Animatable } from "./render/Animatable";
export type {
  AnimationSegment,
  AnimationSegmentOptions,
  AppSettings,
  CanvasProps,
  EventTime,
  MidiNoteEvent,
  NormalizedFloat,
  NoteDownEvent,
  NoteUpEvent,
  NumericKeys,
  PartialNumericProps,
  Point2D,
  SketchSettings,
} from "./types";
