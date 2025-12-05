import { NormalizedFloat, Point2D } from "../types";
import { toNormalizedFloat } from "../util";
import { ContextPrimitives, getContextPrimitives } from "./contextPrimitives";

interface RenderParams<TProps, TRenderContext = CanvasRenderingContext2D> {
  props: TProps;
  context: TRenderContext;
  width: number;
  height: number;
  center: Point2D;
  attackValue: NormalizedFloat;
  decayFactor: NormalizedFloat;
  animate: (options: AnimationOptions) => number;
}

type RenderParamsWithPrimitives<TProps, TRenderContext> =
  TRenderContext extends CanvasRenderingContext2D
    ? RenderParams<TProps, TRenderContext> & ContextPrimitives
    : RenderParams<TProps, TRenderContext>;

interface AnimationOptions {
  duration: number;
  delay?: number;
  from?: number;
  to?: number;
  easing?: ((t: number) => number) | null;
  anchor?: "start" | "end";
  reverse?: boolean;
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

  public renderer: (
    params: RenderParamsWithPrimitives<TProps, TRenderContext>
  ) => void = () => {};
  public props: TProps = {} as TProps;
  public isPermanent: boolean = false;

  constructor() {}

  withRenderer(
    renderer: (
      params: RenderParamsWithPrimitives<TProps, TRenderContext>
    ) => void
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

  renderIn(context: TRenderContext, width: number, height: number): this {
    const { props, attackValue, decayFactor } = this;

    const center = { x: width / 2, y: height / 2 };

    const baseParams = {
      props,
      context,
      width,
      height,
      center,
      attackValue,
      decayFactor,
      animate: this.animate.bind(this),
    };

    const params =
      context instanceof CanvasRenderingContext2D
        ? { ...baseParams, ...getContextPrimitives(context) }
        : baseParams;

    this.renderer(params as RenderParamsWithPrimitives<TProps, TRenderContext>);

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

  animate(options: AnimationOptions): number {
    const {
      duration,
      delay = 0,
      from = 0,
      to = 1,
      easing = null,
      anchor = "start",
      reverse = false,
    } = options;

    const { timeShown, decayPeriod } = this;
    const timeSinceShown = this.getMsSince(timeShown);

    // If duration is 0 or negative, then set it as 1 so it appears
    // instantaneous
    const validatedDuration = duration > 0 ? duration : 1;

    const computedDelay =
      anchor === "end" ? decayPeriod - validatedDuration - delay : delay;

    let progress =
      timeSinceShown > computedDelay
        ? 1 -
          Math.max(0, validatedDuration - timeSinceShown + computedDelay) /
            validatedDuration
        : 0;

    if (typeof easing === "function") {
      progress = easing(progress);
    }

    if (reverse) {
      progress = 1 - progress;
    }

    return from + (to - from) * progress;
  }
}

export default AnimatableObject;
