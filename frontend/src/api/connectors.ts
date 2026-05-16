import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export type ProviderId = 'chargepoint' | 'swtch' | 'flo';

export type BrowserToken = {
  Cookie: string;
  'User-Agent': string;
};

export type Connector = {
  id: string;
  provider: ProviderId;
  providerUsername: string;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
};

export type ConnectorWithCount = Connector & {
  sessionCount?: number;
};

export type FetchConnectorsOptions = {
  withSessionCount?: boolean;
};

export type AddConnectorInput = {
  provider: ProviderId;
  providerUsername: string;
  providerPassword?: string | null;
  token?: BrowserToken | null;
};

export type UpdateConnectorInput = {
  providerUsername?: string;
  providerPassword?: string | null;
  token?: BrowserToken;
};

export type SyncConnectorResult = {
  ok: boolean;
  lastSyncedAt: string | null;
  imported?: number;
  updated?: number;
  skipped?: number;
  pagesFetched?: number;
  sessionsFetched?: number;
  sessionsInserted?: number;
  stoppedReason?: string | null;
};

export type DeleteConnectorResult = {
  ok: boolean;
  removedSessions: number;
  nullifiedSessions: number;
};

/** GET /api/v1/connector — list current user's connectors, optionally with session counts. */
export function fetchConnectors(options: FetchConnectorsOptions = {}): Promise<{
  connectors: ConnectorWithCount[];
}> {
  return apiGet(
    '/api/v1/connector',
    options.withSessionCount ? { withSessionCount: true } : undefined,
  );
}

/** POST /api/v1/connector/add — register a new connector. Token is not validated. */
export function addConnector(
  input: AddConnectorInput,
): Promise<{ connector: Connector }> {
  return apiPost('/api/v1/connector/add', input);
}

/** PATCH /api/v1/connector/:id — partial update; provider is immutable. */
export function updateConnector(
  id: string,
  input: UpdateConnectorInput,
): Promise<{ connector: Connector }> {
  return apiPatch(`/api/v1/connector/${id}`, input);
}

/** POST /api/v1/connector/:id/auth — validate (and persist) a browser token against the provider. */
export function authConnector(
  id: string,
  token?: BrowserToken,
): Promise<{ ok: boolean; cached: boolean }> {
  return apiPost(`/api/v1/connector/${id}/auth`, token ?? {});
}

/** POST /api/v1/connector/:id/sync — pull charging sessions from the provider. */
export function syncConnector(
  id: string,
  laterThan?: string,
): Promise<SyncConnectorResult> {
  return apiPost(
    `/api/v1/connector/${id}/sync`,
    laterThan ? { later_than: laterThan } : {},
  );
}

/**
 * DELETE /api/v1/connector/:id — remove a connector. By default sessions are
 * kept and their connectorId is set to null. Pass removeSessions=true to
 * delete the imported sessions as well.
 */
export function deleteConnector(
  id: string,
  removeSessions: boolean,
): Promise<DeleteConnectorResult> {
  return apiDelete(`/api/v1/connector/${id}`, { removeSessions });
}
