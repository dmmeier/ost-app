"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeProps,
  getBezierPath,
} from "@xyflow/react";

interface HypothesisEdgeData {
  thickness?: number;
  edgeStyle?: string;
  [key: string]: unknown;
}

function HypothesisEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const edgeData = (data || {}) as HypothesisEdgeData;
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const strokeWidth = edgeData.thickness ?? 2;
  const w = strokeWidth;

  // Compute strokeDasharray proportional to thickness
  let strokeDasharray: string | undefined;
  if (edgeData.edgeStyle === "dashed") {
    strokeDasharray = `${3 * w} ${2 * w}`;
  } else if (edgeData.edgeStyle === "dotted") {
    strokeDasharray = `${w} ${2 * w}`;
  }

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{ stroke: "#94a3b8", strokeWidth, strokeDasharray, strokeLinecap: edgeData.edgeStyle === "dotted" ? "round" : undefined }}
    />
  );
}

export const HypothesisEdge = memo(HypothesisEdgeComponent);
