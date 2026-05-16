import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        // Stock shadcn variants
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'text-foreground',
        // Project-specific extras
        success: 'bg-success/10 text-success border-success/30',
        warning: 'bg-warning/10 text-warning border-warning/30',
        chargepoint: 'bg-[#1d4ed8]/15 text-[#60a5fa] border-[#1d4ed8]/30',
        swtch: 'bg-[#7c3aed]/15 text-[#a78bfa] border-[#7c3aed]/30',
        flo: 'bg-[#16a34a]/15 text-[#4ade80] border-[#16a34a]/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type BadgeVariant = NonNullable<
  VariantProps<typeof badgeVariants>['variant']
>;

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
