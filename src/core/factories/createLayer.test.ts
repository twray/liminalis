import { describe, expect, it, vi } from "vitest";
import type { ContainerDrawAPI, DrawAPI } from "../../render/types";

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

  it("merges the ambient DrawApi with the bound props when rendered", () => {
    const renderer = vi.fn();
    const logo = createLayer<{ fillStyle: string }>(renderer);
    const component = logo({ fillStyle: "red" });

    const ambientCircle = vi.fn();
    const ambient = { circle: ambientCircle } as unknown as ContainerDrawAPI;

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

    component.render({ circle: ambientCircle } as unknown as ContainerDrawAPI);

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

    component.render({} as ContainerDrawAPI);
    component.render({} as ContainerDrawAPI);

    expect(renderer).toHaveBeenCalledTimes(2);
  });

  it("provides an empty props object if none is supplied within the render call", () => {
    const renderer = vi.fn();
    const logo = createLayer<{ fillStyle?: string }>(renderer);
    const component = logo();

    component.render({} as ContainerDrawAPI);

    expect(renderer).toHaveBeenCalledWith({
      props: {},
    });
  });
});
