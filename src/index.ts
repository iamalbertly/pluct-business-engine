import { PluctGateway } from './Pluct-Core-Gateway-Main-Refactored';

// Create and initialize the gateway
const gateway = new PluctGateway();

// Export the Hono app for Cloudflare Workers
export default gateway.getApp();
