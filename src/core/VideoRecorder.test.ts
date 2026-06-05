import { beforeEach, describe, expect, it, vi } from "vitest";
import VideoRecorder from "./VideoRecorder";

const WEBM_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

const MP4_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
];

interface MockMediaRecorderInstance {
  state: "inactive" | "recording";
  stream: MediaStream;
  options?: MediaRecorderOptions;
  ondataavailable: ((event: BlobEvent) => void) | null;
  onerror: (() => void) | null;
  onstop: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

const mediaRecorderMockState = {
  instances: [] as MockMediaRecorderInstance[],
  supportedMimeTypes: new Set<string>(),
};

const setSupportedMimeTypes = (mimeTypes: string[]) => {
  mediaRecorderMockState.supportedMimeTypes = new Set(mimeTypes);
};

const setupMediaRecorderMock = () => {
  class MockMediaRecorder {
    static isTypeSupported = vi.fn((mimeType: string) =>
      mediaRecorderMockState.supportedMimeTypes.has(mimeType),
    );

    state: "inactive" | "recording" = "inactive";
    stream: MediaStream;
    options?: MediaRecorderOptions;
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

    constructor(stream: MediaStream, options?: MediaRecorderOptions) {
      this.stream = stream;
      this.options = options;
      mediaRecorderMockState.instances.push(this);
    }
  }

  (globalThis as any).MediaRecorder = MockMediaRecorder;
};

const createMockCanvas = () => {
  const requestFrame = vi.fn();
  const stopTrack = vi.fn();

  const videoTrack = {
    requestFrame,
    stop: stopTrack,
  } as unknown as MediaStreamTrack & { requestFrame: () => void };

  const audioTracks: MediaStreamTrack[] = [];

  const addTrack = vi.fn((track: MediaStreamTrack) => {
    audioTracks.push(track);
  });

  const stream = {
    getVideoTracks: vi.fn(() => [videoTrack]),
    getAudioTracks: vi.fn(() => audioTracks),
    getTracks: vi.fn(() => [videoTrack, ...audioTracks]),
    addTrack,
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
    addTrack,
  };
};

const createMockAudioStream = () => {
  const stopTrack = vi.fn();
  const audioTrack = {
    stop: stopTrack,
  } as unknown as MediaStreamTrack;

  return {
    audioTrack,
    stopTrack,
    audioStream: {
      getAudioTracks: vi.fn(() => [audioTrack]),
      getVideoTracks: vi.fn(() => []),
      getTracks: vi.fn(() => [audioTrack]),
    } as unknown as MediaStream,
  };
};

describe("VideoRecorder", () => {
  beforeEach(() => {
    mediaRecorderMockState.instances = [];
    setSupportedMimeTypes([...WEBM_MIME_TYPES, ...MP4_MIME_TYPES]);
    setupMediaRecorderMock();
    (globalThis as any).document = undefined;

    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: undefined,
    });

    Object.defineProperty(globalThis, "webkitAudioContext", {
      configurable: true,
      value: undefined,
    });
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
    expect(encodedCapture.blob.type).toContain("video/mp4");
    expect(encodedCapture.fileName).toContain(".mp4");
    expect(mediaRecorderMockState.instances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(recorder.status).toBe("idle");
  });

  it("falls back to webm when auto format is used and mp4 is not supported", async () => {
    setSupportedMimeTypes(WEBM_MIME_TYPES);

    const { canvas } = createMockCanvas();
    const recorder = new VideoRecorder();

    recorder.start(canvas);

    expect(mediaRecorderMockState.instances[0]?.options?.mimeType).toContain(
      "video/webm",
    );

    const encodedCapture = await recorder.stopAndEncode();

    expect(encodedCapture.blob.type).toContain("video/webm");
    expect(encodedCapture.fileName).toContain(".webm");
  });

  it("uses mp4 when requested and supported", async () => {
    setSupportedMimeTypes(MP4_MIME_TYPES);

    const { canvas } = createMockCanvas();
    const recorder = new VideoRecorder();

    recorder.start(canvas, { format: "mp4" });

    expect(mediaRecorderMockState.instances[0]?.options?.mimeType).toContain(
      "video/mp4",
    );

    const encodedCapture = await recorder.stopAndEncode();

    expect(encodedCapture.blob.type).toContain("video/mp4");
    expect(encodedCapture.fileName).toContain(".mp4");
  });

  it("falls back to webm when mp4 is requested but not supported", async () => {
    setSupportedMimeTypes(WEBM_MIME_TYPES);

    const { canvas } = createMockCanvas();
    const recorder = new VideoRecorder();

    recorder.start(canvas, { format: "mp4" });

    expect(mediaRecorderMockState.instances[0]?.options?.mimeType).toContain(
      "video/webm",
    );

    const encodedCapture = await recorder.stopAndEncode();

    expect(encodedCapture.blob.type).toContain("video/webm");
    expect(encodedCapture.fileName).toContain(".webm");
  });

  it("falls back to mp4 when webm is requested but not supported", async () => {
    setSupportedMimeTypes(MP4_MIME_TYPES);

    const { canvas } = createMockCanvas();
    const recorder = new VideoRecorder();

    recorder.start(canvas, { format: "webm" });

    expect(mediaRecorderMockState.instances[0]?.options?.mimeType).toContain(
      "video/mp4",
    );

    const encodedCapture = await recorder.stopAndEncode();

    expect(encodedCapture.blob.type).toContain("video/mp4");
    expect(encodedCapture.fileName).toContain(".mp4");
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

    const captureAudioTracks: MediaStreamTrack[] = [];

    const captureStream = {
      getVideoTracks: vi.fn(() => [captureTrack]),
      getAudioTracks: vi.fn(() => captureAudioTracks),
      getTracks: vi.fn(() => [captureTrack, ...captureAudioTracks]),
      addTrack: vi.fn((track: MediaStreamTrack) => {
        captureAudioTracks.push(track);
      }),
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

  it("throws when scale is outside the supported range", async () => {
    const { canvas } = createMockCanvas();
    const recorder = new VideoRecorder();

    await expect(recorder.start(canvas, { scale: 0 })).rejects.toThrow(
      "Recording scale must be greater than 0 and less than or equal to 1.",
    );
    await expect(recorder.start(canvas, { scale: 1.1 })).rejects.toThrow(
      "Recording scale must be greater than 0 and less than or equal to 1.",
    );
  });

  it("attaches an external audio track when provided", async () => {
    const { canvas, addTrack } = createMockCanvas();
    const { audioStream, audioTrack, stopTrack } = createMockAudioStream();
    const recorder = new VideoRecorder();

    recorder.start(canvas, { audioStream });

    expect(addTrack).toHaveBeenCalledTimes(1);
    expect(addTrack).toHaveBeenCalledWith(audioTrack);
    expect(
      mediaRecorderMockState.instances[0]?.options?.audioBitsPerSecond,
    ).toBeDefined();

    await recorder.stopAndEncode();

    expect(stopTrack).toHaveBeenCalledTimes(1);
  });

  it("continues with video-only recording when audio stream has no tracks", () => {
    const { canvas, addTrack } = createMockCanvas();
    const recorder = new VideoRecorder();

    recorder.start(canvas, {
      audioStream: {
        getAudioTracks: vi.fn(() => []),
      } as unknown as MediaStream,
    });

    expect(addTrack).not.toHaveBeenCalled();
    expect(
      mediaRecorderMockState.instances[0]?.options?.audioBitsPerSecond,
    ).toBeUndefined();
  });
});
