import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AnimatableRegistry from "../render/AnimatableRegistry";
import ReactiveLayerEnvelope from "./ReactiveLayerEnvelope";

// Integration tests: ReactiveLayerEnvelope's timeOf/current driving a real
// Animatable through AnimatableRegistry's per-frame capture-and-rebuild
// cycle -- the same path a reactive layer's render function takes. The
// envelope's unit tests prove *which* times it exposes; these prove what
// those times actually do to an animated value on screen.

const FRAME_STEP_IN_MS = 4;

const ATTACKED = { h: 100 };
const RELEASED = { h: 0 };

type EnvelopeEvent = [timeInMs: number, act: (e: ReactiveLayerEnvelope) => void];

// Renders a single bar the way a typical reactive layer does: rise on
// attack, fall on decay, fall on release. Returns the animated height at
// every frame.
const simulate = (events: EnvelopeEvent[], untilInMs: number) => {
  const envelope = new ReactiveLayerEnvelope(true, Date.now);
  const registry = new AnimatableRegistry();
  const heights = new Map<number, number>();

  for (let t = 0; t <= untilInMs; t += FRAME_STEP_IN_MS) {
    vi.setSystemTime(t);
    events
      .filter(([eventTime]) => eventTime === t)
      .forEach(([, act]) => act(envelope));
    vi.advanceTimersByTime(0);

    const { timeOf, current } = envelope;

    registry.beginFrame(t);
    const bar = registry
      .getOrCreate({ ...RELEASED }, t)
      .withOptions({ duration: current.attackPeriod })
      .animateTo(ATTACKED, { at: timeOf.attack })
      .animateTo(RELEASED, { at: timeOf.decay, duration: current.decayPeriod })
      .animateTo(RELEASED, {
        at: timeOf.release,
        duration: current.releasePeriod,
      });
    heights.set(t, bar.getCurrentProps(t).h);
    registry.endFrame();
  }

  return (t: number) => {
    const height = heights.get(t);
    if (height === undefined) throw new Error(`No frame rendered at ${t}ms`);
    return height;
  };
};

const attack =
  (preserveStateIfNotReleased?: boolean) => (e: ReactiveLayerEnvelope) =>
    e.attack(1, 500, preserveStateIfNotReleased).decay(10000);

const release = (e: ReactiveLayerEnvelope) => e.release(1000);

describe("ReactiveLayerEnvelope driving an animation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("attack then decay", () => {
    it("reaches the attacked state before decay begins, then decays", () => {
      const heightAt = simulate([[0, attack()]], 2000);

      expect(heightAt(500)).toBe(100);
      expect(heightAt(1000)).toBeLessThan(100);
      expect(heightAt(2000)).toBeLessThan(heightAt(1000));
    });
  });

  describe("release before the attack finishes", () => {
    it("plays only the release: the bar is fully down one release period later, not left decaying", () => {
      const heightAt = simulate([[0, attack()], [200, release]], 1300);

      expect(heightAt(1200)).toBe(0);
    });
  });

  describe("re-attack while decaying, after an earlier attack/release cycle", () => {
    // The layer was attacked and released once (t=0..1600), attacked again
    // at t=2000, and is re-attacked mid-decay at t=5000 with no release in
    // between -- e.g. a note repeated while the damper pedal is held.
    const events = (preserveStateIfNotReleased?: boolean): EnvelopeEvent[] => [
      [0, attack()],
      [600, release],
      [2000, attack()],
      [5000, attack(preserveStateIfNotReleased)],
    ];

    it("by default, restarts the attack from the released state", () => {
      const heightAt = simulate(events(), 5500);

      expect(heightAt(4996)).toBeGreaterThan(50);
      expect(heightAt(5004)).toBeLessThan(10);
      expect(heightAt(5500)).toBe(100);
    });

    it("with preserveStateIfNotReleased, continues the attack from the live, decayed height", () => {
      const heightAt = simulate(events(true), 5500);

      const before = heightAt(4996);
      const after = heightAt(5004);

      expect(before).toBeGreaterThan(50);
      expect(after).toBeGreaterThanOrEqual(before);
      expect(after - before).toBeLessThan(5);
      expect(heightAt(5500)).toBe(100);
    });
  });

  describe("re-attack partway through a release", () => {
    it("with preserveStateIfNotReleased, continues the attack from the live, releasing height", () => {
      const heightAt = simulate(
        [
          [0, attack()],
          [2000, release],
          [2500, attack(true)],
        ],
        3000,
      );

      const before = heightAt(2496);
      const after = heightAt(2504);

      expect(before).toBeGreaterThan(0);
      expect(before).toBeLessThan(100);
      expect(Math.abs(after - before)).toBeLessThan(5);
      expect(heightAt(3000)).toBe(100);
    });
  });
});

describe("ReactiveLayerEnvelope driving a primitive first declared after the envelope", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays the attack from the moment of attack, not that long after the primitive appears", () => {
    const envelope = new ReactiveLayerEnvelope(true, Date.now);
    const registry = new AnimatableRegistry();
    const heights = new Map<number, number>();

    for (let t = 0; t <= 6000; t += 100) {
      vi.setSystemTime(t);

      if (t === 5000) {
        envelope.attack(1, 500);
      }

      registry.beginFrame(t);

      // Declared only while the layer is active, so first declared on the
      // frame of the attack -- five seconds after the envelope was created.
      if (envelope.current.status !== "idle") {
        const bar = registry
          .getOrCreate({ ...RELEASED }, t, { key: "bar" })
          .animateTo(ATTACKED, {
            at: envelope.timeOf.attack,
            duration: envelope.current.attackPeriod,
          });

        heights.set(t, bar.getCurrentProps(t).h);
      }

      registry.endFrame();
    }

    expect(heights.get(5000)).toBe(0);
    expect(heights.get(5300)).toBeCloseTo(60);
    expect(heights.get(5500)).toBe(100);
  });
});
