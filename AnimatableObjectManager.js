import AnimatableIsometricObject from "./AnimatableIsometricObject";

class AnimatableObjectManager {
  constructor(maxAnimatableObjects = 1000) {
    this.animatableObjects = [];
    this.maxAnimatableObjects = maxAnimatableObjects;
  }

  registerAnimatableObject(animatableObject) {
    const { maxAnimatableObjects } = this;
    
    this.animatableObjects.push(animatableObject);

    if (this.animatableObjects.length > maxAnimatableObjects) {
      console.warn(
        `Warning: Over ${maxAnimatableObjects} are registered. ` +
        `Check that your objects are decaying and being cleaned up correctly `
        `or increase the maximum number of allowed animatable objects.`
      );
    }
  }

  renderAnimatableObjects(context, isometricView) {
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