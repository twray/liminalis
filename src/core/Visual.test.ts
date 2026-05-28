import { describe, expect, it, vi } from "vitest";
import Visual from "./Visual";
import Visualisation from "./Visualisation";

describe("Visual", () => {
  const mockContext = {} as CanvasRenderingContext2D;

  it("is hidden by default and does not render until shown", () => {
    const renderer = vi.fn();
    const visual = new Visual().withRenderer(renderer);
    const visualisation = new Visualisation();

    visualisation.add("hidden", visual);
    visualisation.renderObjects(mockContext, 800, 600, 0);

    expect(renderer).not.toHaveBeenCalled();
    expect(visual.shouldRender()).toBe(false);
  });

  it("renders after show() and provides visual lifecycle props", () => {
    const renderer = vi.fn();

    const visual = new Visual<{ radius: number }>({ radius: 42 })
      .withRenderer(renderer)
      .show();

    const visualisation = new Visualisation();
    visualisation.add("visible", visual);
    visualisation.renderObjects(mockContext, 800, 600, 0);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith(
      expect.objectContaining({
        props: { radius: 42 },
        status: "visible",
        timeShown: 0,
        timeHidden: null,
      }),
    );
  });

  it("marks non-permanent visuals for cleanup after hide()", () => {
    const renderer = vi.fn();

    const visual = new Visual().withRenderer(renderer).show();
    const visualisation = new Visualisation();

    visualisation.add("transient", visual);
    visualisation.renderObjects(mockContext, 800, 600, 0);

    visual.hide();
    visualisation.renderObjects(mockContext, 800, 600, 16);
    visualisation.cleanUp();

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(visualisation.animatableObjects.has("transient")).toBe(false);
  });

  it("keeps permanent visuals registered when hidden", () => {
    const renderer = vi.fn();

    const visual = new Visual().withRenderer(renderer).show();
    const visualisation = new Visualisation();

    visualisation.addPermanently("persistent", visual);
    visualisation.renderObjects(mockContext, 800, 600, 0);

    visual.hide();
    visualisation.renderObjects(mockContext, 800, 600, 16);
    visualisation.cleanUp();

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(visualisation.animatableObjects.has("persistent")).toBe(true);
  });
});
