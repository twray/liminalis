import canvasSketch from "canvas-sketch";
import { color, math, random } from "canvas-sketch-util";
import { WebMidi } from "webmidi";

// Import types from organized structure
import type {
  AppSettings,
  BlockDimensions,
  CanvasProps,
  SketchSettings,
} from "./types/index.js";

import AnimatableIsometricCuboid from "./animatable/AnimatableIsometricCuboid.js";
import BarcodeStripe from "./animatable/BarcodeStripe.js";
import BoxCoil from "./animatable/BoxCoil.js";
import ShootingKey from "./animatable/ShootingKey.js";
import AnimatableObjectManager from "./managers/AnimatableObjectManager.js";
import KeyEventManager from "./managers/KeyEventManager.js";
import ModeManager from "./managers/ModeManager.js";
import Mode from "./util/Mode.js";
import IsometricView from "./views/IsometricView.js";

import keyMappings from "./data/keyMappings.json";
import { getPaletteByName, PALETTE_NAMES } from "./util/colorPalette.js";

const settings: SketchSettings = {
  dimensions: [1080, 1920] as [number, number],
  animate: true,
  fps: 25,
};

const appProperties: AppSettings = {
  computerKeyboardDebugEnabled: true,
};

const keyEventManager = new KeyEventManager("non-major");
const animatableObjectManager = new AnimatableObjectManager();
const modeManager = new ModeManager(
  [
    Mode.DARK,
    Mode.TRANSITION_TO_BLOCK,
    Mode.BLOCK,
    Mode.TRANSITION_BACK_TO_DARKNESS,
    Mode.FINAL_BLOCK,
  ],
  ["F1", "D#1"]
);

const sketch = () => {
  const pianoClampedMin = "C3";
  const pianoClampedMax = "C6";

  const minArpeggioStepValue = 0;
  const maxArpeggioStepValue = 8;

  let previousBlockDimensions: BlockDimensions | undefined;
  let currentColorPaletteIndex = 0;
  let arpeggioStepCount = 0;

  return ({ context, width, height }: CanvasProps) => {
    const { rangeFloor } = random;
    const { clamp, clamp01, lerp, inverseLerp } = math;
    const { parse } = color;

    let mode = modeManager.getCurrentMode();

    context.fillStyle = modeManager.currentlyIsOrPreviouslyHasBeenInMode(
      Mode.TRANSITION_BACK_TO_DARKNESS
    )
      ? "#444444"
      : "#000000";

    context.fillRect(0, 0, width, height);

    if (
      (modeManager.getTimeSinceTransitionMode() !== null &&
        modeManager.currentlyIsOrPreviouslyHasBeenInMode(
          Mode.TRANSITION_TO_BLOCK
        )) ||
      modeManager.currentlyIsOrPreviouslyHasBeenInMode(
        Mode.TRANSITION_BACK_TO_DARKNESS
      )
    ) {
      const backgroundTransitionTime =
        modeManager.currentlyIsOrPreviouslyHasBeenInMode(
          Mode.TRANSITION_BACK_TO_DARKNESS
        )
          ? 10000
          : 30000;

      const backgroundTransitionIndex = clamp01(
        modeManager.getTimeSinceTransitionMode() / backgroundTransitionTime
      );

      const backgroundTransitionOpacityBasedOnMode =
        mode === Mode.TRANSITION_BACK_TO_DARKNESS
          ? 1 - backgroundTransitionIndex
          : backgroundTransitionIndex;

      const [r, g, b] = parse("#DDDDDD").rgb;

      const transitionBackgroundColor = `rgba(${r}, ${g}, ${b}, ${backgroundTransitionOpacityBasedOnMode})`;

      context.fillStyle = transitionBackgroundColor;
      context.fillRect(0, 0, width, height);
    }

    // Initialise Isometric View
    const isometricView = new IsometricView(context, width, height, 80);

    // Compute and Derive Events

    const newKeyEvents = keyEventManager.getNewKeyEventsForFrame("noteon");
    const newChordEvent = keyEventManager.getNewChordEventForFrame();
    const intensityIndex = keyEventManager.getIntensityIndex();

    const arpeggioDirection =
      keyEventManager.getPlayedArpeggioDirectionForFrame(7);

    const newPhraseDetected = keyEventManager.getNewPhraseDetectionForFrame();

    if (newPhraseDetected) {
      console.log("new phrase detected");
    }

    if (newChordEvent) {
      console.log("chord detected!");

      if (intensityIndex > 0.8) {
        console.log("intense chord detected");
      }
    }

    // Render Existing Animatable Objects

    animatableObjectManager.renderAnimatableObjects(context, isometricView);

    // Add New Animatable Objects Based on Key Events

    newKeyEvents.forEach((keyEvent) => {
      const { note, attack } = keyEvent;

      const interpolatedNoteIndex = clamp(
        inverseLerp(
          keyMappings.findIndex(
            (keyMapping) => keyMapping.note === pianoClampedMin
          ),
          keyMappings.findIndex(
            (keyMapping) => keyMapping.note === pianoClampedMax
          ),
          keyMappings.findIndex((keyMapping) => keyMapping.note === note)
        ) - 0.01,
        0,
        1
      );

      if (mode === Mode.DARK) {
        context.globalCompositeOperation = "difference";

        const interpolatedPositionForShootingKeyboard = Math.floor(
          lerp(0, 22, interpolatedNoteIndex)
        );

        const shootingKey = new ShootingKey({
          isoX: -8,
          isoY: 14 - interpolatedPositionForShootingKeyboard,
          isoZ: -4,
          fill: "white",
          stroke: "transparent",
        })
          .show(attack)
          .hide(2000)
          .renderIn(isometricView);

        animatableObjectManager.registerAnimatableObject(shootingKey);

        if (arpeggioDirection) {
          if (arpeggioDirection === -1 && arpeggioStepCount === 0) {
            arpeggioStepCount = maxArpeggioStepValue;
          }

          const boxCoil = new BoxCoil({
            isoX: 0 + arpeggioStepCount,
            isoY: 2,
            isoZ: -10,
            fill: "transparent",
            stroke: "white",
          })
            .show(attack)
            .hide(5000)
            .renderIn(isometricView);

          animatableObjectManager.registerAnimatableObject(boxCoil);

          if (intensityIndex > 0.65) {
            const barcodeXPositionRandomVariation =
              Math.floor((Math.random() * width) / 2) * arpeggioDirection;

            const barcodeStripe = new BarcodeStripe({
              x:
                (width / maxArpeggioStepValue) * arpeggioStepCount +
                barcodeXPositionRandomVariation,
              y: 0,
              width: width / maxArpeggioStepValue,
              height,
              widthVarianceFactor: 10,
            })
              .show(attack)
              .hide(2000)
              .renderIn(context);

            animatableObjectManager.registerAnimatableObject(barcodeStripe);
          }

          const nextArpeggioStepCount = arpeggioStepCount + arpeggioDirection;

          if (nextArpeggioStepCount > maxArpeggioStepValue) {
            arpeggioStepCount = minArpeggioStepValue;
          } else if (nextArpeggioStepCount < minArpeggioStepValue) {
            arpeggioStepCount = maxArpeggioStepValue;
          } else {
            arpeggioStepCount = arpeggioStepCount + arpeggioDirection;
          }
        } else {
          arpeggioStepCount = 0;
        }
      }

      if (mode !== Mode.DARK) {
        let blockDimensions;

        if (arpeggioDirection && previousBlockDimensions) {
          let isoXDifference, isoYDifference, isoZDifference;

          switch (arpeggioDirection) {
            case 1:
            default: {
              if (
                previousBlockDimensions.lengthX >=
                previousBlockDimensions.lengthY
              ) {
                isoXDifference = 1;
                isoYDifference = 0;
                isoZDifference = 1;
              } else {
                isoXDifference = 0;
                isoYDifference = 1;
                isoZDifference = 1;
              }
              break;
            }
            case -1: {
              if (
                previousBlockDimensions.lengthY >=
                previousBlockDimensions.lengthX
              ) {
                isoXDifference = 0;
                isoYDifference = -1;
                isoZDifference = -1;
              } else {
                isoXDifference = -1;
                isoYDifference = 0;
                isoZDifference = -1;
              }
              break;
            }
          }

          blockDimensions = {
            isoX: previousBlockDimensions.isoX + isoXDifference,
            isoY: previousBlockDimensions.isoY + isoYDifference,
            isoZ: previousBlockDimensions.isoZ + isoZDifference,
            lengthX: previousBlockDimensions.lengthX,
            lengthY: previousBlockDimensions.lengthY,
            lengthZ:
              arpeggioDirection === 1 ? 1 : previousBlockDimensions.lengthZ,
          };
        } else {
          blockDimensions = {
            isoX: rangeFloor(-9, 1),
            isoY: rangeFloor(-9, 1),
            isoZ: Math.floor(lerp(-3, 6, interpolatedNoteIndex)),
            lengthX: Math.floor(
              Math.max(1, lerp(1, 7, attack) + rangeFloor(-1, 1))
            ),
            lengthY: Math.floor(
              Math.max(1, lerp(1, 7, attack) + rangeFloor(-1, 1))
            ),
            lengthZ: Math.floor(
              Math.max(1, lerp(1, 7, attack) + rangeFloor(-1, 1))
            ),
          };
        }

        let currentPalette: string[] = [];

        switch (mode) {
          case Mode.BLOCK: {
            currentPalette = getPaletteByName(PALETTE_NAMES.SUNRISE);
            break;
          }
          case Mode.TRANSITION_BACK_TO_DARKNESS: {
            currentPalette = getPaletteByName(PALETTE_NAMES.GREY_SKIES);
            break;
          }
          case Mode.FINAL_BLOCK: {
            currentPalette = getPaletteByName(PALETTE_NAMES.BRIGHTNESS);
            break;
          }
          default:
        }

        currentColorPaletteIndex =
          currentColorPaletteIndex < currentPalette.length - 1
            ? currentColorPaletteIndex + 1
            : 0;

        const blocksAreWireFrame = mode === Mode.TRANSITION_TO_BLOCK;

        const blockFillColor = blocksAreWireFrame
          ? "transparent"
          : currentPalette[currentColorPaletteIndex];

        const blockStrokeColor = blocksAreWireFrame ? "#FFFFFF" : "#777777";

        const renderedBlock = new AnimatableIsometricCuboid({
          isoX: blockDimensions.isoX,
          isoY: blockDimensions.isoY,
          isoZ: blockDimensions.isoZ,
          lengthX: blockDimensions.lengthX,
          lengthY: blockDimensions.lengthY,
          lengthZ: blockDimensions.lengthZ,
          fill: blockFillColor,
          stroke: blockStrokeColor,
        })
          .show(attack)
          .hide(6000)
          .renderIn(isometricView);

        previousBlockDimensions = blockDimensions;

        animatableObjectManager.registerAnimatableObject(renderedBlock);
      }
    });

    // Render the Isometric View
    isometricView.render();

    // Clean Up Or Remove Decayed Objects
    animatableObjectManager.cleanupDecayedObjects();
  };
};

const setUpEventListeners = () => {
  const { computerKeyboardDebugEnabled } = appProperties;

  if (computerKeyboardDebugEnabled) {
    console.log("Keyboard testing available");

    window.addEventListener("keydown", (event) => {
      const note = keyMappings.find(
        (keyMapping) => event.code === keyMapping.keyCode
      )?.note;

      if (note) {
        handleNoteOn(note);
      }
    });

    window.addEventListener("keyup", (event) => {
      const note = keyMappings.find(
        (keyMapping) => event.code === keyMapping.keyCode
      )?.note;

      if (note) {
        handleNoteOff(note);
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
          handleNoteOn(identifier, number, attack);
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

  const handleNoteOn = (note: string, number?: number, attack = 1) => {
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
