export interface CanvasProps {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time?: number;
  frame?: number;
  playhead?: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CanvasPosition {
  x: number;
  y: number;
}
