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
