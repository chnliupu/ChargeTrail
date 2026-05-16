import { ApiError } from '../../api/client';

export {
  PROVIDER_META,
  getProviderMeta,
  type ProviderMeta,
} from '../../lib/providers';

/** Return a displayable error message, preserving API-provided details. */
export function errorMessage(
  err: unknown,
  fallback = 'Something went wrong',
): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
