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
export type TimeExpression = string & { readonly __brand: "TimeExpression" };
export type EasingFunction = (t: number) => number;
