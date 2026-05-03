"use client";

interface BrandMarkProps {
  size?: number;
  className?: string;
}

export function BrandMark({ size = 48, className = "" }: BrandMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <circle cx="32" cy="18" r="5" fill="currentColor" />
      <path
        d="M 32 23 L 32 32 M 32 32 L 18 42 M 32 32 L 32 42 M 32 32 L 46 42"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="18" cy="45" r="4" fill="currentColor" />
      <circle cx="32" cy="45" r="4" fill="currentColor" />
      <circle cx="46" cy="45" r="4" fill="currentColor" />
    </svg>
  );
}
