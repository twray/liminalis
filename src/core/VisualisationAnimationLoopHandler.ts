import canvasSketch from "canvas-sketch";
import { Utilities, WebMidi } from "webmidi";
import {
  getContextPrimitives,
  type ContextPrimitives,
} from "./contextPrimitives";

import type {
  AppSettings,
  CanvasProps,
  NormalizedFloat,
  NoteDownEvent,
  NoteUpEvent,
  Point2D,
  SketchSettings,
  TimeEvent,
} from "../types";

import {
  isTimeExpression,
  timeExpressionToMs,
  toNormalizedFloat,
} from "../util";

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

type TimeEventCallback = (params: TimeEvent) => void;

type AtStartEventCallback = () => void;

type TimeCallbackEntry = {
  time: number;
  callback: TimeEventCallback;
  expired: boolean;
};

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
  onNoteDown: (callback: NoteDownEventCallback) => void;
  onNoteUp: (callback: NoteUpEventCallback) => void;
  atTime: (time: number | string, callback: TimeEventCallback) => void;
  atStart: (callback: AtStartEventCallback) => void;
}

interface RenderFunctionProps<TData = Record<string, any>>
  extends ContextPrimitives {
  data: TData;
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  center: Point2D;
  time: number;
}

const DEFAULTS = {
  SETTINGS_WIDTH: 1080,
  SETTINGS_HEIGHT: 1920,
  SETTINGS_FPS: 60,
  SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED: true,
};

class VisualisationAnimationLoopHandler<TData = Record<string, any>> {
  #settings: SketchSettings = {
    // dimensions: [DEFAULTS.SETTINGS_WIDTH, DEFAULTS.SETTINGS_HEIGHT] as [
    //   number,
    //   number
    // ],
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

  #timeCallbacks: TimeCallbackEntry[] = [];
  #noteDownCallbacks: NoteDownEventCallback[] = [];
  #noteUpCallbacks: NoteUpEventCallback[] = [];

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

    const atTime = (
      eventTime: number | string,
      callback: TimeEventCallback
    ) => {
      let eventTimeInMs = 0;

      if (typeof eventTime === "string") {
        eventTimeInMs = isTimeExpression(eventTime)
          ? timeExpressionToMs(eventTime) ?? 0
          : 0;
      } else {
        eventTimeInMs = eventTime;
      }

      this.#timeCallbacks.push({
        time: eventTimeInMs,
        callback,
        expired: false,
      });
    };

    const atStart = (callback: AtStartEventCallback) => {
      atTime(0, callback);
    };

    setupFunction({
      data: this.#visualisationData,
      visualisation: this.#visualisation,
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
          ...getContextPrimitives(context),
        });

        // Get recent key information as sent from MIDI controller / keyboard debugger
        const recentNotesPressedUp =
          this.#noteEventManager.getNewNoteEventsForFrame(
            frame,
            "noteup"
          ) as NoteUpEvent[];

        const recentNotesPressedDown =
          this.#noteEventManager.getNewNoteEventsForFrame(
            frame,
            "notedown"
          ) as NoteDownEvent[];

        // Handle module-level note down events
        recentNotesPressedDown.forEach((recentNotePressedDown) => {
          this.#noteDownCallbacks.forEach((callback) => {
            callback({
              ...recentNotePressedDown,
            });
          });
        });

        // Handle module-level note up events
        recentNotesPressedUp.forEach((recentNotePressedUp) => {
          this.#noteUpCallbacks.forEach((callback) => {
            callback({
              ...recentNotePressedUp,
            });
          });
        });

        if (typeof time !== "undefined") {
          const timeInMs = time * 1000;

          // Handle timed-based events
          this.#timeCallbacks
            .filter((queuedTimeEventHandler) => !queuedTimeEventHandler.expired)
            .forEach((queuedTimeEventHandler) => {
              if (timeInMs > queuedTimeEventHandler.time) {
                queuedTimeEventHandler.callback({
                  time: timeInMs,
                });
                queuedTimeEventHandler.expired = true;
              }
            });
        }

        // Remove objects that are either decayed or not visible
        this.#visualisation.cleanUp();

        // Render all animatable objects
        this.#visualisation.renderObjects(context);
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

        const note = keyMappings.find(
          (keyMapping) => event.code === keyMapping.keyCode
        )?.note;

        if (note) {
          event.preventDefault();
          handleNoteOn(note, Utilities.buildNote(note).number);
        }
      });

      window.addEventListener("keyup", (event) => {
        const note = keyMappings.find(
          (keyMapping) => event.code === keyMapping.keyCode
        )?.note;

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
