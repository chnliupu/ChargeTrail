import { and, count, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { AppDb } from '../db/index.js';
import { chargeSessions, connector } from '../db/schema.js';
import type { SessionFilters } from '../../schemas/sessions.js';

export type ListSessionsParams = {
  userId: string;
  filters: SessionFilters;
};

export type ListSessionsResult = {
  sessions: SessionListItem[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
};

export type SessionListItem = {
  id: string;
  userId: string;
  connectorId: string | null;
  provider: string | null;
  providerSessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  powerKwh: number;
  durationSeconds: number;
  price: number;
  pricePerHour: number | null;
  pricePerKwh: number | null;
  currency: string | null;
  lat: number | null;
  lon: number | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  country: string | null;
  deviceName: string | null;
  deviceId: number | null;
  vehicleId: number | null;
};

function buildConditions(userId: string, filters: SessionFilters): SQL[] {
  const conditions: SQL[] = [eq(chargeSessions.userId, userId)];

  if (filters.startedAtFrom) {
    conditions.push(gte(chargeSessions.startedAt, filters.startedAtFrom));
  }
  if (filters.startedAtTo) {
    conditions.push(lte(chargeSessions.startedAt, filters.startedAtTo));
  }
  if (filters.endedAtFrom) {
    conditions.push(gte(chargeSessions.endedAt, filters.endedAtFrom));
  }
  if (filters.endedAtTo) {
    conditions.push(lte(chargeSessions.endedAt, filters.endedAtTo));
  }
  if (filters.priceMin !== undefined) {
    conditions.push(gte(chargeSessions.price, filters.priceMin));
  }
  if (filters.priceMax !== undefined) {
    conditions.push(lte(chargeSessions.price, filters.priceMax));
  }
  if (filters.pricePerKwhMin !== undefined) {
    conditions.push(gte(chargeSessions.pricePerKwh, filters.pricePerKwhMin));
  }
  if (filters.pricePerKwhMax !== undefined) {
    conditions.push(lte(chargeSessions.pricePerKwh, filters.pricePerKwhMax));
  }
  if (filters.pricePerHourMin !== undefined) {
    conditions.push(gte(chargeSessions.pricePerHour, filters.pricePerHourMin));
  }
  if (filters.pricePerHourMax !== undefined) {
    conditions.push(lte(chargeSessions.pricePerHour, filters.pricePerHourMax));
  }
  if (filters.energyKwhMin !== undefined) {
    conditions.push(gte(chargeSessions.powerKwh, filters.energyKwhMin));
  }
  if (filters.energyKwhMax !== undefined) {
    conditions.push(lte(chargeSessions.powerKwh, filters.energyKwhMax));
  }
  if (filters.durationSecondsMin !== undefined) {
    conditions.push(gte(chargeSessions.durationSeconds, filters.durationSecondsMin));
  }
  if (filters.durationSecondsMax !== undefined) {
    conditions.push(lte(chargeSessions.durationSeconds, filters.durationSecondsMax));
  }
  if (filters.connectorIds.length > 0) {
    conditions.push(inArray(chargeSessions.connectorId, filters.connectorIds));
  }
  if (filters.deviceId !== undefined) {
    conditions.push(eq(chargeSessions.deviceId, filters.deviceId));
  }
  if (filters.vehicleId !== undefined) {
    conditions.push(eq(chargeSessions.vehicleId, filters.vehicleId));
  }
  if (filters.city) {
    conditions.push(eq(sql`lower(${chargeSessions.city})`, filters.city.toLowerCase()));
  }
  if (filters.state) {
    conditions.push(eq(sql`lower(${chargeSessions.state})`, filters.state.toLowerCase()));
  }
  if (filters.country) {
    conditions.push(eq(sql`lower(${chargeSessions.country})`, filters.country.toLowerCase()));
  }
  if (filters.currency) {
    conditions.push(eq(sql`lower(${chargeSessions.currency})`, filters.currency.toLowerCase()));
  }

  return conditions;
}

/**
 * List charging sessions owned by a user, applying validated filters,
 * stable newest-first ordering, and offset pagination metadata for lazy loading.
 */
export function listSessions(db: AppDb, params: ListSessionsParams): ListSessionsResult {
  const { userId, filters } = params;
  const conditions = buildConditions(userId, filters);
  const whereClause = and(...conditions);

  const totalRow = db
    .select({
      total: count(),
    })
    .from(chargeSessions)
    .where(whereClause)
    .get();
  const total = totalRow?.total ?? 0;

  const sessions = db
    .select({
      id: chargeSessions.id,
      userId: chargeSessions.userId,
      connectorId: chargeSessions.connectorId,
      provider: connector.provider,
      providerSessionId: chargeSessions.providerSessionId,
      startedAt: chargeSessions.startedAt,
      endedAt: chargeSessions.endedAt,
      powerKwh: chargeSessions.powerKwh,
      durationSeconds: chargeSessions.durationSeconds,
      price: chargeSessions.price,
      pricePerHour: chargeSessions.pricePerHour,
      pricePerKwh: chargeSessions.pricePerKwh,
      currency: chargeSessions.currency,
      lat: chargeSessions.lat,
      lon: chargeSessions.lon,
      address1: chargeSessions.address1,
      city: chargeSessions.city,
      state: chargeSessions.state,
      zipcode: chargeSessions.zipcode,
      country: chargeSessions.country,
      deviceName: chargeSessions.deviceName,
      deviceId: chargeSessions.deviceId,
      vehicleId: chargeSessions.vehicleId,
    })
    .from(chargeSessions)
    .leftJoin(connector, eq(connector.id, chargeSessions.connectorId))
    .where(whereClause)
    .orderBy(desc(chargeSessions.startedAt), desc(chargeSessions.id))
    .limit(filters.limit)
    .offset(filters.offset)
    .all();

  const nextOffset = filters.offset + sessions.length;

  return {
    sessions,
    pagination: {
      limit: filters.limit,
      offset: filters.offset,
      count: sessions.length,
      total,
      hasMore: nextOffset < total,
      nextOffset: nextOffset < total ? nextOffset : null,
    },
  };
}
