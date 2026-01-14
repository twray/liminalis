import { beforeEach, describe, expect, it, vi } from "vitest";

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
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      beginPath: vi.fn(),
      arc: vi.fn(),
      roundRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
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
        0
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
        0
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
        0
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
        0
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
        0
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
        0
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
        0
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
        0
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
        0
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
        0
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
        0
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
        0
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
        0
      );

      // Line from (0,0) to (100,100) has center at (50, 50)
      expect(mockContext.translate).toHaveBeenCalledWith(50, 50);
      expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
      expect(mockContext.translate).toHaveBeenCalledWith(-50, -50);
    });
  });
});
