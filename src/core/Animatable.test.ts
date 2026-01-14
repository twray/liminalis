import { describe, expect, it, vi } from "vitest";
import Animatable from "./Animatable";

function simulateFrames<T extends Record<string, any>>(
  initialProps: T,
  firstInvokedTime: number,
  addSegments: (anim: Animatable<T>, context: { time: number }) => void,
  times: number[]
): T[] {
  const results: T[] = [];
  let anim: Animatable<T> | null = null;

  for (const time of times) {
    if (anim === null) {
      anim = new Animatable<T>(initialProps, firstInvokedTime);
    } else {
      anim.clearSegments();
      anim.updateInitialProps(initialProps);
    }

    addSegments(anim, { time });
    const props = anim.getCurrentProps(time);
    results.push(props);
  }

  return results;
}

describe("Animatable", () => {
  describe("constructor and initial state", () => {
    it("stores initial props", () => {
      const anim = new Animatable({ x: 10, y: 20 }, 0);
      expect(anim.getCurrentProps(0)).toEqual({ x: 10, y: 20 });
    });

    it("returns initial props when no animations defined", () => {
      const anim = new Animatable({ radius: 50 }, 0);
      expect(anim.getCurrentProps(0).radius).toBe(50);
      expect(anim.getCurrentProps(1000).radius).toBe(50);
      expect(anim.getCurrentProps(10000).radius).toBe(50);
    });

    it("preserves non-animated properties", () => {
      const anim = new Animatable({ x: 10, y: 20, z: 30 }, 0);
      anim.animateTo({ x: 100 }, { duration: 1000 });

      const props = anim.getCurrentProps(500);
      expect(props.x).toBe(55); // Animated
      expect(props.y).toBe(20); // Preserved
      expect(props.z).toBe(30); // Preserved
    });
  });

  describe("updateInitialProps", () => {
    it("updates initial props for subsequent calculations", () => {
      const anim = new Animatable({ x: 10, color: "red" }, 0);
      anim.updateInitialProps({ x: 10, color: "blue" });

      const props = anim.getCurrentProps(0);
      expect(props.color).toBe("blue");
    });
  });

  describe("clearSegments", () => {
    it("removes all animation segments", () => {
      const anim = new Animatable({ radius: 50 }, 0);
      anim.animateTo({ radius: 100 }, { duration: 1000 });

      expect(anim.getCurrentProps(500).radius).toBe(75);

      anim.clearSegments();
      expect(anim.getCurrentProps(500).radius).toBe(50);
    });
  });

  describe("reset", () => {
    it("clears segments", () => {
      const anim = new Animatable({ radius: 50 }, 0);
      anim.animateTo({ radius: 100 }, { duration: 1000 });

      anim.reset();
      expect(anim.getCurrentProps(500).radius).toBe(50);
    });
  });
});

describe("Single Animation Segment", () => {
  describe("basic interpolation", () => {
    it("animates from initial to target over duration", () => {
      const anim = new Animatable<Partial<{ radius: number }>>(
        { radius: 50 },
        0
      );
      anim.animateTo({ radius: 100 }, { duration: 1000 });

      expect(anim.getCurrentProps(0).radius).toBe(50);
      expect(anim.getCurrentProps(250).radius).toBe(62.5);
      expect(anim.getCurrentProps(500).radius).toBe(75);
      expect(anim.getCurrentProps(750).radius).toBe(87.5);
      expect(anim.getCurrentProps(1000).radius).toBe(100);
    });

    it("clamps progress before animation starts", () => {
      const anim = new Animatable({ radius: 50 }, 0);
      anim.animateTo({ radius: 100 }, { duration: 1000 });

      // Before t=0
      expect(anim.getCurrentProps(-100).radius).toBe(50);
    });

    it("maintains final value after animation completes", () => {
      const anim = new Animatable({ radius: 50 }, 0);
      anim.animateTo({ radius: 100 }, { duration: 1000 });

      expect(anim.getCurrentProps(1000).radius).toBe(100);
      expect(anim.getCurrentProps(2000).radius).toBe(100);
      expect(anim.getCurrentProps(10000).radius).toBe(100);
    });
  });

  describe("multiple properties in one segment", () => {
    it("animates multiple properties simultaneously", () => {
      const anim = new Animatable({ x: 0, y: 0, scale: 1 }, 0);
      anim.animateTo({ x: 100, y: 200, scale: 2 }, { duration: 1000 });

      const props = anim.getCurrentProps(500);
      expect(props.x).toBe(50);
      expect(props.y).toBe(100);
      expect(props.scale).toBe(1.5);
    });
  });

  describe("endTime option", () => {
    it("calculates duration from endTime", () => {
      const anim = new Animatable({ x: 0 }, 0);
      anim.animateTo({ x: 100 }, { endTime: 1000 });

      expect(anim.getCurrentProps(500).x).toBe(50);
      expect(anim.getCurrentProps(1000).x).toBe(100);
    });
  });

  describe("delay option", () => {
    it("delays the start of animation", () => {
      const anim = new Animatable({ radius: 50 }, 0);
      anim.animateTo({ radius: 100 }, { delay: 500, duration: 1000 });

      expect(anim.getCurrentProps(0).radius).toBe(50);
      expect(anim.getCurrentProps(250).radius).toBe(50);
      expect(anim.getCurrentProps(500).radius).toBe(50);
      expect(anim.getCurrentProps(1000).radius).toBe(75);
      expect(anim.getCurrentProps(1500).radius).toBe(100);
    });
  });

  describe("zero duration", () => {
    it("immediately jumps to target value", () => {
      const anim = new Animatable({ x: 0 }, 0);
      anim.animateTo({ x: 100 }, { duration: 0 });

      expect(anim.getCurrentProps(0).x).toBe(100);
      expect(anim.getCurrentProps(100).x).toBe(100);
    });
  });
});

describe("Handling of Default Values", () => {
  it("uses 0 as default for properties not in initial props", () => {
    const anim = new Animatable<
      Partial<{
        width: number;
        height: number;
        x: number;
      }>
    >({ width: 200, height: 200 }, 0);
    anim.animateTo({ x: 20 }, { duration: 1000 });

    expect(anim.getCurrentProps(0).x).toBe(0);
    expect(anim.getCurrentProps(500).x).toBe(10);
    expect(anim.getCurrentProps(1000).x).toBe(20);
  });

  it("opacity animates from a default of 1 if not specified in initial props", () => {
    const anim = new Animatable<
      Partial<{
        width: number;
        height: number;
        opacity: number;
      }>
    >({ width: 200, height: 200 }, 0);
    anim.animateTo({ opacity: 0.5 }, { duration: 1000 });

    expect(anim.getCurrentProps(0).opacity).toBe(1);
    expect(anim.getCurrentProps(500).opacity).toBe(0.75);
    expect(anim.getCurrentProps(1000).opacity).toBe(0.5);
  });

  it("scale property animates from a default of 1 if not specified in initial props", () => {
    const anim = new Animatable<
      Partial<{
        width: number;
        height: number;
        scale: number;
      }>
    >({ width: 200, height: 200 }, 0);
    anim.animateTo({ scale: 0.5 }, { duration: 1000 });

    expect(anim.getCurrentProps(0).scale).toBe(1);
    expect(anim.getCurrentProps(500).scale).toBe(0.75);
    expect(anim.getCurrentProps(1000).scale).toBe(0.5);
  });

  it("scaleX and scaleY properties animate from a default of 1 if not specified in initial props", () => {
    const anim = new Animatable<
      Partial<{
        width: number;
        height: number;
        scaleX: number;
        scaleY: number;
      }>
    >({ width: 200, height: 200 }, 0);
    anim.animateTo({ scaleX: 0.5, scaleY: 0.5 }, { duration: 1000 });

    expect(anim.getCurrentProps(0).scaleX).toBe(1);
    expect(anim.getCurrentProps(500).scaleX).toBe(0.75);
    expect(anim.getCurrentProps(1000).scaleX).toBe(0.5);

    expect(anim.getCurrentProps(0).scaleY).toBe(1);
    expect(anim.getCurrentProps(500).scaleY).toBe(0.75);
    expect(anim.getCurrentProps(1000).scaleY).toBe(0.5);
  });
});

describe("Sequential Timelines", () => {
  describe("basic chaining", () => {
    it("executes animations in sequence", () => {
      // Per spec: "animations are executed sequentially and in order"
      const anim = new Animatable({ x: 20, y: 20 }, 0);
      anim
        .animateTo({ x: 40 }, { duration: 1000 })
        .animateTo({ y: 40 }, { duration: 1000 });

      // First segment: x animates
      expect(anim.getCurrentProps(0)).toEqual({ x: 20, y: 20 });
      expect(anim.getCurrentProps(500)).toEqual({ x: 30, y: 20 });
      expect(anim.getCurrentProps(1000)).toEqual({ x: 40, y: 20 });

      // Second segment: y animates
      expect(anim.getCurrentProps(1500)).toEqual({ x: 40, y: 30 });
      expect(anim.getCurrentProps(2000)).toEqual({ x: 40, y: 40 });
    });

    it("chains three or more segments", () => {
      const anim = new Animatable({ x: 0 }, 0);
      anim
        .animateTo({ x: 100 }, { duration: 500 })
        .animateTo({ x: 200 }, { duration: 500 })
        .animateTo({ x: 300 }, { duration: 500 });

      expect(anim.getCurrentProps(250).x).toBe(50);
      expect(anim.getCurrentProps(500).x).toBe(100);
      expect(anim.getCurrentProps(750).x).toBe(150);
      expect(anim.getCurrentProps(1000).x).toBe(200);
      expect(anim.getCurrentProps(1250).x).toBe(250);
      expect(anim.getCurrentProps(1500).x).toBe(300);
    });
  });

  describe("start props calculation", () => {
    it("uses previous segment end value as next segment start", () => {
      const results = simulateFrames(
        { radius: 50 },
        0,
        (anim) => {
          anim
            .animateTo({ radius: 100 }, { duration: 1000 })
            .animateTo({ radius: 150 }, { duration: 1000 });
        },
        [0, 500, 1000, 1500, 2000]
      );

      expect(results[0].radius).toBe(50); // t=0
      expect(results[1].radius).toBe(75); // t=500
      expect(results[2].radius).toBe(100); // t=1000
      expect(results[3].radius).toBe(125); // t=1500, starts from 100
      expect(results[4].radius).toBe(150); // t=2000
    });
  });

  describe("delay with sequential", () => {
    it("applies delay between sequential segments", () => {
      const anim = new Animatable({ x: 0 }, 0);
      anim
        .animateTo({ x: 100 }, { duration: 500 })
        .animateTo({ x: 200 }, { delay: 500, duration: 500 });

      // First segment: 0-500
      expect(anim.getCurrentProps(500).x).toBe(100);
      // Gap: 500-1000
      expect(anim.getCurrentProps(750).x).toBe(100);
      // Second segment: 1000-1500
      expect(anim.getCurrentProps(1000).x).toBe(100);
      expect(anim.getCurrentProps(1250).x).toBe(150);
      expect(anim.getCurrentProps(1500).x).toBe(200);
    });
  });
});

describe("Explicit 'at' Timing", () => {
  describe("basic at usage", () => {
    it("starts animation at specified time", () => {
      const anim = new Animatable({ radius: 50 }, 0);
      anim.animateTo({ radius: 100 }, { at: 500, duration: 1000 });

      expect(anim.getCurrentProps(0).radius).toBe(50);
      expect(anim.getCurrentProps(500).radius).toBe(50);
      expect(anim.getCurrentProps(1000).radius).toBe(75);
      expect(anim.getCurrentProps(1500).radius).toBe(100);
    });

    it("handles at: 0 correctly", () => {
      const anim = new Animatable({ radius: 50 }, 0);
      anim.animateTo({ radius: 100 }, { at: 0, duration: 1000 });

      expect(anim.getCurrentProps(0).radius).toBe(50);
      expect(anim.getCurrentProps(500).radius).toBe(75);
      expect(anim.getCurrentProps(1000).radius).toBe(100);
    });
  });

  describe("at: null (segment does not activate)", () => {
    it("prevents segment from running", () => {
      const anim = new Animatable({ radius: 50 }, 0);
      anim
        .animateTo({ radius: 100 }, { at: 0, duration: 1000 })
        .animateTo({ radius: 50 }, { at: null, duration: 500 });

      // Second segment never activates
      expect(anim.getCurrentProps(500).radius).toBe(75);
      expect(anim.getCurrentProps(1000).radius).toBe(100);
      expect(anim.getCurrentProps(1500).radius).toBe(100);
      expect(anim.getCurrentProps(5000).radius).toBe(100);
    });
  });

  describe("delay with at", () => {
    it("combines delay with explicit at time", () => {
      const anim = new Animatable({ radius: 50 }, 0);
      anim.animateTo({ radius: 100 }, { at: 200, delay: 300, duration: 1000 });

      // Effective start = 200 + 300 = 500
      expect(anim.getCurrentProps(400).radius).toBe(50);
      expect(anim.getCurrentProps(500).radius).toBe(50);
      expect(anim.getCurrentProps(1000).radius).toBe(75);
      expect(anim.getCurrentProps(1500).radius).toBe(100);
    });
  });

  describe("gap between segments", () => {
    it("maintains final value during gap", () => {
      const results = simulateFrames(
        { radius: 50 },
        0,
        (anim) => {
          anim
            .animateTo({ radius: 100 }, { at: 0, duration: 500 })
            .animateTo({ radius: 50 }, { at: 1000, duration: 500 });
        },
        [0, 250, 500, 750, 1000, 1250, 1500]
      );

      expect(results[0].radius).toBe(50); // t=0
      expect(results[1].radius).toBe(75); // t=250
      expect(results[2].radius).toBe(100); // t=500, first complete

      // Gap: maintains final value
      expect(results[3].radius).toBe(100); // t=750

      // Second segment starts
      expect(results[4].radius).toBeCloseTo(100); // t=1000
      expect(results[5].radius).toBeCloseTo(75); // t=1250
      expect(results[6].radius).toBe(50); // t=1500
    });
  });
});

describe("Out-of-Order Timelines", () => {
  describe("declaration order vs execution order", () => {
    it("respects at times regardless of declaration order", () => {
      // Per spec: "the 'at' property can be applied in such a way that results
      // in an animation in which its segments not necessarily animated in the
      // order that they are declared"
      const anim = new Animatable({ x: 20, y: 20 }, 0);
      anim
        .animateTo({ x: 40 }, { at: 500, duration: 1000 })
        .animateTo({ y: 40 }, { at: 0, duration: 1000 });

      // y animates first (at: 0)
      expect(anim.getCurrentProps(0)).toEqual({ x: 20, y: 20 });
      expect(anim.getCurrentProps(500).y).toBe(30);

      // x starts at t=500
      expect(anim.getCurrentProps(500).x).toBe(20);
      expect(anim.getCurrentProps(1000).x).toBe(30);

      // y completes at t=1000, x completes at t=1500
      expect(anim.getCurrentProps(1000).y).toBe(40);
      expect(anim.getCurrentProps(1500).x).toBe(40);
    });
  });
});

describe("Overlapping Animations", () => {
  describe("superseding behavior", () => {
    it("later segment supersedes earlier for same property", () => {
      // Per spec: "the 'at' property forces an animation segment to start at
      // its current position even if the previous segment is still animating"
      const results = simulateFrames(
        { radius: 50 },
        0,
        (anim) => {
          anim
            .animateTo({ radius: 100 }, { at: 0, duration: 1000 })
            .animateTo({ radius: 50 }, { at: 500, duration: 500 });
        },
        [0, 250, 500, 750, 1000, 1100]
      );

      // First segment only
      expect(results[0].radius).toBe(50); // t=0
      expect(results[1].radius).toBe(62.5); // t=250

      // Second segment takes over at t=500, capturing current value (~75)
      expect(results[2].radius).toBeCloseTo(75); // t=500

      // Second segment animates from ~75 to 50
      expect(results[3].radius).toBeCloseTo(62.5); // t=750

      // Second segment complete
      expect(results[4].radius).toBe(50); // t=1000

      // First segment is superseded, value stays at 50
      expect(results[5].radius).toBe(50); // t=1100
    });

    it("captures actual rendered value when segment starts", () => {
      const results = simulateFrames(
        { radius: 50 },
        0,
        (anim) => {
          anim
            .animateTo({ radius: 100 }, { at: 0, duration: 1000 })
            .animateTo({ radius: 0 }, { at: 400, duration: 600 });
        },
        [0, 200, 400, 700, 1000]
      );

      expect(results[0].radius).toBe(50); // t=0
      expect(results[1].radius).toBe(60); // t=200, 20% of 50->100

      // At t=400, second segment starts, captures radius=70
      expect(results[2].radius).toBeCloseTo(70); // t=400

      // Animates from 70 to 0 over 600ms
      // At t=700, that's 300ms into the segment = 50% progress
      expect(results[3].radius).toBeCloseTo(35); // t=700

      expect(results[4].radius).toBe(0); // t=1000
    });
  });

  describe("multi-property independence", () => {
    it("supersedes only the affected properties", () => {
      const results = simulateFrames(
        { x: 0, y: 0 },
        0,
        (anim) => {
          anim
            .animateTo({ x: 100, y: 100 }, { at: 0, duration: 1000 })
            .animateTo({ x: 0 }, { at: 500, duration: 500 }); // Only x
        },
        [0, 500, 750, 1000]
      );

      // t=0
      expect(results[0].x).toBe(0);
      expect(results[0].y).toBe(0);

      // t=500: y continues first animation, x starts second
      expect(results[1].x).toBeCloseTo(50);
      expect(results[1].y).toBe(50);

      // t=750: y continues, x halfway through second
      expect(results[2].y).toBe(75);
      // x goes from ~50 to 0, at 50% that's 25
      expect(results[2].x).toBeCloseTo(25);

      // t=1000: both complete
      expect(results[3].x).toBe(0);
      expect(results[3].y).toBe(100);
    });
  });
});

describe("Event-Driven Animations", () => {
  describe("MIDI attack/release pattern", () => {
    it("handles at changing from null to a value", () => {
      // Per spec: "we use the 'at' property to dynamically play segments based
      // on events, which in this case, correspond to when a midiVisual is
      // 'attacked' (key down) or 'released' (key up)"
      let releaseTime: number | null = null;

      const results = simulateFrames(
        { radius: 10 },
        0,
        (anim, { time }) => {
          // Simulate release happening at t=500
          if (time >= 500) releaseTime = 500;

          anim
            .animateTo({ radius: 100 }, { at: 0, duration: 500 })
            .animateTo({ radius: 10 }, { at: releaseTime, duration: 500 });
        },
        [0, 250, 500, 750, 1000]
      );

      // Before release, first segment animating
      expect(results[0].radius).toBe(10); // t=0
      expect(results[1].radius).toBe(55); // t=250, 50% of 10->100

      // At release (t=500), second segment activates
      expect(results[2].radius).toBeCloseTo(100); // t=500

      // Second segment animates from 100 to 10
      expect(results[3].radius).toBeCloseTo(55); // t=750

      // Complete
      expect(results[4].radius).toBe(10); // t=1000
    });

    it("handles rapid attack/release", () => {
      let attackTime = 0;
      let releaseTime: number | null = null;

      const results = simulateFrames(
        { radius: 10 },
        0,
        (anim, { time }) => {
          // Quick release at t=100
          if (time >= 100) releaseTime = 100;

          anim
            .animateTo({ radius: 100 }, { at: attackTime, duration: 1000 })
            .animateTo({ radius: 10 }, { at: releaseTime, duration: 500 });
        },
        [0, 50, 100, 350, 600]
      );

      expect(results[0].radius).toBe(10); // t=0
      expect(results[1].radius).toBeCloseTo(14.5); // t=50, 5% of 10->100

      // At t=100, release happens, captures radius ~19
      expect(results[2].radius).toBeCloseTo(19); // t=100

      // Second segment: 19 -> 10 over 500ms
      // At t=350, that's 250ms in = 50% progress
      expect(results[3].radius).toBeCloseTo(14.5); // t=350

      expect(results[4].radius).toBe(10); // t=600
    });

    it("handles multiple attack/release cycles on persistent object", () => {
      // This tests the bug scenario where a persistent object's cache
      // doesn't invalidate when `at` values change on subsequent cycles.
      //
      // The EXPECTED behavior based on drawMethods.ts:
      // - Each frame, updateInitialProps() is called with current user props
      // - Each frame, clearSegments() is called and segments are rebuilt
      // - Animation should start from initialProps, not from "where we left off"

      const anim = new Animatable({ radius: 0 }, 0);

      // ===== FIRST CYCLE: Attack at t=0, release at t=500 =====
      anim.clearSegments();
      anim
        .animateTo({ radius: 100 }, { at: 0, duration: 500 })
        .animateTo({ radius: 0 }, { at: 500, duration: 500 });

      // Render frames in first cycle
      expect(anim.getCurrentProps(0).radius).toBe(0); // Attack starts at initialProps
      expect(anim.getCurrentProps(250).radius).toBe(50); // 50% attack
      expect(anim.getCurrentProps(500).radius).toBe(100); // Attack done, release starts
      expect(anim.getCurrentProps(750).radius).toBe(50); // 50% release
      expect(anim.getCurrentProps(1000).radius).toBe(0); // Release complete

      // Gap period - at rest
      expect(anim.getCurrentProps(1500).radius).toBe(0);

      // ===== SECOND CYCLE: Attack at t=2000, release at t=2500 =====
      // In browser, segments are rebuilt with NEW at values
      // Animation should restart from initialProps (0), NOT from previous animation end
      anim.clearSegments();
      anim
        .animateTo({ radius: 100 }, { at: 2000, duration: 500 })
        .animateTo({ radius: 0 }, { at: 2500, duration: 500 });

      // Second attack should start from initialProps (0)
      expect(anim.getCurrentProps(2000).radius).toBe(0); // Start from initialProps
      expect(anim.getCurrentProps(2250).radius).toBe(50); // 50% of 0→100
      expect(anim.getCurrentProps(2500).radius).toBe(100); // Second attack done
      expect(anim.getCurrentProps(2750).radius).toBe(50); // 50% of 100→0
      expect(anim.getCurrentProps(3000).radius).toBe(0); // Second release complete
    });

    it("handles rapid re-attacks during ongoing animation", () => {
      // Test scenario: user attacks, then attacks again mid-animation
      // This can happen with rapid MIDI inputs
      const anim = new Animatable({ radius: 0 }, 0);

      // First attack at t=0
      anim.clearSegments();
      anim
        .animateTo({ radius: 100 }, { at: 0, duration: 500 })
        .animateTo({ radius: 0 }, { at: null, duration: 500 }); // Not released yet

      // Render mid-attack at t=250 (radius should be 50)
      expect(anim.getCurrentProps(250).radius).toBe(50);

      // Rapid re-attack at t=300! New cycle starts before first completes
      anim.clearSegments();
      anim
        .animateTo({ radius: 100 }, { at: 300, duration: 500 })
        .animateTo({ radius: 0 }, { at: null, duration: 500 }); // Not released yet

      // At t=300, new attack starts from initialProps (0)
      expect(anim.getCurrentProps(300).radius).toBe(0);
      // At t=550, 50% through new attack
      expect(anim.getCurrentProps(550).radius).toBe(50);
      // At t=800, new attack complete
      expect(anim.getCurrentProps(800).radius).toBe(100);
    });

    it("uses updated initialProps for subsequent cycles", () => {
      // This tests that when initialProps changes between cycles,
      // the cache doesn't return stale start props
      const anim = new Animatable({ radius: 0 }, 0);

      // First cycle: animate from 0 to 100
      anim.clearSegments();
      anim.animateTo({ radius: 100 }, { at: 0, duration: 500 });

      expect(anim.getCurrentProps(0).radius).toBe(0);
      expect(anim.getCurrentProps(250).radius).toBe(50);
      expect(anim.getCurrentProps(500).radius).toBe(100);

      // Update initialProps to 50 (simulating user changing base value)
      anim.updateInitialProps({ radius: 50 });

      // Second cycle with new initialProps
      anim.clearSegments();
      anim.animateTo({ radius: 100 }, { at: 1000, duration: 500 });

      // Should start from new initialProps (50), not cached value (0)
      expect(anim.getCurrentProps(1000).radius).toBe(50); // Start from updated initialProps
      expect(anim.getCurrentProps(1250).radius).toBe(75); // 50% of 50→100
      expect(anim.getCurrentProps(1500).radius).toBe(100); // Complete
    });

    it("re-attack during release starts from current interpolated position", () => {
      // Scenario 3: attack > release (mid-attack) > re-attack (mid-release)
      // The re-attack should start from the current position of the release animation,
      // not from initialProps (0)
      //
      // Timeline:
      // t=0: Attack starts (0 → 100 over 500ms)
      // t=250: Release starts mid-attack (current value ~50, animate to 0 over 500ms)
      // t=400: Re-attack starts mid-release (should start from current value ~35)

      const anim = new Animatable({ radius: 0 }, 0);

      // === Phase 1: Initial attack at t=0 ===
      anim.clearSegments();
      anim
        .animateTo({ radius: 100 }, { at: 0, duration: 500 })
        .animateTo({ radius: 0 }, { at: null, duration: 500 }); // Release not triggered yet

      // Verify attack is animating
      expect(anim.getCurrentProps(0).radius).toBe(0);
      expect(anim.getCurrentProps(250).radius).toBe(50);

      // === Phase 2: Release at t=250 (mid-attack) ===
      // At t=250, the attack animation has reached radius=50
      // Now release is triggered, should animate from 50 → 0
      anim.captureCurrentProps(250); // Capture current state before rebuilding
      anim.clearSegments();
      anim
        .animateTo({ radius: 100 }, { at: 0, duration: 500 })
        .animateTo({ radius: 0 }, { at: 250, duration: 500 });

      // At t=250, release just started, so we're at the attack's current value
      // The attack was at 50% (radius=50), release starts from there
      expect(anim.getCurrentProps(250).radius).toBe(50);
      // At t=400, we're 150ms into release (30% of 500ms)
      // Release goes from 50 → 0, so at 30%: 50 - (50 * 0.3) = 35
      expect(anim.getCurrentProps(400).radius).toBe(35);

      // === Phase 3: Re-attack at t=400 (mid-release) ===
      // At t=400, the release animation is at radius=35
      // New attack should start FROM 35 and animate TO 100
      const valueAtReattack = anim.getCurrentProps(400).radius; // Should be 35

      anim.captureCurrentProps(400); // Capture current state before rebuilding
      anim.clearSegments();
      anim
        .animateTo({ radius: 100 }, { at: 400, duration: 500 })
        .animateTo({ radius: 0 }, { at: null, duration: 500 }); // Release not triggered yet

      // At t=400, re-attack starts - should be at the PREVIOUS position (35), not 0
      expect(anim.getCurrentProps(400).radius).toBe(valueAtReattack);
      // At t=650, 50% through re-attack: 35 + (100-35)*0.5 = 35 + 32.5 = 67.5
      expect(anim.getCurrentProps(650).radius).toBe(35 + (100 - 35) * 0.5);
      // At t=900, re-attack complete
      expect(anim.getCurrentProps(900).radius).toBe(100);
    });
  });
});

describe("firstInvokedTime Offset", () => {
  describe("relative time calculation", () => {
    it("offsets all times relative to first invocation", () => {
      const anim = new Animatable({ radius: 50 }, 1000);
      anim.animateTo({ radius: 100 }, { duration: 1000 });

      // Before shape existed (relative time negative)
      expect(anim.getCurrentProps(500).radius).toBe(50);

      // At first invocation (relative time = 0)
      expect(anim.getCurrentProps(1000).radius).toBe(50);

      // Midway (relative time = 500)
      expect(anim.getCurrentProps(1500).radius).toBe(75);

      // Complete (relative time = 1000)
      expect(anim.getCurrentProps(2000).radius).toBe(100);
    });

    it("works with afterTime pattern", () => {
      // Simulates: if (afterTime(2000)) { circle(...).animateTo(...) }
      const results = simulateFrames(
        { radius: 100 },
        2000, // Shape first appears at t=2000
        (anim) => {
          anim.animateTo({ radius: 150 }, { duration: 1000 });
        },
        [2000, 2500, 3000, 3500]
      );

      expect(results[0].radius).toBe(100); // t=2000 (relative: 0)
      expect(results[1].radius).toBe(125); // t=2500 (relative: 500)
      expect(results[2].radius).toBe(150); // t=3000 (relative: 1000)
      expect(results[3].radius).toBe(150); // t=3500 (after complete)
    });

    it("handles at values correctly with offset", () => {
      const results = simulateFrames(
        { radius: 100 },
        2000,
        (anim) => {
          // at: 500 means "500ms after shape appeared"
          anim.animateTo({ radius: 150 }, { at: 500, duration: 1000 });
        },
        [2000, 2250, 2500, 3000, 3500]
      );

      expect(results[0].radius).toBe(100); // t=2000, before animation
      expect(results[1].radius).toBe(100); // t=2250, still before
      expect(results[2].radius).toBe(100); // t=2500, animation starts
      expect(results[3].radius).toBe(125); // t=3000, 50% progress
      expect(results[4].radius).toBe(150); // t=3500, complete
    });
  });
});

describe("withOptions API", () => {
  describe("applying options to subsequent segments", () => {
    it("applies duration to all subsequent animateTo calls", () => {
      const anim = new Animatable({ radius: 100 }, 0);
      anim
        .withOptions({ duration: 500 })
        .animateTo({ radius: 150 })
        .animateTo({ radius: 100 });

      // First segment: 0-500
      expect(anim.getCurrentProps(250).radius).toBe(125);
      expect(anim.getCurrentProps(500).radius).toBe(150);

      // Second segment: 500-1000
      expect(anim.getCurrentProps(750).radius).toBe(125);
      expect(anim.getCurrentProps(1000).radius).toBe(100);
    });

    it("applies easing to all subsequent animateTo calls", () => {
      const easeInQuad = (t: number) => t * t;

      const anim = new Animatable({ x: 0 }, 0);
      anim
        .withOptions({ duration: 1000, easing: easeInQuad })
        .animateTo({ x: 100 })
        .animateTo({ x: 200 });

      // At t=500, linear would be 50, but with easeInQuad: 0.5^2 = 0.25
      expect(anim.getCurrentProps(500).x).toBe(25);
    });

    it("allows per-segment override of withOptions", () => {
      const anim = new Animatable({ radius: 100 }, 0);
      anim
        .withOptions({ duration: 1000 })
        .animateTo({ radius: 150 })
        .animateTo({ radius: 100 }, { duration: 500 }); // Override

      // First segment: 0-1000 (from withOptions)
      expect(anim.getCurrentProps(500).radius).toBe(125);
      expect(anim.getCurrentProps(1000).radius).toBe(150);

      // Second segment: 1000-1500 (overridden to 500ms)
      expect(anim.getCurrentProps(1250).radius).toBe(125);
      expect(anim.getCurrentProps(1500).radius).toBe(100);
    });

    it("stacks multiple withOptions calls", () => {
      const anim = new Animatable({ radius: 100 }, 0);
      anim
        .withOptions({ duration: 500 })
        .withOptions({ delay: 100 })
        .animateTo({ radius: 150 });

      // Delay: 100, Duration: 500
      expect(anim.getCurrentProps(0).radius).toBe(100);
      expect(anim.getCurrentProps(100).radius).toBe(100); // Still delayed
      expect(anim.getCurrentProps(350).radius).toBe(125); // 50% through
      expect(anim.getCurrentProps(600).radius).toBe(150); // Complete
    });

    it("is chainable", () => {
      const anim = new Animatable({ radius: 100 }, 0);

      // Should be chainable
      const result = anim
        .withOptions({ duration: 500 })
        .animateTo({ radius: 150 });

      expect(result).toBe(anim);
    });
  });
});

describe("Easing Functions", () => {
  describe("custom easing", () => {
    it("applies easing function to progress", () => {
      const easeInQuad = (t: number) => t * t;

      const anim = new Animatable({ x: 0 }, 0);
      anim.animateTo({ x: 100 }, { duration: 1000, easing: easeInQuad });

      // At t=500, linear progress is 0.5
      // With easeInQuad: 0.5^2 = 0.25
      expect(anim.getCurrentProps(500).x).toBe(25);

      // At t=1000, should still reach target
      expect(anim.getCurrentProps(1000).x).toBe(100);
    });

    it("ease out cubic example", () => {
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const anim = new Animatable({ x: 0 }, 0);
      anim.animateTo({ x: 100 }, { duration: 1000, easing: easeOutCubic });

      // At t=500, linear progress is 0.5
      // With easeOutCubic: 1 - (1-0.5)^3 = 1 - 0.125 = 0.875
      expect(anim.getCurrentProps(500).x).toBe(87.5);
    });
  });

  describe("default easing (linear)", () => {
    it("uses linear interpolation by default", () => {
      const anim = new Animatable({ x: 0 }, 0);
      anim.animateTo({ x: 100 }, { duration: 1000 });

      expect(anim.getCurrentProps(100).x).toBe(10);
      expect(anim.getCurrentProps(250).x).toBe(25);
      expect(anim.getCurrentProps(500).x).toBe(50);
      expect(anim.getCurrentProps(750).x).toBe(75);
      expect(anim.getCurrentProps(900).x).toBe(90);
    });
  });
});

describe("Reverse Option", () => {
  describe("reverse: true", () => {
    it("reverses the animation direction", () => {
      const anim = new Animatable({ x: 0 }, 0);
      anim.animateTo({ x: 100 }, { duration: 1000, reverse: true });

      // Progress is inverted: at t=0, progress=1 (value=100); at t=1000, progress=0 (value=0)
      expect(anim.getCurrentProps(0).x).toBe(100);
      expect(anim.getCurrentProps(500).x).toBe(50);
      expect(anim.getCurrentProps(1000).x).toBe(0);
    });

    it("works with easing", () => {
      const easeInQuad = (t: number) => t * t;

      const anim = new Animatable({ x: 0 }, 0);
      anim.animateTo(
        { x: 100 },
        { duration: 1000, easing: easeInQuad, reverse: true }
      );

      // At t=500: raw=0.5, eased=0.25, reversed=0.75
      expect(anim.getCurrentProps(500).x).toBe(75);
    });
  });
});

describe("Complex Multi-Frame Scenarios", () => {
  describe("frame-by-frame state persistence", () => {
    it("preserves animation state across frames", () => {
      const anim = new Animatable({ radius: 50 }, 0);

      // Frame 1
      anim.animateTo({ radius: 100 }, { duration: 1000 });
      const props1 = anim.getCurrentProps(500);

      expect(props1.radius).toBe(75);

      // Frame 2 (simulate rebuild)
      anim.clearSegments();
      anim.animateTo({ radius: 100 }, { duration: 1000 });
      const props2 = anim.getCurrentProps(750);

      expect(props2.radius).toBe(87.5);

      // Frame 3
      anim.clearSegments();
      anim.animateTo({ radius: 100 }, { duration: 1000 });
      const props3 = anim.getCurrentProps(1000);

      expect(props3.radius).toBe(100);
    });

    it("handles overlapping segments with state persistence", () => {
      const anim = new Animatable({ radius: 50 }, 0);

      // Frames 0-400: first segment only
      for (const t of [0, 100, 200, 300, 400]) {
        anim.clearSegments();
        anim
          .animateTo({ radius: 100 }, { at: 0, duration: 1000 })
          .animateTo({ radius: 50 }, { at: 500, duration: 500 });
        anim.getCurrentProps(t);
      }

      // At t=400, we should be at ~70 (40% of 50->100)
      expect(anim.getCurrentProps(400).radius).toBeCloseTo(70);

      // Frame at t=500: second segment starts, captures current value
      anim.clearSegments();
      anim
        .animateTo({ radius: 100 }, { at: 0, duration: 1000 })
        .animateTo({ radius: 50 }, { at: 500, duration: 500 });
      const props500 = anim.getCurrentProps(500);

      // The second segment should start from 75
      expect(props500.radius).toBeCloseTo(75);

      // Frame at t=750: second segment 50% complete
      anim.clearSegments();
      anim
        .animateTo({ radius: 100 }, { at: 0, duration: 1000 })
        .animateTo({ radius: 50 }, { at: 500, duration: 500 });
      const props750 = anim.getCurrentProps(750);

      // 50% from 75 to 50 = 62.5
      expect(props750.radius).toBeCloseTo(62.5);
    });
  });

  describe("staggered animations", () => {
    it("handles staggered start times", () => {
      // Simulates the pattern from the spec's circle animation
      const results: number[] = [];

      for (let i = 0; i < 5; i++) {
        const anim = new Animatable({ radius: 0 }, 0);
        anim.animateTo(
          { radius: (i + 1) * 10 },
          { delay: i * 50, duration: 250 }
        );

        // Check at t=250 (after delays have passed for some)
        results.push(anim.getCurrentProps(250).radius);
      }

      // i=0: delay=0, starts at 0, at t=250 complete => radius=10
      expect(results[0]).toBe(10);

      // i=1: delay=50, starts at 50, at t=250 that's 200ms in (80%) => radius=16
      expect(results[1]).toBeCloseTo(16);

      // i=2: delay=100, starts at 100, at t=250 that's 150ms in (60%) => radius=18
      expect(results[2]).toBeCloseTo(18);

      // i=3: delay=150, starts at 150, at t=250 that's 100ms in (40%) => radius=16
      expect(results[3]).toBeCloseTo(16);

      // i=4: delay=200, starts at 200, at t=250 that's 50ms in (20%) => radius=10
      expect(results[4]).toBeCloseTo(10);
    });
  });
});

describe("Edge Cases", () => {
  describe("extreme values", () => {
    it("handles very small values", () => {
      const anim = new Animatable({ x: 0.001 }, 0);
      anim.animateTo({ x: 0.002 }, { duration: 1000 });

      expect(anim.getCurrentProps(500).x).toBeCloseTo(0.0015);
    });

    it("handles very large values", () => {
      const anim = new Animatable({ x: 1000000 }, 0);
      anim.animateTo({ x: 2000000 }, { duration: 1000 });

      expect(anim.getCurrentProps(500).x).toBe(1500000);
    });

    it("handles negative values", () => {
      const anim = new Animatable({ x: -100 }, 0);
      anim.animateTo({ x: 100 }, { duration: 1000 });

      expect(anim.getCurrentProps(0).x).toBe(-100);
      expect(anim.getCurrentProps(500).x).toBe(0);
      expect(anim.getCurrentProps(1000).x).toBe(100);
    });

    it("handles animation to same value", () => {
      const anim = new Animatable({ x: 50 }, 0);
      anim.animateTo({ x: 50 }, { duration: 1000 });

      expect(anim.getCurrentProps(0).x).toBe(50);
      expect(anim.getCurrentProps(500).x).toBe(50);
      expect(anim.getCurrentProps(1000).x).toBe(50);
    });
  });

  describe("many segments", () => {
    it("handles many sequential segments", () => {
      const anim = new Animatable({ x: 0 }, 0);

      for (let i = 1; i <= 10; i++) {
        anim.animateTo({ x: i * 10 }, { duration: 100 });
      }

      expect(anim.getCurrentProps(0).x).toBe(0);
      expect(anim.getCurrentProps(500).x).toBe(50);
      expect(anim.getCurrentProps(1000).x).toBe(100);
    });
  });

  describe("concurrent independent properties", () => {
    it("animates independent properties at different rates", () => {
      const anim = new Animatable({ x: 0, y: 0, scale: 1 }, 0);
      anim
        .animateTo({ x: 100 }, { at: 0, duration: 1000 })
        .animateTo({ y: 200 }, { at: 0, duration: 500 })
        .animateTo({ scale: 2 }, { at: 0, duration: 2000 });

      const props = anim.getCurrentProps(500);
      expect(props.x).toBe(50); // 50% of 1000
      expect(props.y).toBe(200); // 100% of 500
      expect(props.scale).toBe(1.25); // 25% of 2000
    });
  });
});

describe("Delay with At Warning", () => {
  describe("console.warn behavior", () => {
    it("warns when some 'at' segments have delay and others do not", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const anim = new Animatable({ radius: 0 }, 0);
      anim
        .animateTo({ radius: 100 }, { at: 500, delay: 500, duration: 500 })
        .animateTo({ radius: 0 }, { at: 1000, duration: 500 }); // No delay

      anim.validate();

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Animation has segments with 'at' property where some have 'delay' and others do not"
        )
      );

      warnSpy.mockRestore();
    });

    it("does not warn when all 'at' segments have delay", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const anim = new Animatable({ radius: 0 }, 0);
      anim
        .animateTo({ radius: 100 }, { at: 500, delay: 500, duration: 500 })
        .animateTo({ radius: 0 }, { at: 1000, delay: 500, duration: 500 });

      anim.validate();

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("does not warn when delay is applied via withOptions", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const anim = new Animatable({ radius: 0 }, 0);
      anim
        .withOptions({ delay: 500 })
        .animateTo({ radius: 100 }, { at: 500, duration: 500 })
        .animateTo({ radius: 0 }, { at: 1000, duration: 500 });

      anim.validate();

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("does not warn when no segments have 'at' property", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const anim = new Animatable({ radius: 0 }, 0);
      anim
        .animateTo({ radius: 100 }, { delay: 500, duration: 500 })
        .animateTo({ radius: 0 }, { duration: 500 });

      anim.validate();

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("does not warn when no 'at' segments have delay", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const anim = new Animatable({ radius: 0 }, 0);
      anim
        .animateTo({ radius: 100 }, { at: 500, duration: 500 })
        .animateTo({ radius: 0 }, { at: 1000, duration: 500 });

      anim.validate();

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("warns only once per instance even with multiple validate calls", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const anim = new Animatable({ radius: 0 }, 0);
      anim
        .animateTo({ radius: 100 }, { at: 500, delay: 500, duration: 500 })
        .animateTo({ radius: 0 }, { at: 1000, duration: 500 });

      // Call multiple times
      anim.validate();
      anim.validate();
      anim.validate();

      expect(warnSpy).toHaveBeenCalledOnce();

      warnSpy.mockRestore();
    });

    it("warns only once per instance even after clearSegments", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const anim = new Animatable({ radius: 0 }, 0);
      anim
        .animateTo({ radius: 100 }, { at: 500, delay: 500, duration: 500 })
        .animateTo({ radius: 0 }, { at: 1000, duration: 500 });

      anim.validate();

      // Clear and rebuild with same problematic pattern
      anim.clearSegments();
      anim
        .animateTo({ radius: 100 }, { at: 500, delay: 500, duration: 500 })
        .animateTo({ radius: 0 }, { at: 1000, duration: 500 });

      anim.validate();

      // Should still only have warned once (per instance lifetime)
      expect(warnSpy).toHaveBeenCalledOnce();

      warnSpy.mockRestore();
    });

    it("ignores segments with at: null when checking for warnings", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const anim = new Animatable({ radius: 0 }, 0);
      anim
        .animateTo({ radius: 100 }, { at: 500, delay: 500, duration: 500 })
        .animateTo({ radius: 0 }, { at: null, duration: 500 }); // at: null is ignored

      anim.validate();

      // Should not warn because at: null segments are excluded
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
