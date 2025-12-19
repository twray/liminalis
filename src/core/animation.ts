import type { AnimationOptions, BaseAnimationOptions } from "../types";
import { eventTimeToMs } from "../util";

// Type for accumulating animation properties in timeline mode
type PartialAnimationOptions = Partial<BaseAnimationOptions> & {
  duration?: number | string | null;
  endTime?: number | string | null;
};

type SegmentTiming = {
  startTimeMs: number;
  delayMs: number;
  durationMs: number;
  adjustedStartTime: number;
  endTime: number;
};

/**
 * Calculate timing information for an animation segment
 */
function getSegmentTiming(
  segment: PartialAnimationOptions & { startTime: number }
): SegmentTiming {
  const startTimeMs = eventTimeToMs(segment.startTime);
  const delayMs = segment.delay ? eventTimeToMs(segment.delay) : 0;

  let durationMs = 1;
  if (segment.endTime) {
    durationMs = eventTimeToMs(segment.endTime) - startTimeMs;
  } else if (segment.duration) {
    durationMs = eventTimeToMs(segment.duration);
  }

  const adjustedStartTime = startTimeMs + delayMs;
  const endTime = adjustedStartTime + durationMs;

  return { startTimeMs, delayMs, durationMs, adjustedStartTime, endTime };
}

/**
 * Apply easing and reverse transformations to progress value
 */
function applyProgressTransforms(
  progress: number,
  easing: ((t: number) => number) | null | undefined,
  reverse: boolean | undefined
): number {
  let transformedProgress = progress;

  if (typeof easing === "function") {
    transformedProgress = easing(transformedProgress);
  }

  if (reverse) {
    transformedProgress = 1 - transformedProgress;
  }

  return transformedProgress;
}

/**
 * Interpolate between two values based on progress
 */
function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

export function getAnimatedValueForCurrentTime(
  currentTime: number,
  options: AnimationOptions | AnimationOptions[]
): number {
  // Single animation mode
  if (!Array.isArray(options)) {
    return getSingleAnimationValue(currentTime, options);
  }

  // Timeline mode - array of animations
  return getTimelineAnimationValue(currentTime, options);
}

function getSingleAnimationValue(
  currentTime: number,
  options: AnimationOptions
): number {
  const { from, to, startTime = 0, easing = null, reverse = false } = options;

  if (startTime === null) return from;

  const timing = getSegmentTiming({
    ...options,
    startTime: startTime as number,
  });
  const elapsedTime = currentTime - timing.adjustedStartTime;

  const progress =
    elapsedTime > 0
      ? Math.min(1, Math.max(0, elapsedTime / timing.durationMs))
      : 0;

  const transformedProgress = applyProgressTransforms(
    progress,
    easing,
    reverse
  );

  return interpolate(from, to, transformedProgress);
}

function getTimelineAnimationValue(
  currentTime: number,
  optionsArray: AnimationOptions[]
): number {
  // Build complete segments by merging properties cumulatively
  const completeSegments: PartialAnimationOptions[] = [];
  let accumulated: PartialAnimationOptions = {};

  for (const segment of optionsArray) {
    // Merge with accumulated properties
    accumulated = { ...accumulated, ...segment };
    completeSegments.push({ ...accumulated });
  }

  // Filter out segments with null startTime and sort by startTime
  const activeSegments = completeSegments
    .filter(
      (segment): segment is PartialAnimationOptions & { startTime: number } =>
        segment.startTime !== null && segment.startTime !== undefined
    )
    .sort((a, b) => {
      const aTime = eventTimeToMs(a.startTime);
      const bTime = eventTimeToMs(b.startTime);
      return aTime - bTime;
    });

  // If no active segments, return the first segment's 'from' value or 0
  if (activeSegments.length === 0) {
    if (completeSegments.length > 0 && completeSegments[0].from !== undefined) {
      return completeSegments[0].from;
    }
    return 0;
  }

  // Helper to calculate value at a specific time for a segment
  const getSegmentValueAtTime = (
    segment: PartialAnimationOptions & { startTime: number },
    time: number
  ): number => {
    const from = segment.from ?? 0;
    const to = segment.to ?? 0;
    const timing = getSegmentTiming(segment);
    const elapsedTime = time - timing.adjustedStartTime;

    if (elapsedTime <= 0) {
      return from;
    }

    if (elapsedTime >= timing.durationMs) {
      return segment.reverse ? from : to;
    }

    const progress = Math.min(1, Math.max(0, elapsedTime / timing.durationMs));
    const transformedProgress = applyProgressTransforms(
      progress,
      segment.easing,
      segment.reverse
    );

    return interpolate(from, to, transformedProgress);
  };

  // Find the active segment (latest segment that has started)
  for (let i = activeSegments.length - 1; i >= 0; i--) {
    const segment = activeSegments[i];
    const timing = getSegmentTiming(segment);

    // If this segment has started
    if (currentTime >= timing.adjustedStartTime) {
      const elapsedTime = currentTime - timing.adjustedStartTime;

      // Determine effective 'from' value
      let effectiveFrom = segment.from ?? 0;

      // Check if this segment overlaps with any previous segment
      for (let j = i - 1; j >= 0; j--) {
        const prevSegment = activeSegments[j];
        const prevTiming = getSegmentTiming(prevSegment);

        // If this segment starts before the previous segment ends
        if (
          timing.adjustedStartTime >= prevTiming.adjustedStartTime &&
          timing.adjustedStartTime < prevTiming.endTime
        ) {
          // Use the interpolated value from the previous segment
          effectiveFrom = getSegmentValueAtTime(
            prevSegment,
            timing.adjustedStartTime
          );
          break;
        }
      }

      // If animation is still running
      if (elapsedTime <= timing.durationMs) {
        const to = segment.to ?? 0;
        const progress = Math.min(
          1,
          Math.max(0, elapsedTime / timing.durationMs)
        );
        const transformedProgress = applyProgressTransforms(
          progress,
          segment.easing,
          segment.reverse
        );

        return interpolate(effectiveFrom, to, transformedProgress);
      } else {
        // Animation finished, return final value
        const to = segment.to ?? 0;
        return segment.reverse ? segment.from ?? 0 : to;
      }
    }
  }

  // Before any animation starts, return first segment's 'from' value
  return activeSegments[0].from ?? 0;
}
