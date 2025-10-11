import { Hono } from 'hono';
import { initializeDatabase } from './initialize_db';
import type { Bindings } from './types';

// Import route handlers
import health from './routes/Pluct-API-Health-Monitoring';
import user from './routes/Pluct-API-User-Management';
import token from './routes/Pluct-API-Token-Operations';
import credits from './routes/Pluct-API-Credits-Management';
import admin from './routes/Pluct-API-Admin-Management';

const app = new Hono<{ Bindings: Bindings }>();

// Initialize database on startup
app.use('*', async (c, next) => {
  try {
    await initializeDatabase(c.env);
  } catch (error) {
    console.error('Database initialization error:', error);
    // Continue execution even if database init fails
  }
  await next();
});

// Mount all route handlers
app.route('/', health);
app.route('/', user);
app.route('/', token);
app.route('/', credits);
app.route('/admin', admin);

export default app;