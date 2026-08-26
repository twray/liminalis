// Main library entry point for npm package
export { createScene, logMessage, visual } from "./core";
export { default as Animatable } from "./render/Animatable";
export {
  ALL_PRIMITIVE_NAMES,
  OVERLAY_WARNING_NAMED_PRIMITIVES,
  PRIMITIVE_NAME,
} from "./render/primitiveNames";
export type { PrimitiveName } from "./render/primitiveNames";
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
