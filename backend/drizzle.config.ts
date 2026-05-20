import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Config } from 'drizzle-kit';

const DB_FILE_NAME = 'chargetrail.db';
const dbFolder = resolve(process.env.DB_PATH ?? './data');
mkdirSync(dbFolder, {
  recursive: true,
});
const dbPath = join(dbFolder, DB_FILE_NAME);

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
