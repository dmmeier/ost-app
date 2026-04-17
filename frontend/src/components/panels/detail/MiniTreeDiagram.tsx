"use client";

import { Node, BubbleDefaults } from "@/lib/types";

const NODE_W = 140;
const NODE_H = 26;
const V_GAP = 16;
const H_GAP = 6;

const HEX_COLORS: Record<string, { fill: string; stroke: string }> = {
  outcome:           { fill: "#dbeafe", stroke: "#93c5fd" },
  opportunity:       { fill: "#ffedd5", stroke: "#fdba74" },
  child_opportunity: { fill: "#fef3c7", stroke: "#fcd34d" },
  solution:          { fill: "#d1fae5", stroke: "#6ee7b7" },
  experiment:        { fill: "#ede9fe", stroke: "#c4b5fd" },
};

/**
 * Lighten a hex color by mixing with white.
 * amount: 0 = original, 1 = white
 */
function lightenColor(hex: string, amount: number = 0.7): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

function getNodeColors(nodeType: string, bubbleDefaults?: BubbleDefaults): { fill: string; stroke: string } {
  // Check hardcoded standard colors first
  if (HEX_COLORS[nodeType]) return HEX_COLORS[nodeType];
  // Try to derive from bubbleDefaults
  if (bubbleDefaults?.[nodeType]) {
    const borderColor = bubbleDefaults[nodeType].border_color;
    return { fill: lightenColor(borderColor, 0.7), stroke: borderColor };
  }
  // Fallback gray
  return { fill: "#f3f4f6", stroke: "#94a3b8" };
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
}

interface MiniTreeDiagramProps {
  parent: Node | null;
  selected: Node;
  children: Node[];
  onNavigate: (nodeId: string) => void;
  bubbleDefaults?: BubbleDefaults;
}

export function MiniTreeDiagram({ parent, selected, children, onNavigate, bubbleDefaults }: MiniTreeDiagramProps) {
  const childCount = children.length;
  const childrenRowW = childCount > 0 ? childCount * NODE_W + (childCount - 1) * H_GAP : 0;
  const svgW = Math.max(NODE_W + 40, childrenRowW + 40);

  let currentY = 8;
  const parentY = parent ? currentY : -1;
  if (parent) currentY += NODE_H + V_GAP;
  const selectedY = currentY;
  currentY += NODE_H;
  if (childCount > 0) currentY += V_GAP;
  const childrenY = currentY;
  if (childCount > 0) currentY += NODE_H;
  const svgH = currentY + 8;

  const centerX = svgW / 2;
  const selectedX = centerX - NODE_W / 2;
  const parentX = parent ? centerX - NODE_W / 2 : 0;
  const childrenStartX = centerX - childrenRowW / 2;

  return (
    <div className="overflow-x-auto">
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="mx-auto"
        style={{ minWidth: svgW }}
      >
        {/* Connecting lines */}
        {parent && (
          <line
            x1={centerX} y1={parentY + NODE_H}
            x2={centerX} y2={selectedY}
            stroke="#d1d5db" strokeWidth={1.5}
          />
        )}

        {childCount > 0 && (
          <>
            <line
              x1={centerX} y1={selectedY + NODE_H}
              x2={centerX} y2={selectedY + NODE_H + V_GAP / 2}
              stroke="#d1d5db" strokeWidth={1.5}
            />
            {childCount > 1 && (
              <line
                x1={childrenStartX + NODE_W / 2}
                y1={selectedY + NODE_H + V_GAP / 2}
                x2={childrenStartX + (childCount - 1) * (NODE_W + H_GAP) + NODE_W / 2}
                y2={selectedY + NODE_H + V_GAP / 2}
                stroke="#d1d5db" strokeWidth={1.5}
              />
            )}
            {children.map((_, i) => {
              const cx = childrenStartX + i * (NODE_W + H_GAP) + NODE_W / 2;
              return (
                <line
                  key={`drop-${i}`}
                  x1={cx} y1={selectedY + NODE_H + V_GAP / 2}
                  x2={cx} y2={childrenY}
                  stroke="#d1d5db" strokeWidth={1.5}
                />
              );
            })}
          </>
        )}

        {/* Parent pill */}
        {parent && (
          <NodePill
            node={parent}
            x={parentX}
            y={parentY}
            isSelected={false}
            onClick={() => onNavigate(parent.id)}
            bubbleDefaults={bubbleDefaults}
          />
        )}

        {/* Selected pill */}
        <NodePill
          node={selected}
          x={selectedX}
          y={selectedY}
          isSelected={true}
          bubbleDefaults={bubbleDefaults}
        />

        {/* Children pills */}
        {children.map((child, i) => (
          <NodePill
            key={child.id}
            node={child}
            x={childrenStartX + i * (NODE_W + H_GAP)}
            y={childrenY}
            isSelected={false}
            onClick={() => onNavigate(child.id)}
            bubbleDefaults={bubbleDefaults}
          />
        ))}
      </svg>
    </div>
  );
}

function NodePill({
  node,
  x,
  y,
  isSelected,
  onClick,
  bubbleDefaults,
}: {
  node: Node;
  x: number;
  y: number;
  isSelected: boolean;
  onClick?: () => void;
  bubbleDefaults?: BubbleDefaults;
}) {
  const colors = getNodeColors(node.node_type, bubbleDefaults);
  const label = truncate(node.title, 16);

  return (
    <g
      style={{ cursor: isSelected ? "default" : "pointer" }}
      onClick={isSelected ? undefined : onClick}
    >
      <title>{node.title}</title>
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={NODE_H / 2}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={isSelected ? 2.5 : 1.2}
      />
      <text
        x={x + NODE_W / 2}
        y={y + NODE_H / 2 + 1}
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={11}
        fontWeight={isSelected ? 600 : 400}
        fill="#1f2937"
      >
        {label}
      </text>
    </g>
  );
}
