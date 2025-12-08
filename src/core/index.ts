import AnimatableIsometricObject from "./AnimatableIsometricObject";
import AnimatableObject from "./AnimatableObject";
import VisualisationAnimationLoopHandler from "./VisualisationAnimationLoopHandler";

export { log } from "../util/log";

export const animatable = <TProps>() => new AnimatableObject<TProps>();

export const animatableIsometric = <TProps>() =>
  new AnimatableIsometricObject<TProps>();

export const createVisualisation = new VisualisationAnimationLoopHandler();
