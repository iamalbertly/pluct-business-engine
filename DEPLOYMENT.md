# Pluct Business Engine - Deployment Guide

## Prerequisites

- Node.js 20+
- Cloudflare account
- Wrangler CLI installed (`npm install -g wrangler`)
- Access to TTTranscribe service

## Environment Configuration

### 1. Set Production Secrets

Run these commands to set the required secrets in Cloudflare Workers:

```bash
# Set JWT secret for user authentication
wrangler secret put ENGINE_JWT_SECRET
# Enter: prod-jwt-secret-Z8qKsL2wDn9rFy6aVbP3tGxE0cH4mN5jR7sT1uC9e

# Set admin key for credit management
wrangler secret put ENGINE_ADMIN_KEY
# Enter: engine-shared-secret-Yf9pR3kLx2tN6vQ4mC1aS8bE5wG7zH0jU9rK3dP6qT1nV8xL4fZ2yM7cJ5aB9eR

# Set TTTranscribe shared secret
wrangler secret put TTT_SHARED_SECRET
# Enter: hf_sUP3rL0nGrANd0mAp1K3yV4xYb2pL6nM8zJ9fQ1cD5eS7tT0rW3gU
```

### 2. Verify Environment Variables

The following variables are configured in `wrangler.toml`:

```toml
[vars]
TTT_BASE = "https://iamromeoly-tttranscribe.hf.space"   # TTTranscribe service URL
LOG_LEVEL = "info"                   # Logging level
MAX_RETRIES = "3"                    # Maximum retry attempts
REQUEST_TIMEOUT = "30000"            # Default timeout (10 min for /transcribe endpoint)
```

## Deployment Steps

### 1. Build and Deploy

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Deploy to Cloudflare Workers
npm run deploy
```

### 2. Verify Deployment

```bash
# Test health endpoint
curl https://pluct-business-engine.romeo-lya2.workers.dev/health

# Test service health
curl https://pluct-business-engine.romeo-lya2.workers.dev/health/services
```

## Configuration Details

### Timeout Configuration

The Pluct Business Engine implements endpoint-specific timeouts:

- **Default Timeout**: 30 seconds (configurable via `REQUEST_TIMEOUT`)
- **Transcription Endpoint** (`/ttt/transcribe`): 10 minutes (600,000ms)
- **Status Check Endpoint** (`/ttt/status/:id`): 30 seconds (default)

This configuration is handled automatically by the proxy service based on the endpoint path.

### Retry Logic

- **Maximum Retries**: 3 attempts
- **Backoff Strategy**: Exponential backoff (1s, 2s, 4s)
- **Retry Conditions**: 5xx errors, timeouts, network failures
- **No Retry**: 4xx errors (except 429), authentication failures

### Circuit Breaker

- **Failure Threshold**: 5 consecutive failures
- **Recovery Timeout**: 60 seconds
- **Half-Open Max Calls**: 3 test calls

## Monitoring and Health Checks

### Health Endpoints

- `GET /health` - Basic health check with route information
- `GET /health/services` - Detailed service health monitoring

### Logging

All operations are logged with structured format:
- Request/response logging
- Error tracking with context
- Performance metrics
- Circuit breaker state changes

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify secrets are set correctly using `wrangler secret list`
   - Check that TTTranscribe service is using the correct shared secret

2. **Timeout Issues**
   - Transcription jobs may take up to 10 minutes
   - Status checks should complete within 30 seconds
   - Check TTTranscribe service availability

3. **Circuit Breaker Open**
   - Monitor logs for circuit breaker state changes
   - Check TTTranscribe service health
   - Circuit breaker will automatically recover after 60 seconds

### Debug Commands

```bash
# Check secret configuration
wrangler secret list

# View logs
wrangler tail

# Test specific endpoints
curl -X POST https://pluct-business-engine.romeo-lya2.workers.dev/v1/vend-token \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user"}'
```

## Security Considerations

- All secrets are stored securely in Cloudflare Workers
- JWT tokens expire in 15 minutes
- Service tokens are short-lived and scoped
- All communication uses HTTPS
- Rate limiting prevents abuse

## Performance Optimization

- Metadata caching with randomized TTL (1-6 hours)
- Request idempotency prevents duplicate processing
- Circuit breaker prevents cascading failures
- Efficient KV storage for user data and caching

## Support

For deployment issues or questions:
1. Check the logs using `wrangler tail`
2. Verify all secrets are configured correctly
3. Test individual endpoints using the provided curl commands
4. Review the integration documentation for API usage
