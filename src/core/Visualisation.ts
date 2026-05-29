import BaseVisual from "./BaseVisual";

type AnyVisualObject = BaseVisual<any, any>;

class Visualisation {
  public idsOfAllAnimatableObjectsCreated: string[] = [];
  public animatableObjects: Map<string, AnyVisualObject> = new Map();

  constructor(public maxAnimatableObjects: number = 1000) {}

  get<TVisual extends AnyVisualObject = AnyVisualObject>(
    id: string,
  ): TVisual | undefined {
    if (
      !this.animatableObjects.has(id) &&
      this.idsOfAllAnimatableObjectsCreated.includes(id)
    ) {
      console.warn(
        `object with id "${id}" was requested but is not currently registered.` +
          ` It may have been removed from the visualisation already because objects are` +
          ` removed automatically when they finish their lifecycle. If you wish to access this` +
          ` object again after it completes, call its setIsPermanent(true) method when creating it.`,
      );
    }

    return this.animatableObjects.get(id) as TVisual | undefined;
  }

  add(id: string, animatableObject: AnyVisualObject) {
    const { maxAnimatableObjects } = this;

    this.animatableObjects.set(id, animatableObject);
    this.idsOfAllAnimatableObjectsCreated.push(id);

    if (this.animatableObjects.size > maxAnimatableObjects) {
      console.warn(
        `Warning: Over ${maxAnimatableObjects} are registered. ` +
          `Check that your objects are releasing and being cleaned up correctly ` +
          `or increase the maximum number of allowed animatable objects.`,
      );
    }

    return animatableObject;
  }

  addPermanently(id: string, animatableObject: AnyVisualObject) {
    animatableObject.setIsPermanent(true);
    return this.add(id, animatableObject);
  }

  renderObjects(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ) {
    if (!context) {
      throw new Error(
        "A CanvasRenderingContext2D instance must be provided to render visual objects." +
          "When calling the renderObjects() method on a visualisation instance, please ensure" +
          "that you pass in a valid canvas context as an argument.",
      );
    }

    this.animatableObjects.forEach((animatableObject) => {
      if (animatableObject.shouldRender()) {
        animatableObject.renderIn(context, width, height, timeInMs);
      } else if (animatableObject.shouldMarkForRemoval()) {
        animatableObject.markedForRemoval = true;
      }
    });
  }

  cleanUp() {
    this.animatableObjects.forEach((animatableObject, id) => {
      if (!animatableObject.isPermanent && animatableObject.markedForRemoval) {
        this.animatableObjects.delete(id);
      }
    });
  }
}

export default Visualisation;
