import type { NormalizedFloat, ReactiveStatus } from "../types";
import { toNormalizedFloat, getMsSince } from "../util";

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

  // True once a release has ever been scheduled and taken effect — lets
  // Step 6's removal check tell "never attacked yet, keep waiting" apart
  // from "attacked, released, now fully decayed" even though both are
  // `status: "idle"`. Unlike Visual/Scene's equivalent check (Scene.ts's
  // `isReleasing: hasBeenReleased` destructure), this needs no "catch the
  // exact tick it flipped" mutation dance — it's just testing whether
  // timeReleased is set, so checking it a frame late is harmless.
  get hasBeenReleased(): boolean {
    return this.#timeReleased !== null;
  }

  get msSinceAttacked(): number | null {
    return this.#timeAttacked ? getMsSince(this.#timeAttacked) : null;
  }

  get msSinceReleased(): number | null {
    return this.#timeReleased ? getMsSince(this.#timeReleased) : null;
  }

  attack(attackValue: number): void {
    this.#attackValue = toNormalizedFloat(attackValue);
    this.#timeAttacked = new Date();
  }

  sustain(durationInMs: number): void {
    this.#sustainPeriod = durationInMs;
  }

  release(releasePeriod: number = 1000): void {
    const attackedAtSchedulingTime = this.#timeAttacked;

    setTimeout(() => {
      if (
        this.#timeAttacked?.getTime() !== attackedAtSchedulingTime?.getTime()
      ) {
        return; // superseded by a newer attack — this release no longer applies
      }

      if (!this.isSustaining) {
        return; // already released/decayed via some other path
      }

      this.#releasePeriod = releasePeriod;
      this.#timeReleased = new Date();
    }, this.#sustainPeriod);
  }
}

export default ReactiveLayerEnvelope;
