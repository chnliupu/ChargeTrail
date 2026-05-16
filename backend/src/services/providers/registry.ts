import type { SupportedChargeProvider } from '../../schemas/connectors.js';
import { chargePointProvider } from './chargepoint/provider.js';
import { floProvider } from './flo/provider.js';
import { swtchProvider } from './swtch/provider.js';
import type { ChargeProvider } from './types.js';

/**
 * Central registry mapping each `SupportedChargeProvider` string to its
 * `ChargeProvider` singleton. The `Record<SupportedChargeProvider, …>`
 * annotation forces exhaustiveness: adding a new provider to
 * `SUPPORTED_PROVIDERS` without registering it here is a compile error.
 */
const providers: Record<SupportedChargeProvider, ChargeProvider> = {
  chargepoint: chargePointProvider,
  swtch: swtchProvider,
  flo: floProvider,
};

/**
 * Look up the `ChargeProvider` for a given provider key. Total — never
 * returns `undefined`, because `SupportedChargeProvider` is the closed
 * union of registered keys. Callers must narrow `string` to
 * `SupportedChargeProvider` before calling (the route handler does this
 * via the existing `if (row.provider !== 'chargepoint' && ...)` guards
 * in `routes/connectors.ts`).
 *
 * Wrapping the lookup in a function (rather than exporting the `Record`
 * directly) gives one place to add cross-cutting behavior later — e.g.
 * a logging or metrics decorator — without touching every call site.
 *
 * @param provider The provider discriminator from `connector.provider`.
 * @returns        The singleton implementation for that provider.
 */
export function getChargeProvider(provider: SupportedChargeProvider): ChargeProvider {
  return providers[provider];
}
