import { afterEach, describe, expect, it, vi } from "vitest";
import Scene from "./Scene";
import Visual from "./Visual";

describe("Scene", () => {
  const mockContext = {} as CanvasRenderingContext2D;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds, checks, and removes objects by instance reference", () => {
    const scene = new Scene();
    const visual = new Visual().withRenderer(vi.fn());

    scene.add(visual);

    expect(scene.has(visual)).toBe(true);

    scene.remove(visual);

    expect(scene.has(visual)).toBe(false);
  });

  it("marks objects as permanent when adding permanently", () => {
    const scene = new Scene();
    const visual = new Visual().withRenderer(vi.fn());

    scene.addPermanently(visual);

    expect(scene.has(visual)).toBe(true);
    expect(visual.isPermanent).toBe(true);
  });

  it("creates independent clones for keyed registration", () => {
    const scene = new Scene();
    const source = new Visual<{ note: string }>({
      note: "C4",
    }).withRenderer(vi.fn());

    const c4 = scene.addWithKey("C4", source);
    const d4 = scene.addWithKey("D4", source);

    expect(c4).not.toBe(source);
    expect(d4).not.toBe(source);
    expect(c4).not.toBe(d4);
    expect(c4.props).toEqual({ note: "C4" });
    expect(d4.props).toEqual({ note: "C4" });
  });

  it("supports permanent keyed registration", () => {
    const scene = new Scene();

    const keyed = scene.addPermanentlyWithKey(
      "C4",
      new Visual().withRenderer(vi.fn()),
    );

    expect(scene.hasKey("C4")).toBe(true);
    expect(scene.getByKey("C4")).toBe(keyed);
    expect(keyed.isPermanent).toBe(true);
  });

  it("supports keyed lookup and keyed removal", () => {
    const scene = new Scene();
    const keyed = scene.addWithKey("C4", new Visual().withRenderer(vi.fn()));

    expect(scene.getByKey("C4")).toBe(keyed);
    expect(scene.hasKey("C4")).toBe(true);

    scene.removeByKey("C4");

    expect(scene.hasKey("C4")).toBe(false);
    expect(scene.has(keyed)).toBe(false);
  });

  it("warns when requesting a previously used key that is no longer active", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scene = new Scene();

    scene.addWithKey("C4", new Visual().withRenderer(vi.fn()));
    scene.removeByKey("C4");

    expect(scene.getByKey("C4")).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('object with key "C4" was requested'),
    );
  });

  it("warns when registered scene objects exceed the configured maximum", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scene = new Scene(1);

    scene.add(new Visual().withRenderer(vi.fn()));
    scene.add(new Visual().withRenderer(vi.fn()));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Warning: Over 1 are registered."),
    );
  });

  it("throws when renderObjects is called without a context", () => {
    const scene = new Scene();

    expect(() =>
      scene.renderObjects(
        undefined as unknown as CanvasRenderingContext2D,
        800,
        600,
        0,
      ),
    ).toThrow("A CanvasRenderingContext2D instance must be provided");
  });

  it("renders active and permanent objects", () => {
    const activeVisual = new Visual(undefined, vi.fn()).attack(1);
    const permanentVisual = new Visual(undefined, vi.fn()).setIsPermanent(true);

    const activeRenderSpy = vi.spyOn(activeVisual, "renderIn");
    const permanentRenderSpy = vi.spyOn(permanentVisual, "renderIn");

    const scene = new Scene();
    scene.add(activeVisual);
    scene.add(permanentVisual);

    scene.renderObjects(mockContext, 800, 600, 0);

    expect(activeRenderSpy).toHaveBeenCalledTimes(1);
    expect(permanentRenderSpy).toHaveBeenCalledTimes(1);
  });

  it("removes released non-permanent objects during cleanup", () => {
    const visual = new Visual(undefined, vi.fn());
    const renderSpy = vi.spyOn(visual, "renderIn");

    visual.isReleasing = true;
    visual.releasePeriod = 100;
    visual.timeReleased = new Date(Date.now() - 1000);

    const scene = new Scene();
    scene.add(visual);

    scene.renderObjects(mockContext, 800, 600, 1000);

    expect(renderSpy).not.toHaveBeenCalled();
    expect(visual.markedForRemoval).toBe(true);
    expect(visual.isReleasing).toBe(false);

    scene.cleanUp();

    expect(scene.has(visual)).toBe(false);
  });
});
