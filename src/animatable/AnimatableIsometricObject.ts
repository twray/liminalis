import IsometricView from "../views/IsometricView";
import AnimatableObject, { AnimatableObjectOptions } from "./AnimatableObject";

class AnimatableIsometricObject<TProps> extends AnimatableObject<
  TProps,
  IsometricView
> {
  constructor(options: AnimatableObjectOptions<TProps, IsometricView>) {
    super(options);
  }
}

export default AnimatableIsometricObject;
