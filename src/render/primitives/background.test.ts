import { beforeEach, describe, expect, it } from "vitest";
import { createSpyMockContext } from "./testMockCanvasContext";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

describe("background rendering", () => {
  it("renders a background to the full dimensions of the canvas to the specified color", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.background({
          color: "#faf0e6",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.fillStyle).toBe("#faf0e6");
    expect(mockContext.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });
});
