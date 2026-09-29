import type { PositionalIdentity } from "../types/identity";
import Animatable from "./Animatable";
import PositionalIdentityTracker from "./PositionalIdentityTracker";

interface PendingRender {
  validate: () => void;
  render: () => void;
}

class AnimatableRegistry {
  #registry: Map<string, Animatable<object>> = new Map();
  #identityTracker = new PositionalIdentityTracker();

  #warnedScopes: Set<string> = new Set();
  #pendingRenders: PendingRender[] = [];
  #currentTimeInMs = 0;
  #isFlushing = false;
  #flushIndex = 0;
  #flushInsertionIndex = 0;

  withScope<T>(explicitKey: string | undefined, callbackFn: () => T): T {
    return this.#identityTracker.withScope(explicitKey, callbackFn);
  }

  beginFrame(timeInMs: number): void {
    this.#identityTracker.beginFrame();
    this.#pendingRenders = [];
    this.#currentTimeInMs = timeInMs;
    this.#isFlushing = false;
    this.#flushIndex = 0;
    this.#flushInsertionIndex = 0;
  }

  getOrCreate<T extends object>(
    props: T,
    timeInMs: number,
    identity?: PositionalIdentity,
  ): Animatable<T> {
    const id = this.#identityTracker.nextId(identity);

    const existing = this.#registry.get(id);
    if (existing) {
      existing.setCurrentFrameTime(timeInMs);
      // Capture current animated state before rebuilding segments
      // This enables smooth transitions when re-attacking during release
      existing.captureCurrentProps(timeInMs);
      // Update props and clear segments for fresh definition this frame
      existing.updateInitialProps(props);
      existing.clearSegments();
      return existing as Animatable<T>;
    }

    // Create new Animatable
    const animatable = new Animatable<T>(props, timeInMs);
    animatable.setCurrentFrameTime(timeInMs);
    this.#registry.set(id, animatable);
    return animatable;
  }

  queue<T extends object>(
    mergedProps: T,
    renderFn: (props: T) => void,
    identity?: PositionalIdentity,
  ): Animatable<T> {
    const animatable = this.getOrCreate(
      mergedProps,
      this.#currentTimeInMs,
      identity,
    );
    const timeInMs = this.#currentTimeInMs;

    // Capture all typed logic in closures - no type erasure needed
    const pendingRender: PendingRender = {
      validate: () => animatable.validate(),
      render: () => {
        const animatedProps = animatable.getCurrentProps(timeInMs);
        renderFn(animatedProps);
      },
    };

    if (this.#isFlushing) {
      this.#pendingRenders.splice(this.#flushInsertionIndex, 0, pendingRender);
      this.#flushInsertionIndex += 1;
    } else {
      this.#pendingRenders.push(pendingRender);
    }

    return animatable;
  }

  flush(): void {
    this.#isFlushing = true;
    this.#flushIndex = 0;

    while (this.#flushIndex < this.#pendingRenders.length) {
      const pending = this.#pendingRenders[this.#flushIndex];

      if (!pending) {
        this.#flushIndex += 1;
        continue;
      }

      this.#flushInsertionIndex = this.#flushIndex + 1;

      pending.validate();
      pending.render();

      this.#flushIndex += 1;
    }

    this.#isFlushing = false;
    this.#flushIndex = 0;
    this.#flushInsertionIndex = 0;
    this.#pendingRenders = [];
  }

  endFrame(): void {
    for (const id of this.#registry.keys()) {
      if (!this.#identityTracker.hasBeenSeen(id)) {
        this.#registry.delete(id);
      }
    }

    // The root scope never closes via withScope, so record it here.
    this.#identityTracker.recordScopeDeclarationCount();
    this.#warnOnUnkeyedReorderHazard();
  }

  // Positional identity is only safe while declaration order is stable. It
  // is not possible to detect a reorder outright -- knowing whether two
  // declarations are "the same logical thing" is exactly what a key
  // supplies, and without one there is nothing to compare. What IS
  // detectable is the condition under which a reorder can corrupt state: a
  // scope whose number of unkeyed declarations changed between frames while
  // something in it was mid-animation.
  //
  // Deliberately narrow, to avoid crying wolf. It cannot fire when:
  //   - no UNKEYED declaration in the scope animates (identity has no effect
  //     on output for a primitive with no segments -- getCurrentProps returns
  //     initialProps verbatim -- and a keyed one is already safe regardless);
  //   - the scope's declaration count is stable frame to frame;
  //   - everything in the scope is keyed (keyed declarations consume no
  //     positional index, so the count stays at zero and never changes).
  #warnOnUnkeyedReorderHazard(): void {
    for (const [scope, count] of this.#identityTracker.scopeDeclarationCounts) {
      if (this.#warnedScopes.has(scope)) {
        continue;
      }

      const previousCount =
        this.#identityTracker.previousScopeDeclarationCounts.get(scope);

      if (previousCount === undefined || previousCount === count) {
        continue;
      }

      const hazard = this.#findUnkeyedReorderHazard(scope);

      if (!hazard) {
        continue;
      }

      this.#warnedScopes.add(scope);

      const { primitiveName, primitiveProps } = hazard;

      console.warn(
        `[liminalis] Liminalis requires a unique key prop on ` +
          `"${primitiveName}" with props ${primitiveProps} so that it can ` +
          `keep track of its animation across frames. \n\n Please add a unique ` +
          `key prop to distinguish each ${primitiveName} from the other ` +
          `${primitiveName}s.`,
      );
    }
  }

  // Locates the first mid-animation declaration directly inside this scope,
  // and describes it well enough to find in source. Returns null when nothing
  // in the scope is animating, in which case identity has no bearing on what
  // is rendered and there is nothing to warn about.
  #findUnkeyedReorderHazard(
    scope: string,
  ): { primitiveName: string; primitiveProps: string } | null {
    const prefix = scope === "" ? "" : `${scope}/`;

    for (const [id, animatable] of this.#registry) {
      if (!id.startsWith(prefix)) {
        continue;
      }

      const localId = id.slice(prefix.length);

      // Only declarations directly in this scope, not in nested ones.
      if (localId.includes("/")) {
        continue;
      }

      // A keyed declaration is already safe -- its identity does not depend
      // on declaration order at all -- so its animation says nothing about
      // whether an unkeyed count change is dangerous. Without this, a static
      // unkeyed list sharing a scope with an animated keyed one warns even
      // though nothing is at risk.
      if (PositionalIdentityTracker.isKeyedLocalId(localId)) {
        continue;
      }

      if (!animatable.hasActiveAnimation()) {
        continue;
      }

      return {
        primitiveName: PositionalIdentityTracker.primitiveNameFromId(id),
        primitiveProps: AnimatableRegistry.#describeProps(
          animatable.declaredProps,
        ),
      };
    }

    return null;
  }

  static #MAX_DESCRIBED_PROPS_LENGTH = 240;

  // Bounded and non-throwing: props can carry hundreds of points (a polygon)
  // or something JSON cannot represent, and a diagnostic must never be the
  // reason a frame fails to render.
  static #describeProps(props: object): string {
    try {
      const serialised = JSON.stringify(props);

      if (serialised === undefined) {
        return "{}";
      }

      return serialised.length > AnimatableRegistry.#MAX_DESCRIBED_PROPS_LENGTH
        ? `${serialised.slice(
            0,
            AnimatableRegistry.#MAX_DESCRIBED_PROPS_LENGTH,
          )}… (truncated)`
        : serialised;
    } catch {
      return "(props could not be serialised)";
    }
  }

  get size(): number {
    return this.#registry.size;
  }

  get pendingCount(): number {
    return this.#pendingRenders.length;
  }

  clear(): void {
    this.#registry.clear();
    this.#identityTracker.reset();
    this.#warnedScopes.clear();
    this.#pendingRenders = [];
    this.#isFlushing = false;
    this.#flushIndex = 0;
    this.#flushInsertionIndex = 0;
  }
}

export default AnimatableRegistry;
