import AnimatableIsometricObject from "../core/AnimatableIsometricObject";
import AnimatableObject from "../core/AnimatableObject";
import IsometricView from "../views/IsometricView";

type AnyAnimatableObject = AnimatableObject<any, any>;

class Visualisation {
  public idsOfAllAnimatableObjectsCreated: string[] = [];
  public animatableObjects: Map<string, AnyAnimatableObject> = new Map();

  constructor(public maxAnimatableObjects: number = 1000) {}

  get(id: string): AnyAnimatableObject | undefined {
    if (
      !this.animatableObjects.has(id) &&
      this.idsOfAllAnimatableObjectsCreated.includes(id)
    ) {
      console.warn(
        `object with id "${id}" was requested but is not currently registered.` +
          ` It may have been removed from the visualisation already because objects are` +
          ` removed automatically when they decay. If you wish to access this object again,` +
          ` after it decays, call its setIsPermanent(true) method when creating it.`
      );
    }

    return this.animatableObjects.get(id);
  }

  add(id: string, animatableObject: AnyAnimatableObject) {
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

  renderObjects(context: CanvasRenderingContext2D) {
    if (!context) {
      throw new Error(
        "A CanvasRenderingContext2D instance must be provided to render AnimatableObjects." +
          "When calling the renderObjects() method on a visualisation instance, please ensure" +
          "that you pass in a valid canvas context as an argument."
      );
    }

    const hasIsometricObjects = Array.from(
      this.animatableObjects.values()
    ).some((obj) => obj instanceof AnimatableIsometricObject);

    let isometricView: IsometricView | null = null;

    if (hasIsometricObjects) {
      isometricView = new IsometricView(
        context,
        context.canvas.width,
        context.canvas.height
      );
    }

    this.animatableObjects.forEach((animatableObject) => {
      const { isPersisting, decayFactor, wasVisible } = animatableObject;

      if (isPersisting || decayFactor > 0) {
        if (
          isometricView &&
          animatableObject instanceof AnimatableIsometricObject
        ) {
          animatableObject.renderIn(isometricView);
        } else {
          animatableObject.renderIn(context);
        }
      } else if (wasVisible) {
        animatableObject.hasDecayed = true;
      }
    });

    if (isometricView) {
      isometricView.render();
    }
  }

  cleanUp() {
    this.animatableObjects.forEach((animatableObject, id) => {
      if (!animatableObject.isPermanent && animatableObject.hasDecayed) {
        this.animatableObjects.delete(id);
      }
    });
  }
}

export default Visualisation;
