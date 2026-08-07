export interface ClipScope {
  apply: (context: CanvasRenderingContext2D) => void;
}

class ClipManager {
  #context: CanvasRenderingContext2D;
  #activeScopes: ClipScope[] = [];

  constructor(context: CanvasRenderingContext2D) {
    this.#context = context;
  }

  captureScopes(): ClipScope[] {
    return [...this.#activeScopes];
  }

  renderWithScopes(scopes: ClipScope[], render: () => void): void {
    if (scopes.length === 0) {
      render();
      return;
    }

    this.#context.save();

    for (const scope of scopes) {
      scope.apply(this.#context);
    }

    render();

    this.#context.restore();
  }

  withScope(scope: ClipScope, frame: () => void): void {
    this.#activeScopes.push(scope);

    try {
      frame();
    } finally {
      this.#activeScopes.pop();
    }
  }
}

export default ClipManager;
