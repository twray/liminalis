import { color } from "canvas-sketch-util";
import IsometricView from "../views/IsometricView.js";
import IsometricViewTileFaceType from "../views/IsometricViewTileFaceType.js";
import AnimatableIsometricObject from "./AnimatableIsometricObject.js";

interface BoxCoilParams {
  isoX: number;
  isoY: number;
  isoZ: number;
  fill: string;
  stroke: string;
}

class BoxCoil extends AnimatableIsometricObject {
  public isoX: number;
  public isoY: number;
  public isoZ: number;
  public fill: string;
  public stroke: string;

  constructor({ isoX, isoY, isoZ, fill, stroke }: BoxCoilParams) {
    super();

    this.isoX = isoX;
    this.isoY = isoY;
    this.isoZ = isoZ;
    this.fill = fill;
    this.stroke = stroke;
  }

  renderIn(isometricView: IsometricView): this {
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

    const { parse } = color;

    const decayFactor: number | null = this.getDecayFactor();
    const timeSinceFirstShown: number = this.getMsSince(timeFirstShown);

    const fadeOutStrokeAnimationDuration: number = decayPeriod;

    const strokeFadeOutAnimationTrajectory: number =
      this.getAnimationTrajectory(fadeOutStrokeAnimationDuration, 0, true);

    let computedStrokeColor: string;

    const strokeAsParsedRGB = parse(stroke).rgb;
    const [r, g, b] = strokeAsParsedRGB;
    const strokeOpacity: number = 1 - strokeFadeOutAnimationTrajectory;

    computedStrokeColor = `rgba(${r}, ${g}, ${b}, ${strokeOpacity})`;

    const translateXAnimationFactor: number = timeSinceFirstShown / 3;

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
        opacity: decayFactor || 1,
        translateX: translateXAnimationFactor * attackValue,
      });
    } else {
      this.hasDecayed = true;
    }

    return this;
  }
}

export default BoxCoil;
