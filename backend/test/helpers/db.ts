import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../src/services/db/schema.js';

const MIGRATIONS_FOLDER = join(process.cwd(), 'src/services/db/migrations');

export type TestDb = BetterSQLite3Database<typeof schema>;

/**
 * Create an in-memory SQLite database with the full migrated schema.
 * Returns the Drizzle client and the raw better-sqlite3 handle.
 */
export function setupTestDb(): {
  db: TestDb;
  sqlite: Database.Database;
} {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, {
    schema,
  });
  migrate(db, {
    migrationsFolder: MIGRATIONS_FOLDER,
  });
  return {
    db,
    sqlite,
  };
}
