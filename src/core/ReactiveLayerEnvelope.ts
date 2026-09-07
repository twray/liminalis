import type { NormalizedFloat, ReactiveStatus } from "../types";
import { getMsSince, toNormalizedFloat } from "../util";

// "Envelope" borrows the audio-synthesis term for exactly this shape: a
// value that rises on attack, holds during sustain, and decays on release
// over time — the class both stores that state and exposes the trigger
// methods (attack/sustain/release) that drive it, so it's the state and
// the behavior together, not a passive data bag (hence no "State" suffix).
class ReactiveLayerEnvelope {
  #attackValue: NormalizedFloat = toNormalizedFloat(0);
  #sustainPeriod = 0;
  #releasePeriod = 0;
  #timeAttacked: Date | null = null;
  #timeReleased: Date | null = null;
  // Set once, at construction — the single choke point every entry path
  // (placeInScene, attack, sustain, release) goes through via
  // ReactiveLayerRegistry.getOrCreate — so "first render" is correct
  // regardless of which of those happens to create this envelope first.
  #timeFirstRender: Date = new Date();
  readonly isPermanent: boolean;

  constructor(isPermanent: boolean) {
    this.isPermanent = isPermanent;
  }

  get attackValue(): NormalizedFloat {
    return this.#attackValue;
  }

  get releasePeriod(): number {
    return this.#releasePeriod;
  }

  get isSustaining(): boolean {
    return (
      this.#timeAttacked !== null &&
      (this.#timeReleased === null || this.#timeAttacked > this.#timeReleased)
    );
  }

  get isReleasing(): boolean {
    return (
      this.#timeReleased !== null &&
      this.#timeAttacked !== null &&
      this.#timeAttacked <= this.#timeReleased &&
      getMsSince(this.#timeReleased) < this.#releasePeriod
    );
  }

  get status(): ReactiveStatus {
    if (this.isSustaining) {
      return "sustained";
    }

    if (this.isReleasing) {
      return "releasing";
    }

    return "idle";
  }

  get timeAttacked(): number | null {
    return this.#timeAttacked
      ? getMsSince(this.#timeFirstRender, this.#timeAttacked)
      : null;
  }

  get timeReleased(): number | null {
    return this.#timeReleased
      ? getMsSince(this.#timeFirstRender, this.#timeReleased)
      : null;
  }

  get hasBeenReleased(): boolean {
    return this.#timeReleased !== null;
  }

  attack(attackValue: number = 1): this {
    this.#attackValue = toNormalizedFloat(attackValue);
    this.#timeAttacked = new Date();

    return this;
  }

  sustain(durationInMs: number): this {
    this.#sustainPeriod = durationInMs;

    return this;
  }

  release(releasePeriod: number = 1000): this {
    const attackedAtSchedulingTime = this.#timeAttacked;

    setTimeout(() => {
      if (
        this.#timeAttacked?.getTime() !== attackedAtSchedulingTime?.getTime() ||
        !this.isSustaining
      ) {
        return;
      }

      this.#releasePeriod = releasePeriod;
      this.#timeReleased = new Date();
    }, this.#sustainPeriod);

    return this;
  }
}

export default ReactiveLayerEnvelope;
