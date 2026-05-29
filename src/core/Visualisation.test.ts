import { afterEach, describe, expect, it, vi } from "vitest";
import Visual from "./Visual";
import Visualisation from "./Visualisation";

describe("Visualisation", () => {
  const mockContext = {} as CanvasRenderingContext2D;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds and retrieves registered objects by id", () => {
    const visualisation = new Visualisation();
    const visual = new Visual().withRenderer(vi.fn());

    visualisation.add("note", visual);

    expect(visualisation.get("note")).toBe(visual);
    expect(visualisation.idsOfAllAnimatableObjectsCreated).toEqual(["note"]);
  });

  it("marks objects as permanent when adding permanently", () => {
    const visualisation = new Visualisation();
    const visual = new Visual().withRenderer(vi.fn());

    visualisation.addPermanently("persistent-note", visual);

    expect(visualisation.get("persistent-note")).toBe(visual);
    expect(visual.isPermanent).toBe(true);
  });

  it("warns when requesting a previously created object that has been removed", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const visualisation = new Visualisation();
    const visual = new Visual().withRenderer(vi.fn());

    visualisation.add("temp-note", visual);
    visualisation.animatableObjects.delete("temp-note");

    expect(visualisation.get("temp-note")).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('object with id "temp-note" was requested'),
    );
  });

  it("does not warn when requesting an id that has never been created", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const visualisation = new Visualisation();

    expect(visualisation.get("never-created")).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns when registered objects exceed the configured maximum", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const visualisation = new Visualisation(1);

    visualisation.add("one", new Visual().withRenderer(vi.fn()));
    visualisation.add("two", new Visual().withRenderer(vi.fn()));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Warning: Over 1 are registered."),
    );
  });

  it("throws when renderObjects is called without a context", () => {
    const visualisation = new Visualisation();

    expect(() =>
      visualisation.renderObjects(undefined as unknown as CanvasRenderingContext2D, 800, 600, 0),
    ).toThrow("A CanvasRenderingContext2D instance must be provided");
  });

  it("renders active objects and permanent objects", () => {
    const activeVisual = new Visual(undefined, vi.fn()).attack(1);
    const permanentVisual = new Visual(undefined, vi.fn()).setIsPermanent(true);

    const activeRenderSpy = vi.spyOn(activeVisual, "renderIn");
    const permanentRenderSpy = vi.spyOn(permanentVisual, "renderIn");

    const visualisation = new Visualisation();
    visualisation.add("active", activeVisual);
    visualisation.add("persistent", permanentVisual);

    visualisation.renderObjects(mockContext, 800, 600, 0);

    expect(activeRenderSpy).toHaveBeenCalledTimes(1);
    expect(permanentRenderSpy).toHaveBeenCalledTimes(1);
  });

  it("marks released non-permanent objects for removal and removes them on cleanup", () => {
    const visual = new Visual(undefined, vi.fn());
    const renderSpy = vi.spyOn(visual, "renderIn");

    visual.isReleasing = true;
    visual.releasePeriod = 100;
    visual.timeReleased = new Date(Date.now() - 1000);

    const visualisation = new Visualisation();
    visualisation.add("released", visual);

    visualisation.renderObjects(mockContext, 800, 600, 1000);

    expect(renderSpy).not.toHaveBeenCalled();
    expect(visual.markedForRemoval).toBe(true);
    expect(visual.isReleasing).toBe(false);

    visualisation.cleanUp();

    expect(visualisation.animatableObjects.has("released")).toBe(false);
  });

  it("keeps permanent objects during cleanup even if marked for removal", () => {
    const visualisation = new Visualisation();
    const visual = new Visual(undefined, vi.fn()).setIsPermanent(true);

    visual.markedForRemoval = true;
    visualisation.add("persistent", visual);

    visualisation.cleanUp();

    expect(visualisation.animatableObjects.has("persistent")).toBe(true);
  });
});