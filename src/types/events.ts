import { NormalizedFloat } from "./common";

interface BaseNoteEvent {
  time: number;
  note: string;
  noteNumber: number;
}

export type NoteEventType = "notedown" | "noteup";

export interface NoteDownEvent extends BaseNoteEvent {
  event: "notedown";
  attack: NormalizedFloat;
}

export interface NoteUpEvent extends BaseNoteEvent {
  event: "noteup";
}

export type NoteEvent = NoteDownEvent | NoteUpEvent;

export interface TimeEvent {
  time: number | string;
}

export interface ChordEvent {
  notes: string[];
  attack: number;
  timestamp: Date;
}

export interface MidiEvent {
  type: "noteon" | "noteoff";
  note: string;
  velocity: number;
  channel: number;
}

export interface ArpeggioEvent {
  direction: 1 | -1;
  stepCount: number;
  maxSteps: number;
}
