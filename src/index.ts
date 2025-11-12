import { springRectangle } from "./animatable/springRectangle";
import { createVisualisation } from "./core";
import { toNormalizedFloat } from "./types";

createVisualisation(({ width, height, onNoteUp, onNoteDown }) => {
  const mappableBaseNotes = ["C", "D", "E", "F", "G", "A", "B"];

  const innerBoxDimensions = Math.round(0.8 * width);
  const numRectangles = 7;
  const rectangleAndGapWidth = innerBoxDimensions / (numRectangles * 2 - 1);

  onNoteDown(({ note, attack, visualisation }) => {
    visualisation.add(
      note[0],
      springRectangle()
        .withProps({
          x:
            width / 2 -
            innerBoxDimensions / 2 +
            mappableBaseNotes.indexOf(note[0]) * (rectangleAndGapWidth * 2),
          y: height / 2 - innerBoxDimensions / 2,
          width: rectangleAndGapWidth,
          height: innerBoxDimensions,
          fill: "#333333",
        })
        .attack(toNormalizedFloat(attack ?? 1))
    );
  });

  onNoteUp(({ note, visualisation }) => {
    visualisation.get(note[0])?.decay(2000);
  });
});

// SCENE 1 - Simple rectangles that respond to MIDI input rendered within Canvas
// createVisualisation(({ width, height }: CanvasProps) => {
//   // General data and properties for the visualisation.

//   // In this example, we would use these specific notes (or their natural
//   // 'white key' equivalents) to trigger visual changes.
//   const mappableBaseNotes = ["C", "D", "E", "F", "G", "A", "B"];

//   // Derive some basic dimensions
//   const innerBoxDimensions = Math.round(0.8 * width);
//   const numRectangles = 7;
//   const rectangleAndGapWidth = innerBoxDimensions / (numRectangles * 2 - 1);

//   // Create and register the animatable elements
//   mappableBaseNotes.forEach((note, i) => {
//     visualisation.add(
//       note,
//       springRectangle()
//         .withProps({
//           x:
//             width / 2 - innerBoxDimensions / 2 + i * (rectangleAndGapWidth * 2),
//           y: height / 2 - innerBoxDimensions / 2,
//           width: rectangleAndGapWidth,
//           height: innerBoxDimensions,
//           fill: "#333333",
//         })
//         .setIsPermanent(true)
//     );
//   });

//   return ({ context, width, height, frame }: CanvasProps) => {
//     // Clear the canvas
//     context.fillStyle = "#FFFFFF";
//     context.fillRect(0, 0, width, height);

//     // Rendering only works if animated and if there are workable frames
//     if (!frame) return;

//     // Get recent key information as sent from MIDI controller / keyboard debugger
//     const recentKeysPressedUp = keyEventManager.getNewKeyEventsForFrame(
//       frame,
//       "noteoff"
//     );
//     const recentKeysPressedDown = keyEventManager.getNewKeyEventsForFrame(
//       frame,
//       "noteon"
//     );

//     // React based on key presses within frame
//     if (recentKeysPressedDown.length > 0) {
//       console.log("Keys pressed:", recentKeysPressedDown.length);

//       recentKeysPressedDown.forEach(({ note, attack }) => {
//         visualisation
//           .get(Utilities.buildNote(note).name)
//           ?.attack(attack ?? toNormalizedFloat(1));
//       });
//     }

//     if (recentKeysPressedUp.length > 0) {
//       console.log("Keys released:", recentKeysPressedUp.length);

//       recentKeysPressedUp.forEach(({ note }) => {
//         visualisation.get(Utilities.buildNote(note).name)?.decay(2000);
//       });
//     }

//     // Remove objects that are either decayed or not visible
//     visualisation.cleanUp();

//     // Render all animatable objects
//     visualisation.renderObjects(context);
//   };
// });

// SCENE 2 - Cubes that respond to MIDI input rendered within an Isometric View
// createVisualisation(({ context, width, height }: CanvasProps) => {
//   const mappableBaseNotes = ["C", "D", "E", "F", "G", "A", "B"];

//   return ({ frame }: CanvasProps) => {
//     // Clear the canvas
//     context.fillStyle = "#ffffff";
//     context.fillRect(0, 0, width, height);

//     // Rendering only works if animated and if there are workable frames
//     if (!frame) return;

//     // Get recent key information as sent from MIDI controller / keyboard debugger
//     const recentKeysPressedUp = keyEventManager.getNewKeyEventsForFrame(
//       frame,
//       "noteoff"
//     );
//     const recentKeysPressedDown = keyEventManager.getNewKeyEventsForFrame(
//       frame,
//       "noteon"
//     );

//     // React based on key presses within frame
//     if (recentKeysPressedDown.length > 0) {
//       console.log("Keys pressed:", recentKeysPressedDown.length);
//       recentKeysPressedDown.forEach((note) => {
//         const baseNote = Utilities.buildNote(note.note).name;
//         const positionIndex = mappableBaseNotes.indexOf(baseNote);
//         visualisation.add(
//           baseNote,
//           bouncyCuboid()
//             .withProps({ positionIndex })
//             .attack(toNormalizedFloat(note.attack ?? 1))
//             .sustain(10000)
//         );
//       });
//     }

//     if (recentKeysPressedUp.length > 0) {
//       console.log("Keys released:", recentKeysPressedUp.length);
//       recentKeysPressedUp.forEach((note) => {
//         const baseNote = Utilities.buildNote(note.note).name;
//         visualisation.get(baseNote)?.decay(2000);
//       });
//     }

//     // Remove objects that are either decayed or not visible
//     visualisation.cleanUp();

//     // Render all animatable objects
//     visualisation.renderObjects(context);
//   };
// });
