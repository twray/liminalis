import { createDrawContext } from "../render";
import {
  DrawCallback,
  NormalizedFloat,
  RenderIsometricCallback,
  RenderProps,
} from "../types";
import IsometricView from "../views/IsometricView";
import { getRenderIsometricMethods } from "./renderIsometricMethods";

import { toNormalizedFloat } from "../util";

export type VisualStatus = "idle" | "sustained" | "releasing";

export interface VisualRenderProps<TProps> extends RenderProps {
  props: TProps;
  status: VisualStatus;
  attackValue: NormalizedFloat;
  releasePeriod: number;
  timeFirstRender: number | null;
  timeAttacked: number | null;
  timeReleased: number | null;
}

export type VisualRenderer<TProps> = (
  params: VisualRenderProps<TProps>,
) => void;

class Visual<TProps = {}> {
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

  public renderer: VisualRenderer<TProps> = () => {};

  private drawContext = createDrawContext();

  constructor(initialProps?: TProps, renderer?: VisualRenderer<TProps>) {
    if (initialProps !== undefined) {
      this.props = initialProps;
    }

    if (renderer) {
      this.renderer = renderer;
    }
  }

  withRenderer(renderer: VisualRenderer<TProps>) {
    this.renderer = renderer;
    return this;
  }

  withProps(props: TProps) {
    this.props = props;
    return this;
  }

  clone(): Visual<TProps> {
    const clonedProps = this.cloneValue(this.props);
    return new Visual<TProps>(clonedProps, this.renderer);
  }

  setIsPermanent(isPermanent: boolean) {
    this.isPermanent = isPermanent;
    this.timeFirstRender = new Date();
    return this;
  }

  renderIn(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ): this {
    const {
      props,
      attackValue,
      releasePeriod,
      isSustaining,
      isReleasing,
      timeAttackedSinceFirstRender: timeAttacked,
      timeReleasedSinceFirstRender: timeReleased,
    } = this;

    const measurements = {
      width,
      height,
      center: { x: width / 2, y: height / 2 },
    };

    let status: VisualStatus = "idle";
    if (isSustaining) status = "sustained";
    if (isReleasing) status = "releasing";

    const timeSinceFirstRender = this.getMsSince(this.timeFirstRender);

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
      hasMeasurements: true,
      measurements,
      getMeasurements: () => measurements,
      time: timeSinceFirstRender,
      status,
      attackValue,
      releasePeriod,
      timeFirstRender: 0,
      timeAttacked,
      timeReleased,
      draw,
      renderIsometric,
    });

    drawCallbacks.forEach((drawCallback) => {
      this.drawContext.executeDrawCallback(
        drawCallback,
        context,
        width,
        height,
        timeSinceFirstRender,
      );
    });

    renderIsometricCallbacks.forEach((renderIsometricCallback) => {
      const isometricView = new IsometricView(context, width, height);
      renderIsometricCallback(
        getRenderIsometricMethods(isometricView, timeInMs),
      );
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
      this.timeAttacked,
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
          this.timeReleased,
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

  private cloneValue<TValue>(value: TValue): TValue {
    if (Array.isArray(value)) {
      return value.map((item) => this.cloneValue(item)) as TValue;
    }

    if (value instanceof Date) {
      return new Date(value.getTime()) as TValue;
    }

    if (value && typeof value === "object") {
      const clonedObject: Record<string, unknown> = {};

      Object.entries(value as Record<string, unknown>).forEach(
        ([key, nestedValue]) => {
          clonedObject[key] = this.cloneValue(nestedValue);
        },
      );

      return clonedObject as TValue;
    }

    return value;
  }
}

export default Visual;
