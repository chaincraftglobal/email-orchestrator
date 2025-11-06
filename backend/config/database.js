import pg from 'pg';

const { Pool } = pg;

// Debug: Log environment variables
console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
console.log('🔍 DATABASE_URL exists:', !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
  console.log('🔍 DATABASE_URL (first 50 chars):', process.env.DATABASE_URL.substring(0, 50));
}

// Get DATABASE_URL from environment
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('DATA')));
  process.exit(1);
}

// Create PostgreSQL connection pool using connection string
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false // Required for Railway PostgreSQL
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client:', err);
  process.exit(-1);
});

// Test connection immediately on startup
(async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ Database connection test successful. Server time:', result.rows[0].now);
    client.release();
  } catch (err) {
    console.error('❌ Database connection test failed:', err.message);
  }
})();

// Query helper function
export const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('Executed query', { text, duration, rows: res.rowCount });
  return res;
};

export default pool;