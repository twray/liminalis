const easing = require('easing-utils');

import AnimatableIsometricObject from "./AnimatableIsometricObject";
import IsometricViewTileFaceType from "./IsometricViewTileFaceType";

class AnimatableIsometricTile extends AnimatableIsometricObject {
  constructor({ isoX, isoY, isoZ, fill, stroke }) {
    super();

    this.isIsometricObject = true;
    this.isoX = isoX;
    this.isoY = isoY;
    this.isoZ = isoZ;
    this.fill = fill,
    this.stroke = stroke;

    return this;
  }

  render(isometricView) {
    const {
      isoX,
      isoY,
      isoZ,
      fill,
      stroke,
      isVisible,
      timeFirstShown,
      decayPeriod
    } = this;
    const { easeOutQuad } = easing;

    const decayFactor = this.getDecayFactor();
    const timeSinceFirstShown = this.getMsSince(timeFirstShown);
    const subAnimationPeriod = decayPeriod / 2;
    const subAnimationDelay = 100;

    if (isVisible || decayFactor) {      
      for (let i = 0; i < 9; i++) {
        let transformFactor = 1;
        
        const subAnimationStartTime = (i * subAnimationDelay)

        if (timeSinceFirstShown > subAnimationStartTime) {
          const timeElapsedSinceSubAnimationStartTime = timeSinceFirstShown - subAnimationStartTime;
          const subAnimationIndex = timeElapsedSinceSubAnimationStartTime / subAnimationPeriod;
          transformFactor = easeOutQuad(Math.abs((1 - subAnimationIndex) - 0.5));
        }
        
        isometricView.addTileAt({
          isoX: -7 + i,
          isoY: -7,
          isoZ: 0,
          type: IsometricViewTileFaceType.SIDE_LEFT,
          fill,
          stroke,
          width: 7,
          height: 7,
          opacity: transformFactor,
        });
      }
    } else {
      this.hasDecayed = true;
    }

    return this;
  }
}

export default AnimatableIsometricTile;