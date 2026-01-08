import {
  AnimationOptions,
  DrawCallback,
  NormalizedFloat,
  RenderIsometricCallback,
  RenderProps,
} from "../types";
import IsometricView from "../views/IsometricView";
import { getAnimatedValueForCurrentTime } from "./animation";
import { getDrawMethods } from "./drawMethods";
import { getRenderIsometricMethods } from "./renderIsometricMethods";

import { toNormalizedFloat } from "../util";

type MidiVisualStatus = "idle" | "sustained" | "releasing";

interface MidiVisualRenderProps<TProps> extends RenderProps {
  props: TProps;
  status: MidiVisualStatus;
  attackValue: NormalizedFloat;
  releaseFactor: NormalizedFloat;
  releasePeriod: number;
  timeFirstRender: number | null;
  timeAttacked: number | null;
  timeReleased: number | null;
  animate: (options: AnimationOptions | AnimationOptions[]) => number;
}

class MidiVisual<TProps = {}> {
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

  public renderer: (params: MidiVisualRenderProps<TProps>) => void = () => {};

  constructor() {}

  withRenderer(renderer: (params: MidiVisualRenderProps<TProps>) => void) {
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

  renderIn(
    context: CanvasRenderingContext2D,
    width: number,
    height: number
  ): this {
    const {
      props,
      attackValue,
      releaseFactor,
      releasePeriod,
      isSustaining,
      isReleasing,
      timeAttackedSinceFirstRender: timeAttacked,
      timeReleasedSinceFirstRender: timeReleased,
    } = this;

    const center = { x: width / 2, y: height / 2 };

    let status: MidiVisualStatus = "idle";
    if (isSustaining) status = "sustained";
    if (isReleasing) status = "releasing";

    // Callbacks for calls to draw() and renderIsometric() methods

    const drawCallbacks: DrawCallback[] = [];
    const renderIsometricCallbacks: RenderIsometricCallback[] = [];

    const draw = (callback: DrawCallback) => {
      drawCallbacks.push(callback);
    };

    const renderIsometric = (callback: RenderIsometricCallback) => {
      renderIsometricCallbacks.push(callback);
    };

    this.renderer({
      props,
      context,
      width,
      height,
      center,
      status,
      attackValue,
      releaseFactor,
      releasePeriod,
      timeFirstRender: 0,
      timeAttacked,
      timeReleased,
      draw,
      renderIsometric,
      animate: (options: AnimationOptions | AnimationOptions[]) =>
        getAnimatedValueForCurrentTime(
          this.getMsSince(this.timeFirstRender),
          options
        ),
    });

    drawCallbacks.forEach((drawCallback) => {
      drawCallback(getDrawMethods(context, width, height));
    });

    renderIsometricCallbacks.forEach((renderIsometricCallback) => {
      const isometricView = new IsometricView(context, width, height);
      renderIsometricCallback(getRenderIsometricMethods(isometricView));
      isometricView.render();
    });

    return this;
  }

  attack(attackValue: number): this {
    const { timeFirstRender } = this;

    this.attackValue = toNormalizedFloat(attackValue);
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

export default MidiVisual;
