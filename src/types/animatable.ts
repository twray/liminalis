import { EasingFunction } from "./common";
import { EventTime } from "./events";

type EasingUtilsModule = typeof import("easing-utils");

type EasingUtilsExportKey = {
  [K in keyof EasingUtilsModule]: EasingUtilsModule[K] extends (
    t: number,
    ...args: any[]
  ) => number
    ? K
    : never;
}[keyof EasingUtilsModule];

export type EasingUtilsFunctionName = Extract<EasingUtilsExportKey, string>;

/**
 * Recursively map a type to only its numeric leaves.
 */
export type DeepNumericProps<T> = T extends number | undefined
  ? number
  : T extends (infer U)[]
    ? DeepNumericProps<U>[]
    : T extends object
      ? { [K in keyof T]?: DeepNumericProps<T[K]> }
      : never;

/**
 * Create a partial type that allows animating any nested numeric leaf.
 */
export type PartialNumericProps<T> = Partial<{
  [K in keyof T]: DeepNumericProps<T[K]>;
}>;

/**
 * Options for an animation segment
 */
export interface AnimationSegmentOptions {
  at?: EventTime | null;
  duration?: number;
  endTime?: number;
  delay?: number;
  easing?: EasingFunction | EasingUtilsFunctionName;
  reverse?: boolean;
}

/**
 * Internal representation of an animation segment
 */
export interface AnimationSegment<TProps> {
  targetProps: PartialNumericProps<TProps>;
  options: AnimationSegmentOptions;
  startProps: Partial<TProps> | null; // null until segment becomes active
  effectiveStartTime: number | null;
}
