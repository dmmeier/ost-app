"use client";

import { useEffect, useRef, useState } from "react";

interface ActiveTool {
  name: string;
  label: string;
}

interface ToolActivityIndicatorProps {
  activeTools: ActiveTool[];
  isLoading: boolean;
}

export function ToolActivityIndicator({ activeTools, isLoading }: ToolActivityIndicatorProps) {
  const [displayLabel, setDisplayLabel] = useState("Thinking");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevLoadingRef = useRef(false);

  // Reset label to "Thinking" when loading starts fresh
  useEffect(() => {
    if (isLoading && !prevLoadingRef.current) {
      setDisplayLabel("Thinking");
      setIsTransitioning(false);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    if (activeTools.length > 0) {
      const latest = activeTools[activeTools.length - 1];
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setDisplayLabel(latest.label);
        setIsTransitioning(false);
      }, 150);
      return () => clearTimeout(timer);
    } else if (isLoading) {
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setDisplayLabel("Thinking");
        setIsTransitioning(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeTools, isLoading]);

  if (!isLoading) return null;

  return (
    <div className="flex justify-start">
      <div
        className="rounded-lg px-3 py-2 text-sm flex items-center gap-2"
        style={{ background: "var(--ost-chip)", color: "var(--ost-muted)" }}
      >
        <span className="inline-flex gap-[3px]">
          <span className="animate-tool-dot-1 inline-block w-[4px] h-[4px] rounded-full bg-current opacity-40" />
          <span className="animate-tool-dot-2 inline-block w-[4px] h-[4px] rounded-full bg-current opacity-40" />
          <span className="animate-tool-dot-3 inline-block w-[4px] h-[4px] rounded-full bg-current opacity-40" />
        </span>
        <span
          className={`transition-opacity duration-150 ${isTransitioning ? "opacity-0" : "opacity-100"}`}
        >
          {displayLabel}
        </span>
      </div>
    </div>
  );
}
