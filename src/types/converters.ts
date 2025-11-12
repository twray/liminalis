import type { NormalizedFloat, TimeExpression } from "./common";
import { isNormalizedFloat, isTimeExpression } from "./guards";

export function toNormalizedFloat(value: number): NormalizedFloat {
  if (!isNormalizedFloat(value)) {
    throw new Error(`Value ${value} must be between 0 and 1`);
  }
  return value as NormalizedFloat;
}

export function toTimeExpression(value: string): TimeExpression {
  if (!isTimeExpression(value)) {
    throw new Error(
      `Value "${value}" is not a valid time format. Expected formats: "0:02", "2:00", "1:00:05"`
    );
  }
  return value as TimeExpression;
}

export function timeExpressionToMs(timeExpression: TimeExpression) {
  let totalTimeInMs = 0;

  const timeExpressionComponents = timeExpression.split(":");

  const seconds = timeExpressionComponents.pop();
  if (!seconds) return totalTimeInMs;
  totalTimeInMs += +seconds * 1000;

  const minutes = timeExpressionComponents.pop();
  if (!minutes) return totalTimeInMs;
  totalTimeInMs += +minutes * 60 * 1000;

  const hours = timeExpressionComponents.pop();
  if (!hours) return totalTimeInMs;
  totalTimeInMs += +hours * 60 * 60 * 1000;

  return totalTimeInMs;
}
