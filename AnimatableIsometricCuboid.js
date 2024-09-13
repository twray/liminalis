import AnimatableIsometricObject from "./AnimatableIsometricObject";

const { color, math } = require('canvas-sketch-util');
const easing = require('easing-utils');

class AnimatableIsometricCuboid extends AnimatableIsometricObject {
  constructor({
    isoX,
    isoY,
    isoZ,
    lengthX,
    lengthY,
    lengthZ,
    fill,
    stroke,
  }) {
    super();

    this.isIsometricObject = true;
    this.isoX = isoX;
    this.isoY = isoY;
    this.isoZ = isoZ;
    this.lengthX = lengthX;
    this.lengthY = lengthY;
    this.lengthZ = lengthZ;
    this.fill = fill;
    this.stroke = stroke;

    return this;
  }

  render(isometricView) {
    const { 
      isoX, 
      isoY,
      isoZ,
      lengthX, 
      lengthY, 
      lengthZ, 
      fill,
      stroke,
      isVisible,
      attackValue,
      decayPeriod,
      timeFirstShown,
    } = this;

    const { easeInQuad, easeOutBack } = easing;
    const { clamp01 } = math;
    const { parse } = color;

    const decayFactor = this.getDecayFactor();
    const timeSinceFirstShown = this.getMsSince(timeFirstShown);

    const fadeOutAnimationDuration = 2000;
    const fadeOutStrokeAnimationDuration = 500;

    const bounceInAnimationTrajectory = this.getAnimationTrajectory(
      1000,
      0,
      false,
      easeOutBack,
    );

    const fadeOutAnimationTrajectory = this.getAnimationTrajectory(
      fadeOutAnimationDuration,
      0,
      true,
      easeOutBack,
    );

    const strokeFadeOutAnimationTrajectory = this.getAnimationTrajectory(
      fadeOutStrokeAnimationDuration,
      0,
      true,
    );
    
    let computedStrokeColor;
    
    if (timeSinceFirstShown > decayPeriod - fadeOutAnimationDuration) {
      const strokeAsParsedRGB = parse(stroke).rgb;
      const [ r, g, b ] = strokeAsParsedRGB;
      const strokeOpacity = 1 - strokeFadeOutAnimationTrajectory;

      computedStrokeColor = `rgba(${r}, ${g}, ${b}, ${strokeOpacity})`;
    } else {
      computedStrokeColor = fill !== 'transparent' ? 'transparent' : stroke;
    }

    const adjustedAttackValue = easeInQuad(attackValue);

    if (isVisible || decayFactor) {      
      isometricView.addCuboidAt({
          isoX,
          isoY,
          isoZ,
          lengthX,
          lengthY,
          lengthZ,
          fill,
          stroke: computedStrokeColor,
          translateZ: (750 * adjustedAttackValue) * (1 - bounceInAnimationTrajectory),
          opacity: 1 - fadeOutAnimationTrajectory,
        });
    } else {
      this.hasDecayed = true;
    }

    return this;
  }
}

export default AnimatableIsometricCuboid;