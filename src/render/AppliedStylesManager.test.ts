import { describe, expect, it } from "vitest";

import AppliedStylesManager from "./AppliedStylesManager";

const createManager = () =>
  new AppliedStylesManager({
    shape: { strokeStyle: "#111", strokeWidth: 2 },
    text: { fillStyle: "#222", fontSize: "10px" },
    isometric: { fillStyle: "#333", strokeStyle: "transparent" },
  });

describe("AppliedStylesManager", () => {
  it("merges the requested family's defaults with explicit props", () => {
    const manager = createManager();

    expect(manager.mergeStyles({ opacity: 0.5 }, "shape")).toEqual({
      strokeStyle: "#111",
      strokeWidth: 2,
      opacity: 0.5,
    });
    expect(manager.mergeStyles({ opacity: 0.5 }, "text")).toEqual({
      fillStyle: "#222",
      fontSize: "10px",
      opacity: 0.5,
    });
  });

  it("never lets one family's defaults reach another family", () => {
    const manager = createManager();

    expect(manager.mergeStyles({}, "isometric")).toEqual({
      fillStyle: "#333",
      strokeStyle: "transparent",
    });
  });

  it("applies withStyles() to every family, over that family's defaults", () => {
    const manager = createManager();

    manager.withStyles({ strokeStyle: "#f00" }, () => {
      expect(manager.mergeStyles({}, "shape")).toMatchObject({
        strokeStyle: "#f00",
        strokeWidth: 2,
      });
      expect(manager.mergeStyles({}, "isometric")).toMatchObject({
        strokeStyle: "#f00",
        fillStyle: "#333",
      });
    });
  });

  it("lets a primitive's own props win over withStyles()", () => {
    const manager = createManager();

    manager.withStyles({ strokeStyle: "#f00" }, () => {
      expect(
        manager.mergeStyles({ strokeStyle: "#0f0" }, "shape"),
      ).toMatchObject({ strokeStyle: "#0f0" });
    });
  });

  it("restores previous styles after nested withStyles blocks", () => {
    const manager = createManager();
    const snapshots: Array<Record<string, unknown>> = [];

    manager.withStyles({ strokeStyle: "#222" }, () => {
      snapshots.push(manager.mergeStyles({}, "shape"));

      manager.withStyles({ strokeWidth: 8 }, () => {
        snapshots.push(manager.mergeStyles({}, "shape"));
      });

      snapshots.push(manager.mergeStyles({}, "shape"));
    });

    snapshots.push(manager.mergeStyles({}, "shape"));

    expect(snapshots).toEqual([
      { strokeStyle: "#222", strokeWidth: 2 },
      { strokeStyle: "#222", strokeWidth: 8 },
      { strokeStyle: "#222", strokeWidth: 2 },
      { strokeStyle: "#111", strokeWidth: 2 },
    ]);
  });
});
