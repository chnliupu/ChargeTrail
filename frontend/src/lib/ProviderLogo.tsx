import { Icon } from '../components/Icon';
import { getProviderMeta } from './providers';

type ProviderLogoProps = {
  provider: string | null | undefined;
  size?: number;
  className?: string;
};

/**
 * Renders a provider's official logo when `PROVIDER_META[...].logoUrl` is set,
 * otherwise falls back to the Lucide `plug` icon (`Icon name="connector"`).
 * Single source of truth for the provider-logo visual.
 */
export function ProviderLogo({
  provider,
  size = 16,
  className,
}: ProviderLogoProps) {
  const meta = getProviderMeta(provider);
  if (meta.logoUrl) {
    return (
      <img
        src={meta.logoUrl}
        alt={`${meta.label} logo`}
        width={size}
        height={size}
        className={className}
      />
    );
  }
  return <Icon name="connector" size={size} className={className} />;
}
