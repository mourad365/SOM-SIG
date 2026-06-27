import pg from 'pg';

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
