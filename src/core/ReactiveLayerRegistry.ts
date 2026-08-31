import ReactiveLayerEnvelope from "./ReactiveLayerEnvelope";

class ReactiveLayerRegistry {
  #registry = new Map<string, ReactiveLayerEnvelope>();

  get(id: string): ReactiveLayerEnvelope | undefined {
    return this.#registry.get(id);
  }

  // Auto-vivifies with the given `isPermanent` if `id` has never been seen.
  // Callers default this differently: placeInScene (Step 4) always wants
  // `true`; the future scene.add()/addWithKey() migration path (Step 8)
  // wants `false`. Both share this one method.
  getOrCreate(id: string, isPermanent: boolean): ReactiveLayerEnvelope {
    const existing = this.#registry.get(id);

    if (existing) {
      return existing;
    }

    const created = new ReactiveLayerEnvelope(isPermanent);
    this.#registry.set(id, created);
    return created;
  }

  delete(id: string): void {
    this.#registry.delete(id);
  }

  // Auto-vivifies with isPermanent: true if `id` has never been placed —
  // lets a MIDI event that fires before the first placeInScene call for
  // that id still be recorded correctly; placeInScene picks up the
  // already-attacked state on its next call regardless of call order.
  attack(id: string, attackValue: number): void {
    this.getOrCreate(id, true).attack(attackValue);
  }

  sustain(id: string, durationInMs: number): void {
    this.getOrCreate(id, true).sustain(durationInMs);
  }

  release(id: string, releasePeriod: number = 1000): void {
    this.getOrCreate(id, true).release(releasePeriod);
  }
}

export default ReactiveLayerRegistry;
