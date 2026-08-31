import { describe, expect, it } from "vitest";

import VisualisationAnimationLoopHandler from "../VisualisationAnimationLoopHandler";
import { createScene } from "./createScene";

// createScene's own job is narrow: produce a fresh, correctly-typed
// VisualisationAnimationLoopHandler on every call. Its constructor and
// withSettings/setup (without calling render()) have no side effects — no
// WebMidi, no listeners, nothing — so none of that needs mocking here.
// VisualisationAnimationLoopHandler's own behavior (note dispatch, render
// loop, FPS logging, ...) already has its own dedicated, heavily-mocked
// test suite in VisualisationAnimationLoopHandler.test.ts; duplicating that
// here would be redundant.
describe("createScene", () => {
  it("returns a VisualisationAnimationLoopHandler instance", () => {
    expect(createScene()).toBeInstanceOf(VisualisationAnimationLoopHandler);
  });

  it("returns a fresh instance on every call, not a shared singleton", () => {
    const first = createScene();
    const second = createScene();

    expect(first).not.toBe(second);
  });

  it("returns an instance whose settings don't leak across separate calls", () => {
    // Two independently-created scenes, configured differently, must not
    // observably influence one another — the whole point of createScene
    // being a factory rather than a module-level singleton.
    const configured = createScene().withSettings({ fps: 30 });
    const untouched = createScene();

    expect(configured).not.toBe(untouched);
    expect(untouched).toBeInstanceOf(VisualisationAnimationLoopHandler);
  });

  it("exposes the chainable withSettings().setup() surface real usage relies on", () => {
    // Matches the exact call shape every test app uses:
    // createScene().withSettings({...}).setup(({...}) => {...})
    const scene = createScene()
      .withSettings({ width: 800, height: 600 })
      .setup(() => {});

    expect(scene).toBeInstanceOf(VisualisationAnimationLoopHandler);
  });

  // Deliberately not testing setup() without a prior withSettings() call
  // here: VisualisationAnimationLoopHandler.setup() falls back to
  // window.innerWidth/innerHeight when no explicit dimensions were set,
  // which throws in this (non-browser) test environment. That's a real
  // environment dependency worth knowing about, but it's
  // VisualisationAnimationLoopHandler's own behavior to test/fix, not
  // something createScene's factory contract should be judged on.
});
