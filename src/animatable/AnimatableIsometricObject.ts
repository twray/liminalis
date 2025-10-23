import IsometricView from "../views/IsometricView";
import AnimatableObject from "./AnimatableObject";

abstract class AnimatableIsometricObject extends AnimatableObject<IsometricView> {
  constructor() {
    super();
  }

  abstract renderIn(target: IsometricView): this;
}

export default AnimatableIsometricObject;
