import type { PartialDrawStyles } from "../types";

class AppliedStylesManager {
  #appliedStyles: PartialDrawStyles;

  constructor(initialStyles: PartialDrawStyles) {
    this.#appliedStyles = { ...initialStyles };
  }

  mergeStyles<T extends PartialDrawStyles>(props: T): T {
    return {
      ...this.#appliedStyles,
      ...props,
    };
  }

  withStyles<T>(styles: PartialDrawStyles, callbackFn: () => T): T {
    const previousStyles = this.#appliedStyles;
    this.#appliedStyles = { ...this.#appliedStyles, ...styles };

    try {
      return callbackFn();
    } finally {
      this.#appliedStyles = previousStyles;
    }
  }
}

export default AppliedStylesManager;