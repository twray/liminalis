import type Animatable from "../core/Animatable";
import type {
  Corners,
  Dimensions2D,
  FillStyles,
  PartialDrawStyles,
  Point2D,
  Positioned2D,
  StrokeAlignment,
  StrokeStyles,
  TextStyles,
  WithBlend,
  WithOpacity,
  XOR,
} from "../types";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
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

export interface ContextGlobalProps extends WithOpacity, WithBlend {}

export interface ClipScope {
  apply?: (context: CanvasRenderingContext2D) => void;
  getSignature?: () => string;
  renderWithScope?: (params: {
    context: CanvasRenderingContext2D;
    renderWithinScope: () => void;
    contextController: RenderContextController;
  }) => void;
}

export interface RenderContextController {
  getContext: () => CanvasRenderingContext2D;
  setContext: (context: CanvasRenderingContext2D) => void;
}

export interface Measurements {
  width: number;
  height: number;
  center: Point2D;
}

export interface DynamicMeasurementContext {
  hasMeasurements: boolean;
  getMeasurements: () => Measurements;
}

export interface StaticMeasurementContext extends DynamicMeasurementContext {
  measurements: Measurements;
}

export type MeasurementContext =
  | DynamicMeasurementContext
  | StaticMeasurementContext;

export type FrameContext = DynamicMeasurementContext;
export type StaticFrameContext = StaticMeasurementContext;

export type FrameCallback = (context: FrameContext) => void;
export type StaticFrameCallback = (context: StaticFrameContext) => void;

export interface CoordinateContextProps {
  useLocalCoordinateContext?: boolean;
}

export interface ContainerProps {
  showBounds?: boolean;
}

export interface ClippingOptionsProps {
  clipContent?: boolean;
}

export interface LineProps
  extends StrokeStyles, WithOpacity, WithBlend, TransformProps {
  start: Point2D;
  end: Point2D;
}

export interface PolygonProps
  extends
    StrokeStyles,
    WithOpacity,
    WithBlend,
    TransformProps,
    CoordinateContextProps {
  points: Point2D[];
  closePath?: boolean;
  strokeAlignment?: StrokeAlignment;
}

export interface BezierStartSegment {
  point: Point2D;
  control?: never;
}

export interface QuadraticBezierSegment {
  control: Point2D;
  point: Point2D;
}

export interface CubicBezierSegment {
  control: Point2D[];
  point: Point2D;
}

export type BezierCurveSegment = XOR<
  QuadraticBezierSegment,
  CubicBezierSegment
>;

export type BezierSegment = BezierStartSegment | BezierCurveSegment;

export type BezierSegments = BezierSegment[];

export interface BezierProps
  extends
    FillStyles,
    StrokeStyles,
    WithOpacity,
    WithBlend,
    TransformProps,
    CoordinateContextProps {
  segments: BezierSegments;
  closePath?: boolean;
  strokeAlignment?: StrokeAlignment;
}

interface EllipticGeometryProps
  extends FillStyles, StrokeStyles, WithOpacity, WithBlend, TransformProps {
  cx: number;
  cy: number;
}

interface CircularRadius {
  radius: number;
}

interface EllipticalRadius {
  radiusX: number;
  radiusY: number;
}

type ArcRadius = XOR<CircularRadius, EllipticalRadius>;

export type ArcProps = EllipticGeometryProps &
  ArcRadius & {
    start: number;
    end: number;
    closePath?: boolean;
    strokeAlignment?: StrokeAlignment;
  } & CoordinateContextProps;

export interface CircleProps
  extends EllipticGeometryProps, CoordinateContextProps {
  radius: number;
  strokeAlignment?: StrokeAlignment;
}

export interface EllipseProps
  extends EllipticGeometryProps, CoordinateContextProps {
  radiusX: number;
  radiusY: number;
  strokeAlignment?: StrokeAlignment;
}

export interface RectProps
  extends
    Positioned2D,
    Dimensions2D,
    FillStyles,
    StrokeStyles,
    WithOpacity,
    WithBlend,
    TransformProps,
    CoordinateContextProps {
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
    CoordinateContextProps {}

export interface ImageProps
  extends
    Positioned2D,
    Partial<Dimensions2D>,
    WithOpacity,
    WithBlend,
    TransformProps {
  fit?: "cover" | "contain" | "stretch";
}

export interface GroupOptions
  extends Positioned2D, Partial<Dimensions2D>, TransformProps, ContainerProps {}

export interface LayerOptions
  extends Positioned2D, Partial<Dimensions2D>, TransformProps, ContainerProps {}

export type DrawProperties = StaticMeasurementContext;

export interface DrawPrimitives {
  withStyles: (styles: PartialDrawStyles, callback: () => void) => void;
  background: (props: BackgroundProps) => void;
  centerOf: (props: Dimensions2D) => Point2D;
  line: (props: LineProps) => Animatable<LineProps>;
  polygon: (
    props: PolygonProps,
    frame?: FrameCallback,
  ) => Animatable<PolygonProps>;
  bezier: (
    props: BezierProps,
    frame?: FrameCallback,
  ) => Animatable<BezierProps>;
  arc: (props: ArcProps, frame?: FrameCallback) => Animatable<ArcProps>;
  circle: (
    props: CircleProps,
    frame?: FrameCallback,
  ) => Animatable<CircleProps>;
  ellipse: (
    props: EllipseProps,
    frame?: FrameCallback,
  ) => Animatable<EllipseProps>;
  rect: (props: RectProps, frame?: FrameCallback) => Animatable<RectProps>;
  group: {
    (
      frame: StaticFrameCallback,
      props: GroupOptions & Dimensions2D,
    ): Animatable<GroupOptions>;
    (frame: FrameCallback, props?: GroupOptions): Animatable<GroupOptions>;
  };
  layer: {
    (
      frame: StaticFrameCallback,
      props: LayerOptions & Dimensions2D,
    ): Animatable<LayerOptions>;
    (frame: FrameCallback, props?: LayerOptions): Animatable<LayerOptions>;
  };
  text: (
    text: string,
    props?: TextProps,
    frame?: FrameCallback,
  ) => Animatable<TextProps>;
  getTextBounds: (text: string, props?: TextProps) => Bounds;
  image: (imageSrc: string, props?: ImageProps) => Animatable<ImageProps>;
}

export interface DrawPrimitivePropHelpers {
  defineBackgroundProps: (props: BackgroundProps) => BackgroundProps;
  defineLineProps: (props: LineProps) => LineProps;
  definePolygonProps: (props: PolygonProps) => PolygonProps;
  defineBezierProps: (props: BezierProps) => BezierProps;
  defineArcProps: (props: ArcProps) => ArcProps;
  defineCircleProps: (props: CircleProps) => CircleProps;
  defineEllipseProps: (props: EllipseProps) => EllipseProps;
  defineRectProps: (props: RectProps) => RectProps;
  defineGroupProps: (props: GroupOptions) => GroupOptions;
  defineLayerProps: (props: LayerOptions) => LayerOptions;
  defineTextProps: (props: TextProps) => TextProps;
}

export interface DrawMethods
  extends DrawProperties, DrawPrimitives, DrawPrimitivePropHelpers {}

export interface DrawContext {
  executeDrawCallback: (
    callback: (methods: DrawMethods) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ) => void;
}
