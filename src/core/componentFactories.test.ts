import { describe, expect, it, vi } from "vitest";
import Visualisation from "./Visualisation";
import { defineVisual } from "./componentFactories";

describe("midiVisual factory", () => {
  const mockContext = {} as CanvasRenderingContext2D;

  it("creates reusable component functions with props-first invocation", () => {
    const renderer = vi.fn();
    const animatable = defineVisual<{ squareDimensions: number }>(
      ({ props }) => {
        renderer(props.squareDimensions);
      },
    );

    const visualisation = new Visualisation();
    visualisation.add(
      "note",
      animatable({ squareDimensions: 200 }).attack(0.7),
    );

    visualisation.renderObjects(mockContext, 800, 600, 0);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith(200);
  });

  it("supports optional props for empty props type", () => {
    const renderer = vi.fn();
    const animatable = defineVisual(({ status }) => {
      renderer(status);
    });

    const visualisation = new Visualisation();
    visualisation.add("note", animatable().attack(1));

    visualisation.renderObjects(mockContext, 800, 600, 0);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith("sustained");
  });
});
