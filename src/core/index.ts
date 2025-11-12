import { Utilities, WebMidi } from "webmidi";
import { toNormalizedFloat } from "../types";

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

import canvasSketch, { SketchProps } from "canvas-sketch";
import keyMappings from "../data/keyMappings.json";
import ModeManager from "../managers/ModeManager";
import NoteEventManager from "../managers/NoteEventManager";
import Visualisation from "../managers/Visualisation";

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

export const animatable = <TProps>() => new AnimatableObject<TProps>();

export const animatableIsometric = <TProps>() =>
  new AnimatableIsometricObject<TProps>();

// TODO: Move this somewhere
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

interface VisualisationProps extends SketchProps {
  onNoteUp: (callback: NoteEventCallback) => void;
  onNoteDown: (callback: NoteEventCallback) => void;
  atTime: (time: number, callback: TimeEventCallback) => void;
}

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

  const queuedTimeEventHandlers: {
    time: number;
    callback: TimeEventCallback;
    frame: number;
    expired: boolean;
  }[] = [];

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

      const queuedNoteDownEventHandlers: NoteEventCallback[] = [];
      const queuedNoteUpEventHandlers: NoteEventCallback[] = [];

      const onNoteDown = (callback: NoteEventCallback) => {
        queuedNoteDownEventHandlers.push(callback);
      };

      const onNoteUp = (callback: NoteEventCallback) => {
        queuedNoteUpEventHandlers.push(callback);
      };

      const atTime = (eventTime: number, callback: TimeEventCallback) => {
        const eventsWithSameTime = queuedTimeEventHandlers.filter(
          (queuedTimeEventHandler) => queuedTimeEventHandler.time === eventTime
        );

        if (
          eventsWithSameTime.length > 0 &&
          eventsWithSameTime.some(
            (eventWithSameTime) => eventWithSameTime.frame !== frame
          )
        )
          return;

        queuedTimeEventHandlers.push({
          time: eventTime,
          callback,
          frame,
          expired: false,
        });
      };

      animationLoop({
        ...sketchProps,
        atTime,
        onNoteUp,
        onNoteDown,
      });

      // React to event handlers from frame
      recentNotesPressedDown.forEach((recentNotePressedDown) => {
        queuedNoteDownEventHandlers.forEach((noteDownHandler) => {
          noteDownHandler({ ...recentNotePressedDown, visualisation });
        });
      });

      recentNotesPressedUp.forEach((recentNotePressedUp) => {
        queuedNoteUpEventHandlers.forEach((noteUpHandler) => {
          noteUpHandler({ ...recentNotePressedUp, visualisation });
        });
      });

      if (typeof time !== "undefined") {
        queuedTimeEventHandlers
          .filter((queuedTimeEventHandler) => !queuedTimeEventHandler.expired)
          .forEach((queuedTimeEventHandler) => {
            if (time > queuedTimeEventHandler.time) {
              queuedTimeEventHandler.callback({ time, visualisation });
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
