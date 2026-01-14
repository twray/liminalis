import {
  AnimationSegmentOptions,
  PartialNumericProps,
} from "../types/animatable";
import { eventTimeToMs } from "../util";

interface Segment<TProps> {
  targetProps: PartialNumericProps<TProps>;
  options: AnimationSegmentOptions;
}

class Animatable<TProps extends object> {
  static #DEFAULT_EASING = (n: number): number => n;
  static #DEFAULT_DURATION = 500;

  static #PROPERTY_DEFAULTS: Record<string, number> = {
    opacity: 1,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
  };

  #initialProps: TProps;
  #firstInvokedTime: number;
  #segments: Segment<TProps>[] = [];
  #appliedOptions: Partial<AnimationSegmentOptions> = {};
  #propsSnapshot: Partial<TProps> | null = null;
  #hasWarnedAboutDelayWithAt = false;
  #hasWarnedAboutMissingDuration = false;

  constructor(props: TProps, firstInvokedTime: number) {
    this.#initialProps = { ...props };
    this.#firstInvokedTime = firstInvokedTime;
  }

  updateInitialProps(props: TProps): void {
    this.#initialProps = { ...props };
  }

  captureCurrentProps(timeInMs: number): void {
    this.#propsSnapshot = this.getCurrentProps(timeInMs);
  }

  clearSegments(): void {
    this.#segments = [];
  }

  clearSnapshot(): void {
    this.#propsSnapshot = null;
  }

  animateTo(
    targetProps: PartialNumericProps<TProps>,
    options: AnimationSegmentOptions = {}
  ): this {
    this.#segments.push({
      targetProps,
      options: { ...this.#appliedOptions, ...options },
    });
    return this;
  }

  withOptions(options: Partial<AnimationSegmentOptions>): this {
    this.#appliedOptions = { ...this.#appliedOptions, ...options };
    return this;
  }

  getCurrentProps(timeInMs: number): TProps {
    const relativeTime = timeInMs - this.#firstInvokedTime;

    // Build timeline: calculate effective start times for all segments
    const timeline = this.#buildTimeline();

    // Start with initial props (merged with snapshot if available)
    const baseProps = this.#propsSnapshot
      ? { ...this.#initialProps, ...this.#propsSnapshot }
      : { ...this.#initialProps };

    // For each property, find the value at the current time
    return this.#evaluatePropsAtTime(timeline, baseProps, relativeTime);
  }

  #buildTimeline(): Array<{
    segment: Segment<TProps>;
    startTime: number | null;
    duration: number;
  }> {
    const timeline: Array<{
      segment: Segment<TProps>;
      startTime: number | null;
      duration: number;
    }> = [];

    let cumulativeEnd = 0;

    for (let i = 0; i < this.#segments.length; i++) {
      const segment = this.#segments[i];
      const { at, duration, endTime, delay = 0 } = segment.options;

      let startTime: number | null;
      let segmentDuration: number;

      if (at !== undefined) {
        if (at === null) {
          startTime = null;
          segmentDuration =
            duration ??
            (endTime !== undefined ? endTime : Animatable.#DEFAULT_DURATION);
        } else {
          const atMs = eventTimeToMs(at);
          startTime = atMs + delay;
          segmentDuration =
            duration ??
            (endTime !== undefined
              ? endTime - atMs
              : Animatable.#DEFAULT_DURATION);
        }
      } else {
        // Sequential
        if (i === 0) {
          startTime = delay;
          segmentDuration =
            duration ??
            (endTime !== undefined ? endTime : Animatable.#DEFAULT_DURATION);
        } else {
          const prev = timeline[i - 1];
          if (prev.startTime === null) {
            startTime = null;
            segmentDuration =
              duration ??
              (endTime !== undefined ? endTime : Animatable.#DEFAULT_DURATION);
          } else {
            startTime = cumulativeEnd + delay;
            segmentDuration =
              duration ??
              (endTime !== undefined
                ? endTime - startTime
                : Animatable.#DEFAULT_DURATION);
          }
        }
      }

      if (startTime !== null) {
        cumulativeEnd = startTime + segmentDuration;
      }

      timeline.push({ segment, startTime, duration: segmentDuration });
    }

    return timeline;
  }

  #evaluatePropsAtTime(
    timeline: Array<{
      segment: Segment<TProps>;
      startTime: number | null;
      duration: number;
    }>,
    baseProps: TProps,
    time: number
  ): TProps {
    const result = { ...baseProps };

    // Sort by start time for proper evaluation order
    const sortedEntries = timeline
      .filter((e) => e.startTime !== null)
      .sort((a, b) => a.startTime! - b.startTime!);

    // For each property, we need to find the "active" segment (the latest one that has started)
    // and interpolate or use completed value
    const propertyStates = new Map<
      string,
      { value: number; endTime: number }
    >();

    // First pass: apply all completed segments to get base state
    for (const entry of sortedEntries) {
      const { segment, startTime, duration } = entry;
      if (startTime === null) continue;

      const endTime = startTime + duration;

      for (const key of Object.keys(segment.targetProps)) {
        if (time >= endTime) {
          // Segment completed - record its final value
          propertyStates.set(key, {
            value: (segment.targetProps as any)[key],
            endTime,
          });
        }
      }
    }

    // Apply completed values to result
    for (const [key, state] of propertyStates) {
      (result as any)[key] = state.value;
    }

    // Second pass: for each property, find if there's an active (in-progress) segment
    // that supersedes everything else
    for (const entry of sortedEntries) {
      const { segment, startTime, duration } = entry;
      if (startTime === null) continue;

      const endTime = startTime + duration;

      // Only process segments that have started but not completed
      if (time < startTime || time > endTime) continue;

      for (const key of Object.keys(segment.targetProps)) {
        // Check if a later segment for this property has started
        const laterSegmentStarted = sortedEntries.some((other) => {
          if (other === entry || other.startTime === null) return false;
          if (other.startTime <= startTime!) return false;
          if (time < other.startTime) return false;
          return key in other.segment.targetProps;
        });

        if (laterSegmentStarted) continue; // This property is owned by a later segment

        // Calculate the start value for this segment
        const startValue = this.#getPropertyValueAtTime(
          sortedEntries,
          entry,
          key,
          startTime,
          baseProps
        );

        const targetValue = (segment.targetProps as any)[key] as number;
        const elapsed = time - startTime;
        const rawProgress =
          duration === 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
        const progress = this.#applyProgress(rawProgress, segment.options);

        (result as any)[key] =
          startValue + (targetValue - startValue) * progress;
      }
    }

    return result;
  }

  #getPropertyValueAtTime(
    sortedEntries: Array<{
      segment: Segment<TProps>;
      startTime: number | null;
      duration: number;
    }>,
    excludeEntry: {
      segment: Segment<TProps>;
      startTime: number | null;
      duration: number;
    },
    key: string,
    atTime: number,
    baseProps: TProps
  ): number {
    // Start with base value (which already includes snapshot if available)
    // Use property-specific defaults for certain properties (e.g., opacity, scale default to 1)
    const defaultValue = Animatable.#PROPERTY_DEFAULTS[key] ?? 0;
    let value = (baseProps as any)[key] ?? defaultValue;

    // If we have a snapshot, it represents the "ground truth" at the moment it was captured.
    // For segments that supersede other segments, we should use the snapshot value
    // rather than recalculating from earlier segments that may have been rebuilt.
    // This handles the case where we re-attack during a release - the snapshot
    // captures where we actually were, not where the rebuilt segments would calculate.
    if (this.#propsSnapshot !== null && key in this.#propsSnapshot) {
      // Check if this is the "superseding" segment (the one with the latest start time that contains this key)
      const isSupersedingSegment = !sortedEntries.some((other) => {
        if (other === excludeEntry || other.startTime === null) return false;
        if (!(key in other.segment.targetProps)) return false;
        // There's another segment for this property that starts later
        return other.startTime > excludeEntry.startTime!;
      });

      // If this is the superseding segment, use snapshot value directly
      if (isSupersedingSegment) {
        return (this.#propsSnapshot as any)[key] ?? value;
      }
    }

    for (const entry of sortedEntries) {
      if (entry === excludeEntry) continue;
      if (entry.startTime === null) continue;
      if (!(key in entry.segment.targetProps)) continue;

      const { startTime, duration } = entry;
      const endTime = startTime + duration;

      if (atTime < startTime) continue;

      if (atTime >= endTime) {
        // Segment completed before our target time
        value = (entry.segment.targetProps as any)[key];
      } else {
        // Segment in progress at our target time
        const prevValue = this.#getPropertyValueAtTime(
          sortedEntries,
          entry,
          key,
          startTime,
          baseProps
        );

        const targetValue = (entry.segment.targetProps as any)[key] as number;
        const elapsed = atTime - startTime;
        const rawProgress =
          duration === 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
        const progress = this.#applyProgress(
          rawProgress,
          entry.segment.options
        );
        value = prevValue + (targetValue - prevValue) * progress;
      }
    }

    return value;
  }

  #applyProgress(
    rawProgress: number,
    options: AnimationSegmentOptions
  ): number {
    const easing = options.easing ?? Animatable.#DEFAULT_EASING;
    let progress = easing(rawProgress);
    if (options.reverse) {
      progress = 1 - progress;
    }
    return progress;
  }

  reset(): void {
    this.#segments = [];
  }

  /**
   * Validate animation configuration and warn about potential issues.
   * This should be called once after all animations are defined,
   * typically by AnimatableRegistry before rendering.
   */
  validate(): void {
    this.#validateDelayWithAtUsage();
    this.#validateMissingDuration();
  }

  #validateDelayWithAtUsage(): void {
    // Only warn once per Animatable instance
    if (this.#hasWarnedAboutDelayWithAt) return;

    const segmentsWithAt = this.#segments.filter(
      (s) => s.options.at !== undefined && s.options.at !== null
    );

    if (segmentsWithAt.length === 0) return;

    // Check if delay was applied globally via withOptions
    const globalDelayApplied = this.#appliedOptions.delay !== undefined;

    // Find segments with 'at' that have explicit delay
    const segmentsWithAtAndDelay = segmentsWithAt.filter(
      (s) => s.options.delay !== undefined
    );

    // Find segments with 'at' that don't have delay (and no global delay)
    const segmentsWithAtWithoutDelay = segmentsWithAt.filter(
      (s) => s.options.delay === undefined && !globalDelayApplied
    );

    // Warn if there's a mix: some 'at' segments have delay, others don't
    if (
      segmentsWithAtAndDelay.length > 0 &&
      segmentsWithAtWithoutDelay.length > 0
    ) {
      this.#hasWarnedAboutDelayWithAt = true;
      console.warn(
        `[Animatable] Warning: Animation has segments with 'at' property where some have 'delay' and others do not. ` +
          `This may result in unexpected timing. Consider either:\n` +
          `  1. Apply 'delay' to all segments using withOptions({ delay: ... })\n` +
          `  2. Explicitly set 'delay' on each segment that uses 'at`
      );
    }
  }

  #validateMissingDuration(): void {
    // Only warn once per Animatable instance
    if (this.#hasWarnedAboutMissingDuration) return;

    // Check if duration was applied globally via withOptions
    const globalDurationApplied = this.#appliedOptions.duration !== undefined;
    if (globalDurationApplied) return;

    // Find segments without explicit duration or endTime
    const segmentsWithoutDuration = this.#segments.filter(
      (s) => s.options.duration === undefined && s.options.endTime === undefined
    );

    if (segmentsWithoutDuration.length > 0) {
      this.#hasWarnedAboutMissingDuration = true;
      console.warn(
        `[Animatable] Warning: ${segmentsWithoutDuration.length} animation segment(s) have no explicit 'duration' or 'endTime'. ` +
          `Using default duration of ${Animatable.#DEFAULT_DURATION}ms. ` +
          `Consider specifying duration explicitly or using withOptions({ duration: ... }).`
      );
    }
  }
}

export default Animatable;
