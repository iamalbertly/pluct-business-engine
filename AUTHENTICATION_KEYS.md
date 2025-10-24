# Pluct Business Engine - Authentication Keys & Configuration

## 🔐 **ADMIN AUTHENTICATION KEYS**

### **Primary Admin Key (Production)**
```
ENGINE_ADMIN_KEY=engine-shared-secret-Yf9pR3kLx2tN6vQ4mC1aS8bE5wG7zH0jU9rK3dP6qT1nV8xL4fZ2yM7cJ5aB9eR
```

### **Alternative Admin Keys (Legacy Support)**
```
ADMIN_SECRET=prod-admin-secret-kPq7rX8sYb2nLw5cFgHjEmV
ADMIN_API_KEY=engine-shared-secret-Yf9pR3kLx2tN6vQ4mC1aS8bE5wG7zH0jU9rK3dP6qT1nV8xL4fZ2yM7cJ5aB9eR
```

## 🔑 **JWT AUTHENTICATION**

### **JWT Secret (Production)**
```
ENGINE_JWT_SECRET=prod-jwt-secret-Z8qKsL2wDn9rFy6aVbP3tGxE0cH4mN5jR7sT1uC9e
```

### **Alternative JWT Keys (Legacy Support)**
```
JWT_SECRET=prod-jwt-secret-Z8qKsL2wDn9rFy6aVbP3tGxE0cH4mN5jR7sT1uC9e
ENGINE_SHARED_SECRET=prod-jwt-secret-Z8qKsL2wDn9rFy6aVbP3tGxE0cH4mN5jR7sT1uC9e
```

## 🌐 **TTTRANSCRIBE SERVICE AUTHENTICATION**

### **TTTranscribe Shared Secret**
```
TTT_SHARED_SECRET=hf_sUP3rL0nGrANd0mAp1K3yV4xYb2pL6nM8zJ9fQ1cD5eS7tT0rW3gU
```

### **Alternative TTT Keys (Legacy Support)**
```
ENGINE_SHARED_SECRET=hf_sUP3rL0nGrANd0mAp1K3yV4xYb2pL6nM8zJ9fQ1cD5eS7tT0rW3gU
```

### **TTTranscribe Base URL**
```
TTT_BASE=https://iamromeoly-tttranscibe.hf.space
```

## 📱 **ANDROID APP (PluctMobileApp) CONFIGURATION**

### **Required Headers for Android App**
```kotlin
// For user authentication
"Authorization": "Bearer <JWT_TOKEN>"

// For admin operations (if needed)
"X-API-Key": "engine-shared-secret-Yf9pR3kLx2tN6vQ4mC1aS8bE5wG7zH0jU9rK3dP6qT1nV8xL4fZ2yM7cJ5aB9eR"

// For request deduplication
"X-Client-Request-Id": "<UNIQUE_REQUEST_ID>"
"X-User-ID": "<USER_ID>"
```

### **Android App JWT Token Generation**
```kotlin
fun generateUserJWT(userId: String): String {
    val now = System.currentTimeMillis() / 1000
    val payload = mapOf(
        "sub" to userId,
        "scope" to "ttt:transcribe",
        "iat" to now,
        "exp" to (now + 900) // 15 minutes
    )
    
    val secret = "prod-jwt-secret-Z8qKsL2wDn9rFy6aVbP3tGxE0cH4mN5jR7sT1uC9e"
    return JWT.create()
        .withPayload(payload)
        .withExpiresAt(Date(now + 900 * 1000))
        .sign(Algorithm.HMAC256(secret))
}
```

## 🤖 **TTTRANSCRIBE HUGGING FACE SERVICE CONFIGURATION**

### **Required Environment Variables for TTTranscribe Service**
```bash
# TTTranscribe Service Authentication
TTT_SHARED_SECRET=hf_sUP3rL0nGrANd0mAp1K3yV4xYb2pL6nM8zJ9fQ1cD5eS7tT0rW3gU

# Pluct Business Engine Base URL
PLUCT_BASE_URL=https://pluct-business-engine.romeo-lya2.workers.dev

# Required Headers for TTTranscribe Service
X-Engine-Auth: hf_sUP3rL0nGrANd0mAp1K3yV4xYb2pL6nM8zJ9fQ1cD5eS7tT0rW3gU
Content-Type: application/json
```

### **TTTranscribe Service Endpoints**
```
POST /transcribe
GET /status/:id
```

## 🔧 **CLOUDFLARE WORKER CONFIGURATION**

### **Required Secrets (Set via wrangler)**
```bash
# Set these secrets in Cloudflare Workers
wrangler secret put ENGINE_ADMIN_KEY
wrangler secret put ENGINE_JWT_SECRET  
wrangler secret put TTT_SHARED_SECRET
```

### **Environment Variables**
```bash
# In wrangler.toml [vars] section
TTT_BASE = "https://iamromeoly-tttranscibe.hf.space"
LOG_LEVEL = "info"
MAX_RETRIES = "3"
REQUEST_TIMEOUT = "30000"
```

## 🛡️ **SECURITY BEST PRACTICES**

### **Key Rotation Schedule**
- **ENGINE_ADMIN_KEY**: Rotate every 90 days
- **ENGINE_JWT_SECRET**: Rotate every 180 days  
- **TTT_SHARED_SECRET**: Rotate every 365 days

### **Key Length Requirements**
- **ENGINE_ADMIN_KEY**: Minimum 32 characters
- **ENGINE_JWT_SECRET**: Minimum 32 characters
- **TTT_SHARED_SECRET**: Minimum 32 characters

### **Access Control**
- **Admin Keys**: Only for server-to-server communication
- **JWT Tokens**: User authentication with 15-minute TTL
- **TTT Keys**: Service-to-service authentication

## 📋 **API ENDPOINT AUTHENTICATION MATRIX**

| Endpoint | Method | Auth Required | Key Type |
|----------|--------|---------------|----------|
| `/health` | GET | None | - |
| `/health/services` | GET | None | - |
| `/meta` | GET | None | - |
| `/meta/resolve` | POST | Config | Environment |
| `/v1/credits/balance` | GET | JWT | User Token |
| `/v1/vend-token` | POST | JWT | User Token |
| `/v1/credits/add` | POST | Admin | X-API-Key or Bearer |
| `/ttt/transcribe` | POST | JWT | Short-lived Token |
| `/ttt/status/:id` | GET | JWT | Short-lived Token |

## 🚀 **DEPLOYMENT CHECKLIST**

### **Before Deployment**
- [ ] All secrets are set in Cloudflare Workers
- [ ] TTT service is configured with correct shared secret
- [ ] Android app is updated with new JWT secret
- [ ] All environment variables are properly configured

### **After Deployment**
- [ ] Test all endpoints with `npm run cli:testAll`
- [ ] Verify CORS headers are working
- [ ] Check error responses follow schema
- [ ] Validate admin authentication
- [ ] Test TTTranscribe integration

## 📞 **SUPPORT & TROUBLESHOOTING**

### **Common Issues**
1. **403 Forbidden**: Check admin key configuration
2. **401 Unauthorized**: Verify JWT token generation
3. **500 Internal Error**: Check TTT service connectivity
4. **CORS Issues**: Verify origin configuration

### **Debug Endpoints**
- `GET /debug/config` - Configuration diagnostics
- `GET /health` - System health status
- `GET /health/services` - Service health monitoring

---

**Last Updated**: 2025-10-24  
**Version**: 1.0.0  
**Environment**: Production
