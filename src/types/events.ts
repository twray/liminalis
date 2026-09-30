import { NormalizedFloat } from "./common";

interface BaseNoteEvent {
  time: number;
  note: string;
  noteNumber: number;
}

export type MidiEventType = "noteon" | "noteoff" | "controlchange";

export type NoteEventType = "notedown" | "noteup";

export interface NoteDownEvent extends BaseNoteEvent {
  event: "notedown";
  attack: NormalizedFloat;
}

export interface NoteUpEvent extends BaseNoteEvent {
  event: "noteup";
}

// What NoteEventManager actually stores and returns: the discriminant is
// `event` ("notedown" | "noteup"), unrelated to MidiEvent's own discriminant
// (`type`: "note" | "controller") -- two different unions that happen to
// share the word "event" in their names but describe different things.
export type NoteEvent = NoteDownEvent | NoteUpEvent;

export type EventTime = number | string;

export interface ActiveNotesEvent {
  notes: NoteDownEvent[];
}

export interface TimeEvent {
  time: EventTime;
}

export interface ChordEvent {
  notes: string[];
  attack: number;
  timestamp: Date;
}

export type MidiEvent = MidiNoteEvent | MidiControllerEvent;

export interface MidiNoteEvent {
  type: "note";
  note: {
    identifier: string;
    number: number;
    attack: number;
  };
}

export interface MidiControllerEvent {
  type: "controller";
  subtype: "damperpedal";
  value: number;
}

export interface ArpeggioEvent {
  direction: 1 | -1;
  stepCount: number;
  maxSteps: number;
}
