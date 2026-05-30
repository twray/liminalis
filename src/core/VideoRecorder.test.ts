import { beforeEach, describe, expect, it, vi } from "vitest";
import VideoRecorder from "./VideoRecorder";

interface MockMediaRecorderInstance {
  state: "inactive" | "recording";
  ondataavailable: ((event: BlobEvent) => void) | null;
  onerror: (() => void) | null;
  onstop: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

const mediaRecorderMockState = {
  instances: [] as MockMediaRecorderInstance[],
};

const setupMediaRecorderMock = () => {
  class MockMediaRecorder {
    static isTypeSupported = vi.fn(() => true);

    state: "inactive" | "recording" = "inactive";
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onstop: (() => void) | null = null;

    start = vi.fn(() => {
      this.state = "recording";
    });

    stop = vi.fn(() => {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["frame"]) } as BlobEvent);
      this.onstop?.();
    });

    constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {
      mediaRecorderMockState.instances.push(this);
    }
  }

  (globalThis as any).MediaRecorder = MockMediaRecorder;
};

const createMockCanvas = () => {
  const requestFrame = vi.fn();
  const stopTrack = vi.fn();

  const track = {
    requestFrame,
    stop: stopTrack,
  } as unknown as MediaStreamTrack & { requestFrame: () => void };

  const stream = {
    getVideoTracks: vi.fn(() => [track]),
    getTracks: vi.fn(() => [track]),
  } as unknown as MediaStream;

  const captureStream = vi.fn(() => stream);

  return {
    canvas: {
      captureStream,
      width: 1280,
      height: 720,
    } as unknown as HTMLCanvasElement,
    requestFrame,
    stopTrack,
    captureStream,
  };
};

describe("VideoRecorder", () => {
  beforeEach(() => {
    mediaRecorderMockState.instances = [];
    setupMediaRecorderMock();
    (globalThis as any).document = undefined;
  });

  it("starts recording and captures deterministic frames", () => {
    const { canvas, requestFrame, captureStream } = createMockCanvas();
    const recorder = new VideoRecorder();

    recorder.start(canvas);

    expect(captureStream).toHaveBeenCalledWith(0);
    expect(mediaRecorderMockState.instances[0]?.start).toHaveBeenCalledTimes(1);
    expect(recorder.isRecording).toBe(true);

    recorder.captureFrame();

    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  it("stops recording, encodes result, and returns to idle status", async () => {
    const { canvas, stopTrack } = createMockCanvas();
    const recorder = new VideoRecorder();

    recorder.start(canvas);

    const encodedPromise = recorder.stopAndEncode();

    expect(recorder.isEncoding).toBe(true);

    const encodedCapture = await encodedPromise;

    expect(encodedCapture.blob.size).toBeGreaterThan(0);
    expect(encodedCapture.fileName).toContain(".webm");
    expect(mediaRecorderMockState.instances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(recorder.status).toBe("idle");
  });

  it("caps deterministic capture at 60 fps when render callbacks exceed 60 fps", () => {
    const { canvas, requestFrame } = createMockCanvas();
    const recorder = new VideoRecorder();

    recorder.start(canvas);

    recorder.captureFrame(0);
    recorder.captureFrame(5);
    recorder.captureFrame(10);
    recorder.captureFrame(16);
    recorder.captureFrame(17);
    recorder.captureFrame(30);
    recorder.captureFrame(34);

    expect(requestFrame).toHaveBeenCalledTimes(3);
  });

  it("records from a downscaled capture canvas when scale is below 1", () => {
    const sourceTrack = {
      requestFrame: vi.fn(),
      stop: vi.fn(),
    } as unknown as MediaStreamTrack & { requestFrame: () => void };

    const sourceStream = {
      getVideoTracks: vi.fn(() => [sourceTrack]),
      getTracks: vi.fn(() => [sourceTrack]),
    } as unknown as MediaStream;

    const sourceCaptureStream = vi.fn(() => sourceStream);

    const sourceCanvas = {
      width: 1000,
      height: 2000,
      captureStream: sourceCaptureStream,
    } as unknown as HTMLCanvasElement;

    const captureTrack = {
      requestFrame: vi.fn(),
      stop: vi.fn(),
    } as unknown as MediaStreamTrack & { requestFrame: () => void };

    const captureStream = {
      getVideoTracks: vi.fn(() => [captureTrack]),
      getTracks: vi.fn(() => [captureTrack]),
    } as unknown as MediaStream;

    const drawImage = vi.fn();

    const captureCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(
        () =>
          ({
            drawImage,
            imageSmoothingEnabled: false,
          }) as unknown as CanvasRenderingContext2D,
      ),
      captureStream: vi.fn(() => captureStream),
    } as unknown as HTMLCanvasElement;

    const createElement = vi.fn(() => captureCanvas);

    (globalThis as any).document = {
      createElement,
    };

    const recorder = new VideoRecorder();

    recorder.start(sourceCanvas, { scale: 0.5 });

    expect(createElement).toHaveBeenCalledWith("canvas");
    expect(captureCanvas.width).toBe(500);
    expect(captureCanvas.height).toBe(1000);
    expect(sourceCaptureStream).not.toHaveBeenCalled();
    expect(captureCanvas.captureStream).toHaveBeenCalledWith(0);
    expect(drawImage).toHaveBeenCalledWith(sourceCanvas, 0, 0, 500, 1000);

    recorder.captureFrame();

    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(captureTrack.requestFrame).toHaveBeenCalledTimes(1);
  });

  it("throws when scale is outside the supported range", () => {
    const { canvas } = createMockCanvas();
    const recorder = new VideoRecorder();

    expect(() => recorder.start(canvas, { scale: 0 })).toThrow(
      "Recording scale must be greater than 0 and less than or equal to 1.",
    );
    expect(() => recorder.start(canvas, { scale: 1.1 })).toThrow(
      "Recording scale must be greater than 0 and less than or equal to 1.",
    );
  });
});
