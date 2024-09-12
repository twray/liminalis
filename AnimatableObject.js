class AnimatableObject {
  constructor() {    
    this.attackValue = 0;
    this.decayPeriod = 0;
    this.isVisible = false;
    this.hasDecayed = false;

    this.timeFirstShown = null;
    this.timeShown =  null;
    this.timeHidden = null;

    return this;
  }

  show(attackValue) {
    this.attackValue = attackValue;
    this.isVisible = true;
    this.timeShown = new Date();

    if (this.timeFirstShown === null) {
      this.timeFirstShown = this.timeShown;
    }

    return this;
  }

  hide(decayPeriod = 1000) {
    if (this.isVisible) {
      this.decayPeriod = decayPeriod;
      this.isVisible = false;
      this.timeHidden = new Date();
    }

    return this;
  }

  getMsSince(time) {
    return time && time instanceof Date 
      ? new Date().getTime() - time.getTime() 
      : null;
  }

  getDecayFactor() {
    const { decayPeriod, timeHidden } = this;

    const msSinceHidden = this.getMsSince(timeHidden);

    return msSinceHidden !== null && msSinceHidden < decayPeriod
      ? 1 - (msSinceHidden / decayPeriod)
      : null;
  }

  getAnimationTrajectory(
    duration,
    delay = 0, 
    fromEnd = false,
    easingFunction = null
  ) {
    const { timeFirstShown, decayPeriod } = this;
    
    const timeSinceFirstShown = this.getMsSince(timeFirstShown);
    const computedDelay = fromEnd ? decayPeriod - duration - delay : delay;

    const animationTrajectory = timeSinceFirstShown > computedDelay
      ? 1 - (Math.max(0, duration - timeSinceFirstShown + computedDelay) / duration)
      : 0;

    return typeof easingFunction === 'function' 
      ? easingFunction(animationTrajectory)
      : animationTrajectory;
  }
}

export default AnimatableObject;