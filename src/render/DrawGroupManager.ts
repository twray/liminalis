import { stableSerialize } from "../util";
import DrawGroupBitmapCache from "./DrawGroupBitmapCache";

interface DrawGroupOperation {
  type: "primitive" | "group";
  signature?: string;
  render?: (context: CanvasRenderingContext2D) => void;
  group?: DrawGroupNode;
}

interface DrawGroupNode {
  id: string;
  getInvalidationSignature: () => string;
  operations: DrawGroupOperation[];
}

interface RenderGroupsParams {
  cache: DrawGroupBitmapCache;
  targetContext: CanvasRenderingContext2D;
  width: number;
  height: number;
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
    this.#rootGroup = this.#createDrawGroup(() => "root");
    this.#groupStack = [this.#rootGroup];
  }

  withNestedGroup(
    getInvalidationSignature: () => string,
    callbackFn: () => void,
  ): void {
    const parentGroup = this.#getCurrentGroup();
    const nestedGroup = this.#createDrawGroup(getInvalidationSignature);

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
    scopeCount: number,
    extraSignature?: string,
  ): string {
    const base = `${type}|props:${stableSerialize(props)}|scopes:${scopeCount}`;

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

  // KNOWN LIMITATION: every group's cached offscreen surface is sized to
  // the full canvas (`width`/`height` below), regardless of that group's
  // own local bounds — a cache HIT still means blitting a canvas-sized
  // bitmap every frame it's visited. This is why per-group caching skips
  // the expensive *work* inside a static group but not the blit cost of
  // reaching it (see the text-mask-gallery benchmark from Aug 2026).
  //
  // It isn't just wasteful: it's currently load-bearing. Positioning has no
  // translate-to-offset step in this recursion at all — every leaf
  // primitive independently re-applies its *entire* captured chain of
  // ancestor clip scopes using absolute canvas coordinates (see
  // ClipManager.renderWithScopes). Because every surface is canvas-sized
  // and always blitted at (0,0), that absolute-coordinate rendering lands
  // correctly "for free" at any nesting depth. Shrinking a group's surface
  // to its own local bounds would require a leaf's ancestor-scope offset to
  // be absorbed once, at that group's own surface boundary, rather than
  // re-applied by every descendant leaf independently — a real redesign of
  // the coordinate/compositing model, not a follow-up patch.
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

    const renderGroup = (
      group: DrawGroupNode,
      context: CanvasRenderingContext2D,
    ): void => {
      const signature = buildGroupSignature(group);

      cache.renderGroup({
        groupId: group.id,
        signature,
        targetContext: context,
        width,
        height,
        draw: (groupContext) => {
          group.operations.forEach((operation) => {
            if (operation.type === "primitive") {
              operation.render?.(groupContext as CanvasRenderingContext2D);
              return;
            }

            if (operation.group) {
              renderGroup(
                operation.group,
                groupContext as CanvasRenderingContext2D,
              );
            }
          });
        },
      });
    };

    renderGroup(this.#rootGroup, targetContext);
  }

  #createDrawGroup(getInvalidationSignature: () => string): DrawGroupNode {
    return {
      id: `group-${this.#groupIdCounter++}`,
      getInvalidationSignature,
      operations: [],
    };
  }

  #getCurrentGroup(): DrawGroupNode {
    return this.#groupStack[this.#groupStack.length - 1] ?? this.#rootGroup;
  }
}

export default DrawGroupManager;
