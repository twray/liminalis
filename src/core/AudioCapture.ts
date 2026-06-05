import { logMessage } from "../util/log";

export type AudioSourceMode = "none" | "audio-input-device";

export interface AudioCaptureSession {
  sourceStream: MediaStream;
  outputStream: MediaStream;
  audioContext: AudioContext | null;
}

interface AudioCaptureSettings {
  sourceMode: AudioSourceMode;
  inputDeviceId: string | undefined;
}

interface RawAudioInputConstraintOptions {
  deviceId: string | null;
}

type AudioCaptureErrorType =
  | "UNSUPPORTED"
  | "PERMISSION_DENIED"
  | "NO_AUDIO_TRACK"
  | "UNAVAILABLE"
  | "DEVICE_NOT_FOUND";

const AUDIO_CAPTURE_VIDEO_FALLBACK_MESSAGES: Record<
  AudioCaptureErrorType,
  string
> = {
  UNSUPPORTED:
    "Audio input capture is unavailable in this browser. Recording video only.",
  PERMISSION_DENIED: "Audio input capture was denied. Recording video only.",
  NO_AUDIO_TRACK:
    "No audio track was returned from the selected input. Recording video only.",
  UNAVAILABLE: "Audio input capture failed. Recording video only.",
  DEVICE_NOT_FOUND:
    "Configured audio input device was not found. Recording video only.",
};

class AudioCapture {
  #sourceMode: AudioSourceMode = "none";
  #inputDeviceId: string | undefined;
  #activeSession: AudioCaptureSession | null = null;

  updateSettings({ sourceMode, inputDeviceId }: AudioCaptureSettings): void {
    this.#sourceMode = sourceMode;
    this.#inputDeviceId = inputDeviceId;
  }

  hasConfiguredSource(): boolean {
    return this.#sourceMode !== "none";
  }

  async acquireSession(): Promise<AudioCaptureSession | null> {
    if (!this.hasConfiguredSource()) {
      return null;
    }

    return this.#requestAudioInputCaptureSession();
  }

  activateSession(session: AudioCaptureSession | null): void {
    this.#activeSession = session;
  }

  cleanupActiveSession(): void {
    this.disposeSession(this.#activeSession);
    this.#activeSession = null;
  }

  disposeSession(session: AudioCaptureSession | null): void {
    if (!session) {
      return;
    }

    const uniqueTracks = new Set<MediaStreamTrack>([
      ...session.sourceStream.getTracks(),
      ...session.outputStream.getTracks(),
    ]);

    uniqueTracks.forEach((track) => track.stop());

    if (session.audioContext && session.audioContext.state !== "closed") {
      void session.audioContext.close().catch(() => undefined);
    }
  }

  async #requestAudioInputCaptureSession(): Promise<AudioCaptureSession | null> {
    if (!this.#supportsAudioInputCapture()) {
      logMessage(this.#audioCaptureMessage("UNSUPPORTED"));
      return null;
    }

    try {
      const configuredAudioInputDeviceId =
        typeof this.#inputDeviceId === "string" &&
        this.#inputDeviceId.trim().length > 0
          ? this.#inputDeviceId.trim()
          : null;

      const sourceStream = await navigator.mediaDevices.getUserMedia({
        audio: this.#buildRawAudioInputConstraints({
          deviceId: configuredAudioInputDeviceId,
        }),
        video: false,
      });

      if (sourceStream.getAudioTracks().length === 0) {
        sourceStream.getTracks().forEach((track) => track.stop());
        logMessage(this.#audioCaptureMessage("NO_AUDIO_TRACK"));
        return null;
      }

      return this.#createCaptureSession(sourceStream);
    } catch (error) {
      const errorName = this.#resolveErrorName(error);

      if (
        errorName === "NotAllowedError" ||
        errorName === "PermissionDeniedError" ||
        errorName === "SecurityError"
      ) {
        logMessage(this.#audioCaptureMessage("PERMISSION_DENIED"));
      } else if (
        errorName === "NotFoundError" ||
        errorName === "DevicesNotFoundError" ||
        errorName === "OverconstrainedError" ||
        errorName === "ConstraintNotSatisfiedError"
      ) {
        logMessage(this.#audioCaptureMessage("DEVICE_NOT_FOUND"));
      } else if (errorName === "NotSupportedError") {
        logMessage(this.#audioCaptureMessage("UNSUPPORTED"));
      } else {
        logMessage(this.#audioCaptureMessage("UNAVAILABLE"));
      }

      return null;
    }
  }

  async #createCaptureSession(
    sourceStream: MediaStream,
  ): Promise<AudioCaptureSession> {
    const { outputStream, audioContext } =
      await this.#createNormalizedAudioOutputStream(sourceStream);

    return {
      sourceStream,
      outputStream,
      audioContext,
    };
  }

  async #createNormalizedAudioOutputStream(
    sourceStream: MediaStream,
  ): Promise<{ outputStream: MediaStream; audioContext: AudioContext | null }> {
    const [audioTrack] = sourceStream.getAudioTracks();
    const preferredSampleRate = this.#resolveAudioTrackSampleRate(audioTrack);
    const audioContext = this.#createAudioContext(preferredSampleRate);

    if (!audioContext) {
      return {
        outputStream: sourceStream,
        audioContext: null,
      };
    }

    try {
      const sourceNode = audioContext.createMediaStreamSource(sourceStream);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1;

      const destinationNode = audioContext.createMediaStreamDestination();

      sourceNode.connect(gainNode);
      gainNode.connect(destinationNode);

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const [normalizedAudioTrack] = destinationNode.stream.getAudioTracks();

      if (!normalizedAudioTrack) {
        await audioContext.close();

        return {
          outputStream: sourceStream,
          audioContext: null,
        };
      }

      if (typeof MediaStream === "function") {
        return {
          outputStream: new MediaStream([normalizedAudioTrack]),
          audioContext,
        };
      }

      return {
        outputStream: destinationNode.stream,
        audioContext,
      };
    } catch {
      await audioContext.close().catch(() => undefined);

      return {
        outputStream: sourceStream,
        audioContext: null,
      };
    }
  }

  #supportsAudioInputCapture(): boolean {
    if (typeof navigator === "undefined") {
      return false;
    }

    return (
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
    );
  }

  #resolveAudioTrackSampleRate(
    track: MediaStreamTrack | undefined,
  ): number | undefined {
    if (!track || typeof track.getSettings !== "function") {
      return undefined;
    }

    const { sampleRate } = track.getSettings();

    if (
      typeof sampleRate === "number" &&
      Number.isFinite(sampleRate) &&
      sampleRate > 0
    ) {
      return sampleRate;
    }

    return undefined;
  }

  #createAudioContext(
    preferredSampleRate: number | undefined,
  ): AudioContext | null {
    const audioContextConstructor =
      globalThis.AudioContext ??
      (
        globalThis as {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!audioContextConstructor) {
      return null;
    }

    if (typeof preferredSampleRate === "number") {
      try {
        return new audioContextConstructor({
          sampleRate: preferredSampleRate,
        });
      } catch {
        return new audioContextConstructor();
      }
    }

    return new audioContextConstructor();
  }

  #resolveErrorName(error: unknown): string | undefined {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      typeof (error as { name: unknown }).name === "string"
    ) {
      return (error as { name: string }).name;
    }

    return undefined;
  }

  #buildRawAudioInputConstraints({
    deviceId,
  }: RawAudioInputConstraintOptions): MediaTrackConstraints {
    const rawConstraints: MediaTrackConstraints = {
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
    };

    if (deviceId) {
      rawConstraints.deviceId = {
        exact: deviceId,
      };
    }

    return rawConstraints;
  }

  #audioCaptureMessage(errorType: AudioCaptureErrorType): string {
    return AUDIO_CAPTURE_VIDEO_FALLBACK_MESSAGES[errorType];
  }
}

export default AudioCapture;
