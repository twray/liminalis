import { Utilities, WebMidi } from "webmidi";

import { createDrawContext } from "../render";
import type { AssetCacheEntry } from "./AsyncAssetCache";
import AudioCapture, { type AudioCaptureSession } from "./AudioCapture";
import CanvasRenderer from "./CanvasRenderer";
import { fontAssetCache, type FontAssetDefinition } from "./FontAssetCache";
import { imageAssetCache } from "./ImageAssetCache";
import { getRenderIsometricMethods } from "./renderIsometricMethods";
import SnapshotExporter from "./SnapshotExporter";
import VideoRecorder from "./VideoRecorder";

import type {
  AppSettings,
  CanvasProps,
  DrawCallback,
  EventTime,
  MidiNoteEvent,
  NormalizedFloat,
  NoteDownEvent,
  NoteUpEvent,
  Point2D,
  RenderIsometricCallback,
  RenderProps,
  SketchSettings,
} from "../types";

import { eventTimeToMs, toNormalizedFloat } from "../util";
import { logMessage } from "../util/log";

import NoteEventManager from "./NoteEventManager";
import Scene from "./Scene";

import IsometricView from "../views/IsometricView";

import keyMappings from "../data/keyMappings.json";

type VideoFormatPreference = "auto" | "webm" | "mp4";

interface WithSceneContext {
  scene: Scene;
}

type MidiEventCallback = (event: MidiNoteEvent) => void;

type NoteDownEventCallback = (params: NoteDownEvent & WithSceneContext) => void;

type NoteUpEventCallback = (params: NoteUpEvent & WithSceneContext) => void;

type FrameEventCallback = (params: FrameRenderProps) => void;

type TimeEventCallback = (params: WithSceneContext) => void;

interface TimeCallbackEntry {
  time: number;
  callback: TimeEventCallback;
}

interface ExpirableTimeCallbackEntry extends TimeCallbackEntry {
  expired: boolean;
}

interface SetUpEventListenersParams {
  appProperties: AppSettings;
  noteEventManager: NoteEventManager;
}

interface SceneSettings {
  width?: number;
  height?: number;
  fps?: number;
  autoScaleDown?: boolean;
  computerKeyboardDebugEnabled?: boolean;
  videoRecordingScale?: number;
  videoFormat?: VideoFormatPreference;
  enableAudioCapture?: boolean;
  audioInputDeviceId?: string;
}

interface SetupFunctionProps<TState> {
  state: TState;
  sceneWidth: number;
  sceneHeight: number;
  sceneCenter: Point2D;
  load: (
    callback: (loaders: SetupAssetLoaders) => void,
    options?: SetupAssetLoadOptions,
  ) => void;
  onNoteDown: (callback: NoteDownEventCallback) => void;
  onNoteUp: (callback: NoteUpEventCallback) => void;
  onRender: (callback: FrameEventCallback) => void;
  atTime: (time: EventTime, callback: TimeEventCallback) => void;
  atStart: (callback: TimeEventCallback) => void;
}

interface SetupAssetLoaders {
  image: (imageUrl: string | string[]) => void;
  font: (font: FontAssetDefinition | FontAssetDefinition[]) => void;
}

interface SetupAssetLoadOptions {
  deferRender?: boolean;
}

interface FrameRenderProps extends RenderProps {
  beforeTime: (time: EventTime) => boolean;
  afterTime: (time: EventTime) => boolean;
  duringTimeInterval: (startTime: EventTime, endTime: EventTime) => boolean;
  activeNotes: NoteDownEvent[];
}

const KEYBOARD_DEBUG_ATTACK_KEY_REGEX = /^[1-9]$/;
const SCREENSHOT_EXPORT_KEY = "e";
const VIDEO_EXPORT_KEY = "e";

const DEFAULTS = {
  INTERNAL_CLOCK_MAX_FRAME_DELTA_IN_MS: 250,
  SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED: true,
  SETTINGS_FPS: 60,
  SETTINGS_AUTO_SCALE_DOWN: true,
  SETTINGS_VIDEO_RECORDING_SCALE: 1,
  SETTINGS_VIDEO_FORMAT: "auto" as VideoFormatPreference,
  SETTINGS_ENABLE_AUDIO_CAPTURE: false,
};

class VisualisationAnimationLoopHandler<TState> {
  #settings: Omit<SketchSettings, "canvas"> = {
    animate: true,
    fps: DEFAULTS.SETTINGS_FPS,
    playbackRate: "throttle",
    scaleToFit: true,
  };

  #appProperties: AppSettings = {
    computerKeyboardDebugEnabled:
      DEFAULTS.SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED,
  };

  #noteEventManager = new NoteEventManager("major");

  #scene = new Scene();
  #sceneState: TState = {} as TState;

  // Callbacks from event-based handlers that
  // are registered in the 'setup' function

  #timeCallbacks: ExpirableTimeCallbackEntry[] = [];
  #noteDownCallbacks: NoteDownEventCallback[] = [];
  #noteUpCallbacks: NoteUpEventCallback[] = [];
  #frameRenderCallbacks: FrameEventCallback[] = [];

  #internalElapsedTimeInMs = 0;
  #internalLastFrameTimestampInMs: number | null = null;

  #currentKeyboardDebugNumericPressedKey: string | null = null;

  #canvas: HTMLCanvasElement | null = null;
  #canvasRenderer = new CanvasRenderer();
  #videoRecorder = new VideoRecorder();
  #audioCapture = new AudioCapture();
  #snapshotExporter = new SnapshotExporter();
  #videoRecordingScale = DEFAULTS.SETTINGS_VIDEO_RECORDING_SCALE;
  #videoRecordingFormat: VideoFormatPreference = DEFAULTS.SETTINGS_VIDEO_FORMAT;
  #deferredAssetLoadPromises: Promise<void>[] = [];

  constructor() {}

  withSettings({
    width,
    height,
    fps = 60,
    autoScaleDown = DEFAULTS.SETTINGS_AUTO_SCALE_DOWN,
    computerKeyboardDebugEnabled = DEFAULTS.SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED,
    videoRecordingScale = DEFAULTS.SETTINGS_VIDEO_RECORDING_SCALE,
    videoFormat = DEFAULTS.SETTINGS_VIDEO_FORMAT,
    enableAudioCapture = DEFAULTS.SETTINGS_ENABLE_AUDIO_CAPTURE,
    audioInputDeviceId,
  }: SceneSettings) {
    this.#settings = { ...this.#settings, fps, autoScaleDown };

    if (width !== undefined && height !== undefined) {
      this.#settings.dimensions = [width, height];
    }

    this.#appProperties = {
      ...this.#appProperties,
      computerKeyboardDebugEnabled,
    };

    this.#videoRecordingScale = videoRecordingScale;
    this.#videoRecordingFormat = videoFormat;

    this.#audioCapture.updateSettings({
      sourceMode: enableAudioCapture ? "audio-input-device" : "none",
      inputDeviceId: audioInputDeviceId,
    });

    return this;
  }

  withState<T extends Record<string, any>>(
    state: T,
  ): VisualisationAnimationLoopHandler<T> {
    const instance = this as any as VisualisationAnimationLoopHandler<T>;
    instance.#sceneState = state;
    return instance;
  }

  setup(setupFunction: (props: SetupFunctionProps<TState>) => void) {
    this.#deferredAssetLoadPromises = [];

    const onNoteDown = (callback: NoteDownEventCallback) => {
      this.#noteDownCallbacks.push(callback);
    };

    const onNoteUp = (callback: NoteUpEventCallback) => {
      this.#noteUpCallbacks.push(callback);
    };

    const onRender = (callback: FrameEventCallback) => {
      this.#frameRenderCallbacks.push(callback);
    };

    const atTime = (eventTime: EventTime, callback: TimeEventCallback) => {
      this.#timeCallbacks.push({
        time: eventTimeToMs(eventTime),
        callback,
        expired: false,
      });
    };

    const atStart = (callback: TimeEventCallback) => {
      atTime(0, callback);
    };

    const toLoadPromise = (entry: AssetCacheEntry<unknown>): Promise<void> =>
      entry.status === "loading" ? entry.promise : Promise.resolve();

    const load = (
      callback: (loaders: SetupAssetLoaders) => void,
      options: SetupAssetLoadOptions = {},
    ) => {
      const batchPromises: Promise<void>[] = [];

      callback({
        image: (imageUrl: string | string[]) => {
          const imageUrls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];

          for (const imageSrc of imageUrls) {
            batchPromises.push(
              toLoadPromise(imageAssetCache.ensureLoaded(imageSrc)),
            );
          }
        },
        font: (font: FontAssetDefinition | FontAssetDefinition[]) => {
          const fonts = Array.isArray(font) ? font : [font];

          for (const fontDefinition of fonts) {
            batchPromises.push(
              toLoadPromise(fontAssetCache.ensureLoaded(fontDefinition)),
            );
          }
        },
      });

      if (options.deferRender !== false && batchPromises.length > 0) {
        this.#deferredAssetLoadPromises.push(
          Promise.all(batchPromises).then(() => undefined),
        );
      }
    };

    const canvasWidth = this.#settings.dimensions?.[0] ?? window.innerWidth;
    const canvasHeight = this.#settings.dimensions?.[1] ?? window.innerHeight;
    const canvasCenter = { x: canvasWidth / 2, y: canvasHeight / 2 };

    setupFunction({
      state: this.#sceneState,
      sceneWidth: canvasWidth,
      sceneHeight: canvasHeight,
      sceneCenter: canvasCenter,
      load,
      onNoteDown,
      onNoteUp,
      onRender,
      atTime,
      atStart,
    });

    return this;
  }

  render() {
    this.#resetInternalClock();

    // Creates the canvas instance on render
    const canvas = document.createElement("canvas");
    canvas.setAttribute("id", "canvas-visualisation");
    this.#canvas = canvas;

    // Create draw context scoped to this render lifecycle
    // This persists across frames but is isolated to this scene
    const drawContext = createDrawContext();

    const renderer = () => {
      return (canvasProps: CanvasProps) => {
        const { context, width, height } = canvasProps;

        // Compute runtime from a monotonic internal clock so timing is
        // independent from renderer playback settings.

        const center = { x: width / 2, y: height / 2 };
        const timeInMs = this.#getInternalElapsedTimeInMs();

        // Set background color and clear the canvas for rendering

        context.fillStyle = "white";
        context.fillRect(0, 0, width, height);

        // Convenience functions for conditional rendering based on time
        // intervals

        const beforeTime = (time: EventTime) => timeInMs < eventTimeToMs(time);
        const afterTime = (time: EventTime) => timeInMs > eventTimeToMs(time);
        const duringTimeInterval = (startTime: EventTime, endTime: EventTime) =>
          timeInMs >= eventTimeToMs(startTime) &&
          timeInMs <= eventTimeToMs(endTime);

        const activeNotesForFrame = this.#noteEventManager.activeNotes;

        // Call the custom render function if it is specified. This function
        // runs on every frame and allows the user to manipulate the context
        // in real time and/or use the provided draw() callbacks to access
        // convenience methods for manipulating the canvas context

        this.#frameRenderCallbacks.forEach((frameRenderCallback) => {
          // Callbacks for calls to draw() and renderIsometric() methods

          const drawCallbacks: DrawCallback[] = [];
          const renderIsometricCallbacks: RenderIsometricCallback[] = [];

          const draw = (callback: DrawCallback) => {
            drawCallbacks.push(callback);
          };

          const renderIsometric = (callback: RenderIsometricCallback) => {
            renderIsometricCallbacks.push(callback);
          };

          frameRenderCallback({
            context,
            sceneWidth: width,
            sceneHeight: height,
            sceneCenter: center,
            time: timeInMs,
            beforeTime,
            afterTime,
            duringTimeInterval,
            activeNotes: activeNotesForFrame,
            draw,
            renderIsometric,
          });

          drawCallbacks.forEach((drawCallback) => {
            drawContext.executeDrawCallback(
              drawCallback,
              context,
              width,
              height,
              timeInMs,
            );
          });

          renderIsometricCallbacks.forEach((renderIsometricCallback) => {
            const isometricView = new IsometricView(context, width, height);
            renderIsometricCallback(
              getRenderIsometricMethods(isometricView, timeInMs),
            );
            isometricView.render();
          });
        });

        // Handle remaining event callbacks as registered
        // within the setup() function

        this.#timeCallbacks
          .filter((timeCallback) => !timeCallback.expired)
          .forEach((timeCallback) => {
            if (timeInMs >= timeCallback.time) {
              timeCallback.callback({ scene: this.#scene });
              timeCallback.expired = true;
            }
          });

        // Remove objects that are either released or not visible
        this.#scene.cleanUp();

        // Render all animatable objects
        this.#scene.renderObjects(context, width, height, timeInMs);

        if (this.#videoRecorder.isRecording) {
          this.#videoRecorder.captureFrame(timeInMs);
          logMessage("Recording ...");
        } else if (this.#videoRecorder.isEncoding) {
          logMessage("Saving video capture ...");
        }
      };
    };

    this.#setUpEventListeners({
      appProperties: this.#appProperties,
      noteEventManager: this.#noteEventManager,
    });

    const startRenderer = () => {
      this.#canvasRenderer.start(renderer, { ...this.#settings, canvas });
    };

    if (this.#deferredAssetLoadPromises.length === 0) {
      startRenderer();
      return;
    }

    void Promise.allSettled(this.#deferredAssetLoadPromises).then(() => {
      startRenderer();
    });
  }

  #setUpEventListeners({
    appProperties,
    noteEventManager,
  }: SetUpEventListenersParams) {
    const { computerKeyboardDebugEnabled } = appProperties;

    if (computerKeyboardDebugEnabled) {
      window.addEventListener("keydown", (event) => {
        if (event.repeat) return;

        const hasModifierKey = event.metaKey || event.ctrlKey || event.shiftKey;
        const isVideoExportKeyCombo =
          (event.metaKey || event.ctrlKey) &&
          event.shiftKey &&
          event.key.toLowerCase() === VIDEO_EXPORT_KEY;
        const isScreenshotExportKeyCombo =
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          event.key.toLowerCase() === SCREENSHOT_EXPORT_KEY;

        if (isVideoExportKeyCombo) {
          void this.#toggleVideoRecording();
          return;
        }

        if (isScreenshotExportKeyCombo) {
          this.#exportSnapshot();
          return;
        }

        if (hasModifierKey) {
          return;
        }

        if (KEYBOARD_DEBUG_ATTACK_KEY_REGEX.test(event.key)) {
          this.#currentKeyboardDebugNumericPressedKey = event.key;
          return;
        }

        const note = keyMappings.find(
          (keyMapping) => event.code === keyMapping.keyCode,
        )?.note;

        const simulatedAttackValue = this.#currentKeyboardDebugNumericPressedKey
          ? +this.#currentKeyboardDebugNumericPressedKey / 10
          : 1;

        if (note) {
          event.preventDefault();
          handleNoteOn(
            note,
            Utilities.buildNote(note).number,
            toNormalizedFloat(simulatedAttackValue),
          );
        }
      });

      window.addEventListener("keyup", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
          return;
        }

        const note = keyMappings.find(
          (keyMapping) => event.code === keyMapping.keyCode,
        )?.note;

        if (event.key === this.#currentKeyboardDebugNumericPressedKey) {
          this.#currentKeyboardDebugNumericPressedKey = null;
          return;
        }

        if (note) {
          handleNoteOff(note, Utilities.buildNote(note).number);
        }
      });
    }

    WebMidi.enable()
      .then(() => {
        const firstAvailableMidiInput = WebMidi.inputs[0];

        if (firstAvailableMidiInput) {
          const midiInput = WebMidi.getInputById(firstAvailableMidiInput.id);

          console.log(
            `Connected to MIDI device ${firstAvailableMidiInput.name}`,
          );

          this.#addMidiListener(midiInput, "noteon", (event) => {
            const { identifier, attack, number } = event.note;
            handleNoteOn(identifier, number, toNormalizedFloat(attack));
          });

          this.#addMidiListener(midiInput, "noteoff", (event) => {
            const { identifier, number } = event.note;
            handleNoteOff(identifier, number);
          });
        } else {
          console.log("No MIDI devices available");
        }
      })
      .catch(() => {
        console.error(
          "Unable to connect to any MIDI devices. " +
            "Ensure that your browser is supported, and is " +
            "running from localhost or a secure domain.",
        );
      });

    const handleNoteOn = (
      note: string,
      number: number,
      attack: NormalizedFloat = toNormalizedFloat(1),
    ) => {
      const noteDownEvent = noteEventManager.registerNoteOnEvent(
        note,
        number,
        attack,
      );

      this.#dispatchNoteDownCallbacks(noteDownEvent);
    };

    const handleNoteOff = (note: string, number: number) => {
      const noteUpEvent = noteEventManager.registerNoteOffEvent(note, number);

      this.#dispatchNoteUpCallbacks(noteUpEvent);
    };
  }

  #addMidiListener = (
    input: any,
    eventType: "noteon" | "noteoff",
    callback: MidiEventCallback,
  ): void => {
    input.addListener(eventType, callback);
  };

  #dispatchNoteDownCallbacks = (noteDownEvent: NoteDownEvent): void => {
    this.#noteDownCallbacks.forEach((callback) => {
      callback({
        ...noteDownEvent,
        scene: this.#scene,
      });
    });
  };

  #dispatchNoteUpCallbacks = (noteUpEvent: NoteUpEvent): void => {
    this.#noteUpCallbacks.forEach((callback) => {
      callback({
        ...noteUpEvent,
        scene: this.#scene,
      });
    });
  };

  #resetInternalClock = (): void => {
    this.#internalElapsedTimeInMs = 0;
    this.#internalLastFrameTimestampInMs = null;
  };

  #getInternalElapsedTimeInMs = (): number => {
    const nowInMs = this.#getNowInMs();

    if (this.#internalLastFrameTimestampInMs === null) {
      this.#internalLastFrameTimestampInMs = nowInMs;
      return Math.floor(this.#internalElapsedTimeInMs);
    }

    const deltaTimeInMs = nowInMs - this.#internalLastFrameTimestampInMs;

    this.#internalLastFrameTimestampInMs = nowInMs;

    const clampedDeltaTimeInMs = Math.min(
      Math.max(deltaTimeInMs, 0),
      DEFAULTS.INTERNAL_CLOCK_MAX_FRAME_DELTA_IN_MS,
    );

    this.#internalElapsedTimeInMs += clampedDeltaTimeInMs;

    return Math.floor(this.#internalElapsedTimeInMs);
  };

  #getNowInMs = (): number => {
    if (
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
    ) {
      return performance.now();
    }

    return Date.now();
  };

  #exportSnapshot = (): void => {
    if (!this.#canvas) {
      return;
    }

    try {
      this.#snapshotExporter.captureAndDownload(this.#canvas);
      logMessage("Snaspshot exported as image");
    } catch {
      logMessage("Snapshot export unavailable");
    }
  };

  #toggleVideoRecording = async (): Promise<void> => {
    if (!this.#canvas || this.#videoRecorder.isEncoding) {
      return;
    }

    if (this.#videoRecorder.isRecording) {
      logMessage("Saving video capture ...");

      try {
        const { blob, fileName } = await this.#videoRecorder.stopAndEncode();
        this.#videoRecorder.download(blob, fileName);

        logMessage("Recording ready for download");
      } catch {
        logMessage("Video capture failed");
      } finally {
        this.#audioCapture.cleanupActiveSession();
      }

      return;
    }

    let audioCaptureSession: AudioCaptureSession | null = null;
    const hasConfiguredAudioSource = this.#audioCapture.hasConfiguredSource();

    if (hasConfiguredAudioSource) {
      audioCaptureSession = await this.#audioCapture.acquireSession();
    }

    try {
      const recorderStartOptions: {
        scale: number;
        format: VideoFormatPreference;
        audioStream?: MediaStream;
      } = {
        scale: this.#videoRecordingScale,
        format: this.#videoRecordingFormat,
      };

      if (audioCaptureSession) {
        recorderStartOptions.audioStream = audioCaptureSession.outputStream;
      }

      await this.#videoRecorder.start(this.#canvas, {
        ...recorderStartOptions,
      });
      this.#audioCapture.activateSession(audioCaptureSession);
      logMessage("Recording ...");
    } catch {
      this.#audioCapture.disposeSession(audioCaptureSession);
      logMessage("Video capture unavailable");
    }
  };
}

export default VisualisationAnimationLoopHandler;
