import { NormalizedFloat } from "../types";

abstract class AnimatableObject<TRenderTarget = CanvasRenderingContext2D> {
  public attackValue: number = 0;
  public decayPeriod: number = 0;
  public isVisible: boolean = false;
  public hasDecayed: boolean = false;
  public timeFirstShown: Date | null = null;
  public timeShown: Date | null = null;
  public timeHidden: Date | null = null;

  constructor() {}

  abstract renderIn(target: TRenderTarget): this;

  attack(attackValue: NormalizedFloat): this {
    this.attackValue = attackValue;
    this.isVisible = true;
    this.timeShown = new Date();

    if (this.timeFirstShown === null) {
      this.timeFirstShown = this.timeShown;
    }

    return this;
  }

  decay(decayPeriod: number = 1000): this {
    if (this.isVisible) {
      this.decayPeriod = decayPeriod;
      this.isVisible = false;
      this.timeHidden = new Date();
    }

    return this;
  }

  getMsSince(time: Date | null): number {
    return time && time instanceof Date
      ? new Date().getTime() - time.getTime()
      : 0;
  }

  getDecayFactor(): number {
    const { decayPeriod, timeHidden } = this;
    const msSinceHidden = this.getMsSince(timeHidden);

    return msSinceHidden !== null && msSinceHidden < decayPeriod
      ? 1 - msSinceHidden / decayPeriod
      : 0;
  }

  getAnimationTrajectory(
    duration: number,
    delay: number = 0,
    fromEnd: boolean = false,
    easingFunction: ((t: number) => number) | null = null
  ): number {
    const { timeFirstShown, decayPeriod } = this;
    const timeSinceFirstShown = this.getMsSince(timeFirstShown);
    const computedDelay = fromEnd ? decayPeriod - duration - delay : delay;

    const animationTrajectory =
      timeSinceFirstShown > computedDelay
        ? 1 -
          Math.max(0, duration - timeSinceFirstShown + computedDelay) / duration
        : 0;

    return typeof easingFunction === "function"
      ? easingFunction(animationTrajectory)
      : animationTrajectory;
  }
}

export default AnimatableObject;
