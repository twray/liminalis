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

export interface MidiEvent {
  type: "noteon" | "noteoff";
  note: string;
  velocity: number;
  channel: number;
}

export interface MidiNoteEvent {
  note: {
    identifier: string;
    number: number;
    attack: number;
  };
}

export interface ArpeggioEvent {
  direction: 1 | -1;
  stepCount: number;
  maxSteps: number;
}
