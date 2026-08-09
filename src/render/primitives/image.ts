import type { LoadedImageAsset } from "../../core/ImageAssetCache";
import {
  DEFAULT_BLEND_MODE,
  renderWithTransform,
  setContextGlobals,
} from "../common";
import type { ImageProps } from "../types";

export const image = (
  context: CanvasRenderingContext2D,
  asset: LoadedImageAsset,
  props: ImageProps,
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

  const renderedFrameWidth = hasScaledDimensions ? width : asset.width;
  const renderedFrameHeight = hasScaledDimensions ? height : asset.height;

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
      context.drawImage(asset.source, x, y);
      context.restore();
      return;
    }

    switch (fit) {
      case "stretch": {
        context.drawImage(asset.source, x, y, width, height);
        context.restore();
        return;
      }
      case "contain": {
        const containScale = Math.min(
          width / asset.width,
          height / asset.height,
        );
        const containedWidth = asset.width * containScale;
        const containedHeight = asset.height * containScale;
        const dx = x + (width - containedWidth) / 2;
        const dy = y + (height - containedHeight) / 2;

        context.drawImage(
          asset.source,
          dx,
          dy,
          containedWidth,
          containedHeight,
        );
        context.restore();
        return;
      }
      default:
      case "cover": {
        const frameAspect = width / height;
        const sourceAspect = asset.width / asset.height;

        let sx = 0;
        let sy = 0;
        let sourceWidth = asset.width;
        let sourceHeight = asset.height;

        if (sourceAspect > frameAspect) {
          sourceWidth = asset.height * frameAspect;
          sx = (asset.width - sourceWidth) / 2;
        } else if (sourceAspect < frameAspect) {
          sourceHeight = asset.width / frameAspect;
          sy = (asset.height - sourceHeight) / 2;
        }

        context.drawImage(
          asset.source,
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
