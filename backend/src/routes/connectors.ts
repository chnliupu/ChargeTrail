import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { count, desc, eq } from 'drizzle-orm';
import { getDb } from '../services/db/index.js';
import { chargeSessions, connector } from '../services/db/schema.js';
import {
  parseStoredBrowserSessionToken,
  serializeBrowserSessionToken,
} from '../services/providers/browser-token.js';
import type { BrowserSessionToken } from '../services/providers/browser-token.js';
import { getChargeProvider } from '../services/providers/registry.js';
import { log } from '../services/logger/index.js';
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from '../middleware/validate.js';
import {
  ConnectorAddRequest,
  ConnectorAuthBody,
  ConnectorDeleteQuery,
  ConnectorListQuery,
  ConnectorPatchRequest,
  ConnectorSyncRequest,
  SUPPORTED_PROVIDERS_SET,
  type ConnectorAddRequestValue,
  type ConnectorAuthBodyValue,
  type ConnectorDeleteQueryValue,
  type ConnectorListQueryValue,
  type ConnectorPatchRequestValue,
  type ConnectorSyncRequestValue,
} from '../schemas/connectors.js';

export const connectorsRouter: Router = Router();

function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }

  const { code } = err as {
    code?: unknown;
  };
  return code === 'SQLITE_CONSTRAINT_UNIQUE';
}

connectorsRouter.post(
  '/connector/add',
  validateBody(ConnectorAddRequest),
  (req: Request, res: Response) => {
    const body = getValidatedBody<ConnectorAddRequestValue>(res);

    const db = getDb();
    const id = randomUUID();

    try {
      db.insert(connector)
        .values({
          id,
          provider: body.provider,
          providerUsername: body.providerUsername,
          providerPassword: body.providerPassword,
          token: body.token ? serializeBrowserSessionToken(body.token) : null,
          userId: req.user!.id,
        })
        .run();
    } catch (err) {
      // The connector table is unique per user/provider/providerUsername.
      if (isUniqueConstraintError(err)) {
        res.status(409).json({
          error: 'connector already exists',
        });
        return;
      }
      throw err;
    }

    const row = db
      .select({
        id: connector.id,
        provider: connector.provider,
        providerUsername: connector.providerUsername,
        createdAt: connector.createdAt,
        updatedAt: connector.updatedAt,
        lastSyncedAt: connector.lastSyncedAt,
      })
      .from(connector)
      .where(eq(connector.id, id))
      .get();

    res.status(201).json({
      connector: row,
    });
  },
);

connectorsRouter.post(
  '/connector/:id/auth',
  validateBody(ConnectorAuthBody, {
    errorShape: 'reason',
  }),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const db = getDb();

    const row = db
      .select({
        id: connector.id,
        provider: connector.provider,
        providerUsername: connector.providerUsername,
        providerPassword: connector.providerPassword,
        token: connector.token,
      })
      .from(connector)
      .where(eq(connector.id, id))
      .get();

    if (!row) {
      res.status(404).json({
        error: 'connector not found',
      });
      return;
    }

    if (!SUPPORTED_PROVIDERS_SET.has(row.provider)) {
      res.status(400).json({
        error: 'unsupported provider',
      });
      return;
    }

    log.info(
      {
        fn: 'connectors.auth',
        connectorId: row.id,
        provider: row.provider,
      },
      'starting auth',
    );

    const bodyToken = getValidatedBody<ConnectorAuthBodyValue>(res);

    let tokenSource: 'body' | 'database' | null = null;
    let token: BrowserSessionToken | null = null;

    if (bodyToken) {
      tokenSource = 'body';
      token = bodyToken;
    } else if (row.token) {
      tokenSource = 'database';
      token = parseStoredBrowserSessionToken(row.token, `${row.provider}.parseStoredToken`);
      if (!token) {
        res.status(400).json({
          ok: false,
          reason: `stored ${row.provider} token is malformed`,
        });
        return;
      }
    }

    if (!token || !tokenSource) {
      res.status(400).json({
        ok: false,
        reason: `${row.provider} token is required`,
      });
      return;
    }

    const provider = getChargeProvider(row.provider);
    const validation = await provider.validateBrowserToken(token);
    if (!validation.valid) {
      if (validation.reason === 'request-failed' || validation.reason === 'upstream-error') {
        res.status(502).json({
          ok: false,
          reason: `${row.provider} validation request failed`,
          upstreamStatus: validation.status,
        });
        return;
      }

      res.status(401).json({
        ok: false,
        reason: `${row.provider} token is invalid`,
        upstreamStatus: validation.status,
      });
      return;
    }

    if (tokenSource === 'body') {
      db.update(connector)
        .set({
          token: serializeBrowserSessionToken(token),
        })
        .where(eq(connector.id, row.id))
        .run();
    }

    res.json({
      ok: true,
      cached: tokenSource === 'database',
    });
  },
);

connectorsRouter.post(
  '/connector/:id/sync',
  validateBody(ConnectorSyncRequest, {
    errorShape: 'reason',
  }),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const db = getDb();

    const row = db
      .select({
        id: connector.id,
        provider: connector.provider,
        providerUsername: connector.providerUsername,
        providerPassword: connector.providerPassword,
        token: connector.token,
      })
      .from(connector)
      .where(eq(connector.id, id))
      .get();

    if (!row) {
      res.status(404).json({
        error: 'connector not found',
      });
      return;
    }

    if (!SUPPORTED_PROVIDERS_SET.has(row.provider)) {
      res.status(400).json({
        error: 'unsupported provider',
      });
      return;
    }

    const body = getValidatedBody<ConnectorSyncRequestValue>(res);
    const laterThan = body?.later_than;

    if (!row.token) {
      res.status(400).json({
        ok: false,
        reason: `${row.provider} token is required`,
      });
      return;
    }

    const token: BrowserSessionToken | null = parseStoredBrowserSessionToken(
      row.token,
      `${row.provider}.parseStoredToken`,
    );
    if (!token) {
      res.status(400).json({
        ok: false,
        reason: `stored ${row.provider} token is malformed`,
      });
      return;
    }

    log.info(
      {
        fn: 'connectors.sync',
        connectorId: row.id,
        provider: row.provider,
      },
      'starting sync',
    );

    const provider = getChargeProvider(row.provider);
    const outcome = await provider.syncConnector(db, row.id, token, { laterThan });

    if (!outcome.ok) {
      const failure = outcome.failure;
      if (failure.kind === 'connector-not-found') {
        res.status(404).json({
          error: 'connector not found',
        });
        return;
      }
      if (failure.kind === 'unauthorized') {
        res.status(401).json({
          ok: false,
          reason: `${row.provider} token is invalid`,
          upstreamStatus: failure.status,
        });
        return;
      }
      res.status(502).json({
        ok: false,
        reason:
          failure.kind === 'invalid-response'
            ? `${row.provider} returned an unexpected response`
            : `${row.provider} sync request failed`,
        upstreamStatus: failure.status ?? null,
      });
      return;
    }

    const lastSyncedAt = new Date();
    db.update(connector)
      .set({
        lastSyncedAt,
      })
      .where(eq(connector.id, row.id))
      .run();

    res.json({
      ok: true,
      lastSyncedAt,
      ...outcome.result,
    });
  },
);

/**
 * GET /connector — list the authenticated user's connectors. Session counts
 * are opt-in via withSessionCount=true because they require an aggregate join.
 */
connectorsRouter.get(
  '/connector',
  validateQuery(ConnectorListQuery),
  (req: Request, res: Response) => {
    const db = getDb();
    const { withSessionCount } = getValidatedQuery<ConnectorListQueryValue>(res);

    if (!withSessionCount) {
      const rows = db
        .select({
          id: connector.id,
          provider: connector.provider,
          providerUsername: connector.providerUsername,
          createdAt: connector.createdAt,
          updatedAt: connector.updatedAt,
          lastSyncedAt: connector.lastSyncedAt,
        })
        .from(connector)
        .where(eq(connector.userId, req.user!.id))
        .orderBy(desc(connector.createdAt))
        .all();

      res.json({ connectors: rows });
      return;
    }

    const rows = db
      .select({
        id: connector.id,
        provider: connector.provider,
        providerUsername: connector.providerUsername,
        createdAt: connector.createdAt,
        updatedAt: connector.updatedAt,
        lastSyncedAt: connector.lastSyncedAt,
        sessionCount: count(chargeSessions.id),
      })
      .from(connector)
      .leftJoin(chargeSessions, eq(chargeSessions.connectorId, connector.id))
      .where(eq(connector.userId, req.user!.id))
      .groupBy(connector.id)
      .orderBy(desc(connector.createdAt))
      .all();

    res.json({ connectors: rows });
  },
);

/**
 * PATCH /connector/:id — partial update of provider username, password, or
 * stored token. Provider is intentionally immutable. Does NOT validate the
 * supplied token against the provider; callers can chase with POST /:id/auth.
 */
connectorsRouter.patch(
  '/connector/:id',
  validateBody(ConnectorPatchRequest),
  (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = getValidatedBody<ConnectorPatchRequestValue>(res);
    const db = getDb();

    const existing = db
      .select({ id: connector.id, userId: connector.userId })
      .from(connector)
      .where(eq(connector.id, id))
      .get();

    // Ownership check: 404 (not 403) so we don't leak the existence of
    // connectors that belong to other users.
    if (!existing || existing.userId !== req.user!.id) {
      res.status(404).json({ error: 'connector not found' });
      return;
    }

    // Build an update set only from fields the caller actually sent.
    const updates: Record<string, unknown> = {};
    if (
      Object.prototype.hasOwnProperty.call(req.body, 'providerUsername') &&
      body.providerUsername !== undefined
    ) {
      updates.providerUsername = body.providerUsername;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'providerPassword')) {
      updates.providerPassword = body.providerPassword ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'token') && body.token) {
      updates.token = serializeBrowserSessionToken(body.token);
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      try {
        db.update(connector).set(updates).where(eq(connector.id, id)).run();
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          res.status(409).json({ error: 'connector already exists' });
          return;
        }
        throw err;
      }
    }

    const row = db
      .select({
        id: connector.id,
        provider: connector.provider,
        providerUsername: connector.providerUsername,
        createdAt: connector.createdAt,
        updatedAt: connector.updatedAt,
        lastSyncedAt: connector.lastSyncedAt,
      })
      .from(connector)
      .where(eq(connector.id, id))
      .get();

    res.json({ connector: row });
  },
);

/**
 * DELETE /connector/:id — remove a connector. By default any imported sessions
 * have their connectorId set to null (so they remain visible on the data page
 * but lose the provider link). Pass ?removeSessions=true to delete those
 * sessions instead.
 */
connectorsRouter.delete(
  '/connector/:id',
  validateQuery(ConnectorDeleteQuery),
  (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { removeSessions } = getValidatedQuery<ConnectorDeleteQueryValue>(res);
    const db = getDb();

    const existing = db
      .select({ id: connector.id, userId: connector.userId })
      .from(connector)
      .where(eq(connector.id, id))
      .get();

    if (!existing || existing.userId !== req.user!.id) {
      res.status(404).json({ error: 'connector not found' });
      return;
    }

    let removedSessions = 0;
    let nullifiedSessions = 0;

    db.transaction((tx) => {
      if (removeSessions) {
        const result = tx.delete(chargeSessions).where(eq(chargeSessions.connectorId, id)).run();
        removedSessions = result.changes ?? 0;
      } else {
        const result = tx
          .update(chargeSessions)
          .set({ connectorId: null })
          .where(eq(chargeSessions.connectorId, id))
          .run();
        nullifiedSessions = result.changes ?? 0;
      }
      tx.delete(connector).where(eq(connector.id, id)).run();
    });

    log.info(
      {
        fn: 'connectors.delete',
        connectorId: id,
        removeSessions,
        removedSessions,
        nullifiedSessions,
      },
      'connector deleted',
    );

    res.json({ ok: true, removedSessions, nullifiedSessions });
  },
);
