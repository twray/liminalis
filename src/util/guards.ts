import type { Corners, NormalizedFloat, TimeExpression } from "../types";

export function isTimeExpression(value: string): value is TimeExpression {
  const timestampRegex = /^(?:(\d+):)?([0-5]?\d):([0-5]\d)$/;
  return timestampRegex.test(value);
}

export function isNormalizedFloat(value: number): value is NormalizedFloat {
  return value >= 0 && value <= 1;
}

export function isCorners(value: Corners | number): value is Corners {
  return typeof value === "object" && value !== null;
}
