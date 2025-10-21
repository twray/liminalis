import { random } from "canvas-sketch-util";
import AnimatableObject from "./AnimatableObject.js";

interface BarcodeStripeParams {
  x: number;
  y: number;
  width: number;
  height: number;
  widthVarianceFactor?: number;
}

class BarcodeStripe extends AnimatableObject<CanvasRenderingContext2D> {
  public x: number;
  public y: number;
  public width: number;
  public height: number;
  public widthVarianceFactor: number;

  constructor({
    x,
    y,
    width,
    height,
    widthVarianceFactor = 1,
  }: BarcodeStripeParams) {
    super();

    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.widthVarianceFactor = widthVarianceFactor;
  }

  render(context: CanvasRenderingContext2D): void {
    const { x, width, height, widthVarianceFactor, attackValue, isVisible } =
      this;

    const decayFactor: number = this.getDecayFactor();

    if (isVisible || decayFactor) {
      const renderedOpacity: number = isVisible ? 1 : decayFactor;

      context.fillStyle = `rgba(255, 255, 255, ${renderedOpacity})`;
      context.save();

      for (
        let i = 0;
        i < height;
        i += random.rangeFloor(10, (1 - decayFactor) * 100 + 10)
      ) {
        context.beginPath();
        context.rect(x + (1 - decayFactor) * 10, i, width * attackValue, 2);
        context.fill();
      }

      context.restore();
    } else {
      this.hasDecayed = true;
    }
  }
}

export default BarcodeStripe;
