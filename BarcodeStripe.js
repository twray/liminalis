const { random } = require('canvas-sketch-util');

import AnimatableObject from './AnimatableObject';

class BarcodeStripe extends AnimatableObject {
  constructor({ x, y, width, height, widthVarianceFactor = 1 }) {
    super();
    
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.widthVarianceFactor = widthVarianceFactor;

    return this;
  }

  render(context) {
    const {
      x,
      width,
      height,
      widthVarianceFactor, 
      attackValue,
      isVisible
    } = this;
    
    const decayFactor = this.getDecayFactor();

    if (isVisible || decayFactor) {
      const renderedOpacity = isVisible ? 1 : decayFactor;

      context.fillStyle = `rgba(255, 255, 255, ${renderedOpacity})`;

      context.save();
      
      for (
        let i = 0; i < height;
        i += random.rangeFloor(10, ((1 - decayFactor) * 100) + 10)
      ) {
        context.beginPath();

        context.rect(
          x +  ((1 - decayFactor) * 10),
          i, 
          width * attackValue,
          2,
        );

        context.fill();
      }

      context.restore();
    } else {
      this.hasDecayed = true;
    }

    return this;
  }
}

export default BarcodeStripe;