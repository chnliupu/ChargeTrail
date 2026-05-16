import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text outline-none placeholder:text-text-dim focus:border-primary disabled:cursor-not-allowed disabled:opacity-60 font-mono',
          className,
        )}
        {...props}
      />
    );
  },
);
