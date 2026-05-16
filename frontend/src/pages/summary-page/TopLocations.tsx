import { Icon } from '../../components/Icon';
import { Card } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import type { LocationRow } from './aggregations';

type TopLocationsProps = {
  rows: LocationRow[];
  isLoading?: boolean;
};

export function TopLocations({ rows, isLoading = false }: TopLocationsProps) {
  const maxCount = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-text">Top locations</h3>
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner size={22} className="text-text-muted" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-muted">No data</p>
      ) : (
        <div>
          {rows.map((loc, i) => (
            <div
              key={loc.key}
              className={
                i < rows.length - 1
                  ? 'border-b border-border/40 py-2.5'
                  : 'py-2.5'
              }
            >
              <div className="mb-1 flex items-start justify-between">
                <div className="flex items-start gap-1.5">
                  <Icon
                    name="mapPin"
                    size={13}
                    className="mt-0.5 shrink-0 text-text-dim"
                  />
                  <div className="min-w-0">
                    <div className="text-xs text-text">{loc.address1}</div>
                    <div className="text-[11px] text-text-muted">
                      {loc.city}
                    </div>
                  </div>
                </div>
                <div className="ml-2 flex shrink-0 gap-3 text-xs">
                  <span className="text-accent-green">
                    {loc.kwh.toFixed(1)} kWh
                  </span>
                  <span className="text-text-muted">{loc.count}×</span>
                </div>
              </div>
              <div className="h-[3px] overflow-hidden rounded-sm bg-bg">
                <div
                  className="h-full rounded-sm bg-primary opacity-50"
                  style={{ width: `${(loc.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
