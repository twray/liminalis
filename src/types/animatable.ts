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
 * Recursively map a type to only its numeric leaves. A value with no numeric
 * leaf at all -- `string[]`, `{ family: string }`, a function -- maps to
 * `never` rather than to an empty shell (`never[]`, `{}`), so it reads as
 * non-numeric to NumericKeys below. Mutually recursive with NumericKeys: an
 * object is numeric exactly when it has at least one numeric key.
 */
export type DeepNumericProps<T> = T extends number | undefined
  ? number
  : T extends (infer U)[]
    ? [DeepNumericProps<U>] extends [never]
      ? never
      : DeepNumericProps<U>[]
    : T extends object
      ? [NumericKeys<T>] extends [never]
        ? never
        : { [K in keyof T]?: DeepNumericProps<T[K]> }
      : never;

/**
 * Keys in T that hold at least one numeric leaf -- exactly the keys
 * PartialNumericProps<T> can target, because both are defined by
 * DeepNumericProps. Optional props (`x?: number`) and nested ones
 * (`points: Point2D[]`, `cornerRadius: Corners | number`) both count.
 *
 * NonNullable strips the `undefined` an optional prop carries, which would
 * otherwise defeat the check. The tuple wrapper stops a union such as
 * `Corners | number` from being distributed and tested member by member.
 */
export type NumericKeys<T> = {
  [K in keyof T]-?: [DeepNumericProps<NonNullable<T[K]>>] extends [never]
    ? never
    : K;
}[keyof T];

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
  /**
   * Absolute scene time at which the segment starts -- the same base as a
   * frame's `current.time` and a reactive layer's `timeOf.*`. `null` leaves
   * the segment unscheduled until it is given a time. Segments without `at`
   * run sequentially from the primitive's first declaration.
   */
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

/**
 * Interface of an animatable-like object.
 *
 * TAnimatableKeys narrows which props animateTo() may target. It defaults to
 * every numeric prop, which suits primitives whose numeric props all
 * interpolate meaningfully (rect, circle, ...). A primitive with numeric props
 * that must NOT be interpolated passes an allow-list instead -- e.g. an
 * isometric tile, whose isoX/isoY/isoZ are integer grid coordinates. The
 * constraint guarantees that allow-list only ever names numeric props.
 *
 * Narrowing is type-level only: the runtime Animatable still interpolates any
 * numeric leaf it is handed, and remains assignable to every narrowed view
 * because its animateTo accepts the wider PartialNumericProps<TProps>.
 */
export interface IAnimatableLike<
  TProps,
  TAnimatableKeys extends NumericKeys<TProps> = NumericKeys<TProps>,
> {
  readonly currentProps: Readonly<TProps>;
  setCurrentFrameTime(timeInMs: number): void;
  updateInitialProps(props: TProps): void;
  captureCurrentProps(timeInMs: number): void;
  clearSegments(): void;
  clearSnapshot(): void;
  hasSegmentTargeting(key: keyof TProps): boolean;
  animateTo(
    targetProps: PartialNumericProps<Pick<TProps, TAnimatableKeys>>,
    options?: AnimationSegmentOptions,
  ): IAnimatableLike<TProps, TAnimatableKeys>;
  withOptions(
    options: Partial<AnimationSegmentOptions>,
  ): IAnimatableLike<TProps, TAnimatableKeys>;
  loop(): IAnimatableLike<TProps, TAnimatableKeys>;
  getCurrentProps(timeInMs: number): TProps;
}
