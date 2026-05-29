import canvasSketch from "canvas-sketch";
import { Utilities, WebMidi } from "webmidi";

import { createDrawContext } from "./drawMethods";
import { getRenderIsometricMethods } from "./renderIsometricMethods";

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

import ModeManager from "./ModeManager";
import NoteEventManager from "./NoteEventManager";
import Visualisation from "./Visualisation";

import IsometricView from "../views/IsometricView";

import keyMappings from "../data/keyMappings.json";

interface WithVisualisationContext {
  visualisation: Visualisation;
}

type MidiEventCallback = (event: MidiNoteEvent) => void;

type NoteDownEventCallback = (
  params: NoteDownEvent & WithVisualisationContext,
) => void;

type NoteUpEventCallback = (
  params: NoteUpEvent & WithVisualisationContext,
) => void;

type FrameEventCallback = (params: FrameRenderProps) => void;

type TimeEventCallback = (params: WithVisualisationContext) => void;

interface TimeCallbackEntry {
  time: number;
  callback: TimeEventCallback;
}

interface ExpirableTimeCallbackEntry extends TimeCallbackEntry {
  expired: boolean;
}

interface SetUpEventListenersParams {
  appProperties: AppSettings;
  modeManager: ModeManager;
  noteEventManager: NoteEventManager;
}

interface VisualisationSettings {
  width?: number;
  height?: number;
  fps?: number;
  computerKeyboardDebugEnabled?: boolean;
}

interface SetupFunctionProps<TState> {
  state: TState;
  width: number;
  height: number;
  center: Point2D;
  onNoteDown: (callback: NoteDownEventCallback) => void;
  onNoteUp: (callback: NoteUpEventCallback) => void;
  onRender: (callback: FrameEventCallback) => void;
  atTime: (time: EventTime, callback: TimeEventCallback) => void;
  atStart: (callback: TimeEventCallback) => void;
}

interface FrameRenderProps extends RenderProps {
  beforeTime: (time: EventTime) => boolean;
  afterTime: (time: EventTime) => boolean;
  duringTimeInterval: (startTime: EventTime, endTime: EventTime) => boolean;
  activeNotes: NoteDownEvent[];
}

const KEYBOARD_DEBUG_ATTACK_KEY_REGEX = /^[1-9]$/;

const DEFAULTS = {
  INTERNAL_CLOCK_MAX_FRAME_DELTA_IN_MS: 250,
  SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED: true,
  SETTINGS_FPS: 60,
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
  #modeManager = new ModeManager([], []);

  #visualisation = new Visualisation();
  #visualisationState: TState = {} as TState;

  // Callbacks from event-based handlers that
  // are registered in the 'setup' function

  #timeCallbacks: ExpirableTimeCallbackEntry[] = [];
  #noteDownCallbacks: NoteDownEventCallback[] = [];
  #noteUpCallbacks: NoteUpEventCallback[] = [];
  #frameRenderCallbacks: FrameEventCallback[] = [];

  #internalElapsedTimeInMs = 0;
  #internalLastFrameTimestampInMs: number | null = null;

  #currentKeyboardDebugNumericPressedKey: string | null = null;

  constructor() {}

  withSettings({
    width,
    height,
    fps = 60,
    computerKeyboardDebugEnabled = DEFAULTS.SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED,
  }: VisualisationSettings) {
    this.#settings = { ...this.#settings, fps };

    if (width !== undefined && height !== undefined) {
      this.#settings.dimensions = [width, height];
    }

    this.#appProperties = {
      ...this.#appProperties,
      computerKeyboardDebugEnabled,
    };

    return this;
  }

  withState<T extends Record<string, any>>(
    state: T,
  ): VisualisationAnimationLoopHandler<T> {
    const instance = this as any as VisualisationAnimationLoopHandler<T>;
    instance.#visualisationState = state;
    return instance;
  }

  setup(setupFunction: (props: SetupFunctionProps<TState>) => void) {
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

    const canvasWidth = this.#settings.dimensions?.[0] ?? window.innerWidth;
    const canvasHeight = this.#settings.dimensions?.[1] ?? window.innerHeight;
    const center = { x: canvasWidth / 2, y: canvasHeight / 2 };

    setupFunction({
      state: this.#visualisationState,
      width: canvasWidth,
      height: canvasHeight,
      center,
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

    const canvas = document.createElement("canvas");
    canvas.setAttribute("id", "canvas-visualisation");

    // Create draw context scoped to this render lifecycle
    // This persists across frames but is isolated to this visualisation
    const drawContext = createDrawContext();

    const sketchFunction = () => {
      return (canvasProps: CanvasProps) => {
        const { context, width, height } = canvasProps;

        // Compute runtime from a monotonic internal clock so timing is
        // independent from canvas-sketch playback settings.

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
            width,
            height,
            center,
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
              timeCallback.callback({ visualisation: this.#visualisation });
              timeCallback.expired = true;
            }
          });

        // Remove objects that are either released or not visible
        this.#visualisation.cleanUp();

        // Render all animatable objects
        this.#visualisation.renderObjects(context, width, height, timeInMs);
      };
    };

    this.#setUpEventListeners({
      appProperties: this.#appProperties,
      modeManager: this.#modeManager,
      noteEventManager: this.#noteEventManager,
    });

    canvasSketch(sketchFunction, {
      ...this.#settings,
      canvas,
    });
  }

  #setUpEventListeners({
    appProperties,
    modeManager,
    noteEventManager,
  }: SetUpEventListenersParams) {
    const { computerKeyboardDebugEnabled } = appProperties;

    if (computerKeyboardDebugEnabled) {
      window.addEventListener("keydown", (event) => {
        if (event.repeat) return;

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
      if (modeManager.modeTransitionNotes.includes(note)) {
        modeManager.transitionToNextMode();
      }

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
        visualisation: this.#visualisation,
      });
    });
  };

  #dispatchNoteUpCallbacks = (noteUpEvent: NoteUpEvent): void => {
    this.#noteUpCallbacks.forEach((callback) => {
      callback({
        ...noteUpEvent,
        visualisation: this.#visualisation,
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
}

export default VisualisationAnimationLoopHandler;
