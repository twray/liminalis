import { describe, expect, it, vi } from "vitest";
import { defineMidiVisual, defineVisual } from "./componentFactories";
import Visualisation from "./Visualisation";

describe("componentFactories", () => {
  const mockContext = {} as CanvasRenderingContext2D;

  it("defineVisual creates a props-first visual component", () => {
    const renderer = vi.fn();

    const ringVisual = defineVisual<{ radius: number }>((params) => {
      renderer(params);
    });

    const ring = ringVisual({ radius: 42 }).show();
    const visualisation = new Visualisation();

    visualisation.add("ring", ring);
    visualisation.renderObjects(mockContext, 800, 600, 0);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith(
      expect.objectContaining({
        props: { radius: 42 },
        status: "visible",
      }),
    );
  });

  it("defineMidiVisual creates a props-first midi visual component", () => {
    const renderer = vi.fn();

    const noteVisual = defineMidiVisual<{ note: string }>((params) => {
      renderer(params);
    });

    const note = noteVisual({ note: "C4" }).attack(0.7);
    const visualisation = new Visualisation();

    visualisation.add("note", note);
    visualisation.renderObjects(mockContext, 800, 600, 0);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith(
      expect.objectContaining({
        props: { note: "C4" },
        status: "sustained",
        attackValue: 0.7,
      }),
    );
  });

  it("visual alias exposes the same component-definition API", async () => {
    vi.resetModules();

    const { visual } = await import("./index");

    const renderer = vi.fn();

    const ringVisual = visual<{ radius: number }>((params) => {
      renderer(params);
    });

    const ring = ringVisual({ radius: 64 }).show();
    const visualisation = new Visualisation();

    visualisation.add("ring-alias", ring);
    visualisation.renderObjects(mockContext, 800, 600, 0);

    expect(renderer).toHaveBeenCalledWith(
      expect.objectContaining({ props: { radius: 64 }, status: "visible" }),
    );
  });

  it("midiVisual alias supports no-props components", async () => {
    vi.resetModules();

    const { midiVisual } = await import("./index");

    const renderer = vi.fn();

    const pulseVisual = midiVisual(({ status, draw }) => {
      renderer({ status, draw });
    });

    const pulse = pulseVisual().attack(0.5);
    const visualisation = new Visualisation();

    visualisation.add("pulse", pulse);
    visualisation.renderObjects(mockContext, 800, 600, 0);

    expect(renderer).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sustained" }),
    );
  });
});
