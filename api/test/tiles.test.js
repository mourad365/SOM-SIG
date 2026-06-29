import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import pool from '../src/db.js';

// z/x/y covering the real Nouakchott footprint (lignes/poteaux ~lon -15.95, lat 18.11).
const Z = 12, X = 1866, Y = 1838;

test('transfo tile returns a non-empty protobuf', async () => {
  const server = createApp().listen(0);
  const { port } = server.address();
  const res = await fetch(`http://localhost:${port}/tiles/transfo/${Z}/${X}/${Y}.pbf`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/x-protobuf');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 0, 'tile body should contain MVT features');
  server.close();
});

test('unknown layer is 400', async () => {
  const server = createApp().listen(0);
  const { port } = server.address();
  const res = await fetch(`http://localhost:${port}/tiles/bogus/1/0/0.pbf`);
  assert.equal(res.status, 400);
  server.close();
});

after(() => pool.end());
