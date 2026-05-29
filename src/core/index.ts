import { defineVisual } from "./componentFactories";
import VisualisationAnimationLoopHandler from "./VisualisationAnimationLoopHandler";

export { logMessage } from "../util/log";
export const visual = defineVisual;
export const createVisualisation = new VisualisationAnimationLoopHandler();
