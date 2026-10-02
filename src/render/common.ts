import type {
  Dimensions2D,
  FillStyles,
  Positioned2D,
  WithBlend,
  WithFitMode,
  WithOpacity,
  IAnimatableLike,
  PartialDrawStyles,
  PartialIsometricStyles,
  Point2D,
  StrokeAlignment,
  StrokeStyles,
} from "../types";
import { degreesToRadians } from "../util";
import type {
  Bounds,
  BoundsCollector,
  ContextGlobalProps,
  EllipticalAttributes,
  EllipticalRadius,
  MemoizedSignature,
  TransformOrigin,
  TransformProps,
  TransformState,
} from "./types";

export const DEFAULT_BACKGROUND_COLOR = "#fff";
export const DEFAULT_FILL_STYLE = "transparent";
export const DEFAULT_STROKE_STYLE = "#333";
export const DEFAULT_STROKE_WIDTH = 1;
export const DEFAULT_STROKE_ALIGNMENT = "center";
export const DEFAULT_STROKE_LINE_CAP = "butt";
export const DEFAULT_STROKE_LINE_JOIN = "miter";
export const DEFAULT_STROKE_MITER_LIMIT = 10;
export const DEFAULT_BLEND_MODE: GlobalCompositeOperation = "source-over";

export const EMPTY_BOUNDS = { x: 0, y: 0, width: 0, height: 0 };

export const resolveTransformOrigin = (
  origin: TransformOrigin | undefined,
  bounds: Bounds,
): Point2D => {
  if (!origin || origin === "center") {
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }

  return { x: bounds.x + origin.x, y: bounds.y + origin.y };
};

export const resolveTransformState = (
  props: TransformProps,
  bounds: Bounds,
): TransformState => {
  const { rotate, scale, scaleOrigin, rotateOrigin, scaleX, scaleY } = props;

  const hasRotate = rotate !== undefined && rotate !== 0;
  const effectiveScaleX = scaleX ?? scale ?? 1;
  const effectiveScaleY = scaleY ?? scale ?? 1;
  const isInvertibleScale = effectiveScaleX !== 0 && effectiveScaleY !== 0;
  const hasScale =
    isInvertibleScale && (effectiveScaleX !== 1 || effectiveScaleY !== 1);

  const resolvedScaleOrigin = resolveTransformOrigin(scaleOrigin, bounds);
  const resolvedRotateOrigin = resolveTransformOrigin(rotateOrigin, bounds);
  const rotateRadians = degreesToRadians(rotate ?? 0);

  return {
    hasRotate,
    hasScale,
    scaleX: effectiveScaleX,
    scaleY: effectiveScaleY,
    scaleOrigin: resolvedScaleOrigin,
    rotateOrigin: resolvedRotateOrigin,
    rotateRadians,
  };
};

export const transformPoint = (
  point: Point2D,
  state: TransformState,
): Point2D => {
  const { x, y } = point;
  const {
    hasRotate,
    hasScale,
    rotateOrigin,
    scaleOrigin,
    rotateRadians,
    scaleX,
    scaleY,
  } = state;

  let transformedX = x;
  let transformedY = y;

  // Rotate point within a co-ordinate space
  if (hasRotate) {
    const deltaX = x - rotateOrigin.x;
    const deltaY = y - rotateOrigin.y;

    transformedX =
      rotateOrigin.x +
      deltaX * Math.cos(rotateRadians) -
      deltaY * Math.sin(rotateRadians);
    transformedY =
      rotateOrigin.y +
      deltaX * Math.sin(rotateRadians) +
      deltaY * Math.cos(rotateRadians);
  }

  // Scale that point if needed
  if (hasScale) {
    transformedX = scaleOrigin.x + (transformedX - scaleOrigin.x) * scaleX;
    transformedY = scaleOrigin.y + (transformedY - scaleOrigin.y) * scaleY;
  }

  return { x: transformedX, y: transformedY };
};

export const deriveBoundsFromPoints = (points: Point2D[]): Bounds => {
  const allXPoints = points.map((point) => point.x);
  const allYPoints = points.map((point) => point.y);

  const minX = Math.min(...allXPoints);
  const minY = Math.min(...allYPoints);
  const maxX = Math.max(...allXPoints);
  const maxY = Math.max(...allYPoints);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

export const getLinearPartOfTransform = (
  point: Point2D,
  transformState: TransformState,
) => {
  const { x, y } = point;

  const center = transformPoint({ x, y }, transformState);
  const probeX = transformPoint({ x: x + 1, y }, transformState);
  const probeY = transformPoint({ x, y: y + 1 }, transformState);

  const columnX = { x: probeX.x - center.x, y: probeX.y - center.y };
  const columnY = { x: probeY.x - center.x, y: probeY.y - center.y };

  return { columnX, columnY };
};

export const getRowNorms = (columnX: Point2D, columnY: Point2D) => ({
  rowNormX: Math.hypot(columnX.x, columnY.x),
  rowNormY: Math.hypot(columnX.y, columnY.y),
});

export const normalize = (v: Point2D): Point2D => {
  const length = Math.hypot(v.x, v.y);
  return length === 0 ? { x: 0, y: 0 } : { x: v.x / length, y: v.y / length };
};

export const angleBetweenVectors = (u: Point2D, v: Point2D): number => {
  const cross = u.x * v.y - u.y * v.x;
  const dot = u.x * v.x + u.y * v.y;
  return Math.abs(Math.atan2(cross, dot));
};

export const hasVisibleStroke = ({ strokeStyle, strokeWidth }: StrokeStyles) =>
  strokeStyle !== "transparent" && strokeWidth && strokeWidth > 0;

export const hasVisibleFill = ({ fillStyle }: FillStyles) =>
  fillStyle !== "transparent";

export const resolveStrokeOutwardOffset = (
  strokeWidth: number,
  strokeAlignment: StrokeAlignment = DEFAULT_STROKE_ALIGNMENT,
) => {
  switch (strokeAlignment) {
    case "inside":
      return 0;
    case "outside":
      return strokeWidth;
    case "center":
      return strokeWidth / 2;
  }
};

export const getMiterTipCandidates = (
  vertex: Point2D,
  edgeDirection1: Point2D,
  edgeDirection2: Point2D,
  nativeStrokeWidth: number,
  miterLimit: number,
): [Point2D, Point2D] => {
  const unitEdge1 = normalize(edgeDirection1);
  const unitEdge2 = normalize(edgeDirection2);
  const theta = angleBetweenVectors(unitEdge1, unitEdge2);
  const halfWidth = nativeStrokeWidth / 2;

  // theta -> 0 is a degenerate corner reversing back on itself; canvas caps
  // the real miter length via the bevel-fallback threshold in any case, so
  // clamp there directly rather than dividing by ~0.
  const rawMiterLength =
    theta <= 0 ? Infinity : halfWidth / Math.sin(theta / 2);
  const miterLength = Math.min(rawMiterLength, nativeStrokeWidth * miterLimit);

  const wedgeDirection = normalize({
    x: unitEdge1.x + unitEdge2.x,
    y: unitEdge1.y + unitEdge2.y,
  });

  return [
    {
      x: vertex.x - miterLength * wedgeDirection.x,
      y: vertex.y - miterLength * wedgeDirection.y,
    },
    {
      x: vertex.x + miterLength * wedgeDirection.x,
      y: vertex.y + miterLength * wedgeDirection.y,
    },
  ];
};

export const getOffsetVertex = (
  vertex: Point2D,
  edgeDirection1: Point2D,
  edgeDirection2: Point2D,
  signedOffset: number,
): Point2D => {
  const unitEdge1 = normalize(edgeDirection1);
  const unitEdge2 = normalize(edgeDirection2);
  const theta = angleBetweenVectors(unitEdge1, unitEdge2);

  if (theta <= 0) {
    // Degenerate corner reversing back on itself -- no well-defined
    // bisector; leave the vertex where it is rather than divide by ~0.
    return vertex;
  }

  const offsetLength = signedOffset / Math.sin(theta / 2);

  const wedgeDirection = normalize({
    x: unitEdge1.x + unitEdge2.x,
    y: unitEdge1.y + unitEdge2.y,
  });

  return {
    x: vertex.x - offsetLength * wedgeDirection.x,
    y: vertex.y - offsetLength * wedgeDirection.y,
  };
};

export const computeTransformedRectangularAABB = (
  bounds: Bounds,
  props: TransformProps,
): Bounds => {
  const transformState = resolveTransformState(props, bounds);
  const { hasRotate, hasScale } = transformState;

  if (!hasRotate && !hasScale) return bounds;

  const corners: Point2D[] = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];

  return deriveBoundsFromPoints(
    corners.map((point) => transformPoint(point, transformState)),
  );
};

export const computeTransformedMultipointAABB = (
  points: Point2D[],
  props: TransformProps,
) => {
  const unTransformedBounds = deriveBoundsFromPoints(points);
  const transformState = resolveTransformState(props, unTransformedBounds);
  const { hasRotate, hasScale } = transformState;

  if (!hasRotate && !hasScale) return unTransformedBounds;

  return deriveBoundsFromPoints(
    points.map((point) => transformPoint(point, transformState)),
  );
};

const getEllipticalMatrix = (
  columnX: Point2D,
  columnY: Point2D,
  radius: EllipticalRadius,
) => {
  const { radiusX, radiusY } = radius;

  return {
    columnX: { x: columnX.x * radiusX, y: columnX.y * radiusX },
    columnY: { x: columnY.x * radiusY, y: columnY.y * radiusY },
  };
};

const normalizeIntoWindow = (angle: number, windowStart: number) => {
  const offset = angle - windowStart;
  const wrapped = offset - Math.floor(offset / (Math.PI * 2)) * (2 * Math.PI);

  return windowStart + wrapped;
};

const isWithinSweep = (
  angle: number,
  startInRadians: number,
  endInRadians: number,
) => {
  const effectiveEnd =
    endInRadians < startInRadians ? endInRadians + Math.PI * 2 : endInRadians;
  const noramlizedAngle = normalizeIntoWindow(angle, startInRadians);

  return noramlizedAngle <= effectiveEnd;
};

export const computeTransformedEllipticalAABB = (
  ellipticalAttributes: EllipticalAttributes,
  props: TransformProps,
) => {
  const { cx, cy, radiusX, radiusY, startInRadians, endInRadians } =
    ellipticalAttributes;

  const unTransformedBounds = {
    x: cx - radiusX,
    y: cy - radiusY,
    width: radiusX * 2,
    height: radiusY * 2,
  };

  const transformState = resolveTransformState(props, unTransformedBounds);
  const { hasRotate, hasScale } = transformState;

  if (!hasRotate && !hasScale) return unTransformedBounds;

  const { columnX, columnY } = getLinearPartOfTransform(
    { x: cx, y: cy },
    transformState,
  );

  const matrix = getEllipticalMatrix(columnX, columnY, {
    radiusX,
    radiusY,
  });

  const thetaX = Math.atan2(matrix.columnY.x, matrix.columnX.x);
  const thetaY = Math.atan2(matrix.columnY.y, matrix.columnX.y);

  const candidateAngles = [
    ...[startInRadians, endInRadians],
    ...[thetaX, thetaX + Math.PI, thetaY, thetaY + Math.PI].filter((angle) =>
      isWithinSweep(angle, startInRadians, endInRadians),
    ),
  ];

  const candidatePoints = candidateAngles.map((point) =>
    transformPoint(
      {
        x: cx + radiusX * Math.cos(point),
        y: cy + radiusY * Math.sin(point),
      },
      transformState,
    ),
  );

  return deriveBoundsFromPoints(candidatePoints);
};

export const renderWithTransform = (
  context: CanvasRenderingContext2D,
  props: TransformProps,
  bounds: Bounds,
  renderShape: () => void,
): void => {
  const { rotate } = props;

  const { hasRotate, hasScale, scaleX, scaleY, scaleOrigin, rotateOrigin } =
    resolveTransformState(props, bounds);

  if (!hasRotate && !hasScale) {
    renderShape();
    return;
  }

  context.save();

  if (hasScale) {
    const origin = scaleOrigin;

    context.translate(origin.x, origin.y);
    context.scale(scaleX, scaleY);
    context.translate(-origin.x, -origin.y);
  }

  if (hasRotate) {
    const origin = rotateOrigin;
    const radians = degreesToRadians(rotate!);

    context.translate(origin.x, origin.y);
    context.rotate(radians);
    context.translate(-origin.x, -origin.y);
  }

  renderShape();

  context.restore();
};

// Shared by image() and video(). Both composite a CanvasImageSource into a
// frame with the same three fit modes and the same transform/globals
// handling; the only difference between them is where the source comes from
// -- a decoded bitmap versus a live HTMLVideoElement, both of which satisfy
// CanvasImageSource. Extracted so the cover/contain/stretch geometry exists
// once rather than being duplicated per primitive.
//
// naturalWidth/naturalHeight are the source's own intrinsic dimensions, used
// both as the fallback frame size when width/height are omitted and as the
// aspect reference for cover/contain.
export const drawImageSourceWithFit = (
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
  props: Positioned2D &
    Partial<Dimensions2D> &
    WithOpacity &
    WithBlend &
    WithFitMode &
    TransformProps,
): void => {
  const {
    x = 0,
    y = 0,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
    width,
    height,
    fit = "cover",
  } = props;

  const hasScaledDimensions = width !== undefined && height !== undefined;

  if (hasScaledDimensions && (width <= 0 || height <= 0)) {
    return;
  }

  const renderedFrameWidth = hasScaledDimensions ? width : naturalWidth;
  const renderedFrameHeight = hasScaledDimensions ? height : naturalHeight;

  const bounds = {
    x,
    y,
    width: renderedFrameWidth,
    height: renderedFrameHeight,
  };

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    if (!hasScaledDimensions) {
      context.drawImage(source, x, y);
      context.restore();
      return;
    }

    switch (fit) {
      case "stretch": {
        context.drawImage(source, x, y, width, height);
        context.restore();
        return;
      }
      case "contain": {
        const containScale = Math.min(
          width / naturalWidth,
          height / naturalHeight,
        );
        const containedWidth = naturalWidth * containScale;
        const containedHeight = naturalHeight * containScale;
        const dx = x + (width - containedWidth) / 2;
        const dy = y + (height - containedHeight) / 2;

        context.drawImage(source, dx, dy, containedWidth, containedHeight);
        context.restore();
        return;
      }
      default:
      case "cover": {
        const frameAspect = width / height;
        const sourceAspect = naturalWidth / naturalHeight;

        let sx = 0;
        let sy = 0;
        let sourceWidth = naturalWidth;
        let sourceHeight = naturalHeight;

        if (sourceAspect > frameAspect) {
          sourceWidth = naturalHeight * frameAspect;
          sx = (naturalWidth - sourceWidth) / 2;
        } else if (sourceAspect < frameAspect) {
          sourceHeight = naturalWidth / frameAspect;
          sy = (naturalHeight - sourceHeight) / 2;
        }

        context.drawImage(
          source,
          sx,
          sy,
          sourceWidth,
          sourceHeight,
          x,
          y,
          width,
          height,
        );

        context.restore();
      }
    }
  });
};

export const setContextGlobals = (
  context: CanvasRenderingContext2D,
  props: ContextGlobalProps,
): void => {
  // Defaults to fully opaque, not fully transparent. Every caller currently
  // pre-defaults opacity to 1 before calling, which masked this -- but an
  // undefined opacity arriving here used to silently render nothing, and
  // opacity is now legitimately absent when a primitive declares none and
  // inherits the context's own globalAlpha instead.
  const { opacity = 1, blend = DEFAULT_BLEND_MODE } = props;

  context.globalAlpha = opacity;
  context.globalCompositeOperation = blend;
};

export const centerOf = (dimensions: Dimensions2D): Point2D => {
  const { width, height } = dimensions;
  return { x: width / 2, y: height / 2 };
};

// The smallest rect containing both. Used to widen a container's PAINT extent
// to cover content that overflows its declared frame, without touching the
// frame itself -- see resolveLayerBoundsState.
export const unionBounds = (a: Bounds, b: Bounds): Bounds => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);

  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

export const hasBounds = (
  props: Record<string, number>,
): props is Record<string, number> & Bounds =>
  typeof props.x === "number" &&
  typeof props.y === "number" &&
  typeof props.width === "number" &&
  typeof props.height === "number";

export const createBoundsCollector = (): BoundsCollector => {
  // Two independent unions over the same stream of reports. See the note on
  // BoundsCollector for why paint extent is tracked apart from layout bounds.
  const createUnion = () => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    return {
      include: (bounds: Bounds | null): void => {
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
          return;
        }

        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
      },
      get: (): Bounds | null => {
        if (
          !Number.isFinite(minX) ||
          !Number.isFinite(minY) ||
          !Number.isFinite(maxX) ||
          !Number.isFinite(maxY)
        ) {
          return null;
        }

        return {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      },
    };
  };

  const layout = createUnion();
  const paint = createUnion();
  const untransformed = createUnion();

  return {
    includeBounds: layout.include,
    getBounds: layout.get,
    includePaintBounds: paint.include,
    getPaintBounds: paint.get,
    includeUntransformedBounds: untransformed.include,
    getUntransformedBounds: untransformed.get,
  };
};

export const createNoopAnimatable = <TProps extends object>(
  initialProps: TProps,
): IAnimatableLike<TProps> => {
  let currentProps = initialProps;

  const noopAnimatable: IAnimatableLike<TProps> = {
    get currentProps() {
      return currentProps;
    },
    setCurrentFrameTime: (_timeInMs: number) => undefined,
    updateInitialProps: (props: TProps): void => {
      currentProps = props;
    },
    captureCurrentProps: (_timeInMs: number) => undefined,
    clearSegments: () => undefined,
    clearSnapshot: () => undefined,
    hasSegmentTargeting: (_key: keyof TProps) => false,
    animateTo: (_targetProps, _options): IAnimatableLike<TProps> =>
      noopAnimatable,
    withOptions: (_options): IAnimatableLike<TProps> => noopAnimatable,
    getCurrentProps: (_timeInMs: number) => currentProps,
  };

  return noopAnimatable;
};

export const memoPropsMatch = (
  cached: MemoizedSignature,
  next: Record<string, unknown>,
): boolean => {
  const { props: previous, propKeys } = cached;

  if (previous === next) {
    return true;
  }

  // Values first: a changed primitive usually differs in the first numeric
  // field checked, so this exits early on the common miss.
  for (let index = 0; index < propKeys.length; index++) {
    const key = propKeys[index];

    // NaN !== NaN reads as changed, which is the safe direction.
    if (previous[key] !== next[key]) {
      return false;
    }
  }

  // Then confirm nothing was ADDED, which the loop above cannot detect.
  // Counted rather than collected, to keep this allocation-free.
  //
  // Defensive: no test covers this, because a prop-shape change can't be
  // produced through the public API -- mergeStyles normalises every
  // primitive's props to a fixed shape, so only values ever differ. Kept
  // because the memo must not depend on that remaining true.
  let nextKeyCount = 0;

  for (const _key in next) {
    nextKeyCount += 1;
  }

  return nextKeyCount === propKeys.length;
};

export const toIsometricStyles = (
  styles: PartialDrawStyles,
): PartialIsometricStyles =>
  ({
    fillStyle: styles.fillStyle ?? styles.fillStyle,
    strokeStyle: styles.strokeStyle ?? styles.strokeStyle,
    strokeWidth: styles.strokeWidth ?? styles.strokeWidth,
  }) as PartialIsometricStyles;
