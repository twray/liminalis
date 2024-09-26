const canvasSketch = require('canvas-sketch');
const easing = require('easing-utils');
const risoColors = require('riso-colors');
const { random, math, color } = require('canvas-sketch-util');
const { WebMidi } = require('webmidi');
const TweakPane = require('tweakpane');

import KeyEventManager from './KeyEventManager';
import AnimatableObjectManager from './AnimatableObjectManager';
import ModeManager from './ModeManager';

import IsometricView from './IsometricView';

import IsometricViewTileFaceType from './IsometricViewTileFaceType';
import Mode from './Mode';

import BarcodeStripe from './BarcodeStripe';
import ShootingKey from './ShootingKey';
import BoxCoil from './BoxCoil';
import AnimatableIsometricCuboid from './AnimatableIsometricCuboid';

const keyMappings = require('./keyMappings.json');
const colorPalettes = require('./colorPalletes.json');

const settings = {
  // dimensions: [ 1920, 1080 ],
  animate: true,
};

const controlPanelParameters = {
  numObjectsRendered: 0,
}

const appProperties = {
  computerKeyboardDebugEnabled: false,
};

const keyEventManager = new KeyEventManager('non-major');
const animatableObjectManager = new AnimatableObjectManager();
const modeManager = new ModeManager(['F1', 'D#1']);

const sketch = () => {  
  const pianoClampedMin = 'C3';
  const pianoClampedMax = 'C6';

  const minArpeggioStepValue = 0;
  const maxArpeggioStepValue = 8;

  let previousBlockDimensions;
  let currentColorPaletteIndex = 0;
  let arpeggioStepCount = 0;

  return ({ context, width, height }) => {
    const { rangeFloor } = random;
    const { clamp, clamp01, lerp, inverseLerp } = math;
    const { parse } = color;
    
    let mode = modeManager.getCurrentMode();

    context.fillStyle = modeManager.currentlyIsOrPreviouslyHasBeenInMode(
      Mode.TRANSITION_BACK_TO_DARKNESS
    ) 
    ? '#444444'
    : '#000000';

    context.fillRect(0, 0, width, height);

    if (
      modeManager.getTimeSinceTransitionMode() !== null
      && modeManager.currentlyIsOrPreviouslyHasBeenInMode(
        Mode.TRANSITION_TO_BLOCK
      )
      || modeManager.currentlyIsOrPreviouslyHasBeenInMode(
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
        modeManager.getTimeSinceTransitionMode() / backgroundTransitionTime,
        0,
      );

      const backgroundTransitionOpacityBasedOnMode = 
        mode === Mode.TRANSITION_BACK_TO_DARKNESS
        ? 1 - backgroundTransitionIndex
        : backgroundTransitionIndex;

      const [ r, g, b ] = parse('#DDDDDD').rgb;

      const transitionBackgroundColor = 
        `rgba(${r}, ${g}, ${b}, ${backgroundTransitionOpacityBasedOnMode})`;
      
      context.fillStyle = transitionBackgroundColor;
      context.fillRect(0, 0, width, height);
    }

    // Run a Few Drawing Experiments

    // runSomeDrawingExperiments(context, width, height);

    // Initialise Isometric View

    const isometricView = new IsometricView(context, width, height, 80, 40);

    // Compute and Derive Events
    
    const newKeyEvents = keyEventManager.getNewKeyEventsForFrame('noteon');
    const newChordEvent = keyEventManager.getNewChordEventForFrame();
    const intensityIndex = keyEventManager.getIntensityIndex();

    const arpeggioDirection = keyEventManager
      .getPlayedArpeggioDirectionForFrame(7);

    const recentlyPhrasedKeyEvents = keyEventManager
      .getRecentlyPhrasedKeyEvents(2000, 'noteon');

    const newPhraseDetected = keyEventManager.getNewPhraseDetectionForFrame();

    if (newPhraseDetected) {
      console.log('new phrase detected');
    }

    if (newChordEvent) {
      console.log('chord detected!');

      if (intensityIndex > 0.8) {
        console.log('intense chord detected');
      }
    }
    
    // Render Existing Animatable Objects

    animatableObjectManager.renderAnimatableObjects(context, isometricView);

    // Add New Animatable Objects Based on Key Events

    newKeyEvents.forEach((keyEvent) => {      
      const {  note, attack } = keyEvent;

      const interpolatedNoteIndex = clamp(
        inverseLerp(
          keyMappings.findIndex(
            (keyMapping) => keyMapping.note === pianoClampedMin
          ),
          keyMappings.findIndex(
            (keyMapping) => keyMapping.note === pianoClampedMax
          ),
          keyMappings.findIndex(
            (keyMapping) => keyMapping.note === note
          ),
        ) - 0.01,
        0,
        1,
      );

      if (mode === Mode.DARK) {
        context.globalCompositeOperation = 'difference';
        
        const interpolatedPositionForShootingKeyboard =
          Math.floor(lerp(0, 22, interpolatedNoteIndex));
        
        const shootingKey = new ShootingKey({
          isoX: -8,
          isoY: 14 - interpolatedPositionForShootingKeyboard,
          isoZ: -4,
          fill: 'white',
          stroke: 'transparent',
        }).show(attack).hide(2000).render(isometricView);

        animatableObjectManager.registerAnimatableObject(shootingKey);

        if (arpeggioDirection) {
          if (arpeggioDirection === -1 && arpeggioStepCount === 0) {
            arpeggioStepCount = maxArpeggioStepValue;
          }
                    
          const boxCoil = new BoxCoil({
            isoX: 0 + arpeggioStepCount,
            isoY: 2,
            isoZ: -10,
            fill: 'transparent',
            stroke: 'white',
          }).show(attack).hide(5000).render(isometricView);

          animatableObjectManager.registerAnimatableObject(boxCoil);
          
          if (intensityIndex > 0.65) {
            const barcodeXPositionRandomVariation = 
              (Math.floor(Math.random() * width / 2)) * arpeggioDirection;
          
            const barcodeStripe = new BarcodeStripe({
              x: ((width) / maxArpeggioStepValue) 
                * arpeggioStepCount 
                + barcodeXPositionRandomVariation,
              y: 0,
              width: width / maxArpeggioStepValue,
              height,
              widthVarianceFactor: 10,
            }).show(attack).hide(2000).render(context);

            animatableObjectManager.registerAnimatableObject(barcodeStripe);
          }

          const nextArpeggioStepCount = arpeggioStepCount + arpeggioDirection;

          if (nextArpeggioStepCount > maxArpeggioStepValue) {
            arpeggioStepCount = minArpeggioStepValue;
          } else if (nextArpeggioStepCount < minArpeggioStepValue) {
            arpeggioStepCount = maxArpeggioStepValue
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
                previousBlockDimensions.lengthX 
                >= previousBlockDimensions.lengthY
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
                previousBlockDimensions.lengthY 
                >= previousBlockDimensions.lengthX
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
            lengthZ: arpeggioDirection === 1
              ? 1 
              : previousBlockDimensions.lengthZ,
            lengthZ: 1,
          };
        } else {
          blockDimensions = {
            isoX: rangeFloor(-9, 1),
            isoY: rangeFloor(-9, 1),
            isoZ: Math.floor(lerp(-3, 6, interpolatedNoteIndex)),
            lengthX: Math.floor(
              Math.max(1, lerp(1, 7, attack) + rangeFloor(-1, 1)),
            ),
            lengthY: Math.floor(
              Math.max(1, lerp(1, 7, attack) + rangeFloor(-1, 1))
            ),
            lengthZ: Math.floor(
              Math.max(1, lerp(1, 7, attack) + rangeFloor(-1, 1))
            ),
          };
        }

        let currentPalette = [];
        
        switch (mode) {
          case Mode.BLOCK: {
            currentPalette = colorPalettes.find(
              ({ name }) => name === 'sunrise'
            ).colors;
            break;
          }
          case Mode.TRANSITION_BACK_TO_DARKNESS: {
            currentPalette = colorPalettes.find(
              ({ name }) => name === 'grey-skies'
            ).colors;
            break;
          }
          case Mode.FINAL_BLOCK: {
            currentPalette = colorPalettes.find(
              ({ name }) => name === 'brightness'
            ).colors;
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
          ? 'transparent'
          : currentPalette[currentColorPaletteIndex];
        
        const blockStrokeColor = blocksAreWireFrame ? '#FFFFFF' : '#777777';
    
        const renderedBlock = new AnimatableIsometricCuboid({
          isoX: blockDimensions.isoX,
          isoY: blockDimensions.isoY,
          isoZ: blockDimensions.isoZ,
          lengthX: blockDimensions.lengthX,
          lengthY: blockDimensions.lengthY,
          lengthZ: blockDimensions.lengthZ,
          fill: blockFillColor,
          stroke: blockStrokeColor,
        }).show(attack).hide(6000).render(isometricView);
  
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
    console.log('Keyboard testing available');
    
    window.addEventListener('keydown', (event) => {
      const note = keyMappings.find(
        (keyMapping) => event.code === keyMapping.keyCode
      )?.note;

      if (note) {
        handleNoteOn(note);
      }
    });

    window.addEventListener('keyup', (event) => {
      const note = keyMappings.find(
        (keyMapping) => event.code === keyMapping.keyCode
      )?.note;

      if (note) {
        handleNoteOff(note);
      }
    });
  }

  WebMidi.enable().then(() => {
    const firstAvailableMidiInput = WebMidi.inputs[0];

    if (firstAvailableMidiInput) {
      const midiInput = WebMidi.getInputById(firstAvailableMidiInput.id);
      
      console.log(`Connected to MIDI device ${firstAvailableMidiInput.name}`);

      midiInput.addListener('noteon', (event) => {
        const { identifier, attack, number } = event.note;
        handleNoteOn(identifier, number, attack);
      });

      midiInput.addListener('noteoff', (event) => {
        const { identifier, number } = event.note;
        handleNoteOff(identifier, number);
      });
    } else {
      console.log('No MIDI devices available');
    }
  }).catch(() => {
    console.error(
      'Unable to connect to any MIDI devices. ' +
      'Ensure that your browser is supported, and is ' +
      'running from localhost or a secure domain.'
    );
  });

  const handleNoteOn = (note, number, attack = 1) => {
    if (modeManager.modeTransitionNotes.includes(note)) {
      modeManager.transitionToNextMode();
    }
    
    keyEventManager.registerNoteOnEvent(note, number, attack);
  }

  const handleNoteOff = (note, number) => {
    keyEventManager.registerNoteOffEvent(note, number);
  }
}

const setUpControlPanel = () => {
  // Might consider doing this later

  // const tweakPane = new TweakPane.Pane();
  // const performanceFolder = tweakPane.addFolder({ title: 'Performance '});
  
  // performanceFolder.addInput(controlPanelParameters, 'numObjectsRendered', {
  //   readonly: true,
  // });
}

const runSomeDrawingExperiments = (context, width, height) => {
  const isometricView = new IsometricView(context, width, height, 80, 40);
  const { easeInQuad } = easing; 
  const { shuffle, rangeFloor } = random;

  context.save();

  // isometricView.showIsometricGrid();

  let numTiles;

  // Render graphic concept for 'tunnel' effect

  numTiles = 9;

  for (let i = 0; i < numTiles; i++) {
    isometricView.addTileAt({
      isoX: 0 + i,
      isoY: 0,
      isoZ: -8,
      type: IsometricViewTileFaceType.SIDE_LEFT,
      width: 8,
      height: 8,
      stroke: 'white',
      fill: 'transparent',
    });
  }

  // Render graphic concept for keyboard effect
  
  // numTiles = 22;
  
  // for (let i = 0; i < numTiles; i++) {
  //   isometricView.addTileAt({
  //     isoX: -8,
  //     isoY: 4 + Math.floor((numTiles - 1) / 2) - i,
  //     isoZ: -4,
  //     type: IsometricViewTileFaceType.BASE,
  //     width: 4,
  //     height: 1,
  //     stroke: 'white',
  //     fill: 'transparent',
  //   });
  // }

  // Render the isometric view (once per frame!)
  isometricView.render();

  context.restore();
}

setUpEventListeners();
setUpControlPanel();
canvasSketch(sketch, settings);
