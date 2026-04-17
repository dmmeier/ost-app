"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeProps,
  getBezierPath,
} from "@xyflow/react";

interface HypothesisEdgeData {
  thickness?: number;
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

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{ stroke: "#94a3b8", strokeWidth }}
    />
  );
}

export const HypothesisEdge = memo(HypothesisEdgeComponent);
