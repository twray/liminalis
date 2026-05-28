import { NormalizedFloat } from "../types";
import { toNormalizedFloat } from "../util";
import BaseVisual, { BaseVisualRenderProps } from "./BaseVisual";

export type MidiVisualStatus = "idle" | "sustained" | "releasing";

interface MidiVisualLifecycleProps {
  status: MidiVisualStatus;
  attackValue: NormalizedFloat;
  releaseFactor: NormalizedFloat;
  releasePeriod: number;
  timeFirstRender: number | null;
  timeAttacked: number | null;
  timeReleased: number | null;
}

export type MidiVisualRenderProps<TProps> = BaseVisualRenderProps<
  TProps,
  MidiVisualLifecycleProps
>;

class MidiVisual<TProps = {}> extends BaseVisual<
  TProps,
  MidiVisualLifecycleProps
> {
  public attackValue: NormalizedFloat = toNormalizedFloat(0);
  public sustainPeriod: number = 0;
  public releasePeriod: number = 0;
  public isSustaining: boolean = false;
  public isReleasing: boolean = false;

  public timeAttacked: Date | null = null;
  public timeReleased: Date | null = null;

  public timeAttackedSinceFirstRender: number | null = null;
  public timeReleasedSinceFirstRender: number | null = null;

  constructor(initialProps?: TProps) {
    super(initialProps);
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

  protected getLifecycleProps(): MidiVisualLifecycleProps {
    let status: MidiVisualStatus = "idle";

    if (this.isSustaining) {
      status = "sustained";
    }

    if (this.isReleasing) {
      status = "releasing";
    }

    return {
      status,
      attackValue: this.attackValue,
      releaseFactor: this.releaseFactor,
      releasePeriod: this.releasePeriod,
      timeFirstRender: 0,
      timeAttacked: this.timeAttackedSinceFirstRender,
      timeReleased: this.timeReleasedSinceFirstRender,
    };
  }

  shouldRender(): boolean {
    return this.releaseFactor > 0 || this.isPermanent;
  }

  shouldMarkForRemoval(): boolean {
    if (!this.isPermanent && this.isReleasing && this.releaseFactor === 0) {
      this.isReleasing = false;
      return true;
    }

    return false;
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
