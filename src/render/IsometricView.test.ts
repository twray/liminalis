import { describe, expect, it, vi } from "vitest";

import { offsetColorHsl, parseColorToRgb } from "../util";
import IsometricView from "./IsometricView";

interface RecordedContextCalls {
  calls: string[];
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
}

const createMockContext = (): {
  context: CanvasRenderingContext2D;
  recorded: RecordedContextCalls;
} => {
  const recorded: RecordedContextCalls = {
    calls: [],
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  };

  const context = {
    save: () => recorded.calls.push("save"),
    restore: () => recorded.calls.push("restore"),
    beginPath: () => recorded.calls.push("beginPath"),
    closePath: () => recorded.calls.push("closePath"),
    moveTo: (x: number, y: number) => recorded.calls.push(`moveTo:${x},${y}`),
    lineTo: (x: number, y: number) => recorded.calls.push(`lineTo:${x},${y}`),
    stroke: () => recorded.calls.push("stroke"),
    fill: () => recorded.calls.push("fill"),
    setLineDash: () => recorded.calls.push("setLineDash"),
    set fillStyle(value: string) {
      recorded.fillStyle = value;
      recorded.calls.push(`fillStyle:${value}`);
    },
    get fillStyle() {
      return recorded.fillStyle;
    },
    set strokeStyle(value: string) {
      recorded.strokeStyle = value;
      recorded.calls.push(`strokeStyle:${value}`);
    },
    get strokeStyle() {
      return recorded.strokeStyle;
    },
    set lineWidth(value: number) {
      recorded.lineWidth = value;
      recorded.calls.push(`lineWidth:${value}`);
    },
    get lineWidth() {
      return recorded.lineWidth;
    },
    set lineJoin(value: string) {
      recorded.calls.push(`lineJoin:${value}`);
    },
    set font(value: string) {
      recorded.calls.push(`font:${value}`);
    },
    set textAlign(value: string) {
      recorded.calls.push(`textAlign:${value}`);
    },
    set textBaseline(value: string) {
      recorded.calls.push(`textBaseline:${value}`);
    },
  } as unknown as CanvasRenderingContext2D;

  return { context, recorded };
};

describe("IsometricView", () => {
  describe("constructor", () => {
    it("computes grid dimensions and defaults tileWidth to 50", () => {
      const { context } = createMockContext();
      const view = new IsometricView(context, 100, 100);

      expect(view.tileWidth).toBe(50);
      expect(view.tileHeight).toBe(25);
      expect(view.contextWidth).toBe(100);
      expect(view.contextHeight).toBe(100);
    });

    it("computes grid dimensions from an explicit tileWidth", () => {
      const { context } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);

      // numGridColumns = (floor(100/50) + 2) * 2, numGridRows = (floor(100/25) + 2) * 2
      expect(view.getOriginCellIndices()).toEqual({ x: 3, y: 5 });
    });
  });

  describe("getOriginCellIndices", () => {
    it("returns the center cell of the grid", () => {
      const { context } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);

      expect(view.getOriginCellIndices()).toEqual({ x: 3, y: 5 });
    });
  });

  describe("getMidPoint", () => {
    it("returns the average of the two points", () => {
      const { context } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);

      expect(view.getMidPoint(0, 0, 10, 20)).toEqual({ x: 5, y: 10 });
    });
  });

  describe("getTileSpatialCoordinates", () => {
    it("returns coordinates for the origin tile", () => {
      const { context } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);

      const coordinates = view.getTileSpatialCoordinates(0, 0, 0);

      expect(coordinates).toBeDefined();
      expect(coordinates?.tiles).toEqual([]);
    });

    it("returns undefined when the requested cell is out of grid bounds", () => {
      const { context } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);

      expect(view.getTileSpatialCoordinates(1000, 1000, 0)).toBeUndefined();
    });
  });

  describe("addTileAt", () => {
    it("adds a base tile using the cell's four corners when width and height are 1", () => {
      const { context } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);
      const cellBefore = view.getTileSpatialCoordinates(0, 0, 0)!;

      view.addTileAt({ isoX: 0, isoY: 0, isoZ: 0, type: "base", width: 1, height: 1 });

      const cellAfter = view.getTileSpatialCoordinates(0, 0, 0)!;

      expect(cellAfter.tiles).toHaveLength(1);
      expect(cellAfter.tiles[0]?.points).toEqual([
        cellBefore.top,
        cellBefore.right,
        cellBefore.bottom,
        cellBefore.left,
      ]);
      expect(cellAfter.tiles[0]?.position).toEqual({ isoX: 0, isoY: 0, isoZ: 0 });
    });

    it("applies default styles when none are provided", () => {
      const { context } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);

      view.addTileAt({ isoX: 0, isoY: 0, isoZ: 0, type: "base", width: 1, height: 1 });

      const tile = view.getTileSpatialCoordinates(0, 0, 0)!.tiles[0];

      expect(tile).toMatchObject({
        fillStyle: "#333333",
        strokeStyle: "transparent",
        strokeWidth: 1,
        opacity: 1,
      });
    });

    it("logs an error and adds nothing when the coordinates are out of bounds", () => {
      const { context } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() =>
        view.addTileAt({ isoX: 1000, isoY: 1000, isoZ: 0, type: "base", width: 1, height: 1 }),
      ).not.toThrow();

      expect(errorSpy).toHaveBeenCalledTimes(1);

      errorSpy.mockRestore();
    });
  });

  describe("addCuboidAt", () => {
    it("adds a side-right tile, a side-left tile, and a base tile offset by lengthZ", () => {
      const { context } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);
      const addTileAtSpy = vi.spyOn(view, "addTileAt");

      view.addCuboidAt({ isoX: 0, isoY: 0, isoZ: 0, lengthX: 1, lengthY: 1, lengthZ: 1 });

      expect(addTileAtSpy).toHaveBeenCalledTimes(3);
      expect(addTileAtSpy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ type: "side-right", isoX: 0, isoY: 0, isoZ: 0, width: 1, height: 1 }),
      );
      expect(addTileAtSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ type: "side-left", isoX: 0, isoY: 0, isoZ: 0, width: 1, height: 1 }),
      );
      expect(addTileAtSpy).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ type: "base", isoX: 1, isoY: 1, isoZ: 0, width: 1, height: 1 }),
      );
    });
  });

  describe("renderTile", () => {
    it("draws the tile outline and fills/strokes it", () => {
      const { context, recorded } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);

      view.renderTile({
        type: "base",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        fillStyle: "transparent",
        strokeStyle: "#000",
        strokeWidth: 1,
        opacity: 1,
        debugMode: false,
      });

      expect(recorded.calls).toEqual(
        expect.arrayContaining([
          "save",
          "beginPath",
          "moveTo:0,0",
          "lineTo:10,0",
          "lineTo:10,10",
          "closePath",
          "stroke",
          "fill",
          "restore",
        ]),
      );
    });

    it("parses fillStyle to rgba for a non-debug base tile", () => {
      const { context, recorded } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);
      const [r, g, b] = parseColorToRgb("#336699");

      view.renderTile({
        type: "base",
        points: [{ x: 0, y: 0 }],
        fillStyle: "#336699",
        strokeStyle: "#000",
        strokeWidth: 2,
        opacity: 0.5,
        debugMode: false,
      });

      expect(recorded.fillStyle).toBe(`rgba(${r}, ${g}, ${b}, 0.5)`);
      expect(recorded.strokeStyle).toBe("#000");
      expect(recorded.lineWidth).toBe(2);
    });

    it("darkens the fill for side-right tiles via offsetColorHsl", () => {
      const { context, recorded } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);
      const [r, g, b] = offsetColorHsl("#336699", 0, 0, -5);

      view.renderTile({
        type: "side-right",
        points: [{ x: 0, y: 0 }],
        fillStyle: "#336699",
        strokeStyle: "#000",
        strokeWidth: 1,
        opacity: 1,
        debugMode: false,
      });

      expect(recorded.fillStyle).toBe(`rgba(${r}, ${g}, ${b}, 1)`);
    });

    it("lightens the fill for side-left tiles via offsetColorHsl", () => {
      const { context, recorded } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);
      const [r, g, b] = offsetColorHsl("#336699", 0, 0, 5);

      view.renderTile({
        type: "side-left",
        points: [{ x: 0, y: 0 }],
        fillStyle: "#336699",
        strokeStyle: "#000",
        strokeWidth: 1,
        opacity: 1,
        debugMode: false,
      });

      expect(recorded.fillStyle).toBe(`rgba(${r}, ${g}, ${b}, 1)`);
    });

    it("passes a transparent fillStyle through without color parsing", () => {
      const { context, recorded } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);

      view.renderTile({
        type: "base",
        points: [{ x: 0, y: 0 }],
        fillStyle: "transparent",
        strokeStyle: "#000",
        strokeWidth: 1,
        opacity: 1,
        debugMode: false,
      });

      expect(recorded.fillStyle).toBe("transparent");
    });

    it("uses debug styling for a debug-mode base tile, ignoring the given colors", () => {
      const { context, recorded } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);

      view.renderTile({
        type: "base",
        points: [{ x: 0, y: 0 }],
        fillStyle: "#336699",
        strokeStyle: "#000",
        strokeWidth: 5,
        opacity: 1,
        debugMode: true,
      });

      expect(recorded.fillStyle).toBe("rgba(255, 255, 255, 0.2)");
      expect(recorded.strokeStyle).toBe("rgba(255, 255, 255, 0.1)");
      // Debug base tiles keep the constant lineWidth of 2 set unconditionally
      // at the top of renderTile, rather than the tile's own strokeWidth.
      expect(recorded.lineWidth).toBe(2);
    });
  });

  describe("render", () => {
    it("does nothing when no tiles have been added", () => {
      const { context, recorded } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);

      view.render();

      expect(recorded.calls).toEqual([]);
    });

    it("with z-correction, renders lowest isoZ first, then highest isoY, then highest isoX", () => {
      const { context } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);
      const renderOrder: string[] = [];
      vi.spyOn(view, "renderTile").mockImplementation((tile: any) => {
        renderOrder.push(tile.fillStyle);
      });

      view.addTileAt({ isoX: 0, isoY: 0, isoZ: 1, type: "base", width: 1, height: 1, fillStyle: "z1" });
      view.addTileAt({ isoX: 0, isoY: 0, isoZ: 0, type: "base", width: 1, height: 1, fillStyle: "z0" });
      view.addTileAt({ isoX: 0, isoY: 1, isoZ: 0, type: "base", width: 1, height: 1, fillStyle: "z0-yHigh" });
      view.addTileAt({ isoX: 1, isoY: 0, isoZ: 0, type: "base", width: 1, height: 1, fillStyle: "z0-y0-xHigh" });

      view.render(true);

      expect(renderOrder).toEqual(["z0-yHigh", "z0-y0-xHigh", "z0", "z1"]);
    });

    it("without z-correction, renders every added tile exactly once", () => {
      const { context } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);
      const renderedFillStyles: string[] = [];
      vi.spyOn(view, "renderTile").mockImplementation((tile: any) => {
        renderedFillStyles.push(tile.fillStyle);
      });

      view.addTileAt({ isoX: 0, isoY: 0, isoZ: 1, type: "base", width: 1, height: 1, fillStyle: "a" });
      view.addTileAt({ isoX: 1, isoY: 0, isoZ: 0, type: "base", width: 1, height: 1, fillStyle: "b" });

      view.render(false);

      expect(renderedFillStyles.sort()).toEqual(["a", "b"]);
    });
  });

  describe("showBaseGrid", () => {
    it("strokes one line per grid column and one per grid row", () => {
      const { context, recorded } = createMockContext();
      const view = new IsometricView(context, 100, 100, 50);

      view.showBaseGrid();

      const columns = (view as any).numGridColumns as number;
      const rows = (view as any).numGridRows as number;
      const strokeCount = recorded.calls.filter((call) => call === "stroke").length;

      expect(strokeCount).toBe(columns + rows);
    });
  });
});
