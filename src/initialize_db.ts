// Cloudflare D1 Database initialization
// This file is used for local development database setup

export async function initializeDatabase(env: { DB: D1Database }) {
  try {
    // Create the transactions table with the correct schema
    const transactionsSQL = `
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  reason TEXT
);`;

    // Create the api_keys table for secure API key management
    const apiKeysSQL = `
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);`;

    // Execute each table creation separately for better error handling
    await env.DB.exec(transactionsSQL);
    await env.DB.exec(apiKeysSQL);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    // Don't throw error to prevent app crashes - just log it
    console.error('Continuing without database initialization...');
  }
}