// Main library entry point for npm package
export { createScene, logMessage, visual } from "./core";
export { default as Animatable } from "./core/Animatable";
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
