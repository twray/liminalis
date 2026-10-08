import type {
  CappableStrokeStyles,
  Corners,
  Dimensions2D,
  EventTime,
  FillStyles,
  IAnimatableLike,
  IsometricCuboid,
  IsometricTile,
  JoinableStrokeStyles,
  MergeFirstOrder,
  NormalizedFloat,
  PartialDrawStyles,
  Point2D,
  Positioned2D,
  StrokeAlignment,
  StrokeStyles,
  TextStyles,
  WithBlend,
  WithFitMode,
  WithIdentityKey,
  WithOpacity,
  XOR,
} from "../types";
import type AnimatableRegistry from "./AnimatableRegistry";
import type DrawGroupManager from "./DrawGroupManager";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoundsCollector {
  includeBounds: (bounds: Bounds | null) => void;
  getBounds: () => Bounds | null;
  // A second, parallel union tracking how far descendants actually PAINT,
  // which for a container is wider than the bounds it reports for layout.
  //
  // Deliberately separate rather than folded into includeBounds: the layout
  // union drives implicit sizing, and letting overflow grow a container's SIZE
  // would feed back into the measurements its children size themselves from --
  // a rotated frame-filling child would grow the parent, which grows the
  // child, frame after frame, without settling. Paint extent propagates; size
  // does not.
  includePaintBounds: (bounds: Bounds | null) => void;
  getPaintBounds: () => Bounds | null;
  // A third union, of children's bounds BEFORE their own transforms are
  // applied. Used only for positioning: group() places its content by its
  // bounding box, and if that box were the transformed one, rotating or
  // scaling a child would move every sibling -- the box grows, and the
  // content shifts to keep its edge on the declared x. Untransformed bounds
  // do not move when a child transforms, so the placement offset stays put.
  //
  // So: untransformed positions, transformed sizes (layout), transformed plus
  // overflow paints.
  includeUntransformedBounds: (bounds: Bounds | null) => void;
  getUntransformedBounds: () => Bounds | null;
}

export interface ClosedPathDescriptor {
  bounds: Bounds;
  isValid: boolean;
  tracePath: (context: CanvasRenderingContext2D) => void;
}

export interface BackgroundProps {
  color: string;
}

export type TransformOrigin = "center" | Point2D;

export interface TransformProps {
  rotate?: number;
  rotateOrigin?: TransformOrigin;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  scaleOrigin?: TransformOrigin;
}

export interface TransformState {
  hasRotate: boolean;
  hasScale: boolean;
  scaleX: number;
  scaleY: number;
  scaleOrigin: Point2D;
  rotateOrigin: Point2D;
  rotateRadians: number;
}

export interface ContextGlobalProps extends WithOpacity, WithBlend {}

export interface MemoizedSignature {
  primitiveType: string;
  props: Record<string, unknown>;
  propKeys: string[];
  extraSignature: string | undefined;
  signature: string;
  skipComparison: boolean;
}

// A CompositeInfo-bearing ClipScope corresponds 1:1 to a DrawGroupNode
// (see withClipScopedGroup) and describes everything the compositor needs to
// give that group its own correctly-sized, correctly-positioned offscreen
// surface: its local (pre-own-transform) bounds, whether those bounds are
// usable, and whether descendants already author coordinates relative to the
// group's own (0,0) (useLocalCoordinateContext) or relative to the space the
// group itself was declared in.
export interface ClipScopeCompositeInfo {
  bounds: Bounds;
  isValid: boolean;
  useLocalCoordinateContext: boolean;
  // The extent that must actually be PAINTED, which is not always the same as
  // `bounds`. `bounds` is the declared frame: it fixes the coordinate origin
  // descendants author against, and the size getMeasurements() reports, so it
  // must never be widened. paintBounds is the union of that frame with
  // anything overflowing it (a rotated or scaled child's AABB), expressed in
  // the same space descendants author in, and is what the group's cached
  // surface is sized and positioned from.
  //
  // Omitted means "same as the frame" -- see renderGroup for the per-mode
  // default, which differs because layer/place author in local coordinates
  // while group authors in its parent's.
  paintBounds?: Bounds;
}

export interface ClipScope {
  // Applied exactly once, by this scope's *parent*, immediately before the
  // group's own (possibly cached) local surface is composited in — never
  // replayed per descendant leaf. See DrawGroupManager's compositeGroup.
  apply?: (context: CanvasRenderingContext2D) => void;
  getSignature?: () => string;
  // context is provided only for scopes that need real canvas measurement
  // APIs (e.g. text's measureText) to resolve their own bounds; scopes whose
  // bounds are purely prop-derived (group/clip) can ignore it.
  getCompositeInfo?: (
    context: CanvasRenderingContext2D,
  ) => ClipScopeCompositeInfo;
  // Runs once, immediately after a group's own content has been drawn into
  // its local surface and before that surface is cached/blitted — lets a
  // scope post-process the surface's own pixels (e.g. text's
  // destination-in glyph masking) in the same local coordinate frame the
  // content was just drawn in.
  postProcessLocalSurface?: (
    surfaceContext:
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D,
    bounds: Bounds,
  ) => void;
}

export interface RenderCollaborators {
  registry: AnimatableRegistry;
  drawGroupManager: DrawGroupManager;
}

export interface Measurements {
  width: number;
  height: number;
  center: Point2D;
}

// The single source of truth for the draw API's namespaces. Every context
// handed to user code -- onRender, a layer's or reactive layer's render
// function, a frame callback -- exposes a subset of these keys and nothing
// else. The value types are deliberately loose: this declares which
// namespaces exist and what each is for, while the slices below declare what
// goes in them.
export interface DrawNamespaces {
  /** Draw primitives, and helpers that gate or place what gets rendered. */
  render: object;
  /** Attributes of the frame currently being rendered. */
  current: object;
  /** Measurements and other utility methods. */
  util: object;
  /** Typed constructors for objects that can be passed into `render`. */
  define: object;
  /** Frame times, in ms, at which lifecycle events occurred. */
  timeOf: object;
  /** The props the component was instantiated with. */
  props: unknown;
}

type OnlyNamespaces<TSlice> = {
  [K in keyof TSlice]: K extends keyof DrawNamespaces
    ? DrawNamespaces[K]
    : never;
};

// Composes slices into a context. A slice is what one provider contributes:
// some members of some namespaces. Slices that share a namespace have their
// members merged, and a slice with a key that is not in DrawNamespaces is
// rejected here, so a namespace cannot be introduced without registering it.
//
// The result is mapped over DrawNamespaces rather than over the merged slices
// so that each namespace keeps the doc comment declared above.
export type DrawContextOf<
  TSlices extends readonly unknown[] & {
    [I in keyof TSlices]: OnlyNamespaces<TSlices[I]>;
  },
> = {
  [K in keyof DrawNamespaces as K extends keyof MergeFirstOrder<TSlices>
    ? K
    : never]: MergeFirstOrder<TSlices>[K & keyof MergeFirstOrder<TSlices>];
};

export interface MeasurementUtilities {
  hasMeasurements: boolean;
  getMeasurements: () => Measurements;
}

// Slice provided by a container, or a primitive given a frame callback, to
// the content declared inside it.
export interface DynamicMeasurementContext {
  util: MeasurementUtilities;
}

export type FrameContext = DrawContextOf<[DynamicMeasurementContext]>;
export type FrameCallback = (context: FrameContext) => void;

export interface CoordinateContextProps {
  useLocalCoordinateContext?: boolean;
}

export interface ContainerProps extends WithIdentityKey {
  showBounds?: boolean;
}

export interface LineProps
  extends
    StrokeStyles,
    CappableStrokeStyles,
    WithOpacity,
    WithBlend,
    TransformProps,
    WithIdentityKey {
  start: Point2D;
  end: Point2D;
}

export interface PolygonProps
  extends
    FillStyles,
    StrokeStyles,
    JoinableStrokeStyles,
    CappableStrokeStyles,
    WithOpacity,
    WithBlend,
    TransformProps,
    CoordinateContextProps,
    WithIdentityKey {
  points: Point2D[];
  closePath?: boolean;
  strokeAlignment?: StrokeAlignment;
}

interface BezierSegmentBase {
  point: Point2D;
}

export interface BezierStartSegment extends BezierSegmentBase {}

export interface QuadraticBezierSegment extends BezierSegmentBase {
  control: Point2D;
}

export interface CubicBezierSegment extends BezierSegmentBase {
  control: [Point2D, Point2D];
}

export type BezierCurveSegment = QuadraticBezierSegment | CubicBezierSegment;

export type BezierSegment = BezierStartSegment | BezierCurveSegment;

export type BezierSegments = BezierSegment[];

export interface BezierProps
  extends
    FillStyles,
    StrokeStyles,
    CappableStrokeStyles,
    JoinableStrokeStyles,
    WithOpacity,
    WithBlend,
    TransformProps,
    CoordinateContextProps,
    WithIdentityKey {
  segments: BezierSegments;
  closePath?: boolean;
  strokeAlignment?: StrokeAlignment;
}

export interface CenteredPosition {
  cx: number;
  cy: number;
}

interface EllipticGeometryProps
  extends
    FillStyles,
    StrokeStyles,
    WithOpacity,
    WithBlend,
    TransformProps,
    CenteredPosition {}

export interface EllipticalAttributes
  extends CenteredPosition, EllipticalRadius {
  startInRadians: number;
  endInRadians: number;
}

export interface CircularRadius {
  radius: number;
}

export interface EllipticalRadius {
  radiusX: number;
  radiusY: number;
}

export interface EllipticalAngleStartAndEnd {
  start: number;
  end: number;
}

type ArcRadius = XOR<CircularRadius, EllipticalRadius>;

export type ArcProps = {
  closePath?: boolean;
  strokeAlignment?: StrokeAlignment;
} & EllipticGeometryProps &
  CappableStrokeStyles &
  JoinableStrokeStyles &
  EllipticalAngleStartAndEnd &
  ArcRadius &
  CoordinateContextProps &
  WithIdentityKey;

export interface CircleProps
  extends
    EllipticGeometryProps,
    CoordinateContextProps,
    CircularRadius,
    WithIdentityKey {
  strokeAlignment?: StrokeAlignment;
}

export interface EllipseProps
  extends
    EllipticGeometryProps,
    CoordinateContextProps,
    EllipticalRadius,
    WithIdentityKey {
  strokeAlignment?: StrokeAlignment;
}

export interface RectProps
  extends
    Positioned2D,
    Dimensions2D,
    FillStyles,
    StrokeStyles,
    JoinableStrokeStyles,
    WithOpacity,
    WithBlend,
    TransformProps,
    CoordinateContextProps,
    WithIdentityKey {
  cornerRadius?: Corners | number;
  strokeAlignment?: StrokeAlignment;
}

export interface TextProps
  extends
    Positioned2D,
    TextStyles,
    FillStyles,
    StrokeStyles,
    WithOpacity,
    WithBlend,
    TransformProps,
    CoordinateContextProps,
    WithIdentityKey {}

export interface ImageProps
  extends
    Positioned2D,
    Partial<Dimensions2D>,
    WithOpacity,
    WithBlend,
    WithFitMode,
    TransformProps,
    WithIdentityKey {}

export interface VideoProps
  extends
    Positioned2D,
    Partial<Dimensions2D>,
    WithOpacity,
    WithBlend,
    WithFitMode,
    TransformProps,
    WithIdentityKey {
  clipStartTime?: number | EventTime;
  clipEndTime?: number | EventTime;
  loop?: boolean;
}

// Deliberately WITHOUT Dimensions2D, unlike LayerOptions/PlaceOptions below.
// group() wraps content that is already positioned in the surrounding
// coordinate space -- for caching, transforms, or opacity -- so its frame is
// always the union of what its children occupy. It is not a sizeable surface
// to build new content inside; that is what layer() and place() are for.
//
// A consequence worth knowing: because the frame is derived, a group's content
// can never overflow it, so none of the paint-extent machinery layer/place
// carry applies here.
export interface GroupOptions
  extends Positioned2D, TransformProps, ContainerProps {}

export interface LayerOptions
  extends Positioned2D, Partial<Dimensions2D>, TransformProps, ContainerProps {}

export interface PlaceOptions
  extends Positioned2D, Partial<Dimensions2D>, TransformProps, ContainerProps {}

export interface PlaceOptionsNonPermanent extends PlaceOptions {
  isTemporary?: boolean;
}

export interface IsometricOptions
  extends Partial<Positioned2D>, Partial<Dimensions2D> {
  tileWidth?: number;
}

export interface DrawUtilities {
  sceneMeasurements: Measurements;
  centerOf: (props: Dimensions2D) => Point2D;
}

export interface DrawPrimitives {
  withStyles: (styles: PartialDrawStyles, callback: () => void) => void;
  isometric: (
    callback: (methods: IsometricMethods) => void,
    options?: IsometricOptions,
  ) => void;
  background: (props: BackgroundProps) => void;
  line: (props: LineProps) => IAnimatableLike<LineProps>;
  polygon: (
    props: PolygonProps,
    frame?: FrameCallback,
  ) => IAnimatableLike<PolygonProps>;
  bezier: (
    props: BezierProps,
    frame?: FrameCallback,
  ) => IAnimatableLike<BezierProps>;
  arc: (props: ArcProps, frame?: FrameCallback) => IAnimatableLike<ArcProps>;
  circle: (
    props: CircleProps,
    frame?: FrameCallback,
  ) => IAnimatableLike<CircleProps>;
  ellipse: (
    props: EllipseProps,
    frame?: FrameCallback,
  ) => IAnimatableLike<EllipseProps>;
  rect: (props: RectProps, frame?: FrameCallback) => IAnimatableLike<RectProps>;
  group: {
    (
      frame: FrameCallback,
      props: GroupOptions & Dimensions2D,
    ): IAnimatableLike<GroupOptions>;
    (frame: FrameCallback, props?: GroupOptions): IAnimatableLike<GroupOptions>;
  };
  layer: {
    (
      frame: FrameCallback,
      props: LayerOptions & Dimensions2D,
    ): IAnimatableLike<LayerOptions>;
    (frame: FrameCallback, props?: LayerOptions): IAnimatableLike<LayerOptions>;
  };
  component: (
    component: LayerComponent<any>,
    options?: PlaceOptions,
  ) => IAnimatableLike<PlaceOptions>;
  text: (
    text: string,
    props?: TextProps,
    frame?: FrameCallback,
  ) => IAnimatableLike<TextProps>;
  getTextBounds: (text: string, props?: TextProps) => Bounds;
  image: (imageSrc: string, props?: ImageProps) => IAnimatableLike<ImageProps>;
  video: (videoSrc: string, props?: VideoProps) => IAnimatableLike<VideoProps>;
}

export interface DrawPrimitivePropHelpers {
  background: (props: BackgroundProps) => BackgroundProps;
  line: (props: LineProps) => LineProps;
  polygon: (props: PolygonProps) => PolygonProps;
  bezier: (props: BezierProps) => BezierProps;
  arc: (props: ArcProps) => ArcProps;
  circle: (props: CircleProps) => CircleProps;
  ellipse: (props: EllipseProps) => EllipseProps;
  rect: (props: RectProps) => RectProps;
  group: (props: GroupOptions) => GroupOptions;
  layer: (props: LayerOptions) => LayerOptions;
  text: (props: TextProps) => TextProps;
}

// Slice provided by createDrawContext, once per frame.
export interface DrawAPI {
  render: DrawPrimitives;
  define: { propsFor: DrawPrimitivePropHelpers };
  util: DrawUtilities;
}

export type ContainerDrawAPI = DrawContextOf<
  [DrawAPI, DynamicMeasurementContext]
>;

export interface IsometricMethods {
  tile: (props: IsometricTile) => void;
  cuboid: (props: IsometricCuboid) => void;
}

export interface DrawContext {
  executeDrawCallback: (
    callback: (methods: DrawAPI) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ) => void;
}

// Slice provided by createLayer / createReactiveLayer to the component's own
// render function.
export interface ComponentProps<TProps> {
  props: TProps;
}

export type LayerRenderContext<TProps> = DrawContextOf<
  [ContainerDrawAPI, ComponentProps<TProps>]
>;

export type LayerRenderer<TProps> = (
  context: LayerRenderContext<TProps>,
) => void;

export interface LayerComponent<TProps> {
  props: TProps;
  render: (ambient: ContainerDrawAPI) => void;
}

export type ReactiveContainerDrawAPI = DrawContextOf<
  [ContainerDrawAPI, ReactiveProps]
>;

export type ReactiveLayerRenderContext<TProps> = DrawContextOf<
  [ReactiveContainerDrawAPI, ComponentProps<TProps>]
>;

export type ReactiveLayerRenderer<TProps> = (
  context: ReactiveLayerRenderContext<TProps>,
) => void;

export interface ReactiveLayerComponent<TProps> {
  readonly __componentKind: "reactiveLayer";
  props: TProps;
  render: (ambient: ReactiveContainerDrawAPI) => void;
}

// Slice provided by the scene's animation loop to onRender.
export interface RenderProps {
  current: {
    context: CanvasRenderingContext2D;
    time: number;
  };
}

export type ReactiveStatus = "idle" | "sustained" | "releasing";

// Slice provided by adaptToLayerComponent, from a reactive layer's envelope.
export interface ReactiveProps {
  current: {
    status: ReactiveStatus;
    attackValue: NormalizedFloat;
    releasePeriod: number;
  };
  timeOf: {
    attack: number | null;
    release: number | null;
  };
}

export type PropsFirstFactory<TProps, TInstance> = {} extends TProps
  ? (props?: TProps) => TInstance
  : (props: TProps) => TInstance;
