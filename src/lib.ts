// Main library entry point for npm package
export { createScene, logMessage, visual } from "./core";
export { createLayer } from "./core/factories/createLayer";
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
