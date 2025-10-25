import { color } from "canvas-sketch-util";
import { easeInCubic } from "easing-utils";
import AnimatableObject from "./AnimatableObject";

interface SpringRectangleParams {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}

class SpringRectangle extends AnimatableObject<CanvasRenderingContext2D> {
  public x: number;
  public y: number;
  public width: number;
  public height: number;
  public fill: string;

  constructor({ x, y, width, height, fill = "#000" }: SpringRectangleParams) {
    super();

    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.fill = fill;
  }

  renderIn(context: CanvasRenderingContext2D): this {
    const { x, y, width, height, fill, isVisible, attackValue } = this;

    const decayFactor: number = this.getDecayFactor();
    const easedDecayFactor = easeInCubic(decayFactor);

    if (isVisible || decayFactor) {
      const [r, g, b] = color.parse(fill).rgb;

      const fillWithAlpha = `rgba(${r}, ${g}, ${b}, ${easedDecayFactor})`;
      const renderedHeight = attackValue * height * easedDecayFactor;
      const yOffset = height - renderedHeight;

      context.save();
      context.fillStyle = fillWithAlpha;
      context.fillRect(x, y + yOffset, width, renderedHeight);
      context.restore();
    } else {
      this.hasDecayed = true;
    }

    return this;
  }
}

export default SpringRectangle;
