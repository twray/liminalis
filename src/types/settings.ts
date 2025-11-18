export interface AppSettings {
  computerKeyboardDebugEnabled: boolean;
  midiEnabled?: boolean;
  debugMode?: boolean;
}

export interface SketchSettings {
  dimensions: [number, number];
  animate: boolean;
  fps: number;
  duration?: number;
  playbackRate?: "throttle" | "fixed";
}

export interface IsometricViewSettings {
  tileWidth: number;
  contextWidth: number;
  contextHeight: number;
}
