// Define the environment bindings
export type Bindings = {
  DB: D1Database;
  PLUCT_KV: KVNamespace;
  JWT_SECRET: string;
  WEBHOOK_SECRET: string;
  ADMIN_SECRET: string; // For securing admin endpoints
};
