import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

let tmpDir: string;
let app: import('express').Express;

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin12345';

async function createAppWithSwaggerFlag(
  swaggerEnabled: string | undefined,
): Promise<import('express').Express> {
  const previous = process.env.SWAGGER_ENABLED;
  if (swaggerEnabled === undefined) {
    delete process.env.SWAGGER_ENABLED;
  } else {
    process.env.SWAGGER_ENABLED = swaggerEnabled;
  }

  try {
    const { createApp } = await import('../src/app.js');
    return createApp();
  } finally {
    if (previous === undefined) {
      delete process.env.SWAGGER_ENABLED;
    } else {
      process.env.SWAGGER_ENABLED = previous;
    }
  }
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'es-app-test-'));
  process.env.DB_PATH = join(tmpDir, 'test.db');
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-12345678901234567890';
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;

  const { initDb } = await import('../src/services/db/index.js');
  initDb();

  const { seedDefaultAdmin } = await import('../src/services/db/seed.js');
  await seedDefaultAdmin();

  const { createApp } = await import('../src/app.js');
  app = createApp();
});

afterAll(() => {
  if (tmpDir) {
    rmSync(tmpDir, {
      recursive: true,
      force: true,
    });
  }
});

describe('GET /api/v1/health', () => {
  it("returns 200 and { status: 'ok' }", async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
    });
  });
});

describe('swagger docs', () => {
  it('are disabled by default', async () => {
    const swaggerDisabledApp = await createAppWithSwaggerFlag(undefined);

    const res = await request(swaggerDisabledApp).get('/api-docs');
    expect(res.status).toBe(404);
  });

  it('serve the UI and OpenAPI document when enabled', async () => {
    const swaggerEnabledApp = await createAppWithSwaggerFlag('true');

    const ui = await request(swaggerEnabledApp).get('/api-docs/');
    expect(ui.status).toBe(200);
    expect(ui.headers['content-type']).toContain('text/html');

    const spec = await request(swaggerEnabledApp).get('/api-docs/swagger.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.0.3');
    expect(spec.body.paths['/api/v1/health']).toBeDefined();
    expect(spec.body.paths['/api/v1/sessions']).toBeDefined();
    expect(spec.body.paths['/api/v1/connector/add']).toBeDefined();
    expect(spec.body.paths['/api/v1/invites']).toBeDefined();
    expect(spec.body.paths['/api/auth/sign-in/email']).toBeUndefined();
    expect(spec.body.components.schemas.Session.required).toContain('provider');
    expect(spec.body.components.schemas.Session.required).not.toContain('providerName');
    expect(spec.body.components.schemas.ConnectorResponse.required).toContain('lastSyncedAt');
    expect(spec.body.components.schemas.ConnectorSyncResponse.required).toContain('lastSyncedAt');
  });
});

describe('auth flows', () => {
  it('blocks public sign-up while preserving invite-based registration', async () => {
    const publicSignUp = await request(app).post('/api/auth/sign-up/email').send({
      email: 'public@example.com',
      password: 'password12345',
      name: 'Public User',
      username: 'public-user',
    });

    expect(publicSignUp.status).toBe(404);

    const unauthInvite = await request(app).post('/api/v1/invites').send({});
    expect(unauthInvite.status).toBe(401);

    const adminAgent = request.agent(app);
    const adminSignIn = await adminAgent.post('/api/auth/sign-in/email').send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    expect(adminSignIn.status).toBe(200);
    expect(adminSignIn.headers['set-auth-token']).toEqual(expect.any(String));

    const inviteCreate = await adminAgent.post('/api/v1/invites').send({});
    expect(inviteCreate.status).toBe(201);
    expect(inviteCreate.body.code).toEqual(expect.any(String));

    const inviteCode = inviteCreate.body.code as string;
    const userAgent = request.agent(app);
    const register = await userAgent.post('/api/v1/auth/register').send({
      invite: inviteCode,
      email: 'alice@example.com',
      username: 'alice',
      password: 'password12345',
      name: 'Alice',
    });

    expect(register.status).toBe(200);
    expect(register.body.user?.email).toBe('alice@example.com');
    const registeredUserId = register.body.user?.id as string;
    expect(registeredUserId).toEqual(expect.any(String));
    expect(register.headers['set-auth-token']).toEqual(expect.any(String));

    const bearerToken = register.headers['set-auth-token'] as string;
    expect(bearerToken.length).toBeGreaterThan(10);

    const reusedInvite = await request(app).post('/api/v1/auth/register').send({
      invite: inviteCode,
      email: 'alice-2@example.com',
      username: 'alice-2',
      password: 'password12345',
      name: 'Alice Two',
    });

    expect(reusedInvite.status).toBe(400);
    expect(reusedInvite.body).toEqual({
      error: 'invite is invalid, expired, or already used',
    });

    const cookieSession = await userAgent.get('/api/auth/get-session');
    expect(cookieSession.status).toBe(200);
    expect(cookieSession.body.user?.email).toBe('alice@example.com');

    const protectedNoAuth = await request(app).post('/api/v1/connector/missing/auth').send({});
    expect(protectedNoAuth.status).toBe(401);

    const connectorAddNoAuth = await request(app).post('/api/v1/connector/add').send({
      provider: 'chargepoint',
      providerUsername: 'noauth@example.com',
    });
    expect(connectorAddNoAuth.status).toBe(401);

    const sessionsNoAuth = await request(app).get('/api/v1/sessions');
    expect(sessionsNoAuth.status).toBe(401);

    const protectedWithCookie = await userAgent.post('/api/v1/connector/missing/auth').send({});
    expect(protectedWithCookie.status).toBe(404);
    expect(protectedWithCookie.body).toEqual({
      error: 'connector not found',
    });

    const protectedWithBearer = await request(app)
      .post('/api/v1/connector/missing/auth')
      .set('Authorization', `Bearer ${bearerToken}`)
      .send({});
    expect(protectedWithBearer.status).toBe(404);
    expect(protectedWithBearer.body).toEqual({
      error: 'connector not found',
    });

    const { getDb } = await import('../src/services/db/index.js');
    const { chargeSessions, connector, user } = await import('../src/services/db/schema.js');
    const db = getDb();
    const now = new Date();

    const connectorAdd = await userAgent.post('/api/v1/connector/add').send({
      provider: ' chargepoint ',
      providerUsername: ' alice-added-chargepoint@example.com ',
      token: {
        Cookie: ' session=abc ',
        'User-Agent': ' Test Agent ',
      },
    });
    expect(connectorAdd.status).toBe(201);
    expect(connectorAdd.body.connector).toEqual({
      id: expect.any(String),
      provider: 'chargepoint',
      providerUsername: 'alice-added-chargepoint@example.com',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      lastSyncedAt: null,
    });
    expect(connectorAdd.body.connector.providerPassword).toBeUndefined();
    expect(connectorAdd.body.connector.token).toBeUndefined();

    const addedConnectorId = connectorAdd.body.connector.id as string;
    const addedConnector = db
      .select({
        userId: connector.userId,
        provider: connector.provider,
        providerUsername: connector.providerUsername,
        providerPassword: connector.providerPassword,
        token: connector.token,
        lastSyncedAt: connector.lastSyncedAt,
      })
      .from(connector)
      .where(eq(connector.id, addedConnectorId))
      .get();
    expect(addedConnector).toEqual({
      userId: registeredUserId,
      provider: 'chargepoint',
      providerUsername: 'alice-added-chargepoint@example.com',
      providerPassword: null,
      token: JSON.stringify({
        Cookie: 'session=abc',
        'User-Agent': 'Test Agent',
      }),
      lastSyncedAt: null,
    });

    const swtchProviderUsername = `swtch-${Math.floor(Math.random() * 1_000_000)}@example.test`;
    const swtchConnectorAdd = await userAgent.post('/api/v1/connector/add').send({
      provider: ' swtch ',
      providerUsername: ` ${swtchProviderUsername} `,
      token: {
        Cookie: ' _st_session=randomized ',
        'User-Agent': ' Random Test Browser ',
      },
    });
    expect(swtchConnectorAdd.status).toBe(201);
    expect(swtchConnectorAdd.body.connector.provider).toBe('swtch');
    expect(swtchConnectorAdd.body.connector.providerUsername).toBe(swtchProviderUsername);

    const swtchConnectorId = swtchConnectorAdd.body.connector.id as string;
    const swtchHtml = `
      <h2>Completed Transactions</h2>
      <table><tbody><tr>
        <td>CA${Math.floor(Math.random() * 900) + 100}</td>
        <td>05/03/2026 at 09:51 PM (PDT) to 05/03/2026 at 10:07 PM (PDT)</td>
        <td>$0.55</td>
        <td>1.6570 kWh</td>
        <td>${Math.floor(Math.random() * 9_000_000) + 1_000_000}</td>
        <td><a href="/en/v3_transactions/randomized">View</a></td>
      </tr></tbody></table>
      <h2>Refunded Transactions</h2>
    `;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => '',
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => swtchHtml,
      } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const swtchAuth = await userAgent.post(`/api/v1/connector/${swtchConnectorId}/auth`).send({});
      expect(swtchAuth.status).toBe(200);
      expect(swtchAuth.body).toEqual({
        ok: true,
        cached: true,
      });

      const swtchSync = await userAgent.post(`/api/v1/connector/${swtchConnectorId}/sync`).send({
        later_than: '2026-06-01T00:00:00.000Z',
      });
      expect(swtchSync.status).toBe(200);
      expect(swtchSync.body).toEqual({
        ok: true,
        lastSyncedAt: expect.any(String),
        pagesFetched: 1,
        sessionsFetched: 1,
        sessionsInserted: 0,
        stoppedReason: 'older-than-boundary',
      });
      expect(Date.parse(swtchSync.body.lastSyncedAt)).not.toBeNaN();

      const syncedConnector = db
        .select({
          lastSyncedAt: connector.lastSyncedAt,
        })
        .from(connector)
        .where(eq(connector.id, swtchConnectorId))
        .get();
      expect(syncedConnector?.lastSyncedAt).toBeInstanceOf(Date);
    } finally {
      vi.unstubAllGlobals();
    }

    const duplicateConnectorAdd = await userAgent.post('/api/v1/connector/add').send({
      provider: 'chargepoint',
      providerUsername: 'alice-added-chargepoint@example.com',
    });
    expect(duplicateConnectorAdd.status).toBe(409);
    expect(duplicateConnectorAdd.body).toEqual({
      error: 'connector already exists',
    });

    const missingProvider = await userAgent.post('/api/v1/connector/add').send({
      providerUsername: 'missing-provider@example.com',
    });
    expect(missingProvider.status).toBe(400);
    expect(missingProvider.body).toEqual({
      error: 'provider is required',
    });

    const missingProviderUsername = await userAgent.post('/api/v1/connector/add').send({
      provider: 'chargepoint',
    });
    expect(missingProviderUsername.status).toBe(400);
    expect(missingProviderUsername.body).toEqual({
      error: 'providerUsername is required',
    });

    const malformedToken = await userAgent.post('/api/v1/connector/add').send({
      provider: 'chargepoint',
      providerUsername: 'malformed-token@example.com',
      token: {
        Cookie: 'session=abc',
      },
    });
    expect(malformedToken.status).toBe(400);
    expect(malformedToken.body).toEqual({
      error: 'token must include non-empty Cookie and User-Agent fields',
    });

    db.insert(connector)
      .values({
        id: 'app-test-c1',
        provider: 'chargepoint',
        providerUsername: 'alice-chargepoint@example.com',
        providerPassword: 'pw',
        userId: registeredUserId,
      })
      .run();
    db.insert(user)
      .values({
        id: 'app-test-other-user',
        name: 'Other User',
        email: 'other@example.com',
        emailVerified: false,
        username: 'other-user',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(connector)
      .values({
        id: 'app-test-c2',
        provider: 'chargepoint',
        providerUsername: 'other-chargepoint@example.com',
        providerPassword: 'pw',
        userId: 'app-test-other-user',
      })
      .run();
    db.insert(chargeSessions)
      .values([
        {
          id: 'app-test-manual-old',
          userId: registeredUserId,
          connectorId: null,
          providerSessionId: null,
          startedAt: '2026-04-01T10:00:00.000Z',
          endedAt: '2026-04-01T11:00:00.000Z',
          powerKwh: 5,
          durationSeconds: 3600,
          price: 3,
          pricePerHour: 3,
          pricePerKwh: 0.6,
          currency: 'CAD',
          city: 'Vancouver',
        },
        {
          id: 'app-test-provider-mid',
          userId: registeredUserId,
          connectorId: 'app-test-c1',
          providerSessionId: 'provider-mid',
          startedAt: '2026-04-02T10:00:00.000Z',
          endedAt: '2026-04-02T11:00:00.000Z',
          powerKwh: 6,
          durationSeconds: 3600,
          price: 9,
          pricePerHour: 9,
          pricePerKwh: 1.5,
          currency: 'CAD',
          city: 'Burnaby',
        },
        {
          id: 'app-test-provider-new',
          userId: registeredUserId,
          connectorId: 'app-test-c1',
          providerSessionId: 'provider-new',
          startedAt: '2026-04-03T10:00:00.000Z',
          endedAt: '2026-04-03T11:00:00.000Z',
          powerKwh: 10,
          durationSeconds: 3600,
          price: 5,
          pricePerHour: 5,
          pricePerKwh: 0.5,
          currency: 'CAD',
          city: 'Vancouver',
        },
        {
          id: 'app-test-other-newest',
          userId: 'app-test-other-user',
          connectorId: 'app-test-c2',
          providerSessionId: 'provider-other',
          startedAt: '2026-04-04T10:00:00.000Z',
          endedAt: '2026-04-04T11:00:00.000Z',
          powerKwh: 10,
          durationSeconds: 3600,
          price: 1,
          pricePerHour: 1,
          pricePerKwh: 0.1,
          currency: 'CAD',
          city: 'Vancouver',
        },
      ])
      .run();

    const sessionsPage = await userAgent.get('/api/v1/sessions').query({
      limit: '2',
    });
    expect(sessionsPage.status).toBe(200);
    expect(sessionsPage.body.sessions.map((s: { id: string }) => s.id)).toEqual([
      'app-test-provider-new',
      'app-test-provider-mid',
    ]);
    expect(sessionsPage.body.sessions[0].provider).toBe('chargepoint');
    expect(sessionsPage.body.sessions[0].providerName).toBeUndefined();
    expect(sessionsPage.body.pagination).toEqual({
      limit: 2,
      offset: 0,
      count: 2,
      total: 3,
      hasMore: true,
      nextOffset: 2,
    });

    const aliasPage = await userAgent.get('/api/v1/sessions').query({
      count: '1',
      start: '2',
    });
    expect(aliasPage.status).toBe(200);
    expect(aliasPage.body.sessions.map((s: { id: string }) => s.id)).toEqual([
      'app-test-manual-old',
    ]);
    expect(aliasPage.body.sessions[0].connectorId).toBeNull();
    expect(aliasPage.body.sessions[0].provider).toBeNull();
    expect(aliasPage.body.pagination.total).toBe(3);

    const filteredByConnectorAndUnitPrice = await userAgent.get('/api/v1/sessions').query({
      connector: '[app-test-c1]',
      unitPriceRange: '0.4,0.8',
    });
    expect(filteredByConnectorAndUnitPrice.status).toBe(200);
    expect(filteredByConnectorAndUnitPrice.body.sessions.map((s: { id: string }) => s.id)).toEqual([
      'app-test-provider-new',
    ]);
    expect(filteredByConnectorAndUnitPrice.body.pagination.total).toBe(1);

    const filteredByDateAndTotal = await userAgent.get('/api/v1/sessions').query({
      dateRange: '2026-04-01T00:00:00.000Z,2026-04-01T23:59:59.999Z',
      totalPrice: '2,4',
    });
    expect(filteredByDateAndTotal.status).toBe(200);
    expect(filteredByDateAndTotal.body.sessions.map((s: { id: string }) => s.id)).toEqual([
      'app-test-manual-old',
    ]);

    const conflictingPagination = await userAgent.get('/api/v1/sessions').query({
      limit: '2',
      count: '3',
    });
    expect(conflictingPagination.status).toBe(400);
    expect(conflictingPagination.body.ok).toBe(false);

    const nonAdminInvite = await userAgent.post('/api/v1/invites').send({});
    expect(nonAdminInvite.status).toBe(403);
    expect(nonAdminInvite.body).toEqual({
      error: 'admin required',
    });
  });
});

describe('connectors CRUD', () => {
  // Helper: provision a fresh authenticated user via the invite flow so each
  // test gets isolated connectors. Returns a supertest agent with a session
  // cookie and the user's id.
  async function provisionUser(suffix: string): Promise<{
    agent: ReturnType<typeof request.agent>;
    userId: string;
  }> {
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/sign-in/email').send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    const inviteRes = await adminAgent.post('/api/v1/invites').send({});
    const code = inviteRes.body.code as string;

    const agent = request.agent(app);
    const reg = await agent.post('/api/v1/auth/register').send({
      invite: code,
      email: `crud-${suffix}@example.com`,
      username: `crud-${suffix}`,
      password: 'password12345',
      name: `Crud ${suffix}`,
    });
    return { agent, userId: reg.body.user.id as string };
  }

  it('GET /connector omits session counts unless explicitly requested', async () => {
    const { agent, userId } = await provisionUser('list');

    const list0 = await agent.get('/api/v1/connector');
    expect(list0.status).toBe(200);
    expect(list0.body).toEqual({ connectors: [] });

    const a = await agent.post('/api/v1/connector/add').send({
      provider: 'chargepoint',
      providerUsername: 'list-a@example.com',
    });
    const aId = a.body.connector.id as string;

    const b = await agent.post('/api/v1/connector/add').send({
      provider: 'swtch',
      providerUsername: 'list-b@example.com',
    });
    const bId = b.body.connector.id as string;

    // Two sessions on connector A, none on B; also one orphan session on the
    // same user with connectorId=null that must NOT be counted under any row.
    const { getDb } = await import('../src/services/db/index.js');
    const { chargeSessions } = await import('../src/services/db/schema.js');
    const db = getDb();
    db.insert(chargeSessions)
      .values([
        {
          id: `list-${aId}-1`,
          userId,
          connectorId: aId,
          providerSessionId: 'la1',
          startedAt: '2026-04-20T00:00:00.000Z',
          endedAt: '2026-04-20T01:00:00.000Z',
          powerKwh: 1,
          durationSeconds: 3600,
          price: 1,
        },
        {
          id: `list-${aId}-2`,
          userId,
          connectorId: aId,
          providerSessionId: 'la2',
          startedAt: '2026-04-21T00:00:00.000Z',
          endedAt: '2026-04-21T01:00:00.000Z',
          powerKwh: 2,
          durationSeconds: 3600,
          price: 2,
        },
        {
          id: `list-orphan-${aId}`,
          userId,
          connectorId: null,
          providerSessionId: null,
          startedAt: '2026-04-22T00:00:00.000Z',
          endedAt: '2026-04-22T01:00:00.000Z',
          powerKwh: 3,
          durationSeconds: 3600,
          price: 3,
        },
      ])
      .run();

    const listed = await agent.get('/api/v1/connector');
    expect(listed.status).toBe(200);
    expect(listed.body.connectors).toHaveLength(2);
    const byId: Record<string, { sessionCount?: number; provider: string }> = {};
    for (const c of listed.body.connectors) {
      byId[c.id] = c;
    }
    expect(byId[aId].sessionCount).toBeUndefined();
    expect(byId[aId].provider).toBe('chargepoint');
    expect(byId[bId].sessionCount).toBeUndefined();
    expect(byId[bId].provider).toBe('swtch');

    const listedWithCounts = await agent.get('/api/v1/connector?withSessionCount=true');
    expect(listedWithCounts.status).toBe(200);
    expect(listedWithCounts.body.connectors).toHaveLength(2);
    const byIdWithCounts: Record<string, { sessionCount?: number; provider: string }> = {};
    for (const c of listedWithCounts.body.connectors) {
      byIdWithCounts[c.id] = c;
    }
    expect(byIdWithCounts[aId].sessionCount).toBe(2);
    expect(byIdWithCounts[aId].provider).toBe('chargepoint');
    expect(byIdWithCounts[bId].sessionCount).toBe(0);
    expect(byIdWithCounts[bId].provider).toBe('swtch');
  });

  it('PATCH /connector/:id updates patchable fields and rejects provider change', async () => {
    const { agent } = await provisionUser('patch');
    const add = await agent.post('/api/v1/connector/add').send({
      provider: 'chargepoint',
      providerUsername: 'patch-orig@example.com',
    });
    const id = add.body.connector.id as string;

    const patch = await agent.patch(`/api/v1/connector/${id}`).send({
      providerUsername: '  patch-updated@example.com  ',
      providerPassword: 'secret',
      token: { Cookie: 'k=v', 'User-Agent': 'UA' },
    });
    expect(patch.status).toBe(200);
    expect(patch.body.connector.providerUsername).toBe('patch-updated@example.com');
    expect(patch.body.connector.provider).toBe('chargepoint');

    // Provider field in body is silently ignored (schema strips unknown keys).
    const tryProviderChange = await agent
      .patch(`/api/v1/connector/${id}`)
      .send({ provider: 'swtch' });
    expect(tryProviderChange.status).toBe(200);
    expect(tryProviderChange.body.connector.provider).toBe('chargepoint');

    // Foreign-user 404
    const { agent: other } = await provisionUser('patch-other');
    const foreign = await other.patch(`/api/v1/connector/${id}`).send({
      providerUsername: 'hijack@example.com',
    });
    expect(foreign.status).toBe(404);
  });

  it('DELETE /connector/:id with removeSessions=true deletes sessions too', async () => {
    const { agent, userId } = await provisionUser('del-cascade');
    const add = await agent.post('/api/v1/connector/add').send({
      provider: 'chargepoint',
      providerUsername: 'cascade@example.com',
    });
    const id = add.body.connector.id as string;

    const { getDb } = await import('../src/services/db/index.js');
    const { chargeSessions } = await import('../src/services/db/schema.js');
    const db = getDb();
    db.insert(chargeSessions)
      .values([
        {
          id: `cas-${id}-1`,
          userId,
          connectorId: id,
          providerSessionId: 'p1',
          startedAt: '2026-04-10T00:00:00.000Z',
          endedAt: '2026-04-10T01:00:00.000Z',
          powerKwh: 1,
          durationSeconds: 3600,
          price: 1,
        },
        {
          id: `cas-${id}-2`,
          userId,
          connectorId: id,
          providerSessionId: 'p2',
          startedAt: '2026-04-11T00:00:00.000Z',
          endedAt: '2026-04-11T01:00:00.000Z',
          powerKwh: 2,
          durationSeconds: 3600,
          price: 2,
        },
      ])
      .run();

    const del = await agent.delete(`/api/v1/connector/${id}?removeSessions=true`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true, removedSessions: 2, nullifiedSessions: 0 });

    const remaining = await agent.get('/api/v1/sessions');
    expect(
      remaining.body.sessions.filter(
        (s: { id: string }) => s.id === `cas-${id}-1` || s.id === `cas-${id}-2`,
      ),
    ).toEqual([]);
  });

  it('DELETE /connector/:id default keeps sessions and nulls connectorId', async () => {
    const { agent, userId } = await provisionUser('del-keep');
    const add = await agent.post('/api/v1/connector/add').send({
      provider: 'chargepoint',
      providerUsername: 'keep@example.com',
    });
    const id = add.body.connector.id as string;

    const { getDb } = await import('../src/services/db/index.js');
    const { chargeSessions } = await import('../src/services/db/schema.js');
    const db = getDb();
    db.insert(chargeSessions)
      .values({
        id: `keep-${id}-1`,
        userId,
        connectorId: id,
        providerSessionId: 'k1',
        startedAt: '2026-04-12T00:00:00.000Z',
        endedAt: '2026-04-12T01:00:00.000Z',
        powerKwh: 3,
        durationSeconds: 3600,
        price: 1.5,
      })
      .run();

    const del = await agent.delete(`/api/v1/connector/${id}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true, removedSessions: 0, nullifiedSessions: 1 });

    const sessionsRes = await agent.get('/api/v1/sessions');
    const found = sessionsRes.body.sessions.find((s: { id: string }) => s.id === `keep-${id}-1`);
    expect(found).toBeTruthy();
    expect(found.connectorId).toBeNull();
    expect(found.provider).toBeNull();
  });

  it('DELETE /connector/:id returns 404 for foreign user', async () => {
    const { agent: ownerAgent } = await provisionUser('del-owner');
    const add = await ownerAgent.post('/api/v1/connector/add').send({
      provider: 'chargepoint',
      providerUsername: 'owner@example.com',
    });
    const id = add.body.connector.id as string;

    const { agent: foreign } = await provisionUser('del-foreign');
    const res = await foreign.delete(`/api/v1/connector/${id}`);
    expect(res.status).toBe(404);
  });
});
