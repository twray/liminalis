import { EasingFunction } from "./common";
import { EventTime } from "./events";

/**
 * Extract only numeric property keys from a type
 */
export type NumericKeys<T> = {
  [K in keyof T]: T[K] extends number
    ? K
    : T[K] extends number | undefined
    ? K
    : never;
}[keyof T];

/**
 * Create a partial type with only numeric properties
 */
export type PartialNumericProps<T> = Partial<Pick<T, NumericKeys<T>>>;

/**
 * Options for an animation segment
 */
export interface AnimationSegmentOptions {
  at?: EventTime | null;
  duration?: number;
  endTime?: number;
  delay?: number;
  easing?: EasingFunction;
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
