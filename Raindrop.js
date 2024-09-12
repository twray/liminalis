const { math } = require('canvas-sketch-util');

import AnimatableObject from './AnimatableObject';

class Raindrop extends AnimatableObject {
  constructor({ cx, cy, width, height }) {
    super();
    
    this.cx = cx;
    this.cy = cy;
    this.width = width;
    this.height = height;

    return this;
  }

  render(context) {
    const {
      cx,
      cy, 
      width, 
      height,
      attackValue,
      isVisible, 
      timeFirstShown,
    } = this;
    
    const msSinceFirstShown = this.getMsSince(timeFirstShown);
    const decayFactor = this.getDecayFactor();

    const fallFactor = (msSinceFirstShown / 2) * (1 - attackValue);

    if (isVisible || decayFactor) {
      const renderedOpacity = isVisible ? 1 : decayFactor;

      context.fillStyle = `rgba(255, 255, 255, ${renderedOpacity})`;
      context.strokeStyle = `rgba(255, 255, 255, 1.0)`;
      context.lineWidth = 1;

      context.save();

      context.translate(cx, cy);
      context.rotate(math.degToRad(25));

      context.beginPath();
      context.roundRect(-(width / 2), -(height / 2) + fallFactor, width, height, width / 2);
      context.fill();

      context.restore();
    } else {
      this.hasDecayed = true;
    }

    return this;
  }
}

export default Raindrop;