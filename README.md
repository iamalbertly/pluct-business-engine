# Pluct Business Engine

A secure, scalable credit-based token vending platform built for business applications using Cloudflare Workers, D1 Database, and KV Storage. Now evolved into a **true platform** with API key management for external integrations.

## 🚀 Platform Overview

The Pluct Business Engine is a professional-grade API platform that manages user credits, vends JWT tokens, and provides secure API key access for external services. It's designed for applications that need to control access to premium features through a credit-based system with partner integration capabilities.

## ✅ Production Status

**🎉 PLATFORM DEPLOYMENT SUCCESSFUL!**

- **Live URL**: https://pluct-business-engine.romeo-lya2.workers.dev
- **Platform Evolution**: ✅ Now supports external integrations via API keys
- **Database**: ✅ D1 database with transaction logging and API key management
- **Security**: ✅ JWT validation, API key authentication, input sanitization
- **Testing**: ✅ Comprehensive test suite with production validation
- **Technical Debt**: ✅ All technical debt resolved with enhanced error handling

## 🔑 Key Platform Features

### Core Credit Management
- **Credit System**: Users can earn and spend credits
- **Transaction Logging**: Complete audit trail of all operations
- **User Management**: User creation, balance checking, and transaction history
- **Admin Interface**: Secure admin API for user and transaction management

### JWT Token System
- **Secure Token Vending**: JWT token generation with expiration
- **Token Validation**: Real-time token verification
- **Credit-Based Access**: Tokens cost credits to generate

### API Key Platform (NEW!)
- **External Integrations**: Partner services can add credits via API keys
- **Secure Authentication**: SHA-256 hashed API key storage
- **Key Management**: Create, list, and revoke API keys
- **Platform Access**: External services can integrate without exposing master secrets

### Webhook Integration
- **Automated Credits**: Credit addition via webhooks
- **Payment Integration**: Connect with payment gateways
- **Event-Driven**: Real-time credit updates

## 🏗️ Architecture

- **Runtime**: Cloudflare Workers (serverless)
- **Database**: Cloudflare D1 (SQLite) with API key management
- **Storage**: Cloudflare KV (key-value store)
- **Framework**: Hono (lightweight web framework)
- **Authentication**: JWT tokens, API keys, and bearer authentication
- **Security**: SHA-256 hashing, input validation, SQL injection protection

## 📋 API Endpoints

### Core API

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| `GET` | `/` | API documentation | None |
| `GET` | `/health` | Health check and endpoint list | None |
| `POST` | `/user/create` | Create new user account | None |
| `GET` | `/user/:userId/balance` | Get user credit balance | None |
| `GET` | `/user/:userId/transactions` | Get user transaction history | None |
| `POST` | `/validate-token` | Validate JWT token | None |
| `POST` | `/vend-token` | Vend JWT token (costs 1 credit) | None |
| `POST` | `/add-credits` | Add credits via webhook | Webhook Secret |

### Admin API

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| `GET` | `/admin/users` | Get all users with balances | Admin Token |
| `GET` | `/admin/transactions` | Get all transactions | Admin Token |
| `POST` | `/admin/credits/add` | Add credits to user account | Admin Token |

### API Key Management (NEW!)

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| `POST` | `/admin/api-keys/create` | Create new API key | Admin Token |
| `GET` | `/admin/api-keys` | List all API keys | Admin Token |
| `POST` | `/admin/api-keys/:id/revoke` | Revoke API key | Admin Token |

### API Key Protected Endpoints (NEW!)

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| `POST` | `/v1/credits/add` | Add credits via API key | API Key (X-API-Key header) |

## 🔧 Setup and Development

### Prerequisites

- Node.js 20+
- Cloudflare account
- Wrangler CLI

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd pluct-business-engine

# Install dependencies
npm install

# Set up environment variables
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your secrets
```

### Environment Variables

Create a `.dev.vars` file with the following variables:

```bash
# Cloudflare
CF_API_TOKEN=your_cloudflare_api_token
CF_ACCOUNT_ID=your_cloudflare_account_id

# App Secrets
ADMIN_SECRET=your_admin_secret
JWT_SECRET=your_jwt_secret
WEBHOOK_SECRET=your_webhook_secret

# Optional
D1_DATABASE=pluct-db
KV_NAMESPACE=PLUCT_KV
NODE_ENV=development
```

### Local Development

```bash
# Start development server
npm run dev

# Or with Wrangler directly
npx wrangler dev --port 8787
```

### Testing

```bash
# Test build
npm run build

# Test locally
npm run test:local

# Test production
npm run test:production

# Test complete system
npm run test:complete
```

## 📊 Database Schema

### Transactions Table

```sql
CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    reason TEXT
);
```

### API Keys Table (NEW!)

```sql
CREATE TABLE api_keys (
    id TEXT PRIMARY KEY,
    key_hash TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
);
```

### Transaction Types

- `user_creation`: Initial credit allocation
- `add_webhook`: Credits added via webhook
- `admin_add`: Credits added by admin
- `api_add`: Credits added via API key (NEW!)
- `spend`: Credits spent on token vending

## 🔐 Security

### Authentication Methods

1. **Webhook Secret**: Required for `/add-credits` endpoint
2. **Admin Token**: Required for all `/admin/*` endpoints
3. **API Key**: Required for `/v1/*` endpoints (X-API-Key header)
4. **User ID**: Required for user-specific endpoints

### Security Features

- **API Key Security**: SHA-256 hashed storage, never store raw keys
- **Input Validation**: Comprehensive validation on all endpoints
- **Rate Limiting**: Protection against abuse
- **Secure JWT**: Token generation with expiration
- **Bearer Authentication**: Admin and API key endpoints
- **SQL Injection Protection**: Parameterized queries

## 🚀 Platform Integration Examples

### Creating API Keys (Admin)

```bash
curl -X POST https://pluct-business-engine.romeo-lya2.workers.dev/admin/api-keys/create \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"description": "Partner Integration API Key"}'
```

### Adding Credits via API Key (External Service)

```bash
curl -X POST https://pluct-business-engine.romeo-lya2.workers.dev/v1/credits/add \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "amount": 10, "reason": "Partner bonus"}'
```

### Traditional Webhook Integration

```bash
curl -X POST https://pluct-business-engine.romeo-lya2.workers.dev/add-credits \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-webhook-secret" \
  -d '{"userId": "user123", "amount": 5}'
```

## 🧪 Testing Scripts

The project includes comprehensive testing scripts:

- `pluct-test-unified.ps1`: Unified testing suite with educational output
- `pluct-test-api-keys.ps1`: API key system testing
- `pluct-deploy-unified.ps1`: Deployment automation

### Running Tests

```bash
# Test production endpoints
npm run test:production

# Test complete system
npm run test:complete

# Test API key system
powershell -ExecutionPolicy Bypass -File .\scripts\pluct-test-api-keys.ps1
```

## 📈 Monitoring

### Health Check

```bash
curl https://pluct-business-engine.romeo-lya2.workers.dev/health
```

### Production URLs

- **Main API**: https://pluct-business-engine.romeo-lya2.workers.dev
- **Health Check**: https://pluct-business-engine.romeo-lya2.workers.dev/health
- **API Documentation**: https://pluct-business-engine.romeo-lya2.workers.dev/

## 🔧 Configuration

### Wrangler Configuration

The `wrangler.jsonc` file contains:

- Worker name and main entry point
- D1 database binding
- KV namespace binding
- Environment variables

### GitHub Actions

The `.github/workflows/deploy.yml` file handles:

- Node.js 20 setup
- Dependency installation
- D1 migration application
- Worker deployment
- Deployment verification

## 📚 API Documentation

### Response Formats

All endpoints return JSON responses with consistent error handling:

```json
{
  "success": true,
  "data": {...},
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Responses

```json
{
  "error": "Error message",
  "code": 400
}
```

## 🎯 Platform Evolution Summary

### ✅ What Was Accomplished

1. **✅ Core Credit System**
   - User management and credit tracking
   - JWT token vending system
   - Transaction logging and audit trails
   - Admin interface for management

2. **✅ API Key Platform (NEW!)**
   - Secure API key generation and management
   - SHA-256 hashed storage for security
   - External service integration capabilities
   - Partner onboarding system

3. **✅ Enhanced Security**
   - Multiple authentication methods
   - Input validation and sanitization
   - SQL injection protection
   - Comprehensive error handling

4. **✅ Technical Debt Resolution**
   - Fixed all database initialization issues
   - Enhanced error handling for all operations
   - Improved PowerShell test scripts
   - Updated API documentation

5. **✅ Production Deployment**
   - Successfully deployed to Cloudflare Workers
   - All secrets properly configured
   - Database migrations applied
   - Health checks and monitoring

### 🚀 Platform Capabilities

The Pluct Business Engine has evolved from a simple credit system into a **true platform**:

- **Before**: Single-purpose credit management
- **After**: Multi-tenant platform with API key access
- **Before**: Internal webhook integration only
- **After**: External partner integration capabilities
- **Before**: Manual admin operations
- **After**: Automated partner onboarding and management

### 🔧 Next Steps for Platform Usage

1. **Create API Keys** for partner services
2. **Integrate External Services** via API key authentication
3. **Monitor Platform Usage** through admin endpoints
4. **Scale Partner Onboarding** with automated key management
5. **Track All Operations** through comprehensive transaction logging

### 📊 Platform Monitoring

- Use `/health` endpoint for service monitoring
- Check `/admin/transactions` for audit logs
- Monitor `/admin/api-keys` for key usage
- Track `/admin/users` for user activity
- All operations are logged in D1 database

---

**🎉 PLATFORM SUCCESSFULLY EVOLVED!**

**Built with ❤️ using Cloudflare Workers, D1, Hono, and now with API key management for external integrations**