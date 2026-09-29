import type { PositionalIdentity } from "../types/identity";

class PositionalIdentityTracker {
  #scopePath: string[] = [];
  #localIndexStack: number[] = [0];
  #seenThisFrame: Set<string> = new Set();

  #scopeDeclarationCounts: Map<string, number> = new Map();
  #previousScopeDeclarationCounts: Map<string, number> = new Map();

  static isKeyedLocalId(localId: string): boolean {
    return localId.startsWith("key:");
  }

  static primitiveNameFromId(id: string): string {
    const separatorIndex = id.lastIndexOf("#");
    return separatorIndex === -1 ? "primitive" : id.slice(separatorIndex + 1);
  }

  static #duplicateKeyMessage(
    id: string,
    identity?: PositionalIdentity,
  ): string {
    const primitiveName = identity?.primitiveType ?? "primitive";

    if (identity?.key !== undefined) {
      return (
        `[liminalis] Duplicate key "${identity.key}" on "${primitiveName}". ` +
        `Please ensure that all keys are unique.`
      );
    }

    // No key on this declaration, so the duplication is a container key
    // higher up -- the colliding id's own scope path names it.
    const scope = id.slice(0, id.lastIndexOf("/"));

    return (
      `[liminalis] Duplicate key in container scope "${scope}", reached via ` +
      `"${primitiveName}". Please ensure that all keys are unique.`
    );
  }

  public get scopeDeclarationCounts() {
    return this.#scopeDeclarationCounts;
  }

  public get previousScopeDeclarationCounts() {
    return this.#previousScopeDeclarationCounts;
  }

  recordScopeDeclarationCount(): void {
    this.scopeDeclarationCounts.set(
      this.#scopePath.join("/"),
      this.#localIndexStack[this.#localIndexStack.length - 1],
    );
  }

  beginFrame(): void {
    this.#scopePath = [];
    this.#localIndexStack = [0];
    this.#seenThisFrame.clear();
    // Rotate rather than clear: this frame's counts become the baseline the
    // next frame is compared against. Clearing both (or neither) leaves
    // previousScopeDeclarationCounts permanently empty, and the
    // unkeyed-reorder diagnostic silently never fires.
    this.#previousScopeDeclarationCounts = this.scopeDeclarationCounts;
    this.#scopeDeclarationCounts = new Map();
  }

  // A full reset, for clear() rather than a frame boundary. beginFrame's
  // rotation deliberately PRESERVES the outgoing counts as the next
  // comparison baseline, which is wrong when tearing the registry down.
  reset(): void {
    this.beginFrame();
    this.#scopeDeclarationCounts = new Map();
    this.#previousScopeDeclarationCounts = new Map();
  }

  withScope<T>(explicitKey: string | undefined, callbackFn: () => T): T {
    const parentLocalIndex = this.#localIndexStack.length - 1;
    const segment =
      explicitKey !== undefined
        ? `key:${explicitKey}`
        : String(this.#localIndexStack[parentLocalIndex]++);

    this.#scopePath.push(segment);
    this.#localIndexStack.push(0);

    try {
      return callbackFn();
    } finally {
      this.recordScopeDeclarationCount();
      this.#localIndexStack.pop();
      this.#scopePath.pop();
    }
  }

  nextId(identity?: PositionalIdentity): string {
    const primitiveType = identity?.primitiveType;
    const key = identity?.key;

    // A keyed declaration is identified by its key alone and deliberately
    // does not consume a positional index, so keying one item cannot shift
    // its unkeyed siblings -- the same rule withScope already applies.
    const segment =
      key !== undefined
        ? `key:${key}`
        : String(this.#localIndexStack[this.#localIndexStack.length - 1]++);

    // Type-qualified so a positional slot cannot be shared by two different
    // kinds of primitive. Appended rather than prefixed to keep the
    // legacy (no-primitiveType) id byte-identical to what it was before.
    const qualified =
      primitiveType === undefined ? segment : `${segment}#${primitiveType}`;

    // At root -- which is where the overwhelming majority of primitives in
    // a typical scene are declared -- the path is empty and the spread plus
    // join produce a string identical to the segment alone, at the cost of an
    // array allocation per primitive per frame.
    const id =
      this.#scopePath.length === 0
        ? qualified
        : [...this.#scopePath, qualified].join("/");

    // Issuing an id and recording it are one operation, deliberately. A
    // repeated id within a frame always means a duplicated key -- positional
    // counters only ever increment, and an unkeyed scope segment is itself a
    // counter -- so it is unambiguously a mistake rather than a heuristic
    // judgement, and a destructive one: both declarations would share a
    // single registry entry, the second clearing what the first just
    // declared. Thrown rather than warned because there is no correct frame
    // to render, and rendering a quietly broken one is worse than stopping.
    //
    // Two distinct causes reach here, and the message distinguishes them:
    //   - a duplicated key on THIS declaration (`identity.key`);
    //   - a duplicated container key further up, from withScope, giving two
    //     sibling containers the same scope path -- so their contents collide
    //     on an id that carries no key of its own.
    //
    // Living inside nextId rather than in a caller is what lets a second
    // registry (VideoTransportRegistry) inherit the check for free, which
    // matters because it resolves a video's key BEFORE the animatable
    // registry does -- see spec/video-primitive-plan.md section 5b.
    if (this.#seenThisFrame.has(id)) {
      throw new Error(
        PositionalIdentityTracker.#duplicateKeyMessage(id, identity),
      );
    }

    this.#seenThisFrame.add(id);

    return id;
  }

  hasBeenSeen(id: string): boolean {
    return this.#seenThisFrame.has(id);
  }
}

export default PositionalIdentityTracker;
