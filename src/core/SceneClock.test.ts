import { describe, expect, it } from "vitest";

import SceneClock from "./SceneClock";

const createClock = () => {
  let wallTimeInMs = 10_000;

  const clock = new SceneClock(() => wallTimeInMs);
  const advanceWallClock = (deltaInMs: number) => {
    wallTimeInMs += deltaInMs;
  };

  return { clock, advanceWallClock };
};

describe("SceneClock", () => {
  describe("tick", () => {
    it("starts at 0 on the first frame, whatever the wall time", () => {
      const { clock } = createClock();

      expect(clock.tick()).toBe(0);
    });

    it("advances by the wall time elapsed between frames", () => {
      const { clock, advanceWallClock } = createClock();

      clock.tick();
      advanceWallClock(16);
      expect(clock.tick()).toBe(16);

      advanceWallClock(17);
      expect(clock.tick()).toBe(33);
    });

    it("clamps a long gap between frames to 250ms", () => {
      const { clock, advanceWallClock } = createClock();

      clock.tick();
      advanceWallClock(16);
      clock.tick();

      // A hidden tab: no frames for ten seconds.
      advanceWallClock(10_000);
      expect(clock.tick()).toBe(266);
    });

    it("never runs backwards", () => {
      const { clock, advanceWallClock } = createClock();

      clock.tick();
      advanceWallClock(100);
      clock.tick();

      advanceWallClock(-50);
      expect(clock.tick()).toBe(100);
    });
  });

  describe("now", () => {
    it("reads scene time between frames without advancing the clock", () => {
      const { clock, advanceWallClock } = createClock();

      clock.tick();
      advanceWallClock(100);
      clock.tick();

      advanceWallClock(7);
      expect(clock.now()).toBe(107);
      expect(clock.now()).toBe(107);

      advanceWallClock(9);
      expect(clock.tick()).toBe(116);
    });

    it("applies the same clamp as tick, so it never runs ahead of the next frame", () => {
      const { clock, advanceWallClock } = createClock();

      clock.tick();
      advanceWallClock(10_000);

      const eventTime = clock.now();
      const nextFrameTime = clock.tick();

      expect(eventTime).toBe(250);
      expect(nextFrameTime).toBeGreaterThanOrEqual(eventTime);
    });

    it("is 0 before the first frame", () => {
      const { clock, advanceWallClock } = createClock();

      advanceWallClock(500);

      expect(clock.now()).toBe(0);
    });
  });

  describe("reset", () => {
    it("restarts scene time at 0 from the next frame", () => {
      const { clock, advanceWallClock } = createClock();

      clock.tick();
      advanceWallClock(200);
      clock.tick();

      clock.reset();
      advanceWallClock(200);

      expect(clock.tick()).toBe(0);
    });
  });
});
