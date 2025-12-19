import canvasSketch from "canvas-sketch";
import { Utilities, WebMidi } from "webmidi";
import {
  getContextPrimitives,
  type ContextPrimitives,
} from "./contextPrimitives";

import type {
  AnimationOptions,
  AppSettings,
  CanvasProps,
  EventTime,
  MidiNoteEvent,
  NormalizedFloat,
  NoteDownEvent,
  NoteUpEvent,
  Point2D,
  SketchSettings,
} from "../types";

import { eventTimeToMs, toNormalizedFloat } from "../util";

import ModeManager from "./ModeManager";
import NoteEventManager from "./NoteEventManager";
import Visualisation from "./Visualisation";

import keyMappings from "../data/keyMappings.json";
import { getAnimatedValueForCurrentTime } from "./animation";

interface WithVisualisationContext {
  visualisation: Visualisation;
}

type MidiEventCallback = (event: MidiNoteEvent) => void;

type NoteDownEventCallback = (
  params: NoteDownEvent & WithVisualisationContext
) => void;

type NoteUpEventCallback = (
  params: NoteUpEvent & WithVisualisationContext
) => void;

type FrameEventCallback = (params: FrameRenderEvent) => void;

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

interface FrameRenderEvent extends ContextPrimitives {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  center: Point2D;
  time: number;
  beforeTime: (time: EventTime) => boolean;
  afterTime: (time: EventTime) => boolean;
  duringTimeInterval: (startTime: EventTime, endTime: EventTime) => boolean;
  animate: (options: AnimationOptions | AnimationOptions[]) => number;
  activeNotes: NoteDownEvent[];
}

const KEYBOARD_DEBUG_ATTACK_KEY_REGEX = /^[1-9]$/;

const DEFAULTS = {
  SETTINGS_WIDTH: 1080,
  SETTINGS_HEIGHT: 1920,
  SETTINGS_FPS: 60,
  SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED: true,
};

const canvas = document.createElement("canvas");
canvas.setAttribute("id", "canvas-visualisation");

class VisualisationAnimationLoopHandler<TState> {
  #settings: SketchSettings = {
    animate: true,
    fps: DEFAULTS.SETTINGS_FPS,
    playbackRate: "throttle",
    scaleToFit: true,
    canvas,
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

  #currentKeyboardDebugNumericPressedKey: string | null = null;

  constructor() {}

  withSettings({
    width = DEFAULTS.SETTINGS_WIDTH,
    height = DEFAULTS.SETTINGS_HEIGHT,
    fps = 60,
    computerKeyboardDebugEnabled = DEFAULTS.SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED,
  }: VisualisationSettings) {
    this.#settings = { ...this.#settings, dimensions: [width, height], fps };

    this.#appProperties = {
      ...this.#appProperties,
      computerKeyboardDebugEnabled,
    };

    return this;
  }

  withState<T extends Record<string, any>>(
    state: T
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
    const sketchFunction = () => {
      return (canvasProps: CanvasProps) => {
        const { context, width, height, frame, time } = canvasProps;

        // Rendering only works if animated and if there are workable frames
        if (!frame || !time) return;

        // Computed properties of canvas centre and ms run-time
        const center = { x: width / 2, y: height / 2 };
        const timeInMs = time * 1000;

        // Set background color and clear the canvas for rendering
        context.fillStyle = "white";
        context.fillRect(0, 0, width, height);

        const before = (time: EventTime) => timeInMs < eventTimeToMs(time);
        const after = (time: EventTime) => timeInMs > eventTimeToMs(time);
        const during = (startTime: EventTime, endTime: EventTime) =>
          timeInMs >= eventTimeToMs(startTime) &&
          timeInMs <= eventTimeToMs(endTime);

        const activeNotesForFrame = this.#noteEventManager.activeNotes;

        // Call the custom render function if it is specified. This function
        // runs on every frame and allows the user to manipulate the context
        // in real time and/or use the convenience context primitive functions

        this.#frameRenderCallbacks.forEach((frameRenderCallback) => {
          frameRenderCallback({
            context,
            width,
            height,
            center,
            time: timeInMs,
            beforeTime: before,
            afterTime: after,
            duringTimeInterval: during,
            activeNotes: activeNotesForFrame,
            animate: (options: AnimationOptions | AnimationOptions[]) =>
              getAnimatedValueForCurrentTime(timeInMs, options),
            ...getContextPrimitives(context),
          });
        });

        // Handle remaining event callbacks as registered
        // within the setup() function

        const notesPressedUpForFrame =
          this.#noteEventManager.getNewNoteEventsForFrame(
            frame,
            "noteup"
          ) as NoteUpEvent[];

        const notesPressedDownForFrame =
          this.#noteEventManager.getNewNoteEventsForFrame(
            frame,
            "notedown"
          ) as NoteDownEvent[];

        notesPressedDownForFrame.forEach((recentNotePressedDown) => {
          this.#noteDownCallbacks.forEach((callback) => {
            callback({
              ...recentNotePressedDown,
              visualisation: this.#visualisation,
            });
          });
        });

        notesPressedUpForFrame.forEach((recentNotePressedUp) => {
          this.#noteUpCallbacks.forEach((callback) => {
            callback({
              ...recentNotePressedUp,
              visualisation: this.#visualisation,
            });
          });
        });

        this.#timeCallbacks
          .filter((timeCallback) => !timeCallback.expired)
          .forEach((timeCallback) => {
            if (timeInMs > timeCallback.time) {
              timeCallback.callback({ visualisation: this.#visualisation });
              timeCallback.expired = true;
            }
          });

        // Remove objects that are either released or not visible
        this.#visualisation.cleanUp();

        // Render all animatable objects
        this.#visualisation.renderObjects(context, width, height);
      };
    };

    this.#setUpEventListeners({
      appProperties: this.#appProperties,
      modeManager: this.#modeManager,
      noteEventManager: this.#noteEventManager,
    });

    canvasSketch(sketchFunction, this.#settings);
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
          (keyMapping) => event.code === keyMapping.keyCode
        )?.note;

        const simulatedAttackValue = this.#currentKeyboardDebugNumericPressedKey
          ? +this.#currentKeyboardDebugNumericPressedKey / 10
          : 1;

        if (note) {
          event.preventDefault();
          handleNoteOn(
            note,
            Utilities.buildNote(note).number,
            toNormalizedFloat(simulatedAttackValue)
          );
        }
      });

      window.addEventListener("keyup", (event) => {
        const note = keyMappings.find(
          (keyMapping) => event.code === keyMapping.keyCode
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
            `Connected to MIDI device ${firstAvailableMidiInput.name}`
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
            "running from localhost or a secure domain."
        );
      });

    const handleNoteOn = (
      note: string,
      number: number,
      attack: NormalizedFloat = toNormalizedFloat(1)
    ) => {
      if (modeManager.modeTransitionNotes.includes(note)) {
        modeManager.transitionToNextMode();
      }

      noteEventManager.registerNoteOnEvent(note, number, attack);
    };

    const handleNoteOff = (note: string, number: number) => {
      noteEventManager.registerNoteOffEvent(note, number);
    };
  }

  #addMidiListener = (
    input: any,
    eventType: "noteon" | "noteoff",
    callback: MidiEventCallback
  ): void => {
    input.addListener(eventType, callback);
  };
}

export default VisualisationAnimationLoopHandler;
