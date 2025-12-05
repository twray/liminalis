import canvasSketch from "canvas-sketch";
import { Utilities, WebMidi } from "webmidi";
import {
  getContextPrimitives,
  type ContextPrimitives,
} from "./contextPrimitives";

import type {
  ActiveNotesEvent,
  AppSettings,
  CanvasProps,
  EventTime,
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

type MidiNoteEvent = {
  note: {
    identifier: string;
    number: number;
    attack: number;
  };
};

type MidiEventCallback = (event: MidiNoteEvent) => void;

type NoteDownEventCallback = (params: NoteDownEvent) => void;

type NoteUpEventCallback = (params: NoteUpEvent) => void;

type NotesDownEventCallback = (params: ActiveNotesEvent) => void;

type TimeEventCallback = () => void;

interface TimeCallbackEntry {
  time: number;
  callback: TimeEventCallback;
}

interface ExpirableTimeCallbackEntry extends TimeCallbackEntry {
  expired: boolean;
}

interface NotesDownCallbackEntry {
  type: "notesdown";
  callback: NotesDownEventCallback;
}

interface BeforeTimeCallbackEntry extends TimeCallbackEntry {
  type: "beforetime";
}

interface AfterTimeCallbackEntry extends TimeCallbackEntry {
  type: "aftertime";
}

interface TimeIntervalCallbackEntry {
  type: "timeinterval";
  startTime: number;
  endTime: number;
  callback: TimeEventCallback;
}

type RenderContextCallbackEntry =
  | NotesDownCallbackEntry
  | BeforeTimeCallbackEntry
  | AfterTimeCallbackEntry
  | TimeIntervalCallbackEntry;

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

interface SetupFunctionProps<TData = Record<string, any>> {
  data: TData;
  visualisation: Visualisation;
  width: number;
  height: number;
  onNoteDown: (callback: NoteDownEventCallback) => void;
  onNoteUp: (callback: NoteUpEventCallback) => void;
  atTime: (time: EventTime, callback: TimeEventCallback) => void;
  atStart: (callback: TimeEventCallback) => void;
}

interface RenderFunctionProps<TData = Record<string, any>>
  extends ContextPrimitives {
  data: TData;
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  center: Point2D;
  time: number;
  whileNotesDown: (callback: NotesDownEventCallback) => void;
  beforeTime: (time: EventTime, callback: TimeEventCallback) => void;
  afterTime: (time: EventTime, callback: TimeEventCallback) => void;
  duringTimeInterval: (
    startTime: EventTime,
    endTime: EventTime,
    callback: TimeEventCallback
  ) => void;
}

const KEYBOARD_DEBUG_ATTACK_KEY_REGEX = /^[1-9]$/;

const DEFAULTS = {
  SETTINGS_WIDTH: 1080,
  SETTINGS_HEIGHT: 1920,
  SETTINGS_FPS: 60,
  SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED: true,
};

class VisualisationAnimationLoopHandler<TData = Record<string, any>> {
  #settings: SketchSettings = {
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
  #visualisationData: TData = {} as TData;

  // Callbacks from event-based handlers that are registered in the 'setup'
  // function

  #timeCallbacks: ExpirableTimeCallbackEntry[] = [];
  #noteDownCallbacks: NoteDownEventCallback[] = [];
  #noteUpCallbacks: NoteUpEventCallback[] = [];

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

  withData<T extends Record<string, any>>(
    data: T
  ): VisualisationAnimationLoopHandler<T> {
    const instance = this as any as VisualisationAnimationLoopHandler<T>;
    instance.#visualisationData = data;
    return instance;
  }

  setup(setupFunction: (props: SetupFunctionProps<TData>) => void) {
    const onNoteDown = (callback: NoteDownEventCallback) => {
      this.#noteDownCallbacks.push(callback);
    };

    const onNoteUp = (callback: NoteUpEventCallback) => {
      this.#noteUpCallbacks.push(callback);
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

    setupFunction({
      data: this.#visualisationData,
      visualisation: this.#visualisation,
      width: this.#settings.dimensions?.[0] ?? window.innerWidth,
      height: this.#settings.dimensions?.[1] ?? window.innerHeight,
      onNoteDown,
      onNoteUp,
      atTime,
      atStart,
    });

    return this;
  }

  render(renderFunction?: (props: RenderFunctionProps<TData>) => void) {
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

        // Set up event handlers that get rendered on frame-by-frame basis.
        const renderContextCallbackEntries: RenderContextCallbackEntry[] = [];

        const whileNotesDown = (callback: NotesDownEventCallback) => {
          renderContextCallbackEntries.push({ type: "notesdown", callback });
        };

        const beforeTime = (time: EventTime, callback: TimeEventCallback) => {
          renderContextCallbackEntries.push({
            type: "beforetime",
            time: eventTimeToMs(time),
            callback,
          });
        };

        const afterTime = (time: EventTime, callback: TimeEventCallback) => {
          renderContextCallbackEntries.push({
            type: "aftertime",
            time: eventTimeToMs(time),
            callback,
          });
        };

        const duringTimeInterval = (
          startTime: EventTime,
          endTime: EventTime,
          callback: TimeEventCallback
        ) => {
          renderContextCallbackEntries.push({
            type: "timeinterval",
            startTime: eventTimeToMs(startTime),
            endTime: eventTimeToMs(endTime),
            callback,
          });
        };

        // Call the custom render function if it is specified. This function
        // runs on every frame and allows the user to manipulate the context
        // in real time and/or use the convenience context primitive functions

        renderFunction?.({
          data: this.#visualisationData,
          context,
          width,
          height,
          center,
          time: timeInMs,
          whileNotesDown,
          beforeTime,
          afterTime,
          duringTimeInterval,
          ...getContextPrimitives(context),
        });

        // Process all frame-based events in the order as they are written
        // within the render function, allowing the user to determine (in order
        // of appearance within the render function) which items within the
        // frame should be rendered first if two frame-based events happen
        // at the same time

        const activeNotesForFrame = this.#noteEventManager.activeNotes;

        renderContextCallbackEntries.forEach((callbackEntry) => {
          const { type, callback } = callbackEntry;

          switch (type) {
            case "notesdown": {
              if (activeNotesForFrame.length > 0) {
                callback({ notes: activeNotesForFrame });
              }
              break;
            }
            case "beforetime": {
              if (timeInMs < callbackEntry.time) callback();
              break;
            }
            case "aftertime": {
              if (timeInMs >= callbackEntry.time) callback();
              break;
            }
            case "timeinterval": {
              if (
                timeInMs >= callbackEntry.startTime &&
                timeInMs < callbackEntry.endTime
              ) {
                callback();
              }
              break;
            }
            default:
              throw new Error("Invalid callback entry");
          }
        });

        // Handle remaining event callbacks as registered within the setup()
        // function

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
            });
          });
        });

        notesPressedUpForFrame.forEach((recentNotePressedUp) => {
          this.#noteUpCallbacks.forEach((callback) => {
            callback({
              ...recentNotePressedUp,
            });
          });
        });

        this.#timeCallbacks
          .filter((timeCallback) => !timeCallback.expired)
          .forEach((timeCallback) => {
            if (timeInMs > timeCallback.time) {
              timeCallback.callback();
              timeCallback.expired = true;
            }
          });

        // Remove objects that are either decayed or not visible

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
