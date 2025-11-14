import { NormalizedFloat } from "../types";
import { toNormalizedFloat } from "../util";

interface RenderParams<TProps, TRenderContext = CanvasRenderingContext2D> {
  props: TProps;
  context: TRenderContext;
  attackValue: NormalizedFloat;
  decayFactor: NormalizedFloat;
  getAnimationTrajectory: (
    duration: number,
    delay: number,
    fromEnd: boolean,
    easingFunction: ((t: number) => number) | null
  ) => number;
}

class AnimatableObject<TProps = {}, TRenderContext = CanvasRenderingContext2D> {
  public attackValue: NormalizedFloat = toNormalizedFloat(0);
  public sustainPeriod: number = 0;
  public decayPeriod: number = 0;
  public isPersisting: boolean = false;
  public wasVisible: boolean = false;
  public hasDecayed: boolean = false;
  public timeFirstShown: Date | null = null;
  public timeShown: Date | null = null;
  public timeHidden: Date | null = null;

  public renderer: (params: RenderParams<TProps, TRenderContext>) => void =
    () => {};
  public props: TProps = {} as TProps;
  public isPermanent: boolean = false;

  constructor() {}

  withRenderer(
    renderer: (params: RenderParams<TProps, TRenderContext>) => void
  ) {
    this.renderer = renderer;
    return this;
  }

  withProps(props: TProps) {
    this.props = props;
    return this;
  }

  setIsPermanent(isPermanent: boolean) {
    this.isPermanent = isPermanent;
    return this;
  }

  renderIn(context: TRenderContext): this {
    const { props, attackValue, decayFactor } = this;

    this.renderer({
      props,
      context,
      attackValue,
      decayFactor,
      getAnimationTrajectory: this.getAnimationTrajectory.bind(this),
    });

    return this;
  }

  attack(attackValue: NormalizedFloat): this {
    this.attackValue = attackValue;
    this.isPersisting = true;
    this.wasVisible = true;
    this.hasDecayed = false;
    this.timeShown = new Date();

    if (this.timeFirstShown === null) {
      this.timeFirstShown = this.timeShown;
    }

    return this;
  }

  sustain(duration: number) {
    this.sustainPeriod += duration;

    return this;
  }

  decay(decayPeriod: number = 1000): this {
    if (this.isPersisting) {
      this.decayPeriod = decayPeriod;
      this.isPersisting = false;
      this.timeHidden = new Date();
    }

    return this;
  }

  getMsSince(time: Date | null): number {
    return time && time instanceof Date
      ? new Date().getTime() - time.getTime()
      : 0;
  }

  get decayFactor(): NormalizedFloat {
    const { decayPeriod, timeHidden, isPersisting, sustainPeriod } = this;
    const msSinceHidden = this.getMsSince(timeHidden);

    if (isPersisting || msSinceHidden < sustainPeriod) {
      return toNormalizedFloat(1);
    } else {
      return msSinceHidden < decayPeriod + sustainPeriod
        ? toNormalizedFloat(
            1 - msSinceHidden / decayPeriod + sustainPeriod / decayPeriod
          )
        : toNormalizedFloat(0);
    }
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
