import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('initDb', () => {
  let tmpDir: string | undefined;
  let sqlite: { close: () => void } | undefined;
  let previousDbPath: string | undefined;

  afterEach(() => {
    sqlite?.close();
    sqlite = undefined;

    if (tmpDir) {
      rmSync(tmpDir, {
        recursive: true,
        force: true,
      });
      tmpDir = undefined;
    }

    if (previousDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = previousDbPath;
    }
    previousDbPath = undefined;
    vi.resetModules();
  });

  it('treats DB_PATH as a database folder and creates it when missing', async () => {
    previousDbPath = process.env.DB_PATH;
    tmpDir = mkdtempSync(join(tmpdir(), 'es-db-test-'));
    const dbFolder = join(tmpDir, 'nested', 'storage');
    process.env.DB_PATH = dbFolder;

    await vi.resetModules();
    const { getSqlite, initDb } = await import('../../../src/services/db/index.js');

    expect(existsSync(dbFolder)).toBe(false);
    initDb();
    sqlite = getSqlite();

    expect(existsSync(dbFolder)).toBe(true);
    expect(existsSync(join(dbFolder, 'chargetrail.db'))).toBe(true);
  });
});
