import {
  imageAssetCache,
  type LoadedImageAsset,
} from "../../core/ImageAssetCache";
import { drawImageSourceWithFit } from "../common";
import type { Bounds, ImageProps } from "../types";

export const getImageBounds = (
  imageSrc: string,
  props: ImageProps,
): Bounds | null => {
  const { x = 0, y = 0, width, height } = props;

  if (typeof width === "number" && typeof height === "number") {
    return {
      x,
      y,
      width,
      height,
    };
  }

  const readyImageAsset = imageAssetCache.getReadyAsset(imageSrc);

  if (!readyImageAsset) {
    return null;
  }

  return {
    x,
    y,
    width: readyImageAsset.width,
    height: readyImageAsset.height,
  };
};

export const image = (
  context: CanvasRenderingContext2D,
  asset: LoadedImageAsset,
  props: ImageProps,
): void =>
  // Geometry lives in drawImageSourceWithFit so video() composites through
  // exactly the same cover/contain/stretch path -- an HTMLVideoElement is a
  // CanvasImageSource just as a decoded bitmap is, so nothing about the fit
  // maths is image-specific.
  drawImageSourceWithFit(
    context,
    asset.source,
    asset.width,
    asset.height,
    props,
  );
