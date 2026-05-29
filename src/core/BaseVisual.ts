import { DrawCallback, RenderIsometricCallback, RenderProps } from "../types";
import IsometricView from "../views/IsometricView";
import { createDrawContext } from "./drawMethods";
import { getRenderIsometricMethods } from "./renderIsometricMethods";

export type BaseVisualRenderProps<
  TProps,
  TLifecycle extends object,
> = RenderProps & {
  props: TProps;
} & TLifecycle;

abstract class BaseVisual<TProps = {}, TLifecycle extends object = {}> {
  public markedForRemoval: boolean = false;
  public isPermanent: boolean = false;

  public timeFirstRender: Date | null = null;
  public props: TProps = {} as TProps;

  public renderer: (params: BaseVisualRenderProps<TProps, TLifecycle>) => void =
    () => {};

  protected drawContext = createDrawContext();

  constructor(initialProps?: TProps) {
    if (initialProps !== undefined) {
      this.props = initialProps;
    }
  }

  withRenderer(
    renderer: (params: BaseVisualRenderProps<TProps, TLifecycle>) => void,
  ): this {
    this.renderer = renderer;
    return this;
  }

  withProps(props: TProps): this {
    this.props = props;
    return this;
  }

  setIsPermanent(isPermanent: boolean): this {
    this.isPermanent = isPermanent;

    if (isPermanent && !this.timeFirstRender) {
      this.timeFirstRender = new Date();
    }

    return this;
  }

  renderIn(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ): this {
    const center = { x: width / 2, y: height / 2 };
    const timeSinceFirstRender = this.getMsSince(this.timeFirstRender);

    const drawCallbacks: DrawCallback[] = [];
    const renderIsometricCallbacks: RenderIsometricCallback[] = [];

    const draw = (callback: DrawCallback) => {
      drawCallbacks.push(callback);
    };

    const renderIsometric = (callback: RenderIsometricCallback) => {
      renderIsometricCallbacks.push(callback);
    };

    const params: BaseVisualRenderProps<TProps, TLifecycle> = {
      props: this.props,
      context,
      width,
      height,
      center,
      time: timeSinceFirstRender,
      draw,
      renderIsometric,
      ...this.getLifecycleProps(),
    };

    this.renderer(params);

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

  getMsSince(time?: Date | null, referenceTime?: Date | null): number {
    const timeNow = referenceTime
      ? referenceTime.getTime()
      : new Date().getTime();

    return time && time instanceof Date ? timeNow - time.getTime() : 0;
  }

  protected abstract getLifecycleProps(): TLifecycle;

  abstract shouldRender(): boolean;
  abstract shouldMarkForRemoval(): boolean;
}

export default BaseVisual;
