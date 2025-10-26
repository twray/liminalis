import AnimatableIsometricObject from "../animatable/AnimatableIsometricObject";
import AnimatableObject from "../animatable/AnimatableObject";
import IsometricView from "../views/IsometricView";

type AnyAnimatableObject = AnimatableObject<any>;

class AnimatableObjectManager {
  constructor(
    public animatableObjects: AnyAnimatableObject[] = [],
    public maxAnimatableObjects: number = 1000
  ) {}

  registerAnimatableObject(animatableObject: AnyAnimatableObject) {
    const { maxAnimatableObjects } = this;

    this.animatableObjects.push(animatableObject);

    if (this.animatableObjects.length > maxAnimatableObjects) {
      console.warn(
        `Warning: Over ${maxAnimatableObjects} are registered. ` +
          `Check that your objects are decaying and being cleaned up correctly ` +
          `or increase the maximum number of allowed animatable objects.`
      );
    }
  }

  renderAnimatableObjects(
    context: CanvasRenderingContext2D,
    isometricView?: IsometricView
  ) {
    this.animatableObjects.forEach((animatableObject) => {
      if (animatableObject.isVisible || animatableObject.decayFactor > 0) {
        if (
          isometricView &&
          animatableObject instanceof AnimatableIsometricObject
        ) {
          animatableObject.renderIn(isometricView);
        } else {
          animatableObject.renderIn(context);
        }
      } else {
        animatableObject.hasDecayed = true;
      }
    });
  }

  cleanupDecayedObjects() {
    this.animatableObjects = this.animatableObjects.filter(
      (animatableObject) => !animatableObject.hasDecayed
    );
  }
}

export default AnimatableObjectManager;
