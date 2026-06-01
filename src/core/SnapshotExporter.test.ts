import { beforeEach, describe, expect, it, vi } from "vitest";
import SnapshotExporter from "./SnapshotExporter";

describe("SnapshotExporter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).document = undefined;
  });

  it("captures a snapshot image from canvas", () => {
    vi.spyOn(Date, "now").mockReturnValue(123456789);

    const toDataURL = vi.fn(() => "data:image/png;base64,encoded-image");
    const canvas = {
      toDataURL,
    } as unknown as HTMLCanvasElement;

    const exporter = new SnapshotExporter();
    const snapshot = exporter.capture(canvas);

    expect(toDataURL).toHaveBeenCalledWith("image/png", undefined);
    expect(snapshot.dataUrl).toBe("data:image/png;base64,encoded-image");
    expect(snapshot.fileName).toBe("liminalis-snapshot-123456789.png");
  });

  it("downloads a snapshot image using an anchor element", () => {
    const click = vi.fn();
    const anchor: { href?: string; download?: string; click: () => void } = {
      click,
    };

    const createElement = vi.fn(() => anchor);

    (globalThis as any).document = {
      createElement,
    };

    const exporter = new SnapshotExporter();
    exporter.download("data:image/png;base64,encoded-image", "example.png");

    expect(createElement).toHaveBeenCalledWith("a");
    expect(anchor.href).toBe("data:image/png;base64,encoded-image");
    expect(anchor.download).toBe("example.png");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("captures and downloads a snapshot in one step", () => {
    vi.spyOn(Date, "now").mockReturnValue(987654321);

    const click = vi.fn();
    const anchor: { href?: string; download?: string; click: () => void } = {
      click,
    };

    (globalThis as any).document = {
      createElement: vi.fn(() => anchor),
    };

    const canvas = {
      toDataURL: vi.fn(() => "data:image/png;base64,encoded-image"),
    } as unknown as HTMLCanvasElement;

    const exporter = new SnapshotExporter();
    const fileName = exporter.captureAndDownload(canvas);

    expect(fileName).toBe("liminalis-snapshot-987654321.png");
    expect(anchor.download).toBe("liminalis-snapshot-987654321.png");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("throws when canvas image export API is unavailable", () => {
    const exporter = new SnapshotExporter();

    expect(() => exporter.capture({} as HTMLCanvasElement)).toThrow(
      "Canvas image export API is not available.",
    );
  });
});
