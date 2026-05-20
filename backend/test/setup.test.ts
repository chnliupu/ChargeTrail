import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let tmpDir: string;
let app: import('express').Express;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'es-setup-test-'));
  process.env.DB_PATH = tmpDir;
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-12345678901234567890';
  // No ADMIN_PASSWORD: env seeding must be skipped so the web setup flow owns
  // first-admin creation.
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;

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

describe('first-run admin setup', () => {
  it('exposes setup while no admin exists, then permanently closes it', async () => {
    const status0 = await request(app).get('/api/v1/setup/status');
    expect(status0.status).toBe(200);
    expect(status0.body).toEqual({
      noAdmin: true,
    });

    const invalid = await request(app).post('/api/v1/setup/admin').send({
      email: 'admin@example.com',
      username: 'admin',
    });
    expect(invalid.status).toBe(400);

    const agent = request.agent(app);
    const created = await agent.post('/api/v1/setup/admin').send({
      email: 'admin@example.com',
      username: 'admin',
      password: 'password12345',
      name: 'Site Admin',
    });
    expect(created.status).toBe(200);
    expect(created.body.user?.email).toBe('admin@example.com');
    const adminId = created.body.user?.id as string;
    expect(adminId).toEqual(expect.any(String));
    expect(created.headers['set-auth-token']).toEqual(expect.any(String));

    const { getDb } = await import('../src/services/db/index.js');
    const { user } = await import('../src/services/db/schema.js');
    const row = getDb()
      .select({
        role: user.role,
      })
      .from(user)
      .where(eq(user.id, adminId))
      .get();
    expect(row?.role).toBe('admin');

    // Session cookie from setup should authenticate immediately.
    const session = await agent.get('/api/auth/get-session');
    expect(session.status).toBe(200);
    expect(session.body.user?.email).toBe('admin@example.com');

    // Whole setup surface is now closed.
    const status1 = await request(app).get('/api/v1/setup/status');
    expect(status1.status).toBe(404);

    const secondAdmin = await request(app).post('/api/v1/setup/admin').send({
      email: 'admin2@example.com',
      username: 'admin2',
      password: 'password12345',
    });
    expect(secondAdmin.status).toBe(404);
  });
});
