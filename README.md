Pluct Business Engine

![alt text](https://github.com/iamalbertly/pluct-business-engine/actions/workflows/deploy.yml/badge.svg)

This is not just code; it is the central nervous system of the Pluct application ecosystem. It is a highly-available, infinitely-scalable, and zero-maintenance Cloudflare Worker responsible for securely managing user value and access to premium features.

Its sole purpose is to act as a secure, stateless broker between the Pluct app and our payment systems, ensuring that our core backend services are never exposed directly to financial transactions or complex authentication logic.

Core Responsibilities

Credit Management: Securely adds "Pluct Credits" to a user's account upon successful payment verification.

Token Vending: Issues short-lived, single-use JSON Web Tokens (JWTs) in exchange for one Pluct Credit.

Security & Isolation: Acts as the sole gatekeeper for premium API access, decoupling our monetization logic from our core product logic.

Architecture Overview

This engine is built on a serverless foundation for maximum reliability and zero cost at scale.

Compute: A Cloudflare Worker written in TypeScript using the Hono framework for routing.

Database: A Cloudflare KV namespace (PLUCT_KV) acts as our ledger, storing user IDs as keys and their credit balance as values.

Security: Access is controlled via a webhook secret for adding credits and short-lived JWTs for spending them. All production secrets are managed via GitHub Actions Secrets.

The "Pluct Credits" System

"Pluct Credits" are the currency of our ecosystem. The logic is simple and robust.

What is a Credit? One credit represents the right to perform one premium, server-side action (e.g., a single TikTok transcription using our high-powered cloud engine).

How are Credits Acquired? Credits are added to a user's account exclusively through the /add-credits webhook. When a user pays through a gateway like M-Pesa, the gateway sends a validated, server-to-server request to this webhook with a secret key. This is the only way to mint new credits.

How are Credits Spent? To perform a premium action, the Pluct mobile app first calls the /vend-token endpoint. The engine checks the user's balance, deducts one credit, and returns a JWT. This JWT is the "ticket" the app then presents to the premium backend service to prove it has paid for the job.

Why this model? It's incredibly secure. Our transcription server never deals with payments or user balances. It only has to validate a JWT, a simple and stateless operation. This makes the entire system resilient and easy to reason about.

API Endpoints

The engine exposes two critical, firewalled endpoints.

1. Vend Token

Issues a single-use JWT for performing a premium action. This is the primary endpoint called by the Pluct mobile app.

Endpoint: POST /vend-token

Request Body:

code
JSON
download
content_copy
expand_less
{
  "userId": "client-generated-unique-user-id-123"
}

Success Response (200 OK):

code
JSON
download
content_copy
expand_less
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOi..."
}

Failure Response (403 Forbidden):

code
JSON
download
content_copy
expand_less
{
  "error": "Insufficient credits"
}
2. Add Credits (Webhook)

Adds a specified number of credits to a user's account. This endpoint should only be called by a trusted payment provider's backend.

Endpoint: POST /add-credits

Required Header: x-webhook-secret: YOUR_PRODUCTION_WEBHOOK_SECRET

Request Body:

code
JSON
download
content_copy
expand_less
{
  "userId": "client-generated-unique-user-id-123",
  "amount": 10
}

Success Response (200 OK):

code
JSON
download
content_copy
expand_less
{
  "success": true,
  "newBalance": 10
}

Failure Response (401 Unauthorized):

code
JSON
download
content_copy
expand_less
{
  "error": "Unauthorized"
}
Local Development Setup

Follow these steps to run the engine on your local machine.

Prerequisites:

Node.js (LTS version)

A Cloudflare account

Installation:

code
Bash
download
content_copy
expand_less
npm install

Configuration:

Create your KV namespace in the Cloudflare Dashboard (under Storage & Databases -> Workers KV).

Rename the wrangler.jsonc.example file (if provided) to wrangler.jsonc.

Copy the ID of your newly created KV namespace and paste it into both the id and preview_id fields in wrangler.jsonc.

Run the Development Server:

code
Bash
download
content_copy
expand_less
npx wrangler dev

The server will be available at http://localhost:8787.

Testing with curl:

Add credits:

code
Bash
download
content_copy
expand_less
curl -X POST http://localhost:8787/add-credits \
-H "Content-Type: application/json" \
-H "x-webhook-secret: local-dev-webhook-secret-never-use-in-prod-67890" \
-d '{"userId": "test-user-1", "amount": 5}'

Spend a credit to get a token:

code
Bash
download
content_copy
expand_less
curl -X POST http://localhost:8787/vend-token \
-H "Content-Type: application/json" \
-d '{"userId": "test-user-1"}'
Deployment (CI/CD)

Deployment is fully automated via GitHub Actions. Any push to the main branch will trigger the deploy.yml workflow, which securely builds and deploys the worker to Cloudflare's global network.

Production URL: https://pluct-business-engine.romeo-lya2.workers.dev

Required GitHub Secrets

For deployment to succeed, the following secrets must be configured in the GitHub repository's settings (Settings > Secrets and variables > Actions):

CF_ACCOUNT_ID: Your Cloudflare Account ID.

CF_API_TOKEN: A Cloudflare API token with "Edit Cloudflare Workers" permissions.

JWT_SECRET: A long, random string used to sign production JWTs.

WEBHOOK_SECRET: A long, random string used to validate incoming payment webhooks.

Operational Management

The Cloudflare Dashboard serves as the complete control panel for this engine.

Logs: Real-time request logs can be viewed by navigating to Workers & Pages -> pluct-business-engine -> Logs.

Analytics: View request volume, latency, and CPU usage under the Analytics tab for the worker.

Manual Credit Adjustments: User credit balances can be viewed and manually adjusted by navigating to Storage & Databases -> Workers KV -> PLUCT_KV. This is your primary customer support tool.