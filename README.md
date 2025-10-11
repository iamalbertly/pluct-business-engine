# Pluct Business Engine

A secure, credit-based token vending system built for business applications using Cloudflare Workers, D1 Database, and KV Storage.

## 🚀 Overview

The Pluct Business Engine is a professional-grade API service that manages user credits and vends JWT tokens. It's designed for applications that need to control access to premium features or services through a credit-based system.

### Key Features

- **Credit Management**: Users can earn and spend credits
- **JWT Token Vending**: Secure token generation with expiration
- **Transaction Logging**: Complete audit trail of all transactions
- **Admin Interface**: Secure admin API for user and transaction management
- **Webhook Integration**: Automated credit addition via webhooks
- **User Management**: User creation, balance checking, and transaction history

## 🏗️ Architecture

- **Runtime**: Cloudflare Workers (serverless)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare KV (key-value store)
- **Framework**: Hono (lightweight web framework)
- **Authentication**: JWT tokens with bearer authentication

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
.\scripts\pluct-test-complete.ps1

# Test production
.\scripts\pluct-test-production.ps1
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

### Transaction Types

- `user_creation`: Initial credit allocation
- `add_webhook`: Credits added via webhook
- `admin_add`: Credits added by admin
- `spend`: Credits spent on token vending

## 🔐 Security

### Authentication Methods

1. **Webhook Secret**: Required for `/add-credits` endpoint
2. **Admin Token**: Required for all `/admin/*` endpoints
3. **User ID**: Required for user-specific endpoints

### Security Features

- Input validation on all endpoints
- Rate limiting protection
- Secure JWT token generation
- Bearer token authentication for admin endpoints
- Webhook secret validation

## 🚀 Deployment

### Automatic Deployment

The project includes GitHub Actions for automatic deployment:

1. Push to `master` branch
2. GitHub Actions triggers
3. D1 migrations applied
4. Worker deployed to Cloudflare

### Manual Deployment

```bash
# Deploy to Cloudflare
npm run deploy

# Or with Wrangler
npx wrangler deploy
```

## 📝 Usage Examples

### Create a User

```bash
curl -X POST http://localhost:8787/user/create \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "initialCredits": 10}'
```

### Check User Balance

```bash
curl http://localhost:8787/user/user123/balance
```

### Add Credits via Webhook

```bash
curl -X POST http://localhost:8787/add-credits \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-webhook-secret" \
  -d '{"userId": "user123", "amount": 5}'
```

### Vend a Token

```bash
curl -X POST http://localhost:8787/vend-token \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123"}'
```

### Validate a Token

```bash
curl -X POST http://localhost:8787/validate-token \
  -H "Content-Type: application/json" \
  -d '{"token": "your-jwt-token"}'
```

### Admin: Get All Users

```bash
curl -H "Authorization: Bearer your-admin-token" \
  http://localhost:8787/admin/users
```

## 🧪 Testing Scripts

The project includes comprehensive testing scripts:

- `pluct-build-test.ps1`: Tests TypeScript compilation and Wrangler build
- `pluct-test-local.ps1`: Tests local development endpoints
- `pluct-test-complete.ps1`: Comprehensive system testing
- `pluct-test-production.ps1`: Tests production endpoints
- `pluct-deploy.ps1`: Deployment automation

## 📈 Monitoring

### Health Check

```bash
curl http://localhost:8787/health
```

### Production URL

```
https://pluct-business-engine.romeo-lya2.workers.dev
```

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

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:

1. Check the health endpoint: `/health`
2. Review the logs in Cloudflare Workers dashboard
3. Test locally with the provided scripts
4. Check GitHub Actions for deployment status

---

**Built with ❤️ using Cloudflare Workers, D1, and Hono**