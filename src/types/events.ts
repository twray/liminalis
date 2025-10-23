export interface KeyEvent {
  note: string;
  attack: number;
  number?: number;
  timestamp?: Date;
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
