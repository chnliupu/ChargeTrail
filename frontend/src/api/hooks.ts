import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addConnector,
  authConnector,
  deleteConnector,
  fetchConnectors,
  syncConnector,
  updateConnector,
  type AddConnectorInput,
  type BrowserToken,
  type ConnectorWithCount,
  type FetchConnectorsOptions,
  type UpdateConnectorInput,
} from './connectors';
import {
  fetchAllSessions,
  fetchSessions,
  type FetchAllSessionsResult,
  type SessionsParams,
  type SessionsResponse,
} from './sessions';

export function useSessions(params: SessionsParams = {}) {
  return useQuery<SessionsResponse>({
    queryKey: ['sessions', params],
    queryFn: () => fetchSessions(params),
  });
}

/**
 * Fetch every page of sessions matching `params`, capped at `maxRows`. Used
 * by the Summary page so client-side aggregation has the full set in memory.
 */
export function useSessionsRange(params: SessionsParams = {}, maxRows = 5000) {
  return useQuery<FetchAllSessionsResult>({
    queryKey: ['sessions-range', params, maxRows],
    queryFn: () => fetchAllSessions(params, maxRows),
  });
}

const CONNECTORS_KEY = ['connectors'] as const;
const SESSIONS_KEY = ['sessions'] as const;

export function useConnectors(options: FetchConnectorsOptions = {}) {
  const withSessionCount = options.withSessionCount === true;
  return useQuery<{ connectors: ConnectorWithCount[] }>({
    queryKey: [...CONNECTORS_KEY, { withSessionCount }] as const,
    queryFn: () => fetchConnectors({ withSessionCount }),
  });
}

export function useAddConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddConnectorInput) => addConnector(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONNECTORS_KEY });
    },
  });
}

export function useUpdateConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: UpdateConnectorInput }) =>
      updateConnector(args.id, args.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONNECTORS_KEY });
    },
  });
}

export function useAuthConnector() {
  return useMutation({
    mutationFn: (args: { id: string; token?: BrowserToken }) =>
      authConnector(args.id, args.token),
  });
}

export function useSyncConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; laterThan?: string }) =>
      syncConnector(args.id, args.laterThan),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONNECTORS_KEY });
      qc.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });
}

export function useDeleteConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; removeSessions: boolean }) =>
      deleteConnector(args.id, args.removeSessions),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONNECTORS_KEY });
      qc.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });
}
