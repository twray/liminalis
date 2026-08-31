import { describe, expect, it, vi } from "vitest";
import type { DrawMethods } from "./types";

import { createLayer } from "./createLayer";

describe("createLayer", () => {
  it("creates a props-first factory that returns a LayerComponent", () => {
    const renderer = vi.fn();
    const logo = createLayer<{ fillStyle: string }>(renderer);

    const component = logo({ fillStyle: "red" });

    expect(component.props).toEqual({ fillStyle: "red" });
    expect(typeof component.render).toBe("function");
  });

  it("supports optional props for an empty props type", () => {
    const renderer = vi.fn();
    const background = createLayer(renderer);

    const component = background();

    expect(component.props).toBeUndefined();
  });

  it("does not invoke the renderer until render(ambient) is called", () => {
    const renderer = vi.fn();
    const logo = createLayer<{ fillStyle: string }>(renderer);

    logo({ fillStyle: "red" });

    expect(renderer).not.toHaveBeenCalled();
  });

  it("merges the ambient DrawMethods with the bound props when rendered", () => {
    const renderer = vi.fn();
    const logo = createLayer<{ fillStyle: string }>(renderer);
    const component = logo({ fillStyle: "red" });

    const ambientCircle = vi.fn();
    const ambient = { circle: ambientCircle } as unknown as DrawMethods;

    component.render(ambient);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith({
      circle: ambientCircle,
      props: { fillStyle: "red" },
    });
  });

  it("lets the render function call ambient primitives passed in", () => {
    const ambientCircle = vi.fn();
    const logo = createLayer<{ fillStyle: string }>(({ props, circle }) => {
      circle({ cx: 0, cy: 0, radius: 10, fillStyle: props.fillStyle });
    });
    const component = logo({ fillStyle: "blue" });

    component.render({ circle: ambientCircle } as unknown as DrawMethods);

    expect(ambientCircle).toHaveBeenCalledWith({
      cx: 0,
      cy: 0,
      radius: 10,
      fillStyle: "blue",
    });
  });

  it("re-invokes the renderer on each render call", () => {
    const renderer = vi.fn();
    const logo = createLayer<{ fillStyle: string }>(renderer);
    const component = logo({ fillStyle: "red" });

    component.render({} as DrawMethods);
    component.render({} as DrawMethods);

    expect(renderer).toHaveBeenCalledTimes(2);
  });
});
