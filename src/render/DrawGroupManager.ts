import { stableSerialize } from "../util";
import DrawGroupBitmapCache from "./DrawGroupBitmapCache";

import type { ClipScope } from "./types";

// "reserved" is a slot whose position in the list has been claimed at declare
// time but whose content is not known yet -- see captureCurrentGroupHandle.
//
// Both consumers below skip a slot left in this state. That is a guard on a
// cross-file invariant rather than a live code path: every current caller
// (queueAnimatable, isometric) always goes on to fill the slot it reserved,
// and instrumenting the whole test suite plus the benchmarks found zero
// unfilled slots. It is kept because the invariant spans callers -- any
// future primitive that captures a handle and then returns early would
// otherwise reach buildGroupSignature with no group and crash on it -- and
// because the check costs one string comparison. It is deliberately NOT
// claimed to be covered by a test, because it is not reachable to test.
interface DrawGroupOperation {
  type: "primitive" | "group" | "reserved";
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
  overlayOperations: DrawGroupOperation[];
}

interface RenderGroupsParams {
  cache: DrawGroupBitmapCache;
  targetContext: CanvasRenderingContext2D;
  width: number;
  height: number;
}

interface NestedGroupParams {
  scope: ClipScope | null;
  getInvalidationSignature: () => string;
}

// A capability, bound to whichever group is current at the moment it's
// captured, for filling in a primitive operation in *that* group later —
// even after the group stack has moved on. Primitives that defer their
// actual pushPrimitiveOperation call (via AnimatableRegistry.queue, which
// only runs at flush time, after the whole synchronous render tree —
// including every group()/layer()/place() push/pop — has already unwound)
// need this: without it, a deferred push always lands wherever the stack
// happens to be *then* (root), not where the primitive was actually
// declared, and per-group bitmap caching has nothing real to skip.
//
// Capturing the handle also RESERVES this declaration's position in the
// group's operation list, which is what keeps paint order equal to
// declaration order. Position has to be claimed at declare time because that
// is the only moment it is known: containers push their group node while the
// callback is still running, whereas primitives resolve at flush. Appending
// at flush instead put every container beneath every sibling primitive
// regardless of source order — a rect declared before a group painted on top
// of it, and a full-canvas video declared before a group hid it entirely.
export interface DrawGroupHandle {
  pushPrimitiveOperation: (params: {
    signature: string;
    render: (context: CanvasRenderingContext2D) => void;
  }) => void;
  withNestedGroup: (params: NestedGroupParams, callbackFn: () => void) => void;
}

class DrawGroupManager {
  #groupIdCounter = 0;
  #rootGroup: DrawGroupNode;
  #groupStack: DrawGroupNode[];

  constructor() {
    this.#rootGroup = this.#createDrawGroup(null, () => "root");
    this.#groupStack = [this.#rootGroup];
  }

  withNestedGroup(params: NestedGroupParams, callbackFn: () => void): void {
    this.#pushNestedGroup(this.#getCurrentGroup(), params, callbackFn);
  }

  // Declare-time nesting (group/layer/place): the node is appended as it is
  // created, which is already in declaration order because the callback is
  // still running.
  #pushNestedGroup(
    parentGroup: DrawGroupNode,
    params: NestedGroupParams,
    callbackFn: () => void,
  ) {
    const nestedGroup = this.#createNestedGroup(params);

    parentGroup.operations.push({
      type: "group",
      group: nestedGroup,
    });

    this.#runWithGroupOnStack(nestedGroup, callbackFn);
  }

  // Flush-time nesting (a primitive with its own group, i.e. video): the node
  // goes into the slot this declaration reserved earlier, rather than being
  // appended where the list has since grown to.
  #fillReservedSlotWithNestedGroup(
    slot: DrawGroupOperation,
    params: NestedGroupParams,
    callbackFn: () => void,
  ) {
    const nestedGroup = this.#createNestedGroup(params);

    slot.type = "group";
    slot.group = nestedGroup;

    this.#runWithGroupOnStack(nestedGroup, callbackFn);
  }

  #createNestedGroup(params: NestedGroupParams): DrawGroupNode {
    const { scope, getInvalidationSignature } = params;

    return this.#createDrawGroup(scope, getInvalidationSignature);
  }

  #runWithGroupOnStack(group: DrawGroupNode, callbackFn: () => void): void {
    this.#groupStack.push(group);

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

  pushOverlayOperation(params: {
    signature: string;
    render: (context: CanvasRenderingContext2D) => void;
  }): void {
    this.#getCurrentGroup().overlayOperations.push({
      type: "primitive",
      signature: params.signature,
      render: params.render,
    });
  }

  captureCurrentGroupHandle(): DrawGroupHandle {
    const group = this.#getCurrentGroup();

    // Claimed now, filled later. See the ordering note on DrawGroupHandle.
    const slot: DrawGroupOperation = { type: "reserved" };
    group.operations.push(slot);

    return {
      pushPrimitiveOperation: (params) => {
        slot.type = "primitive";
        slot.signature = params.signature;
        slot.render = params.render;
      },
      withNestedGroup: (params: NestedGroupParams, callbackFn: () => void) => {
        this.#fillReservedSlotWithNestedGroup(slot, params, callbackFn);
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

      const operationSignatures = [
        ...group.operations,
        ...group.overlayOperations,
      ]
        // Unreachable today -- see the note on DrawGroupOperation. Skipping
        // rather than mapping matters because the group branch below would
        // dereference a group this slot does not have.
        .filter((operation) => operation.type !== "reserved")
        .map((operation) => {
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
      [...group.operations, ...group.overlayOperations].forEach((operation) => {
        if (operation.type === "reserved") {
          return;
        }

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
            runOperationsDirectly(
              group,
              surfaceContext as CanvasRenderingContext2D,
            ),
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
            runOperationsDirectly(
              group,
              surfaceContext as CanvasRenderingContext2D,
            ),
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
      overlayOperations: [],
    };
  }

  #getCurrentGroup(): DrawGroupNode {
    return this.#groupStack[this.#groupStack.length - 1] ?? this.#rootGroup;
  }
}

export default DrawGroupManager;
