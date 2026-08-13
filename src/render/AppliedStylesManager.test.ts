import { describe, expect, it } from "vitest";

import AppliedStylesManager from "./AppliedStylesManager";

describe("AppliedStylesManager", () => {
  it("merges defaults with explicit props", () => {
    const manager = new AppliedStylesManager({
      strokeStyle: "#111",
      strokeWidth: 2,
      blend: "source-over",
    });

    const merged = manager.mergeStyles({ opacity: 0.5 });

    expect(merged).toEqual({
      strokeStyle: "#111",
      strokeWidth: 2,
      blend: "source-over",
      opacity: 0.5,
    });
  });

  it("restores previous styles after nested withStyles blocks", () => {
    const manager = new AppliedStylesManager({
      strokeStyle: "#111",
      strokeWidth: 2,
      blend: "source-over",
    });

    const snapshots: Array<Record<string, unknown>> = [];

    manager.withStyles({ strokeStyle: "#222" }, () => {
      snapshots.push(manager.mergeStyles({}));

      manager.withStyles({ strokeWidth: 8 }, () => {
        snapshots.push(manager.mergeStyles({}));
      });

      snapshots.push(manager.mergeStyles({}));
    });

    snapshots.push(manager.mergeStyles({}));

    expect(snapshots).toEqual([
      {
        strokeStyle: "#222",
        strokeWidth: 2,
        blend: "source-over",
      },
      {
        strokeStyle: "#222",
        strokeWidth: 8,
        blend: "source-over",
      },
      {
        strokeStyle: "#222",
        strokeWidth: 2,
        blend: "source-over",
      },
      {
        strokeStyle: "#111",
        strokeWidth: 2,
        blend: "source-over",
      },
    ]);
  });
});
