import { NormalizedFloat } from "./common";

interface BaseNoteEvent {
  time: number;
  note: string;
  noteNumber: number;
}

export type MidiEventType = "noteon" | "noteoff" | "controlchange";

export type NoteEventType = "notedown" | "noteup";

export interface NoteOnEvent extends BaseNoteEvent {
  event: "notedown";
  attack: NormalizedFloat;
}

export interface NoteOffEvent extends BaseNoteEvent {
  event: "noteup";
}

export type NoteEvent = NoteOnEvent | NoteOffEvent;

interface PedalEvent {
  type: PianoPedal;
}

export interface PedalOnOffEvent extends PedalEvent {}

export interface PedalChangeEvent extends PedalEvent {
  value: number;
}

export interface ControlChangeEvent {
  controlChangeNumber: number;
  value: number;
}

export type EventTime = number | string;

export interface ActiveNotesEvent {
  notes: NoteOnEvent[];
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

export type PianoPedal = "damperpedal" | "sostenuto" | "softpedal";

export interface MidiControllerEvent {
  type: "controller";
  subtype: PianoPedal;
  value: number;
}

export interface ArpeggioEvent {
  direction: 1 | -1;
  stepCount: number;
  maxSteps: number;
}
