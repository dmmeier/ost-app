"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { getFillStyle, FILL_STYLE_OPTIONS } from "@/lib/fill-patterns";
import { FillStyle, BubbleDefaults } from "@/lib/types";
import { DEFAULT_BUBBLE_DEFAULTS } from "@/lib/colors";

interface NodeStyleDialogProps {
  nodeId: string;
  nodeType: string;
  currentOverrides: {
    override_border_color: string | null;
    override_border_width: number | null;
    override_fill_color: string | null;
    override_fill_style: FillStyle | null;
    override_font_light: boolean | null;
  };
  inheritedFontLight?: boolean;
  bubbleDefaults: BubbleDefaults;
  onSave: (overrides: {
    override_border_color: string | null;
    override_border_width: number | null;
    override_fill_color: string | null;
    override_fill_style: string | null;
    override_font_light: boolean | null;
  }) => void;
  onClose: () => void;
}

export function NodeStyleDialog({
  nodeType,
  currentOverrides,
  inheritedFontLight = false,
  bubbleDefaults,
  onSave,
  onClose,
}: NodeStyleDialogProps) {
  const typeDefaults = bubbleDefaults[nodeType] ??
    DEFAULT_BUBBLE_DEFAULTS[nodeType] ?? { border_color: "#94a3b8", border_width: 2 };

  const [borderColor, setBorderColor] = useState<string | null>(currentOverrides.override_border_color);
  const [borderWidth, setBorderWidth] = useState<number | null>(currentOverrides.override_border_width);
  const [fillColor, setFillColor] = useState<string | null>(currentOverrides.override_fill_color);
  const [fillStyle, setFillStyle] = useState<FillStyle | null>(currentOverrides.override_fill_style);
  const [fontLight, setFontLight] = useState<boolean | null>(currentOverrides.override_font_light);

  const [borderColorPickerOpen, setBorderColorPickerOpen] = useState(false);
  const [fillColorPickerOpen, setFillColorPickerOpen] = useState(false);

  // Effective values (override or default)
  const effectiveBorderColor = borderColor ?? typeDefaults.border_color;
  const effectiveBorderWidth = borderWidth ?? typeDefaults.border_width;
  const effectiveFillColor = fillColor ?? "#94a3b8";
  const effectiveFillStyle = fillStyle ?? "none";
  const effectiveFontLight = fontLight ?? inheritedFontLight;

  const hasOverrides = borderColor !== null || borderWidth !== null || fillColor !== null || fillStyle !== null || fontLight !== null;

  const handleReset = () => {
    setBorderColor(null);
    setBorderWidth(null);
    setFillColor(null);
    setFillStyle(null);
    setFontLight(null);
  };

  const handleSave = () => {
    // If fill style is active but no color was picked, use the preview default
    const savedFillColor = (fillStyle && fillStyle !== "none" && fillColor === null)
      ? effectiveFillColor
      : fillColor;
    onSave({
      override_border_color: borderColor,
      override_border_width: borderWidth,
      override_fill_color: savedFillColor,
      override_fill_style: fillStyle,
      override_font_light: fontLight,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl border w-[360px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Style Override</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Preview */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-16">Preview</span>
            <div
              className="w-24 h-16 rounded-lg flex items-center justify-center"
              style={{
                borderColor: effectiveBorderColor,
                borderWidth: `${effectiveBorderWidth}px`,
                borderStyle: "solid",
                ...getFillStyle(effectiveFillColor, effectiveFillStyle),
              }}
            >
              <span className={`text-sm font-medium ${effectiveFontLight ? "text-white" : "text-gray-900"}`}>Aa</span>
            </div>
          </div>

          {/* Border Color */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-gray-600">Border Color</span>
              {borderColor !== null && (
                <button
                  onClick={() => setBorderColor(null)}
                  className="text-[9px] text-gray-400 hover:text-gray-600 underline"
                >
                  use default
                </button>
              )}
            </div>
            <div className="relative">
              <button
                className="flex items-center gap-2 border rounded px-2 py-1.5 hover:bg-gray-50"
                onClick={() => setBorderColorPickerOpen(!borderColorPickerOpen)}
              >
                <span
                  className="w-5 h-5 rounded border"
                  style={{ backgroundColor: effectiveBorderColor }}
                />
                <span className="text-xs font-mono text-gray-500">{effectiveBorderColor}</span>
                {borderColor === null && <span className="text-[9px] text-gray-400">(default)</span>}
              </button>
              {borderColorPickerOpen && (
                <ColorPicker
                  color={effectiveBorderColor}
                  onChange={(c) => setBorderColor(c)}
                  onClose={() => setBorderColorPickerOpen(false)}
                />
              )}
            </div>
          </div>

          {/* Border Width */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-gray-600">Border Width</span>
              {borderWidth !== null && (
                <button
                  onClick={() => setBorderWidth(null)}
                  className="text-[9px] text-gray-400 hover:text-gray-600 underline"
                >
                  use default
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={6}
                step={0.5}
                value={effectiveBorderWidth}
                onChange={(e) => setBorderWidth(parseFloat(e.target.value))}
                className="w-40 h-3 accent-gray-500"
              />
              <span className="text-xs font-medium text-gray-600 w-8 text-center bg-gray-100 rounded px-1">
                {effectiveBorderWidth}px
              </span>
              {borderWidth === null && <span className="text-[9px] text-gray-400">(default)</span>}
            </div>
          </div>

          {/* Fill Color */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-gray-600">Fill Color</span>
              {fillColor !== null && (
                <button
                  onClick={() => setFillColor(null)}
                  className="text-[9px] text-gray-400 hover:text-gray-600 underline"
                >
                  clear
                </button>
              )}
            </div>
            <div className="relative">
              <button
                className="flex items-center gap-2 border rounded px-2 py-1.5 hover:bg-gray-50"
                onClick={() => setFillColorPickerOpen(!fillColorPickerOpen)}
              >
                <span
                  className="w-5 h-5 rounded border"
                  style={{ backgroundColor: fillColor ?? "#ffffff" }}
                />
                <span className="text-xs font-mono text-gray-500">{fillColor ?? "none"}</span>
              </button>
              {fillColorPickerOpen && (
                <ColorPicker
                  color={fillColor ?? "#94a3b8"}
                  onChange={(c) => setFillColor(c)}
                  onClose={() => setFillColorPickerOpen(false)}
                />
              )}
            </div>
          </div>

          {/* Fill Style */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-gray-600">Fill Style</span>
              {fillStyle !== null && (
                <button
                  onClick={() => setFillStyle(null)}
                  className="text-[9px] text-gray-400 hover:text-gray-600 underline"
                >
                  clear
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {FILL_STYLE_OPTIONS.map((opt) => {
                const isActive = effectiveFillStyle === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setFillStyle(opt.value)}
                    className={`flex flex-col items-center gap-1 p-2 rounded border text-[10px] ${
                      isActive
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300 text-gray-500"
                    }`}
                  >
                    <div
                      className="w-8 h-5 rounded border border-gray-300"
                      style={getFillStyle(effectiveFillColor, opt.value)}
                    />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Light Font */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-gray-600">Light Font</span>
              {fontLight !== null && (
                <button
                  onClick={() => setFontLight(null)}
                  className="text-[9px] text-gray-400 hover:text-gray-600 underline"
                >
                  use default
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={effectiveFontLight}
                onChange={(e) => setFontLight(e.target.checked)}
                className="w-4 h-4 accent-gray-500"
              />
              <span className="text-xs text-gray-500">
                White text (for dark fill colors)
              </span>
              {fontLight === null && <span className="text-[9px] text-gray-400">(default)</span>}
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-between">
          <button
            onClick={handleReset}
            disabled={!hasOverrides}
            className="text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Reset to defaults
          </button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
