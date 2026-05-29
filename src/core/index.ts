import MidiVisual from "./MidiVisual";
import VisualisationAnimationLoopHandler from "./VisualisationAnimationLoopHandler";

export { logMessage } from "../util/log";
export const midiVisual = <TProps>() => new MidiVisual<TProps>();
export const createVisualisation = new VisualisationAnimationLoopHandler();
