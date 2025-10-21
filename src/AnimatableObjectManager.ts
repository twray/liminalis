import AnimatableIsometricObject from "./AnimatableIsometricObject";
import AnimatableObject from "./AnimatableObject";
import IsometricView from "./IsometricView";

class AnimatableObjectManager {
  constructor(
    public animatableObjects: AnimatableObject[] = [],
    public maxAnimatableObjects: number = 1000
  ) {}

  registerAnimatableObject(animatableObject: AnimatableObject) {
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
    isometricView: IsometricView
  ) {
    this.animatableObjects.forEach((animatableObject) => {
      if (animatableObject instanceof AnimatableIsometricObject) {
        animatableObject.render(isometricView);
      } else {
        animatableObject.render(context);
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
