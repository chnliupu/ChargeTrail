import type { ProviderId } from '../api/connectors';
import type { BadgeVariant } from '../components/ui/badge';
import chargePointLogo from '../components/logos/ChargePoint.ico';
import floLogo from '../components/logos/FLO.svg';
import swtchLogo from '../components/logos/SWTCH.png';

export type ProviderMeta = {
  /** Stable provider id used by backend and connector records. */
  id: ProviderId | string;
  /** Human-friendly display name. */
  label: string;
  /** Accent color (used for tiles, breakdown rows, etc.). */
  color: string;
  /** Short marketing-style descriptor (shown in connector dialogs). */
  desc: string;
  /** Badge variant key used to style provider badges. */
  variant: BadgeVariant;
  /**
   * Optional URL/asset path for an official provider logo. When absent,
   * consumers fall back to the Lucide `plug` icon via `<ProviderLogo>`.
   */
  logoUrl?: string;
};

/**
 * Canonical metadata for every provider the frontend knows about. Shared
 * across the connectors page (dialogs, tiles) and DataPage (filter labels,
 * badges). To add a new provider, extend this map and the backend's
 * `SUPPORTED_PROVIDERS` list in lockstep.
 */
export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  chargepoint: {
    id: 'chargepoint',
    label: 'ChargePoint',
    color: '#7dd3fc',
    desc: "North America's largest EV charging network",
    variant: 'chargepoint',
    logoUrl: chargePointLogo,
  },
  swtch: {
    id: 'swtch',
    label: 'SWTCH Energy',
    color: '#6ee7b7',
    desc: 'Smart EV charging for multi-unit properties',
    variant: 'swtch',
    logoUrl: swtchLogo,
  },
  flo: {
    id: 'flo',
    label: 'FLO',
    color: '#4ade80',
    desc: 'EV charging network across North America',
    variant: 'flo',
    logoUrl: floLogo,
  },
};

/**
 * Look up provider metadata, returning a safe synthetic record for unknown
 * provider ids (e.g. legacy sessions whose connector has been deleted, or
 * future providers added on the backend before the frontend ships an entry).
 */
export function getProviderMeta(
  provider: string | null | undefined,
): ProviderMeta {
  if (provider && provider in PROVIDER_META) {
    return PROVIDER_META[provider as ProviderId];
  }
  // Allow case-insensitive label lookup so display names ("ChargePoint",
  // "SWTCH Energy") returned by the sessions endpoint still resolve.
  if (provider) {
    const lower = provider.toLowerCase();
    for (const meta of Object.values(PROVIDER_META)) {
      if (
        meta.id.toLowerCase() === lower ||
        meta.label.toLowerCase() === lower ||
        lower.includes(meta.id.toLowerCase())
      ) {
        return meta;
      }
    }
  }
  return {
    id: provider ?? 'unknown',
    label: provider ?? 'Unknown',
    color: 'var(--es-accent)',
    desc: '',
    variant: 'default',
  };
}
