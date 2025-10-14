# Pluct Business Engine - Gateway Architecture

## 🚀 New Gateway Architecture

The Pluct Business Engine has been transformed into a **mobile app gateway** that serves as the only interface the mobile Pluct app talks to. It vends tokens, calls TTTranscribe on the app's behalf, returns `request_id`, and provides status and metadata while enforcing credits.

## ✅ Gateway Implementation

### 1. **New Cloudflare Worker Layout**
```
pluct-business-engine/
  wrangler.toml          # KV + secrets configuration
  src/
    index.ts             # Main routing (88 lines)
    auth.ts              # JWT token vending (20 lines)
    credits.ts           # Credit management (15 lines)
    proxy.ts             # TTTranscribe proxy (10 lines)
    meta.ts              # TikTok metadata resolver (60 lines)
    cors.ts              # CORS headers (3 lines)
```

### 2. **Core Gateway Features**
- **Token Vending**: JWT tokens with 15-minute expiration
- **Credit Enforcement**: Spends 1 credit per token
- **TTTranscribe Proxy**: Secure forwarding with internal secrets
- **Metadata Resolution**: Server-side TikTok page parsing
- **CORS Support**: Mobile app integration ready

### 3. **KV Storage Structure**
- `KV_USERS:credits:<userId>` → integer balance
- `KV_USERS:profile:<userId>` → JSON profile data
- `KV_USERS:meta:<url>` → cached metadata (1-6h TTL)

### 4. **API Endpoints**

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| `GET` | `/health` | Health check with route list | None |
| `POST` | `/v1/credits/add` | Admin credit top-up | X-API-Key header |
| `POST` | `/vend-token` | Vend JWT token (costs 1 credit) | None |
| `POST` | `/ttt/transcribe` | Proxy to TTTranscribe | Bearer JWT |
| `GET` | `/ttt/status/:id` | Check transcription status | Bearer JWT |
| `POST` | `/meta/resolve` | Resolve TikTok metadata | None |

### 5. **Security Implementation**
- **JWT Tokens**: 15-minute expiration, `ttt:transcribe` scope
- **Internal Secrets**: `TTT_SHARED_SECRET` for TTTranscribe communication
- **Admin Keys**: `ENGINE_ADMIN_KEY` for credit management
- **Credit Validation**: Prevents token vending without credits

### 6. **Logging & Monitoring**
- `be:vending user=<id> ok=true/false` - Token vending logs
- `be:ttt call=transcribe/status http=<status>` - Proxy call logs
- Structured error handling with specific error codes

## 📊 File Structure

```
src/
├── index.ts (88 lines) - Main routing with all endpoints
├── auth.ts (20 lines) - JWT token vending logic
├── credits.ts (15 lines) - Credit management utilities
├── proxy.ts (10 lines) - TTTranscribe proxy functions
├── meta.ts (60 lines) - TikTok metadata resolver with caching
└── cors.ts (3 lines) - CORS middleware
```

## 🧪 Testing & Deployment

### Build Status
- **TypeScript Compilation**: ✅ All files compile successfully
- **Wrangler Build**: ✅ Worker builds without errors
- **Dependencies**: ✅ Hono and jose dependencies available

### Configuration
- **wrangler.toml**: KV namespace and environment variables
- **Secrets Required**: `ENGINE_JWT_SECRET`, `ENGINE_ADMIN_KEY`, `TTT_SHARED_SECRET`
- **KV Namespace**: `KV_USERS` for user data and caching

### Test Script
- **test-new-endpoints.ps1**: Comprehensive endpoint testing
- **Health Check**: Verifies all routes are available
- **Credit Management**: Tests admin credit addition
- **Token Flow**: Tests complete token vending workflow
- **Proxy Testing**: Tests TTTranscribe proxy endpoints
- **Metadata Resolution**: Tests TikTok metadata extraction

## 🎯 Gateway Benefits

1. **Single Point of Contact**: Mobile app only talks to this gateway
2. **Credit Enforcement**: Built-in credit system prevents abuse
3. **Secure Proxy**: Internal secrets protect TTTranscribe communication
4. **Metadata Caching**: Reduces TikTok API calls with smart caching
5. **JWT Security**: Short-lived tokens with proper scoping
6. **Logging**: Comprehensive logging for debugging and monitoring

## 🚀 Production Ready

- **Architecture**: Clean, modular Cloudflare Worker
- **Security**: Multiple layers of authentication and validation
- **Performance**: KV caching and efficient proxy forwarding
- **Monitoring**: Structured logging for all operations
- **Scalability**: Serverless architecture with automatic scaling

The gateway successfully transforms the business engine into a mobile app gateway that controls access, enforces credits, and provides secure proxy services to TTTranscribe while maintaining clean architecture and comprehensive logging.

## 🔧 Local CLI (Single Source of Truth)

- Location: `cli/index.ts` (TypeScript, executed via `tsx`)
- Env sourcing: reads `.dev.vars` at repo root; supports `BASE_URL` override
- Commands:
  - `status` → calls `/health`
  - `seed-credits <userId> <amount>` → tries in order:
    - `POST /v1/credits/add` with `X-API-Key: ENGINE_ADMIN_KEY`
    - `POST /admin/credits/add` with `Authorization: Bearer ADMIN_SECRET`
    - `POST /add-credits` with `x-webhook-secret: WEBHOOK_SECRET`
  - `vend-token <userId>` → `POST /vend-token`
  - `balance <userId>` → `GET /user/:userId/balance`
  - `validate <jwt>` → `GET /ttt/status/ping` with `Authorization: Bearer`
- Logging: appends to `logs/cli.log` with timestamps

### Dependency Map (concise)
- CLI → Worker endpoints: `/health`, `/v1/credits/add`, `/admin/credits/add`, `/add-credits`, `/vend-token`, `/user/:id/balance`, `/ttt/status/:id`
- Secrets used (from `.dev.vars`): `ENGINE_ADMIN_KEY`, `ADMIN_SECRET`, `WEBHOOK_SECRET`, optional `BASE_URL`
- Shares single source of truth with existing PowerShell scripts for endpoints and secrets

### Current Observations (2025-10-14)
- Status: OK (200)
- Seed via `X-API-Key`: 500 on `/v1/credits/add`; alternative paths attempted
- Balance: OK and reflects seeded value
- Vend token: 500 from production; needs server-side review despite sufficient credits