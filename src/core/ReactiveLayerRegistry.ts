import ReactiveLayerEnvelope, {
  type SceneTimeSource,
} from "./ReactiveLayerEnvelope";

// How many frames an attacked envelope may go without ever being placed
// before it is reported. More than one, because an envelope attacked from an
// atTime()/atStart() callback is created after that frame's draw pass and
// can only be placed on the next one.
const UNPLACED_ATTACK_WARNING_FRAME_THRESHOLD = 10;

class ReactiveLayerRegistry {
  #registry = new Map<string, ReactiveLayerEnvelope>();
  #now: SceneTimeSource;

  // Ids that have reached a placement site (componentInScene or a
  // placeInScene entry) at least once, and how long each attacked but
  // never-placed id has been waiting for one.
  #placedIds = new Set<string>();
  #unplacedAttackedFrameCounts = new Map<string, number>();
  #warnedIds = new Set<string>();

  constructor(now: SceneTimeSource) {
    this.#now = now;
  }

  get(id: string): ReactiveLayerEnvelope | undefined {
    return this.#registry.get(id);
  }

  getOrCreate(id: string, isPermanent: boolean): ReactiveLayerEnvelope {
    const existing = this.#registry.get(id);

    if (existing) {
      return existing;
    }

    const created = new ReactiveLayerEnvelope(isPermanent, this.#now);
    this.#registry.set(id, created);
    return created;
  }

  // The getOrCreate used by placement sites, which also records that the id
  // is rendered somewhere -- the counterpart to event handlers' getOrCreate,
  // which only ever drives the envelope.
  getOrCreateForPlacement(
    id: string,
    isPermanent: boolean,
  ): ReactiveLayerEnvelope {
    this.#placedIds.add(id);
    this.#unplacedAttackedFrameCounts.delete(id);

    return this.getOrCreate(id, isPermanent);
  }

  delete(id: string): void {
    this.#registry.delete(id);
    this.#placedIds.delete(id);
    this.#unplacedAttackedFrameCounts.delete(id);
    this.#warnedIds.delete(id);
  }

  // Reports, once per id, an envelope that has been attacked but has never
  // been placed in the scene -- almost always an id that does not match any
  // componentInScene()/placeInScene() call (a typo, or a note missing from
  // the list the scene renders), so the attack can never be seen.
  endFrame(): void {
    for (const [id, envelope] of this.#registry) {
      if (
        this.#placedIds.has(id) ||
        this.#warnedIds.has(id) ||
        !envelope.hasBeenAttacked
      ) {
        continue;
      }

      const frameCount = (this.#unplacedAttackedFrameCounts.get(id) ?? 0) + 1;

      if (frameCount < UNPLACED_ATTACK_WARNING_FRAME_THRESHOLD) {
        this.#unplacedAttackedFrameCounts.set(id, frameCount);
        continue;
      }

      this.#unplacedAttackedFrameCounts.delete(id);
      this.#warnedIds.add(id);

      console.warn(
        `[liminalis] "${id}" was attacked via getFromScene(), but no ` +
          `component has been placed in the scene with that id, so the ` +
          `attack cannot be seen. \n\n Please check that the id matches a ` +
          `render.componentInScene() or placeInScene() call.`,
      );
    }
  }
}

export default ReactiveLayerRegistry;
