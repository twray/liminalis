import { math } from "canvas-sketch-util";
import * as easing from "easing-utils";
import AnimatableIsometricObject from "./AnimatableIsometricObject.js";
import IsometricViewTileFaceType from "./IsometricViewTileFaceType.js";
import IsometricView from "./IsometricView.js";

interface ShootingKeyParams {
  isoX: number;
  isoY: number;
  isoZ: number;
  fill: string;
  stroke: string;
}

class ShootingKey extends AnimatableIsometricObject {
  public isoX: number;
  public isoY: number;
  public isoZ: number;
  public fill: string;
  public stroke: string;

  constructor({ isoX, isoY, isoZ, fill, stroke }: ShootingKeyParams) {
    super();

    this.isoX = isoX;
    this.isoY = isoY;
    this.isoZ = isoZ;
    this.fill = fill;
    this.stroke = stroke;
  }

  render(isometricView: IsometricView): void {
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

    const decayFactor: number | null = this.getDecayFactor();
    const timeSinceFirstShown: number = this.getMsSince(timeFirstShown);

    const translateXAnimationFactor: number = timeSinceFirstShown / 2;

    const keyInAnimationTrajectory: number = this.getAnimationTrajectory(
      1000,
      0,
      false,
      easeOutBack
    );

    const keyInAnimationIntensity: number = lerp(0, 200, attackValue);

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
        opacity: decayFactor || 1,
        translateX: translateXAnimationFactor,
        translateZ:
          -keyInAnimationIntensity +
          keyInAnimationIntensity * keyInAnimationTrajectory,
      });
    } else {
      this.hasDecayed = true;
    }
  }
}

export default ShootingKey;
