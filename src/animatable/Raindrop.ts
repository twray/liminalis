import { math } from "canvas-sketch-util";
import AnimatableObject from "./AnimatableObject.js";

interface RaindropParams {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

class Raindrop extends AnimatableObject {
  public cx: number;
  public cy: number;
  public width: number;
  public height: number;

  constructor({ cx, cy, width, height }: RaindropParams) {
    super();

    this.cx = cx;
    this.cy = cy;
    this.width = width;
    this.height = height;
  }

  renderIn(context: CanvasRenderingContext2D): this {
    const { cx, cy, width, height, attackValue, isVisible, timeFirstShown } =
      this;

    const msSinceFirstShown: number = this.getMsSince(timeFirstShown);
    const decayFactor: number = this.getDecayFactor();

    const fallFactor: number = (msSinceFirstShown / 2) * (1 - attackValue);

    if (isVisible || decayFactor) {
      const renderedOpacity: number = isVisible ? 1 : decayFactor;

      context.fillStyle = `rgba(255, 255, 255, ${renderedOpacity})`;
      context.strokeStyle = `rgba(255, 255, 255, 1.0)`;
      context.lineWidth = 1;

      context.save();

      context.translate(cx, cy);
      context.rotate(math.degToRad(25));

      context.beginPath();
      context.roundRect(
        -(width / 2),
        -(height / 2) + fallFactor,
        width,
        height,
        width / 2
      );
      context.fill();

      context.restore();
    } else {
      this.hasDecayed = true;
    }

    return this;
  }
}

export default Raindrop;
