import canvasSketch, { SketchProps } from "canvas-sketch";
import { Utilities, WebMidi } from "webmidi";
import {
  isTimeExpression,
  timeExpressionToMs,
  toNormalizedFloat,
} from "../util";

import type {
  AppSettings,
  CanvasProps,
  NormalizedFloat,
  NoteDownEvent,
  NoteUpEvent,
  SketchSettings,
  TimeEvent,
} from "../types";

import AnimatableIsometricObject from "./AnimatableIsometricObject";
import AnimatableObject from "./AnimatableObject";

import keyMappings from "../data/keyMappings.json";
import ModeManager from "./ModeManager";
import NoteEventManager from "./NoteEventManager";
import Visualisation from "./Visualisation";

// Internal type definitions
type MidiNoteEvent = {
  note: {
    identifier: string;
    number: number;
    attack: number;
  };
};

type MidiEventCallback = (event: MidiNoteEvent) => void;

const addMidiListener = (
  input: any,
  eventType: "noteon" | "noteoff",
  callback: MidiEventCallback
): void => {
  input.addListener(eventType, callback);
};

type VisualisationAndData<TData = any> = {
  visualisation: Visualisation;
  data: TData;
};

type NoteDownEventCallback<TData = any> = (
  params: NoteDownEvent & VisualisationAndData<TData>
) => void;

type NoteUpEventCallback<TData = any> = (
  params: NoteUpEvent & VisualisationAndData<TData>
) => void;

type SetupCallback<TData = any> = (params: {
  visualisation: Visualisation;
}) => TData;

type TimeEventCallback<TData = any> = (
  params: TimeEvent & VisualisationAndData<TData>
) => void;

type TimeCallbackEntry<TData = any> = {
  time: number;
  callback: TimeEventCallback<TData>;
  frame: number;
  expired: boolean;
};

interface VisualisationProps<TData = any> extends SketchProps {
  onNoteDown: (callback: NoteDownEventCallback<TData>) => void;
  onNoteUp: (callback: NoteUpEventCallback<TData>) => void;
  atTime: (time: number | string, callback: TimeEventCallback<TData>) => void;
  setup: (callback: SetupCallback<TData>) => void;
}

const setUpEventListeners = ({
  appProperties,
  modeManager,
  noteEventManager,
}: {
  appProperties: AppSettings;
  modeManager: ModeManager;
  noteEventManager: NoteEventManager;
}) => {
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

        console.log(`Connected to MIDI device ${firstAvailableMidiInput.name}`);

        addMidiListener(midiInput, "noteon", (event) => {
          const { identifier, attack, number } = event.note;
          handleNoteOn(identifier, number, toNormalizedFloat(attack));
        });

        addMidiListener(midiInput, "noteoff", (event) => {
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
};

// Export animatable and isometricAnimatableObjects

export const animatable = <TProps>() => new AnimatableObject<TProps>();

export const animatableIsometric = <TProps>() =>
  new AnimatableIsometricObject<TProps>();

// Export visualisation factory function

export const createVisualisation = <TData>(
  animationLoop: (props: VisualisationProps<TData>) => void
) => {
  const settings: SketchSettings = {
    dimensions: [1080, 1920] as [number, number],
    animate: true,
    fps: 60,
  };

  const appProperties: AppSettings = {
    computerKeyboardDebugEnabled: true,
  };

  const noteEventManager = new NoteEventManager("major");
  const modeManager = new ModeManager([], []);

  const visualisation = new Visualisation();

  const timeCallbacks: TimeCallbackEntry<TData>[] = [];

  let setupCallback: SetupCallback<TData> | undefined;
  let visualisationData: TData = {} as TData;

  const sketchFunction = (sketchProps: SketchProps) => {
    return (canvasProps: CanvasProps) => {
      const { context, width, height, frame, time } = canvasProps;

      // Rendering only works if animated and if there are workable frames
      if (!frame) return;

      // Clear the canvas
      context.fillStyle = "white";
      context.fillRect(0, 0, width, height);

      // Get recent key information as sent from MIDI controller / keyboard debugger
      const recentNotesPressedUp = noteEventManager.getNewNoteEventsForFrame(
        frame,
        "noteup"
      ) as NoteUpEvent[];

      const recentNotesPressedDown = noteEventManager.getNewNoteEventsForFrame(
        frame,
        "notedown"
      ) as NoteDownEvent[];

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

        const eventsWithSameTime = timeCallbacks.filter(
          (timeCallback) => timeCallback.time === eventTimeInMs
        );

        if (
          eventsWithSameTime.length > 0 &&
          eventsWithSameTime.some(
            (eventWithSameTime) => eventWithSameTime.frame !== frame
          )
        )
          return;

        timeCallbacks.push({
          time: eventTimeInMs,
          callback,
          frame,
          expired: false,
        });
      };

      const setup = (callback: SetupCallback) => {
        setupCallback = callback;
      };

      // Run main animation loop
      animationLoop({
        ...sketchProps,
        time: sketchProps.time * 1000,
        onNoteDown,
        onNoteUp,
        atTime,
        setup,
      });

      // Handle module-level note down events
      recentNotesPressedDown.forEach((recentNotePressedDown) => {
        noteDownCallbacks.forEach((callback) => {
          callback({
            ...recentNotePressedDown,
            visualisation,
            data: visualisationData,
          });
        });
      });

      // Handle module-level note up events
      recentNotesPressedUp.forEach((recentNotePressedUp) => {
        noteUpCallbacks.forEach((callback) => {
          callback({
            ...recentNotePressedUp,
            visualisation,
            data: visualisationData,
          });
        });
      });

      // Handle events that happen at the start of the animation
      if (setupCallback && frame === 1) {
        const dataContextFromCallback = setupCallback({ visualisation });
        if (dataContextFromCallback)
          visualisationData = dataContextFromCallback;
      }

      if (typeof time !== "undefined") {
        const timeInMs = time * 1000;

        // Handle timed-based events
        timeCallbacks
          .filter((queuedTimeEventHandler) => !queuedTimeEventHandler.expired)
          .forEach((queuedTimeEventHandler) => {
            if (timeInMs > queuedTimeEventHandler.time) {
              queuedTimeEventHandler.callback({
                time: timeInMs,
                visualisation,
                data: visualisationData,
              });
              queuedTimeEventHandler.expired = true;
            }
          });
      }

      // Remove objects that are either decayed or not visible
      visualisation.cleanUp();

      // Render all animatable objects
      visualisation.renderObjects(context);
    };
  };

  setUpEventListeners({
    appProperties,
    modeManager,
    noteEventManager: noteEventManager,
  });
  canvasSketch(sketchFunction, settings);
};
