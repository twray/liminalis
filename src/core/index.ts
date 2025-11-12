import canvasSketch, { SketchProps } from "canvas-sketch";
import { Utilities, WebMidi } from "webmidi";
import {
  isTimeExpression,
  timeExpressionToMs,
  toNormalizedFloat,
} from "../types";

import type {
  AppSettings,
  CanvasProps,
  NormalizedFloat,
  NoteEvent,
  SketchSettings,
  TimeEvent,
} from "../types";

import AnimatableIsometricObject from "./AnimatableIsometricObject";
import AnimatableObject from "./AnimatableObject";

import keyMappings from "../data/keyMappings.json";
import ModeManager from "../managers/ModeManager";
import NoteEventManager from "../managers/NoteEventManager";
import Visualisation from "../managers/Visualisation";

// Internal type definitions
type NoteEventCallback = (
  params: NoteEvent & {
    visualisation: Visualisation;
  }
) => void;

type TimeEventCallback = (
  params: TimeEvent & {
    visualisation: Visualisation;
  }
) => void;

type TimeCallbackEntry = {
  time: number;
  callback: TimeEventCallback;
  frame: number;
  expired: boolean;
};

interface VisualisationProps extends SketchProps {
  onNoteDown: (callback: NoteEventCallback) => void;
  onNoteUp: (callback: NoteEventCallback) => void;
  atTime: (time: number | string, callback: TimeEventCallback) => void;
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

        midiInput.addListener("noteon", (event) => {
          const { identifier, attack, number } = event.note;
          handleNoteOn(identifier, number, toNormalizedFloat(attack));
        });

        midiInput.addListener("noteoff", (event) => {
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

export const createVisualisation = (
  animationLoop: (props: VisualisationProps) => void
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
  const timeCallbacks: TimeCallbackEntry[] = [];

  const sketchFunction = (sketchProps: SketchProps) => {
    return (canvasProps: CanvasProps) => {
      const { context, width, height, frame, time } = canvasProps;

      // Clear the canvas
      context.fillStyle = "white";
      context.fillRect(0, 0, width, height);

      // Rendering only works if animated and if there are workable frames
      if (!frame) return;

      // Get recent key information as sent from MIDI controller / keyboard debugger
      const recentNotesPressedUp = noteEventManager.getNewNoteEventsForFrame(
        frame,
        "noteoff"
      );
      const recentNotesPressedDown = noteEventManager.getNewNoteEventsForFrame(
        frame,
        "noteon"
      );

      // Store event-based callbacks to be executed as part of current frame
      const noteDownCallbacks: NoteEventCallback[] = [];
      const noteUpCallbacks: NoteEventCallback[] = [];

      const onNoteDown = (callback: NoteEventCallback) => {
        noteDownCallbacks.push(callback);
      };

      const onNoteUp = (callback: NoteEventCallback) => {
        noteUpCallbacks.push(callback);
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

      // Run main animation loop
      animationLoop({ ...sketchProps, onNoteDown, onNoteUp, atTime });

      // Handle module-level note down events
      recentNotesPressedDown.forEach((recentNotePressedDown) => {
        noteDownCallbacks.forEach((callback) => {
          callback({ ...recentNotePressedDown, visualisation });
        });
      });

      // Handle module-level note up events
      recentNotesPressedUp.forEach((recentNotePressedUp) => {
        noteUpCallbacks.forEach((callback) => {
          callback({ ...recentNotePressedUp, visualisation });
        });
      });

      if (typeof time !== "undefined") {
        const timeInMs = time * 1000;

        // Handle module-level time events
        timeCallbacks
          .filter((queuedTimeEventHandler) => !queuedTimeEventHandler.expired)
          .forEach((queuedTimeEventHandler) => {
            if (timeInMs > queuedTimeEventHandler.time) {
              queuedTimeEventHandler.callback({
                time: timeInMs,
                visualisation,
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
