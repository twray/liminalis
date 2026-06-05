import { beforeEach, describe, expect, it, vi } from "vitest";

import { logMessage } from "../util/log";
import AudioCapture from "./AudioCapture";

vi.mock("../util/log", () => {
  return {
    logMessage: vi.fn(),
  };
});

const setNavigatorMock = (mediaDevices?: {
  getUserMedia?: ReturnType<typeof vi.fn>;
}) => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices,
    },
  });
};

const createMockTrack = (sampleRate?: number) => {
  const stop = vi.fn();
  const getSettings = vi.fn(() =>
    typeof sampleRate === "number" ? { sampleRate } : {},
  );

  return {
    track: {
      stop,
      getSettings,
    } as unknown as MediaStreamTrack,
    stop,
  };
};

const createMockStream = ({
  audioTracks = [],
  extraTracks = [],
}: {
  audioTracks?: MediaStreamTrack[];
  extraTracks?: MediaStreamTrack[];
} = {}) => {
  return {
    getAudioTracks: vi.fn(() => audioTracks),
    getTracks: vi.fn(() => [...audioTracks, ...extraTracks]),
  } as unknown as MediaStream;
};

const setAudioContextMock = () => {
  const constructorOptions: Array<AudioContextOptions | undefined> = [];

  const sourceNode = {
    connect: vi.fn(),
  };

  const gainNode = {
    gain: {
      value: 0,
    },
    connect: vi.fn(),
  };

  const { track: normalizedTrack } = createMockTrack();

  const destinationStream = createMockStream({
    audioTracks: [normalizedTrack],
  });

  class MockAudioContext {
    state: AudioContextState = "suspended";

    constructor(options?: AudioContextOptions) {
      constructorOptions.push(options);
    }

    createMediaStreamSource = vi.fn(() => sourceNode);

    createGain = vi.fn(() => gainNode);

    createMediaStreamDestination = vi.fn(() => ({
      stream: destinationStream,
    }));

    resume = vi.fn(async () => {
      this.state = "running";
    });

    close = vi.fn(async () => {
      this.state = "closed";
    });
  }

  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true,
    value: MockAudioContext,
  });

  Object.defineProperty(globalThis, "webkitAudioContext", {
    configurable: true,
    value: undefined,
  });

  return {
    constructorOptions,
    destinationStream,
    MockAudioContext,
  };
};

describe("AudioCapture", () => {
  beforeEach(() => {
    vi.mocked(logMessage).mockReset();

    setNavigatorMock();

    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: undefined,
    });

    Object.defineProperty(globalThis, "webkitAudioContext", {
      configurable: true,
      value: undefined,
    });

    Object.defineProperty(globalThis, "MediaStream", {
      configurable: true,
      value: undefined,
    });
  });

  it("returns null without requesting media when source mode is none", async () => {
    const getUserMedia = vi.fn();
    setNavigatorMock({ getUserMedia });

    const capture = new AudioCapture();
    capture.updateSettings({
      sourceMode: "none",
      inputDeviceId: undefined,
    });

    const session = await capture.acquireSession();

    expect(session).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("requests audio input with default constraints", async () => {
    const { track } = createMockTrack();
    const sourceStream = createMockStream({
      audioTracks: [track],
    });

    const getUserMedia = vi.fn(async () => sourceStream);

    setNavigatorMock({ getUserMedia });

    const capture = new AudioCapture();
    capture.updateSettings({
      sourceMode: "audio-input-device",
      inputDeviceId: undefined,
    });

    const session = await capture.acquireSession();

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
      },
      video: false,
    });

    expect(session).toEqual({
      sourceStream,
      outputStream: sourceStream,
      audioContext: null,
    });
  });

  it("passes an exact audio input device id when configured", async () => {
    const { track } = createMockTrack();
    const sourceStream = createMockStream({
      audioTracks: [track],
    });

    const getUserMedia = vi.fn(async () => sourceStream);

    setNavigatorMock({ getUserMedia });

    const capture = new AudioCapture();
    capture.updateSettings({
      sourceMode: "audio-input-device",
      inputDeviceId: "  daw-loopback-input  ",
    });

    await capture.acquireSession();

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

  it("logs unsupported capture when getUserMedia is unavailable", async () => {
    setNavigatorMock({});

    const capture = new AudioCapture();
    capture.updateSettings({
      sourceMode: "audio-input-device",
      inputDeviceId: undefined,
    });

    const session = await capture.acquireSession();

    expect(session).toBeNull();
    expect(vi.mocked(logMessage)).toHaveBeenCalledWith(
      "Audio input capture is unavailable in this browser. Recording video only.",
    );
  });

  it("logs and cleans up when selected input has no audio track", async () => {
    const { track: nonAudioTrack, stop: stopNonAudioTrack } = createMockTrack();

    const sourceStream = createMockStream({
      audioTracks: [],
      extraTracks: [nonAudioTrack],
    });

    const getUserMedia = vi.fn(async () => sourceStream);

    setNavigatorMock({ getUserMedia });

    const capture = new AudioCapture();
    capture.updateSettings({
      sourceMode: "audio-input-device",
      inputDeviceId: undefined,
    });

    const session = await capture.acquireSession();

    expect(session).toBeNull();
    expect(stopNonAudioTrack).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logMessage)).toHaveBeenCalledWith(
      "No audio track was returned from the selected input. Recording video only.",
    );
  });

  it.each([
    [
      "NotAllowedError",
      "Audio input capture was denied. Recording video only.",
    ],
    [
      "NotFoundError",
      "Configured audio input device was not found. Recording video only.",
    ],
    ["AbortError", "Audio input capture failed. Recording video only."],
  ])(
    "logs the expected fallback message for %s",
    async (errorName, expectedMessage) => {
      const getUserMedia = vi.fn(async () => {
        throw {
          name: errorName,
        };
      });

      setNavigatorMock({ getUserMedia });

      const capture = new AudioCapture();
      capture.updateSettings({
        sourceMode: "audio-input-device",
        inputDeviceId: "missing-device-id",
      });

      const session = await capture.acquireSession();

      expect(session).toBeNull();
      expect(vi.mocked(logMessage)).toHaveBeenCalledWith(expectedMessage);
    },
  );

  it("normalizes captured audio with AudioContext when available", async () => {
    const { track: sourceTrack } = createMockTrack(48_000);
    const sourceStream = createMockStream({
      audioTracks: [sourceTrack],
    });

    const getUserMedia = vi.fn(async () => sourceStream);

    setNavigatorMock({ getUserMedia });

    const { constructorOptions, destinationStream, MockAudioContext } =
      setAudioContextMock();

    const capture = new AudioCapture();
    capture.updateSettings({
      sourceMode: "audio-input-device",
      inputDeviceId: undefined,
    });

    const session = await capture.acquireSession();

    expect(session).not.toBeNull();
    expect(session?.sourceStream).toBe(sourceStream);
    expect(session?.outputStream).toBe(destinationStream);
    expect(session?.audioContext).toBeInstanceOf(MockAudioContext);
    expect(constructorOptions[0]).toEqual({
      sampleRate: 48_000,
    });

    const audioContextInstance = session?.audioContext as InstanceType<
      typeof MockAudioContext
    >;

    expect(audioContextInstance.resume).toHaveBeenCalledTimes(1);
  });

  it("cleans up unique tracks and closes the active audio context", () => {
    const { track: sharedTrack, stop: stopSharedTrack } = createMockTrack();
    const { track: normalizedTrack, stop: stopNormalizedTrack } =
      createMockTrack();

    const sourceStream = createMockStream({
      audioTracks: [sharedTrack],
    });

    const outputStream = createMockStream({
      audioTracks: [sharedTrack, normalizedTrack],
    });

    const close = vi.fn(async () => undefined);

    const session = {
      sourceStream,
      outputStream,
      audioContext: {
        state: "running",
        close,
      } as unknown as AudioContext,
    };

    const capture = new AudioCapture();
    capture.activateSession(session);

    capture.cleanupActiveSession();
    capture.cleanupActiveSession();

    expect(stopSharedTrack).toHaveBeenCalledTimes(1);
    expect(stopNormalizedTrack).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
