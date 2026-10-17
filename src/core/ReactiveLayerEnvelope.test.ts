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

      expect(envelope.current.attackValue).toBe(0);
      expect(envelope.isSustaining).toBe(false);
      expect(envelope.isReleasing).toBe(false);
      expect(envelope.current.status).toBe("idle");
      expect(envelope.hasBeenReleased).toBe(false);
      expect(envelope.timeOf.attack).toBeNull();
      expect(envelope.timeOf.release).toBeNull();
    });
  });

  describe("attack", () => {
    it("sets attackValue and timeAttacked (ms since first render), deriving isSustaining/status", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(0.75);

      expect(envelope.current.attackValue).toBe(0.75);
      expect(envelope.isSustaining).toBe(true);
      expect(envelope.isReleasing).toBe(false);
      expect(envelope.current.status).toBe("sustained");
      // Construction (first render) and this attack happen at the same
      // fake-clock instant, so ms-since-first-render is 0 here.
      expect(envelope.timeOf.attack).toBe(0);
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

      expect(envelope.current.attackValue).toBe(1);
      // First render was at construction (t=0); this second attack happens
      // at t=50, so timeAttacked reflects that, not "0" or "time since now".
      expect(envelope.timeOf.attack).toBe(50);
    });

    it("timeAttacked is a frozen snapshot — it does not grow as time passes without a new attack", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      vi.advanceTimersByTime(42);
      envelope.attack(1);

      expect(envelope.timeOf.attack).toBe(42);

      vi.advanceTimersByTime(1000);

      // Unlike a live "ms since now" value, this must stay fixed at 42 —
      // that's the whole point of "since first render", matching
      // Visual.ts's timeAttackedSinceFirstRender behavior instead of
      // recomputing against the current time on every read.
      expect(envelope.timeOf.attack).toBe(42);
      expect(envelope.current.status).toBe("sustained");
    });
  });

  describe("sustain", () => {
    it("does not by itself change status", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      envelope.sustain(500);

      expect(envelope.current.status).toBe("sustained");
    });
  });

  describe("release", () => {
    it("does not release immediately — it schedules the release sustainPeriod ms later", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      envelope.sustain(200);
      envelope.release(100);

      expect(envelope.current.status).toBe("sustained");
      expect(envelope.hasBeenReleased).toBe(false);

      vi.advanceTimersByTime(199);
      expect(envelope.current.status).toBe("sustained");
      expect(envelope.hasBeenReleased).toBe(false);

      vi.advanceTimersByTime(1);
      expect(envelope.current.status).toBe("releasing");
      expect(envelope.hasBeenReleased).toBe(true);
    });

    it("defaults sustainPeriod to 0, so release() with no prior sustain() applies on the next tick", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      envelope.release(100);

      vi.advanceTimersByTime(0);

      expect(envelope.current.status).toBe("releasing");
    });

    it("defaults releasePeriod to 1000ms when not given", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      envelope.release();
      vi.advanceTimersByTime(0);

      vi.advanceTimersByTime(999);
      expect(envelope.current.status).toBe("releasing");

      vi.advanceTimersByTime(1);
      expect(envelope.current.status).toBe("idle");
    });

    it("transitions to idle exactly at releasePeriod ms after release takes effect", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      envelope.release(100);
      vi.advanceTimersByTime(0); // release takes effect now

      vi.advanceTimersByTime(99);
      expect(envelope.current.status).toBe("releasing");

      vi.advanceTimersByTime(1);
      expect(envelope.current.status).toBe("idle");
      expect(envelope.hasBeenReleased).toBe(true);
    });

    it("reports timeReleased (ms since first render, frozen at the moment of release) once released, and null before", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      expect(envelope.timeOf.release).toBeNull();

      envelope.release(100);
      vi.advanceTimersByTime(0); // release takes effect at t=0

      expect(envelope.timeOf.release).toBe(0);

      vi.advanceTimersByTime(30);

      // Frozen, not live — must still read 0, not 30.
      expect(envelope.timeOf.release).toBe(0);
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
      expect(envelope.current.status).toBe("sustained");
      expect(envelope.hasBeenReleased).toBe(false);
    });

    it("does nothing if called before an attack ever happened", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.release(100);
      vi.advanceTimersByTime(0);

      expect(envelope.current.status).toBe("idle");
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

      expect(permanent.current.status).toBe(temporary.current.status);
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
      expect(envelope.current.status).toBe("sustained");

      vi.advanceTimersByTime(200);
      expect(envelope.current.status).toBe("releasing");

      vi.advanceTimersByTime(100);
      expect(envelope.current.status).toBe("idle");
    });
  });

  // release() is always deferred by the sustain period (0 by default) via
  // setTimeout, so a test has to flush timers for the release to land.
  const releaseNow = (envelope: ReactiveLayerEnvelope, durationInMs?: number) => {
    envelope.release(durationInMs);
    vi.advanceTimersByTime(0);
  };

  describe("attack duration", () => {
    it("defaults the attack period to 500ms and exposes it on current", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(0.8);
      expect(envelope.current.attackPeriod).toBe(500);

      envelope.attack(0.8, 250);
      expect(envelope.current.attackPeriod).toBe(250);
    });

    it("does not delay the attack itself -- timeOf.attack is when attack() was called", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      vi.advanceTimersByTime(100);
      envelope.attack(1, 2000);

      expect(envelope.timeOf.attack).toBe(100);
      expect(envelope.current.status).toBe("sustained");
    });
  });

  describe("sustain timing", () => {
    it("exposes when sustain() was called on timeOf.sustain, and null before", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      expect(envelope.timeOf.sustain).toBeNull();

      vi.advanceTimersByTime(300);
      envelope.sustain(1000);

      expect(envelope.timeOf.sustain).toBe(300);
    });
  });

  describe("decay timing", () => {
    it("has no decay time until decay() is called", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      vi.advanceTimersByTime(100);
      envelope.attack(1);

      expect(envelope.timeOf.decay).toBeNull();
    });

    it("defaults the decay period to 10000ms and exposes it on current", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1).decay();
      expect(envelope.current.decayPeriod).toBe(10000);

      envelope.attack(1).decay(2000);
      expect(envelope.current.decayPeriod).toBe(2000);
    });

    it("returns the same instance from decay(), so it chains", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      expect(envelope.attack(1).decay()).toBe(envelope);
    });

    it("starts decay only once the default 500ms attack has elapsed, when chained with attack()", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      vi.advanceTimersByTime(100);
      envelope.attack(1).decay(2000);

      expect(envelope.timeOf.attack).toBe(100);
      expect(envelope.timeOf.decay).toBe(600);
    });

    it("starts decay after a custom attack duration", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      vi.advanceTimersByTime(100);
      envelope.attack(1, 1200).decay();

      expect(envelope.timeOf.decay).toBe(1300);
    });

    it("starts decay immediately for a zero-length attack", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      vi.advanceTimersByTime(100);
      envelope.attack(1, 0).decay();

      expect(envelope.timeOf.decay).toBe(100);
    });

    it("starts decay when decay() is called, if the attack has already finished by then", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      vi.advanceTimersByTime(100);
      envelope.attack(1);

      vi.advanceTimersByTime(900);
      envelope.decay();

      expect(envelope.timeOf.decay).toBe(1000);
    });

    it("starts decay at the end of the attack, if decay() is called partway through it", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1, 500);

      vi.advanceTimersByTime(200);
      envelope.decay();

      expect(envelope.timeOf.decay).toBe(500);
    });

    it("is a frozen snapshot -- it does not move as time passes", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1).decay();
      vi.advanceTimersByTime(5000);

      expect(envelope.timeOf.decay).toBe(500);
    });

    it("clears the previous decay on a fresh attack", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1).decay();
      expect(envelope.timeOf.decay).not.toBeNull();

      vi.advanceTimersByTime(3000);
      envelope.attack(1);

      expect(envelope.timeOf.decay).toBeNull();
    });

    it("re-schedules decay relative to the new attack when re-attacked and decayed again", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1).decay();

      vi.advanceTimersByTime(3000);
      envelope.attack(1, 400).decay();

      expect(envelope.timeOf.decay).toBe(3400);
    });

    it("uses the decay() call time when there was never an attack", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      vi.advanceTimersByTime(250);
      envelope.decay();

      expect(envelope.timeOf.decay).toBe(250);
    });

    it("does not affect status -- a decaying layer is still sustained until released", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1).decay(1000);
      vi.advanceTimersByTime(5000);

      expect(envelope.current.status).toBe("sustained");
    });
  });

  describe("decay cancellation by release", () => {
    it("cancels decay when the note is released before the attack period ends", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1, 500).decay();
      expect(envelope.timeOf.decay).toBe(500);

      vi.advanceTimersByTime(200);
      releaseNow(envelope);

      expect(envelope.timeOf.release).toBe(200);
      expect(envelope.timeOf.decay).toBeNull();
    });

    it("cancels decay when the release lands exactly as decay would start", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1, 500).decay();

      vi.advanceTimersByTime(500);
      releaseNow(envelope);

      expect(envelope.timeOf.decay).toBeNull();
    });

    it("keeps decay when the note is released after decay has begun", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1, 500).decay();

      vi.advanceTimersByTime(3000);
      releaseNow(envelope);

      expect(envelope.timeOf.decay).toBe(500);
      expect(envelope.timeOf.release).toBe(3000);
    });

    it("measures the cancelling release against when it actually fires, after any sustain period", () => {
      // release() is deferred by the sustain period, so a release *called*
      // during the attack can still land after decay has started.
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1, 500).decay().sustain(1000);

      vi.advanceTimersByTime(200);
      envelope.release();
      vi.advanceTimersByTime(1000);

      expect(envelope.timeOf.release).toBe(1200);
      expect(envelope.timeOf.decay).toBe(500);
    });

    it("does not let a release from a previous attack cancel the new attack's decay", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      vi.advanceTimersByTime(100);
      releaseNow(envelope);

      vi.advanceTimersByTime(1900);
      envelope.attack(1, 500).decay();

      expect(envelope.timeOf.decay).toBe(2500);
    });

    it("cancels decay regardless of preserveStateIfNotReleased", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1, 500, true).decay();

      vi.advanceTimersByTime(200);
      releaseNow(envelope);

      expect(envelope.timeOf.decay).toBeNull();
    });
  });

  describe("release scoping and preserveStateIfNotReleased", () => {
    // Re-attack after an earlier, completed attack/release cycle: the case
    // where a stale release can linger in timeOf.
    const reattackAfterEarlierCycle = (
      envelope: ReactiveLayerEnvelope,
      preserveStateIfNotReleased?: boolean,
    ) => {
      envelope.attack(1);
      vi.advanceTimersByTime(600);
      releaseNow(envelope);

      vi.advanceTimersByTime(1400);
      envelope.attack(1, 500, preserveStateIfNotReleased);
    };

    it("exposes the current attack's release on timeOf.release", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      vi.advanceTimersByTime(100);
      envelope.attack(1);

      vi.advanceTimersByTime(400);
      releaseNow(envelope);

      expect(envelope.timeOf.release).toBe(500);
    });

    it("defaults preserveStateIfNotReleased to false: an earlier attack's release stays visible after a re-attack", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      reattackAfterEarlierCycle(envelope);

      expect(envelope.timeOf.release).toBe(600);
    });

    it("keeps an earlier attack's release visible when preserveStateIfNotReleased is explicitly false", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      reattackAfterEarlierCycle(envelope, false);

      expect(envelope.timeOf.release).toBe(600);
    });

    it("hides an earlier attack's release when re-attacked with preserveStateIfNotReleased", () => {
      // A stale release would remain in the animation timeline as a completed
      // segment, blocking the re-attack from inheriting the live value.
      const envelope = new ReactiveLayerEnvelope(true);

      reattackAfterEarlierCycle(envelope, true);

      expect(envelope.timeOf.release).toBeNull();
    });

    it("leaves hasBeenReleased untouched when hiding the release -- registry culling relies on it", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      reattackAfterEarlierCycle(envelope, true);

      expect(envelope.hasBeenReleased).toBe(true);
    });

    it("hides an in-flight release when re-attacked mid-release with preserveStateIfNotReleased", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      envelope.attack(1);
      vi.advanceTimersByTime(2000);
      releaseNow(envelope, 1000);

      vi.advanceTimersByTime(500);
      envelope.attack(1, 500, true);

      expect(envelope.timeOf.release).toBeNull();
      expect(envelope.current.status).toBe("sustained");
    });

    it("applies preserveStateIfNotReleased per attack, not permanently", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      reattackAfterEarlierCycle(envelope, true);
      expect(envelope.timeOf.release).toBeNull();

      vi.advanceTimersByTime(1000);
      envelope.attack(1);
      expect(envelope.timeOf.release).toBe(600);
    });

    it("exposes the new release once a re-attacked layer is released again", () => {
      const envelope = new ReactiveLayerEnvelope(true);

      reattackAfterEarlierCycle(envelope, true);

      vi.advanceTimersByTime(1000);
      releaseNow(envelope);

      expect(envelope.timeOf.release).toBe(3000);
    });
  });
});
