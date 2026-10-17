import type { ReactiveStatus } from "../render";
import type { NormalizedFloat } from "../types";
import { getMsSince, toNormalizedFloat } from "../util";

// "Envelope" borrows the audio-synthesis term for exactly this shape: a
// value that rises on attack, holds during sustain, and decays on release
// over time — the class both stores that state and exposes the trigger
// methods (attack/sustain/release) that drive it, so it's the state and
// the behavior together, not a passive data bag (hence no "State" suffix).
class ReactiveLayerEnvelope {
  #attackValue: NormalizedFloat = toNormalizedFloat(0);
  #attackPeriod = 0;
  #preserveStateIfNotReleased = false;
  #sustainPeriod = 0;
  #decayPeriod = 0;
  #releasePeriod = 0;

  #timeAttacked: Date | null = null;
  #timeSustained: Date | null = null;
  #timeDecayed: Date | null = null;
  #timeReleased: Date | null = null;
  // Set once, at construction — the single choke point every entry path
  // (placeInScene, attack, sustain, release) goes through via
  // ReactiveLayerRegistry.getOrCreate — so "first render" is correct
  // regardless of which of those happens to create this envelope first.
  #timeFirstRender: Date = new Date();
  isPermanent: boolean;

  constructor(isPermanent: boolean) {
    this.isPermanent = isPermanent;
  }

  get #status(): ReactiveStatus {
    if (this.isSustaining) {
      return "sustained";
    }

    if (this.isReleasing) {
      return "releasing";
    }

    return "idle";
  }

  get current() {
    return {
      status: this.#status,
      attackValue: this.#attackValue,
      attackPeriod: this.#attackPeriod,
      decayPeriod: this.#decayPeriod,
      releasePeriod: this.#releasePeriod,
    };
  }

  get timeOf() {
    return {
      attack: this.#timeAttacked
        ? getMsSince(this.#timeFirstRender, this.#timeAttacked)
        : null,
      sustain: this.#timeSustained
        ? getMsSince(this.#timeFirstRender, this.#timeSustained)
        : null,
      decay: this.#timeDecayStarts
        ? getMsSince(this.#timeFirstRender, this.#timeDecayStarts)
        : null,
      // With preserveStateIfNotReleased, only the current attack's release is
      // exposed: a stale one from an earlier cycle would sit in the animation
      // timeline as a completed segment, and Animatable then derives the
      // attack's start value from it instead of inheriting the layer's live,
      // in-flight value.
      release:
        this.#timeReleased &&
        (this.#isReleaseOfCurrentAttack || !this.#preserveStateIfNotReleased)
          ? getMsSince(this.#timeFirstRender, this.#timeReleased)
          : null,
    };
  }

  get #isReleaseOfCurrentAttack(): boolean {
    return (
      this.#timeReleased !== null &&
      this.#timeAttacked !== null &&
      this.#timeReleased >= this.#timeAttacked
    );
  }

  // As in an ADSR envelope, decay follows the attack phase rather than
  // overlapping it: it begins once the attack period has elapsed, or when
  // decay() was called, whichever is later.
  //
  // A release of the same attack that lands at or before that point cancels
  // the decay: the note let go before it ever reached its decay phase, so
  // only the release should play out. A release after decay has begun leaves
  // it in place -- the release simply takes over from wherever decay got to.
  get #timeDecayStarts(): Date | null {
    if (this.#timeDecayed === null) {
      return null;
    }

    if (this.#timeAttacked === null) {
      return this.#timeDecayed;
    }

    const attackEndsInMs = this.#timeAttacked.getTime() + this.#attackPeriod;
    const decayStartsInMs = Math.max(
      attackEndsInMs,
      this.#timeDecayed.getTime(),
    );

    const releasedThisAttackBeforeDecay =
      this.#isReleaseOfCurrentAttack &&
      this.#timeReleased!.getTime() <= decayStartsInMs;

    if (releasedThisAttackBeforeDecay) {
      return null;
    }

    return new Date(decayStartsInMs);
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

  get hasBeenReleased(): boolean {
    return this.#timeReleased !== null;
  }

  attack(
    attackValue: number = 1,
    durationInMs: number = 500,
    preserveStateIfNotReleased: boolean = false,
  ): this {
    this.#attackValue = toNormalizedFloat(attackValue);
    this.#attackPeriod = durationInMs;
    this.#preserveStateIfNotReleased = preserveStateIfNotReleased;
    this.#timeAttacked = new Date();
    this.#timeDecayed = null;

    return this;
  }

  sustain(durationInMs: number): this {
    this.#sustainPeriod = durationInMs;
    this.#timeSustained = new Date();

    return this;
  }

  decay(durationInMs: number = 10000): this {
    this.#decayPeriod = durationInMs;
    this.#timeDecayed = new Date();

    return this;
  }

  release(durationInMs: number = 1000): this {
    const attackedAtSchedulingTime = this.#timeAttacked;

    setTimeout(() => {
      if (
        this.#timeAttacked?.getTime() !== attackedAtSchedulingTime?.getTime() ||
        !this.isSustaining
      ) {
        return;
      }

      this.#releasePeriod = durationInMs;
      this.#timeReleased = new Date();
    }, this.#sustainPeriod);

    return this;
  }
}

export default ReactiveLayerEnvelope;
