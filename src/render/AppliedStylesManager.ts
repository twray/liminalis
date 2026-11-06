import type { PartialDrawStyles } from "../types";

// The primitive families whose default styles differ. See the DEFAULT_*_STYLES
// declarations in common.ts, the one place those defaults are declared.
export type StyleFamily = "shape" | "text" | "isometric";

export type DefaultStylesByFamily = Record<StyleFamily, PartialDrawStyles>;

// Resolves a primitive's styles, in increasing precedence:
//
// 1. its family's defaults, seeded once at construction;
// 2. whatever the enclosing withStyles() scopes applied;
// 3. the primitive's own props.
//
// The applied layer is shared by every family -- withStyles({ fillStyle })
// reaches shapes, text and isometric primitives alike -- while each family
// keeps its own defaults, so one family's defaults never override another's.
class AppliedStylesManager {
  readonly #defaultStylesByFamily: DefaultStylesByFamily;
  #appliedStyles: PartialDrawStyles = {};

  constructor(defaultStylesByFamily: DefaultStylesByFamily) {
    this.#defaultStylesByFamily = defaultStylesByFamily;
  }

  mergeStyles<T extends PartialDrawStyles>(props: T, family: StyleFamily): T {
    return {
      ...this.#defaultStylesByFamily[family],
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
