import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { log } from '../logger/index.js';
import * as schema from './schema.js';

export type AppDb = BetterSQLite3Database<typeof schema>;

let sqlite: Database.Database | undefined;
let dbInstance: AppDb | undefined;

const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function initDb(): AppDb {
  const path = resolve(process.env.DB_PATH ?? './data/electric-stats.db');
  mkdirSync(dirname(path), {
    recursive: true,
  });

  const handle = new Database(path);
  handle.pragma('journal_mode = WAL');
  handle.pragma('foreign_keys = ON');

  const orm = drizzle(handle, {
    schema,
  });
  migrate(orm, {
    migrationsFolder: MIGRATIONS_FOLDER,
  });
  log.info(
    {
      fn: 'initDb',
    },
    `db ready at ${path}`,
  );

  sqlite = handle;
  dbInstance = orm;
  return orm;
}

export function getDb(): AppDb {
  if (!dbInstance) {
    throw new Error('db not initialized; call initDb() first');
  }
  return dbInstance;
}

export function getSqlite(): Database.Database {
  if (!sqlite) {
    throw new Error('db not initialized; call initDb() first');
  }
  return sqlite;
}

export { schema };
