import canvasSketch, { SketchProps } from "canvas-sketch";
import { Utilities, WebMidi } from "webmidi";

import type {
  AppSettings,
  CanvasProps,
  NormalizedFloat,
  NoteDownEvent,
  NoteUpEvent,
  SketchSettings,
  TimeEvent,
} from "../types";

import {
  isTimeExpression,
  propertyIsWritable,
  timeExpressionToMs,
  toNormalizedFloat,
  watch,
} from "../util";

import ModeManager from "./ModeManager";
import NoteEventManager from "./NoteEventManager";
import Visualisation from "./Visualisation";

import keyMappings from "../data/keyMappings.json";
import { ContextPrimitives, getContextPrimitives } from "./contextPrimitives";

type MidiNoteEvent = {
  note: {
    identifier: string;
    number: number;
    attack: number;
  };
};

type MidiEventCallback = (event: MidiNoteEvent) => void;

type CallbackBase<TData = Record<string, any>> = {
  visualisation: Visualisation;
  data: TData;
};

type NoteDownEventCallback<TData = Record<string, any>> = (
  params: NoteDownEvent & CallbackBase<TData>
) => void;

type NoteUpEventCallback<TData = Record<string, any>> = (
  params: NoteUpEvent & CallbackBase<TData>
) => void;

type TimeEventCallback<TData = Record<string, any>> = (
  params: TimeEvent & CallbackBase<TData>
) => void;

type AtStartEventCallback<TData = Record<string, any>> = (
  params: CallbackBase<TData>
) => void;

type TimeCallbackEntry<TData = Record<string, any>> = {
  time: number;
  callback: TimeEventCallback<TData>;
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

interface SetupFunctionProps<TData = Record<string, any>>
  extends ContextPrimitives {
  context: CanvasRenderingContext2D;
  data: TData;
  onNoteDown: (callback: NoteDownEventCallback<TData>) => void;
  onNoteUp: (callback: NoteUpEventCallback<TData>) => void;
  atTime: (time: number | string, callback: TimeEventCallback<TData>) => void;
  atStart: (callback: AtStartEventCallback<TData>) => void;
}

interface PropertyContextAction {
  type: "property";
  property: string;
  value: any;
}

interface MethodContextAction {
  type: "method";
  method: string;
  args: any[];
}

type ContextAction = PropertyContextAction | MethodContextAction;

const DEFAULTS = {
  SETTINGS_WIDTH: 1080,
  SETTINGS_HEIGHT: 1920,
  SETTINGS_FPS: 60,
  SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED: true,
};

class VisualisationAnimationLoopHandler<TData = Record<string, any>> {
  #settings: SketchSettings = {
    dimensions: [DEFAULTS.SETTINGS_WIDTH, DEFAULTS.SETTINGS_HEIGHT] as [
      number,
      number
    ],
    animate: true,
    fps: DEFAULTS.SETTINGS_FPS,
    playbackRate: "throttle",
  };

  #appProperties: AppSettings = {
    computerKeyboardDebugEnabled:
      DEFAULTS.SETTINGS_COMPUTER_KEYBOARD_DEBUG_ENABLED,
  };

  #noteEventManager = new NoteEventManager("major");
  #modeManager = new ModeManager([], []);

  #visualisation = new Visualisation();
  #visualisationData: TData = {} as TData;

  // Time-based callbacks -- callbacks that begin with 'at' -- need to be
  // tracked outside of the animation loop.

  #timeCallbacks: TimeCallbackEntry<TData>[] = [];

  // Changes and methods to context that are called within event handlers
  // need to be queued so that they are stateful across frames. The following
  // values track these actions, and track whether context is called within
  // an event handler or not.

  #queuedContextActions: ContextAction[] = [];

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
    const sketchFunction = (sketchProps: SketchProps) => {
      const { context } = sketchProps;

      // Store event-based callbacks to be executed as part of current frame
      const noteDownCallbacks: NoteDownEventCallback<TData>[] = [];
      const noteUpCallbacks: NoteUpEventCallback<TData>[] = [];

      const onNoteDown = (callback: NoteDownEventCallback<TData>) => {
        noteDownCallbacks.push(callback);
      };

      const onNoteUp = (callback: NoteUpEventCallback<TData>) => {
        noteUpCallbacks.push(callback);
      };

      const atTime = (
        eventTime: number | string,
        callback: TimeEventCallback<TData>
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

      const atStart = (callback: AtStartEventCallback<TData>) => {
        atTime(0, callback);
      };

      const persistentContext = watch(context, {
        onPropertyChange: (property, value) => {
          this.#queuedContextActions.push({
            type: "property",
            property,
            value,
          });
        },
        onMethodCall: (method, args) => {
          this.#queuedContextActions.push({ type: "method", method, args });
        },
      });

      setupFunction({
        context: persistentContext,
        data: this.#visualisationData,
        onNoteDown,
        onNoteUp,
        atTime,
        atStart,
        ...getContextPrimitives(persistentContext),
      });

      return (canvasProps: CanvasProps) => {
        const { context, width, height, frame, time } = canvasProps;

        // Rendering only works if animated and if there are workable frames
        if (!frame || !time) return;

        // Set background color and clear the canvas for rendering
        context.fillStyle = "white";
        context.fillRect(0, 0, width, height);

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
          noteDownCallbacks.forEach((callback) => {
            callback({
              ...recentNotePressedDown,
              visualisation: this.#visualisation,
              data: this.#visualisationData,
            });
          });
        });

        // Handle module-level note up events
        recentNotesPressedUp.forEach((recentNotePressedUp) => {
          noteUpCallbacks.forEach((callback) => {
            callback({
              ...recentNotePressedUp,
              visualisation: this.#visualisation,
              data: this.#visualisationData,
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
                  visualisation: this.#visualisation,
                  data: this.#visualisationData,
                });
                queuedTimeEventHandler.expired = true;
              }
            });
        }

        // Apply queued context prop changes
        this.#queuedContextActions.forEach((queuedAction) => {
          switch (queuedAction.type) {
            case "property": {
              const { property, value } = queuedAction;

              if (propertyIsWritable(context, property)) {
                const key = property as keyof CanvasRenderingContext2D;
                (context[key] as typeof value) = value;
              }
              break;
            }
            case "method": {
              const { method, args } = queuedAction;
              const key = method as keyof CanvasRenderingContext2D;
              const fn = context[key];

              if (typeof fn === "function") {
                (fn as Function).apply(context, args);
              }
              break;
            }
            default:
          }
        });

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
