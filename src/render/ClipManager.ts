import type { ClipScope, RenderContextController } from "./types";

class ClipManager {
  #context: CanvasRenderingContext2D;
  #activeScopes: ClipScope[] = [];

  constructor(context: CanvasRenderingContext2D) {
    this.#context = context;
  }

  captureScopes(): ClipScope[] {
    return [...this.#activeScopes];
  }

  renderWithScopes(
    scopes: ClipScope[],
    render: () => void,
    contextController?: RenderContextController,
  ): void {
    if (scopes.length === 0) {
      render();
      return;
    }

    const renderController: RenderContextController = contextController ?? {
      getContext: () => this.#context,
      setContext: () => {},
    };

    const hasCustomScope = scopes.some((scope) => !!scope.renderWithScope);

    if (!hasCustomScope) {
      const activeContext = renderController.getContext();

      activeContext.save();

      for (const scope of scopes) {
        scope.apply?.(activeContext);
      }

      render();

      activeContext.restore();
      return;
    }

    this.#renderWithScopeAtIndex(scopes, 0, render, renderController);
  }

  #renderWithScopeAtIndex(
    scopes: ClipScope[],
    scopeIndex: number,
    render: () => void,
    contextController: RenderContextController,
  ): void {
    if (scopeIndex >= scopes.length) {
      render();
      return;
    }

    const scope = scopes[scopeIndex];

    if (!scope) {
      this.#renderWithScopeAtIndex(
        scopes,
        scopeIndex + 1,
        render,
        contextController,
      );
      return;
    }

    const renderWithinScope = () =>
      this.#renderWithScopeAtIndex(
        scopes,
        scopeIndex + 1,
        render,
        contextController,
      );

    if (scope.renderWithScope) {
      scope.renderWithScope({
        context: contextController.getContext(),
        renderWithinScope,
        contextController,
      });
      return;
    }

    if (!scope.apply) {
      renderWithinScope();
      return;
    }

    const activeContext = contextController.getContext();

    activeContext.save();

    scope.apply(activeContext);

    renderWithinScope();

    activeContext.restore();
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
