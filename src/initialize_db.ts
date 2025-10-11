// Cloudflare D1 Database initialization
// This file is used for local development database setup

export async function initializeDatabase(env: { DB: D1Database }) {
  try {
    // Create the transactions table with the correct schema
    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        reason TEXT
      );
    `);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}