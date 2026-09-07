import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReactiveLayerEnvelope from "./ReactiveLayerEnvelope";

describe("ReactiveLayerEnvelope", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("construction", () => {
    it("stores isPermanent as given", () => {
      expect(new ReactiveLayerEnvelope(true).isPermanent).toBe(true);
      expect(new ReactiveLayerEnvelope(false).isPermanent).toBe(false);
    });

    it("starts idle: never attacked, never released", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      expect(envelope.attackValue).toBe(0);
      expect(envelope.isSustaining).toBe(false);
      expect(envelope.isReleasing).toBe(false);
      expect(envelope.status).toBe("idle");
      expect(envelope.hasBeenReleased).toBe(false);
      expect(envelope.timeAttacked).toBeNull();
      expect(envelope.timeReleased).toBeNull();
    });
  });

  describe("attack", () => {
    it("sets attackValue and timeAttacked (ms since first render), deriving isSustaining/status", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(0.75);

      expect(envelope.attackValue).toBe(0.75);
      expect(envelope.isSustaining).toBe(true);
      expect(envelope.isReleasing).toBe(false);
      expect(envelope.status).toBe("sustained");
      // Construction (first render) and this attack happen at the same
      // fake-clock instant, so ms-since-first-render is 0 here.
      expect(envelope.timeAttacked).toBe(0);
    });

    it("rejects an attackValue outside the normalized 0-1 range", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      expect(() => envelope.attack(1.5)).toThrow();
      expect(() => envelope.attack(-0.1)).toThrow();
    });

    it("re-attacking updates attackValue and timeAttacked to ms since first render at the moment of THIS attack", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(0.5);
      vi.advanceTimersByTime(50);
      envelope.attack(1);

      expect(envelope.attackValue).toBe(1);
      // First render was at construction (t=0); this second attack happens
      // at t=50, so timeAttacked reflects that, not "0" or "time since now".
      expect(envelope.timeAttacked).toBe(50);
    });

    it("timeAttacked is a frozen snapshot — it does not grow as time passes without a new attack", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      vi.advanceTimersByTime(42);
      envelope.attack(1);

      expect(envelope.timeAttacked).toBe(42);

      vi.advanceTimersByTime(1000);

      // Unlike a live "ms since now" value, this must stay fixed at 42 —
      // that's the whole point of "since first render", matching
      // Visual.ts's timeAttackedSinceFirstRender behavior instead of
      // recomputing against the current time on every read.
      expect(envelope.timeAttacked).toBe(42);
      expect(envelope.status).toBe("sustained");
    });
  });

  describe("sustain", () => {
    it("does not by itself change status", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      envelope.sustain(500);

      expect(envelope.status).toBe("sustained");
    });
  });

  describe("release", () => {
    it("does not release immediately — it schedules the release sustainPeriod ms later", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      envelope.sustain(200);
      envelope.release(100);

      expect(envelope.status).toBe("sustained");
      expect(envelope.hasBeenReleased).toBe(false);

      vi.advanceTimersByTime(199);
      expect(envelope.status).toBe("sustained");
      expect(envelope.hasBeenReleased).toBe(false);

      vi.advanceTimersByTime(1);
      expect(envelope.status).toBe("releasing");
      expect(envelope.hasBeenReleased).toBe(true);
    });

    it("defaults sustainPeriod to 0, so release() with no prior sustain() applies on the next tick", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      envelope.release(100);

      vi.advanceTimersByTime(0);

      expect(envelope.status).toBe("releasing");
    });

    it("defaults releasePeriod to 1000ms when not given", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      envelope.release();
      vi.advanceTimersByTime(0);

      vi.advanceTimersByTime(999);
      expect(envelope.status).toBe("releasing");

      vi.advanceTimersByTime(1);
      expect(envelope.status).toBe("idle");
    });

    it("transitions to idle exactly at releasePeriod ms after release takes effect", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      envelope.release(100);
      vi.advanceTimersByTime(0); // release takes effect now

      vi.advanceTimersByTime(99);
      expect(envelope.status).toBe("releasing");

      vi.advanceTimersByTime(1);
      expect(envelope.status).toBe("idle");
      expect(envelope.hasBeenReleased).toBe(true);
    });

    it("reports timeReleased (ms since first render, frozen at the moment of release) once released, and null before", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      expect(envelope.timeReleased).toBeNull();

      envelope.release(100);
      vi.advanceTimersByTime(0); // release takes effect at t=0

      expect(envelope.timeReleased).toBe(0);

      vi.advanceTimersByTime(30);

      // Frozen, not live — must still read 0, not 30.
      expect(envelope.timeReleased).toBe(0);
    });

    it("a re-attack before a scheduled release fires supersedes it", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      envelope.sustain(200);
      envelope.release(100); // scheduled to fire at t=200

      vi.advanceTimersByTime(150);
      envelope.attack(1); // re-attacked before the release fired

      vi.advanceTimersByTime(50); // t=200 — the stale release timer fires now

      expect(envelope.isSustaining).toBe(true);
      expect(envelope.isReleasing).toBe(false);
      expect(envelope.status).toBe("sustained");
      expect(envelope.hasBeenReleased).toBe(false);
    });

    it("does nothing if called before an attack ever happened", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.release(100);
      vi.advanceTimersByTime(0);

      expect(envelope.status).toBe("idle");
      expect(envelope.hasBeenReleased).toBe(false);
    });
  });

  describe("isPermanent", () => {
    it("has no effect on status/hasBeenReleased derivation — it's read by callers (placeInScene, Scene), not by the envelope itself", () => {
      const permanent = new ReactiveLayerEnvelope(true);
      const temporary = new ReactiveLayerEnvelope(false);

      permanent.attack(1);
      temporary.attack(1);
      permanent.release(100);
      temporary.release(100);

      vi.advanceTimersByTime(100);

      expect(permanent.status).toBe(temporary.status);
      expect(permanent.hasBeenReleased).toBe(temporary.hasBeenReleased);
    });
  });

  describe("chaining", () => {
    it("attack, sustain and release each return the same instance", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      expect(envelope.attack(1)).toBe(envelope);
      expect(envelope.sustain(200)).toBe(envelope);
      expect(envelope.release(100)).toBe(envelope);
    });

    it("supports a full attack().sustain().release() chain with correct behavior", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      const result = envelope.attack(1).sustain(200).release(100);

      expect(result).toBe(envelope);
      expect(envelope.status).toBe("sustained");

      vi.advanceTimersByTime(200);
      expect(envelope.status).toBe("releasing");

      vi.advanceTimersByTime(100);
      expect(envelope.status).toBe("idle");
    });
  });
});
