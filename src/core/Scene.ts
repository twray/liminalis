import Visual from "./Visual";

type AnySceneObject = Visual<any>;

class Scene {
  public sceneObjects: Set<AnySceneObject> = new Set();
  public sceneObjectsByKey: Map<string, AnySceneObject> = new Map();

  public keysOfAllSceneObjectsCreated: string[] = [];

  constructor(public maxSceneObjects: number = 1000) {}

  add(sceneObject: AnySceneObject) {
    this.registerSceneObject(sceneObject);
    return sceneObject;
  }

  addPermanently(sceneObject: AnySceneObject) {
    sceneObject.setIsPermanent(true);
    return this.add(sceneObject);
  }

  addWithKey(key: string, sceneObject: AnySceneObject) {
    const clonedObject = sceneObject.clone();

    this.removeByKey(key);
    this.sceneObjectsByKey.set(key, clonedObject);
    this.keysOfAllSceneObjectsCreated.push(key);

    this.registerSceneObject(clonedObject);

    return clonedObject;
  }

  addPermanentlyWithKey(key: string, sceneObject: AnySceneObject) {
    const clonedObject = this.addWithKey(key, sceneObject);
    clonedObject.setIsPermanent(true);
    return clonedObject;
  }

  getByKey(key: string): AnySceneObject | undefined {
    if (
      !this.sceneObjectsByKey.has(key) &&
      this.keysOfAllSceneObjectsCreated.includes(key)
    ) {
      console.warn(
        `object with key "${key}" was requested but is not currently registered.` +
          ` It may have been removed from the scene already because objects are` +
          ` removed automatically when they are release. If you wish to access this object again,` +
          ` after it is released, call addPermanentlyWithKey() or setIsPermanent(true).`,
      );
    }

    return this.sceneObjectsByKey.get(key);
  }

  has(sceneObject: AnySceneObject) {
    return this.sceneObjects.has(sceneObject);
  }

  hasKey(key: string) {
    return this.sceneObjectsByKey.has(key);
  }

  remove(sceneObject: AnySceneObject) {
    this.sceneObjects.delete(sceneObject);

    this.sceneObjectsByKey.forEach((objectForKey, key) => {
      if (objectForKey === sceneObject) {
        this.sceneObjectsByKey.delete(key);
      }
    });

    return sceneObject;
  }

  removeByKey(key: string) {
    const sceneObject = this.sceneObjectsByKey.get(key);

    if (!sceneObject) {
      return undefined;
    }

    this.sceneObjectsByKey.delete(key);
    this.sceneObjects.delete(sceneObject);

    return sceneObject;
  }

  renderObjects(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ) {
    if (!context) {
      throw new Error(
        "A CanvasRenderingContext2D instance must be provided to render scene objects." +
          "When calling the renderObjects() method on a scene instance, please ensure" +
          "that you pass in a valid canvas context as an argument.",
      );
    }

    this.sceneObjects.forEach((sceneObject) => {
      const {
        releaseFactor,
        isPermanent,
        isReleasing: hasBeenReleased,
      } = sceneObject;

      if (releaseFactor === 0) {
        sceneObject.isReleasing = false;
      }

      if (releaseFactor > 0 || isPermanent) {
        sceneObject.renderIn(context, width, height, timeInMs);
      } else if (hasBeenReleased) {
        sceneObject.markedForRemoval = true;
      }
    });
  }

  cleanUp() {
    this.sceneObjects.forEach((sceneObject) => {
      if (!sceneObject.isPermanent && sceneObject.markedForRemoval) {
        this.remove(sceneObject);
      }
    });
  }

  private registerSceneObject(sceneObject: AnySceneObject) {
    const { maxSceneObjects } = this;

    this.sceneObjects.add(sceneObject);

    if (this.sceneObjects.size > maxSceneObjects) {
      console.warn(
        `Warning: Over ${maxSceneObjects} are registered. ` +
          `Check that your objects are releasing and being cleaned up correctly ` +
          `or increase the maximum number of allowed scene objects.`,
      );
    }
  }
}

export default Scene;
