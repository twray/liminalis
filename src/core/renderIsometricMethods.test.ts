import { describe, expect, it, vi } from "vitest";
import type { IsometricCuboid, IsometricTile } from "../types";
import type IsometricView from "../views/IsometricView";
import { getRenderIsometricMethods } from "./renderIsometricMethods";

const createTile = (overrides: Partial<IsometricTile> = {}): IsometricTile => ({
  isoX: 0,
  isoY: 0,
  isoZ: 0,
  type: "base",
  width: 1,
  height: 1,
  ...overrides,
});

const createCuboid = (
  overrides: Partial<IsometricCuboid> = {},
): IsometricCuboid => ({
  isoX: 0,
  isoY: 0,
  isoZ: 0,
  lengthX: 1,
  lengthY: 1,
  lengthZ: 1,
  ...overrides,
});

describe("renderIsometricMethods", () => {
  it("applies default styles when tile styles are omitted", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
    );

    methods.tile(createTile({ isoX: 3 }));

    expect(mockIsometricView.addTileAt).toHaveBeenCalledWith({
      isoX: 3,
      isoY: 0,
      isoZ: 0,
      type: "base",
      width: 1,
      height: 1,
      fillStyle: "#333",
      strokeStyle: "transparent",
      strokeWidth: 1,
    });
  });

  it("applies default styles when cuboid styles are omitted", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
    );

    methods.cuboid(createCuboid({ isoY: 4 }));

    expect(mockIsometricView.addCuboidAt).toHaveBeenCalledWith({
      isoX: 0,
      isoY: 4,
      isoZ: 0,
      lengthX: 1,
      lengthY: 1,
      lengthZ: 1,
      fillStyle: "#333",
      strokeStyle: "transparent",
      strokeWidth: 1,
    });
  });

  it("applies scoped styles to both tile and cuboid calls", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
    );

    methods.withStyles({ fillStyle: "#ff00ff", strokeWidth: 5 }, () => {
      methods.tile(createTile());
      methods.cuboid(createCuboid());
    });

    expect(mockIsometricView.addTileAt).toHaveBeenCalledWith(
      expect.objectContaining({
        fillStyle: "#ff00ff",
        strokeStyle: "transparent",
        strokeWidth: 5,
      }),
    );

    expect(mockIsometricView.addCuboidAt).toHaveBeenCalledWith(
      expect.objectContaining({
        fillStyle: "#ff00ff",
        strokeStyle: "transparent",
        strokeWidth: 5,
      }),
    );
  });

  it("lets shape props override styles from withStyles", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
    );

    methods.withStyles(
      { fillStyle: "#111", strokeStyle: "#222", strokeWidth: 9 },
      () => {
        methods.tile(
          createTile({ fillStyle: "#abc", strokeWidth: 2, height: 2 }),
        );
      },
    );

    expect(mockIsometricView.addTileAt).toHaveBeenCalledWith(
      expect.objectContaining({
        fillStyle: "#abc",
        strokeStyle: "#222",
        strokeWidth: 2,
        height: 2,
      }),
    );
  });

  it("restores previous styles after nested withStyles blocks", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
    );

    methods.withStyles({ fillStyle: "#f00" }, () => {
      methods.tile(createTile({ isoX: 1 }));

      methods.withStyles({ fillStyle: "#00f", strokeWidth: 7 }, () => {
        methods.tile(createTile({ isoX: 2 }));
      });

      methods.tile(createTile({ isoX: 3 }));
    });

    methods.tile(createTile({ isoX: 4 }));

    expect(mockIsometricView.addTileAt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        isoX: 1,
        fillStyle: "#f00",
        strokeWidth: 1,
      }),
    );

    expect(mockIsometricView.addTileAt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        isoX: 2,
        fillStyle: "#00f",
        strokeWidth: 7,
      }),
    );

    expect(mockIsometricView.addTileAt).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        isoX: 3,
        fillStyle: "#f00",
        strokeWidth: 1,
      }),
    );

    expect(mockIsometricView.addTileAt).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        isoX: 4,
        fillStyle: "#333",
        strokeWidth: 1,
      }),
    );
  });

  it("restores previous styles when withStyles callback throws", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
    );

    expect(() => {
      methods.withStyles({ fillStyle: "#f00", strokeWidth: 8 }, () => {
        throw new Error("boom");
      });
    }).toThrow("boom");

    methods.cuboid(createCuboid({ isoZ: 5 }));

    expect(mockIsometricView.addCuboidAt).toHaveBeenCalledWith(
      expect.objectContaining({
        isoZ: 5,
        fillStyle: "#333",
        strokeStyle: "transparent",
        strokeWidth: 1,
      }),
    );
  });
});
