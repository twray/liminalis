import BaseVisual, { BaseVisualRenderProps } from "./BaseVisual";

export type VisualStatus = "hidden" | "visible";

interface VisualLifecycleProps {
  status: VisualStatus;
  timeShown: number | null;
  timeHidden: number | null;
}

export type VisualRenderProps<TProps> = BaseVisualRenderProps<
  TProps,
  VisualLifecycleProps
>;

class Visual<TProps = {}> extends BaseVisual<TProps, VisualLifecycleProps> {
  public isShown: boolean = false;

  public timeShown: Date | null = null;
  public timeHidden: Date | null = null;

  public timeShownSinceFirstRender: number | null = null;
  public timeHiddenSinceFirstRender: number | null = null;

  constructor(initialProps?: TProps) {
    super(initialProps);
  }

  show(): this {
    const { timeFirstRender } = this;

    this.isShown = true;
    this.timeShown = new Date();

    if (!this.timeFirstRender) {
      this.timeFirstRender = this.timeShown;
    }

    this.timeShownSinceFirstRender = this.getMsSince(
      timeFirstRender,
      this.timeShown,
    );

    return this;
  }

  hide(): this {
    const { timeFirstRender } = this;

    this.isShown = false;
    this.timeHidden = new Date();

    this.timeHiddenSinceFirstRender = this.getMsSince(
      timeFirstRender,
      this.timeHidden,
    );

    return this;
  }

  protected getLifecycleProps(): VisualLifecycleProps {
    return {
      status: this.isShown ? "visible" : "hidden",
      timeShown: this.timeShownSinceFirstRender,
      timeHidden: this.timeHiddenSinceFirstRender,
    };
  }

  shouldRender(): boolean {
    return this.isShown;
  }

  shouldMarkForRemoval(): boolean {
    return (
      !this.isPermanent &&
      !this.isShown &&
      this.timeShown !== null &&
      this.timeHidden !== null
    );
  }
}

export default Visual;
