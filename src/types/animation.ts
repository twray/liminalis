import { EventTime } from "./";

export interface BaseAnimationOptions {
  from: number;
  to: number;
  startTime?: EventTime | null;
  delay?: number;
  easing?: ((t: number) => number) | null;
  reverse?: boolean;
}

export type AnimationOptions = BaseAnimationOptions &
  (
    | { duration: EventTime; endTime?: never }
    | { duration?: never; endTime: EventTime }
  );
