import { describe, expect, it, vi } from "vitest";

import type { ReactiveContainerDrawAPI } from "../../render/types";
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
      render: { circle: ambientCircle },
      current: { status: "idle", attackValue: 0, releasePeriod: 0 },
      timeOf: { attack: null, release: null },
    } as unknown as ReactiveContainerDrawAPI;

    component.render(ambient);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith({
      render: { circle: ambientCircle },
      current: { status: "idle", attackValue: 0, releasePeriod: 0 },
      timeOf: { attack: null, release: null },
      props: { fillStyle: "red" },
    });
  });

  it("lets the render function call ambient primitives passed in", () => {
    const ambientCircle = vi.fn();
    const logo = createReactiveLayer<{ fillStyle: string }>(
      ({ props, render: { circle } }) => {
        circle({ cx: 0, cy: 0, radius: 10, fillStyle: props.fillStyle });
      },
    );
    const component = logo({ fillStyle: "blue" });

    component.render({
      render: { circle: ambientCircle },
    } as unknown as ReactiveContainerDrawAPI);

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

    component.render({
      current: { status: "idle" },
    } as unknown as ReactiveContainerDrawAPI);
    component.render({
      current: { status: "sustained" },
    } as unknown as ReactiveContainerDrawAPI);

    expect(renderer).toHaveBeenCalledTimes(2);

    expect(renderer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ current: { status: "idle" } }),
    );
    expect(renderer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ current: { status: "sustained" } }),
    );
  });

  it("provides an empty props object if none is supplied within the render call", () => {
    const renderer = vi.fn();
    const logo = createReactiveLayer<{ fillStyle?: string }>(renderer);
    const component = logo();

    component.render({} as ReactiveContainerDrawAPI);

    expect(renderer).toHaveBeenCalledWith({
      props: {},
    });
  });
});
