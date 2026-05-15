"use client";

interface WordmarkProps {
  height?: number;
  className?: string;
  variant?: "light" | "dark";
}

export function Wordmark({ height = 28, className = "", variant = "light" }: WordmarkProps) {
  // Aspect ratio from brand SVG: 220w x 64h
  const width = (height / 64) * 220;
  // On dark backgrounds: "OST" is white, "app" is light gray
  // On light backgrounds: "OST" is warm ink (#2c2620), "app" is warm muted (#7a6f5b)
  const ostColor = variant === "dark" ? "#ffffff" : "#2c2620";
  const appColor = variant === "dark" ? "#9ca3af" : "#7a6f5b";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 220 64"
      width={width}
      height={height}
      className={className}
      aria-label="OST app"
      style={{ fontFamily: "var(--font-ost-sans), 'IBM Plex Sans', system-ui, sans-serif" }}
    >
      <circle cx="32" cy="32" r="32" fill="#0d9488" />
      <circle cx="32" cy="18" r="5" fill="#ffffff" />
      <path
        d="M 32 23 L 32 32 M 32 32 L 18 42 M 32 32 L 32 42 M 32 32 L 46 42"
        stroke="#ffffff"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="18" cy="45" r="4" fill="#ffffff" />
      <circle cx="32" cy="45" r="4" fill="#ffffff" />
      <circle cx="46" cy="45" r="4" fill="#ffffff" />
      <text x="80" y="42" fontSize="36" fontWeight="600" letterSpacing="-0.72" fill={ostColor}>
        OST
      </text>
      <text x="160" y="42" fontSize="36" fontWeight="400" letterSpacing="-0.72" fill={appColor}>
        app
      </text>
    </svg>
  );
}
