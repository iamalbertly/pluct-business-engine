export interface Env {
  DB: D1Database;
}

export class PluctDatabaseManager {
  constructor(private env: Env) {}

  async initializeDatabase(): Promise<void> {
    try {
      // Create credits table
      await this.env.DB.exec(`
        CREATE TABLE IF NOT EXISTS credits (
          user_id TEXT PRIMARY KEY,
          balance INTEGER NOT NULL DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create audits table
      await this.env.DB.exec(`
        CREATE TABLE IF NOT EXISTS audits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          request_id TEXT NOT NULL,
          action TEXT NOT NULL,
          route TEXT NOT NULL,
          status INTEGER NOT NULL,
          credit_delta INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          ip TEXT,
          user_agent TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create indices for better query performance
      await this.env.DB.exec(`
        CREATE INDEX IF NOT EXISTS idx_audits_user_id_created_at ON audits(user_id, created_at)
      `);
      
      await this.env.DB.exec(`
        CREATE INDEX IF NOT EXISTS idx_audits_request_id ON audits(request_id)
      `);
      
      console.log('be:database msg=Database initialized successfully');
    } catch (error) {
      console.log(`be:database msg=Database initialization failed, will use KV fallback metadata=${JSON.stringify({ error: (error as Error).message })}`);
      // Don't throw error - allow fallback to KV
    }
  }
}
