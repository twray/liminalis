import * as easingUtils from "easing-utils";

import type { EasingFunction } from "../types";
import {
  AnimationSegmentOptions,
  EasingUtilsFunctionName,
  PartialNumericProps,
} from "../types/animatable";
import { eventTimeToMs } from "../util";

interface Segment<TProps> {
  targetProps: PartialNumericProps<TProps>;
  options: AnimationSegmentOptions;
}

type BuiltInEasingFunctions = Pick<typeof easingUtils, EasingUtilsFunctionName>;

type TimelineEntry<TProps> = {
  segment: Segment<TProps>;
  startTime: number | null;
  duration: number;
};

interface NumericLeafTarget {
  path: string;
  value: number;
}

class Animatable<TProps extends object> {
  static #DEFAULT_EASING = (n: number): number => n;
  static #DEFAULT_DURATION = 500;
  static #BUILT_IN_EASING_FUNCTIONS: BuiltInEasingFunctions = easingUtils;

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
  #segmentStartValues: Map<string, number> = new Map();
  #hasWarnedAboutDelayWithAt = false;
  #hasWarnedAboutMissingDuration = false;

  constructor(props: TProps, firstInvokedTime: number) {
    this.#initialProps = this.#cloneValue(props);
    this.#firstInvokedTime = firstInvokedTime;
  }

  updateInitialProps(props: TProps): void {
    this.#initialProps = this.#cloneValue(props);
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
    options: AnimationSegmentOptions = {},
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

    // Start with initial props. Snapshot is only used when a newly-introduced
    // segment needs to inherit a live in-flight value.
    const baseProps = this.#cloneValue(this.#initialProps);

    // For each property, find the value at the current time
    return this.#evaluatePropsAtTime(timeline, baseProps, relativeTime);
  }

  #buildTimeline(): TimelineEntry<TProps>[] {
    const timeline: TimelineEntry<TProps>[] = [];

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
    timeline: TimelineEntry<TProps>[],
    baseProps: TProps,
    time: number,
  ): TProps {
    const result = this.#cloneValue(baseProps);

    // Sort by start time for proper evaluation order
    const sortedEntries = timeline
      .filter((e) => e.startTime !== null)
      .sort((a, b) => a.startTime! - b.startTime!);

    const segmentTargetsCache = new Map<Segment<TProps>, NumericLeafTarget[]>();

    this.#pruneSegmentStartValues(sortedEntries, segmentTargetsCache);

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

      for (const { path: key, value } of this.#getSegmentTargets(
        segment,
        segmentTargetsCache,
      )) {
        if (time >= endTime) {
          // Segment completed - record its final value
          propertyStates.set(key, {
            value,
            endTime,
          });
        }
      }
    }

    // Apply completed values to result
    for (const [key, state] of propertyStates) {
      this.#setValueAtPath(result, key, state.value);
    }

    // Second pass: for each property, find if there's an active (in-progress) segment
    // that supersedes everything else
    for (const entry of sortedEntries) {
      const { segment, startTime, duration } = entry;
      if (startTime === null) continue;

      const endTime = startTime + duration;

      // Only process segments that have started but not completed
      if (time < startTime || time > endTime) continue;

      for (const { path: key, value: targetValue } of this.#getSegmentTargets(
        segment,
        segmentTargetsCache,
      )) {
        // Check if a later segment for this property has started
        const laterSegmentStarted = sortedEntries.some((other) => {
          if (other === entry || other.startTime === null) return false;
          if (other.startTime <= startTime!) return false;
          if (time < other.startTime) return false;
          return this.#hasTargetPath(other.segment, key, segmentTargetsCache);
        });

        if (laterSegmentStarted) continue; // This property is owned by a later segment

        const segmentStartValueKey = this.#getSegmentStartValueKey(
          entry,
          key,
          targetValue,
        );

        const hasCachedStartValue =
          this.#segmentStartValues.has(segmentStartValueKey);

        const startValue = hasCachedStartValue
          ? this.#segmentStartValues.get(segmentStartValueKey)!
          : this.#computeSegmentStartValue(
              sortedEntries,
              entry,
              key,
              startTime,
              baseProps,
              segmentTargetsCache,
            );

        if (!hasCachedStartValue) {
          this.#segmentStartValues.set(segmentStartValueKey, startValue);
        }

        const elapsed = time - startTime;
        const rawProgress =
          duration === 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
        const progress = this.#applyProgress(rawProgress, segment.options);

        this.#setValueAtPath(
          result,
          key,
          startValue + (targetValue - startValue) * progress,
        );
      }
    }

    return result;
  }

  #cloneValue<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((item) => this.#cloneValue(item)) as T;
    }

    if (value !== null && typeof value === "object") {
      const cloned: Record<string, unknown> = {};

      for (const [key, nestedValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        cloned[key] = this.#cloneValue(nestedValue);
      }

      return cloned as T;
    }

    return value;
  }

  #collectNumericLeafTargets(
    value: unknown,
    currentPath = "",
    targets: NumericLeafTarget[] = [],
  ): NumericLeafTarget[] {
    if (typeof value === "number" && currentPath !== "") {
      targets.push({ path: currentPath, value });
      return targets;
    }

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        const nestedValue = value[index];

        if (nestedValue === undefined) {
          continue;
        }

        const path =
          currentPath === "" ? `${index}` : `${currentPath}.${index}`;
        this.#collectNumericLeafTargets(nestedValue, path, targets);
      }

      return targets;
    }

    if (value !== null && typeof value === "object") {
      for (const [key, nestedValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (nestedValue === undefined) {
          continue;
        }

        const path = currentPath === "" ? key : `${currentPath}.${key}`;
        this.#collectNumericLeafTargets(nestedValue, path, targets);
      }
    }

    return targets;
  }

  #getSegmentTargets(
    segment: Segment<TProps>,
    cache: Map<Segment<TProps>, NumericLeafTarget[]>,
  ): NumericLeafTarget[] {
    const cached = cache.get(segment);

    if (cached !== undefined) {
      return cached;
    }

    const targets = this.#collectNumericLeafTargets(segment.targetProps);
    cache.set(segment, targets);

    return targets;
  }

  #hasTargetPath(
    segment: Segment<TProps>,
    path: string,
    cache: Map<Segment<TProps>, NumericLeafTarget[]>,
  ): boolean {
    return this.#getSegmentTargets(segment, cache).some(
      (target) => target.path === path,
    );
  }

  #getTargetValue(
    segment: Segment<TProps>,
    path: string,
    cache: Map<Segment<TProps>, NumericLeafTarget[]>,
  ): number | undefined {
    const matchingTarget = this.#getSegmentTargets(segment, cache).find(
      (target) => target.path === path,
    );

    return matchingTarget?.value;
  }

  #isIndexSegment(segment: string): boolean {
    return /^\d+$/.test(segment);
  }

  #getValueAtPath(object: unknown, path: string): unknown {
    const segments = path.split(".");
    let currentValue = object as unknown;

    for (const segment of segments) {
      if (currentValue === null || currentValue === undefined) {
        return undefined;
      }

      if (Array.isArray(currentValue) && this.#isIndexSegment(segment)) {
        currentValue = currentValue[Number(segment)];
      } else if (typeof currentValue === "object") {
        currentValue = (currentValue as Record<string, unknown>)[segment];
      } else {
        return undefined;
      }
    }

    return currentValue;
  }

  #getNumericValueAtPath(object: unknown, path: string): number | undefined {
    const valueAtPath = this.#getValueAtPath(object, path);

    return typeof valueAtPath === "number" ? valueAtPath : undefined;
  }

  #setValueAtPath(object: unknown, path: string, value: number): void {
    const segments = path.split(".");

    if (segments.length === 0) {
      return;
    }

    let currentTarget = object as Record<string, unknown>;

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      const isLastSegment = index === segments.length - 1;
      const nextSegment = segments[index + 1];
      const nextIsArray =
        nextSegment !== undefined && this.#isIndexSegment(nextSegment);

      if (Array.isArray(currentTarget) && this.#isIndexSegment(segment)) {
        const arrayIndex = Number(segment);

        if (isLastSegment) {
          currentTarget[arrayIndex] = value;
          return;
        }

        if (
          currentTarget[arrayIndex] === undefined ||
          currentTarget[arrayIndex] === null ||
          typeof currentTarget[arrayIndex] !== "object"
        ) {
          currentTarget[arrayIndex] = nextIsArray ? [] : {};
        }

        currentTarget = currentTarget[arrayIndex] as Record<string, unknown>;
        continue;
      }

      if (isLastSegment) {
        currentTarget[segment] = value;
        return;
      }

      if (
        currentTarget[segment] === undefined ||
        currentTarget[segment] === null ||
        typeof currentTarget[segment] !== "object"
      ) {
        currentTarget[segment] = nextIsArray ? [] : {};
      }

      currentTarget = currentTarget[segment] as Record<string, unknown>;
    }
  }

  #getDefaultValueForPath(path: string): number {
    // Only top-level properties can have non-zero defaults.
    if (!path.includes(".")) {
      return Animatable.#PROPERTY_DEFAULTS[path] ?? 0;
    }

    return 0;
  }

  #getPropertyValueAtTime(
    sortedEntries: TimelineEntry<TProps>[],
    excludeEntry: TimelineEntry<TProps>,
    path: string,
    atTime: number,
    baseProps: TProps,
    segmentTargetsCache: Map<Segment<TProps>, NumericLeafTarget[]>,
    allowSnapshotFallback = true,
  ): number {
    // Start with base value.
    // Use property-specific defaults for certain properties (e.g., opacity, scale default to 1)

    const defaultValue = this.#getDefaultValueForPath(path);
    let value = this.#getNumericValueAtPath(baseProps, path) ?? defaultValue;

    if (
      allowSnapshotFallback &&
      this.#shouldUseSnapshotFallbackForSegment(
        sortedEntries,
        excludeEntry,
        path,
        segmentTargetsCache,
      )
    ) {
      value = this.#getNumericValueAtPath(this.#propsSnapshot, path) ?? value;
    }

    for (const entry of sortedEntries) {
      if (entry === excludeEntry) continue;
      if (entry.startTime === null) continue;

      const targetValue = this.#getTargetValue(
        entry.segment,
        path,
        segmentTargetsCache,
      );

      if (targetValue === undefined) continue;

      const { startTime, duration } = entry;
      const endTime = startTime + duration;

      // A segment that starts exactly at the query time has not yet
      // contributed to the property state. Treating startTime===atTime as
      // "not started" avoids recursive cycles when multiple segments target
      // the same path with identical start times.
      if (atTime <= startTime) continue;

      if (atTime >= endTime) {
        // Segment completed before our target time
        value = targetValue;
      } else {
        // Segment in progress at our target time
        const segmentStartValueKey = this.#getSegmentStartValueKey(
          entry,
          path,
          targetValue,
        );

        const hasCachedStartValue =
          this.#segmentStartValues.has(segmentStartValueKey);

        const prevValue = hasCachedStartValue
          ? this.#segmentStartValues.get(segmentStartValueKey)!
          : this.#getPropertyValueAtTime(
              sortedEntries,
              entry,
              path,
              startTime,
              baseProps,
              segmentTargetsCache,
              allowSnapshotFallback,
            );

        if (!hasCachedStartValue) {
          this.#segmentStartValues.set(segmentStartValueKey, prevValue);
        }

        const elapsed = atTime - startTime;
        const rawProgress =
          duration === 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
        const progress = this.#applyProgress(
          rawProgress,
          entry.segment.options,
        );
        value = prevValue + (targetValue - prevValue) * progress;
      }
    }

    return value;
  }

  #computeSegmentStartValue(
    sortedEntries: TimelineEntry<TProps>[],
    entry: TimelineEntry<TProps>,
    path: string,
    startTime: number,
    baseProps: TProps,
    segmentTargetsCache: Map<Segment<TProps>, NumericLeafTarget[]>,
  ): number {
    return this.#getPropertyValueAtTime(
      sortedEntries,
      entry,
      path,
      startTime,
      baseProps,
      segmentTargetsCache,
      true,
    );
  }

  #shouldUseSnapshotFallbackForSegment(
    sortedEntries: TimelineEntry<TProps>[],
    excludeEntry: TimelineEntry<TProps>,
    path: string,
    segmentTargetsCache: Map<Segment<TProps>, NumericLeafTarget[]>,
  ): boolean {
    if (
      this.#propsSnapshot === null ||
      this.#getNumericValueAtPath(this.#propsSnapshot, path) === undefined
    ) {
      return false;
    }

    if (excludeEntry.startTime === null || excludeEntry.startTime <= 0) {
      return false;
    }

    const hasPriorSegmentForProperty = sortedEntries.some((entry) => {
      if (entry === excludeEntry || entry.startTime === null) return false;
      if (!this.#hasTargetPath(entry.segment, path, segmentTargetsCache)) {
        return false;
      }

      return entry.startTime < excludeEntry.startTime!;
    });

    return !hasPriorSegmentForProperty;
  }

  #getSegmentStartValueKey(
    entry: TimelineEntry<TProps>,
    path: string,
    targetValue: number,
  ): string {
    const startTime = entry.startTime ?? "null";

    return `${path}|${startTime}|${entry.duration}|${targetValue}`;
  }

  #pruneSegmentStartValues(
    sortedEntries: TimelineEntry<TProps>[],
    segmentTargetsCache: Map<Segment<TProps>, NumericLeafTarget[]>,
  ): void {
    if (this.#segmentStartValues.size === 0) {
      return;
    }

    const validKeys = new Set<string>();

    for (const entry of sortedEntries) {
      if (entry.startTime === null) continue;

      for (const target of this.#getSegmentTargets(
        entry.segment,
        segmentTargetsCache,
      )) {
        validKeys.add(
          this.#getSegmentStartValueKey(entry, target.path, target.value),
        );
      }
    }

    for (const cachedKey of this.#segmentStartValues.keys()) {
      if (!validKeys.has(cachedKey)) {
        this.#segmentStartValues.delete(cachedKey);
      }
    }
  }

  #applyProgress(
    rawProgress: number,
    options: AnimationSegmentOptions,
  ): number {
    const easing = this.#resolveEasing(options.easing);
    let progress = easing(rawProgress);
    if (options.reverse) {
      progress = 1 - progress;
    }
    return progress;
  }

  #resolveEasing(easing: AnimationSegmentOptions["easing"]): EasingFunction {
    if (typeof easing === "function") {
      return easing;
    }

    if (typeof easing === "string") {
      const easingFunction = Animatable.#BUILT_IN_EASING_FUNCTIONS[easing];

      if (typeof easingFunction === "function") {
        return easingFunction;
      }
    }

    return Animatable.#DEFAULT_EASING;
  }

  reset(): void {
    this.#segments = [];
    this.#segmentStartValues.clear();
    this.#propsSnapshot = null;
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
      (s) => s.options.at !== undefined && s.options.at !== null,
    );

    if (segmentsWithAt.length === 0) return;

    // Check if delay was applied globally via withOptions
    const globalDelayApplied = this.#appliedOptions.delay !== undefined;

    // Find segments with 'at' that have explicit delay
    const segmentsWithAtAndDelay = segmentsWithAt.filter(
      (s) => s.options.delay !== undefined,
    );

    // Find segments with 'at' that don't have delay (and no global delay)
    const segmentsWithAtWithoutDelay = segmentsWithAt.filter(
      (s) => s.options.delay === undefined && !globalDelayApplied,
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
          `  2. Explicitly set 'delay' on each segment that uses 'at`,
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
      (s) =>
        s.options.duration === undefined && s.options.endTime === undefined,
    );

    if (segmentsWithoutDuration.length > 0) {
      this.#hasWarnedAboutMissingDuration = true;
      console.warn(
        `[Animatable] Warning: ${segmentsWithoutDuration.length} animation segment(s) have no explicit 'duration' or 'endTime'. ` +
          `Using default duration of ${Animatable.#DEFAULT_DURATION}ms. ` +
          `Consider specifying duration explicitly or using withOptions({ duration: ... }).`,
      );
    }
  }
}

export default Animatable;
