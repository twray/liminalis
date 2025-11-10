import IsometricView from "../views/IsometricView";
import AnimatableObject from "./AnimatableObject";

class AnimatableIsometricObject<TProps> extends AnimatableObject<
  TProps,
  IsometricView
> {
  constructor() {
    super();
  }
}

export default AnimatableIsometricObject;
