import type {
  Corners,
  MidiControllerEvent,
  MidiEvent,
  MidiNoteEvent,
  NormalizedFloat,
  TimeExpression,
} from "../types";

export function isTimeExpression(value: string): value is TimeExpression {
  const timestampRegex = /^(?:(\d+):)?([0-5]?\d):([0-5]\d)$/;
  return timestampRegex.test(value);
}

export function isNormalizedFloat(value: number): value is NormalizedFloat {
  return value >= 0 && value <= 1;
}

export function isCorners(value: Corners | number): value is Corners {
  return typeof value === "object" && value !== null;
}

export function isMidiNoteEvent(
  midiEvent: MidiEvent,
): midiEvent is MidiNoteEvent {
  return midiEvent.type === "note";
}

export function isMidiControllerEvent(
  midiEvent: MidiEvent,
): midiEvent is MidiControllerEvent {
  return midiEvent.type === "controller";
}
