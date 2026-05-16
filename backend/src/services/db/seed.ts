import { eq } from 'drizzle-orm';
import { getAuth } from '../auth/auth.js';
import { log } from '../logger/index.js';
import { getDb } from './index.js';
import { user } from './schema.js';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
// BA's email validation rejects single-label hosts like "admin@local",
// so default to a valid placeholder. Override via ADMIN_EMAIL.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
// No default: an admin is only env-seeded when ADMIN_PASSWORD is explicitly
// set. Otherwise the first admin is created via the web setup endpoint.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

/**
 * Bootstrap a single admin user from env vars the first time the DB comes up.
 *
 * No-op unless `ADMIN_PASSWORD` is explicitly set (we never ship a default
 * password — the web setup endpoint handles first-admin creation instead).
 * Idempotent: if any user with role='admin' exists, this is a no-op. Uses
 * Better Auth's server API so password hashing and the credential `account`
 * row stay consistent with normal signups.
 */
export async function seedDefaultAdmin(): Promise<void> {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.trim().length === 0) {
    log.info(
      {
        fn: 'seedDefaultAdmin',
      },
      'no ADMIN_PASSWORD set; skipping seed (web setup will handle first admin)',
    );
    return;
  }

  const db = getDb();
  const existingAdmin = db
    .select({
      id: user.id,
    })
    .from(user)
    .where(eq(user.role, 'admin'))
    .get();
  if (existingAdmin) {
    return;
  }

  const auth = getAuth();
  try {
    // `username` is a custom additional field on `user`; BA's public types
    // don't surface additionalFields on the server-API body, so we widen.
    const signUp = auth.api.signUpEmail as unknown as (args: {
      body: Record<string, unknown>;
    }) => Promise<{
      user?: {
        id?: string;
      };
    }>;
    const result = await signUp({
      body: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        name: ADMIN_USERNAME,
        username: ADMIN_USERNAME,
      },
    });
    const newUserId = result?.user?.id;
    if (!newUserId) {
      log.warn(
        {
          fn: 'seedDefaultAdmin',
        },
        'signUpEmail returned without a user id; admin not promoted',
      );
      return;
    }
    db.update(user)
      .set({
        role: 'admin',
      })
      .where(eq(user.id, newUserId))
      .run();
    log.info(
      {
        fn: 'seedDefaultAdmin',
        username: ADMIN_USERNAME,
      },
      'seeded default admin user',
    );
  } catch (err) {
    log.error(
      {
        fn: 'seedDefaultAdmin',
        err,
      },
      'could not seed admin',
    );
  }
}
