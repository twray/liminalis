import {
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_WIDTH,
  renderWithTransform,
  setContextGlobals,
} from "../common";

import type { Bounds, ClipScope, TextProps } from "../types";

const DEFAULT_TEXT_FILL_STYLE = "#333";
const DEFAULT_TEXT_STROKE_STYLE = "transparent";
const DEFAULT_TEXT_FONT_STYLE = "normal";
const DEFAULT_TEXT_FONT_SIZE = "12px";
const DEFAULT_TEXT_FONT_WEIGHT = "normal";
const DEFAULT_TEXT_FONT_FAMILY = "Arial, sans-serif";

export const resolveTextProps = (props: TextProps) => {
  const {
    x = 0,
    y = 0,
    fontStyle = DEFAULT_TEXT_FONT_STYLE,
    fontSize = DEFAULT_TEXT_FONT_SIZE,
    fontWeight = DEFAULT_TEXT_FONT_WEIGHT,
    fontFamily = DEFAULT_TEXT_FONT_FAMILY,
    strokeStyle = DEFAULT_TEXT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    fillStyle = DEFAULT_TEXT_FILL_STYLE,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
    font,
  } = props;

  return {
    x,
    y,
    strokeStyle,
    strokeWidth,
    fillStyle,
    opacity,
    blend,
    font: font ?? `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`,
  };
};

export const getTextBounds = (
  context: CanvasRenderingContext2D,
  text: string,
  props: TextProps,
): Bounds => {
  const { x, y, font } = resolveTextProps(props);

  context.save();

  context.font = font;
  const metrics = context.measureText(text);

  context.restore();

  const width = metrics.width ?? 0;

  const fallbackHeightMatch = font.match(/(\d+(?:\.\d+)?)px/);
  const fallbackHeight = fallbackHeightMatch
    ? Number(fallbackHeightMatch[1])
    : 12;

  const ascent = metrics.actualBoundingBoxAscent ?? fallbackHeight;
  const descent = metrics.actualBoundingBoxDescent ?? 0;
  const height = Math.max(ascent + descent, fallbackHeight);

  const { strokeStyle = "transparent", strokeWidth = 0 } = props;
  const shouldInflateForStroke =
    strokeStyle !== "transparent" && strokeWidth > 0;

  if (!shouldInflateForStroke) {
    return { x, y, width, height };
  }

  const strokeInflation = strokeWidth / 2;

  return {
    x: x - strokeInflation,
    y: y - strokeInflation,
    width: width + strokeWidth,
    height: height + strokeWidth,
  };
};

export const createTextMaskScope = ({
  textValue,
  getProps,
}: {
  textValue: string;
  getProps: () => TextProps;
}): ClipScope => {
  // A fresh scope is created for every text() call in every frame (see
  // queueAnimatableWithFrame in index.ts), so this closure only ever lives
  // for one compositing pass — safe to memoize getTextBounds's real
  // measureText() call here rather than paying for it twice (once in
  // getCompositeInfo, once in apply) on every frame, including cache hits.
  let cachedBounds: Bounds | null = null;

  const resolveBounds = (context: CanvasRenderingContext2D): Bounds => {
    if (!cachedBounds) {
      cachedBounds = getTextBounds(context, textValue, getProps());
    }

    return cachedBounds;
  };

  return {
    getCompositeInfo: (context: CanvasRenderingContext2D) => {
      const props = getProps();

      return {
        bounds: resolveBounds(context),
        // Validity here means "is there any text to mask with", matching
        // drawTextMask's own no-op condition below — not a pixel-size
        // threshold. A real but narrow/small piece of text (tiny font,
        // narrow glyph) can legitimately measure under a pixel in some
        // fonts; treating that as "invalid" would skip local-surface
        // compositing entirely and render it unmasked instead of masked
        // but small.
        isValid: textValue.length > 0,
        useLocalCoordinateContext: !!props.useLocalCoordinateContext,
      };
    },
    // The compositor already gives this group its own correctly-sized,
    // correctly-positioned local surface (see DrawGroupManager's
    // compositeGroup / DrawGroupBitmapCache.renderGroup) — this only needs
    // to handle the same local-origin translate every other scope applies.
    apply: (context: CanvasRenderingContext2D): void => {
      const props = getProps();

      if (!props.useLocalCoordinateContext) {
        return;
      }

      const bounds = resolveBounds(context);
      context.translate(bounds.x, bounds.y);
    },
    // Runs once, immediately after this group's real content has been drawn
    // into its local surface — masks that surface's own pixels down to the
    // glyph shape via destination-in, in the same local coordinate frame the
    // content was just drawn in.
    postProcessLocalSurface: (surfaceContext, _bounds): void => {
      const props = getProps();
      const context = surfaceContext as CanvasRenderingContext2D;

      context.save();
      context.globalCompositeOperation = "destination-in";
      drawTextMask(context, textValue, props);
      context.restore();
    },
  };
};

export const drawTextMask = (
  context: CanvasRenderingContext2D,
  textValue: string,
  props: TextProps,
): void => {
  if (textValue.length === 0) {
    return;
  }

  const { x, y, font } = resolveTextProps(props);
  const bounds = getTextBounds(context, textValue, props);

  renderWithTransform(context, props, bounds, () => {
    context.save();

    context.font = font;
    context.textBaseline = "top";
    context.fillStyle = "#000";
    context.fillText(textValue, x, y);

    context.restore();
  });
};

export const text = (
  context: CanvasRenderingContext2D,
  textValue: string,
  props: TextProps,
): void => {
  const { x, y, strokeStyle, strokeWidth, fillStyle, opacity, blend, font } =
    resolveTextProps(props);

  const bounds = getTextBounds(context, textValue, props);

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    context.font = font;
    context.textBaseline = "top";

    if (fillStyle !== "transparent") {
      context.fillStyle = fillStyle;
      context.fillText(textValue, x, y);
    }

    if (strokeStyle !== "transparent" && strokeWidth > 0) {
      context.strokeStyle = strokeStyle;
      context.lineWidth = strokeWidth;
      context.strokeText(textValue, x, y);
    }

    context.restore();
  });
};
