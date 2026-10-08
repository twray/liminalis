type MergeTwo<A, B> = {
  [K in keyof A | keyof B]: K extends keyof A & keyof B
    ? Simplify<A[K] & B[K]>
    : K extends keyof A
      ? A[K]
      : K extends keyof B
        ? B[K]
        : never;
};

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type MergeFirstOrder<T extends readonly unknown[]> = T extends readonly [
  infer A,
  infer B,
  ...infer Rest,
]
  ? MergeFirstOrder<[MergeTwo<A, B>, ...Rest]>
  : T extends readonly [infer A]
    ? Simplify<A>
    : {};
