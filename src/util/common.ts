export function watch<T extends object>(
  obj: T,
  callbacks: {
    onPropertyChange?: (prop: string, newValue: any, oldValue: any) => void;
    onMethodCall?: (method: string, args: any[], result: any) => void;
    onAccess?: () => void;
  },
): T {
  return new Proxy(obj, {
    get(target, property) {
      const value = target[property as keyof T];

      // Intercept function calls
      if (typeof value === "function") {
        return function (...args: any[]) {
          const result = value.apply(target, args);

          if (callbacks.onMethodCall) {
            callbacks.onMethodCall(property as string, args, result);
          }

          callbacks.onAccess?.();

          return result;
        };
      }

      return value;
    },

    set(target, property, newValue) {
      const oldValue = target[property as keyof T];

      if (oldValue !== newValue && callbacks.onPropertyChange) {
        callbacks.onPropertyChange(property as string, newValue, oldValue);
      }

      callbacks.onAccess?.();

      target[property as keyof T] = newValue;
      return true;
    },
  });
}

export function propertyIsWritable(object: Object, property: string) {
  const descriptor =
    Object.getOwnPropertyDescriptor(object, property) ||
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(object), property);

  return (
    descriptor && (descriptor.set !== undefined || descriptor.writable === true)
  );
}

export function clampWithinRange(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

export function clampNonNegativeValue(value: number) {
  return Math.max(0, value);
}

// Builds a deterministic, key-order-independent string for a value, used as
// the cache key for bitmap caching and change detection.
//
// Runs once per primitive per frame, so allocation dominates. The previous
// implementation used map()/join() at every level, allocating an
// intermediate array plus a string per entry plus the joined result -- on
// the order of twenty allocations for a flat props object with eight keys,
// and ~20k allocations per frame in a 1024-primitive scene. Appending to an
// accumulator instead lets the engine build the string in one pass.
//
// Output is byte-identical to the previous implementation: signatures are
// compared against each other, so the format could in principle change, but
// keeping it stable means nothing downstream can be disturbed by this.
// Characters that make a string unsafe to quote by hand. Control chars and
// quote/backslash need JSON escaping; lone surrogates are included so the
// well-formed-stringify behaviour is never diverged from. Anything clean --
// which is every ordinary prop key and CSS colour -- can be wrapped in
// quotes directly, which is roughly 3x cheaper than JSON.stringify.
const NEEDS_JSON_ESCAPING = /[\u0000-\u001f"\\\uD800-\uDFFF]/;

const serializeString = (value: string): string =>
  NEEDS_JSON_ESCAPING.test(value) ? JSON.stringify(value) : '"' + value + '"';

// Beyond this magnitude, value * 1e6 exceeds the safe integer range and the
// rounding below would start losing precision, so the raw value is used.
const MAX_SAFE_ROUNDING_MAGNITUDE = 1e15;

export function stableSerialize(value: unknown): string {
  // Ordered by how often each type actually appears in primitive props.
  const valueType = typeof value;

  if (valueType === "number") {
    const numericValue = value as number;

    if (!Number.isFinite(numericValue)) {
      return String(numericValue);
    }

    // Rounded to six decimal places so values differing only by float noise
    // produce the same key and don't churn the cache -- the same equality
    // relation toFixed(6) gave, but ~4x cheaper. The rendered FORM differs
    // ("30" rather than "30.000000"); that is fine because signatures are
    // only ever compared against each other, never parsed or persisted.
    return Math.abs(numericValue) >= MAX_SAFE_ROUNDING_MAGNITUDE
      ? String(numericValue)
      : String(Math.round(numericValue * 1e6) / 1e6);
  }

  if (valueType === "string") {
    return serializeString(value as string);
  }

  // typeof null is "object", so this has to precede the object branch.
  if (value === null || value === undefined) {
    return String(value);
  }

  if (valueType === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    let serialized = "[";

    for (let index = 0; index < value.length; index++) {
      if (index > 0) {
        serialized += ",";
      }

      serialized += stableSerialize(value[index]);
    }

    return serialized + "]";
  }

  if (valueType === "object") {
    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue).sort();

    let serialized = "{";

    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];

      if (index > 0) {
        serialized += ",";
      }

      serialized += serializeString(key);
      serialized += ":";
      serialized += stableSerialize(objectValue[key]);
    }

    return serialized + "}";
  }

  return JSON.stringify(String(value));
}
