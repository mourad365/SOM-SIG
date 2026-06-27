import express from 'express';
import { query } from './db.js';
import { tilesRouter } from './tiles.js';

export function createApp() {
  const app = express();
  app.use('/tiles', tilesRouter);
  app.get('/health', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({ status: 'ok', db: true });
    } catch {
      res.status(500).json({ status: 'error', db: false });
    }
  });
  return app;
}

// Only listen when run directly, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const port = Number(process.env.API_PORT || 3001);
  createApp().listen(port, () => console.log(`API on :${port}`));
}
