import { AnimationOptions, NormalizedFloat, Point2D } from "../types";
import { toNormalizedFloat } from "../util";
import { getAnimatedValueForCurrentTime } from "./animation";
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
  timeFirstRender: number | null;
  timeAttacked: number | null;
  timeReleased: number | null;
  animate: (options: AnimationOptions | AnimationOptions[]) => number;
}

type RenderParamsWithPrimitives<TProps, TRenderContext> =
  TRenderContext extends CanvasRenderingContext2D
    ? RenderParams<TProps, TRenderContext> & ContextPrimitives
    : RenderParams<TProps, TRenderContext>;

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

  public timeAttackedSinceFirstRender: number | null = null;
  public timeReleasedSinceFirstRender: number | null = null;

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
    const {
      props,
      attackValue,
      releaseFactor,
      isSustaining,
      isReleasing,
      timeAttackedSinceFirstRender: timeAttacked,
      timeReleasedSinceFirstRender: timeReleased,
    } = this;

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
      timeFirstRender: 0,
      timeAttacked,
      timeReleased,
      animate: (options: AnimationOptions | AnimationOptions[]) =>
        getAnimatedValueForCurrentTime(
          this.getMsSince(this.timeFirstRender),
          options
        ),
    };

    const params =
      context instanceof CanvasRenderingContext2D
        ? { ...baseParams, ...getContextPrimitives(context) }
        : baseParams;

    this.renderer(params as RenderParamsWithPrimitives<TProps, TRenderContext>);

    return this;
  }

  attack(attackValue: NormalizedFloat): this {
    const { timeFirstRender } = this;

    this.attackValue = attackValue;
    this.isSustaining = true;
    this.isReleasing = false;
    this.timeAttacked = new Date();

    if (!this.timeFirstRender) {
      this.timeFirstRender = this.timeAttacked;
    }

    this.timeAttackedSinceFirstRender = this.getMsSince(
      timeFirstRender,
      this.timeAttacked
    );

    return this;
  }

  sustain(duration: number) {
    this.sustainPeriod = duration;
    return this;
  }

  release(releasePeriod: number = 1000): this {
    setTimeout(() => {
      if (this.isSustaining) {
        const { timeFirstRender } = this;

        this.releasePeriod = releasePeriod;
        this.isSustaining = false;
        this.isReleasing = true;
        this.timeReleased = new Date();

        this.timeReleasedSinceFirstRender = this.getMsSince(
          timeFirstRender,
          this.timeReleased
        );
      }
    }, this.sustainPeriod);

    return this;
  }

  getMsSince(time?: Date | null, referenceTime?: Date | null): number {
    const timeNow = referenceTime
      ? referenceTime.getTime()
      : new Date().getTime();

    return time && time instanceof Date ? timeNow - time.getTime() : 0;
  }

  get releaseFactor(): NormalizedFloat {
    const { releasePeriod, timeReleased, isSustaining } = this;
    const msSinceReleased = this.getMsSince(timeReleased);

    if (isSustaining) {
      return toNormalizedFloat(1);
    } else {
      return msSinceReleased < releasePeriod
        ? toNormalizedFloat(1 - msSinceReleased / releasePeriod)
        : toNormalizedFloat(0);
    }
  }
}

export default AnimatableObject;
