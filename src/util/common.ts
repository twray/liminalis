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

export function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return String(value);
    }

    return value.toFixed(6);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue).sort();

    return `{${keys
      .map(
        (key) => `${JSON.stringify(key)}:${stableSerialize(objectValue[key])}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(String(value));
}
