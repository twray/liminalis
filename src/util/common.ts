export function watch<T extends object>(
  obj: T,
  callbacks: {
    onPropertyChange?: (prop: string, newValue: any, oldValue: any) => void;
    onMethodCall?: (method: string, args: any[], result: any) => void;
  }
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
