import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAnimatableLike } from "../../types";
import { createSpyMockContext } from "./testMockCanvasContext";
import type { Bounds, DrawAPI, RectProps } from "../types";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

describe("rect rendering", () => {
  it("resolves 'center' to center of bounds", async () => {
    // Import dynamically to get fresh module
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const executeDrawCallback = drawContext.executeDrawCallback;

    executeDrawCallback(
      (d) => {
        d.rect({
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          rotate: 45,
          rotateOrigin: "center",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Center of rect at (100,100) with size 200x100 is (200, 150)
    // With rotation, should translate to center, rotate, translate back
    expect(mockContext.translate).toHaveBeenCalledWith(200, 150);
    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    expect(mockContext.translate).toHaveBeenCalledWith(-200, -150);
  });

  it("resolves Point2D {x: 0, y: 0} to top-left corner (local coordinates)", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          rotate: 90,
          rotateOrigin: { x: 0, y: 0 }, // Local top-left
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Local (0, 0) maps to world (100, 100) - the shape's top-left
    expect(mockContext.translate).toHaveBeenCalledWith(100, 100);
    expect(mockContext.rotate).toHaveBeenCalledWith((90 * Math.PI) / 180);
    expect(mockContext.translate).toHaveBeenCalledWith(-100, -100);
  });

  it("resolves Point2D to shape's local coordinate system", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 200,
          y: 200,
          width: 200,
          height: 200,
          rotate: 45,
          rotateOrigin: { x: 100, y: 100 }, // Local center
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Rect at (200,200) with local origin (100, 100) = world (300, 300)
    expect(mockContext.translate).toHaveBeenCalledWith(300, 300);
    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    expect(mockContext.translate).toHaveBeenCalledWith(-300, -300);
  });

  it("resolves Point2D {x: width, y: 0} to top-right corner", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 200,
          y: 200,
          width: 200,
          height: 200,
          rotate: 45,
          rotateOrigin: { x: 200, y: 0 }, // Local top-right
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Rect at (200,200) with local origin (200, 0) = world (400, 200)
    expect(mockContext.translate).toHaveBeenCalledWith(400, 200);
    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    expect(mockContext.translate).toHaveBeenCalledWith(-400, -200);
  });
  it("applies uniform scale with scale prop", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          scale: 2,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Should scale around center (50, 50)
    expect(mockContext.translate).toHaveBeenCalledWith(50, 50);
    expect(mockContext.scale).toHaveBeenCalledWith(2, 2);
    expect(mockContext.translate).toHaveBeenCalledWith(-50, -50);
  });

  it("applies non-uniform scale with scaleX and scaleY", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          scaleX: 2,
          scaleY: 0.5,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.scale).toHaveBeenCalledWith(2, 0.5);
  });

  it("scaleX/scaleY override uniform scale", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          scale: 3,
          scaleX: 2,
          scaleY: 1,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // scaleX/scaleY should take precedence over scale
    expect(mockContext.scale).toHaveBeenCalledWith(2, 1);
  });

  it("does not apply scale when scale is 1", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          scale: 1,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.scale).not.toHaveBeenCalled();
  });
  it("applies scale before rotation", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const translateCalls: { x: number; y: number }[] = [];
    mockContext.translate = vi.fn((x, y) => {
      translateCalls.push({ x, y });
    });

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          scale: 2,
          rotate: 45,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Scale is applied first, then rotation
    // Both use center (50, 50) by default
    expect(mockContext.scale).toHaveBeenCalled();
    expect(mockContext.rotate).toHaveBeenCalled();

    // Verify the order: scale translate calls come before rotate translate calls
    // Scale: translate(50,50), scale, translate(-50,-50)
    // Rotate: translate(50,50), rotate, translate(-50,-50)
    expect(translateCalls.length).toBe(4);
  });
  it("draws stroke at original bounds when strokeAlignment is 'center' (default)", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          strokeWidth: 10,
          strokeAlignment: "center",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Stroke should use original bounds (100, 100, 200, 100)
    expect(mockContext.roundRect).toHaveBeenCalledWith(100, 100, 200, 100, 0);
  });

  it("draws stroke inset when strokeAlignment is 'inside'", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          fillStyle: "#333",
          strokeStyle: "#333",
          strokeWidth: 10,
          strokeAlignment: "inside",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Fill uses original bounds
    expect(mockContext.roundRect).toHaveBeenCalledWith(100, 100, 200, 100, 0);
    // Stroke should be inset by strokeWidth/2 = 5
    // x+5, y+5, width-10, height-10
    expect(mockContext.roundRect).toHaveBeenCalledWith(105, 105, 190, 90, 0);
  });

  it("draws stroke outset when strokeAlignment is 'outside'", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          fillStyle: "#333",
          strokeStyle: "#333",
          strokeWidth: 10,
          strokeAlignment: "outside",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Fill uses original bounds
    expect(mockContext.roundRect).toHaveBeenCalledWith(100, 100, 200, 100, 0);
    // Stroke should be outset by strokeWidth/2 = 5
    // x-5, y-5, width+10, height+10
    expect(mockContext.roundRect).toHaveBeenCalledWith(95, 95, 210, 110, 0);
  });

  it("applies a uniform numeric cornerRadius to all four corners", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          fillStyle: "#333",
          cornerRadius: 12,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.roundRect).toHaveBeenCalledWith(0, 0, 100, 50, 12);
  });

  it("applies independent per-corner radii when cornerRadius is a Corners object", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          fillStyle: "#333",
          cornerRadius: {
            topLeft: 1,
            topRight: 2,
            bottomLeft: 3,
            bottomRight: 4,
          },
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // roundRect's 4-value array is clockwise from top-left --
    // [topLeft, topRight, bottomRight, bottomLeft] -- same convention as
    // CSS border-radius shorthand, so bottomRight (4) precedes bottomLeft (3).
    expect(mockContext.roundRect).toHaveBeenCalledWith(
      0,
      0,
      100,
      50,
      [1, 2, 4, 3],
    );
  });

  it("does not render when width is below the minimum visible size", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({ x: 0, y: 0, width: 0.4, height: 50, fillStyle: "#333" });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.roundRect).not.toHaveBeenCalled();
  });

  it("does not render when height is below the minimum visible size", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({ x: 0, y: 0, width: 100, height: 0.4, fillStyle: "#333" });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.roundRect).not.toHaveBeenCalled();
  });

  it("does not draw a fill when fillStyle is transparent", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          fillStyle: "transparent",
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.fill).not.toHaveBeenCalled();
    expect(mockContext.stroke).toHaveBeenCalled();
  });
});
describe("framed clipping for rect", () => {
  it("returns an Animatable when using the frame callback", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const clipMaskRef: { current: IAnimatableLike<RectProps> | null } = {
      current: null,
    };

    drawContext.executeDrawCallback(
      (d) => {
        clipMaskRef.current = d.rect(
          { x: 100, y: 100, width: 200, height: 200 },
          () => {
            d.circle({ cx: 100, cy: 100, radius: 50, fillStyle: "red" });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(clipMaskRef.current).not.toBeNull();

    if (!clipMaskRef.current) {
      throw new Error("Expected rect() to return an Animatable clip mask");
    }

    expect(typeof clipMaskRef.current.animateTo).toBe("function");
  });

  it("uses rect path as a clip mask for nested primitives", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect(
          {
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            fillStyle: "#00f",
            strokeStyle: "#0f0",
            strokeWidth: 4,
          },
          () => {
            d.circle({
              cx: 100,
              cy: 100,
              radius: 50,
              fillStyle: "red",
            });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.clip).toHaveBeenCalled();
    expect(mockContext.roundRect).toHaveBeenCalledWith(100, 100, 200, 200, 0);
    expect(mockContext.ellipse).toHaveBeenCalled();

    // Rect itself is not rendered when callback clipping mode is used.
    expect(mockContext.stroke).toHaveBeenCalledTimes(1);
    expect(mockContext.fill).toHaveBeenCalledTimes(1);
  });

  it("supports nested rect clip scopes", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({ x: 100, y: 100, width: 240, height: 240 }, () => {
          d.rect({ x: 140, y: 140, width: 160, height: 160 }, () => {
            d.circle({
              cx: 140,
              cy: 140,
              radius: 90,
              fillStyle: "red",
            });
          });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // One clip call per active clipping mask.
    expect(mockContext.clip).toHaveBeenCalledTimes(2);
    expect(mockContext.ellipse).toHaveBeenCalled();
    expect(mockContext.fill).toHaveBeenCalledTimes(1);
  });

  it("animates the clip path when the returned rect animates", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({ x: 100, y: 100, width: 200, height: 200 }, () => {
          d.circle({
            cx: 100,
            cy: 100,
            radius: 50,
            fillStyle: "red",
          }).animateTo({ radius: 70 }, { duration: 1000 });
        }).animateTo({ x: 300 }, { duration: 1000 });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.roundRect).toHaveBeenCalledWith(100, 100, 200, 200, 0);

    vi.clearAllMocks();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({ x: 100, y: 100, width: 200, height: 200 }, () => {
          d.circle({
            cx: 100,
            cy: 100,
            radius: 50,
            fillStyle: "red",
          }).animateTo({ radius: 70 }, { duration: 1000 });
        }).animateTo({ x: 300 }, { duration: 1000 });
      },
      mockContext,
      800,
      600,
      500,
    );

    // Midway through x animation from 100 -> 300.
    expect(mockContext.roundRect).toHaveBeenCalledWith(200, 100, 200, 200, 0);
    expect(mockContext.ellipse).toHaveBeenCalled();
    expect(mockContext.fill).toHaveBeenCalledTimes(1);
  });

  it("uses canvas coordinates inside a frame by default", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect({ x: 100, y: 100, width: 200, height: 200 }, () => {
          d.circle({ cx: 50, cy: 50, radius: 30, fillStyle: "red" });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.ellipse).toHaveBeenCalledWith(
      50,
      50,
      30,
      30,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
  });

  it("uses local frame coordinates when useLocalCoordinateContext is true", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect(
          {
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            useLocalCoordinateContext: true,
          },
          () => {
            d.circle({ cx: 50, cy: 50, radius: 30, fillStyle: "red" });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.translate).toHaveBeenCalledWith(100, 100);
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      50,
      50,
      30,
      30,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
  });

  it("exposes frame width, height, and center to the callback", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const frameValues = {
      width: -1,
      height: -1,
      centerX: -1,
      centerY: -1,
    };

    drawContext.executeDrawCallback(
      (d) => {
        d.rect(
          {
            x: 100,
            y: 120,
            width: 200,
            height: 160,
            useLocalCoordinateContext: true,
          },
          ({ getMeasurements }) => {
            const {
              width: frameWidth,
              height: frameHeight,
              center: frameCenter,
            } = getMeasurements();
            frameValues.width = frameWidth;
            frameValues.height = frameHeight;
            frameValues.centerX = frameCenter.x;
            frameValues.centerY = frameCenter.y;
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(frameValues).toEqual({
      width: 200,
      height: 160,
      centerX: 100,
      centerY: 80,
    });
  });

  it("exposes center in parent coordinate space when useLocalCoordinateContext is false", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const frameValues = {
      width: -1,
      height: -1,
      centerX: -1,
      centerY: -1,
    };

    drawContext.executeDrawCallback(
      (d) => {
        d.rect(
          {
            x: 50,
            y: 50,
            width: 100,
            height: 100,
          },
          ({ getMeasurements }) => {
            const {
              width: frameWidth,
              height: frameHeight,
              center: frameCenter,
            } = getMeasurements();
            frameValues.width = frameWidth;
            frameValues.height = frameHeight;
            frameValues.centerX = frameCenter.x;
            frameValues.centerY = frameCenter.y;
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(frameValues).toEqual({
      width: 100,
      height: 100,
      centerX: 100,
      centerY: 100,
    });
  });

  it("keeps local coordinates aligned while animating a new coordinate space frame", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect(
          {
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            useLocalCoordinateContext: true,
          },
          () => {
            d.circle({ cx: 50, cy: 50, radius: 20, fillStyle: "red" });
          },
        ).animateTo({ x: 300 }, { duration: 1000 });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.translate).toHaveBeenCalledWith(100, 100);
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      50,
      50,
      20,
      20,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );

    vi.clearAllMocks();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect(
          {
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            useLocalCoordinateContext: true,
          },
          () => {
            d.circle({ cx: 50, cy: 50, radius: 20, fillStyle: "red" });
          },
        ).animateTo({ x: 300 }, { duration: 1000 });
      },
      mockContext,
      800,
      600,
      500,
    );

    expect(mockContext.translate).toHaveBeenCalledWith(200, 100);
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      50,
      50,
      20,
      20,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
  });

  it("rect() callback replaces frame() for rectangular local clipping", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect(
          {
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            useLocalCoordinateContext: true,
          },
          () => {
            d.circle({ cx: 50, cy: 50, radius: 30, fillStyle: "red" });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.clip).toHaveBeenCalled();
    expect(mockContext.roundRect).toHaveBeenCalledWith(100, 100, 200, 200, 0);
    expect(mockContext.translate).toHaveBeenCalledWith(100, 100);
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      50,
      50,
      30,
      30,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
  });

  it("rect() callback context exposes local center", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const frameValues = {
      width: -1,
      height: -1,
      centerX: -1,
      centerY: -1,
    };

    drawContext.executeDrawCallback(
      (d) => {
        d.rect(
          {
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            useLocalCoordinateContext: true,
          },
          ({ getMeasurements }) => {
            const {
              width: frameWidth,
              height: frameHeight,
              center: frameCenter,
            } = getMeasurements();
            frameValues.width = frameWidth;
            frameValues.height = frameHeight;
            frameValues.centerX = frameCenter.x;
            frameValues.centerY = frameCenter.y;
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(frameValues).toEqual({
      width: 100,
      height: 100,
      centerX: 50,
      centerY: 50,
    });
  });

  it("group() derives frame context bounds from child content", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const frameValues = {
      width: -1,
      height: -1,
      centerX: -1,
      centerY: -1,
    };

    drawContext.executeDrawCallback(
      (d) => {
        d.group((frameContext) => {
          d.rect({ x: 100, y: 200, width: 40, height: 20, fillStyle: "red" });

          if (frameContext.hasMeasurements) {
            frameValues.width = frameContext.getMeasurements().width;
            frameValues.height = frameContext.getMeasurements().height;
            frameValues.centerX = frameContext.getMeasurements().center.x;
            frameValues.centerY = frameContext.getMeasurements().center.y;
          }
        }, {});
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(frameValues).toEqual({
      width: 40,
      height: 20,
      centerX: 120,
      centerY: 210,
    });
  });

  it("group() exposes derived bounds after child content is queued", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const frameValues = {
      width: -1,
      height: -1,
      centerX: -1,
      centerY: -1,
    };

    drawContext.executeDrawCallback(
      (d) => {
        d.group((frameContext) => {
          d.rect({ x: 100, y: 200, width: 40, height: 20, fillStyle: "red" });

          if (frameContext.hasMeasurements) {
            frameValues.width = frameContext.getMeasurements().width;
            frameValues.height = frameContext.getMeasurements().height;
            frameValues.centerX = frameContext.getMeasurements().center.x;
            frameValues.centerY = frameContext.getMeasurements().center.y;
          }
        }, {});
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(frameValues).toEqual({
      width: 40,
      height: 20,
      centerX: 120,
      centerY: 210,
    });
  });

  it("group() bounds are constrained by framed clip bounds", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const frameValues = {
      width: -1,
      height: -1,
      centerX: -1,
      centerY: -1,
    };

    drawContext.executeDrawCallback(
      (d) => {
        d.group((groupContext) => {
          d.rect(
            {
              x: 528,
              y: 108,
              width: 864,
              height: 864,
              useLocalCoordinateContext: true,
            },
            () => {
              d.rect({
                x: -300,
                y: -200,
                width: 1000,
                height: 800,
                fillStyle: "red",
              });
            },
          );

          if (groupContext.hasMeasurements) {
            frameValues.width = groupContext.getMeasurements().width;
            frameValues.height = groupContext.getMeasurements().height;
            frameValues.centerX = groupContext.getMeasurements().center.x;
            frameValues.centerY = groupContext.getMeasurements().center.y;
          }
        }, {});
      },
      mockContext,
      1920,
      1080,
      0,
    );

    expect(frameValues).toEqual({
      width: 864,
      height: 864,
      centerX: 960,
      centerY: 540,
    });
  });

  it("group() bounds follow child shape geometry", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const frameValues = {
      width: -1,
      height: -1,
      centerX: -1,
      centerY: -1,
    };

    drawContext.executeDrawCallback(
      (d) => {
        d.group((frameContext) => {
          d.circle({ cx: 500, cy: 500, radius: 40, fillStyle: "red" });

          if (frameContext.hasMeasurements) {
            frameValues.width = frameContext.getMeasurements().width;
            frameValues.height = frameContext.getMeasurements().height;
            frameValues.centerX = frameContext.getMeasurements().center.x;
            frameValues.centerY = frameContext.getMeasurements().center.y;
          }
        }, {});
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(frameValues).toEqual({
      width: 80,
      height: 80,
      centerX: 500,
      centerY: 500,
    });
  });

  it("group() provides derived frame values when context is destructured before drawing children", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const frameValues = {
      width: -1,
      height: -1,
      centerX: -1,
      centerY: -1,
    };

    drawContext.executeDrawCallback(
      (d) => {
        d.group(({ getMeasurements, hasMeasurements }) => {
          if (hasMeasurements) {
            const {
              width: frameWidth,
              height: frameHeight,
              center: frameCenter,
            } = getMeasurements();

            frameValues.width = frameWidth;
            frameValues.height = frameHeight;
            frameValues.centerX = frameCenter.x;
            frameValues.centerY = frameCenter.y;
          }

          d.rect({ x: 100, y: 200, width: 40, height: 20, fillStyle: "red" });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(frameValues).toEqual({
      width: 40,
      height: 20,
      centerX: 120,
      centerY: 210,
    });
  });

  it("layer() provides derived frame values when context is destructured before drawing children", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const frameValues = {
      width: -1,
      height: -1,
      centerX: -1,
      centerY: -1,
    };

    drawContext.executeDrawCallback(
      (d) => {
        d.layer(({ getMeasurements, hasMeasurements }) => {
          if (hasMeasurements) {
            const {
              width: frameWidth,
              height: frameHeight,
              center: frameCenter,
            } = getMeasurements();

            frameValues.width = frameWidth;
            frameValues.height = frameHeight;
            frameValues.centerX = frameCenter.x;
            frameValues.centerY = frameCenter.y;
          }

          d.rect({ x: 0, y: 0, width: 40, height: 20, fillStyle: "red" });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(frameValues).toEqual({
      width: 40,
      height: 20,
      centerX: 20,
      centerY: 10,
    });
  });

  it("group() marks first pass as measure and second pass as render when implicitly sized", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const passes: string[] = [];

    drawContext.executeDrawCallback(
      (d) => {
        d.group(({ hasMeasurements }) => {
          passes.push(hasMeasurements ? "render" : "measure");
          d.rect({ x: 10, y: 20, width: 40, height: 20, fillStyle: "red" });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(passes).toEqual(["measure", "render"]);
  });

  it("layer() marks first pass as measure and second pass as render when implicitly sized", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const passes: string[] = [];

    drawContext.executeDrawCallback(
      (d) => {
        d.layer(({ hasMeasurements }) => {
          passes.push(hasMeasurements ? "render" : "measure");
          d.rect({ x: 0, y: 0, width: 40, height: 20, fillStyle: "red" });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(passes).toEqual(["measure", "render"]);
  });

  it("layer() with x/y aligns local coordinates with absolute-position sibling groups", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        // Absolute-positioned baseline group (green repro)
        d.group(() => {
          d.rect({
            x: 100,
            y: 100,
            width: 50,
            height: 50,
            fillStyle: "green",
          });
          d.rect({
            x: 250,
            y: 100,
            width: 50,
            height: 50,
            fillStyle: "green",
          });
        });

        // Local-coordinate layer with explicit x/y offset (blue repro)
        d.layer(
          () => {
            d.rect({
              x: 0,
              y: 0,
              width: 50,
              height: 50,
              fillStyle: "blue",
            });
            d.rect({
              x: 150,
              y: 0,
              width: 50,
              height: 50,
              fillStyle: "blue",
            });
          },
          {
            x: 100,
            y: 100,
            showBounds: true,
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    // Local group should be shifted once by explicit x/y, never doubled.
    expect(mockContext.translate).toHaveBeenCalledWith(100, 100);
    expect(mockContext.translate).not.toHaveBeenCalledWith(200, 200);

    // Baseline absolute rects
    expect(mockContext.roundRect).toHaveBeenCalledWith(100, 100, 50, 50, 0);
    expect(mockContext.roundRect).toHaveBeenCalledWith(250, 100, 50, 50, 0);

    // Local rects (rendered under translated scope)
    expect(mockContext.roundRect).toHaveBeenCalledWith(0, 0, 50, 50, 0);
    expect(mockContext.roundRect).toHaveBeenCalledWith(150, 0, 50, 50, 0);

    // Show bounds are drawn in the layer's local scope.
    expect(mockContext.rect).toHaveBeenCalledWith(0, 0, 200, 50);
  });

  it("group() translates child content when x/y are provided", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.group(
          () => {
            d.rect({
              x: 100,
              y: 200,
              width: 40,
              height: 20,
              fillStyle: "red",
            });
          },
          { x: 0, y: 0 },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.translate).toHaveBeenCalledWith(-100, -200);
  });

  it("group() can render show bounds", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.group(
          () => {
            d.rect({
              x: 100,
              y: 200,
              width: 40,
              height: 20,
              fillStyle: "red",
            });
          },
          { showBounds: true },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.rect).toHaveBeenCalledWith(100, 200, 40, 20);
  });

  it("group() show bounds move with animated x", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const render = (d: DrawAPI) => {
      d.group(
        () => {
          d.rect({ x: 100, y: 200, width: 40, height: 20, fillStyle: "red" });
        },
        { showBounds: true },
      ).animateTo({ x: 200 }, { at: 0, duration: 1000 });
    };

    drawContext.executeDrawCallback((d) => render(d), mockContext, 800, 600, 0);

    vi.mocked(mockContext.rect).mockClear();
    vi.mocked(mockContext.translate).mockClear();

    drawContext.executeDrawCallback(
      (d) => render(d),
      mockContext,
      800,
      600,
      1000,
    );

    // Bounds are drawn in group-local scope, while animated offset is applied via translation.
    expect(mockContext.rect).toHaveBeenCalledWith(100, 200, 40, 20);
    expect(mockContext.translate).toHaveBeenCalledWith(100, 0);
  });

  it("layer() show bounds move with animated x/y", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const render = (d: DrawAPI) => {
      d.layer(
        () => {
          d.rect({ x: 50, y: 0, width: 50, height: 50, fillStyle: "blue" });
          d.rect({ x: 200, y: 0, width: 50, height: 50, fillStyle: "blue" });
        },
        {
          x: 100,
          y: 100,
          showBounds: true,
        },
      ).animateTo({ x: 200, y: 150 }, { at: 0, duration: 1000 });
    };

    drawContext.executeDrawCallback((d) => render(d), mockContext, 800, 600, 0);

    vi.mocked(mockContext.rect).mockClear();
    vi.mocked(mockContext.translate).mockClear();

    drawContext.executeDrawCallback(
      (d) => render(d),
      mockContext,
      800,
      600,
      1000,
    );

    // Show bounds are origin-aware in local mode and move with animated translation.
    expect(mockContext.rect).toHaveBeenCalledWith(0, 0, 250, 50);
    expect(mockContext.translate).toHaveBeenCalledWith(200, 150);
  });

  it("layer() show bounds account for child offsets when dimensions are derived", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.layer(
          () => {
            d.rect({
              x: 100,
              y: 100,
              width: 100,
              height: 100,
              fillStyle: "blue",
            });
            d.rect({
              x: 250,
              y: 100,
              width: 100,
              height: 100,
              fillStyle: "blue",
            });
          },
          {
            x: 100,
            y: 100,
            showBounds: true,
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    // Local frame should start at origin and include offset child extents.
    expect(mockContext.rect).toHaveBeenCalledWith(0, 0, 350, 200);
  });

  it("layer() show bounds honor explicit local frame x/y/width/height", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.layer(
          () => {
            d.rect({
              x: 50,
              y: 30,
              width: 40,
              height: 20,
              fillStyle: "blue",
            });
          },
          {
            x: 100,
            y: 120,
            width: 300,
            height: 140,
            showBounds: true,
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    // Explicit local frame origin is applied via scope translation.
    expect(mockContext.translate).toHaveBeenCalledWith(100, 120);

    // Show bounds rect uses explicit width/height at local origin.
    expect(mockContext.rect).toHaveBeenCalledWith(0, 0, 300, 140);
  });

  it("layer() show bounds are rendered through local scope translation", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.layer(
          () => {
            d.rect({ x: 0, y: 0, width: 50, height: 50, fillStyle: "blue" });
          },
          {
            x: 100,
            y: 100,
            showBounds: true,
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    // The layer's own local-scope translate is applied once, by the
    // compositor, when the layer is composited — not replayed once per
    // leaf (the child rect and the show-bounds rect both render under a
    // single shared translate call).
    const localTranslateCalls = vi
      .mocked(mockContext.translate)
      .mock.calls.filter((call) => call[0] === 100 && call[1] === 100).length;

    expect(localTranslateCalls).toBe(1);
    expect(mockContext.rect).toHaveBeenCalledWith(0, 0, 50, 50);
  });

  it("layer() show bounds animate with content bounds changes", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const render = (d: DrawAPI) => {
      d.layer(
        () => {
          d.rect({ x: 0, y: 0, width: 50, height: 50, fillStyle: "blue" });
          d.rect({
            x: 100,
            y: 0,
            width: 50,
            height: 50,
            fillStyle: "blue",
          }).animateTo({ x: 200 }, { at: 0, duration: 1000 });
        },
        {
          x: 100,
          y: 100,
          showBounds: true,
        },
      );
    };

    drawContext.executeDrawCallback((d) => render(d), mockContext, 800, 600, 0);

    vi.mocked(mockContext.rect).mockClear();
    vi.mocked(mockContext.translate).mockClear();

    drawContext.executeDrawCallback(
      (d) => render(d),
      mockContext,
      800,
      600,
      1000,
    );

    // Local derived bounds should expand from width 150 -> 250 as child content animates.
    expect(mockContext.rect).toHaveBeenCalledWith(0, 0, 250, 50);

    // The layer's own local-scope translate is applied once, by the
    // compositor — both child rects and the show-bounds rect render
    // under that single shared translate call, not one replay each.
    const translatedCalls = vi
      .mocked(mockContext.translate)
      .mock.calls.filter((call) => call[0] === 100 && call[1] === 100).length;

    expect(translatedCalls).toBe(1);
  });

  it("layer() show bounds animate with offset content bounds changes", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const render = (d: DrawAPI) => {
      d.layer(
        () => {
          d.rect({
            x: 100,
            y: 100,
            width: 100,
            height: 100,
            fillStyle: "blue",
          });
          d.rect({
            x: 250,
            y: 100,
            width: 100,
            height: 100,
            fillStyle: "blue",
          }).animateTo({ x: 350 }, { at: 0, duration: 1000 });
        },
        {
          x: 100,
          y: 100,
          showBounds: true,
        },
      );
    };

    drawContext.executeDrawCallback((d) => render(d), mockContext, 800, 600, 0);

    vi.mocked(mockContext.rect).mockClear();

    drawContext.executeDrawCallback(
      (d) => render(d),
      mockContext,
      800,
      600,
      1000,
    );

    // Local derived bounds should expand from width 350 -> 450 from local origin.
    expect(mockContext.rect).toHaveBeenCalledWith(0, 0, 450, 200);
  });

  it("does not apply a spurious groupOffsetX/Y translate when an auto-sized group's only child animates rotate", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const render = (d: DrawAPI) => {
      d.group(
        () => {
          d.rect({
            x: 860,
            y: 440,
            width: 200,
            height: 200,
            fillStyle: "#333",
            rotate: 0,
          }).animateTo({ rotate: 360 }, { at: 0, duration: 10000 });
        },
        { showBounds: true },
      );
    };

    // Frame 0 establishes the animatable at its declared (unrotated) props.
    drawContext.executeDrawCallback(
      (d) => render(d),
      mockContext,
      1920,
      1080,
      0,
    );

    vi.mocked(mockContext.translate).mockClear();

    // 1250ms into a 0->360 sweep over 10000ms = 45 degrees -- the exact
    // point where the traced bug (spec/group-auto-position-timing-plan.md)
    // produces a spurious groupOffsetX/Y translate.
    drawContext.executeDrawCallback(
      (d) => render(d),
      mockContext,
      1920,
      1080,
      1250,
    );

    // The child legitimately rotates 45 degrees about its own center
    // (960, 540) -- that translate/-translate pair is expected. Any other
    // translate call is the bug: a non-zero groupOffsetX/Y applied to the
    // group's own compositing, which re-shifts content back toward the
    // stale, pre-animation position instead of the live rotated AABB.
    const spuriousTranslateCalls = vi
      .mocked(mockContext.translate)
      .mock.calls.filter(
        (call) =>
          !(call[0] === 960 && call[1] === 540) &&
          !(call[0] === -960 && call[1] === -540),
      );

    expect(spuriousTranslateCalls).toEqual([]);
  });

  it("animating the group's own rotate does not freeze position auto-tracking of an animated child", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const render = (d: DrawAPI) => {
      d.group(
        () => {
          d.rect({
            x: 860,
            y: 440,
            width: 200,
            height: 200,
            fillStyle: "#333",
            rotate: 0,
          }).animateTo({ rotate: 360 }, { at: 0, duration: 10000 });
        },
        { showBounds: true },
      ).animateTo({ rotate: 90 }, { at: 0, duration: 10000 });
    };

    drawContext.executeDrawCallback(
      (d) => render(d),
      mockContext,
      1920,
      1080,
      0,
    );

    vi.mocked(mockContext.translate).mockClear();

    // 1250ms in: child at 45 degrees, group at 11.25 degrees. A square
    // rotated about its own center always has an AABB centered on that
    // same point, so the group's auto-fit frame (which tightly wraps this
    // one child) shares the child's (960, 540) center regardless of either
    // rotation angle -- both the child's own rotate-about-center wrapper
    // AND the group's own rotate-about-its-frame-center wrapper use this
    // same pivot, just with different rotate() angles. A blanket
    // "does this animatable have any segment at all" check would
    // incorrectly treat the group's unrelated rotate segment as reason to
    // freeze x/y at a stale seeded value instead of live-tracking
    // derivedBounds -- see the hasSegmentTargeting design in
    // spec/group-auto-position-timing-plan.md. Any translate NOT part of
    // one of these two legitimate rotate-about-(960,540) wrappers is that
    // bug resurfacing.
    drawContext.executeDrawCallback(
      (d) => render(d),
      mockContext,
      1920,
      1080,
      1250,
    );

    const spuriousTranslateCalls = vi
      .mocked(mockContext.translate)
      .mock.calls.filter(
        (call) =>
          !(call[0] === 960 && call[1] === 540) &&
          !(call[0] === -960 && call[1] === -540),
      );

    expect(spuriousTranslateCalls).toEqual([]);

    // Both rotations should still be present and distinct.
    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    expect(mockContext.rotate).toHaveBeenCalledWith((11.25 * Math.PI) / 180);
  });

  it("animating both the group's own x and rotate together resolves each independently", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const render = (d: DrawAPI) => {
      d.group(
        () => {
          d.rect({ x: 100, y: 200, width: 40, height: 20, fillStyle: "red" });
        },
        { showBounds: true },
      ).animateTo({ x: 200, rotate: 90 }, { at: 0, duration: 1000 });
    };

    drawContext.executeDrawCallback((d) => render(d), mockContext, 800, 600, 0);

    vi.mocked(mockContext.translate).mockClear();
    vi.mocked(mockContext.rotate).mockClear();

    drawContext.executeDrawCallback(
      (d) => render(d),
      mockContext,
      800,
      600,
      1000,
    );

    // x is explicitly animated (a real segment targets it), so it should
    // resolve to the live animated value (200) rather than the static
    // content position (100) -- the groupOffsetX shift needed to move
    // ambient content from where it's authored (100) to the animated
    // frame position (200) is +100, unaffected by rotate being animated
    // in the same call.
    expect(mockContext.translate).toHaveBeenCalledWith(100, 0);
    // rotate resolves independently, fully animated to its own target.
    expect(mockContext.rotate).toHaveBeenCalledWith((90 * Math.PI) / 180);
  });

  it("layer() rotate basis uses explicit x/y and origin-aware local frame size", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.layer(
          () => {
            d.rect({
              x: 100,
              y: 100,
              width: 100,
              height: 100,
              fillStyle: "blue",
            });
            d.rect({
              x: 250,
              y: 100,
              width: 100,
              height: 100,
              fillStyle: "blue",
            });
          },
          {
            x: 100,
            y: 100,
            rotate: 45,
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    // Local frame is [0,0,350,200] translated to (100,100), center=(275,200).
    expect(mockContext.translate).toHaveBeenCalledWith(275, 200);
    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    expect(mockContext.translate).toHaveBeenCalledWith(-275, -200);
  });

  it("group() animates transform props", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const render = (d: DrawAPI) => {
      d.group(
        () => {
          d.rect({ x: 100, y: 200, width: 40, height: 20, fillStyle: "red" });
        },
        { rotate: 0 },
      ).animateTo({ rotate: 45 }, { at: 0, duration: 1000 });
    };

    drawContext.executeDrawCallback((d) => render(d), mockContext, 800, 600, 0);
    drawContext.executeDrawCallback(
      (d) => render(d),
      mockContext,
      800,
      600,
      1000,
    );

    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
  });

  it("group() animates x from inferred bounds when x is omitted", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const render = (d: DrawAPI) => {
      d.group(() => {
        d.rect({ x: 100, y: 200, width: 40, height: 20, fillStyle: "red" });
      }).animateTo({ x: 200 }, { at: 0, duration: 1000 });
    };

    drawContext.executeDrawCallback(
      (d) => render(d),
      mockContext,
      800,
      600,
      500,
    );

    vi.mocked(mockContext.translate).mockClear();

    drawContext.executeDrawCallback(
      (d) => render(d),
      mockContext,
      800,
      600,
      1000,
    );

    expect(mockContext.translate).toHaveBeenCalledWith(50, 0);
  });

  it("rect() callback does not transform child content with frame transform", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.rect(
          {
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            rotate: 45,
            useLocalCoordinateContext: true,
          },
          () => {
            d.circle({ cx: 50, cy: 50, radius: 30, fillStyle: "red" });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    const undoRotationIndex = vi
      .mocked(mockContext.rotate)
      .mock.calls.findIndex((call) => call[0] === -(45 * Math.PI) / 180);

    expect(undoRotationIndex).toBeGreaterThan(-1);

    const undoRotationOrder = vi.mocked(mockContext.rotate).mock
      .invocationCallOrder[undoRotationIndex];
    const childEllipseOrder = vi.mocked(mockContext.ellipse).mock
      .invocationCallOrder[0];

    expect(childEllipseOrder).toBeGreaterThan(undoRotationOrder!);
  });

  it("group() does not clip by default", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.group(() => {
          d.circle({ cx: 500, cy: 500, radius: 40, fillStyle: "red" });
        }, {});
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.clip).not.toHaveBeenCalled();
  });

  it("group() does not clip content", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.group(() => {
          d.circle({ cx: 500, cy: 500, radius: 40, fillStyle: "red" });
        }, {});
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.clip).not.toHaveBeenCalled();
  });

  it("group() reuses cached layer across frames when props are unchanged", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const previousOffscreenCanvas = (globalThis as any).OffscreenCanvas;

    class MockOffscreenCanvas {
      static instances: MockOffscreenCanvas[] = [];

      width: number;
      height: number;
      context: CanvasRenderingContext2D;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.context = {
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          scale: vi.fn(),
          setTransform: vi.fn(),
          clearRect: vi.fn(),
          beginPath: vi.fn(),
          closePath: vi.fn(),
          ellipse: vi.fn(),
          arc: vi.fn(),
          rect: vi.fn(),
          roundRect: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          fill: vi.fn(),
          stroke: vi.fn(),
          fillRect: vi.fn(),
          fillText: vi.fn(),
          strokeText: vi.fn(),
          drawImage: vi.fn(),
          globalAlpha: 1,
          globalCompositeOperation: "source-over",
          fillStyle: "",
          strokeStyle: "",
          lineWidth: 1,
          measureText: vi.fn(
            (value: string) =>
              ({
                width: value.length * 10,
                actualBoundingBoxAscent: 10,
                actualBoundingBoxDescent: 2,
              }) as TextMetrics,
          ),
          canvas: { width, height },
        } as unknown as CanvasRenderingContext2D;

        MockOffscreenCanvas.instances.push(this);
      }

      getContext(kind: string) {
        if (kind !== "2d") {
          return null;
        }

        return this.context;
      }
    }

    (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;

    const cacheableContext = {
      ...mockContext,
      canvas: {
        width: 800,
        height: 600,
        getContext: vi.fn(),
      },
    } as unknown as CanvasRenderingContext2D;

    const renderCallback = (d: DrawAPI) => {
      d.group(() => {
        d.circle({ cx: 50, cy: 50, radius: 30, fillStyle: "red" });
      }, {});
    };

    drawContext.executeDrawCallback(
      renderCallback,
      cacheableContext,
      800,
      600,
      0,
    );
    drawContext.executeDrawCallback(
      renderCallback,
      cacheableContext,
      800,
      600,
      16,
    );

    const firstSurface = MockOffscreenCanvas.instances[0];

    expect(firstSurface).toBeDefined();
    expect(MockOffscreenCanvas.instances).toHaveLength(1);
    expect(cacheableContext.drawImage).toHaveBeenCalledTimes(2);

    (globalThis as any).OffscreenCanvas = previousOffscreenCanvas;
  });

  it("nested layer recomposites without redrawing its own content when only an ancestor's rotation animates (cache enabled)", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const previousOffscreenCanvas = (globalThis as any).OffscreenCanvas;

    class MockOffscreenCanvas {
      static instances: MockOffscreenCanvas[] = [];

      width: number;
      height: number;
      context: CanvasRenderingContext2D;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.context = {
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          scale: vi.fn(),
          setTransform: vi.fn(),
          clearRect: vi.fn(),
          beginPath: vi.fn(),
          closePath: vi.fn(),
          clip: vi.fn(),
          ellipse: vi.fn(),
          arc: vi.fn(),
          rect: vi.fn(),
          roundRect: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          fill: vi.fn(),
          stroke: vi.fn(),
          fillRect: vi.fn(),
          fillText: vi.fn(),
          strokeText: vi.fn(),
          drawImage: vi.fn(),
          globalAlpha: 1,
          globalCompositeOperation: "source-over",
          fillStyle: "",
          strokeStyle: "",
          lineWidth: 1,
          measureText: vi.fn(
            (value: string) =>
              ({
                width: value.length * 10,
                actualBoundingBoxAscent: 10,
                actualBoundingBoxDescent: 2,
              }) as TextMetrics,
          ),
          canvas: { width, height },
        } as unknown as CanvasRenderingContext2D;

        // A real OffscreenCanvas's context.canvas points back to the
        // canvas itself (which has its own getContext) — without this, a
        // group nested inside another cached group's surface sees a
        // canvas with no getContext on the way down and silently bypasses
        // its own cache check, which is exactly the bug this test exists
        // to catch.
        (this.context as unknown as { canvas: unknown }).canvas = this;

        MockOffscreenCanvas.instances.push(this);
      }

      getContext(kind: string) {
        if (kind !== "2d") {
          return null;
        }

        return this.context;
      }
    }

    (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;

    const cacheableContext = {
      ...mockContext,
      canvas: {
        width: 800,
        height: 600,
        getContext: vi.fn(),
      },
    } as unknown as CanvasRenderingContext2D;

    const renderCallback = (d: DrawAPI) => {
      d.layer(
        () => {
          d.layer(() => {}, {
            x: 200,
            y: 200,
            width: 250,
            height: 100,
            showBounds: true,
          });
        },
        {
          x: 300,
          y: 300,
          rotate: 0,
        },
      ).animateTo({ rotate: 45 }, { at: 0, duration: 1000 });
    };

    const countRotationsAt45 = (): number =>
      MockOffscreenCanvas.instances.reduce((count, surface) => {
        const rotates = vi
          .mocked(surface.context.rotate)
          .mock.calls.filter(
            (call) => Math.abs(call[0] - (45 * Math.PI) / 180) < 1e-9,
          ).length;

        return count + rotates;
      }, 0);

    const countInnerShowBoundsRects = (): number =>
      MockOffscreenCanvas.instances.reduce((count, surface) => {
        const rectCalls = vi
          .mocked(surface.context.rect)
          .mock.calls.filter(
            (call) =>
              call[0] === 0 &&
              call[1] === 0 &&
              call[2] === 250 &&
              call[3] === 100,
          ).length;

        return count + rectCalls;
      }, 0);

    drawContext.executeDrawCallback(
      renderCallback,
      cacheableContext,
      800,
      600,
      0,
    );

    expect(countRotationsAt45()).toBe(0);

    const firstFrameInnerRects = countInnerShowBoundsRects();
    expect(firstFrameInnerRects).toBeGreaterThan(0);

    drawContext.executeDrawCallback(
      renderCallback,
      cacheableContext,
      800,
      600,
      1000,
    );

    // The ancestor's rotation is applied when *compositing* it in...
    expect(countRotationsAt45()).toBeGreaterThan(0);

    // ...but the inner layer's own content and props never changed, so
    // its cache hits — its own show-bounds rect must not redraw a second
    // time just because an unrelated ancestor's transform changed. This
    // is the actual point of local-bounds group compositing: a group's
    // own cache is keyed by its own local state, not by what any ancestor
    // happens to be doing.
    expect(countInnerShowBoundsRects()).toBe(firstFrameInnerRects);

    (globalThis as any).OffscreenCanvas = previousOffscreenCanvas;
  });

  it("nested explicit layer showBounds does not redraw while parent layer rotates (cache enabled)", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const previousOffscreenCanvas = (globalThis as any).OffscreenCanvas;

    class MockOffscreenCanvas {
      static instances: MockOffscreenCanvas[] = [];

      width: number;
      height: number;
      context: CanvasRenderingContext2D;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.context = {
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          scale: vi.fn(),
          setTransform: vi.fn(),
          clearRect: vi.fn(),
          beginPath: vi.fn(),
          closePath: vi.fn(),
          clip: vi.fn(),
          ellipse: vi.fn(),
          arc: vi.fn(),
          rect: vi.fn(),
          roundRect: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          fill: vi.fn(),
          stroke: vi.fn(),
          fillRect: vi.fn(),
          fillText: vi.fn(),
          strokeText: vi.fn(),
          drawImage: vi.fn(),
          globalAlpha: 1,
          globalCompositeOperation: "source-over",
          fillStyle: "",
          strokeStyle: "",
          lineWidth: 1,
          measureText: vi.fn(
            (value: string) =>
              ({
                width: value.length * 10,
                actualBoundingBoxAscent: 10,
                actualBoundingBoxDescent: 2,
              }) as TextMetrics,
          ),
          canvas: { width, height },
        } as unknown as CanvasRenderingContext2D;

        // See the equivalent comment in the previous test: without this
        // self-reference, a group nested inside another cached group's
        // surface always fails the canvas.getContext duck-type check and
        // silently bypasses its own cache, redrawing every frame
        // regardless of whether its own content actually changed.
        (this.context as unknown as { canvas: unknown }).canvas = this;

        MockOffscreenCanvas.instances.push(this);
      }

      getContext(kind: string) {
        if (kind !== "2d") {
          return null;
        }

        return this.context;
      }
    }

    (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;

    const cacheableContext = {
      ...mockContext,
      canvas: {
        width: 800,
        height: 600,
        getContext: vi.fn(),
      },
    } as unknown as CanvasRenderingContext2D;

    const renderCallback = (d: DrawAPI) => {
      d.layer(
        () => {
          d.rect({ x: 0, y: 0, width: 100, height: 100 });
          d.rect({ x: 150, y: 0, width: 100, height: 100 });

          d.layer(
            () => {
              d.rect({ x: 0, y: 0, width: 100, height: 100 });
              d.rect({ x: 150, y: 0, width: 100, height: 100 });
            },
            {
              x: 200,
              y: 200,
              width: 250,
              height: 100,
              showBounds: true,
            },
          );
        },
        {
          x: 300,
          y: 300,
          showBounds: true,
          rotate: 0,
        },
      ).animateTo({ rotate: 45 }, { at: 0, duration: 1000 });
    };

    const countInnerShowBoundsRects = (): number =>
      MockOffscreenCanvas.instances.reduce((count, surface) => {
        const rectCalls = vi
          .mocked(surface.context.rect)
          .mock.calls.filter(
            (call) =>
              call[0] === 0 &&
              call[1] === 0 &&
              call[2] === 250 &&
              call[3] === 100,
          ).length;

        return count + rectCalls;
      }, 0);

    const countRotationsAt45 = (): number =>
      MockOffscreenCanvas.instances.reduce((count, surface) => {
        const rotates = vi
          .mocked(surface.context.rotate)
          .mock.calls.filter(
            (call) => Math.abs(call[0] - (45 * Math.PI) / 180) < 1e-9,
          ).length;

        return count + rotates;
      }, 0);

    drawContext.executeDrawCallback(
      renderCallback,
      cacheableContext,
      800,
      600,
      0,
    );
    const firstFrameShowBoundsRects = countInnerShowBoundsRects();
    expect(firstFrameShowBoundsRects).toBeGreaterThan(0);
    expect(countRotationsAt45()).toBe(0);

    drawContext.executeDrawCallback(
      renderCallback,
      cacheableContext,
      800,
      600,
      1000,
    );

    const secondFrameShowBoundsRects = countInnerShowBoundsRects();

    // The outer layer's rotation is applied when compositing it in...
    expect(countRotationsAt45()).toBeGreaterThan(0);

    // ...but the inner layer's own content and props never changed, so its
    // cache hits — its show-bounds rect must not redraw a second time just
    // because an unrelated ancestor's transform changed.
    expect(secondFrameShowBoundsRects).toBe(firstFrameShowBoundsRects);

    (globalThis as any).OffscreenCanvas = previousOffscreenCanvas;
  });

  it("masks correctly when nested inside a rotated cacheable ancestor group (previously a known gap)", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const previousOffscreenCanvas = (globalThis as any).OffscreenCanvas;

    class MockOffscreenCanvas {
      static instances: MockOffscreenCanvas[] = [];

      width: number;
      height: number;
      context: CanvasRenderingContext2D;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.context = {
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          scale: vi.fn(),
          setTransform: vi.fn(),
          clearRect: vi.fn(),
          beginPath: vi.fn(),
          closePath: vi.fn(),
          clip: vi.fn(),
          ellipse: vi.fn(),
          arc: vi.fn(),
          rect: vi.fn(),
          roundRect: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          fill: vi.fn(),
          stroke: vi.fn(),
          fillRect: vi.fn(),
          fillText: vi.fn(),
          strokeText: vi.fn(),
          drawImage: vi.fn(),
          globalAlpha: 1,
          globalCompositeOperation: "source-over",
          fillStyle: "",
          strokeStyle: "",
          lineWidth: 1,
          measureText: vi.fn(
            (value: string) =>
              ({
                width: value.length * 10,
                actualBoundingBoxAscent: 10,
                actualBoundingBoxDescent: 2,
              }) as TextMetrics,
          ),
          canvas: { width, height },
        } as unknown as CanvasRenderingContext2D;

        (this.context as unknown as { canvas: unknown }).canvas = this;

        MockOffscreenCanvas.instances.push(this);
      }

      getContext(kind: string) {
        if (kind !== "2d") {
          return null;
        }

        return this.context;
      }
    }

    (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;

    const cacheableContext = {
      ...mockContext,
      canvas: {
        width: 800,
        height: 600,
        getContext: vi.fn(),
      },
    } as unknown as CanvasRenderingContext2D;

    // Previously, text()'s mask read the *live* canvas transform matrix
    // and sized its scratch canvas to the root canvas — both assumptions
    // broke once an ancestor's rotation was applied via drawImage
    // composition (a separate offscreen surface) instead of directly
    // accumulating onto one shared context. text() now composes through
    // the same local-surface pipeline as every other group, so masking
    // still works regardless of what rotated ancestor it's nested inside.
    drawContext.executeDrawCallback(
      (d) => {
        d.group(
          () => {
            d.text("Mask", { x: 20, y: 20, fontSize: "24px" }, () => {
              d.circle({ cx: 30, cy: 30, radius: 15, fillStyle: "red" });
            });
          },
          { x: 0, y: 0, width: 100, height: 100, rotate: 30 },
        );
      },
      cacheableContext,
      800,
      600,
      0,
    );

    const maskSurface = MockOffscreenCanvas.instances.find(
      (surface) => vi.mocked(surface.context.fillText).mock.calls.length > 0,
    );

    expect(maskSurface).toBeDefined();
    expect(maskSurface!.context.fillText).toHaveBeenCalledWith("Mask", 20, 20);
    // The masked content drew into that same isolated local surface, not
    // directly onto the rotated ancestor's own surface.
    expect(maskSurface!.context.ellipse).toHaveBeenCalled();

    (globalThis as any).OffscreenCanvas = previousOffscreenCanvas;
  });
});
