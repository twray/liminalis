const { math } = require('canvas-sketch-util');
const easing = require('easing-utils');

import AnimatableIsometricObject from "./AnimatableIsometricObject";
import IsometricViewTileFaceType from "./IsometricViewTileFaceType";

class ShootingKey extends AnimatableIsometricObject {
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
      attackValue,
      isVisible,
      timeFirstShown,
    } = this;
    
    const { lerp } = math;
    const { easeOutBack, easeInOutBack } = easing;

    const decayFactor = this.getDecayFactor();
    const timeSinceFirstShown = this.getMsSince(timeFirstShown);

    const translateXAnimationFactor = timeSinceFirstShown / 2;

    const keyInAnimationTrajectory = this.getAnimationTrajectory(
      1000,
      0,
      false,
      easeOutBack,
    );

    const keyInAnimationIntensity = lerp(0, 200, attackValue);

    if (isVisible || decayFactor) {            
      isometricView.addTileAt({
        isoX,
        isoY,
        isoZ,
        type: IsometricViewTileFaceType.BASE,
        fill,
        stroke,
        width: Math.floor(lerp(0, 8, attackValue)),
        height: 1,
        opacity: decayFactor,
        translateX: translateXAnimationFactor,
        translateZ: -keyInAnimationIntensity + (keyInAnimationIntensity * keyInAnimationTrajectory),
      });
    } else {
      this.hasDecayed = true;
    }

    return this;
  }
}

export default ShootingKey;