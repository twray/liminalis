const canvasSketch = require('canvas-sketch');
const easing = require('easing-utils');
const palette = require('riso-colors');

const { random, math } = require('canvas-sketch-util');
const { WebMidi } = require('webmidi');
const TweakPane = require('tweakpane');

import KeyEventManager from './KeyEventManager';
import BarcodeStripe from './BarcodeStripe';
import AnimatableObjectManager from './AnimatableObjectManager';

import IsometricView from './IsometricView';
import IsometricViewTileFaceType from './IsometricViewTileFaceType';
import AnimatableIsometricTile from './AnimatableIsometricTile';
import AnimatableIsometricCuboid from './AnimatableIsometricCuboid';

const keyMappings = require('./keyMappings.json');

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

const colorPalettes = [
  [
    '#f15060',
    '#ff665e',
    '#ffe800',
    '#d2515e',
    '#ff6c2f',
    '#e45d50',
    '#ff7477',
    '#845991',
    '#775d7a',
    '#6c5d80',
    '#f65058',
    '#d2515e',
    '#c24f5d',
    '#9e4c6e',
    '#b44b65',
    '#a75154',
    '#ffb511',
    '#ffae3b',
    '#f6a04d',
    '#ee7f4b',
    '#ff6f4c',
    '#bd6439',
    '#8e595a',
    '#bd8ca6',
    '#914e72',
    '#ff8e91',
    '#FF4C65',
  ]
];

const sketch = () => {  
  const pianoClampedMin = 'C3';
  const pianoClampedMax = 'C6';

  let previousBlockDimensions;
  let currentColorPalletteIndex = 0;
  
  return ({ context, width, height }) => {
    const { rangeFloor } = random;
    const { clamp, lerp, inverseLerp } = math;
    
    context.fillStyle = '#333333';
    // context.fillStyle = '#CCCCCC';

    context.fillRect(0, 0, width, height);

    // Just enable this if you want the cool dark mode effects

    // context.globalCompositeOperation = 'difference';

    // Run a Few Drawing Experiments

    // runSomeDrawingExperiments(context, width, height);

    // Initialise Isometric View

    const isometricView = new IsometricView(context, width, height);

    // Compute and Derive Events
    
    const newKeyEvents = keyEventManager.getNewKeyEventsForFrame('noteon');
    const newChordEvent = keyEventManager.getNewChordEventForFrame();
    const intensityIndex = keyEventManager.getIntensityIndex();

    const arpeggioDirection = keyEventManager
      .getPlayedArpeggioDirectionForFrame();
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
          isoZ: Math.floor(lerp(-2, 7, interpolatedNoteIndex)),
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

      const blockFillColor = colorPalettes[0][currentColorPalletteIndex];
      const blockStrokeColor = '#777777';

      currentColorPalletteIndex = 
        currentColorPalletteIndex < colorPalettes[0].length - 1
        ? currentColorPalletteIndex + 1
        : 0;

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

      animatableObjectManager.registerAnimatableObject(renderedBlock);

      previousBlockDimensions = blockDimensions;

      if (intensityIndex > 0.8) {

        // const animatedTileConcept =  new AnimatableIsometricTile({
        //   isoX: 0,
        //   isoY: 0,
        //   isoZ: 0,
        //   fill: 'transparent',
        //   stroke: '#999999'
        // }).show(1).hide(2000).render(isometricView);
  
        // animatableObjectManager.registerAnimatableObject(animatedTileConcept);

        // const barcodeStripe = new BarcodeStripe({
        //   x: random.rangeFloor(0, width),
        //   y: 0,
        //   width: 400,
        //   height,
        // }).show(attack).hide(attack * 1000).render(context);

        // animatableObjectManager.registerAnimatableObject(barcodeStripe);
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
  const isometricView = new IsometricView(context, width, height, 100, 50);
  const { easeInQuad } = easing; 
  const { shuffle, rangeFloor } = random;

  context.save();

  context.globalCompositeOperation = 'source-over';

  // isometricView.showIsometricGrid();

  const numTiles = 7;
  const colors = shuffle(palette).slice(0, numTiles)

  for (let i = 0; i < numTiles; i++) {
    isometricView.addTileAt({
      isoX: 0,
      isoY: 0,
      isoZ: -7 + i,
      type: IsometricViewTileFaceType.BASE,
      width: 7,
      height: 7,
      stroke: 'transparent',
      fill: colors[i].hex,
    });

    // isometricView.renderCuboidAt({
    //   isoX: 0 + i,
    //   isoY: 0,
    //   isoZ: -5 + i,
    //   lengthX: 1,
    //   lengthY: 5,
    //   lengthZ: 1,
    // });
  }

  // Steps ascending top-right

  // for (let i = 0; i < 7; i++) {
  //   isometricView.addCuboidAt({
  //     isoX: 0 + i,
  //     isoY: 0,
  //     isoZ: -5 + i,
  //     lengthX: 2,
  //     lengthY: 4,
  //     lengthZ: 1,
  //     // fill: 'transparent',
  //     // stroke: '#333333',
  //   });
  // }

  // Steps ascending top-left

  // for (let i = 0; i < 7; i++) {
  //   isometricView.addCuboidAt({
  //     isoX: 0,
  //     isoY: 0 + i,
  //     isoZ: -5 + i,
  //     lengthX: 4,
  //     lengthY: 2,
  //     lengthZ: 1,
  //     // fill: 'transparent',
  //     // stroke: '#333333',
  //   });
  // }

  // Steps descending bottom-right

  // for (let i = 0; i < 7; i++) {
  //   isometricView.addCuboidAt({
  //     isoX: 0,
  //     isoY: 0 - i,
  //     isoZ: -5 - i,
  //     lengthX: 4,
  //     lengthY: 2,
  //     lengthZ: 1,
  //     // fill: 'transparent',
  //     // stroke: '#333333',
  //   });
  // }

  // Render the isometric view (once per frame!)
  isometricView.render();

  context.restore();
}

setUpEventListeners();
setUpControlPanel();
canvasSketch(sketch, settings);
