import { FrameProps } from "../types";
import { rect, rectPathDescriptor } from "./rect";

export const frame = (context: CanvasRenderingContext2D, props: FrameProps) => {
  console.log("frame called with props:", props);
  rect(context, { ...props, newCoordinateSpace: true });
};

export const framePathDescriptor = rectPathDescriptor;
