import { stableSerialize } from "../util";
import DrawGroupBitmapCache from "./DrawGroupBitmapCache";

import type { ClipScope } from "./types";

interface DrawGroupOperation {
  type: "primitive" | "group";
  signature?: string;
  render?: (context: CanvasRenderingContext2D) => void;
  group?: DrawGroupNode;
}

interface DrawGroupNode {
  id: string;
  // null only for the implicit root — every other group's scope is applied
  // exactly once, by its parent, when this group is composited in (see
  // compositeGroup below). Every non-root scope corresponds 1:1 to this
  // node, per withClipScopedGroup's pairing.
  scope: ClipScope | null;
  getInvalidationSignature: () => string;
  operations: DrawGroupOperation[];
}

interface RenderGroupsParams {
  cache: DrawGroupBitmapCache;
  targetContext: CanvasRenderingContext2D;
  width: number;
  height: number;
}

interface WithNestedGroupParams {
  scope: ClipScope | null;
  getInvalidationSignature: () => string;
}

// A capability, bound to whichever group is current at the moment it's
// captured, for pushing a primitive operation into *that* group later —
// even after the group stack has moved on. Primitives that defer their
// actual pushPrimitiveOperation call (via AnimatableRegistry.queue, which
// only runs at flush time, after the whole synchronous render tree —
// including every group()/layer()/place() push/pop — has already unwound)
// need this: without it, a deferred push always lands wherever the stack
// happens to be *then* (root), not where the primitive was actually
// declared, and per-group bitmap caching has nothing real to skip.
export interface DrawGroupHandle {
  pushPrimitiveOperation: (params: {
    signature: string;
    render: (context: CanvasRenderingContext2D) => void;
  }) => void;
}

class DrawGroupManager {
  #groupIdCounter = 0;
  #rootGroup: DrawGroupNode;
  #groupStack: DrawGroupNode[];

  constructor() {
    this.#rootGroup = this.#createDrawGroup(null, () => "root");
    this.#groupStack = [this.#rootGroup];
  }

  withNestedGroup(
    { scope, getInvalidationSignature }: WithNestedGroupParams,
    callbackFn: () => void,
  ): void {
    const parentGroup = this.#getCurrentGroup();
    const nestedGroup = this.#createDrawGroup(scope, getInvalidationSignature);

    parentGroup.operations.push({
      type: "group",
      group: nestedGroup,
    });

    this.#groupStack.push(nestedGroup);

    try {
      callbackFn();
    } finally {
      this.#groupStack.pop();
    }
  }

  static createPrimitiveSignature(
    type: string,
    props: Record<string, any>,
    extraSignature?: string,
  ): string {
    const base = `${type}|props:${stableSerialize(props)}`;

    if (!extraSignature || extraSignature.length === 0) {
      return base;
    }

    return `${base}|extra:${extraSignature}`;
  }

  pushPrimitiveOperation(params: {
    signature: string;
    render: (context: CanvasRenderingContext2D) => void;
  }): void {
    this.#getCurrentGroup().operations.push({
      type: "primitive",
      signature: params.signature,
      render: params.render,
    });
  }

  captureCurrentGroupHandle(): DrawGroupHandle {
    const group = this.#getCurrentGroup();

    return {
      pushPrimitiveOperation: (params) => {
        group.operations.push({
          type: "primitive",
          signature: params.signature,
          render: params.render,
        });
      },
    };
  }

  // Each non-root group's own scope is applied exactly once, by its parent,
  // right here — never replayed per descendant leaf. That's what lets each
  // group's cached surface shrink to its own local bounds (instead of being
  // canvas-sized and always blitted at (0,0)): a rotated/scaled group's
  // surface stores unrotated local content, and the rotation/scale is
  // reapplied by the parent's context at composite time, which `drawImage`
  // composites correctly natively (the same technique Pixi containers, Konva
  // groups, and SVG <g> nesting use).
  renderToContext({ cache, targetContext, width, height }: RenderGroupsParams) {
    const groupSignatures = new Map<string, string>();

    const buildGroupSignature = (group: DrawGroupNode): string => {
      const cachedSignature = groupSignatures.get(group.id);

      if (cachedSignature) {
        return cachedSignature;
      }

      const operationSignatures = group.operations.map((operation) => {
        if (operation.type === "primitive") {
          return `primitive:${operation.signature ?? ""}`;
        }

        return `group:${buildGroupSignature(operation.group!)}`;
      });

      const signature = [
        `id:${group.id}`,
        `invalidate:${group.getInvalidationSignature()}`,
        ...operationSignatures,
      ].join("|");

      groupSignatures.set(group.id, signature);

      return signature;
    };

    const runOperationsDirectly = (
      group: DrawGroupNode,
      context: CanvasRenderingContext2D,
    ): void => {
      group.operations.forEach((operation) => {
        if (operation.type === "primitive") {
          operation.render?.(context);
          return;
        }

        if (operation.group) {
          compositeGroup(operation.group, context);
        }
      });
    };

    const compositeGroup = (
      group: DrawGroupNode,
      parentContext: CanvasRenderingContext2D,
    ): void => {
      if (!group.scope) {
        // Root: identity scope, full-canvas bounds — the degenerate case of
        // the cacheable branch below, not a bypass (preserves "root is also
        // bitmap-cached").
        cache.renderGroup({
          groupId: group.id,
          signature: buildGroupSignature(group),
          targetContext: parentContext,
          bounds: { x: 0, y: 0, width, height },
          useLocalCoordinateContext: false,
          scope: null,
          draw: (surfaceContext) =>
            runOperationsDirectly(group, surfaceContext as CanvasRenderingContext2D),
        });
        return;
      }

      parentContext.save();

      try {
        const compositeInfo = group.scope.getCompositeInfo?.(parentContext);

        // The group's own transform/clip/offset/local-translate — unchanged
        // logic from before, just invoked once here instead of once per
        // descendant leaf.
        group.scope.apply?.(parentContext);

        if (!compositeInfo || !compositeInfo.isValid) {
          // No composite info (a scope that doesn't describe local bounds)
          // or invalid bounds: apply() has already no-op'd or clipped to
          // nothing as appropriate — content still runs, unshifted, directly
          // on the parent context, matching the pre-redesign semantics for
          // an invalid frame.
          runOperationsDirectly(group, parentContext);
          return;
        }

        const { bounds, useLocalCoordinateContext } = compositeInfo;

        cache.renderGroup({
          groupId: group.id,
          signature: buildGroupSignature(group),
          targetContext: parentContext,
          bounds,
          useLocalCoordinateContext,
          scope: group.scope,
          draw: (surfaceContext) =>
            runOperationsDirectly(group, surfaceContext as CanvasRenderingContext2D),
        });
      } finally {
        parentContext.restore();
      }
    };

    compositeGroup(this.#rootGroup, targetContext);
  }

  #createDrawGroup(
    scope: ClipScope | null,
    getInvalidationSignature: () => string,
  ): DrawGroupNode {
    return {
      id: `group-${this.#groupIdCounter++}`,
      scope,
      getInvalidationSignature,
      operations: [],
    };
  }

  #getCurrentGroup(): DrawGroupNode {
    return this.#groupStack[this.#groupStack.length - 1] ?? this.#rootGroup;
  }
}

export default DrawGroupManager;
