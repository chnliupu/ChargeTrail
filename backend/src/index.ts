import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

async function bootstrap(): Promise<void> {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');
  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }

  const [{ createApp }, { initDb }, { seedDefaultAdmin }, { log }] = await Promise.all([
    import('./app.js'),
    import('./services/db/index.js'),
    import('./services/db/seed.js'),
    import('./services/logger/index.js'),
  ]);

  initDb();
  await seedDefaultAdmin();

  const port = Number(process.env.BACKEND_PORT ?? 3000);
  const app = createApp();
  const server = createServer(app);

  server.listen(port, () => {
    log.info(
      {
        fn: 'bootstrap',
      },
      `listening on :${port}`,
    );
  });
}

void bootstrap();
