import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, bearer } from 'better-auth/plugins';
import { getDb, schema } from '../db/index.js';

function build() {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    disabledPaths: ['/sign-up/email'],
    database: drizzleAdapter(getDb(), {
      provider: 'sqlite',
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      // sign-up is enabled at the BA layer so server-side `auth.api.signUpEmail`
      // works for the admin seed and the invite-gated /api/v1/auth/register
      // route. The public /api/auth/sign-up/email HTTP endpoint is disabled
      // via Better Auth's `disabledPaths`.
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // sliding: refresh expiry once per active day
    },
    user: {
      additionalFields: {
        username: {
          type: 'string',
          required: true,
          input: true,
        },
      },
    },
    trustedOrigins: [process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'],
    plugins: [bearer(), admin()],
    advanced: {
      cookiePrefix: 'es',
    },
  });
}

let instance: ReturnType<typeof build> | undefined;

/**
 * Lazily-built Better Auth instance. Defers DB access until first use so
 * `initDb()` has a chance to run during boot.
 */
export function getAuth(): ReturnType<typeof build> {
  if (!instance) {
    instance = build();
  }
  return instance;
}

export type AuthInstance = ReturnType<typeof build>;
