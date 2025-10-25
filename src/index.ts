import { PluctGateway } from './Pluct-Core-Gateway-01Orchestrator';

// Create the gateway instance
const gateway = new PluctGateway();
let isInitialized = false;

// Export the Hono app for Cloudflare Workers
export default {
  async fetch(request: Request, env: any, ctx: any) {
    // Initialize the gateway only once
    if (!isInitialized) {
      await gateway.initialize(env);
      isInitialized = true;
    }
    return gateway.getApp().fetch(request, env, ctx);
  }
};
