import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Visual from "./Visual";
import Visualisation from "./Visualisation";

describe("MidiVisual", () => {
  const mockContext = {} as CanvasRenderingContext2D;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not render by default and starts rendering after attack", () => {
    const renderer = vi.fn();
    const midiVisual = new Visual<{ note: string }>(
      {
        note: "C4",
      },
      renderer,
    );

    const visualisation = new Visualisation();
    visualisation.add("note", midiVisual);

    visualisation.renderObjects(mockContext, 800, 600, 0);
    expect(renderer).not.toHaveBeenCalled();

    midiVisual.attack(0.75);
    visualisation.renderObjects(mockContext, 800, 600, 16);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith(
      expect.objectContaining({
        props: { note: "C4" },
        status: "sustained",
        attackValue: 0.75,
        releaseFactor: 1,
        timeAttacked: 0,
        timeReleased: null,
      }),
    );
  });

  it("delays release transition by sustain period", () => {
    const renderer = vi.fn();
    const midiVisual = new Visual(undefined, renderer);
    const visualisation = new Visualisation();

    visualisation.add("sustained", midiVisual);

    midiVisual.attack(1).sustain(200).release(100);

    vi.advanceTimersByTime(199);
    visualisation.renderObjects(mockContext, 800, 600, 199);

    expect(midiVisual.isSustaining).toBe(true);
    expect(midiVisual.isReleasing).toBe(false);
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sustained",
        releasePeriod: 0,
      }),
    );

    vi.advanceTimersByTime(1);
    visualisation.renderObjects(mockContext, 800, 600, 200);

    expect(midiVisual.isSustaining).toBe(false);
    expect(midiVisual.isReleasing).toBe(true);
    expect(renderer).toHaveBeenCalledTimes(2);
    expect(renderer).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "releasing",
        releasePeriod: 100,
        timeReleased: 200,
      }),
    );
  });

  it("marks non-permanent visuals for cleanup once release completes", () => {
    const renderer = vi.fn();
    const midiVisual = new Visual(undefined, renderer).attack(0.8);
    const visualisation = new Visualisation();

    visualisation.add("transient", midiVisual);

    midiVisual.release(100);

    vi.advanceTimersByTime(0);
    visualisation.renderObjects(mockContext, 800, 600, 0);
    expect(renderer).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    visualisation.renderObjects(mockContext, 800, 600, 100);
    visualisation.cleanUp();

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(midiVisual.isReleasing).toBe(false);
    expect(visualisation.animatableObjects.has("transient")).toBe(false);
  });

  it("keeps permanent visuals registered after release completes", () => {
    const renderer = vi.fn();
    const midiVisual = new Visual(undefined, renderer).attack(1);
    const visualisation = new Visualisation();

    visualisation.addPermanently("persistent", midiVisual);

    midiVisual.release(100);

    vi.advanceTimersByTime(0);
    visualisation.renderObjects(mockContext, 800, 600, 0);

    vi.advanceTimersByTime(100);
    visualisation.renderObjects(mockContext, 800, 600, 100);
    visualisation.cleanUp();

    expect(visualisation.animatableObjects.has("persistent")).toBe(true);
    expect(renderer).toHaveBeenCalledTimes(2);
  });
});
