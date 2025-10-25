import { PluctGateway } from './Pluct-Core-Gateway-01Orchestrator';

// Create and initialize the gateway
const gateway = new PluctGateway();

// Export the Hono app for Cloudflare Workers
export default {
  async fetch(request: Request, env: any, ctx: any) {
    // Initialize the gateway with the environment
    await gateway.initialize(env);
    return gateway.getApp().fetch(request, env, ctx);
  }
};
