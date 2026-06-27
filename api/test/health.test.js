import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import pool from '../src/db.js';

test('GET /health returns ok', async () => {
  const server = createApp().listen(0);
  const { port } = server.address();
  const res = await fetch(`http://localhost:${port}/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.db, true);
  server.close();
});

after(() => pool.end());
