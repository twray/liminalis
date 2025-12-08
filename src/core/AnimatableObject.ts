import { NormalizedFloat, Point2D } from "../types";
import { toNormalizedFloat } from "../util";
import { ContextPrimitives, getContextPrimitives } from "./contextPrimitives";

type AnimatableObjectStatus = "idle" | "sustained" | "releasing";

interface RenderParams<TProps, TRenderContext = CanvasRenderingContext2D> {
  props: TProps;
  context: TRenderContext;
  width: number;
  height: number;
  center: Point2D;
  status: AnimatableObjectStatus;
  attackValue: NormalizedFloat;
  releaseFactor: NormalizedFloat;
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
  anchor?: "render" | "attack" | "release" | "end";
  reverse?: boolean;
}

class AnimatableObject<TProps = {}, TRenderContext = CanvasRenderingContext2D> {
  public attackValue: NormalizedFloat = toNormalizedFloat(0);
  public sustainPeriod: number = 0;
  public releasePeriod: number = 0;
  public isSustaining: boolean = false;
  public isReleasing: boolean = false;
  public markedForRemoval: boolean = false;

  public timeFirstRender: Date | null = null;
  public timeAttacked: Date | null = null;
  public timeReleased: Date | null = null;

  public isPermanent: boolean = false;

  public props: TProps = {} as TProps;

  public renderer: (
    params: RenderParamsWithPrimitives<TProps, TRenderContext>
  ) => void = () => {};

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
    this.timeFirstRender = new Date();
    return this;
  }

  renderIn(context: TRenderContext, width: number, height: number): this {
    const { props, attackValue, releaseFactor, isSustaining, isReleasing } =
      this;

    const center = { x: width / 2, y: height / 2 };

    let status: AnimatableObjectStatus = "idle";
    if (isSustaining) status = "sustained";
    if (isReleasing) status = "releasing";

    const baseParams = {
      props,
      context,
      width,
      height,
      center,
      status,
      attackValue,
      releaseFactor,
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
    this.isSustaining = true;
    this.isReleasing = false;
    this.timeAttacked = new Date();

    return this;
  }

  sustain(duration: number) {
    this.sustainPeriod = duration;
    return this;
  }

  release(releasePeriod: number = 1000): this {
    if (this.isSustaining) {
      this.releasePeriod = releasePeriod;
      this.isSustaining = false;
      this.isReleasing = true;
      this.timeReleased = new Date();
    }

    return this;
  }

  getMsSince(time: Date | null): number {
    return time && time instanceof Date
      ? new Date().getTime() - time.getTime()
      : 0;
  }

  get releaseFactor(): NormalizedFloat {
    const { releasePeriod, timeReleased, isSustaining, sustainPeriod } = this;
    const msSinceReleased = this.getMsSince(timeReleased);

    if (isSustaining || msSinceReleased < sustainPeriod) {
      return toNormalizedFloat(1);
    } else {
      return msSinceReleased < releasePeriod + sustainPeriod
        ? toNormalizedFloat(
            1 - msSinceReleased / releasePeriod + sustainPeriod / releasePeriod
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
      anchor = "attack",
      reverse = false,
    } = options;

    const { timeFirstRender, timeAttacked, timeReleased, releasePeriod } = this;

    let startTime;

    switch (anchor) {
      case "render":
        startTime = this.getMsSince(timeFirstRender);
        break;
      case "release":
        startTime = this.getMsSince(timeReleased);
        break;
      default:
      case "attack":
        startTime = this.getMsSince(timeAttacked);
        break;
    }

    this.getMsSince(timeAttacked);

    // If duration is 0 or negative, then set it as
    // so it appears instantaneous
    const validatedDuration = duration > 0 ? duration : 1;

    const computedDelay =
      anchor === "end" ? releasePeriod - validatedDuration - delay : delay;

    let progress =
      startTime > computedDelay
        ? 1 -
          Math.max(0, validatedDuration - startTime + computedDelay) /
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
