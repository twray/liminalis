const { math, color } = require('canvas-sketch-util');
const easing = require('easing-utils');

import AnimatableIsometricObject from "./AnimatableIsometricObject";
import IsometricViewTileFaceType from "./IsometricViewTileFaceType";

class BoxCoil extends AnimatableIsometricObject {
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
      decayPeriod,
      isVisible,
      timeFirstShown,
    } = this;
    
    const { lerp } = math;
    const { parse } = color;
    const { easeOutBack, easeInOutBack } = easing;

    const decayFactor = this.getDecayFactor();
    const timeSinceFirstShown = this.getMsSince(timeFirstShown);
    
    const fadeOutStrokeAnimationDuration = decayPeriod;
    const scaleAnimationDuration = decayPeriod;

    const strokeFadeOutAnimationTrajectory = this.getAnimationTrajectory(
      fadeOutStrokeAnimationDuration,
      0,
      true,
    );
    
    let computedStrokeColor;

    const strokeAsParsedRGB = parse(stroke).rgb;
    const [ r, g, b ] = strokeAsParsedRGB;
    const strokeOpacity = 1 - strokeFadeOutAnimationTrajectory;

    computedStrokeColor = `rgba(${r}, ${g}, ${b}, ${strokeOpacity})`;
    
    const translateXAnimationFactor = timeSinceFirstShown / 3;

    const scaleAnimationTrajectory = this.getAnimationTrajectory(
      scaleAnimationDuration,
      0,
      true,
    );

    const scaleFactor = scaleAnimationTrajectory;

    if (isVisible || decayFactor) {            
      isometricView.addTileAt({
        isoX,
        isoY,
        isoZ,
        type: IsometricViewTileFaceType.SIDE_LEFT,
        fill,
        stroke: computedStrokeColor,
        width: 8,
        height: 8,
        opacity: decayFactor,
        translateX: translateXAnimationFactor * attackValue,
        // scale: scaleFactor,
      });
    } else {
      this.hasDecayed = true;
    }

    return this;
  }
}

export default BoxCoil;