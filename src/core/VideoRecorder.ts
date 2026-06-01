type RecorderLifecycleStatus = "idle" | "recording" | "encoding";

export type VideoFormatPreference = "auto" | "webm" | "mp4";

type VideoFileExtension = "webm" | "mp4";

type FrameRequestingTrack = MediaStreamTrack & {
  requestFrame?: () => void;
};

interface EncodedVideoCapture {
  blob: Blob;
  fileName: string;
}

interface VideoRecorderOptions {
  fileNamePrefix?: string;
  videoBitsPerSecond?: number;
}

interface VideoRecorderStartOptions {
  scale?: number;
  format?: VideoFormatPreference;
}

const DEFAULT_FILE_NAME_PREFIX = "liminalis-capture";
const DEFAULT_VIDEO_BITS_PER_SECOND = 12_000_000;
const DEFAULT_CAPTURE_SCALE = 1;
const DEFAULT_VIDEO_FORMAT_PREFERENCE: VideoFormatPreference = "auto";
const MAX_CAPTURE_FPS = 60;
const MIN_CAPTURE_INTERVAL_IN_MS = 1000 / MAX_CAPTURE_FPS;

const WEBM_MIME_TYPE_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

const MP4_MIME_TYPE_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
];

const MIME_TYPE_CANDIDATES_BY_FORMAT: Record<VideoFormatPreference, string[]> =
  {
    auto: [...MP4_MIME_TYPE_CANDIDATES, ...WEBM_MIME_TYPE_CANDIDATES],
    webm: [...WEBM_MIME_TYPE_CANDIDATES, ...MP4_MIME_TYPE_CANDIDATES],
    mp4: [...MP4_MIME_TYPE_CANDIDATES, ...WEBM_MIME_TYPE_CANDIDATES],
  };

interface ResolvedVideoFormat {
  mimeType: string | undefined;
  fileExtension: VideoFileExtension;
}

class VideoRecorder {
  #status: RecorderLifecycleStatus = "idle";

  #stream: MediaStream | null = null;
  #track: FrameRequestingTrack | null = null;
  #mediaRecorder: MediaRecorder | null = null;

  #recordedChunks: BlobPart[] = [];
  #pendingStopPromise: Promise<Blob> | null = null;

  #fileNamePrefix: string;
  #videoBitsPerSecond: number;

  #captureScale = DEFAULT_CAPTURE_SCALE;
  #sourceCanvas: HTMLCanvasElement | null = null;
  #captureCanvas: HTMLCanvasElement | null = null;
  #captureContext: CanvasRenderingContext2D | null = null;
  #lastCapturedFrameTimeInMs: number | null = null;

  #activeMimeType = "video/webm";
  #activeFileExtension: VideoFileExtension = "webm";

  constructor(options: VideoRecorderOptions = {}) {
    this.#fileNamePrefix = options.fileNamePrefix ?? DEFAULT_FILE_NAME_PREFIX;
    this.#videoBitsPerSecond =
      options.videoBitsPerSecond ?? DEFAULT_VIDEO_BITS_PER_SECOND;
  }

  get isRecording(): boolean {
    return this.#status === "recording";
  }

  get isEncoding(): boolean {
    return this.#status === "encoding";
  }

  get status(): RecorderLifecycleStatus {
    return this.#status;
  }

  start(
    sourceCanvas: HTMLCanvasElement,
    options: VideoRecorderStartOptions = {},
  ): void {
    if (this.#status !== "idle") {
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder API is not available in this browser.");
    }

    if (typeof sourceCanvas.captureStream !== "function") {
      throw new Error("Canvas capture stream API is not available.");
    }

    const captureScale = this.#resolveCaptureScale(options.scale);
    this.#captureScale = captureScale;

    if (captureScale < DEFAULT_CAPTURE_SCALE) {
      const captureCanvas = this.#createCaptureCanvas(
        sourceCanvas,
        captureScale,
      );
      const captureContext = captureCanvas.getContext("2d");

      if (!captureContext) {
        throw new Error("Unable to initialize recording capture context.");
      }

      this.#sourceCanvas = sourceCanvas;
      this.#captureCanvas = captureCanvas;
      this.#captureContext = captureContext;
      this.#syncCaptureCanvasFromSource();
    } else {
      this.#resetCaptureSurfaces();
    }

    const recordingCanvas = this.#captureCanvas ?? sourceCanvas;

    const stream = recordingCanvas.captureStream(0);
    const [videoTrack] = stream.getVideoTracks();

    if (!videoTrack) {
      stream.getTracks().forEach((track) => track.stop());
      this.#resetCaptureSurfaces();
      throw new Error("Unable to obtain a video track for recording.");
    }

    const track = videoTrack as FrameRequestingTrack;

    if (typeof track.requestFrame !== "function") {
      stream.getTracks().forEach((streamTrack) => streamTrack.stop());
      this.#resetCaptureSurfaces();
      throw new Error("Video frame capture is not supported.");
    }

    const formatPreference = options.format ?? DEFAULT_VIDEO_FORMAT_PREFERENCE;
    const { mimeType, fileExtension } =
      this.#resolveSupportedFormat(formatPreference);

    this.#activeMimeType =
      mimeType ?? this.#mimeTypeForExtension(fileExtension);
    this.#activeFileExtension = fileExtension;

    const recorderOptions: MediaRecorderOptions = {
      videoBitsPerSecond: this.#videoBitsPerSecond,
    };

    if (mimeType) {
      recorderOptions.mimeType = mimeType;
    }

    this.#recordedChunks = [];
    this.#status = "recording";
    this.#stream = stream;
    this.#track = track;
    this.#lastCapturedFrameTimeInMs = null;

    const mediaRecorder = new MediaRecorder(stream, recorderOptions);
    this.#mediaRecorder = mediaRecorder;

    this.#pendingStopPromise = new Promise<Blob>((resolve, reject) => {
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.#recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        this.#status = "idle";
        this.#teardownStream();
        this.#mediaRecorder = null;
        this.#pendingStopPromise = null;
        reject(new Error("Video recording failed."));
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(this.#recordedChunks, {
          type: this.#activeMimeType,
        });

        resolve(blob);
      };
    });

    mediaRecorder.start();
  }

  captureFrame(elapsedTimeInMs?: number): void {
    if (!this.isRecording || !this.#track) {
      return;
    }

    if (!this.#shouldCaptureFrame(elapsedTimeInMs)) {
      return;
    }

    this.#syncCaptureCanvasFromSource();
    this.#track.requestFrame?.();

    if (typeof elapsedTimeInMs === "number") {
      this.#lastCapturedFrameTimeInMs = elapsedTimeInMs;
    }
  }

  async stopAndEncode(): Promise<EncodedVideoCapture> {
    if (!this.#mediaRecorder || !this.#pendingStopPromise) {
      throw new Error("No active recording to stop.");
    }

    this.#status = "encoding";

    if (this.#mediaRecorder.state !== "inactive") {
      this.#mediaRecorder.stop();
    }

    const blob = await this.#pendingStopPromise;

    this.#teardownStream();
    this.#mediaRecorder = null;
    this.#pendingStopPromise = null;
    this.#status = "idle";

    return {
      blob,
      fileName: this.#buildFileName(),
    };
  }

  download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  #resolveSupportedFormat(format: VideoFormatPreference): ResolvedVideoFormat {
    if (typeof MediaRecorder === "undefined") {
      return {
        mimeType: undefined,
        fileExtension: this.#defaultExtensionForFormat(format),
      };
    }

    const supportedMimeType = MIME_TYPE_CANDIDATES_BY_FORMAT[format].find(
      (mimeType) => MediaRecorder.isTypeSupported(mimeType),
    );

    if (!supportedMimeType) {
      return {
        mimeType: undefined,
        fileExtension: this.#defaultExtensionForFormat(format),
      };
    }

    return {
      mimeType: supportedMimeType,
      fileExtension: this.#extensionForMimeType(supportedMimeType),
    };
  }

  #defaultExtensionForFormat(
    format: VideoFormatPreference,
  ): VideoFileExtension {
    if (format === "mp4") {
      return "mp4";
    }

    return "webm";
  }

  #extensionForMimeType(mimeType: string): VideoFileExtension {
    if (mimeType.includes("mp4")) {
      return "mp4";
    }

    return "webm";
  }

  #mimeTypeForExtension(fileExtension: VideoFileExtension): string {
    if (fileExtension === "mp4") {
      return "video/mp4";
    }

    return "video/webm";
  }

  #buildFileName(): string {
    return `${this.#fileNamePrefix}-${Date.now()}.${this.#activeFileExtension}`;
  }

  #resolveCaptureScale(scale: number | undefined): number {
    if (scale === undefined) {
      return DEFAULT_CAPTURE_SCALE;
    }

    if (
      !Number.isFinite(scale) ||
      scale <= 0 ||
      scale > DEFAULT_CAPTURE_SCALE
    ) {
      throw new Error(
        "Recording scale must be greater than 0 and less than or equal to 1.",
      );
    }

    return scale;
  }

  #createCaptureCanvas(
    sourceCanvas: HTMLCanvasElement,
    captureScale: number,
  ): HTMLCanvasElement {
    if (
      typeof document === "undefined" ||
      typeof document.createElement !== "function"
    ) {
      throw new Error("Document API is not available for scaled capture.");
    }

    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = Math.max(
      1,
      Math.round(sourceCanvas.width * captureScale),
    );
    captureCanvas.height = Math.max(
      1,
      Math.round(sourceCanvas.height * captureScale),
    );

    return captureCanvas;
  }

  #syncCaptureCanvasFromSource(): void {
    if (!this.#sourceCanvas || !this.#captureCanvas || !this.#captureContext) {
      return;
    }

    const targetWidth = Math.max(
      1,
      Math.round(this.#sourceCanvas.width * this.#captureScale),
    );
    const targetHeight = Math.max(
      1,
      Math.round(this.#sourceCanvas.height * this.#captureScale),
    );

    if (
      this.#captureCanvas.width !== targetWidth ||
      this.#captureCanvas.height !== targetHeight
    ) {
      this.#captureCanvas.width = targetWidth;
      this.#captureCanvas.height = targetHeight;
    }

    this.#captureContext.imageSmoothingEnabled = true;
    this.#captureContext.drawImage(
      this.#sourceCanvas,
      0,
      0,
      targetWidth,
      targetHeight,
    );
  }

  #resetCaptureSurfaces(): void {
    this.#captureScale = DEFAULT_CAPTURE_SCALE;
    this.#sourceCanvas = null;
    this.#captureCanvas = null;
    this.#captureContext = null;
    this.#lastCapturedFrameTimeInMs = null;
  }

  #shouldCaptureFrame(elapsedTimeInMs: number | undefined): boolean {
    if (typeof elapsedTimeInMs !== "number") {
      return true;
    }

    if (this.#lastCapturedFrameTimeInMs === null) {
      return true;
    }

    if (elapsedTimeInMs < this.#lastCapturedFrameTimeInMs) {
      return true;
    }

    return (
      elapsedTimeInMs - this.#lastCapturedFrameTimeInMs >=
      MIN_CAPTURE_INTERVAL_IN_MS
    );
  }

  #teardownStream(): void {
    if (this.#stream) {
      this.#stream.getTracks().forEach((track) => track.stop());
    }

    this.#stream = null;
    this.#track = null;
    this.#resetCaptureSurfaces();
  }
}

export default VideoRecorder;
