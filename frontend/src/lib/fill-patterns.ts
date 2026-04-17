import { FillStyle } from "./types";

/**
 * Returns CSS properties for rendering a fill pattern on a node.
 */
export function getFillStyle(
  fillColor: string | null,
  fillStyle: FillStyle | string | null
): React.CSSProperties {
  const style = (fillStyle ?? "none") as FillStyle;
  const color = fillColor ?? "#94a3b8";

  switch (style) {
    case "solid":
      return { backgroundColor: color };

    case "none":
    default:
      return { backgroundColor: "white" };
  }
}

export const FILL_STYLE_OPTIONS: { value: FillStyle; label: string }[] = [
  { value: "none", label: "None" },
  { value: "solid", label: "Solid" },
];
