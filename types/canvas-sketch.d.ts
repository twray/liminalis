declare module "canvas-sketch" {
  interface SketchSettings {
    dimensions?: [number, number] | string;
    animate?: boolean;
    fps?: number;
    duration?: number;
    playbackRate?: number;
    exportPixelRatio?: number;
    scaleToView?: boolean;
    resizeCanvas?: boolean;
    styleCanvas?: boolean;
    canvas?: HTMLCanvasElement;
    context?: string;
    attributes?: any;
    pixelated?: boolean;
    hotkeys?: boolean;
    file?: string;
    name?: string;
    prefix?: string;
    suffix?: string;
  }

  interface SketchProps {
    context: CanvasRenderingContext2D;
    width: number;
    height: number;
    canvas: HTMLCanvasElement;
    time: number;
    frame: number;
    fps: number;
    playbackRate: number;
    duration: number;
    totalFrames: number;
    recording: boolean;
    settings: SketchSettings;
  }

  type SketchFunction = () => (props: SketchProps) => void | (() => void);

  function canvasSketch(
    sketch: SketchFunction,
    settings?: SketchSettings
  ): Promise<any>;

  export = canvasSketch;
}

declare module "canvas-sketch-util" {
  interface ParsedColor {
    hex: string;
    alpha: number;
    rgb: [number, number, number];
    rgba: [number, number, number, number];
    hsl: [number, number, number];
    hsla: [number, number, number, number];
  }

  export const random: {
    random(): number;
    range(min: number, max: number): number;
    rangeFloor(min: number, max: number): number;
    shuffle<T>(array: T[]): T[];
    pick<T>(array: T[]): T;
    weighted<T>(array: T[], weights: number[]): T;
    chance(probability: number): boolean;
    sign(): number;
    gaussian(mean?: number, standardDeviation?: number): number;
  };

  export const math: {
    lerp(min: number, max: number, t: number): number;
    clamp(value: number, min: number, max: number): number;
    clamp01(value: number): number;
    inverseLerp(min: number, max: number, value: number): number;
    mapRange(
      value: number,
      inputMin: number,
      inputMax: number,
      outputMin: number,
      outputMax: number,
      clamp?: boolean
    ): number;
    pingPong(t: number, length: number): number;
    smoothstep(edge0: number, edge1: number, x: number): number;
    degToRad(degrees: number): number;
    radToDeg(radians: number): number;
  };

  export const color: {
    parse(color: string): {
      rgb: [number, number, number];
      hsl: [number, number, number];
    };
    style(color: any): string;
    offsetHSL(
      baseColor: string,
      hue: number,
      saturation: number,
      luminance: number
    ): ParsedColor;
  };
}

declare module "easing-utils" {
  export function linear(t: number): number;
  export function quadIn(t: number): number;
  export function quadOut(t: number): number;
  export function quadInOut(t: number): number;
  export function cubicIn(t: number): number;
  export function cubicOut(t: number): number;
  export function cubicInOut(t: number): number;
  export function quartIn(t: number): number;
  export function quartOut(t: number): number;
  export function quartInOut(t: number): number;
  export function quintIn(t: number): number;
  export function quintOut(t: number): number;
  export function quintInOut(t: number): number;
  export function sineIn(t: number): number;
  export function sineOut(t: number): number;
  export function sineInOut(t: number): number;
  export function expoIn(t: number): number;
  export function expoOut(t: number): number;
  export function expoInOut(t: number): number;
  export function circIn(t: number): number;
  export function circOut(t: number): number;
  export function circInOut(t: number): number;
  export function backIn(t: number): number;
  export function backOut(t: number): number;
  export function backInOut(t: number): number;
  export function bounceIn(t: number): number;
  export function bounceOut(t: number): number;
  export function bounceInOut(t: number): number;
  export function elasticIn(t: number): number;
  export function elasticOut(t: number): number;
  export function elasticInOut(t: number): number;
}
