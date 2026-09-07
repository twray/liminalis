import { describe, expect, it, vi } from "vitest";

import { ContainerDrawAPI, DrawAPI } from "../../render/types";
import { ReactiveProps } from "../../types";
import { createReactiveLayer } from "./createReactiveLayer";

describe("createReactiveLayer", () => {
  it("creates a props-first factory that returns a ReactiveLayerComponent", () => {
    const renderer = vi.fn();
    const logo = createReactiveLayer<{ strokeStyle: string }>(renderer);

    const component = logo({ strokeStyle: "blue" });

    expect(component.props).toEqual({ strokeStyle: "blue" });
    expect(typeof component.render).toBe("function");
  });

  it("supports optional props for an empty props type", () => {
    const renderer = vi.fn();
    const background = createReactiveLayer(renderer);

    const component = background();

    expect(component.props).toBeUndefined();
  });

  it("does not invoke the renderer until render(ambient) is called", () => {
    const renderer = vi.fn();
    const logo = createReactiveLayer<{ fillStyle: string }>(renderer);

    logo({ fillStyle: "red" });

    expect(renderer).not.toHaveBeenCalled();
  });

  it("merges the ambient DrawAPI & ReactiveProps with the bound props when rendered", () => {
    const renderer = vi.fn();
    const logo = createReactiveLayer<{ fillStyle: string }>(renderer);
    const component = logo({ fillStyle: "red" });

    const ambientCircle = vi.fn();

    const ambient = {
      circle: ambientCircle,
      status: "idle",
      attackValue: 0,
      releasePeriod: 0,
      timeAttacked: null,
      timeReleased: null,
    } as unknown as ContainerDrawAPI & ReactiveProps;

    component.render(ambient);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith({
      circle: ambientCircle,
      status: "idle",
      attackValue: 0,
      releasePeriod: 0,
      timeAttacked: null,
      timeReleased: null,
      props: { fillStyle: "red" },
    });
  });

  it("lets the render function call ambient primitives passed in", () => {
    const ambientCircle = vi.fn();
    const logo = createReactiveLayer<{ fillStyle: string }>(
      ({ props, circle }) => {
        circle({ cx: 0, cy: 0, radius: 10, fillStyle: props.fillStyle });
      },
    );
    const component = logo({ fillStyle: "blue" });

    component.render({ circle: ambientCircle } as unknown as ContainerDrawAPI &
      ReactiveProps);

    expect(ambientCircle).toHaveBeenCalledWith({
      cx: 0,
      cy: 0,
      radius: 10,
      fillStyle: "blue",
    });
  });

  it("re-invokes the renderer with new reactive updates on each render call", () => {
    const renderer = vi.fn();
    const logo = createReactiveLayer<{ fillStyle: string }>(renderer);
    const component = logo({ fillStyle: "red" });

    component.render({ status: "idle" } as unknown as ContainerDrawAPI &
      ReactiveProps);
    component.render({ status: "sustained" } as unknown as ContainerDrawAPI &
      ReactiveProps);

    expect(renderer).toHaveBeenCalledTimes(2);

    expect(renderer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "idle" }),
    );
    expect(renderer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "sustained" }),
    );
  });

  it("provides an empty props object if none is supplied within the render call", () => {
    const renderer = vi.fn();
    const logo = createReactiveLayer<{ fillStyle?: string }>(renderer);
    const component = logo();

    component.render({} as ContainerDrawAPI & ReactiveProps);

    expect(renderer).toHaveBeenCalledWith({
      props: {},
    });
  });
});
