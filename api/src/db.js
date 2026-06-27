import pg from 'pg';

// Load repo-root .env so `node --test` and runtime connect to the right port.
// In Docker, env vars are injected directly and no .env file exists -> swallow.
try { process.loadEnvFile(new URL('../../.env', import.meta.url)); } catch {}

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || 'somelec',
  password: process.env.POSTGRES_PASSWORD || 'change_me',
  database: process.env.POSTGRES_DB || 'sig_somelec',
});

pool.on('error', (err) => console.error('pg pool error', err));

export const query = (text, params) => pool.query(text, params);
export default pool;
