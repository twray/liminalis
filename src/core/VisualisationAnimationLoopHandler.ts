import {
  ControlChangeMessageEvent,
  Input,
  NoteMessageEvent,
  Utilities,
  WebMidi,
} from "webmidi";

import {
  createDrawContext,
  DrawAPI,
  DrawContextOf,
  LayerOptions,
  Measurements,
  PlaceOptions,
  PlaceOptionsNonPermanent,
  ReactiveLayerComponent,
} from "../render";
import type { AssetCacheEntry } from "./AsyncAssetCache";
import AudioCapture, { type AudioCaptureSession } from "./AudioCapture";
import CanvasRenderer from "./CanvasRenderer";
import { fontAssetCache, type FontAssetDefinition } from "./FontAssetCache";
import { imageAssetCache } from "./ImageAssetCache";
import SnapshotExporter from "./SnapshotExporter";
import { videoMetadataLoader } from "./VideoMetadataLoader";
import VideoRecorder from "./VideoRecorder";

import type {
  AppSettings,
  CanvasProps,
  ControlChangeEvent,
  EventTime,
  IAnimatableLike,
  MidiEventType,
  NormalizedFloat,
  NoteOffEvent,
  NoteOnEvent,
  PedalChangeEvent,
  PedalOnOffEvent,
  PianoPedal,
  SketchSettings,
} from "../types";

import type { RenderProps } from "../render/types";

import { eventTimeToMs, toNormalizedFloat } from "../util";
import { logMessage } from "../util/log";

import NoteEventManager from "./NoteEventManager";

import keyMappings from "../data/keyMappings.json";
import { createNoopAnimatable } from "../render/common";
import { adaptToLayerComponent } from "./adapters/adaptToLayerComponent";
import ReactiveLayerEnvelope from "./ReactiveLayerEnvelope";
import ReactiveLayerRegistry from "./ReactiveLayerRegistry";
import SceneClock, { readWallClockInMs } from "./SceneClock";

type VideoFormatPreference = "auto" | "webm" | "mp4";

interface WithSceneContext {
  getFromScene: (id: string) => ReactiveLayerEnvelope;
  placeInScene: (
    component: ReactiveLayerComponent<any>,
    options: PlaceOptionsNonPermanent,
    id: string,
  ) => void;
}

type MidiEventCallback = (
  event: NoteMessageEvent | ControlChangeMessageEvent,
) => void;

type NoteOnEventCallback = (params: NoteOnEvent & WithSceneContext) => void;

type NoteOffEventCallback = (params: NoteOffEvent & WithSceneContext) => void;

type PedalOnOffEventCallback = (
  params: PedalOnOffEvent & WithSceneContext,
) => void;

type PedalChangeEventCallback = (
  params: PedalChangeEvent & WithSceneContext,
) => void;

type ControlChangeEventCallback = (
  params: ControlChangeEvent & WithSceneContext,
) => void;

type FrameEventCallback = (params: SceneRenderProps) => void;

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
  showFps?: boolean;
  computerKeyboardDebugEnabled?: boolean;
  videoRecordingScale?: number;
  videoFormat?: VideoFormatPreference;
  enableAudioCapture?: boolean;
  audioInputDeviceId?: string;
  enableBitmapBasedCaching?: boolean;
}

interface SetupFunctionProps<TState> {
  state: TState;
  sceneMeasurements: Measurements;
  load: (
    callback: (loaders: SetupAssetLoaders) => void,
    options?: SetupAssetLoadOptions,
  ) => void;
  onNoteDown: (callback: NoteOnEventCallback) => void;
  onNoteUp: (callback: NoteOffEventCallback) => void;
  onNoteAttacked: (callback: NoteOnEventCallback) => void;
  onNoteReleased: (callback: NoteOffEventCallback) => void;
  onPedalDown: (callback: PedalOnOffEventCallback) => void;
  onPedalUp: (callback: PedalOnOffEventCallback) => void;
  onPedalChange: (callback: PedalChangeEventCallback) => void;
  onControlChange: (callback: ControlChangeEventCallback) => void;
  onRender: (callback: FrameEventCallback) => void;
  atTime: (time: EventTime, callback: TimeEventCallback) => void;
  atStart: (callback: TimeEventCallback) => void;
}

interface SetupAssetLoaders {
  image: (imageUrl: string | string[]) => void;
  font: (font: FontAssetDefinition | FontAssetDefinition[]) => void;
  // Awaits metadata only -- dimensions and duration -- not full buffering.
  // See videoMetadataLoader for why.
  video: (videoUrl: string | string[]) => void;
}

interface SetupAssetLoadOptions {
  deferRender?: boolean;
}

// Slice this handler contributes to onRender, on top of the frame's DrawAPI:
// the members that need the scene's clock, note state or layer registry.
interface SceneProps {
  render: {
    beforeTime: (time: EventTime, callback: () => void) => void;
    afterTime: (time: EventTime, callback: () => void) => void;
    duringTimeInterval: (
      startTime: EventTime,
      endTime: EventTime,
      callback: () => void,
    ) => void;
    componentInScene: (
      id: string,
      component: ReactiveLayerComponent<any>,
      options?: PlaceOptions,
    ) => IAnimatableLike<LayerOptions>;
  };
  current: {
    activeNotes: NoteOnEvent[];
  };
}

type SceneRenderProps = DrawContextOf<[DrawAPI, RenderProps, SceneProps]>;

const PIANO_PEDALS: readonly PianoPedal[] = [
  "damperpedal",
  "sostenuto",
  "softpedal",
];

// MIDI convention for switch-type controllers: 0-63 is off, 64-127 is on.
const PEDAL_DOWN_RAW_VALUE_THRESHOLD = 64;

const isPianoPedal = (subtype: string | undefined): subtype is PianoPedal =>
  PIANO_PEDALS.includes(subtype as PianoPedal);

const KEYBOARD_DEBUG_ATTACK_KEY_REGEX = /^[1-9]$/;
const SCREENSHOT_EXPORT_KEY = "e";
const VIDEO_EXPORT_KEY = "e";

const DEFAULTS = {
  SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED: true,
  SETTINGS_FPS: 60,
  SETTINGS_AUTO_SCALE_DOWN: true,
  SETTINGS_SHOW_FPS: false,
  SETTINGS_VIDEO_RECORDING_SCALE: 1,
  SETTINGS_VIDEO_FORMAT: "auto" as VideoFormatPreference,
  SETTINGS_ENABLE_AUDIO_CAPTURE: false,
  SETTINGS_ENABLE_BITMAP_BASED_CACHING: true,
  FPS_LOG_INTERVAL_IN_MS: 250,
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
    showFps: DEFAULTS.SETTINGS_SHOW_FPS,
    enableBitmapBasedCaching: DEFAULTS.SETTINGS_ENABLE_BITMAP_BASED_CACHING,
  };

  #noteEventManager = new NoteEventManager("major");

  #sceneClock = new SceneClock();
  #reactiveLayerRegistry = new ReactiveLayerRegistry(() =>
    this.#sceneClock.now(),
  );
  #sceneState: TState = {} as TState;
  #sceneEntries = new Map<
    string,
    { component: ReactiveLayerComponent<any>; options: PlaceOptions }
  >();

  // Handed to every event and time callback registered in setup().
  #sceneContext: WithSceneContext = {
    getFromScene: (id) => this.#reactiveLayerRegistry.getOrCreate(id, true),
    placeInScene: (component, options, id) => {
      this.#sceneEntries.set(id, { component, options });
    },
  };

  // Callbacks from event-based handlers that
  // are registered in the 'setup' function

  #timeCallbacks: ExpirableTimeCallbackEntry[] = [];
  #noteDownCallbacks: NoteOnEventCallback[] = [];
  #noteUpCallbacks: NoteOffEventCallback[] = [];
  #noteAttackedCallbacks: NoteOnEventCallback[] = [];
  #noteReleasedCallbacks: NoteOffEventCallback[] = [];
  #pedalDownCallbacks: PedalOnOffEventCallback[] = [];
  #pedalUpCallbacks: PedalOnOffEventCallback[] = [];
  #pedalChangeCallbacks: PedalChangeEventCallback[] = [];
  #controlChangeCallbacks: ControlChangeEventCallback[] = [];

  #frameRenderCallbacks: FrameEventCallback[] = [];

  #currentKeyboardDebugNumericPressedKey: string | null = null;

  #pendingDamperReleases: Map<string, NoteOffEvent> = new Map();
  #pedalsDown: Set<PianoPedal> = new Set();

  #canvas: HTMLCanvasElement | null = null;
  #canvasRenderer = new CanvasRenderer();
  #videoRecorder = new VideoRecorder();
  #audioCapture = new AudioCapture();
  #snapshotExporter = new SnapshotExporter();
  #videoRecordingScale = DEFAULTS.SETTINGS_VIDEO_RECORDING_SCALE;
  #videoRecordingFormat: VideoFormatPreference = DEFAULTS.SETTINGS_VIDEO_FORMAT;
  #deferredAssetLoadPromises: Promise<void>[] = [];
  #fpsSampleStartInMs: number | null = null;
  #fpsFramesInSample = 0;

  constructor() {}

  withSettings({
    width,
    height,
    fps = 60,
    autoScaleDown = DEFAULTS.SETTINGS_AUTO_SCALE_DOWN,
    showFps = DEFAULTS.SETTINGS_SHOW_FPS,
    computerKeyboardDebugEnabled = DEFAULTS.SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED,
    videoRecordingScale = DEFAULTS.SETTINGS_VIDEO_RECORDING_SCALE,
    videoFormat = DEFAULTS.SETTINGS_VIDEO_FORMAT,
    enableAudioCapture = DEFAULTS.SETTINGS_ENABLE_AUDIO_CAPTURE,
    audioInputDeviceId,
    enableBitmapBasedCaching = DEFAULTS.SETTINGS_ENABLE_BITMAP_BASED_CACHING,
  }: SceneSettings) {
    this.#settings = { ...this.#settings, fps, autoScaleDown };

    if (width !== undefined && height !== undefined) {
      this.#settings.dimensions = [width, height];
    }

    this.#appProperties = {
      ...this.#appProperties,
      computerKeyboardDebugEnabled,
      showFps,
      enableBitmapBasedCaching,
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

    const onNoteDown = (callback: NoteOnEventCallback) => {
      this.#noteDownCallbacks.push(callback);
    };

    const onNoteUp = (callback: NoteOffEventCallback) => {
      this.#noteUpCallbacks.push(callback);
    };

    const onNoteAttacked = (callback: NoteOnEventCallback) => {
      this.#noteAttackedCallbacks.push(callback);
    };

    const onNoteReleased = (callback: NoteOffEventCallback) => {
      this.#noteReleasedCallbacks.push(callback);
    };

    const onPedalDown = (callback: PedalOnOffEventCallback) => {
      this.#pedalDownCallbacks.push(callback);
    };

    const onPedalUp = (callback: PedalOnOffEventCallback) => {
      this.#pedalUpCallbacks.push(callback);
    };

    const onPedalChange = (callback: PedalChangeEventCallback) => {
      this.#pedalChangeCallbacks.push(callback);
    };

    const onControlChange = (callback: ControlChangeEventCallback) => {
      this.#controlChangeCallbacks.push(callback);
    };

    const render = (callback: FrameEventCallback) => {
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

    const toLoadPromise = (
      ensure: () => AssetCacheEntry<unknown>,
      assetLabel: string,
    ): Promise<void> => {
      const entry = ensure();

      if (entry.status === "error") {
        return Promise.reject(
          entry.error instanceof Error
            ? entry.error
            : new Error(`Failed to load asset: ${assetLabel}`),
        );
      }

      if (entry.status === "ready") {
        return Promise.resolve();
      }

      return entry.promise.then(() => {
        const settledEntry = ensure();

        if (settledEntry.status === "error") {
          throw settledEntry.error instanceof Error
            ? settledEntry.error
            : new Error(`Failed to load asset: ${assetLabel}`);
        }
      });
    };

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
              toLoadPromise(
                () => imageAssetCache.ensureLoaded(imageSrc),
                `image:${imageSrc}`,
              ),
            );
          }
        },
        video: (videoUrl: string | string[]) => {
          const videoUrls = Array.isArray(videoUrl) ? videoUrl : [videoUrl];

          for (const videoSrc of videoUrls) {
            batchPromises.push(videoMetadataLoader.awaitMetadata(videoSrc));
          }
        },
        font: (font: FontAssetDefinition | FontAssetDefinition[]) => {
          const fonts = Array.isArray(font) ? font : [font];

          for (const fontDefinition of fonts) {
            const fontLabel = `${fontDefinition.family}:${fontDefinition.source}`;

            batchPromises.push(
              toLoadPromise(
                () => fontAssetCache.ensureLoaded(fontDefinition),
                `font:${fontLabel}`,
              ),
            );
          }
        },
      });

      if (options.deferRender !== false && batchPromises.length > 0) {
        this.#deferredAssetLoadPromises.push(
          Promise.all(batchPromises)
            .then(() => {})
            .catch((error: unknown) => {
              console.error("Asset loading failed", error);
              throw error;
            }),
        );
      }
    };

    const canvasWidth = this.#settings.dimensions?.[0] ?? window.innerWidth;
    const canvasHeight = this.#settings.dimensions?.[1] ?? window.innerHeight;
    const setupMeasurements = {
      width: canvasWidth,
      height: canvasHeight,
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
    };

    setupFunction({
      state: this.#sceneState,
      sceneMeasurements: setupMeasurements,
      load,
      onNoteDown,
      onNoteUp,
      onNoteAttacked,
      onNoteReleased,
      onPedalDown,
      onPedalUp,
      onPedalChange,
      onControlChange,
      onRender: render,
      atTime,
      atStart,
    });

    return this;
  }

  #placeReactiveLayer(
    drawAPI: DrawAPI,
    component: ReactiveLayerComponent<any>,
    options: PlaceOptionsNonPermanent,
    id: string,
  ) {
    const state = this.#reactiveLayerRegistry.getOrCreateForPlacement(
      id,
      !options.isTemporary,
    );

    state.isPermanent = !options.isTemporary;

    if (
      !state.isPermanent &&
      state.current.status === "idle" &&
      state.hasBeenReleased
    ) {
      return createNoopAnimatable<PlaceOptions>(options);
    }

    return drawAPI.render.component(adaptToLayerComponent(component, state), {
      ...options,
      key: id,
    });
  }

  render() {
    this.#sceneClock.reset();
    this.#resetFpsSample();

    // Creates the canvas instance on render
    const canvas = document.createElement("canvas");
    canvas.setAttribute("id", "canvas-visualisation");
    this.#canvas = canvas;

    // Create draw context scoped to this render lifecycle
    // This persists across frames but is isolated to this scene
    const drawContext = createDrawContext({
      enableBitmapBasedCaching: this.#appProperties.enableBitmapBasedCaching,
    });

    const renderer = () => {
      return (canvasProps: CanvasProps) => {
        const { context, width, height } = canvasProps;
        const nowInMs = readWallClockInMs();

        // Compute runtime from the scene's monotonic clock so timing is
        // independent from renderer playback settings, and shared with the
        // times reactive layer envelopes record.
        const timeInMs = this.#sceneClock.tick(nowInMs);

        // Set background color and clear the canvas for rendering
        context.fillStyle = "white";
        context.fillRect(0, 0, width, height);

        // Predicates behind the time-conditional render blocks below. The
        // blocks themselves delegate to render.when(), which owns the
        // identity scoping, so this layer only decides *whether* to render.

        const isBeforeTime = (time: EventTime) =>
          timeInMs < eventTimeToMs(time);
        const isAfterTime = (time: EventTime) => timeInMs > eventTimeToMs(time);
        const isDuringTimeInterval = (startTime: EventTime, endTime: EventTime) =>
          timeInMs >= eventTimeToMs(startTime) &&
          timeInMs <= eventTimeToMs(endTime);

        const activeNotesForFrame = this.#noteEventManager.activeNotes;

        // The whole frame is a single draw pass: every onRender callback, in
        // registration order, then the entries placed via placeInScene. One
        // pass means one beginFrame/flush/endFrame on the draw context, so
        // all of them share one positional-identity space and one GC sweep
        // -- separate passes would each sweep away the animation state the
        // previous one had just declared. Scene entries are drawn last, on
        // top, and are drawn even when no onRender callback is registered.

        drawContext.executeDrawCallback(
          (drawApi) => {
            const { when } = drawApi.render;

            const timeConditionals: Pick<
              SceneProps["render"],
              "beforeTime" | "afterTime" | "duringTimeInterval"
            > = {
              beforeTime: (time, callback) => when(isBeforeTime(time), callback),
              afterTime: (time, callback) => when(isAfterTime(time), callback),
              duringTimeInterval: (startTime, endTime, callback) =>
                when(isDuringTimeInterval(startTime, endTime), callback),
            };

            this.#frameRenderCallbacks.forEach((frameRenderCallback) => {
              frameRenderCallback({
                ...drawApi,
                current: {
                  context,
                  time: timeInMs,
                  activeNotes: activeNotesForFrame,
                },
                render: {
                  ...drawApi.render,
                  ...timeConditionals,
                  componentInScene: (id, component, options) =>
                    this.#placeReactiveLayer(
                      drawApi,
                      component,
                      { ...options, isTemporary: false },
                      id,
                    ),
                },
              });
            });

            this.#sceneEntries.forEach(({ component, options }, id) => {
              this.#placeReactiveLayer(drawApi, component, options, id);

              const state = this.#reactiveLayerRegistry.get(id);
              if (
                state &&
                !state.isPermanent &&
                state.current.status === "idle" &&
                state.hasBeenReleased
              ) {
                this.#sceneEntries.delete(id);
                this.#reactiveLayerRegistry.delete(id);
              }
            });
          },
          context,
          width,
          height,
          timeInMs,
        );

        // Handle remaining event callbacks as registered
        // within the setup() function

        this.#timeCallbacks
          .filter((timeCallback) => !timeCallback.expired)
          .forEach((timeCallback) => {
            if (timeInMs >= timeCallback.time) {
              timeCallback.callback(this.#sceneContext);
              timeCallback.expired = true;
            }
          });

        this.#reactiveLayerRegistry.endFrame();

        if (this.#videoRecorder.isRecording) {
          this.#videoRecorder.captureFrame(timeInMs);
          logMessage("Recording ...");
        } else if (this.#videoRecorder.isEncoding) {
          logMessage("Saving video capture ...");
        } else {
          this.#logFpsIfEnabled(nowInMs);
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

    void Promise.all(this.#deferredAssetLoadPromises)
      .then(() => {
        startRenderer();
      })
      .catch((error: unknown) => {
        console.error("Unable to load assets, check console for details");
        console.error(
          "Unable to load assets, check console for details",
          error,
        );
        logMessage("Unable to load assets, check console for details");
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
            const { identifier, attack, number } = (event as NoteMessageEvent)
              .note;
            handleNoteOn(identifier, number, toNormalizedFloat(attack));
          });

          this.#addMidiListener(midiInput, "noteoff", (event) => {
            const { identifier, number } = (event as NoteMessageEvent).note;
            handleNoteOff(identifier, number);
          });

          this.#addMidiListener(midiInput, "controlchange", (event) => {
            const { subtype, controller, rawValue } =
              event as ControlChangeMessageEvent;

            if (typeof rawValue !== "number") return;

            handleControlChange(controller.number, rawValue, subtype);
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
      this.#dispatchNoteAttackedCallbacks(noteDownEvent);

      this.#pendingDamperReleases.delete(note);
    };

    const handleNoteOff = (note: string, number: number) => {
      const noteUpEvent = noteEventManager.registerNoteOffEvent(note, number);

      // Unaffected by the pedal, same as it always was.
      this.#dispatchNoteUpCallbacks(noteUpEvent);

      if (this.#pedalsDown.has("damperpedal")) {
        this.#pendingDamperReleases.set(note, noteUpEvent);
      } else {
        this.#dispatchNoteReleasedCallbacks(noteUpEvent);
      }
    };

    const handleControlChange = (
      controlChangeNumber: number,
      value: number,
      subtype: string | undefined,
    ) => {
      this.#dispatchToCallbacks(this.#controlChangeCallbacks, {
        controlChangeNumber,
        value,
      });

      if (isPianoPedal(subtype)) {
        handlePedalChange(subtype, value);
      }
    };

    const handlePedalChange = (pedal: PianoPedal, value: number) => {
      this.#dispatchToCallbacks(this.#pedalChangeCallbacks, {
        type: pedal,
        value,
      });

      const wasDown = this.#pedalsDown.has(pedal);
      const isDown = value >= PEDAL_DOWN_RAW_VALUE_THRESHOLD;

      // Edge-triggered: a half-pedalling piano streams many values on the
      // same side of the threshold, but only a crossing is a down/up event.
      if (wasDown === isDown) return;

      if (isDown) {
        this.#pedalsDown.add(pedal);
        this.#dispatchToCallbacks(this.#pedalDownCallbacks, { type: pedal });
      } else {
        this.#pedalsDown.delete(pedal);
        this.#dispatchToCallbacks(this.#pedalUpCallbacks, { type: pedal });

        if (pedal === "damperpedal") {
          this.#flushPendingDamperReleases();
        }
      }
    };
  }

  #addMidiListener = (
    input: Input,
    eventType: MidiEventType,
    callback: MidiEventCallback,
  ): void => {
    input.addListener(eventType, callback);
  };

  #dispatchToCallbacks = <TEvent extends object>(
    callbacks: Array<(params: TEvent & WithSceneContext) => void>,
    event: TEvent,
  ): void => {
    callbacks.forEach((callback) => {
      callback({ ...event, ...this.#sceneContext });
    });
  };

  #dispatchNoteDownCallbacks = (noteDownEvent: NoteOnEvent): void => {
    this.#dispatchToCallbacks(this.#noteDownCallbacks, noteDownEvent);
  };

  #dispatchNoteUpCallbacks = (noteUpEvent: NoteOffEvent): void => {
    this.#dispatchToCallbacks(this.#noteUpCallbacks, noteUpEvent);
  };

  #dispatchNoteAttackedCallbacks = (noteDownEvent: NoteOnEvent): void => {
    this.#dispatchToCallbacks(this.#noteAttackedCallbacks, noteDownEvent);
  };

  #dispatchNoteReleasedCallbacks = (noteUpEvent: NoteOffEvent): void => {
    this.#dispatchToCallbacks(this.#noteReleasedCallbacks, noteUpEvent);
  };

  #flushPendingDamperReleases = (): void => {
    this.#pendingDamperReleases.forEach((noteUpEvent) => {
      this.#dispatchNoteReleasedCallbacks(noteUpEvent);
    });

    this.#pendingDamperReleases.clear();
  };

  #resetFpsSample = (): void => {
    this.#fpsSampleStartInMs = null;
    this.#fpsFramesInSample = 0;
  };

  #logFpsIfEnabled = (nowInMs: number): void => {
    if (!this.#appProperties.showFps) {
      return;
    }

    if (this.#fpsSampleStartInMs === null) {
      this.#fpsSampleStartInMs = nowInMs;
      this.#fpsFramesInSample = 0;
      return;
    }

    this.#fpsFramesInSample += 1;

    const elapsedInMs = nowInMs - this.#fpsSampleStartInMs;

    if (elapsedInMs < DEFAULTS.FPS_LOG_INTERVAL_IN_MS) {
      return;
    }

    const fps = (this.#fpsFramesInSample * 1000) / elapsedInMs;

    logMessage(`FPS: ${fps.toFixed(1)}`);

    this.#fpsSampleStartInMs = nowInMs;
    this.#fpsFramesInSample = 0;
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
