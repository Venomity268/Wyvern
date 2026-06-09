export function guacDisplaySettings(width: number, height: number) {
  return {
    width,
    height,
    dpi: 96,
    "color-depth": 32,
    "resize-method": "display-update",
  };
}
