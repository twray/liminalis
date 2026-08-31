import { describe, expect, it, vi } from "vitest";
import Scene from "../Scene";
import { visual } from "./visual";

describe("visual factory", () => {
  const mockContext = {} as CanvasRenderingContext2D;

  it("creates reusable component functions with props-first invocation", () => {
    const renderer = vi.fn();
    const animatable = visual<{ squareDimensions: number }>(({ props }) => {
      renderer(props.squareDimensions);
    });

    const scene = new Scene();
    scene.add(animatable({ squareDimensions: 200 }).attack(0.7));

    scene.renderObjects(mockContext, 800, 600, 0);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith(200);
  });

  it("supports optional props for empty props type", () => {
    const renderer = vi.fn();
    const animatable = visual(({ status }) => {
      renderer(status);
    });

    const scene = new Scene();
    scene.add(animatable().attack(1));

    scene.renderObjects(mockContext, 800, 600, 0);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith("sustained");
  });
});
