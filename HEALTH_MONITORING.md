# Pluct Business Engine - Health Monitoring & Circuit Breaker

## Overview

The Pluct Business Engine now includes comprehensive health monitoring and circuit breaker functionality to ensure reliable service operation and graceful degradation when external services (like TTTranscribe) experience issues.

## Key Features

### 🔄 Circuit Breaker Pattern
- **Automatic Failure Detection**: Monitors TTT service calls and opens circuit when failures exceed threshold
- **Graceful Degradation**: Returns 503 Service Unavailable when circuit is open
- **Automatic Recovery**: Tests service health and gradually reopens circuit
- **Configurable Thresholds**: 5 failures trigger open state, 1-minute recovery timeout

### 📊 Service Health Monitoring
- **Real-time Health Checks**: Continuous monitoring of TTT service availability
- **Performance Metrics**: Tracks response times, error rates, and consecutive failures
- **Health Status**: Three states - healthy, degraded, unhealthy
- **Intelligent Recommendations**: Provides actionable insights for service issues

### 🛠️ Enhanced Error Handling
- **Retry Logic**: Exponential backoff for transient failures
- **Timeout Protection**: Configurable request timeouts
- **Detailed Error Messages**: Clear guidance for troubleshooting
- **Service Status Integration**: Error responses include circuit breaker state

## API Endpoints

### Health Check
```http
GET /health
```
Returns comprehensive health status including:
- Service availability
- Circuit breaker state
- Performance metrics
- Route discovery

### Service Health Monitoring
```http
GET /health/services
```
Returns detailed service health data:
- TTT service status and metrics
- Circuit breaker state and statistics
- Intelligent recommendations
- Performance indicators

## CLI Commands

### New Health Monitoring Commands
```bash
# Check service health
npm run cli:health

# Interactive menu with monitoring
npm run cli:menu
```

### Available CLI Options
- **Service Health**: View detailed health metrics
- **Service Recommendations**: Get actionable insights
- **TTT Connectivity Test**: Test transcription service
- **Circuit Breaker Status**: Monitor breaker state

## Configuration

### Environment Variables
```toml
# wrangler.toml
TTT_BASE = "https://iamromeoly-tttranscribe.hf.space"
MAX_RETRIES = "3"                    # Maximum retry attempts
REQUEST_TIMEOUT = "30000"            # Request timeout in milliseconds
LOG_LEVEL = "info"                   # Logging level
```

### Circuit Breaker Settings
- **Failure Threshold**: 5 consecutive failures
- **Recovery Timeout**: 60 seconds
- **Half-Open Max Calls**: 3 test requests
- **Exponential Backoff**: 2^attempt seconds

## Testing

### Health Monitoring Tests
```bash
# Run comprehensive health monitoring tests
npm run test:health

# Run all tests
npm run test:gateway
npm run test:health
```

### Test Coverage
- ✅ Basic health endpoint validation
- ✅ Service health monitoring
- ✅ Circuit breaker functionality
- ✅ Service recommendations
- ✅ Error handling with circuit breaker
- ✅ Performance metrics validation

## Service Recommendations

The system provides intelligent recommendations based on service health:

### TTT Service Issues
- **Unhealthy**: "TTTranscribe service is down - check service availability and configuration"
- **Degraded**: "TTTranscribe service is experiencing issues - monitor response times"
- **High Error Rate**: "High error rate detected - investigate service stability"
- **Slow Response**: "Slow response times detected - check network connectivity"

### Circuit Breaker Status
- **Open**: "Circuit breaker is open - service is temporarily unavailable"
- **Half-Open**: "Circuit breaker is testing service recovery"
- **Multiple Failures**: "Multiple failures detected - check service logs"

## Integration with PluctMobileApp

### Recommended Mobile App Changes

1. **Health Check Before TTT Calls**
   ```javascript
   // Check service health before making TTT requests
   const healthResponse = await fetch('/health/services');
   const health = await healthResponse.json();
   
   if (health.services.ttt.status === 'unhealthy') {
     // Show user-friendly message
     showMessage('Transcription service is temporarily unavailable');
     return;
   }
   ```

2. **Handle Circuit Breaker Responses**
   ```javascript
   try {
     const response = await fetch('/ttt/transcribe', {
       method: 'POST',
       headers: { 'Authorization': `Bearer ${token}` },
       body: JSON.stringify(payload)
     });
     
     if (response.status === 503) {
       // Service unavailable - show retry option
       showRetryOption();
     }
   } catch (error) {
     // Handle network errors
   }
   ```

3. **Implement Retry Logic**
   ```javascript
   async function transcribeWithRetry(payload, maxRetries = 3) {
     for (let attempt = 1; attempt <= maxRetries; attempt++) {
       try {
         const response = await fetch('/ttt/transcribe', {
           method: 'POST',
           headers: { 'Authorization': `Bearer ${token}` },
           body: JSON.stringify(payload)
         });
         
         if (response.ok) return await response.json();
         
         if (response.status === 503 && attempt < maxRetries) {
           // Wait before retry
           await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
           continue;
         }
         
         throw new Error(`HTTP ${response.status}`);
       } catch (error) {
         if (attempt === maxRetries) throw error;
       }
     }
   }
   ```

## Monitoring Dashboard

### Key Metrics to Monitor
- **TTT Service Status**: healthy/degraded/unhealthy
- **Response Time**: Average TTT service response time
- **Error Rate**: Percentage of failed requests
- **Circuit Breaker State**: closed/open/half-open
- **Consecutive Failures**: Number of recent failures

### Alerting Recommendations
- Alert when TTT service status is 'unhealthy' for > 5 minutes
- Alert when circuit breaker is open for > 10 minutes
- Alert when error rate exceeds 50%
- Alert when response time exceeds 10 seconds

## Troubleshooting

### Common Issues

1. **Circuit Breaker Stuck Open**
   - Check TTT service availability
   - Verify TTT_BASE URL configuration
   - Check TTT_SHARED_SECRET

2. **High Error Rates**
   - Monitor TTT service logs
   - Check network connectivity
   - Verify service configuration

3. **Slow Response Times**
   - Check TTT service performance
   - Monitor network latency
   - Consider service scaling

### Debug Commands
```bash
# Check overall health
npm run cli:status

# Check service health
npm run cli:health

# Test TTT connectivity
npm run cli:menu
# Then select "5. Service Monitoring" > "3. Test TTT connectivity"
```

## Benefits

### For PluctMobileApp
- **Reliable Service**: Automatic failure detection and recovery
- **Better UX**: Clear error messages and retry guidance
- **Reduced Downtime**: Circuit breaker prevents cascade failures
- **Performance Insights**: Monitor service health in real-time

### For Operations
- **Proactive Monitoring**: Early detection of service issues
- **Intelligent Recommendations**: Actionable insights for troubleshooting
- **Reduced Support Load**: Self-healing system with clear error messages
- **Performance Optimization**: Data-driven service improvements

## Future Enhancements

- **Metrics Dashboard**: Real-time service health visualization
- **Alerting Integration**: Slack/email notifications for service issues
- **Load Balancing**: Multiple TTT service endpoints
- **Caching Layer**: Response caching for improved performance
- **A/B Testing**: Gradual rollout of service changes
