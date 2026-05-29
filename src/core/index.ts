import { defineMidiVisual, defineVisual } from "./componentFactories";
import VisualisationAnimationLoopHandler from "./VisualisationAnimationLoopHandler";
export { defineMidiVisual, defineVisual } from "./componentFactories";

export { logMessage } from "../util/log";
export const midiVisual = defineMidiVisual;
export const visual = defineVisual;
export const createVisualisation = new VisualisationAnimationLoopHandler();
