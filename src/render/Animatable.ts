import * as easingUtils from "easing-utils";

import type {
  AnimationSegmentOptions,
  EasingFunction,
  EasingUtilsFunctionName,
  PartialNumericProps,
} from "../types";
import { eventTimeToMs } from "../util";
import type { IAnimatableLike } from "../types";

interface Segment<TProps> {
  targetProps: PartialNumericProps<TProps>;
  options: AnimationSegmentOptions;
}

type BuiltInEasingFunctions = Pick<typeof easingUtils, EasingUtilsFunctionName>;

type AnimatableTimelineEntry<TProps> = {
  segment: Segment<TProps>;
  startTime: number | null;
  duration: number;
};

interface AnimatableNumericLeafTarget {
  path: string;
  value: number;
}

class Animatable<TProps extends object> implements IAnimatableLike<TProps> {
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
  #currentFrameTimeInMs: number;
  #segments: Segment<TProps>[] = [];
  #appliedOptions: Partial<AnimationSegmentOptions> = {};
  #propsSnapshot: Partial<TProps> | null = null;
  #staticPropsCache: { initialProps: TProps; result: TProps } | null = null;
  #settledCache: {
    initialProps: TProps;
    segments: Segment<TProps>[];
    settledAtRelativeTime: number;
    result: TProps;
  } | null = null;
  // Inputs for a snapshot that has been requested but not yet computed. See
  // captureCurrentProps: resolving a snapshot costs a full getCurrentProps
  // (timeline rebuild plus deep clones), and it is consumed only in the
  // narrow case where a newly-introduced segment inherits an in-flight
  // value -- so the inputs are stashed and the work deferred until a reader
  // actually needs it.
  #pendingSnapshotSource: {
    segments: Segment<TProps>[];
    initialProps: TProps;
    previousSnapshot: Partial<TProps> | null;
    timeInMs: number;
  } | null = null;
  #segmentStartValues: Map<string, number> = new Map();
  #hasWarnedAboutDelayWithAt = false;
  #hasWarnedAboutMissingDuration = false;

  constructor(props: TProps, firstInvokedTime: number) {
    this.#initialProps = this.#cloneValue(props);
    this.#firstInvokedTime = firstInvokedTime;
    this.#currentFrameTimeInMs = firstInvokedTime;
  }

  // The props as DECLARED this frame (after style merging), as opposed to
  // currentProps, which resolves them against the timeline and so reports
  // mid-animation values. Used by AnimatableRegistry's unkeyed-reorder
  // diagnostic: a caller trying to locate the offending call site recognises
  // what they wrote, not an interpolated float they never typed.
  get declaredProps(): Readonly<TProps> {
    return this.#initialProps;
  }

  get currentProps(): Readonly<TProps> {
    return this.getCurrentProps(this.#currentFrameTimeInMs);
  }

  setCurrentFrameTime(timeInMs: number): void {
    this.#currentFrameTimeInMs = timeInMs;
  }

  // Re-cloning identical props every frame is pure waste, and keeping the
  // existing object also lets getCurrentProps below recognise "nothing
  // changed" by reference alone. Conservative: nested values compare by
  // reference, so anything non-flat re-clones.
  updateInitialProps(props: TProps): void {
    if (this.#shallowEqualsInitialProps(props)) {
      return;
    }

    this.#initialProps = this.#cloneValue(props);
  }

  #shallowEqualsInitialProps(props: TProps): boolean {
    return Animatable.#shallowRecordEquals(
      this.#initialProps as Record<string, unknown>,
      props as Record<string, unknown>,
    );
  }

  // Conservative by design: nested values compare by reference, so anything
  // non-flat reads as changed and forces a recompute. A false "changed"
  // costs one evaluation; a false "unchanged" would render a stale value.
  static #shallowRecordEquals(
    previous: Record<string, unknown>,
    next: Record<string, unknown>,
  ): boolean {
    if (previous === next) {
      return true;
    }

    let nextKeyCount = 0;

    for (const key in next) {
      nextKeyCount += 1;

      if (previous[key] !== next[key]) {
        return false;
      }
    }

    let previousKeyCount = 0;

    for (const _key in previous) {
      previousKeyCount += 1;
    }

    return previousKeyCount === nextKeyCount;
  }

  // An animation whose segments have all elapsed produces the same result
  // forever, but the registry clears and the scene re-declares segments
  // every frame, so they are new objects each time and identity tells us
  // nothing. Comparing them structurally is far cheaper than rebuilding the
  // timeline, cloning the props twice and re-evaluating every segment --
  // which is what a finished animation was otherwise paying, every frame,
  // indefinitely.
  #segmentsMatchCached(cachedSegments: Segment<TProps>[]): boolean {
    if (cachedSegments.length !== this.#segments.length) {
      return false;
    }

    for (let index = 0; index < cachedSegments.length; index++) {
      const cached = cachedSegments[index];
      const current = this.#segments[index];

      if (
        !Animatable.#shallowRecordEquals(
          cached.targetProps as Record<string, unknown>,
          current.targetProps as Record<string, unknown>,
        ) ||
        !Animatable.#shallowRecordEquals(
          cached.options as unknown as Record<string, unknown>,
          current.options as unknown as Record<string, unknown>,
        )
      ) {
        return false;
      }
    }

    return true;
  }

  // Records what the snapshot WOULD be computed from, rather than computing
  // it. Both #segments and #initialProps are reassigned (never mutated in
  // place) by clearSegments/updateInitialProps immediately after this call,
  // so holding references to the outgoing ones is enough to reconstruct the
  // value later if anything asks for it.
  captureCurrentProps(timeInMs: number): void {
    this.#currentFrameTimeInMs = timeInMs;

    if (this.#segments.length === 0) {
      // Nothing was in flight, so there is no live value to inherit and the
      // snapshot could only ever be a copy of the initial props -- which
      // every consumer already falls back to.
      this.#propsSnapshot = null;
      this.#pendingSnapshotSource = null;
      return;
    }

    this.#pendingSnapshotSource = {
      segments: this.#segments,
      initialProps: this.#initialProps,
      previousSnapshot: this.#propsSnapshot,
      timeInMs,
    };
    this.#propsSnapshot = null;
  }

  // Computes a deferred snapshot on first read, against the state captured
  // at capture time rather than current state. Clearing the pending source
  // before evaluating means a re-entrant read (getCurrentProps consults the
  // snapshot while resolving segments) sees the previous frame's snapshot,
  // exactly as it did when this was computed eagerly.
  #resolvePropsSnapshot(): Partial<TProps> | null {
    const source = this.#pendingSnapshotSource;

    if (!source) {
      return this.#propsSnapshot;
    }

    this.#pendingSnapshotSource = null;

    const currentSegments = this.#segments;
    const currentInitialProps = this.#initialProps;
    const currentFrameTimeInMs = this.#currentFrameTimeInMs;

    this.#segments = source.segments;
    this.#initialProps = source.initialProps;
    this.#propsSnapshot = source.previousSnapshot;

    try {
      this.#propsSnapshot = this.getCurrentProps(source.timeInMs);
    } finally {
      this.#segments = currentSegments;
      this.#initialProps = currentInitialProps;
      this.#currentFrameTimeInMs = currentFrameTimeInMs;
    }

    return this.#propsSnapshot;
  }

  clearSegments(): void {
    this.#segments = [];
  }

  // Whether this animatable is currently mid-animation, as opposed to having
  // no segments at all or having segments that have all elapsed. Reads the
  // settled cache rather than rebuilding the timeline, so it is cheap --
  // #cacheIfSettled has already nulled that cache if anything is still in
  // flight (or unscheduled) by the time flush has run for this frame. Used
  // only by AnimatableRegistry's unkeyed-reorder diagnostic, which needs to
  // know whether a positional collision could actually have corrupted
  // anything visible.
  hasActiveAnimation(): boolean {
    return this.#segments.length > 0 && this.#settledCache === null;
  }

  clearSnapshot(): void {
    this.#propsSnapshot = null;
    this.#pendingSnapshotSource = null;
    this.#settledCache = null;
  }

  hasSegmentTargeting(key: keyof TProps): boolean {
    return this.#segments.some((segment) => key in segment.targetProps);
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
    this.#currentFrameTimeInMs = timeInMs;

    // With no segments there is nothing to interpolate, so the answer is
    // just the initial props. Worth special-casing because the general path
    // below builds a timeline array and clones the props TWICE (once here,
    // once at the end of #evaluatePropsAtTime) to arrive at the same value
    // -- and in a typical scene the overwhelming majority of primitives are
    // never animated at all.
    if (this.#segments.length === 0) {
      // Nothing animating and the same props object as last time means the
      // answer is identical to the one already handed out, so hand out the
      // same object rather than cloning it again.
      //
      // INVARIANT: consumers must treat returned props as read-only. They
      // already did -- primitives only read them -- but this makes the
      // object shared across frames rather than freshly cloned per frame,
      // so a mutation would now persist.
      const cached = this.#staticPropsCache;

      if (cached && cached.initialProps === this.#initialProps) {
        return cached.result;
      }

      const result = this.#cloneValue(this.#initialProps);

      this.#staticPropsCache = {
        initialProps: this.#initialProps,
        result,
      };

      return result;
    }

    this.#staticPropsCache = null;

    const relativeTime = timeInMs - this.#firstInvokedTime;

    const settled = this.#settledCache;

    if (
      settled &&
      settled.initialProps === this.#initialProps &&
      relativeTime >= settled.settledAtRelativeTime &&
      this.#segmentsMatchCached(settled.segments)
    ) {
      // Same inputs, and time is past the point where every segment has
      // finished -- the answer cannot change. Same read-only invariant as
      // the no-segments cache above.
      return settled.result;
    }

    // Build timeline: calculate effective start times for all segments
    const timeline = this.#buildTimeline();

    // Start with initial props. Snapshot is only used when a newly-introduced
    // segment needs to inherit a live in-flight value.
    const baseProps = this.#cloneValue(this.#initialProps);

    // For each property, find the value at the current time
    const result = this.#evaluatePropsAtTime(timeline, baseProps, relativeTime);

    this.#cacheIfSettled(timeline, relativeTime, result);

    return result;
  }

  #cacheIfSettled(
    timeline: AnimatableTimelineEntry<TProps>[],
    relativeTime: number,
    result: TProps,
  ): void {
    let settledAtRelativeTime = 0;

    for (let index = 0; index < timeline.length; index++) {
      const entry = timeline[index];

      // A segment with no start time is unscheduled and may begin at any
      // point, so nothing can be declared settled.
      if (entry.startTime === null) {
        this.#settledCache = null;
        return;
      }

      settledAtRelativeTime = Math.max(
        settledAtRelativeTime,
        entry.startTime + entry.duration,
      );
    }

    if (timeline.length === 0 || relativeTime < settledAtRelativeTime) {
      this.#settledCache = null;
      return;
    }

    this.#settledCache = {
      initialProps: this.#initialProps,
      segments: this.#segments,
      settledAtRelativeTime,
      result,
    };
  }

  #buildTimeline(): AnimatableTimelineEntry<TProps>[] {
    const timeline: AnimatableTimelineEntry<TProps>[] = [];

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

  // NOTE: takes OWNERSHIP of baseProps and mutates it in place. Its only
  // caller is getCurrentProps, which passes a clone it just made -- cloning
  // it a second time here meant every animating primitive deep-copied its
  // props twice per frame to produce one result.
  #evaluatePropsAtTime(
    timeline: AnimatableTimelineEntry<TProps>[],
    baseProps: TProps,
    time: number,
  ): TProps {
    const result = baseProps;

    // Sort by start time for proper evaluation order
    const sortedEntries = timeline
      .filter((e) => e.startTime !== null)
      .sort((a, b) => a.startTime! - b.startTime!);

    const segmentTargetsCache = new Map<
      Segment<TProps>,
      AnimatableNumericLeafTarget[]
    >();

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

  // Runs several times per primitive per frame, so allocation matters more
  // than elegance here: Object.entries() would allocate one array for the
  // whole object plus a two-element array per key, every call. Keys are
  // walked directly instead. Primitives are non-objects and return
  // immediately, which is the overwhelmingly common case for leaf values.
  #cloneValue<T>(value: T): T {
    if (value === null || typeof value !== "object") {
      return value;
    }

    if (Array.isArray(value)) {
      const clonedArray = new Array(value.length);

      for (let index = 0; index < value.length; index++) {
        clonedArray[index] = this.#cloneValue(value[index]);
      }

      return clonedArray as T;
    }

    const source = value as Record<string, unknown>;
    const cloned: Record<string, unknown> = {};
    const keys = Object.keys(source);

    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      cloned[key] = this.#cloneValue(source[key]);
    }

    return cloned as T;
  }

  #collectNumericLeafTargets(
    value: unknown,
    currentPath = "",
    targets: AnimatableNumericLeafTarget[] = [],
  ): AnimatableNumericLeafTarget[] {
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
    cache: Map<Segment<TProps>, AnimatableNumericLeafTarget[]>,
  ): AnimatableNumericLeafTarget[] {
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
    cache: Map<Segment<TProps>, AnimatableNumericLeafTarget[]>,
  ): boolean {
    return this.#getSegmentTargets(segment, cache).some(
      (target) => target.path === path,
    );
  }

  #getTargetValue(
    segment: Segment<TProps>,
    path: string,
    cache: Map<Segment<TProps>, AnimatableNumericLeafTarget[]>,
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
    sortedEntries: AnimatableTimelineEntry<TProps>[],
    excludeEntry: AnimatableTimelineEntry<TProps>,
    path: string,
    atTime: number,
    baseProps: TProps,
    segmentTargetsCache: Map<Segment<TProps>, AnimatableNumericLeafTarget[]>,
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
      value =
        this.#getNumericValueAtPath(this.#resolvePropsSnapshot(), path) ??
        value;
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
    sortedEntries: AnimatableTimelineEntry<TProps>[],
    entry: AnimatableTimelineEntry<TProps>,
    path: string,
    startTime: number,
    baseProps: TProps,
    segmentTargetsCache: Map<Segment<TProps>, AnimatableNumericLeafTarget[]>,
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
    sortedEntries: AnimatableTimelineEntry<TProps>[],
    excludeEntry: AnimatableTimelineEntry<TProps>,
    path: string,
    segmentTargetsCache: Map<Segment<TProps>, AnimatableNumericLeafTarget[]>,
  ): boolean {
    const snapshot = this.#resolvePropsSnapshot();

    if (
      snapshot === null ||
      this.#getNumericValueAtPath(snapshot, path) === undefined
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
    entry: AnimatableTimelineEntry<TProps>,
    path: string,
    targetValue: number,
  ): string {
    const startTime = entry.startTime ?? "null";

    return `${path}|${startTime}|${entry.duration}|${targetValue}`;
  }

  #pruneSegmentStartValues(
    sortedEntries: AnimatableTimelineEntry<TProps>[],
    segmentTargetsCache: Map<Segment<TProps>, AnimatableNumericLeafTarget[]>,
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
    this.#pendingSnapshotSource = null;
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
