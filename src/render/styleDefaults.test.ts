import { afterEach, describe, expect, it, vi } from "vitest";

import { parseColorToRgb } from "../util";
import type * as CommonModule from "./common";
import { createSpyMockContext } from "./primitives/testMockCanvasContext";
import type { DrawAPI } from "./types";

// Unstyled primitives must render with the defaults declared in common.ts,
// and with nothing else.
//
// The suite runs twice. First against common.ts as declared. Then with every
// default in common.ts replaced by a sentinel no one would ever hard-code:
// the expectations read whatever common.ts currently exports, so a default
// restated anywhere else -- a renderer's own literal, a constant local to a
// primitive, a second seed -- still renders the old value, and fails here.

type Common = typeof CommonModule;

type DefaultOverrides = Pick<
  Common,
  | "DEFAULT_FILL_STYLE"
  | "DEFAULT_STROKE_STYLE"
  | "DEFAULT_STROKE_WIDTH"
  | "DEFAULT_STROKE_ALIGNMENT"
  | "DEFAULT_STROKE_LINE_CAP"
  | "DEFAULT_STROKE_LINE_JOIN"
  | "DEFAULT_STROKE_MITER_LIMIT"
  | "DEFAULT_BLEND_MODE"
  | "DEFAULT_OPACITY"
  | "DEFAULT_SHAPE_STYLES"
  | "DEFAULT_TEXT_STYLES"
  | "DEFAULT_ISOMETRIC_STYLES"
>;

const SENTINEL_FILL_STYLE = "#0a0b0c";
const SENTINEL_STROKE_STYLE = "#0d0e0f";
const SENTINEL_STROKE_WIDTH = 7;

// Cast: the real declarations are `as const`, so their types are the literal
// values themselves -- which is exactly what a sentinel must differ from.
const SENTINEL_DEFAULTS = {
  DEFAULT_FILL_STYLE: SENTINEL_FILL_STYLE,
  DEFAULT_STROKE_STYLE: SENTINEL_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH: SENTINEL_STROKE_WIDTH,
  DEFAULT_STROKE_ALIGNMENT: "outside",
  DEFAULT_STROKE_LINE_CAP: "square",
  DEFAULT_STROKE_LINE_JOIN: "bevel",
  DEFAULT_STROKE_MITER_LIMIT: 13,
  DEFAULT_BLEND_MODE: "multiply",
  DEFAULT_OPACITY: 0.75,
  DEFAULT_SHAPE_STYLES: {
    fillStyle: SENTINEL_FILL_STYLE,
    strokeStyle: SENTINEL_STROKE_STYLE,
    strokeWidth: SENTINEL_STROKE_WIDTH,
  },
  DEFAULT_TEXT_STYLES: {
    fillStyle: "#101112",
    strokeStyle: "#131415",
    strokeWidth: 5,
    fontStyle: "italic",
    fontSize: "31px",
    fontWeight: "bold",
    fontFamily: "Sentinel",
  },
  DEFAULT_ISOMETRIC_STYLES: {
    fillStyle: "#161718",
    strokeStyle: "#191a1b",
    strokeWidth: 4,
  },
} as unknown as DefaultOverrides;

// The context state at the moment something was actually painted.
interface PaintSnapshot {
  call: "fill" | "stroke" | "fillText" | "strokeText";
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: unknown;
  lineJoin: unknown;
  lineCap: unknown;
  miterLimit: unknown;
  globalAlpha: unknown;
  globalCompositeOperation: unknown;
  font: unknown;
  lastRoundRect: unknown[] | undefined;
}

const RECORDED_STATE = [
  "fillStyle",
  "strokeStyle",
  "lineWidth",
  "lineJoin",
  "lineCap",
  "miterLimit",
  "globalAlpha",
  "globalCompositeOperation",
  "font",
] as const;

// A spy context whose drawing state starts out UNSET, so a value can only
// have come from the primitive -- and so withInheritedContextGlobals finds no
// ambient blend or alpha to inherit.
const createPaintRecordingContext = () => {
  const context = createSpyMockContext();
  const state: Record<string, unknown> = {};
  const paints: PaintSnapshot[] = [];
  let lastRoundRect: unknown[] | undefined;

  for (const key of RECORDED_STATE) {
    Object.defineProperty(context, key, {
      configurable: true,
      get: () => state[key],
      set: (value: unknown) => {
        state[key] = value;
      },
    });
  }

  const record =
    (call: PaintSnapshot["call"]) =>
    (..._args: unknown[]): void => {
      paints.push({ call, ...state, lastRoundRect } as PaintSnapshot);
    };

  Object.assign(context, {
    fill: vi.fn(record("fill")),
    stroke: vi.fn(record("stroke")),
    fillText: vi.fn(record("fillText")),
    strokeText: vi.fn(record("strokeText")),
    roundRect: vi.fn((...args: unknown[]) => {
      lastRoundRect = args;
    }),
  });

  return { context, paints };
};

const paintsOf = (
  paints: PaintSnapshot[],
  call: PaintSnapshot["call"],
): PaintSnapshot[] => paints.filter((paint) => paint.call === call);

describe.each([
  { scenario: "as declared in common.ts", overrides: null },
  {
    scenario: "after every default in common.ts is changed",
    overrides: SENTINEL_DEFAULTS,
  },
])("unstyled primitives, $scenario", ({ overrides }) => {
  const load = async () => {
    vi.resetModules();

    if (overrides) {
      vi.doMock("./common", async (importOriginal) => ({
        ...(await importOriginal<Common>()),
        ...overrides,
      }));
    }

    const common = await import("./common");
    const { createDrawContext } = await import("./index");

    const paint = (declare: (d: DrawAPI) => void): PaintSnapshot[] => {
      const { context, paints } = createPaintRecordingContext();

      createDrawContext({ enableBitmapBasedCaching: false }).executeDrawCallback(
        declare,
        context,
        800,
        600,
        0,
      );

      return paints;
    };

    return { common, paint };
  };

  afterEach(() => {
    vi.doUnmock("./common");
  });

  // What every stroked shape must have been painted with.
  const expectShapeStroke = (stroke: PaintSnapshot | undefined, c: Common) =>
    expect(stroke).toMatchObject({
      strokeStyle: c.DEFAULT_STROKE_STYLE,
      lineWidth: c.DEFAULT_STROKE_WIDTH,
      globalAlpha: c.DEFAULT_OPACITY,
      globalCompositeOperation: c.DEFAULT_BLEND_MODE,
    });

  // A transparent default fill is not painted at all; any other default is.
  const expectShapeFill = (paints: PaintSnapshot[], c: Common) => {
    const fills = paintsOf(paints, "fill");

    if (c.DEFAULT_FILL_STYLE === "transparent") {
      expect(fills).toHaveLength(0);
    } else {
      expect(fills[0]).toMatchObject({
        fillStyle: c.DEFAULT_FILL_STYLE,
        globalAlpha: c.DEFAULT_OPACITY,
        globalCompositeOperation: c.DEFAULT_BLEND_MODE,
      });
    }
  };

  it("seeds the shape family from the shape defaults", async () => {
    const { common: c } = await load();

    expect(c.DEFAULT_SHAPE_STYLES).toEqual({
      fillStyle: c.DEFAULT_FILL_STYLE,
      strokeStyle: c.DEFAULT_STROKE_STYLE,
      strokeWidth: c.DEFAULT_STROKE_WIDTH,
    });
  });

  it("rect: fill, stroke, join, miter limit and stroke alignment", async () => {
    const { common: c, paint } = await load();
    const rect = { x: 100, y: 100, width: 40, height: 20 };
    const paints = paint((d) => d.render.rect(rect));
    const stroke = paintsOf(paints, "stroke")[0];

    expectShapeFill(paints, c);
    expectShapeStroke(stroke, c);
    expect(stroke).toMatchObject({
      lineJoin: c.DEFAULT_STROKE_LINE_JOIN,
      miterLimit: c.DEFAULT_STROKE_MITER_LIMIT,
    });

    // The stroke's path shows which alignment it was drawn with: centred on
    // the edge, or offset half a stroke inside/outside it.
    const halfStroke = c.DEFAULT_STROKE_WIDTH / 2;
    const offset =
      c.DEFAULT_STROKE_ALIGNMENT === "inside"
        ? -halfStroke
        : c.DEFAULT_STROKE_ALIGNMENT === "outside"
          ? halfStroke
          : 0;

    expect(stroke?.lastRoundRect?.slice(0, 4)).toEqual([
      rect.x - offset,
      rect.y - offset,
      rect.width + offset * 2,
      rect.height + offset * 2,
    ]);
  });

  it.each([
    {
      primitive: "circle",
      declare: (d: DrawAPI) => d.render.circle({ cx: 100, cy: 100, radius: 20 }),
    },
    {
      primitive: "ellipse",
      declare: (d: DrawAPI) =>
        d.render.ellipse({ cx: 100, cy: 100, radiusX: 30, radiusY: 20 }),
    },
    {
      primitive: "arc",
      declare: (d: DrawAPI) =>
        d.render.arc({ cx: 100, cy: 100, radius: 20, start: 0, end: 90 }),
    },
    {
      primitive: "polygon",
      declare: (d: DrawAPI) =>
        // Closed, because only a closed polygon is filled at all.
        d.render.polygon({
          points: [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 25, y: 40 },
          ],
          closePath: true,
        }),
    },
    {
      primitive: "bezier",
      declare: (d: DrawAPI) =>
        d.render.bezier({
          segments: [
            { point: { x: 0, y: 0 } },
            {
              control: [
                { x: 10, y: 40 },
                { x: 40, y: 10 },
              ],
              point: { x: 50, y: 50 },
            },
          ],
          closePath: true,
        }),
    },
  ])(
    "$primitive: fill, stroke, join, miter limit and cap",
    async ({ declare }) => {
      const { common: c, paint } = await load();
      const paints = paint(declare);
      const stroke = paintsOf(paints, "stroke")[0];

      expectShapeFill(paints, c);
      expectShapeStroke(stroke, c);
      expect(stroke).toMatchObject({
        lineJoin: c.DEFAULT_STROKE_LINE_JOIN,
        miterLimit: c.DEFAULT_STROKE_MITER_LIMIT,
        lineCap: c.DEFAULT_STROKE_LINE_CAP,
      });
    },
  );

  it("line: stroke and cap", async () => {
    const { common: c, paint } = await load();
    const paints = paint((d) =>
      d.render.line({ start: { x: 0, y: 0 }, end: { x: 50, y: 50 } }),
    );
    const stroke = paintsOf(paints, "stroke")[0];

    expectShapeStroke(stroke, c);
    expect(stroke).toMatchObject({ lineCap: c.DEFAULT_STROKE_LINE_CAP });
  });

  it("text: the text family's fill, stroke and font", async () => {
    const { common: c, paint } = await load();
    const paints = paint((d) => d.render.text("Hello", { x: 10, y: 20 }));
    const text = c.DEFAULT_TEXT_STYLES;
    const font = `${text.fontStyle} ${text.fontWeight} ${text.fontSize} ${text.fontFamily}`;

    expect(paintsOf(paints, "fillText")[0]).toMatchObject({
      fillStyle: text.fillStyle,
      font,
      globalAlpha: c.DEFAULT_OPACITY,
      globalCompositeOperation: c.DEFAULT_BLEND_MODE,
    });

    const strokes = paintsOf(paints, "strokeText");

    if (text.strokeStyle === "transparent") {
      expect(strokes).toHaveLength(0);
    } else {
      expect(strokes[0]).toMatchObject({
        strokeStyle: text.strokeStyle,
        lineWidth: text.strokeWidth,
        font,
      });
    }
  });

  it.each([
    {
      primitive: "tile",
      declare: (d: DrawAPI) =>
        d.render.isometric(({ render }) => {
          render.tile({
            type: "base",
            isoX: 0,
            isoY: 0,
            isoZ: 0,
            width: 1,
            height: 1,
          });
        }),
    },
    {
      primitive: "cuboid",
      declare: (d: DrawAPI) =>
        d.render.isometric(({ render }) => {
          render.cuboid({
            isoX: 0,
            isoY: 0,
            isoZ: 0,
            lengthX: 1,
            lengthY: 1,
            lengthZ: 1,
          });
        }),
    },
  ])(
    "isometric $primitive: the isometric family's fill and stroke",
    async ({ declare }) => {
      const { common: c, paint } = await load();
      const paints = paint(declare);
      const iso = c.DEFAULT_ISOMETRIC_STYLES;

      // Every face (one for a tile, three for a cuboid) is stroked with the
      // isometric family's stroke at the default opacity.
      const strokes = paintsOf(paints, "stroke");

      expect(strokes.length).toBeGreaterThan(0);

      for (const stroke of strokes) {
        expect(stroke).toMatchObject({
          strokeStyle: iso.strokeStyle,
          lineWidth: iso.strokeWidth,
          globalAlpha: c.DEFAULT_OPACITY,
        });
      }

      // The top face is filled with the fill colour itself; the sides are
      // shaded from it, so only the top is compared.
      const [r, g, b] = parseColorToRgb(iso.fillStyle);
      const fillStyles = paintsOf(paints, "fill").map((fill) => fill.fillStyle);

      expect(fillStyles).toContain(`rgb(${r}, ${g}, ${b})`);
    },
  );
});
