import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

// --- Better Auth core (with admin plugin extensions) ---

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', {
    mode: 'boolean',
  })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: integer('createdAt', {
    mode: 'timestamp_ms',
  }).notNull(),
  updatedAt: integer('updatedAt', {
    mode: 'timestamp_ms',
  }).notNull(),
  // admin plugin
  role: text('role').default('user'),
  banned: integer('banned', {
    mode: 'boolean',
  }),
  banReason: text('banReason'),
  banExpires: integer('banExpires', {
    mode: 'timestamp_ms',
  }),
  // custom additional fields
  username: text('username').notNull().unique(),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, {
      onDelete: 'cascade',
    }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', {
    mode: 'timestamp_ms',
  }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {
    mode: 'timestamp_ms',
  }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('createdAt', {
    mode: 'timestamp_ms',
  }).notNull(),
  updatedAt: integer('updatedAt', {
    mode: 'timestamp_ms',
  }).notNull(),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expiresAt', {
    mode: 'timestamp_ms',
  }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('createdAt', {
    mode: 'timestamp_ms',
  }).notNull(),
  updatedAt: integer('updatedAt', {
    mode: 'timestamp_ms',
  }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, {
      onDelete: 'cascade',
    }),
  // admin plugin: impersonation chain
  impersonatedBy: text('impersonatedBy'),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', {
    mode: 'timestamp_ms',
  }).notNull(),
  createdAt: integer('createdAt', {
    mode: 'timestamp_ms',
  }),
  updatedAt: integer('updatedAt', {
    mode: 'timestamp_ms',
  }),
});

// --- Project tables ---

export const invite = sqliteTable('invite', {
  id: text('id').primaryKey(),
  codeHash: text('codeHash').notNull().unique(),
  createdBy: text('createdBy')
    .notNull()
    .references(() => user.id),
  createdAt: integer('createdAt', {
    mode: 'timestamp_ms',
  }).notNull(),
  expiresAt: integer('expiresAt', {
    mode: 'timestamp_ms',
  }).notNull(),
  usedAt: integer('usedAt', {
    mode: 'timestamp_ms',
  }),
  usedBy: text('usedBy').references(() => user.id),
});

export const connector = sqliteTable(
  'connector',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    providerUsername: text('providerUsername').notNull(),
    providerPassword: text('providerPassword'),
    token: text('token'),
    userId: text('userId')
      .notNull()
      .references(() => user.id, {
        onDelete: 'cascade',
      }),
    createdAt: integer('createdAt', {
      mode: 'timestamp_ms',
    })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updatedAt', {
      mode: 'timestamp_ms',
    })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    lastSyncedAt: integer('lastSyncedAt', {
      mode: 'timestamp_ms',
    }),
  },
  (t) => [
    unique('connector_user_provider_username').on(t.userId, t.provider, t.providerUsername),
    index('idx_connector_user').on(t.userId),
  ],
);

export const chargeSessions = sqliteTable(
  'chargeSessions',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, {
        onDelete: 'cascade',
      }),
    connectorId: text('connectorId').references(() => connector.id, {
      onDelete: 'set null',
    }),
    // Provider-side unique session id; combined with connectorId this is unique.
    providerSessionId: text('providerSessionId'),
    startedAt: text('startedAt').notNull(),
    endedAt: text('endedAt'),
    powerKwh: real('powerKwh').notNull(),
    durationSeconds: integer('durationSeconds').notNull(),
    price: real('price').notNull(),
    pricePerHour: real('pricePerHour'),
    pricePerKwh: real('pricePerKwh'),
    currency: text('currency'),
    lat: real('lat'),
    lon: real('lon'),
    address1: text('address1'),
    city: text('city'),
    state: text('state'),
    zipcode: text('zipcode'),
    country: text('country'),
    deviceName: text('deviceName'),
    deviceId: integer('deviceId'),
    vehicleId: integer('vehicleId'),
  },
  (t) => [
    unique('charge_sessions_connector_provider').on(t.connectorId, t.providerSessionId),
    index('idx_charge_sessions_user_started').on(t.userId, t.startedAt),
    index('idx_charge_sessions_connector_started').on(t.connectorId, t.startedAt),
  ],
);
