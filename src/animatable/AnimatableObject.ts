import { createNormalizedFloat, NormalizedFloat } from "../types";

export interface AnimatableObjectOptions<
  TProps,
  TRenderContext = CanvasRenderingContext2D
> {
  props: TProps;
  render: (params: RenderParams<TProps, TRenderContext>) => void;
  isPermanent?: boolean;
}

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

class AnimatableObject<TProps, TRenderContext = CanvasRenderingContext2D> {
  public attackValue: NormalizedFloat = createNormalizedFloat(0);
  public decayPeriod: number = 0;
  public isVisible: boolean = false;
  public wasVisible: boolean = false;
  public hasDecayed: boolean = false;
  public timeFirstShown: Date | null = null;
  public timeShown: Date | null = null;
  public timeHidden: Date | null = null;
  public readonly isPermanent: boolean = false;

  public render: (params: RenderParams<TProps, TRenderContext>) => void =
    () => {};
  public props: TProps;

  constructor(options: AnimatableObjectOptions<TProps, TRenderContext>) {
    const { props, render, isPermanent = false } = options;

    this.props = props;
    this.render = render;
    this.isPermanent = isPermanent;
  }

  renderIn(context: TRenderContext): this {
    const { props, attackValue, decayFactor } = this;
    this.render({
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
    this.isVisible = true;
    this.wasVisible = true;
    this.hasDecayed = false;
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

  get decayFactor(): NormalizedFloat {
    const { decayPeriod, timeHidden, isVisible } = this;
    const msSinceHidden = this.getMsSince(timeHidden);

    if (isVisible) {
      return createNormalizedFloat(1);
    } else {
      return msSinceHidden < decayPeriod
        ? createNormalizedFloat(1 - msSinceHidden / decayPeriod)
        : createNormalizedFloat(0);
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
