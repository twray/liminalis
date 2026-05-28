// Main library entry point for npm package
export {
  createVisualisation,
  defineMidiVisual,
  defineVisual,
  logMessage,
  midiVisual,
  visual,
} from "./core";
export { default as Animatable } from "./core/Animatable";
export type {
  CircleProps,
  LineProps,
  RectProps,
  TransformOrigin,
  TransformProps,
} from "./core/drawMethods";
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
