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

  it("applies inherited parent styles when provided", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
      {
        fillStyle: "#ff8800",
        strokeStyle: "#ffffff",
      },
    );

    methods.cuboid(createCuboid({ isoX: 2 }));

    expect(mockIsometricView.addCuboidAt).toHaveBeenCalledWith(
      expect.objectContaining({
        isoX: 2,
        fillStyle: "#ff8800",
        strokeStyle: "#ffffff",
        strokeWidth: 1,
      }),
    );
  });

  it("applies inherited styles from a dynamic provider", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    let inheritedStyles = {
      fillStyle: "#ff8800",
      strokeStyle: "#ffffff",
      strokeWidth: 6,
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
      () => inheritedStyles,
    );

    methods.cuboid(createCuboid({ isoX: 1 }));

    inheritedStyles = {
      fillStyle: "#22aa66",
      strokeStyle: "#004422",
      strokeWidth: 3,
    };

    methods.cuboid(createCuboid({ isoX: 2 }));

    expect(mockIsometricView.addCuboidAt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        isoX: 1,
        fillStyle: "#ff8800",
        strokeStyle: "#ffffff",
        strokeWidth: 6,
      }),
    );

    expect(mockIsometricView.addCuboidAt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        isoX: 2,
        fillStyle: "#22aa66",
        strokeStyle: "#004422",
        strokeWidth: 3,
      }),
    );
  });

  it("lets shape props override inherited parent styles", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
      {
        fillStyle: "#ff8800",
        strokeStyle: "#ffffff",
        strokeWidth: 6,
      },
    );

    methods.cuboid(createCuboid({ fillStyle: "#224488", strokeWidth: 2 }));

    expect(mockIsometricView.addCuboidAt).toHaveBeenCalledWith(
      expect.objectContaining({
        fillStyle: "#224488",
        strokeStyle: "#ffffff",
        strokeWidth: 2,
      }),
    );
  });

  it("applies direct styles on tile and cuboid calls", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
    );

    methods.tile(createTile({ fillStyle: "#ff00ff", strokeWidth: 5 }));
    methods.cuboid(createCuboid({ fillStyle: "#ff00ff", strokeWidth: 5 }));

    expect(mockIsometricView.addTileAt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fillStyle: "#ff00ff",
        strokeStyle: "transparent",
        strokeWidth: 5,
      }),
    );

    expect(mockIsometricView.addCuboidAt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fillStyle: "#ff00ff",
        strokeStyle: "transparent",
        strokeWidth: 5,
      }),
    );
  });

  it("uses per-shape stroke style override while keeping defaults for omitted styles", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
    );

    methods.tile(
      createTile({ fillStyle: "#abc", strokeStyle: "#222", height: 2 }),
    );

    expect(mockIsometricView.addTileAt).toHaveBeenCalledWith(
      expect.objectContaining({
        fillStyle: "#abc",
        strokeStyle: "#222",
        strokeWidth: 1,
        height: 2,
      }),
    );
  });

  it("keeps default styles isolated between calls", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
    );

    methods.tile(createTile({ isoX: 1, fillStyle: "#f00" }));
    methods.tile(createTile({ isoX: 2, fillStyle: "#00f", strokeWidth: 7 }));
    methods.tile(createTile({ isoX: 3, fillStyle: "#f00" }));
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

  it("applies defaults to subsequent calls after custom styled calls", () => {
    const mockIsometricView = {
      addTileAt: vi.fn(),
      addCuboidAt: vi.fn(),
    };

    const methods = getRenderIsometricMethods(
      mockIsometricView as unknown as IsometricView,
      0,
    );

    methods.cuboid(
      createCuboid({ isoZ: 1, fillStyle: "#f00", strokeWidth: 8 }),
    );

    methods.cuboid(createCuboid({ isoZ: 5 }));

    expect(mockIsometricView.addCuboidAt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        isoZ: 5,
        fillStyle: "#333",
        strokeStyle: "transparent",
        strokeWidth: 1,
      }),
    );
  });
});
