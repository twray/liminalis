import AnimatableIsometricObject from "../animatable/AnimatableIsometricObject";
import AnimatableObject from "../animatable/AnimatableObject";
import IsometricView from "../views/IsometricView";

type AnyAnimatableObject = AnimatableObject<any>;

class AnimatableObjectManager {
  public idsOfAllAnimatableObjectsCreated: string[] = [];
  public animatableObjects: Map<string, AnyAnimatableObject> = new Map();

  constructor(public maxAnimatableObjects: number = 1000) {}

  getObject(id: string): AnyAnimatableObject | undefined {
    if (
      !this.animatableObjects.has(id) &&
      this.idsOfAllAnimatableObjectsCreated.includes(id)
    ) {
      console.warn(
        `AnimatableObject with id "${id}" was requested but is not currently registered.` +
          ` It may have been removed from the visualisation already because objects are` +
          ` removed automatically when they decay. If you wish to access this object again,` +
          ` after it decays, call its setIsPermanent(true) method when creating it.`
      );
    }

    return this.animatableObjects.get(id);
  }

  registerAnimatableObject(id: string, animatableObject: AnyAnimatableObject) {
    const { maxAnimatableObjects } = this;

    this.animatableObjects.set(id, animatableObject);
    this.idsOfAllAnimatableObjectsCreated.push(id);

    if (this.animatableObjects.size > maxAnimatableObjects) {
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
      } else if (animatableObject.wasVisible) {
        animatableObject.hasDecayed = true;
      }
    });
  }

  cleanupDecayedObjects() {
    this.animatableObjects.forEach((animatableObject, id) => {
      if (!animatableObject.isPermanent && animatableObject.hasDecayed) {
        this.animatableObjects.delete(id);
      }
    });
  }
}

export default AnimatableObjectManager;
