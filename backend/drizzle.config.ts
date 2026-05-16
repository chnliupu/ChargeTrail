import { resolve } from 'node:path';
import type { Config } from 'drizzle-kit';

const dbPath = resolve(process.env.DB_PATH ?? './data/electric-stats.db');

export default {
  schema: './src/services/db/schema.ts',
  out: './src/services/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath,
  },
  strict: true,
  verbose: true,
} satisfies Config;
