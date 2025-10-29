export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type ID = string | number;

export interface Timestamped {
  timestamp: Date;
}

export interface Identifiable {
  id: ID;
}

export interface Named {
  name: string;
}

export type NormalizedFloat = number & { readonly __brand: "NormalizedFloat" };

export function isNormalizedFloat(value: number): value is NormalizedFloat {
  return value >= 0 && value <= 1;
}

export function toNormalizedFloat(value: number): NormalizedFloat {
  if (!isNormalizedFloat(value)) {
    throw new Error(`Value ${value} must be between 0 and 1`);
  }
  return value as NormalizedFloat;
}
