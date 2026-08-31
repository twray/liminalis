export const devicePixelRatio =
  typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)
    ? window.devicePixelRatio
    : 1;
