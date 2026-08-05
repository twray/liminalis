import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BezierProps } from "./drawMethods";

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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      expect(mockContext.arc).toHaveBeenCalledWith(
        200,
        200,
        50,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );
    });

    it("draws stroke with reduced radius when strokeAlignment is 'inside'", async () => {
      const { createDrawContext } = await import("./drawMethods");
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
      expect(mockContext.arc).toHaveBeenCalledWith(
        200,
        200,
        50,
        0,
        Math.PI * 2,
      );
      // Stroke should use radius - strokeWidth/2 = 50 - 5 = 45
      expect(mockContext.arc).toHaveBeenCalledWith(
        200,
        200,
        45,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );
    });

    it("draws stroke with increased radius when strokeAlignment is 'outside'", async () => {
      const { createDrawContext } = await import("./drawMethods");
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
      expect(mockContext.arc).toHaveBeenCalledWith(
        200,
        200,
        50,
        0,
        Math.PI * 2,
      );
      // Stroke should use radius + strokeWidth/2 = 50 + 5 = 55
      expect(mockContext.arc).toHaveBeenCalledWith(
        200,
        200,
        55,
        -Math.PI / 2,
        (Math.PI * 3) / 2,
      );
    });
  });

  describe("strokeAlignment for ellipse", () => {
    it("draws stroke at original radii when strokeAlignment is 'center' (default)", async () => {
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
        0,
        Math.PI * 2,
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
      const { createDrawContext } = await import("./drawMethods");
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
        0,
        Math.PI * 2,
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
    it('uses default font style "12pt sans-serif" when fontStyle is not provided', async () => {
      const { createDrawContext } = await import("./drawMethods");
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

      expect(mockContext.font).toBe("12pt sans-serif");
      expect(mockContext.fillText).toHaveBeenCalledWith("Hello", 10, 20);
      expect(mockContext.strokeText).not.toHaveBeenCalled();
    });

    it("applies base draw styles to text including stroke and font style", async () => {
      const { createDrawContext } = await import("./drawMethods");
      const drawContext = createDrawContext();

      drawContext.executeDrawCallback(
        (d) => {
          d.withStyles(
            {
              fillStyle: "#ff0000",
              strokeStyle: "#00ff00",
              strokeWidth: 3,
              fontStyle: "18px monospace",
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

      expect(mockContext.font).toBe("18px monospace");
      expect(mockContext.globalAlpha).toBe(0.4);
      expect(mockContext.globalCompositeOperation).toBe("screen");
      expect(mockContext.fillStyle).toBe("#ff0000");
      expect(mockContext.strokeStyle).toBe("#00ff00");
      expect(mockContext.lineWidth).toBe(3);
      expect(mockContext.fillText).toHaveBeenCalledWith("Styled", 30, 40);
      expect(mockContext.strokeText).toHaveBeenCalledWith("Styled", 30, 40);
    });

    it("applies transforms to text", async () => {
      const { createDrawContext } = await import("./drawMethods");
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
  });

  describe("blend rendering", () => {
    it("defaults blend mode to source-over when blend is omitted", async () => {
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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
      const { createDrawContext } = await import("./drawMethods");
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

      vi.doMock("./ImageAssetCache", () => ({
        imageAssetCache: {
          preload: vi.fn(),
          getReadyAsset: getReadyAssetMock,
        },
      }));

      const { createDrawContext } = await import("./drawMethods");
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

      vi.doUnmock("./ImageAssetCache");
    });

    it("does not draw when ImageAssetCache has no ready asset", async () => {
      vi.resetModules();

      const getReadyAssetMock = vi.fn(() => null);

      vi.doMock("./ImageAssetCache", () => ({
        imageAssetCache: {
          preload: vi.fn(),
          getReadyAsset: getReadyAssetMock,
        },
      }));

      const { createDrawContext } = await import("./drawMethods");
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

      vi.doUnmock("./ImageAssetCache");
    });
  });
});
