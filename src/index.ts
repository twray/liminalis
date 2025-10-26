import canvasSketch from "canvas-sketch";
import { Utilities, WebMidi } from "webmidi";

// Import types from organized structure
import {
  createNormalizedFloat,
  NormalizedFloat,
  type AppSettings,
  type CanvasProps,
  type SketchSettings,
} from "./types/index.js";

import keyMappings from "./data/keyMappings.json";

import AnimatableObjectManager from "./managers/AnimatableObjectManager.js";
import KeyEventManager from "./managers/KeyEventManager.js";

import SpringRectangle from "./animatable/SpringRectangle.js";
import ModeManager from "./managers/ModeManager.js";

const settings: SketchSettings = {
  dimensions: [1080, 1920] as [number, number],
  animate: true,
  fps: 60,
};

const appProperties: AppSettings = {
  computerKeyboardDebugEnabled: true,
};

const keyEventManager = new KeyEventManager("major");
const animatableObjectManager = new AnimatableObjectManager();
const modeManager = new ModeManager([], []);

const sketch = () => {
  // General data and properties for the visualisation.

  // In this example, we would use these specific notes (or their natural
  // 'white key' equivalents) to trigger visual changes.
  const mappableBaseNotes = [
    "C4",
    "D4",
    "E4",
    "F4",
    "G4",
    "A4",
    "B4",
    "C5",
    "D5",
  ];

  return ({ context, width, height }: CanvasProps) => {
    // Clear the canvas
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);

    // Get recent key information as sent from MIDI controller / keyboard debugger
    const recentKeysPressedDown =
      keyEventManager.getNewKeyEventsForFrame("noteon");
    const recentKeysPressedUp =
      keyEventManager.getNewKeyEventsForFrame("noteoff");

    // Derive some basic dimensions
    const innerBoxDimensions = Math.round(0.8 * width);
    const numRectangles = 10;
    const rectangleAndGapWidth = innerBoxDimensions / (numRectangles * 2 - 1);

    const springRectangles: SpringRectangle[] = [];

    // Construct the animatable objects and add them to the layout
    for (let i = 0; i < numRectangles; i++) {
      const springRectangle = new SpringRectangle({
        x: width / 2 - innerBoxDimensions / 2 + i * (rectangleAndGapWidth * 2),
        y: height / 2 - innerBoxDimensions / 2,
        width: rectangleAndGapWidth,
        height: innerBoxDimensions,
        fill: "#333333",
      });

      animatableObjectManager.registerAnimatableObject(springRectangle);
      springRectangles.push(springRectangle);
    }

    // React based on key presses within frame
    if (recentKeysPressedDown.length > 0) {
      console.log("Keys pressed:", recentKeysPressedDown.length);
      recentKeysPressedDown.forEach(({ attack }) => {
        springRectangles.forEach((springRectangle) => {
          springRectangle.attack(attack);
        });
      });
    }

    if (recentKeysPressedUp.length > 0) {
      console.log("Keys released:", recentKeysPressedUp.length);
      recentKeysPressedUp.forEach(() => {
        springRectangles.forEach((springRectangle) => {
          springRectangle.decay(1000);
        });
      });
    }

    // Remove objects that are either decayed or not visible
    animatableObjectManager.cleanupDecayedObjects();

    // Render all animatable objects
    animatableObjectManager.renderAnimatableObjects(context);
  };
};

const setUpEventListeners = () => {
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
          handleNoteOn(identifier, number, createNormalizedFloat(attack));
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
    number?: number,
    attack: NormalizedFloat = createNormalizedFloat(1)
  ) => {
    if (modeManager.modeTransitionNotes.includes(note)) {
      modeManager.transitionToNextMode();
    }

    keyEventManager.registerNoteOnEvent(note, number, attack);
  };

  const handleNoteOff = (note: string, number?: number) => {
    keyEventManager.registerNoteOffEvent(note, number);
  };
};

setUpEventListeners();
canvasSketch(sketch, settings);
