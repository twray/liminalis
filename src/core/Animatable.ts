import {
  AnimationSegment,
  AnimationSegmentOptions,
  PartialNumericProps,
} from "../types/animatable";
import { eventTimeToMs } from "../util";

const DEFAULT_EASING = (n: number): number => n;

class Animatable<TProps extends Record<string, any>> {
  #initialProps: TProps;
  #firstInvokedTime: number;
  #segments: AnimationSegment<TProps>[] = [];
  #appliedOptions: Partial<AnimationSegmentOptions> = {};

  // Captured start props for each segment, keyed by a
  // hash of the segment definition
  #segmentStartPropsCache: Map<string, Record<string, any>> = new Map();

  constructor(props: TProps, firstInvokedTime: number) {
    this.#initialProps = { ...props };
    this.#firstInvokedTime = firstInvokedTime;
  }

  updateInitialProps(props: TProps): void {
    this.#initialProps = { ...props };
  }

  clearSegments(): void {
    this.#segments = [];
  }

  animateTo(
    targetProps: PartialNumericProps<TProps>,
    options: AnimationSegmentOptions = {}
  ): this {
    const appliedOptions = this.#appliedOptions;

    // Note: startProps will be captured at render time when the segment starts,
    // not at definition time. This ensures animations chain correctly.
    this.#segments.push({
      targetProps,
      options: { ...appliedOptions, ...options },
      startProps: null, // Will be captured when segment becomes active
      effectiveStartTime: null, // Will be calculated during rendering
    });

    return this;
  }

  withOptions(options: Partial<AnimationSegmentOptions>) {
    this.#appliedOptions = { ...this.#appliedOptions, ...options };

    return this;
  }

  getCurrentProps(timeInMs: number): TProps {
    // Calculate relative time (time since this shape was first rendered)
    const relativeTime = timeInMs - this.#firstInvokedTime;

    // Calculate effective start times
    this.#calculateEffectiveStartTimes();

    // Calculate start props for each segment, using persisted state when available
    this.#calculateStartProps(relativeTime);

    const sortedSegments = this.#getSortedSegments();

    // Find active segments and apply animations
    const activeSegments = this.#getActiveSegments(
      sortedSegments,
      relativeTime
    );

    if (activeSegments.length === 0) {
      // No active segments - return value based on completed segments
      return this.#getPropsAtTime(sortedSegments, relativeTime);
    }

    // Start with props at current time (accounting for completed segments)
    let animatedProps = this.#getPropsAtTime(sortedSegments, relativeTime);

    // Apply each active segment's interpolation
    for (const segment of activeSegments) {
      const interpolatedProps = this.#interpolateSegment(segment, relativeTime);
      animatedProps = { ...animatedProps, ...interpolatedProps };
    }

    return animatedProps;
  }

  #applyProgressModifiers(
    rawProgress: number,
    options: AnimationSegmentOptions
  ): number {
    const easing = options.easing ?? DEFAULT_EASING;
    let progress = easing(rawProgress);

    if (options.reverse) {
      progress = 1 - progress;
    }

    return progress;
  }

  #getSegmentHash(segment: AnimationSegment<TProps>, index: number): string {
    const { targetProps, options } = segment;
    const propsKey = Object.entries(targetProps)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(",");
    // Use index + duration + target props to identify segment, not `at` value
    const optionsKey = `idx:${index},dur:${
      options.duration ?? options.endTime ?? 0
    }`;
    return `${propsKey}|${optionsKey}`;
  }

  #calculateStartProps(relativeTime: number): void {
    const sortedSegments = this.#getSortedSegments();

    for (let i = 0; i < this.#segments.length; i++) {
      const segment = this.#segments[i];
      const { effectiveStartTime } = segment;

      if (effectiveStartTime === null) continue;

      // Generate a hash for this segment to look up cached start props
      const segmentHash = this.#getSegmentHash(segment, i);

      // Check if this segment has already activated (cached from previous frame)
      const cachedStartProps = this.#segmentStartPropsCache.get(segmentHash);

      if (cachedStartProps) {
        // Use the cached start props from when this segment first activated
        segment.startProps = cachedStartProps as Partial<TProps>;
      } else if (relativeTime >= effectiveStartTime) {
        // Segment is activating NOW - calculate start props based on what
        // previous segments would have produced at this segment's start time
        const startProps = this.#getInterpolatedPropsAtTime(
          sortedSegments,
          segment,
          effectiveStartTime
        );
        segment.startProps = startProps;

        // Cache for future frames
        this.#segmentStartPropsCache.set(segmentHash, { ...startProps });
      } else {
        // Segment hasn't activated yet - calculate what props should be
        // This is used for segments that will activate in the future
        segment.startProps = this.#getInterpolatedPropsAtTime(
          sortedSegments,
          segment,
          effectiveStartTime
        );
      }
    }
  }

  #getInterpolatedPropsAtTime(
    sortedSegments: AnimationSegment<TProps>[],
    excludeSegment: AnimationSegment<TProps>,
    timeInMs: number
  ): Partial<TProps> {
    let props = { ...this.#initialProps } as Partial<TProps>;

    for (const segment of sortedSegments) {
      // Don't include the segment we're calculating start props for
      if (segment === excludeSegment) continue;

      const { effectiveStartTime, targetProps, options } = segment;
      if (effectiveStartTime === null) continue;

      // Skip segments that haven't started yet at this time
      if (timeInMs < effectiveStartTime) continue;

      const duration = this.#getSegmentDuration(segment);
      const endTime = effectiveStartTime + duration;

      if (timeInMs >= endTime) {
        // Segment has completed - apply target values
        props = { ...props, ...targetProps };
      } else {
        // Segment is in progress - interpolate
        // We need the start props for this segment to interpolate correctly
        // Use recursive approach: get what props were at this segment's start
        const segmentStartProps = this.#getBasePropsForSegment(
          sortedSegments,
          segment
        );

        const elapsed = timeInMs - effectiveStartTime;
        // Handle zero duration by jumping to complete (progress = 1)
        const rawProgress =
          duration === 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
        const progress = this.#applyProgressModifiers(rawProgress, options);

        // Interpolate each property
        for (const key in targetProps) {
          const targetValue = targetProps[
            key as keyof typeof targetProps
          ] as number;
          const startValue = (
            segmentStartProps[key] !== undefined ? segmentStartProps[key] : 0
          ) as number;

          (props as any)[key] =
            startValue + (targetValue - startValue) * progress;
        }
      }
    }

    return props;
  }

  #getBasePropsForSegment(
    sortedSegments: AnimationSegment<TProps>[],
    targetSegment: AnimationSegment<TProps>
  ): Partial<TProps> {
    let props = { ...this.#initialProps } as Partial<TProps>;
    const targetStartTime = targetSegment.effectiveStartTime;

    if (targetStartTime === null) return props;

    for (const segment of sortedSegments) {
      if (segment === targetSegment) break; // Stop before the target segment

      const { effectiveStartTime, targetProps } = segment;
      if (effectiveStartTime === null) continue;

      const duration = this.#getSegmentDuration(segment);
      const endTime = effectiveStartTime + duration;

      // Only apply segments that have completed before this segment starts
      if (endTime <= targetStartTime) {
        props = { ...props, ...targetProps };
      }
    }

    return props;
  }

  #getPropsAtTime(
    sortedSegments: AnimationSegment<TProps>[],
    timeInMs: number
  ): TProps {
    let props = { ...this.#initialProps };

    // For each property, find the "owning" segment (the latest segment that has started)
    const propertyOwnerIndex = new Map<string, number>();

    // Iterate from end to find the owning segment for each property
    for (let i = sortedSegments.length - 1; i >= 0; i--) {
      const segment = sortedSegments[i];
      const { effectiveStartTime } = segment;
      if (effectiveStartTime === null) continue;

      // If this segment has started, it owns its properties (unless already owned by later)
      if (timeInMs >= effectiveStartTime) {
        const segmentProps = Object.keys(segment.targetProps);
        segmentProps.forEach((prop) => {
          if (!propertyOwnerIndex.has(prop)) {
            propertyOwnerIndex.set(prop, i);
          }
        });
      }
    }

    // Apply completed segment values
    // For properties where the owner is still running, apply the previous completed segment's value
    // For properties where the owner has completed, apply the owner's target value
    for (let i = 0; i < sortedSegments.length; i++) {
      const segment = sortedSegments[i];
      const { effectiveStartTime, targetProps } = segment;
      if (effectiveStartTime === null) continue;

      const duration = this.#getSegmentDuration(segment);
      const endTime = effectiveStartTime + duration;

      // Only consider completed segments
      if (timeInMs >= endTime) {
        for (const key of Object.keys(targetProps)) {
          const ownerIndex = propertyOwnerIndex.get(key);

          // Apply this segment's value if:
          // 1. This segment is the owner, OR
          // 2. The owner is a later segment that hasn't completed yet
          //    (we need this as the base value for interpolation)
          if (ownerIndex !== undefined) {
            const ownerSegment = sortedSegments[ownerIndex];
            const ownerEndTime =
              ownerSegment.effectiveStartTime! +
              this.#getSegmentDuration(ownerSegment);

            // Apply if this is the owner OR if owner is still running and this
            // is an earlier completed segment
            if (
              ownerIndex === i ||
              (timeInMs < ownerEndTime && i < ownerIndex)
            ) {
              (props as any)[key] = (targetProps as any)[key];
            }
          }
        }
      }
    }

    return props;
  }

  #calculateEffectiveStartTimes(): void {
    let lastExplicitEndTime = 0;

    for (let i = 0; i < this.#segments.length; i++) {
      const segment = this.#segments[i];
      const { at, duration, endTime, delay = 0 } = segment.options;

      if (at !== undefined) {
        // Explicit start time
        if (at === null) {
          segment.effectiveStartTime = null;
        } else {
          const atInMs = eventTimeToMs(at);

          segment.effectiveStartTime = atInMs + delay;

          // Calculate when this segment ends
          const segmentDuration = duration ?? (endTime ? endTime - atInMs : 0);
          lastExplicitEndTime = segment.effectiveStartTime + segmentDuration;
        }
      } else {
        // Sequential: start after previous segment
        if (i === 0) {
          // First segment with no 'at' starts at 0
          segment.effectiveStartTime = delay;
          const segmentDuration = duration ?? (endTime ? endTime - 0 : 0);
          lastExplicitEndTime = segment.effectiveStartTime + segmentDuration;
        } else {
          // Start after previous segment completes
          const prevSegment = this.#segments[i - 1];

          if (prevSegment.effectiveStartTime === null) {
            // Previous segment hasn't started, so this one can't either
            segment.effectiveStartTime = null;
          } else {
            segment.effectiveStartTime = lastExplicitEndTime + delay;

            const segmentDuration =
              duration ?? (endTime ? endTime - segment.effectiveStartTime : 0);
            lastExplicitEndTime = segment.effectiveStartTime + segmentDuration;
          }
        }
      }
    }
  }

  #getSortedSegments(): AnimationSegment<TProps>[] {
    return [...this.#segments]
      .filter((s) => s.effectiveStartTime !== null)
      .sort((a, b) => a.effectiveStartTime! - b.effectiveStartTime!);
  }

  #getActiveSegments(
    sortedSegments: AnimationSegment<TProps>[],
    timeInMs: number
  ): AnimationSegment<TProps>[] {
    const active: AnimationSegment<TProps>[] = [];

    // Track which properties have been claimed by segments that have started
    // (not just currently animating, but have started at any point)
    const propertiesClaimedByLaterSegments = new Set<string>();

    // Iterate from end (most recent segments have priority)
    // This determines which properties are "owned" by later segments
    for (let i = sortedSegments.length - 1; i >= 0; i--) {
      const segment = sortedSegments[i];
      const { effectiveStartTime } = segment;

      if (effectiveStartTime === null) continue;

      // Skip segments that haven't started yet
      if (timeInMs < effectiveStartTime) continue;

      const duration = this.#getSegmentDuration(segment);
      const endTime = effectiveStartTime + duration;
      const segmentProps = Object.keys(segment.targetProps);

      // Check which properties this segment can still animate
      // (not claimed by a later segment that has started)
      const availableProps = segmentProps.filter(
        (prop) => !propertiesClaimedByLaterSegments.has(prop)
      );

      if (availableProps.length > 0) {
        // This segment owns these properties - mark them as claimed
        availableProps.forEach((prop) =>
          propertiesClaimedByLaterSegments.add(prop)
        );

        // Only add to active if segment is still animating
        if (timeInMs <= endTime) {
          active.unshift(segment);
        }
      }
    }

    return active;
  }

  #interpolateSegment(
    segment: AnimationSegment<TProps>,
    timeInMs: number
  ): Partial<TProps> {
    const { targetProps, options, startProps, effectiveStartTime } = segment;

    if (effectiveStartTime === null || startProps === null) {
      return {};
    }

    const duration = this.#getSegmentDuration(segment);
    const elapsed = timeInMs - effectiveStartTime;

    // Calculate progress (0 to 1)
    // Handle zero duration by jumping to complete (progress = 1)
    const rawProgress =
      duration === 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
    const progress = this.#applyProgressModifiers(rawProgress, options);

    // Interpolate each property
    const result = {} as Partial<TProps>;

    for (const key in targetProps) {
      const targetValue = targetProps[
        key as keyof typeof targetProps
      ] as number;

      // Determine start value: use value from startProps, or default to 0
      const actualStartValue = (
        startProps[key] !== undefined ? startProps[key] : 0
      ) as number;

      // Linear interpolation with type assertion
      (result as any)[key] =
        actualStartValue + (targetValue - actualStartValue) * progress;
    }

    return result;
  }

  #getSegmentDuration(segment: AnimationSegment<TProps>): number {
    const { duration, endTime } = segment.options;
    const { effectiveStartTime } = segment;

    if (duration !== undefined) {
      return duration;
    }

    if (endTime !== undefined && effectiveStartTime !== null) {
      return endTime - effectiveStartTime;
    }

    return 0;
  }

  reset(): void {
    this.#segments = [];
  }
}

export default Animatable;
