import { cn } from '@/lib/utils';

type SpinnerProps = {
  size?: number;
  className?: string;
};

/** Small inline spinner for in-button or row-level loading states. */
export function Spinner({ size = 14, className }: SpinnerProps) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" opacity={0.25} />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
