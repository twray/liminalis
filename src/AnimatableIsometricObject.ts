import AnimatableObject from "./AnimatableObject";
import IsometricView from "./IsometricView";

abstract class AnimatableIsometricObject extends AnimatableObject<IsometricView> {
  constructor() {
    super();
  }

  abstract render(target: IsometricView): void;
}

export default AnimatableIsometricObject;
