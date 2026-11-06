import { describe, expect, expectTypeOf, it } from "vitest";

import type { Corners, IAnimatableLike, NumericKeys, Point2D } from "./index";

// Every shape of numeric prop the primitives declare (optional, required,
// array of points, union with an object), plus the shapes that hold no
// numeric leaf at all and so must not count as animatable.
interface SampleProps {
  x?: number;
  y: number;
  points: Point2D[];
  cornerRadius?: Corners | number;
  label: string;
  fillStyle?: string;
  tags: string[];
  font: { family: string };
  onTick?: () => void;
}

describe("NumericKeys", () => {
  it("includes optional, required and nested numeric props, and nothing else", () => {
    expectTypeOf<NumericKeys<SampleProps>>().toEqualTypeOf<
      "x" | "y" | "points" | "cornerRadius"
    >();
  });
});

describe("IAnimatableLike", () => {
  it("defaults animateTo() to every numeric prop, and constrains a narrowed key set to numeric props", () => {
    // Never invoked: the assertions are the @ts-expect-error directives,
    // which `npm run type-check` fails on if the line does NOT error.
    const assertTypes = (
      animatable: IAnimatableLike<SampleProps>,
      narrowed: IAnimatableLike<SampleProps, "x" | "y">,
    ): void => {
      animatable.animateTo({
        x: 1,
        y: 1,
        points: [{ x: 1, y: 2 }],
        cornerRadius: { topLeft: 4 },
      });
      // @ts-expect-error -- a string prop is not animatable
      animatable.animateTo({ label: "a" });
      // @ts-expect-error -- an array with no numeric leaves is not animatable
      animatable.animateTo({ tags: [] });

      narrowed.animateTo({ x: 1, y: 2 }).loop().animateTo({ y: 3 });
      // @ts-expect-error -- numeric, but outside the narrowed key set
      narrowed.animateTo({ points: [] });
    };

    // @ts-expect-error -- a narrowed key set may only name numeric props
    type InvalidKeySet = IAnimatableLike<SampleProps, "x" | "label">;

    expectTypeOf<InvalidKeySet>().not.toBeNever();
    expect(assertTypes).toBeTypeOf("function");
  });
});
