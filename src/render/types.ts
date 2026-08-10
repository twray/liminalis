import type Animatable from "../core/Animatable";
import type {
  Corners,
  Dimensions2D,
  FillStyles,
  OptionalDimensions2D,
  PartialDrawStyles,
  Point2D,
  Positioned2D,
  StrokeAlignment,
  StrokeStyles,
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

export interface FrameContext {
  width: number;
  height: number;
  center: Point2D;
}

export type FrameCallback = (context: FrameContext) => void;

export interface ClippableFrameProps {
  newCoordinateSpace?: boolean;
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
    ClippableFrameProps {
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
    ClippableFrameProps {
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
  } & ClippableFrameProps;

export interface CircleProps
  extends EllipticGeometryProps, ClippableFrameProps {
  radius: number;
  strokeAlignment?: StrokeAlignment;
}

export interface EllipseProps
  extends EllipticGeometryProps, ClippableFrameProps {
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
    ClippableFrameProps {
  cornerRadius?: Corners | number;
  strokeAlignment?: StrokeAlignment;
}

export interface TextProps
  extends
    Positioned2D,
    FillStyles,
    StrokeStyles,
    WithOpacity,
    WithBlend,
    TransformProps {
  fontStyle?: string;
}

export interface ImageProps
  extends
    Positioned2D,
    OptionalDimensions2D,
    WithOpacity,
    WithBlend,
    TransformProps {
  fit?: "cover" | "contain" | "stretch";
}

export interface FrameProps
  extends Positioned2D, Dimensions2D, TransformProps {}

export interface DrawMethods {
  width: number;
  height: number;
  withStyles: (styles: PartialDrawStyles, callback: () => void) => void;
  background: (props: BackgroundProps) => void;
  center: Point2D;
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
  frame: (props: FrameProps, frame: FrameCallback) => Animatable<FrameProps>;
  text: (text: string, props?: TextProps) => Animatable<TextProps>;
  image: (imageSrc: string, props?: ImageProps) => Animatable<ImageProps>;
}

export interface DrawContext {
  executeDrawCallback: (
    callback: (methods: DrawMethods) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ) => void;
}
