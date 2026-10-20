import type { ReactiveStatus } from "../render";
import type { NormalizedFloat } from "../types";
import { toNormalizedFloat } from "../util";

// Reads the current scene time, in ms. Injected rather than read from the
// wall clock so that the times this envelope exposes on timeOf share a time
// base with the frame times Animatable evaluates `at` against.
export type SceneTimeSource = () => number;

interface PendingRelease {
  // The attack this release was requested against. A re-attack before the
  // release lands supersedes it, exactly as a re-struck key would.
  attackedAt: number | null;
  takesEffectAt: number;
  durationInMs: number;
}

// "Envelope" borrows the audio-synthesis term for exactly this shape: a
// value that rises on attack, holds during sustain, and decays on release
// over time — the class both stores that state and exposes the trigger
// methods (attack/sustain/release) that drive it, so it's the state and
// the behavior together, not a passive data bag (hence no "State" suffix).
//
// Every time it records or exposes is absolute scene time, in ms.
class ReactiveLayerEnvelope {
  #attackValue: NormalizedFloat = toNormalizedFloat(0);
  #attackPeriod = 0;
  #preserveStateIfNotReleased = false;
  #sustainPeriod = 0;
  #decayPeriod = 0;
  #releasePeriod = 0;

  #timeAttacked: number | null = null;
  #timeSustained: number | null = null;
  #timeDecayed: number | null = null;
  #timeReleased: number | null = null;
  #pendingRelease: PendingRelease | null = null;

  #now: SceneTimeSource;
  isPermanent: boolean;

  constructor(isPermanent: boolean, now: SceneTimeSource) {
    this.isPermanent = isPermanent;
    this.#now = now;
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
    this.#settlePendingRelease();

    return {
      status: this.#status,
      attackValue: this.#attackValue,
      attackPeriod: this.#attackPeriod,
      decayPeriod: this.#decayPeriod,
      releasePeriod: this.#releasePeriod,
    };
  }

  get timeOf() {
    this.#settlePendingRelease();

    return {
      attack: this.#timeAttacked,
      sustain: this.#timeSustained,
      decay: this.#timeDecayStarts,
      // With preserveStateIfNotReleased, only the current attack's release is
      // exposed: a stale one from an earlier cycle would sit in the animation
      // timeline as a completed segment, and Animatable then derives the
      // attack's start value from it instead of inheriting the layer's live,
      // in-flight value.
      release:
        this.#timeReleased !== null &&
        (this.#isReleaseOfCurrentAttack || !this.#preserveStateIfNotReleased)
          ? this.#timeReleased
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
  get #timeDecayStarts(): number | null {
    if (this.#timeDecayed === null) {
      return null;
    }

    if (this.#timeAttacked === null) {
      return this.#timeDecayed;
    }

    const decayStarts = Math.max(
      this.#timeAttacked + this.#attackPeriod,
      this.#timeDecayed,
    );

    const releasedThisAttackBeforeDecay =
      this.#isReleaseOfCurrentAttack && this.#timeReleased! <= decayStarts;

    if (releasedThisAttackBeforeDecay) {
      return null;
    }

    return decayStarts;
  }

  get isSustaining(): boolean {
    this.#settlePendingRelease();

    return this.#isSustainingNow;
  }

  get #isSustainingNow(): boolean {
    return (
      this.#timeAttacked !== null &&
      (this.#timeReleased === null || this.#timeAttacked > this.#timeReleased)
    );
  }

  get isReleasing(): boolean {
    this.#settlePendingRelease();

    return (
      this.#timeReleased !== null &&
      this.#timeAttacked !== null &&
      this.#timeAttacked <= this.#timeReleased &&
      this.#now() - this.#timeReleased < this.#releasePeriod
    );
  }

  get hasBeenReleased(): boolean {
    this.#settlePendingRelease();

    return this.#timeReleased !== null;
  }

  get hasBeenAttacked(): boolean {
    return this.#timeAttacked !== null;
  }

  attack(
    attackValue: number = 1,
    durationInMs: number = 500,
    preserveStateIfNotReleased: boolean = false,
  ): this {
    this.#settlePendingRelease();

    this.#attackValue = toNormalizedFloat(attackValue);
    this.#attackPeriod = durationInMs;
    this.#preserveStateIfNotReleased = preserveStateIfNotReleased;
    this.#timeAttacked = this.#now();
    this.#timeDecayed = null;

    return this;
  }

  sustain(durationInMs: number): this {
    this.#settlePendingRelease();

    this.#sustainPeriod = durationInMs;
    this.#timeSustained = this.#now();

    return this;
  }

  decay(durationInMs: number = 10000): this {
    this.#settlePendingRelease();

    this.#decayPeriod = durationInMs;
    this.#timeDecayed = this.#now();

    return this;
  }

  // The release lands sustainPeriod ms from now. Rather than a timer, it is
  // recorded and resolved lazily against scene time (see
  // #settlePendingRelease), so it lands at exactly the scene time it was
  // scheduled for, and pauses with the scene clock instead of firing in the
  // background.
  release(durationInMs: number = 1000): this {
    this.#settlePendingRelease();

    const takesEffectAt = this.#now() + this.#sustainPeriod;
    const pending = this.#pendingRelease;

    // A release already pending against this same attack lands first; it
    // ends the sustain, after which this one would have nothing to release.
    const isSupersededByPending =
      pending !== null &&
      pending.attackedAt === this.#timeAttacked &&
      pending.takesEffectAt <= takesEffectAt;

    if (!isSupersededByPending) {
      this.#pendingRelease = {
        attackedAt: this.#timeAttacked,
        takesEffectAt,
        durationInMs,
      };
    }

    this.#settlePendingRelease();

    return this;
  }

  // Applies a pending release once scene time reaches it. Called at the top
  // of every public read and trigger, so state is always resolved up to
  // "now" before it is read or changed -- in particular before attack()
  // overwrites #timeAttacked, which is what lets a due release land ahead of
  // a re-attack that arrives after it.
  #settlePendingRelease(): void {
    const pending = this.#pendingRelease;

    if (pending === null || this.#now() < pending.takesEffectAt) {
      return;
    }

    this.#pendingRelease = null;

    // Only a release of the attack it was requested against, while that
    // attack is still sustaining, takes effect.
    if (pending.attackedAt !== this.#timeAttacked || !this.#isSustainingNow) {
      return;
    }

    this.#releasePeriod = pending.durationInMs;
    this.#timeReleased = pending.takesEffectAt;
  }
}

export default ReactiveLayerEnvelope;
