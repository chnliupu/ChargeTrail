import { Icon, type IconName } from '../../components/Icon';
import { Card } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import { cn } from '@/lib/utils';

type StatCardProps = {
  label: string;
  value: string;
  sub?: string;
  /** Tailwind text-color utility (e.g. `'text-accent-green'`). */
  accentClass?: string;
  icon?: IconName;
  isLoading?: boolean;
};

/**
 * KPI tile shown at the top of the Summary page. While `isLoading` is true a
 * small spinner replaces the value/sub text so layout stays stable.
 */
export function StatCard({
  label,
  value,
  sub,
  accentClass = 'text-text',
  icon = 'bolt',
  isLoading = false,
}: StatCardProps) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <Icon
          name={icon}
          size={14}
          className={cn('text-text-dim', accentClass)}
        />
      </div>
      {isLoading ? (
        <div className="flex h-[44px] items-center">
          <Spinner size={18} className="text-text-muted" />
        </div>
      ) : (
        <>
          <div className={cn('text-xl font-semibold', accentClass)}>
            {value}
          </div>
          {sub ? <div className="text-xs text-text-muted">{sub}</div> : null}
        </>
      )}
    </Card>
  );
}
