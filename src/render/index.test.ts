import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLayer } from "../core";
import type { IAnimatableLike } from "./Animatable";
import { createDrawContext } from "./index";
import { getTextBounds } from "./primitives";
import type { BezierProps, Bounds, DrawMethods, RectProps } from "./types";

// We test the internal functions by creating a mock canvas context
// and verifying the transform calls

describe("drawMethods transform props", () => {
  let mockContext: CanvasRenderingContext2D;

  beforeEach(() => {
    // Create a mock canvas context
    mockContext = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      font: "",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      beginPath: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      rect: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      quadraticCurveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      roundRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(
        (value: string) =>
          ({
            width: value.length * 10,
            actualBoundingBoxAscent: 10,
            actualBoundingBoxDescent: 2,
          }) as TextMetrics,
      ),
      canvas: { width: 800, height: 600 },
    } as unknown as CanvasRenderingContext2D;
  });

  describe("TransformOrigin resolution", () => {
    it("resolves 'center' to center of bounds", async () => {
      // Import dynamically to get fresh module
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
  });

  describe("rotate prop", () => {
    it("applies rotation around center by default", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.circle({
            cx: 100,
            cy: 100,
            radius: 50,
            rotate: 45,
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      // Circle center is already (100, 100), center of bounding box is same
      expect(mockContext.translate).toHaveBeenCalledWith(100, 100);
      expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
      expect(mockContext.translate).toHaveBeenCalledWith(-100, -100);
    });

    it("does not apply rotation when rotate is 0", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.circle({
            cx: 100,
            cy: 100,
            radius: 50,
            rotate: 0,
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      // No rotation should be applied
      expect(mockContext.rotate).not.toHaveBeenCalled();
    });

    it("does not apply rotation when rotate is undefined", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.circle({
            cx: 100,
            cy: 100,
            radius: 50,
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.rotate).not.toHaveBeenCalled();
    });
  });

  describe("scale props", () => {
    it("applies uniform scale with scale prop", async () => {
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
  });

  describe("combined transforms", () => {
    it("applies scale before rotation", async () => {
      const { createDrawContext } = await import("./index");
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
  });

  describe("line transforms", () => {
    it("calculates bounds correctly for line", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.line({
            start: { x: 0, y: 0 },
            end: { x: 100, y: 100 },
            rotate: 45,
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      // Line from (0,0) to (100,100) has center at (50, 50)
      expect(mockContext.translate).toHaveBeenCalledWith(50, 50);
      expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
      expect(mockContext.translate).toHaveBeenCalledWith(-50, -50);
    });
  });

  describe("polygon rendering", () => {
    it("renders sequential line segments from points", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.polygon({
            points: [
              { x: 100, y: 100 },
              { x: 140, y: 100 },
              { x: 120, y: 140 },
            ],
            strokeStyle: "#333",
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.moveTo).toHaveBeenCalledWith(100, 100);
      expect(mockContext.lineTo).toHaveBeenNthCalledWith(1, 140, 100);
      expect(mockContext.lineTo).toHaveBeenNthCalledWith(2, 120, 140);
      expect(mockContext.closePath).not.toHaveBeenCalled();
    });

    it("closes the polygon when closePath is true", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.polygon({
            points: [
              { x: 100, y: 100 },
              { x: 150, y: 100 },
              { x: 125, y: 150 },
            ],
            closePath: true,
            strokeStyle: "#333",
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.closePath).toHaveBeenCalled();
    });

    it("applies strokeAlignment only when the polygon is closed", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.polygon({
            points: [
              { x: 100, y: 100 },
              { x: 150, y: 100 },
              { x: 125, y: 150 },
            ],
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

      expect(mockContext.clip).not.toHaveBeenCalled();
      expect(mockContext.lineWidth).toBe(10);

      vi.clearAllMocks();

      drawContext.executeDrawCallback(
        (d) => {
          d.polygon({
            points: [
              { x: 100, y: 100 },
              { x: 150, y: 100 },
              { x: 125, y: 150 },
            ],
            closePath: true,
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

      expect(mockContext.clip).toHaveBeenCalledWith();
      expect(mockContext.lineWidth).toBe(20);
    });

    it("uses doubled stroke width for inside and outside closed polygons", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.polygon({
            points: [
              { x: 100, y: 100 },
              { x: 150, y: 100 },
              { x: 125, y: 150 },
            ],
            closePath: true,
            strokeStyle: "#333",
            strokeWidth: 8,
            strokeAlignment: "inside",
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.lineWidth).toBe(16);

      vi.clearAllMocks();

      drawContext.executeDrawCallback(
        (d) => {
          d.polygon({
            points: [
              { x: 100, y: 100 },
              { x: 150, y: 100 },
              { x: 125, y: 150 },
            ],
            closePath: true,
            strokeStyle: "#333",
            strokeWidth: 8,
            strokeAlignment: "outside",
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.lineWidth).toBe(16);
    });

    it("keeps original stroke width for open polygons even when strokeAlignment is set", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.polygon({
            points: [
              { x: 100, y: 100 },
              { x: 150, y: 100 },
              { x: 125, y: 150 },
            ],
            strokeStyle: "#333",
            strokeWidth: 8,
            strokeAlignment: "outside",
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.lineWidth).toBe(8);
      expect(mockContext.clip).not.toHaveBeenCalled();
    });

    it("treats matching first and last points as a closed shape", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.polygon({
            points: [
              { x: 100, y: 100 },
              { x: 150, y: 100 },
              { x: 125, y: 150 },
              { x: 100, y: 100 },
            ],
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

      expect(mockContext.closePath).toHaveBeenCalled();
      expect(mockContext.clip).toHaveBeenCalledWith("evenodd");
    });

    it("animates numeric point coordinates in the points array", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      const initialPoints = [
        { x: 100, y: 100 },
        { x: 140, y: 100 },
        { x: 120, y: 140 },
      ];

      const targetPoints = [
        { x: 120, y: 80 },
        { x: 160, y: 120 },
        { x: 140, y: 160 },
      ];

      const drawAnimatedPolygon = () => {
        drawContext.executeDrawCallback(
          (d) => {
            d.polygon({
              points: initialPoints,
              closePath: true,
              strokeStyle: "#333",
            }).animateTo({ points: targetPoints }, { duration: 1000 });
          },
          mockContext,
          800,
          600,
          0,
        );
      };

      drawAnimatedPolygon();

      vi.clearAllMocks();

      drawContext.executeDrawCallback(
        (d) => {
          d.polygon({
            points: initialPoints,
            closePath: true,
            strokeStyle: "#333",
          }).animateTo({ points: targetPoints }, { duration: 1000 });
        },
        mockContext,
        800,
        600,
        500,
      );

      const moveToCall = vi.mocked(mockContext.moveTo).mock.calls[0];
      const lineToCalls = vi.mocked(mockContext.lineTo).mock.calls;

      expect(moveToCall[0]).toBeCloseTo(110);
      expect(moveToCall[1]).toBeCloseTo(90);

      expect(lineToCalls[0][0]).toBeCloseTo(150);
      expect(lineToCalls[0][1]).toBeCloseTo(110);

      expect(lineToCalls[1][0]).toBeCloseTo(130);
      expect(lineToCalls[1][1]).toBeCloseTo(150);
    });
  });

  describe("bezier rendering", () => {
    it("renders quadratic and cubic bezier segments in sequence", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.bezier({
            segments: [
              {
                point: { x: 100, y: 120 },
              },
              {
                control: { x: 140, y: 80 },
                point: { x: 180, y: 120 },
              },
              {
                control: [
                  { x: 220, y: 160 },
                  { x: 260, y: 60 },
                ],
                point: { x: 300, y: 120 },
              },
            ],
            fillStyle: "transparent",
            strokeStyle: "#333",
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.moveTo).toHaveBeenCalledWith(100, 120);
      expect(mockContext.quadraticCurveTo).toHaveBeenCalledWith(
        140,
        80,
        180,
        120,
      );
      expect(mockContext.bezierCurveTo).toHaveBeenCalledWith(
        220,
        160,
        260,
        60,
        300,
        120,
      );
      expect(mockContext.closePath).not.toHaveBeenCalled();
    });

    it("ignores bezier input when the first segment includes control points", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          const invalidBezierInput = {
            segments: [
              {
                control: { x: 140, y: 80 },
                point: { x: 180, y: 120 },
              },
              {
                control: { x: 220, y: 90 },
                point: { x: 260, y: 140 },
              },
            ],
            fillStyle: "transparent",
            strokeStyle: "#333",
          } as unknown as Parameters<typeof d.bezier>[0];

          d.bezier(invalidBezierInput);
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.moveTo).not.toHaveBeenCalled();
      expect(mockContext.quadraticCurveTo).not.toHaveBeenCalled();
      expect(mockContext.bezierCurveTo).not.toHaveBeenCalled();
    });

    it("closes the bezier shape when closePath is true", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.bezier({
            segments: [
              {
                point: { x: 100, y: 120 },
              },
              {
                control: { x: 140, y: 80 },
                point: { x: 180, y: 120 },
              },
            ],
            closePath: true,
            fillStyle: "transparent",
            strokeStyle: "#333",
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.closePath).toHaveBeenCalled();
    });

    it("applies strokeAlignment only when the bezier shape is closed", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.bezier({
            segments: [
              {
                point: { x: 100, y: 120 },
              },
              {
                control: { x: 140, y: 80 },
                point: { x: 180, y: 120 },
              },
            ],
            fillStyle: "transparent",
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

      expect(mockContext.clip).not.toHaveBeenCalled();
      expect(mockContext.lineWidth).toBe(10);

      vi.clearAllMocks();

      drawContext.executeDrawCallback(
        (d) => {
          d.bezier({
            segments: [
              {
                point: { x: 100, y: 120 },
              },
              {
                control: { x: 140, y: 80 },
                point: { x: 180, y: 120 },
              },
            ],
            closePath: true,
            fillStyle: "transparent",
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

      expect(mockContext.clip).toHaveBeenCalledWith();
      expect(mockContext.lineWidth).toBe(20);
    });

    it("treats matching start and end points as a closed bezier shape", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.bezier({
            segments: [
              {
                point: { x: 100, y: 120 },
              },
              {
                control: { x: 140, y: 80 },
                point: { x: 100, y: 120 },
              },
            ],
            fillStyle: "transparent",
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

      expect(mockContext.closePath).toHaveBeenCalled();
      expect(mockContext.clip).toHaveBeenCalledWith("evenodd");
      expect(mockContext.lineWidth).toBe(20);
    });

    it("animates start, control, and end points on bezier segments", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      const initialPath: Pick<BezierProps, "segments"> = {
        segments: [
          {
            point: { x: 100, y: 100 },
          },
          {
            control: { x: 120, y: 60 },
            point: { x: 160, y: 100 },
          },
          {
            control: [
              { x: 190, y: 140 },
              { x: 230, y: 60 },
            ],
            point: { x: 260, y: 100 },
          },
        ],
      };

      const targetPath: Pick<BezierProps, "segments"> = {
        segments: [
          {
            point: { x: 120, y: 90 },
          },
          {
            control: { x: 150, y: 40 },
            point: { x: 180, y: 120 },
          },
          {
            control: [
              { x: 220, y: 170 },
              { x: 260, y: 80 },
            ],
            point: { x: 290, y: 130 },
          },
        ],
      };

      drawContext.executeDrawCallback(
        (d) => {
          d.bezier({
            ...initialPath,
            fillStyle: "transparent",
            strokeStyle: "#333",
          }).animateTo(targetPath, { duration: 1000 });
        },
        mockContext,
        800,
        600,
        0,
      );

      vi.clearAllMocks();

      drawContext.executeDrawCallback(
        (d) => {
          d.bezier({
            ...initialPath,
            fillStyle: "transparent",
            strokeStyle: "#333",
          }).animateTo(targetPath, { duration: 1000 });
        },
        mockContext,
        800,
        600,
        500,
      );

      const moveToCall = vi.mocked(mockContext.moveTo).mock.calls[0];
      const quadraticCurveCall = vi.mocked(mockContext.quadraticCurveTo).mock
        .calls[0];
      const cubicCurveCall = vi.mocked(mockContext.bezierCurveTo).mock.calls[0];

      expect(moveToCall[0]).toBeCloseTo(110);
      expect(moveToCall[1]).toBeCloseTo(95);

      expect(quadraticCurveCall[0]).toBeCloseTo(135);
      expect(quadraticCurveCall[1]).toBeCloseTo(50);
      expect(quadraticCurveCall[2]).toBeCloseTo(170);
      expect(quadraticCurveCall[3]).toBeCloseTo(110);

      expect(cubicCurveCall[0]).toBeCloseTo(205);
      expect(cubicCurveCall[1]).toBeCloseTo(155);
      expect(cubicCurveCall[2]).toBeCloseTo(245);
      expect(cubicCurveCall[3]).toBeCloseTo(70);
      expect(cubicCurveCall[4]).toBeCloseTo(275);
      expect(cubicCurveCall[5]).toBeCloseTo(115);
    });
  });

  describe("strokeAlignment for rect", () => {
    it("draws stroke at original bounds when strokeAlignment is 'center' (default)", async () => {
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
  });

  describe("strokeAlignment for circle", () => {
    it("draws stroke at original radius when strokeAlignment is 'center' (default)", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.circle({
            cx: 200,
            cy: 200,
            radius: 50,
            strokeStyle: "#333",
            strokeWidth: 10,
            strokeAlignment: "center",
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      // Both fill and stroke should use original radius (50)
      expect(mockContext.ellipse).toHaveBeenCalledWith(
        200,
        200,
        50,
        50,
        0,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );
    });

    it("draws stroke with reduced radius when strokeAlignment is 'inside'", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.circle({
            cx: 200,
            cy: 200,
            radius: 50,
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

      // Fill uses original radius (50)
      expect(mockContext.ellipse).toHaveBeenCalledWith(
        200,
        200,
        50,
        50,
        0,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );
      // Stroke should use radius - strokeWidth/2 = 50 - 5 = 45
      expect(mockContext.ellipse).toHaveBeenCalledWith(
        200,
        200,
        45,
        45,
        0,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );
    });

    it("draws stroke with increased radius when strokeAlignment is 'outside'", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.circle({
            cx: 200,
            cy: 200,
            radius: 50,
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

      // Fill uses original radius (50)
      expect(mockContext.ellipse).toHaveBeenCalledWith(
        200,
        200,
        50,
        50,
        0,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );
      // Stroke should use radius + strokeWidth/2 = 50 + 5 = 55
      expect(mockContext.ellipse).toHaveBeenCalledWith(
        200,
        200,
        55,
        55,
        0,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );
    });
  });

  describe("strokeAlignment for ellipse", () => {
    it("draws stroke at original radii when strokeAlignment is 'center' (default)", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.ellipse({
            cx: 300,
            cy: 200,
            radiusX: 80,
            radiusY: 40,
            strokeStyle: "#333",
            strokeWidth: 10,
            strokeAlignment: "center",
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.ellipse).toHaveBeenCalledWith(
        300,
        200,
        80,
        40,
        0,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );
    });

    it("draws stroke with reduced radii when strokeAlignment is 'inside'", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.ellipse({
            cx: 300,
            cy: 200,
            radiusX: 80,
            radiusY: 40,
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

      // Fill uses original radii.
      expect(mockContext.ellipse).toHaveBeenCalledWith(
        300,
        200,
        80,
        40,
        0,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );

      // Stroke radii are reduced by strokeWidth/2 per axis.
      expect(mockContext.ellipse).toHaveBeenCalledWith(
        300,
        200,
        75,
        35,
        0,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );
    });

    it("draws stroke with increased radii when strokeAlignment is 'outside'", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.ellipse({
            cx: 300,
            cy: 200,
            radiusX: 80,
            radiusY: 40,
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

      // Fill uses original radii.
      expect(mockContext.ellipse).toHaveBeenCalledWith(
        300,
        200,
        80,
        40,
        0,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );

      // Stroke radii are increased by strokeWidth/2 per axis.
      expect(mockContext.ellipse).toHaveBeenCalledWith(
        300,
        200,
        85,
        45,
        0,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );
    });
  });

  describe("text rendering", () => {
    it("uses default text font properties when no font properties are provided", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.text("Hello", { x: 10, y: 20 });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.font).toBe("normal normal 12px Arial, sans-serif");
      expect(mockContext.fillText).toHaveBeenCalledWith("Hello", 10, 20);
      expect(mockContext.strokeText).toHaveBeenCalledWith("Hello", 10, 20);
    });

    it("applies base draw styles to text including stroke and decomposed font properties", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.withStyles(
            {
              fillStyle: "#ff0000",
              strokeStyle: "#00ff00",
              strokeWidth: 3,
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: "18px",
              fontFamily: "monospace",
              opacity: 0.4,
              blend: "screen",
            },
            () => {
              d.text("Styled", { x: 30, y: 40 });
            },
          );
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.font).toBe("italic 700 18px monospace");
      expect(mockContext.globalAlpha).toBe(0.4);
      expect(mockContext.globalCompositeOperation).toBe("screen");
      expect(mockContext.fillStyle).toBe("#ff0000");
      expect(mockContext.strokeStyle).toBe("#00ff00");
      expect(mockContext.lineWidth).toBe(3);
      expect(mockContext.fillText).toHaveBeenCalledWith("Styled", 30, 40);
      expect(mockContext.strokeText).toHaveBeenCalledWith("Styled", 30, 40);
    });

    it("supports text() fontStyle, fontSize, fontWeight and fontFamily props", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.text("Typed", {
            x: 16,
            y: 24,
            fontStyle: "oblique 12deg",
            fontWeight: "bold",
            fontSize: "20ch",
            fontFamily: '"Fredericka the Great", sans-serif',
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.font).toBe(
        'oblique 12deg bold 20ch "Fredericka the Great", sans-serif',
      );
      expect(mockContext.fillText).toHaveBeenCalledWith("Typed", 16, 24);
    });

    it("supports shorthand text() font prop and prioritizes it over decomposed font properties", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.text("Shorthand", {
            x: 50,
            y: 60,
            font: 'italic 500 24px "Fira Code", monospace',
            fontStyle: "normal",
            fontWeight: "normal",
            fontSize: "12px",
            fontFamily: "Arial, sans-serif",
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.font).toBe('italic 500 24px "Fira Code", monospace');
      expect(mockContext.fillText).toHaveBeenCalledWith("Shorthand", 50, 60);
    });

    it("exposes getTextBounds() with accurate bounds and stroke inflation", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      let measuredBounds: Bounds | undefined;

      drawContext.executeDrawCallback(
        (d) => {
          measuredBounds = d.getTextBounds("Hello", {
            x: 10,
            y: 20,
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: "18px",
            fontFamily: "monospace",
            strokeStyle: "#00ff00",
            strokeWidth: 4,
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(measuredBounds).toEqual({
        x: 8,
        y: 18,
        width: 54,
        height: 22,
      });
    });

    it("applies withStyles() font props when measuring with getTextBounds()", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();
      const measuredFonts: string[] = [];

      mockContext.measureText = vi.fn(function (
        this: CanvasRenderingContext2D,
        value: string,
      ) {
        measuredFonts.push(this.font);

        return {
          width: value.length * 10,
          actualBoundingBoxAscent: 10,
          actualBoundingBoxDescent: 2,
        } as TextMetrics;
      });

      let measuredBounds: Bounds | undefined;

      drawContext.executeDrawCallback(
        (d) => {
          d.withStyles(
            {
              font: 'oblique 14deg bold 16px "Fredericka the Great", serif',
              strokeStyle: "#123456",
              strokeWidth: 2,
            },
            () => {
              measuredBounds = d.getTextBounds("Hi", {
                x: 100,
                y: 40,
              });
            },
          );
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.measureText).toHaveBeenCalledWith("Hi");
      expect(measuredFonts).toContain(
        'oblique 14deg bold 16px "Fredericka the Great", serif',
      );
      expect(measuredBounds).toEqual({
        x: 99,
        y: 39,
        width: 22,
        height: 18,
      });
    });

    it("applies transforms to text", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.text("Hi", { x: 100, y: 50, rotate: 45 });
        },
        mockContext,
        800,
        600,
        0,
      );

      // "Hi" => width 20, ascent 10, descent 2
      // With textBaseline="top", bounds are x=100, y=50, width=20, height=12
      // center=(110, 56)
      expect(mockContext.translate).toHaveBeenCalledWith(110, 56);
      expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
      expect(mockContext.translate).toHaveBeenCalledWith(-110, -56);
    });

    describe("text clipping callback", () => {
      const originalDocument = globalThis.document;

      const createOffscreenContext = (): CanvasRenderingContext2D =>
        ({
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          scale: vi.fn(),
          font: "",
          globalAlpha: 1,
          globalCompositeOperation: "source-over",
          fillStyle: "",
          strokeStyle: "",
          lineWidth: 1,
          beginPath: vi.fn(),
          closePath: vi.fn(),
          clip: vi.fn(),
          rect: vi.fn(),
          arc: vi.fn(),
          ellipse: vi.fn(),
          quadraticCurveTo: vi.fn(),
          bezierCurveTo: vi.fn(),
          roundRect: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          fill: vi.fn(),
          stroke: vi.fn(),
          fillRect: vi.fn(),
          fillText: vi.fn(),
          strokeText: vi.fn(),
          drawImage: vi.fn(),
          measureText: vi.fn(
            (value: string) =>
              ({
                width: value.length * 10,
                actualBoundingBoxAscent: 10,
                actualBoundingBoxDescent: 2,
              }) as TextMetrics,
          ),
          canvas: { width: 800, height: 600 },
        }) as unknown as CanvasRenderingContext2D;

      afterEach(() => {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          writable: true,
          value: originalDocument,
        });
      });

      it("returns an Animatable when text() is used with a frame callback", async () => {
        const { createDrawContext } = await import("./index");
        const drawContext = createDrawContext();

        const offscreenContext = createOffscreenContext();
        const offscreenCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => offscreenContext),
        };

        Object.defineProperty(globalThis, "document", {
          configurable: true,
          writable: true,
          value: {
            createElement: vi.fn(() => offscreenCanvas),
          },
        });

        const textClipRef: { current: IAnimatableLike<any> | null } = {
          current: null,
        };

        drawContext.executeDrawCallback(
          (d) => {
            textClipRef.current = d.text(
              "Mask",
              { x: 120, y: 140, fontSize: "48px" },
              () => {
                d.circle({ cx: 130, cy: 150, radius: 20, fillStyle: "red" });
              },
            );
          },
          mockContext,
          800,
          600,
          0,
        );

        expect(textClipRef.current).not.toBeNull();

        if (!textClipRef.current) {
          throw new Error("Expected text() clip callback to return Animatable");
        }

        expect(typeof textClipRef.current.animateTo).toBe("function");
      });

      it("resolves text bounds once per frame regardless of useLocalCoordinateContext (memoized across getCompositeInfo/apply)", async () => {
        const offscreenContext = createOffscreenContext();
        const offscreenCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => offscreenContext),
        };

        Object.defineProperty(globalThis, "document", {
          configurable: true,
          writable: true,
          value: {
            createElement: vi.fn(() => offscreenCanvas),
          },
        });

        const renderWith = (useLocalCoordinateContext: boolean) => {
          vi.mocked(mockContext.measureText).mockClear();

          drawContextInstance.executeDrawCallback(
            (d) => {
              d.text(
                "Mask",
                { x: 120, y: 140, fontSize: "48px", useLocalCoordinateContext },
                () => {
                  d.circle({ cx: 10, cy: 10, radius: 5, fillStyle: "red" });
                },
              );
            },
            mockContext,
            800,
            600,
            0,
          );

          return vi.mocked(mockContext.measureText).mock.calls.length;
        };

        const { createDrawContext } = await import("./index");
        let drawContextInstance = createDrawContext();
        const withoutLocalContext = renderWith(false);

        drawContextInstance = createDrawContext();
        const withLocalContext = renderWith(true);

        // apply()'s bounds resolution (only needed when
        // useLocalCoordinateContext is set) reuses the bounds
        // getCompositeInfo already computed this frame, so turning the
        // flag on must not add an extra measureText() call.
        expect(withLocalContext).toBe(withoutLocalContext);
      });

      it("still masks a real but narrow/small piece of text instead of treating tiny measured bounds as invalid", async () => {
        const { createDrawContext } = await import("./index");
        const drawContext = createDrawContext();

        const offscreenContext = createOffscreenContext();
        // Force an unrealistically tiny measured width (< 0.5px) to
        // simulate a pathological font/glyph-metrics case for a real,
        // non-empty string — this must still be masked, not bypassed as if
        // it were empty/invalid.
        const tinyMeasureText = vi.fn(
          () =>
            ({
              width: 0.2,
              actualBoundingBoxAscent: 0.1,
              actualBoundingBoxDescent: 0,
            }) as TextMetrics,
        );
        offscreenContext.measureText = tinyMeasureText;
        mockContext.measureText = tinyMeasureText;

        const offscreenCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => offscreenContext),
        };

        Object.defineProperty(globalThis, "document", {
          configurable: true,
          writable: true,
          value: {
            createElement: vi.fn(() => offscreenCanvas),
          },
        });

        drawContext.executeDrawCallback(
          (d) => {
            // strokeStyle: "transparent" avoids the ambient default stroke
            // width (1px) inflating these deliberately tiny bounds back
            // above the old 0.5px threshold before the validity check runs.
            d.text(
              "i",
              { x: 10, y: 10, fontSize: "1px", strokeStyle: "transparent" },
              () => {
                d.circle({ cx: 0, cy: 0, radius: 1, fillStyle: "red" });
              },
            );
          },
          mockContext,
          800,
          600,
          0,
        );

        expect(offscreenContext.fillText).toHaveBeenCalled();
        expect(mockContext.drawImage).toHaveBeenCalled();
      });

      it("uses fillText-only masking and renders nested draws to offscreen context", async () => {
        const { createDrawContext } = await import("./index");
        const drawContext = createDrawContext();

        const offscreenContext = createOffscreenContext();
        const offscreenCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => offscreenContext),
        };

        Object.defineProperty(globalThis, "document", {
          configurable: true,
          writable: true,
          value: {
            createElement: vi.fn(() => offscreenCanvas),
          },
        });

        drawContext.executeDrawCallback(
          (d) => {
            d.text("Mask", { x: 120, y: 140, fontSize: "48px" }, () => {
              d.circle({ cx: 130, cy: 150, radius: 20, fillStyle: "red" });
            });
          },
          mockContext,
          800,
          600,
          0,
        );

        expect(offscreenContext.ellipse).toHaveBeenCalled();
        expect(offscreenContext.fillText).toHaveBeenCalledWith(
          "Mask",
          120,
          140,
        );
        expect(offscreenContext.strokeText).not.toHaveBeenCalled();

        // The mask's offscreen surface is now sized and positioned to the
        // text's own local bounds — not the full canvas blitted at (0,0) —
        // which is the whole point of local-bounds bitmap caching. Bounds
        // are computed with the same ambient default stroke style/width
        // appliedStylesManager merges in before text() ever sees its props.
        const bounds = getTextBounds(mockContext, "Mask", {
          x: 120,
          y: 140,
          fontSize: "48px",
          strokeStyle: "#333",
          strokeWidth: 1,
        });
        expect(mockContext.drawImage).toHaveBeenCalledWith(
          offscreenCanvas,
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
        );
      });

      it("supports mixed scope nesting: text mask containing rect clip containing image", async () => {
        vi.resetModules();

        const readySource = {} as CanvasImageSource;
        const getReadyAssetMock = vi.fn(() => ({
          source: readySource,
          width: 320,
          height: 180,
        }));

        vi.doMock("../core/ImageAssetCache", () => ({
          imageAssetCache: {
            preload: vi.fn(),
            getReadyAsset: getReadyAssetMock,
          },
        }));

        const { createDrawContext } = await import("./index");
        const drawContext = createDrawContext();

        const offscreenContext = createOffscreenContext();
        const offscreenCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => offscreenContext),
        };

        Object.defineProperty(globalThis, "document", {
          configurable: true,
          writable: true,
          value: {
            createElement: vi.fn(() => offscreenCanvas),
          },
        });

        drawContext.executeDrawCallback(
          (d) => {
            d.text("Mask", { x: 80, y: 90, fontSize: "36px" }, () => {
              d.rect({ x: 100, y: 100, width: 120, height: 80 }, () => {
                d.image("https://example.com/masked.png", {
                  x: 90,
                  y: 90,
                  width: 140,
                  height: 100,
                });
              });
            });
          },
          mockContext,
          800,
          600,
          0,
        );

        expect(getReadyAssetMock).toHaveBeenCalledWith(
          "https://example.com/masked.png",
        );

        expect(offscreenContext.roundRect).toHaveBeenCalledWith(
          100,
          100,
          120,
          80,
          0,
        );
        expect(offscreenContext.clip).toHaveBeenCalled();

        expect(offscreenContext.drawImage).toHaveBeenCalled();
        const drawImageCalls = vi.mocked(offscreenContext.drawImage).mock.calls;
        const latestDrawImageCall = drawImageCalls[drawImageCalls.length - 1];

        if (!latestDrawImageCall) {
          throw new Error("Expected offscreen drawImage call");
        }

        expect(latestDrawImageCall[0]).toBe(readySource);
        expect(latestDrawImageCall.slice(-4)).toEqual([90, 90, 140, 100]);

        expect(offscreenContext.fillText).toHaveBeenCalledWith("Mask", 80, 90);
        expect(offscreenContext.strokeText).not.toHaveBeenCalled();

        const bounds = getTextBounds(mockContext, "Mask", {
          x: 80,
          y: 90,
          fontSize: "36px",
          strokeStyle: "#333",
          strokeWidth: 1,
        });
        expect(mockContext.drawImage).toHaveBeenCalledWith(
          offscreenCanvas,
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
        );

        vi.doUnmock("../core/ImageAssetCache");
      });
    });
  });

  describe("blend rendering", () => {
    it("defaults blend mode to source-over when blend is omitted", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      mockContext.globalCompositeOperation = "multiply";

      drawContext.executeDrawCallback(
        (d) => {
          d.line({
            start: { x: 0, y: 0 },
            end: { x: 100, y: 100 },
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.globalCompositeOperation).toBe("source-over");
    });

    it("applies blend mode from withStyles context", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.withStyles({ blend: "multiply" }, () => {
            d.circle({ cx: 100, cy: 100, radius: 30 });
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.globalCompositeOperation).toBe("multiply");
    });

    it("allows shape blend to override withStyles blend", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.withStyles({ blend: "multiply" }, () => {
            d.circle({
              cx: 100,
              cy: 100,
              radius: 30,
              blend: "screen",
            });
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.globalCompositeOperation).toBe("screen");
    });
  });

  describe("image rendering integration", () => {
    it("draws image when ImageAssetCache returns a ready asset", async () => {
      vi.resetModules();

      const readySource = {} as CanvasImageSource;
      const getReadyAssetMock = vi.fn(() => ({
        source: readySource,
        width: 320,
        height: 180,
      }));

      vi.doMock("../core/ImageAssetCache", () => ({
        imageAssetCache: {
          preload: vi.fn(),
          getReadyAsset: getReadyAssetMock,
        },
      }));

      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.image("https://example.com/ready.png", { x: 12, y: 34 });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(getReadyAssetMock).toHaveBeenCalledWith(
        "https://example.com/ready.png",
      );
      expect(mockContext.drawImage).toHaveBeenCalledWith(readySource, 12, 34);

      vi.doUnmock("../core/ImageAssetCache");
    });

    it("does not draw when ImageAssetCache has no ready asset", async () => {
      vi.resetModules();

      const getReadyAssetMock = vi.fn(() => null);

      vi.doMock("../core/ImageAssetCache", () => ({
        imageAssetCache: {
          preload: vi.fn(),
          getReadyAsset: getReadyAssetMock,
        },
      }));

      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.image("https://example.com/pending.png", { x: 10, y: 20 });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(getReadyAssetMock).toHaveBeenCalledWith(
        "https://example.com/pending.png",
      );
      expect(mockContext.drawImage).not.toHaveBeenCalled();

      vi.doUnmock("../core/ImageAssetCache");
    });

    it("uses cover fit by default when width and height are provided", async () => {
      vi.resetModules();

      const readySource = {} as CanvasImageSource;
      const getReadyAssetMock = vi.fn(() => ({
        source: readySource,
        width: 400,
        height: 200,
      }));

      vi.doMock("../core/ImageAssetCache", () => ({
        imageAssetCache: {
          preload: vi.fn(),
          getReadyAsset: getReadyAssetMock,
        },
      }));

      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.image("https://example.com/cover.png", {
            x: 10,
            y: 20,
            width: 100,
            height: 100,
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(getReadyAssetMock).toHaveBeenCalledWith(
        "https://example.com/cover.png",
      );
      expect(mockContext.drawImage).toHaveBeenCalledWith(
        readySource,
        100,
        0,
        200,
        200,
        10,
        20,
        100,
        100,
      );

      vi.doUnmock("../core/ImageAssetCache");
    });

    it("uses contain fit when specified", async () => {
      vi.resetModules();

      const readySource = {} as CanvasImageSource;
      const getReadyAssetMock = vi.fn(() => ({
        source: readySource,
        width: 400,
        height: 200,
      }));

      vi.doMock("../core/ImageAssetCache", () => ({
        imageAssetCache: {
          preload: vi.fn(),
          getReadyAsset: getReadyAssetMock,
        },
      }));

      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.image("https://example.com/contain.png", {
            x: 10,
            y: 20,
            width: 100,
            height: 100,
            fit: "contain",
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(getReadyAssetMock).toHaveBeenCalledWith(
        "https://example.com/contain.png",
      );
      expect(mockContext.drawImage).toHaveBeenCalledWith(
        readySource,
        10,
        45,
        100,
        50,
      );

      vi.doUnmock("../core/ImageAssetCache");
    });

    it("uses stretch fit when specified", async () => {
      vi.resetModules();

      const readySource = {} as CanvasImageSource;
      const getReadyAssetMock = vi.fn(() => ({
        source: readySource,
        width: 400,
        height: 200,
      }));

      vi.doMock("../core/ImageAssetCache", () => ({
        imageAssetCache: {
          preload: vi.fn(),
          getReadyAsset: getReadyAssetMock,
        },
      }));

      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.image("https://example.com/stretch.png", {
            x: 10,
            y: 20,
            width: 100,
            height: 100,
            fit: "stretch",
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(getReadyAssetMock).toHaveBeenCalledWith(
        "https://example.com/stretch.png",
      );
      expect(mockContext.drawImage).toHaveBeenCalledWith(
        readySource,
        10,
        20,
        100,
        100,
      );

      vi.doUnmock("../core/ImageAssetCache");
    });

    it("falls back to natural dimensions when only width is provided", async () => {
      vi.resetModules();

      const readySource = {} as CanvasImageSource;
      const getReadyAssetMock = vi.fn(() => ({
        source: readySource,
        width: 400,
        height: 200,
      }));

      vi.doMock("../core/ImageAssetCache", () => ({
        imageAssetCache: {
          preload: vi.fn(),
          getReadyAsset: getReadyAssetMock,
        },
      }));

      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.image("https://example.com/partial-dimensions.png", {
            x: 10,
            y: 20,
            width: 100,
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(getReadyAssetMock).toHaveBeenCalledWith(
        "https://example.com/partial-dimensions.png",
      );
      expect(mockContext.drawImage).toHaveBeenCalledWith(readySource, 10, 20);

      vi.doUnmock("../core/ImageAssetCache");
    });

    it("does not draw when scaled width or height is non-positive", async () => {
      vi.resetModules();

      const readySource = {} as CanvasImageSource;
      const getReadyAssetMock = vi.fn(() => ({
        source: readySource,
        width: 400,
        height: 200,
      }));

      vi.doMock("../core/ImageAssetCache", () => ({
        imageAssetCache: {
          preload: vi.fn(),
          getReadyAsset: getReadyAssetMock,
        },
      }));

      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.image("https://example.com/non-positive-dimensions.png", {
            x: 10,
            y: 20,
            width: 0,
            height: 100,
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(getReadyAssetMock).toHaveBeenCalledWith(
        "https://example.com/non-positive-dimensions.png",
      );
      expect(mockContext.drawImage).not.toHaveBeenCalled();

      vi.doUnmock("../core/ImageAssetCache");
    });

    it("uses scaled frame dimensions for transform origin", async () => {
      vi.resetModules();

      const readySource = {} as CanvasImageSource;
      const getReadyAssetMock = vi.fn(() => ({
        source: readySource,
        width: 400,
        height: 200,
      }));

      vi.doMock("../core/ImageAssetCache", () => ({
        imageAssetCache: {
          preload: vi.fn(),
          getReadyAsset: getReadyAssetMock,
        },
      }));

      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.image("https://example.com/scaled-rotate.png", {
            x: 10,
            y: 20,
            width: 100,
            height: 50,
            rotate: 45,
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      // Default rotateOrigin is center, so use the scaled frame bounds.
      expect(mockContext.translate).toHaveBeenCalledWith(60, 45);
      expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
      expect(mockContext.translate).toHaveBeenCalledWith(-60, -45);

      vi.doUnmock("../core/ImageAssetCache");
    });
  });

  describe("rect clipping callback", () => {
    it("returns an Animatable when using the frame callback", async () => {
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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

    it("group() exposes static measurements when width and height are explicitly provided", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();
      const frameValues = {
        width: -1,
        height: -1,
        centerX: -1,
        centerY: -1,
      };

      drawContext.executeDrawCallback(
        (d) => {
          d.group(
            ({ measurements }) => {
              frameValues.width = measurements.width;
              frameValues.height = measurements.height;
              frameValues.centerX = measurements.center.x;
              frameValues.centerY = measurements.center.y;

              d.rect({
                x: 100,
                y: 200,
                width: 40,
                height: 20,
                fillStyle: "red",
              });
            },
            { x: 10, y: 20, width: 200, height: 120 },
          );
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(frameValues).toEqual({
        width: 200,
        height: 120,
        centerX: 110,
        centerY: 80,
      });
    });

    it("layer() uses explicit bounds when provided", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();
      const frameValues = {
        width: -1,
        height: -1,
        centerX: -1,
        centerY: -1,
      };

      drawContext.executeDrawCallback(
        (d) => {
          d.layer(
            (frameContext) => {
              d.rect({
                x: 100,
                y: 200,
                width: 40,
                height: 20,
                fillStyle: "red",
              });
              frameValues.width = frameContext.measurements.width;
              frameValues.height = frameContext.measurements.height;
              frameValues.centerX = frameContext.measurements.center.x;
              frameValues.centerY = frameContext.measurements.center.y;
            },
            { x: 0, y: 0, width: 200, height: 100, rotate: 45 },
          );
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(frameValues).toEqual({
        width: 200,
        height: 100,
        centerX: 100,
        centerY: 50,
      });

      expect(mockContext.translate).toHaveBeenCalledWith(100, 50);
      expect(mockContext.translate).toHaveBeenCalledWith(-100, -50);
    });

    it("layer() callback exposes static measurements when explicitly sized", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();
      const frameValues = {
        width: -1,
        height: -1,
        centerX: -1,
        centerY: -1,
      };

      drawContext.executeDrawCallback(
        (d) => {
          d.layer(
            ({ measurements }) => {
              frameValues.width = measurements.width;
              frameValues.height = measurements.height;
              frameValues.centerX = measurements.center.x;
              frameValues.centerY = measurements.center.y;
            },
            { x: 10, y: 20, width: 200, height: 120 },
          );
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(frameValues).toEqual({
        width: 200,
        height: 120,
        centerX: 100,
        centerY: 60,
      });
    });

    it("layer() provides derived frame values when context is destructured before drawing children", async () => {
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      const render = (d: DrawMethods) => {
        d.group(
          () => {
            d.rect({ x: 100, y: 200, width: 40, height: 20, fillStyle: "red" });
          },
          { showBounds: true },
        ).animateTo({ x: 200 }, { at: 0, duration: 1000 });
      };

      drawContext.executeDrawCallback(
        (d) => render(d),
        mockContext,
        800,
        600,
        0,
      );

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
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      const render = (d: DrawMethods) => {
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

      drawContext.executeDrawCallback(
        (d) => render(d),
        mockContext,
        800,
        600,
        0,
      );

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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      const render = (d: DrawMethods) => {
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

      drawContext.executeDrawCallback(
        (d) => render(d),
        mockContext,
        800,
        600,
        0,
      );

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
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      const render = (d: DrawMethods) => {
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

      drawContext.executeDrawCallback(
        (d) => render(d),
        mockContext,
        800,
        600,
        0,
      );

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

    it("layer() rotate basis uses explicit x/y and origin-aware local frame size", async () => {
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      const render = (d: DrawMethods) => {
        d.group(
          () => {
            d.rect({ x: 100, y: 200, width: 40, height: 20, fillStyle: "red" });
          },
          { rotate: 0 },
        ).animateTo({ rotate: 45 }, { at: 0, duration: 1000 });
      };

      drawContext.executeDrawCallback(
        (d) => render(d),
        mockContext,
        800,
        600,
        0,
      );
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
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      const render = (d: DrawMethods) => {
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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
      const { createDrawContext } = await import("./index");
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

      const renderCallback = (d: DrawMethods) => {
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
      const { createDrawContext } = await import("./index");
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

      const renderCallback = (d: DrawMethods) => {
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
      const { createDrawContext } = await import("./index");
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

      const renderCallback = (d: DrawMethods) => {
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
      const { createDrawContext } = await import("./index");
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
      expect(maskSurface!.context.fillText).toHaveBeenCalledWith(
        "Mask",
        20,
        20,
      );
      // The masked content drew into that same isolated local surface, not
      // directly onto the rotated ancestor's own surface.
      expect(maskSurface!.context.ellipse).toHaveBeenCalled();

      (globalThis as any).OffscreenCanvas = previousOffscreenCanvas;
    });
  });

  describe("framed clipping for closed path primitives", () => {
    it("supports circle as a clipping frame", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.circle({ cx: 200, cy: 200, radius: 100 }, () => {
            d.line({
              start: { x: 0, y: 0 },
              end: { x: 400, y: 400 },
              strokeStyle: "#f00",
            });
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.clip).toHaveBeenCalled();
      expect(mockContext.arc).toHaveBeenCalledWith(
        200,
        200,
        100,
        0,
        Math.PI * 2,
      );
      expect(mockContext.lineTo).toHaveBeenCalledWith(400, 400);
    });

    it("supports ellipse as a clipping frame", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.ellipse({ cx: 250, cy: 220, radiusX: 120, radiusY: 80 }, () => {
            d.line({
              start: { x: 0, y: 220 },
              end: { x: 500, y: 220 },
              strokeStyle: "#0f0",
            });
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.clip).toHaveBeenCalled();
      expect(mockContext.ellipse).toHaveBeenCalledWith(
        250,
        220,
        120,
        80,
        0,
        0,
        Math.PI * 2,
      );
      expect(mockContext.lineTo).toHaveBeenCalledWith(500, 220);
    });

    it("supports closed arc as a clipping frame", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.arc(
            {
              cx: 240,
              cy: 240,
              radius: 120,
              start: 30,
              end: 320,
              closePath: true,
            },
            () => {
              d.line({
                start: { x: 80, y: 240 },
                end: { x: 400, y: 240 },
                strokeStyle: "#0a0",
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
      const clippedArcCall = vi.mocked(mockContext.ellipse).mock.calls[0];
      expect(clippedArcCall[0]).toBe(240);
      expect(clippedArcCall[1]).toBe(240);
      expect(clippedArcCall[2]).toBe(120);
      expect(clippedArcCall[3]).toBe(120);
      expect(clippedArcCall[4]).toBe(0);
      expect(clippedArcCall[5]).toBeCloseTo(
        (30 * Math.PI) / 180 - Math.PI / 2,
        12,
      );
      expect(clippedArcCall[6]).toBeCloseTo(
        (320 * Math.PI) / 180 - Math.PI / 2,
        12,
      );
      expect(mockContext.closePath).toHaveBeenCalled();
      expect(mockContext.lineTo).toHaveBeenCalledWith(400, 240);
    });

    it("supports closed polygon as a clipping frame", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.polygon(
            {
              points: [
                { x: 100, y: 100 },
                { x: 300, y: 100 },
                { x: 200, y: 280 },
              ],
              closePath: true,
            },
            () => {
              d.circle({ cx: 200, cy: 150, radius: 120, fillStyle: "#00f" });
            },
          );
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.clip).toHaveBeenCalled();
      expect(mockContext.closePath).toHaveBeenCalled();
      expect(mockContext.ellipse).toHaveBeenCalled();
    });

    it("supports closed bezier as a clipping frame", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.bezier(
            {
              segments: [
                {
                  point: { x: 100, y: 120 },
                },
                {
                  control: { x: 140, y: 80 },
                  point: { x: 180, y: 120 },
                },
                {
                  control: { x: 220, y: 160 },
                  point: { x: 100, y: 120 },
                },
              ],
            },
            () => {
              d.circle({ cx: 150, cy: 120, radius: 60, fillStyle: "#00f" });
            },
          );
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.clip).toHaveBeenCalled();
      expect(mockContext.quadraticCurveTo).toHaveBeenCalled();
      expect(mockContext.closePath).toHaveBeenCalled();
      expect(mockContext.ellipse).toHaveBeenCalled();
    });

    it("treats non-closed polygon frame as empty clip region", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.polygon(
            {
              points: [
                { x: 100, y: 100 },
                { x: 300, y: 100 },
                { x: 200, y: 280 },
              ],
              closePath: false,
            },
            () => {
              d.circle({ cx: 200, cy: 150, radius: 120, fillStyle: "#00f" });
            },
          );
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.rect).toHaveBeenCalledWith(0, 0, 0, 0);
      expect(mockContext.clip).toHaveBeenCalled();
    });

    it("treats non-closed bezier frame as empty clip region", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.bezier(
            {
              segments: [
                {
                  point: { x: 100, y: 120 },
                },
                {
                  control: { x: 140, y: 80 },
                  point: { x: 180, y: 120 },
                },
              ],
              closePath: false,
            },
            () => {
              d.circle({ cx: 150, cy: 120, radius: 60, fillStyle: "#00f" });
            },
          );
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.rect).toHaveBeenCalledWith(0, 0, 0, 0);
      expect(mockContext.clip).toHaveBeenCalled();
    });

    it("uses a closed path for arc clipping even when closePath is false", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.arc(
            {
              cx: 240,
              cy: 240,
              radius: 120,
              start: 30,
              end: 320,
              closePath: false,
            },
            () => {
              d.circle({ cx: 240, cy: 240, radius: 80, fillStyle: "#f80" });
            },
          );
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(mockContext.rect).not.toHaveBeenCalledWith(0, 0, 0, 0);
      expect(mockContext.closePath).toHaveBeenCalled();
      expect(mockContext.clip).toHaveBeenCalled();
      expect(mockContext.ellipse).toHaveBeenCalled();
    });
  });

  describe("isometric overlay warnings", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("warns only once when 2D primitives are called inside isometric(), even across frames", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.isometric(() => {
            d.rect({ x: 10, y: 20, width: 30, height: 40 });
            d.rect({ x: 40, y: 60, width: 30, height: 40 });
            d.circle({ cx: 100, cy: 120, radius: 12 });
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      drawContext.executeDrawCallback(
        (d) => {
          d.isometric(() => {
            d.circle({ cx: 150, cy: 150, radius: 16 });
          });
        },
        mockContext,
        800,
        600,
        16,
      );

      const warningMessages = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((message) =>
          message.includes("[liminalis] 2D shape primitive"),
        );

      expect(warningMessages).toHaveLength(1);
    });

    it("does not warn for 2D primitives used outside isometric()", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.rect({ x: 10, y: 20, width: 30, height: 40 });
          d.circle({ cx: 100, cy: 120, radius: 12 });
        },
        mockContext,
        800,
        600,
        0,
      );

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("respects top-level draw order between circle and isometric cuboid", async () => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.circle({
            cx: 200,
            cy: 200,
            radius: 120,
            fillStyle: "#fff",
            strokeStyle: "transparent",
          });

          d.isometric(({ cuboid }) => {
            cuboid({
              isoX: 0,
              isoY: 0,
              isoZ: -10,
              lengthX: 10,
              lengthY: 10,
              lengthZ: 10,
            });
          });
        },
        mockContext,
        800,
        600,
        0,
      );

      const circleOrder = vi.mocked(mockContext.ellipse).mock
        .invocationCallOrder[0];
      const isometricOrder = vi.mocked(mockContext.moveTo).mock
        .invocationCallOrder[0];

      expect(circleOrder).toBeDefined();
      expect(isometricOrder).toBeDefined();

      if (circleOrder === undefined || isometricOrder === undefined) {
        throw new Error("Expected both circle and isometric draw calls");
      }

      expect(circleOrder).toBeLessThan(isometricOrder);
    });
  });
});

// Each test below scopes its own IsometricView mock via vi.doMock +
// vi.resetModules + a fresh dynamic import, rather than a single file-level
// vi.mock("./IsometricView", ...) — vi.mock is hoisted and applies to the
// *entire* module, so a lightweight construction-only stand-in here would
// otherwise leak into the "isometric overlay warnings" tests above, which
// need cuboid()/addCuboidAt() to actually run against the real
// IsometricView. Mirrors the vi.doMock("../core/ImageAssetCache", ...)
// pattern used elsewhere in this file for the same reason.
describe("isometric() default viewport sizing", () => {
  it("defaults to the outer canvas size at the top level", async () => {
    vi.resetModules();
    vi.doMock("./IsometricView", () => {
      class MockIsometricView {
        static calls: Array<{ width: number; height: number }> = [];

        constructor(_context: unknown, width: number, height: number) {
          MockIsometricView.calls.push({ width, height });
        }

        render(): void {}
      }

      return { default: MockIsometricView };
    });

    const { createDrawContext } = await import("./index");
    const { default: MockedIsometricView } = (await import(
      "./IsometricView"
    )) as unknown as {
      default: { calls: Array<{ width: number; height: number }> };
    };

    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.isometric(() => {});
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(MockedIsometricView.calls).toEqual([{ width: 800, height: 600 }]);

    vi.doUnmock("./IsometricView");
  });

  it("defaults to the nearest enclosing container's measurements when nested in layer()", async () => {
    vi.resetModules();
    vi.doMock("./IsometricView", () => {
      class MockIsometricView {
        static calls: Array<{ width: number; height: number }> = [];

        constructor(_context: unknown, width: number, height: number) {
          MockIsometricView.calls.push({ width, height });
        }

        render(): void {}
      }

      return { default: MockIsometricView };
    });

    const { createDrawContext } = await import("./index");
    const { default: MockedIsometricView } = (await import(
      "./IsometricView"
    )) as unknown as {
      default: { calls: Array<{ width: number; height: number }> };
    };

    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.layer(
          () => {
            d.isometric(() => {});
          },
          { x: 0, y: 0, width: 200, height: 100 },
        );
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(MockedIsometricView.calls).toEqual([{ width: 200, height: 100 }]);

    vi.doUnmock("./IsometricView");
  });

  it("defaults to the innermost container's measurements when doubly nested", async () => {
    vi.resetModules();
    vi.doMock("./IsometricView", () => {
      class MockIsometricView {
        static calls: Array<{ width: number; height: number }> = [];

        constructor(_context: unknown, width: number, height: number) {
          MockIsometricView.calls.push({ width, height });
        }

        render(): void {}
      }

      return { default: MockIsometricView };
    });

    const { createDrawContext } = await import("./index");
    const { default: MockedIsometricView } = (await import(
      "./IsometricView"
    )) as unknown as {
      default: { calls: Array<{ width: number; height: number }> };
    };

    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.layer(
          () => {
            d.group(
              () => {
                d.isometric(() => {});
              },
              { x: 0, y: 0, width: 50, height: 40 },
            );
          },
          { x: 0, y: 0, width: 200, height: 100 },
        );
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(MockedIsometricView.calls).toEqual([{ width: 50, height: 40 }]);

    vi.doUnmock("./IsometricView");
  });

  it("still honors an explicit width/height even when nested", async () => {
    vi.resetModules();
    vi.doMock("./IsometricView", () => {
      class MockIsometricView {
        static calls: Array<{ width: number; height: number }> = [];

        constructor(_context: unknown, width: number, height: number) {
          MockIsometricView.calls.push({ width, height });
        }

        render(): void {}
      }

      return { default: MockIsometricView };
    });

    const { createDrawContext } = await import("./index");
    const { default: MockedIsometricView } = (await import(
      "./IsometricView"
    )) as unknown as {
      default: { calls: Array<{ width: number; height: number }> };
    };

    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.layer(
          () => {
            d.isometric(() => {}, { width: 30, height: 20 });
          },
          { x: 0, y: 0, width: 200, height: 100 },
        );
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(MockedIsometricView.calls).toEqual([{ width: 30, height: 20 }]);

    vi.doUnmock("./IsometricView");
  });

  it("reverts to the outer canvas size again after leaving the container", async () => {
    vi.resetModules();
    vi.doMock("./IsometricView", () => {
      class MockIsometricView {
        static calls: Array<{ width: number; height: number }> = [];

        constructor(_context: unknown, width: number, height: number) {
          MockIsometricView.calls.push({ width, height });
        }

        render(): void {}
      }

      return { default: MockIsometricView };
    });

    const { createDrawContext } = await import("./index");
    const { default: MockedIsometricView } = (await import(
      "./IsometricView"
    )) as unknown as {
      default: { calls: Array<{ width: number; height: number }> };
    };

    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.layer(() => {}, { x: 0, y: 0, width: 200, height: 100 });
        d.isometric(() => {});
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(MockedIsometricView.calls).toEqual([{ width: 800, height: 600 }]);

    vi.doUnmock("./IsometricView");
  });
});

const createMockContext = (): CanvasRenderingContext2D =>
  ({
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    beginPath: () => {},
    closePath: () => {},
    clip: () => {},
    rect: () => {},
    roundRect: () => {},
    arc: () => {},
    ellipse: () => {},
    moveTo: () => {},
    lineTo: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {},
    drawImage: () => {},
    measureText: () => ({ width: 0 }) as TextMetrics,
    canvas: { width: 800, height: 600 },
  }) as unknown as CanvasRenderingContext2D;

describe("place()", () => {
  it("injects the ambient DrawMethods and the component's own props into render", () => {
    const mockContext = createMockContext();
    const drawContext = createDrawContext();
    const seenCircleArgs: unknown[] = [];
    let sawMeasurements: { width: number; height: number } | null = null;

    const logo = createLayer<{ fillStyle: string }>(
      ({ props, circle, measurements }) => {
        sawMeasurements = {
          width: measurements.width,
          height: measurements.height,
        };
        circle({ cx: 0, cy: 0, radius: 10, fillStyle: props.fillStyle });
        seenCircleArgs.push(props.fillStyle);
      },
    );

    drawContext.executeDrawCallback(
      (d) => {
        d.place(logo({ fillStyle: "red" }), {
          x: 0,
          y: 0,
          width: 50,
          height: 50,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(seenCircleArgs).toEqual(["red"]);
    expect(sawMeasurements).toEqual({ width: 50, height: 50 });
  });

  it("positions the component like layer() (translates to x/y)", () => {
    const mockContext = createMockContext();
    const drawContext = createDrawContext();
    const translateCalls: Array<[number, number]> = [];
    (mockContext as any).translate = (x: number, y: number) =>
      translateCalls.push([x, y]);

    // Clip scopes are applied lazily, when a leaf primitive inside the
    // container is actually rendered — an empty component has nothing to
    // position, so this needs real content to observe the translate.
    const marker = createLayer(({ rect }) => {
      rect({ x: 0, y: 0, width: 5, height: 5, fillStyle: "red" });
    });

    drawContext.executeDrawCallback(
      (d) => {
        d.place(marker(), { x: 100, y: 50, width: 10, height: 10 });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(translateCalls).toContainEqual([100, 50]);
  });

  it("supports recursive composition: a component can place another component", () => {
    const innerRenderOrder: string[] = [];

    const inner = createLayer<{ label: string }>(({ props }) => {
      innerRenderOrder.push(props.label);
    });

    const outer = createLayer(({ place }) => {
      place(inner({ label: "child-a" }), { x: 0, y: 0, width: 10, height: 10 });
      place(inner({ label: "child-b" }), {
        x: 10,
        y: 0,
        width: 10,
        height: 10,
      });
    });

    const drawContext = createDrawContext();
    drawContext.executeDrawCallback(
      (d) => {
        d.place(outer(), { x: 0, y: 0, width: 20, height: 10 });
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(innerRenderOrder).toEqual(["child-a", "child-b"]);
  });

  it("keeps a placed component's animation identity stable by key even when list order changes across frames", () => {
    const marker = createLayer<{ label: string }>(() => {});
    const drawContext = createDrawContext();
    const mockContext = createMockContext();

    const renderFrame = (labels: string[], timeInMs: number) => {
      const captured: Record<string, unknown> = {};

      drawContext.executeDrawCallback(
        (d) => {
          for (const label of labels) {
            captured[label] = d.place(marker({ label }), {
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              key: label,
            });
          }
        },
        mockContext,
        800,
        600,
        timeInMs,
      );

      return captured;
    };

    const frame1 = renderFrame(["a", "b"], 0);
    // Frame 2: the same two keyed items, called in the opposite order.
    const frame2 = renderFrame(["b", "a"], 100);

    expect(frame2.a).toBe(frame1.a);
    expect(frame2.b).toBe(frame1.b);
  });

  it("without a key, reordering placed components across frames shifts identity", () => {
    const marker = createLayer<{ label: string }>(() => {});
    const drawContext = createDrawContext();
    const mockContext = createMockContext();

    const renderFrame = (labels: string[], timeInMs: number) => {
      const captured: Record<string, unknown> = {};

      drawContext.executeDrawCallback(
        (d) => {
          for (const label of labels) {
            captured[label] = d.place(marker({ label }), {
              x: 0,
              y: 0,
              width: 10,
              height: 10,
            });
          }
        },
        mockContext,
        800,
        600,
        timeInMs,
      );

      return captured;
    };

    const frame1 = renderFrame(["a", "b"], 0);
    const frame2 = renderFrame(["b", "a"], 100);

    // Positional identity: whichever item is called first now owns the slot
    // that used to belong to "a" — this is exactly the fragility the `key`
    // option (previous test) opts out of.
    expect(frame2.b).toBe(frame1.a);
    expect(frame2.a).toBe(frame1.b);
  });
});
