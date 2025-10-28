import canvasSketch from "canvas-sketch";
import { Utilities, WebMidi } from "webmidi";

// Import types from organized structure
import {
  CanvasProps,
  createNormalizedFloat,
  NormalizedFloat,
  type AppSettings,
  type SketchSettings,
} from "./types/index.js";

import keyMappings from "./data/keyMappings.json";

import KeyEventManager from "./managers/KeyEventManager.js";
import Visualisation from "./managers/Visualisation.js";

import { color } from "canvas-sketch-util";
import { easeInCubic, easeInQuad, easeOutBack } from "easing-utils";
import AnimatableIsometricObject from "./animatable/AnimatableIsometricObject.js";
import AnimatableObject from "./animatable/AnimatableObject.js";
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
const visualisation = new Visualisation();
const modeManager = new ModeManager([], []);

// SCENE 1 - Simple rectangles that respond to MIDI input rendered within Canvas
const sketch1 = ({ width, height }: CanvasProps) => {
  // General data and properties for the visualisation.

  // In this example, we would use these specific notes (or their natural
  // 'white key' equivalents) to trigger visual changes.
  const mappableBaseNotes = ["C", "D", "E", "F", "G", "A", "B"];

  // Derive some basic dimensions
  const innerBoxDimensions = Math.round(0.8 * width);
  const numRectangles = 7;
  const rectangleAndGapWidth = innerBoxDimensions / (numRectangles * 2 - 1);

  // Create and register the animatable elements
  mappableBaseNotes.forEach((note, i) => {
    visualisation.add(
      note,
      new AnimatableObject<{
        x: number;
        y: number;
        width: number;
        height: number;
        fill: string;
      }>({
        props: {
          x:
            width / 2 - innerBoxDimensions / 2 + i * (rectangleAndGapWidth * 2),
          y: height / 2 - innerBoxDimensions / 2,
          width: rectangleAndGapWidth,
          height: innerBoxDimensions,
          fill: "#333333",
        },
        render: ({ props, context, attackValue, decayFactor }) => {
          const { x, y, width, height, fill } = props;

          const easedDecayFactor = easeInCubic(decayFactor);

          const [r, g, b] = color.parse(fill).rgb;

          const fillWithAlpha = `rgba(${r}, ${g}, ${b}, ${easedDecayFactor})`;
          const renderedHeight = attackValue * height * easedDecayFactor;
          const yOffset = height - renderedHeight;

          context.save();
          context.fillStyle = fillWithAlpha;
          context.fillRect(x, y + yOffset, width, renderedHeight);
          context.restore();
        },
        isPermanent: true,
      })
    );
  });

  return ({ context, width, height, frame }: CanvasProps) => {
    // Clear the canvas
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);

    // Rendering only works if animated and if there are workable frames
    if (!frame) return;

    // Get recent key information as sent from MIDI controller / keyboard debugger
    const recentKeysPressedUp = keyEventManager.getNewKeyEventsForFrame(
      frame,
      "noteoff"
    );
    const recentKeysPressedDown = keyEventManager.getNewKeyEventsForFrame(
      frame,
      "noteon"
    );

    // React based on key presses within frame
    if (recentKeysPressedDown.length > 0) {
      console.log("Keys pressed:", recentKeysPressedDown.length);

      recentKeysPressedDown.forEach(({ note, attack }) => {
        visualisation
          .get(Utilities.buildNote(note).name)
          ?.attack(attack ?? createNormalizedFloat(1));
      });
    }

    if (recentKeysPressedUp.length > 0) {
      console.log("Keys released:", recentKeysPressedUp.length);

      recentKeysPressedUp.forEach(({ note }) => {
        visualisation.get(Utilities.buildNote(note).name)?.decay(2000);
      });
    }

    // Remove objects that are either decayed or not visible
    visualisation.cleanUp();

    // Render all animatable objects
    visualisation.renderObjects(context);
  };
};

// SCENE 2 - Cubes that respond to MIDI input rendered within an Isometric View
const sketch2 = ({ context, width, height }: CanvasProps) => {
  const mappableBaseNotes = ["C", "D", "E", "F", "G", "A", "B"];

  return ({ frame }: CanvasProps) => {
    // Clear the canvas
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    // Rendering only works if animated and if there are workable frames
    if (!frame) return;

    // Get recent key information as sent from MIDI controller / keyboard debugger
    const recentKeysPressedUp = keyEventManager.getNewKeyEventsForFrame(
      frame,
      "noteoff"
    );
    const recentKeysPressedDown = keyEventManager.getNewKeyEventsForFrame(
      frame,
      "noteon"
    );

    // React based on key presses within frame
    if (recentKeysPressedDown.length > 0) {
      console.log("Keys pressed:", recentKeysPressedDown.length);
      recentKeysPressedDown.forEach((note) => {
        const baseNote = Utilities.buildNote(note.note).name;
        const positionIndex = mappableBaseNotes.indexOf(baseNote);
        visualisation.add(
          baseNote,
          new AnimatableIsometricObject<{}>({
            props: {},
            render({
              context,
              attackValue,
              decayFactor,
              getAnimationTrajectory,
            }) {
              const bounceInAnimationTrajectory = getAnimationTrajectory(
                1000,
                0,
                false,
                easeOutBack
              );

              const adjustedAttackValue = easeInQuad(attackValue);

              context.addCuboidAt({
                isoX: -3 + positionIndex,
                isoY: 0,
                isoZ: -6 + positionIndex,
                lengthX: 1,
                lengthY: 3,
                lengthZ: 1,
                fill: "#333",
                opacity: decayFactor,
                translateZ:
                  750 * adjustedAttackValue * (1 - bounceInAnimationTrajectory),
              });
            },
          }).attack(createNormalizedFloat(note.attack ?? 1))
        );
      });
    }

    if (recentKeysPressedUp.length > 0) {
      console.log("Keys released:", recentKeysPressedUp.length);
      recentKeysPressedUp.forEach((note) => {
        const baseNote = Utilities.buildNote(note.note).name;
        visualisation.get(baseNote)?.decay(2000);
      });
    }

    // Remove objects that are either decayed or not visible
    visualisation.cleanUp();

    // Render all animatable objects
    visualisation.renderObjects(context);
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
    number: number,
    attack: NormalizedFloat = createNormalizedFloat(1)
  ) => {
    if (modeManager.modeTransitionNotes.includes(note)) {
      modeManager.transitionToNextMode();
    }

    keyEventManager.registerNoteOnEvent(note, number, attack);
  };

  const handleNoteOff = (note: string, number: number) => {
    keyEventManager.registerNoteOffEvent(note, number);
  };
};

setUpEventListeners();
canvasSketch(sketch1, settings);
