import type { BoundsCollector } from "./types";

// Tracks which BoundsCollector (if any) a primitive's bounds should be
// reported into, and whether reporting is currently suppressed.
//
// - getActiveCollector/withCollector: a stack of collectors, pushed by
//   group()/frame() while running their frame callback so nested primitives
//   report into that container's own collector instead of an ancestor's.
// - shouldCollectBounds/withSuppressedBounds: a separate reentrant gate used
//   by shape-as-container primitives (e.g. rect(props, frame => ...)), which
//   already know their own explicit bounds and mute their descendants from
//   leaking bounds into whatever collector is active further up.
class BoundsCollectionManager {
  #collectorStack: BoundsCollector[] = [];
  #suppressedDepth = 0;

  getActiveCollector(): BoundsCollector | undefined {
    return this.#collectorStack[this.#collectorStack.length - 1];
  }

  withCollector(collector: BoundsCollector, frame: () => void): void {
    this.#collectorStack.push(collector);

    try {
      frame();
    } finally {
      this.#collectorStack.pop();
    }
  }

  shouldCollectBounds(): boolean {
    return this.#suppressedDepth === 0;
  }

  withSuppressedBounds(frame: () => void): void {
    this.#suppressedDepth++;

    try {
      frame();
    } finally {
      this.#suppressedDepth--;
    }
  }
}

export default BoundsCollectionManager;
