import Animatable from "./Animatable";

interface PendingRender {
  validate: () => void;
  render: () => void;
}

class AnimatableRegistry {
  #registry: Map<string, Animatable<object>> = new Map();
  #callIndex = 0;
  #seenThisFrame: Set<string> = new Set();
  #pendingRenders: PendingRender[] = [];
  #currentTimeInMs = 0;

  beginFrame(timeInMs: number): void {
    this.#callIndex = 0;
    this.#seenThisFrame.clear();
    this.#pendingRenders = [];
    this.#currentTimeInMs = timeInMs;
  }

  getOrCreate<T extends object>(props: T, timeInMs: number): Animatable<T> {
    const id = String(this.#callIndex++);
    this.#seenThisFrame.add(id);

    const existing = this.#registry.get(id);
    if (existing) {
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
    this.#registry.set(id, animatable);
    return animatable;
  }

  queue<T extends object>(
    mergedProps: T,
    renderFn: (props: T) => void
  ): Animatable<T> {
    const animatable = this.getOrCreate(mergedProps, this.#currentTimeInMs);
    const timeInMs = this.#currentTimeInMs;

    // Capture all typed logic in closures - no type erasure needed
    this.#pendingRenders.push({
      validate: () => animatable.validate(),
      render: () => {
        const animatedProps = animatable.getCurrentProps(timeInMs);
        renderFn(animatedProps);
      },
    });

    return animatable;
  }

  flush(): void {
    for (const pending of this.#pendingRenders) {
      pending.validate();
      pending.render();
    }
    this.#pendingRenders = [];
  }

  endFrame(): void {
    for (const id of this.#registry.keys()) {
      if (!this.#seenThisFrame.has(id)) {
        this.#registry.delete(id);
      }
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
    this.#callIndex = 0;
    this.#seenThisFrame.clear();
    this.#pendingRenders = [];
  }
}

export default AnimatableRegistry;
