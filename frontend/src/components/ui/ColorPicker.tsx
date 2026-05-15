"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { STANDARD_COLORS } from "@/lib/colors";
import { Button } from "./button";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
  position?: "below" | "above";
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function ColorPicker({ color, onChange, onClose, position = "below" }: ColorPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [customColor, setCustomColor] = useState(color);
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  // Recalculate fixed position based on parent element
  const recalcPosition = useCallback(() => {
    if (ref.current?.parentElement) {
      const parentRect = ref.current.parentElement.getBoundingClientRect();
      const pickerHeight = 170;
      const viewportHeight = window.innerHeight;

      const spaceBelow = viewportHeight - parentRect.bottom;
      const spaceAbove = parentRect.top;
      const showAbove = position === "above" || (spaceBelow < pickerHeight && spaceAbove > pickerHeight);

      if (showAbove) {
        setCoords({ bottom: viewportHeight - parentRect.top + 4, left: parentRect.left });
      } else {
        setCoords({ top: parentRect.bottom + 4, left: parentRect.left });
      }
    }
  }, [position]);

  // Calculate initial position and track scroll/resize
  useEffect(() => {
    recalcPosition();

    const handleScrollOrResize = () => recalcPosition();
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true); // capture phase for inner scroll containers
    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [recalcPosition]);

  // Outside-click handler using a ref for onClose to avoid re-registering
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        onCloseRef.current();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isValidHex = HEX_RE.test(customColor);

  return (
    <div
      ref={ref}
      className="fixed bg-paper border rounded-lg shadow-lg p-2 z-50 w-[200px]"
      style={coords ? {
        ...(coords.top != null ? { top: coords.top } : {}),
        ...(coords.bottom != null ? { bottom: coords.bottom } : {}),
        left: coords.left,
      } : { visibility: "hidden" }}
    >
      <div className="grid grid-cols-7 gap-1 mb-2">
        {STANDARD_COLORS.map((c) => (
          <button
            key={c}
            aria-label={`Color ${c}`}
            title={c}
            className={`w-6 h-6 rounded border-2 ${
              c === color
                ? "border-ink ring-1 ring-faint"
                : "border-transparent hover:border-line"
            }`}
            style={{ backgroundColor: c }}
            onClick={() => {
              onChange(c);
              onClose();
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1 border-t pt-2">
        <input
          type="color"
          value={isValidHex ? customColor : "#000000"}
          onChange={(e) => setCustomColor(e.target.value)}
          className="w-6 h-6 border rounded cursor-pointer"
          aria-label="Custom color picker"
        />
        <input
          type="text"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          className={`text-xs border rounded px-1.5 py-0.5 w-20 font-mono ${!isValidHex ? "border-red-300" : ""}`}
          placeholder="#hex"
          aria-label="Custom hex color"
        />
        <Button
          size="sm"
          className="h-5 text-[9px] px-1.5"
          disabled={!isValidHex}
          onClick={() => {
            if (isValidHex) {
              onChange(customColor);
              onClose();
            }
          }}
        >
          Set
        </Button>
      </div>
    </div>
  );
}
