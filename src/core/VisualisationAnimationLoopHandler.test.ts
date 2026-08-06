import { beforeEach, describe, expect, it, vi } from "vitest";
import { logMessage } from "../util/log";

const mockState = {
  latestRenderCallback: null as ((props: any) => void) | null,
  midiListeners: {
    noteon: [] as Array<(event: any) => void>,
    noteoff: [] as Array<(event: any) => void>,
  },
};

const canvasRendererMockState = {
  instances: [] as Array<{
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }>,
};

const videoRecorderMockState = {
  instances: [] as Array<{
    start: ReturnType<typeof vi.fn>;
    captureFrame: ReturnType<typeof vi.fn>;
    stopAndEncode: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    flags: {
      isRecording: boolean;
      isEncoding: boolean;
    };
  }>,
};

const snapshotExporterMockState = {
  instances: [] as Array<{
    captureAndDownload: ReturnType<
      typeof vi.fn<(canvas: HTMLCanvasElement) => string>
    >;
  }>,
};

const imageAssetCacheMockState = {
  preload: vi.fn(),
};

vi.mock("./CanvasRenderer", () => {
  return {
    default: class MockCanvasRenderer {
      #instance = {
        start: vi.fn(
          (sketchFactory: () => (props: any) => void, _settings: any) => {
            mockState.latestRenderCallback = sketchFactory();
          },
        ),
        stop: vi.fn(),
      };

      constructor() {
        canvasRendererMockState.instances.push(this.#instance);
      }

      start(sketchFactory: () => (props: any) => void, settings: any) {
        this.#instance.start(sketchFactory, settings);
      }

      stop() {
        this.#instance.stop();
      }
    },
  };
});

vi.mock("webmidi", () => {
  const input = {
    id: "mock-input-id",
    name: "Mock Input",
    addListener: vi.fn(
      (eventType: "noteon" | "noteoff", callback: (event: any) => void) => {
        mockState.midiListeners[eventType].push(callback);
      },
    ),
  };

  return {
    Utilities: {
      buildNote: vi.fn(() => ({ number: 60 })),
    },
    WebMidi: {
      inputs: [input],
      enable: vi.fn(() => Promise.resolve()),
      getInputById: vi.fn(() => input),
    },
  };
});

vi.mock("../util/log", () => {
  return {
    logMessage: vi.fn(),
  };
});

vi.mock("./VideoRecorder", () => {
  return {
    default: class MockVideoRecorder {
      #instance = {
        start: vi.fn(),
        captureFrame: vi.fn(),
        stopAndEncode: vi.fn(),
        download: vi.fn(),
        flags: {
          isRecording: false,
          isEncoding: false,
        },
      };

      constructor() {
        videoRecorderMockState.instances.push(this.#instance);
      }

      get isRecording() {
        return this.#instance.flags.isRecording;
      }

      get isEncoding() {
        return this.#instance.flags.isEncoding;
      }

      start(...args: any[]) {
        this.#instance.start(...args);
        this.#instance.flags.isRecording = true;
      }

      captureFrame(elapsedTimeInMs?: number) {
        this.#instance.captureFrame(elapsedTimeInMs);
      }

      async stopAndEncode() {
        this.#instance.flags.isRecording = false;
        this.#instance.flags.isEncoding = true;

        const mockResult = this.#instance.stopAndEncode();

        if (
          mockResult &&
          typeof (mockResult as Promise<unknown>).then === "function"
        ) {
          const resolvedValue = await mockResult;
          this.#instance.flags.isEncoding = false;
          return resolvedValue;
        }

        await Promise.resolve();

        this.#instance.flags.isEncoding = false;

        return {
          blob: new Blob(["video"]),
          fileName: "liminalis-capture.webm",
        };
      }

      download(blob: Blob, fileName: string) {
        this.#instance.download(blob, fileName);
      }
    },
  };
});

vi.mock("./SnapshotExporter", () => {
  return {
    default: class MockSnapshotExporter {
      #instance = {
        captureAndDownload: vi.fn<(canvas: HTMLCanvasElement) => string>(
          () => "liminalis-snapshot.png",
        ),
      };

      constructor() {
        snapshotExporterMockState.instances.push(this.#instance);
      }

      captureAndDownload(canvas: HTMLCanvasElement) {
        return this.#instance.captureAndDownload(canvas);
      }
    },
  };
});

vi.mock("./ImageAssetCache", () => {
  return {
    imageAssetCache: {
      preload: imageAssetCacheMockState.preload,
    },
  };
});

const flushPromises = async (ticks = 5) => {
  for (let index = 0; index < ticks; index += 1) {
    await Promise.resolve();
  }
};

const setNavigatorMock = (params?: {
  userAgent?: string;
  mediaDevices?: {
    getUserMedia?: ReturnType<typeof vi.fn>;
  };
}) => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent:
        params?.userAgent ??
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      mediaDevices: params?.mediaDevices,
    },
  });
};

const setupDomGlobals = () => {
  (globalThis as any).document = {
    createElement: vi.fn(() => ({
      setAttribute: vi.fn(),
    })),
  };

  (globalThis as any).window = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: vi.fn(),
  };

  (globalThis as any).performance = {
    now: vi.fn(() => 0),
  };

  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true,
    value: undefined,
  });

  Object.defineProperty(globalThis, "webkitAudioContext", {
    configurable: true,
    value: undefined,
  });

  setNavigatorMock();
};

const createMockAudioInputStream = (withAudio = true) => {
  const stopAudioTrack = vi.fn();

  const audioTrack = {
    stop: stopAudioTrack,
  } as unknown as MediaStreamTrack;

  const audioTracks = withAudio ? [audioTrack] : [];

  return {
    stopAudioTrack,
    stream: {
      getVideoTracks: vi.fn(() => []),
      getAudioTracks: vi.fn(() => audioTracks),
      getTracks: vi.fn(() => [...audioTracks]),
    } as unknown as MediaStream,
  };
};

const setAudioContextMock = () => {
  const stopNormalizedAudioTrack = vi.fn();

  const normalizedAudioTrack = {
    stop: stopNormalizedAudioTrack,
  } as unknown as MediaStreamTrack;

  const destinationStream = {
    getAudioTracks: vi.fn(() => [normalizedAudioTrack]),
    getTracks: vi.fn(() => [normalizedAudioTrack]),
  } as unknown as MediaStream;

  const close = vi.fn(async () => undefined);
  const resume = vi.fn(async () => undefined);

  class MockAudioContext {
    state: AudioContextState = "suspended";

    createMediaStreamSource = vi.fn(() => ({
      connect: vi.fn(),
    }));

    createGain = vi.fn(() => ({
      gain: {
        value: 1,
      },
      connect: vi.fn(),
    }));

    createMediaStreamDestination = vi.fn(() => ({
      stream: destinationStream,
    }));

    resume = vi.fn(async () => {
      this.state = "running";
      void resume();
    });

    close = vi.fn(async () => {
      this.state = "closed";
      void close();
    });
  }

  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true,
    value: MockAudioContext,
  });

  return {
    destinationStream,
    stopNormalizedAudioTrack,
    close,
    resume,
  };
};

const createCanvasProps = () => ({
  context: {
    fillStyle: "white",
    fillRect: vi.fn(),
  },
  width: 1280,
  height: 720,
});

const getWindowKeyboardListener = (eventType: "keydown" | "keyup") => {
  const addEventListener = (globalThis as any).window.addEventListener;
  const call = addEventListener.mock.calls.find(
    ([registeredEventType]: [string, (...args: any[]) => void]) =>
      registeredEventType === eventType,
  );

  expect(call).toBeDefined();

  return call[1] as (event: KeyboardEvent) => void;
};

const createKeyboardEvent = (
  overrides: Partial<KeyboardEvent> & { key: string; code: string },
) =>
  ({
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  }) as unknown as KeyboardEvent;

const getLatestVideoRecorderMock = () => {
  const latestRecorderMock = videoRecorderMockState.instances.at(-1);

  expect(latestRecorderMock).toBeDefined();

  return latestRecorderMock!;
};

const getLatestSnapshotExporterMock = () => {
  const latestSnapshotExporterMock = snapshotExporterMockState.instances.at(-1);

  expect(latestSnapshotExporterMock).toBeDefined();

  return latestSnapshotExporterMock!;
};

const getLatestCanvasRendererMock = () => {
  const latestCanvasRendererMock = canvasRendererMockState.instances.at(-1);

  expect(latestCanvasRendererMock).toBeDefined();

  return latestCanvasRendererMock!;
};

describe("VisualisationAnimationLoopHandler note dispatch", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.latestRenderCallback = null;
    mockState.midiListeners.noteon = [];
    mockState.midiListeners.noteoff = [];
    canvasRendererMockState.instances = [];
    videoRecorderMockState.instances = [];
    snapshotExporterMockState.instances = [];
    imageAssetCacheMockState.preload.mockReset();
    setupDomGlobals();
    vi.mocked(logMessage).mockReset();
  });

  it("exposes setup preload(imageUrl) and forwards to imageAssetCache", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    new VisualisationAnimationLoopHandler().setup(({ preload }) => {
      preload("https://example.com/setup-preload.png");
    });

    expect(imageAssetCacheMockState.preload).toHaveBeenCalledTimes(1);
    expect(imageAssetCacheMockState.preload).toHaveBeenCalledWith(
      "https://example.com/setup-preload.png",
    );
  });

  it("dispatches note callbacks immediately in MIDI arrival order", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const receivedEvents: string[] = [];

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({ computerKeyboardDebugEnabled: false, fps: 5 })
      .setup(({ onNoteDown, onNoteUp }) => {
        onNoteDown(({ note }) => {
          receivedEvents.push(`down:${note}`);
        });

        onNoteUp(({ note }) => {
          receivedEvents.push(`up:${note}`);
        });
      });

    handler.render();
    await flushPromises();

    const [noteOn] = mockState.midiListeners.noteon;
    const [noteOff] = mockState.midiListeners.noteoff;

    expect(noteOn).toBeDefined();
    expect(noteOff).toBeDefined();

    noteOn!({ note: { identifier: "C4", number: 60, attack: 0.7 } });
    noteOff!({ note: { identifier: "C4", number: 60 } });
    noteOn!({ note: { identifier: "D4", number: 62, attack: 0.9 } });

    expect(receivedEvents).toEqual(["down:C4", "up:C4", "down:D4"]);
  });

  it("does not replay note callbacks during frame rendering", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const onNoteDown = vi.fn();
    const onNoteUp = vi.fn();

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({ computerKeyboardDebugEnabled: false, fps: 5 })
      .setup(({ onNoteDown: registerNoteDown, onNoteUp: registerNoteUp }) => {
        registerNoteDown(onNoteDown);
        registerNoteUp(onNoteUp);
      });

    handler.render();
    await flushPromises();

    const [noteOn] = mockState.midiListeners.noteon;
    const [noteOff] = mockState.midiListeners.noteoff;

    noteOn!({ note: { identifier: "C4", number: 60, attack: 0.7 } });
    noteOff!({ note: { identifier: "C4", number: 60 } });

    expect(onNoteDown).toHaveBeenCalledTimes(1);
    expect(onNoteUp).toHaveBeenCalledTimes(1);

    expect(mockState.latestRenderCallback).not.toBeNull();
    mockState.latestRenderCallback!(createCanvasProps());

    expect(onNoteDown).toHaveBeenCalledTimes(1);
    expect(onNoteUp).toHaveBeenCalledTimes(1);
  });

  it("preserves keyboard debug events when no modifiers are pressed", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const onNoteDown = vi.fn();
    const onNoteUp = vi.fn();

    const handler = new VisualisationAnimationLoopHandler().setup(
      ({ onNoteDown: registerOnNoteDown, onNoteUp: registerOnNoteUp }) => {
        registerOnNoteDown(onNoteDown);
        registerOnNoteUp(onNoteUp);
      },
    );

    handler.render();
    await flushPromises();

    const keydownListener = getWindowKeyboardListener("keydown");
    const keyupListener = getWindowKeyboardListener("keyup");

    const keydownEvent = createKeyboardEvent({ key: "z", code: "KeyZ" });
    keydownListener(keydownEvent);

    expect(onNoteDown).toHaveBeenCalledTimes(1);
    expect(keydownEvent.preventDefault).toHaveBeenCalledTimes(1);

    const keyupEvent = createKeyboardEvent({ key: "z", code: "KeyZ" });
    keyupListener(keyupEvent);

    expect(onNoteUp).toHaveBeenCalledTimes(1);
  });

  it("does not invoke keyboard debug note events when modifier keys are pressed", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const onNoteDown = vi.fn();
    const onNoteUp = vi.fn();

    const handler = new VisualisationAnimationLoopHandler().setup(
      ({ onNoteDown: registerOnNoteDown, onNoteUp: registerOnNoteUp }) => {
        registerOnNoteDown(onNoteDown);
        registerOnNoteUp(onNoteUp);
      },
    );

    handler.render();
    await flushPromises();

    const keydownListener = getWindowKeyboardListener("keydown");
    const keyupListener = getWindowKeyboardListener("keyup");

    const ctrlKeydownEvent = createKeyboardEvent({
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
    });

    const shiftKeydownEvent = createKeyboardEvent({
      key: "Z",
      code: "KeyZ",
      shiftKey: true,
    });

    const ctrlKeyupEvent = createKeyboardEvent({
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
    });

    keydownListener(ctrlKeydownEvent);
    keydownListener(shiftKeydownEvent);
    keyupListener(ctrlKeyupEvent);

    expect(onNoteDown).not.toHaveBeenCalled();
    expect(onNoteUp).not.toHaveBeenCalled();
    expect(ctrlKeydownEvent.preventDefault).not.toHaveBeenCalled();
    expect(shiftKeydownEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("logs screenshot export on Cmd/Ctrl+E and skips debug note dispatch", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const onNoteDown = vi.fn();

    const handler = new VisualisationAnimationLoopHandler().setup(
      ({ onNoteDown: registerOnNoteDown }) => {
        registerOnNoteDown(onNoteDown);
      },
    );

    handler.render();
    await flushPromises();

    const snapshotExporterMock = getLatestSnapshotExporterMock();
    const keydownListener = getWindowKeyboardListener("keydown");

    const ctrlE = createKeyboardEvent({
      key: "e",
      code: "KeyE",
      ctrlKey: true,
    });

    const cmdE = createKeyboardEvent({
      key: "e",
      code: "KeyE",
      metaKey: true,
    });

    keydownListener(ctrlE);
    keydownListener(cmdE);

    expect(snapshotExporterMock.captureAndDownload).toHaveBeenCalledTimes(2);
    expect(vi.mocked(logMessage)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(logMessage)).toHaveBeenNthCalledWith(
      1,
      "Snaspshot exported as image",
    );
    expect(vi.mocked(logMessage)).toHaveBeenNthCalledWith(
      2,
      "Snaspshot exported as image",
    );
    expect(onNoteDown).not.toHaveBeenCalled();
    expect(ctrlE.preventDefault).not.toHaveBeenCalled();
    expect(cmdE.preventDefault).not.toHaveBeenCalled();
  });

  it("starts deterministic recording on Cmd/Ctrl+SHIFT+E and keeps recording status visible", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({ videoRecordingScale: 0.5 })
      .setup(() => {});

    handler.render();
    await flushPromises();

    const recorderMock = getLatestVideoRecorderMock();
    const keydownListener = getWindowKeyboardListener("keydown");

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    await flushPromises(20);

    expect(recorderMock.start).toHaveBeenCalledTimes(1);
    expect(recorderMock.start.mock.calls[0]?.[1]).toEqual({
      scale: 0.5,
      format: "auto",
    });
    expect(vi.mocked(logMessage)).toHaveBeenCalledWith("Recording ...");

    expect(mockState.latestRenderCallback).not.toBeNull();
    mockState.latestRenderCallback!(createCanvasProps());

    expect(recorderMock.captureFrame).toHaveBeenCalledTimes(1);
    expect(recorderMock.captureFrame).toHaveBeenCalledWith(0);
    expect(vi.mocked(logMessage)).toHaveBeenCalledWith("Recording ...");
  });

  it("shows saving status during encoding and then ready/download when deterministic capture completes", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const handler = new VisualisationAnimationLoopHandler().setup(() => {});

    handler.render();
    await flushPromises();

    const recorderMock = getLatestVideoRecorderMock();
    const keydownListener = getWindowKeyboardListener("keydown");

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        metaKey: true,
        shiftKey: true,
      }),
    );

    let resolveStopAndEncode:
      | ((result: { blob: Blob; fileName: string }) => void)
      | null = null;

    recorderMock.stopAndEncode.mockImplementation(
      () =>
        new Promise<{ blob: Blob; fileName: string }>((resolve) => {
          resolveStopAndEncode = resolve;
        }),
    );

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        metaKey: true,
        shiftKey: true,
      }),
    );

    expect(recorderMock.stopAndEncode).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logMessage)).toHaveBeenCalledWith(
      "Saving video capture ...",
    );

    expect(mockState.latestRenderCallback).not.toBeNull();
    mockState.latestRenderCallback!(createCanvasProps());

    expect(vi.mocked(logMessage)).toHaveBeenCalledWith(
      "Saving video capture ...",
    );

    const fakeBlob = new Blob(["encoded-video"]);
    expect(resolveStopAndEncode).toBeDefined();

    resolveStopAndEncode!({
      blob: fakeBlob,
      fileName: "liminalis-capture.webm",
    });

    await flushPromises();

    expect(recorderMock.download).toHaveBeenCalledWith(
      fakeBlob,
      "liminalis-capture.webm",
    );
    expect(vi.mocked(logMessage)).toHaveBeenCalledWith(
      "Recording ready for download",
    );
  });

  it("passes configured video format to recorder start options", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({
        videoRecordingScale: 0.75,
        videoFormat: "mp4",
      })
      .setup(() => {});

    handler.render();
    await flushPromises();

    const recorderMock = getLatestVideoRecorderMock();
    const keydownListener = getWindowKeyboardListener("keydown");

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    expect(recorderMock.start).toHaveBeenCalledTimes(1);
    expect(recorderMock.start.mock.calls[0]?.[1]).toEqual({
      scale: 0.75,
      format: "mp4",
    });
  });

  it("requests audio input stream when enableAudioCapture is true", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const mockInputStream = createMockAudioInputStream(true);
    const getUserMedia = vi.fn(async () => mockInputStream.stream);

    setNavigatorMock({
      mediaDevices: {
        getUserMedia,
      },
    });

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({
        enableAudioCapture: true,
      })
      .setup(() => {});

    handler.render();
    await flushPromises();

    const recorderMock = getLatestVideoRecorderMock();
    const keydownListener = getWindowKeyboardListener("keydown");

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    await flushPromises();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
      },
      video: false,
    });
    expect(recorderMock.start).toHaveBeenCalledTimes(1);
    expect(recorderMock.start.mock.calls[0]?.[1]).toEqual({
      scale: 1,
      format: "auto",
      audioStream: mockInputStream.stream,
    });
  });

  it("passes configured audio input device id to getUserMedia", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const mockInputStream = createMockAudioInputStream(true);
    const getUserMedia = vi.fn(async () => mockInputStream.stream);

    setNavigatorMock({
      mediaDevices: {
        getUserMedia,
      },
    });

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({
        enableAudioCapture: true,
        audioInputDeviceId: "daw-loopback-input",
      })
      .setup(() => {});

    handler.render();
    await flushPromises();

    const keydownListener = getWindowKeyboardListener("keydown");

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    await flushPromises();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: false,
        deviceId: {
          exact: "daw-loopback-input",
        },
        echoCancellation: false,
        noiseSuppression: false,
      },
      video: false,
    });
  });

  it("normalizes input-device audio via AudioContext when available", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const mockInputStream = createMockAudioInputStream(true);
    const getUserMedia = vi.fn(async () => mockInputStream.stream);
    const audioContextMock = setAudioContextMock();

    setNavigatorMock({
      mediaDevices: {
        getUserMedia,
      },
    });

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({
        enableAudioCapture: true,
      })
      .setup(() => {});

    handler.render();
    await flushPromises();

    const recorderMock = getLatestVideoRecorderMock();
    const keydownListener = getWindowKeyboardListener("keydown");

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    await flushPromises();

    expect(recorderMock.start).toHaveBeenCalledTimes(1);
    expect(recorderMock.start.mock.calls[0]?.[1]).toEqual({
      scale: 1,
      format: "auto",
      audioStream: audioContextMock.destinationStream,
    });

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    await flushPromises();

    expect(audioContextMock.stopNormalizedAudioTrack).toHaveBeenCalledTimes(1);
    expect(audioContextMock.close).toHaveBeenCalledTimes(1);
    expect(audioContextMock.resume).toHaveBeenCalledTimes(1);
  });

  it("falls back to video-only with warning when audio input capture is unsupported", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    setNavigatorMock({
      mediaDevices: {},
    });

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({ enableAudioCapture: true })
      .setup(() => {});

    handler.render();
    await flushPromises();

    const recorderMock = getLatestVideoRecorderMock();
    const keydownListener = getWindowKeyboardListener("keydown");

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    await flushPromises();

    expect(vi.mocked(logMessage)).toHaveBeenCalledWith(
      "Audio input capture is unavailable in this browser. Recording video only.",
    );
    expect(recorderMock.start.mock.calls[0]?.[1]).toEqual({
      scale: 1,
      format: "auto",
    });
  });

  it("falls back to video-only with warning when audio input permission is denied", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const getUserMedia = vi.fn(async () => {
      throw {
        name: "NotAllowedError",
      };
    });

    setNavigatorMock({
      mediaDevices: {
        getUserMedia,
      },
    });

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({ enableAudioCapture: true })
      .setup(() => {});

    handler.render();
    await flushPromises();

    const recorderMock = getLatestVideoRecorderMock();
    const keydownListener = getWindowKeyboardListener("keydown");

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    await flushPromises();

    expect(vi.mocked(logMessage)).toHaveBeenCalledWith(
      "Audio input capture was denied. Recording video only.",
    );
    expect(recorderMock.start.mock.calls[0]?.[1]).toEqual({
      scale: 1,
      format: "auto",
    });
  });

  it("falls back to video-only with warning when selected input has no audio track", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const mockInputStream = createMockAudioInputStream(false);
    const getUserMedia = vi.fn(async () => mockInputStream.stream);

    setNavigatorMock({
      mediaDevices: {
        getUserMedia,
      },
    });

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({ enableAudioCapture: true })
      .setup(() => {});

    handler.render();
    await flushPromises();

    const recorderMock = getLatestVideoRecorderMock();
    const keydownListener = getWindowKeyboardListener("keydown");

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    await flushPromises();

    expect(vi.mocked(logMessage)).toHaveBeenCalledWith(
      "No audio track was returned from the selected input. Recording video only.",
    );
    expect(recorderMock.start.mock.calls[0]?.[1]).toEqual({
      scale: 1,
      format: "auto",
    });
  });

  it("cleans up active audio-input stream when recording stops", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const mockInputStream = createMockAudioInputStream(true);
    const getUserMedia = vi.fn(async () => mockInputStream.stream);

    setNavigatorMock({
      mediaDevices: {
        getUserMedia,
      },
    });

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({ enableAudioCapture: true })
      .setup(() => {});

    handler.render();
    await flushPromises();

    const keydownListener = getWindowKeyboardListener("keydown");

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    await flushPromises();

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    await flushPromises();

    expect(mockInputStream.stopAudioTrack).toHaveBeenCalledTimes(1);
  });

  it("falls back to video-only with warning when configured input device is missing", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const getUserMedia = vi.fn(async () => {
      throw {
        name: "NotFoundError",
      };
    });

    setNavigatorMock({
      mediaDevices: {
        getUserMedia,
      },
    });

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({
        enableAudioCapture: true,
        audioInputDeviceId: "missing-device",
      })
      .setup(() => {});

    handler.render();
    await flushPromises();

    const recorderMock = getLatestVideoRecorderMock();
    const keydownListener = getWindowKeyboardListener("keydown");

    keydownListener(
      createKeyboardEvent({
        key: "E",
        code: "KeyE",
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    await flushPromises();

    expect(vi.mocked(logMessage)).toHaveBeenCalledWith(
      "Configured audio input device was not found. Recording video only.",
    );
    expect(recorderMock.start.mock.calls[0]?.[1]).toEqual({
      scale: 1,
      format: "auto",
    });
  });

  it("passes autoScaleDown to CanvasRenderer when configured in withSettings", async () => {
    const { default: VisualisationAnimationLoopHandler } =
      await import("./VisualisationAnimationLoopHandler");

    const handler = new VisualisationAnimationLoopHandler()
      .withSettings({
        width: 1920,
        height: 1080,
        autoScaleDown: true,
      })
      .setup(() => {});

    handler.render();
    await flushPromises();

    const canvasRendererMock = getLatestCanvasRendererMock();
    expect(canvasRendererMock.start).toHaveBeenCalledTimes(1);

    const receivedSettings = canvasRendererMock.start.mock.calls[0]?.[1];

    expect(receivedSettings).toEqual(
      expect.objectContaining({
        dimensions: [1920, 1080],
        autoScaleDown: true,
      }),
    );
  });
});
