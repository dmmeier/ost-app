/**
 * Branching-graph icon representing an Opportunity Solution Tree.
 * A root circle splits into three child circles via connecting lines.
 */
export function TreeIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Root node */}
      <circle cx="12" cy="4" r="3" fill="currentColor" />
      {/* Trunk */}
      <line x1="12" y1="7" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Branches */}
      <line x1="12" y1="12" x2="4" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="12" x2="12" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="12" x2="20" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Child nodes */}
      <circle cx="4" cy="19.5" r="2.5" fill="currentColor" opacity="0.7" />
      <circle cx="12" cy="19.5" r="2.5" fill="currentColor" opacity="0.7" />
      <circle cx="20" cy="19.5" r="2.5" fill="currentColor" opacity="0.7" />
    </svg>
  );
}
