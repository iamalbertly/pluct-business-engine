# TTTranscribe Service Communication Contract
## Integration Specification for Pluct Business Engine

### Overview

The TTTranscribe service is the core transcription and AI processing engine that handles TikTok video analysis for the Pluct ecosystem. This document defines the exact communication protocol, authentication requirements, request/response formats, and operational expectations that TTTranscribe must implement to integrate with the Pluct Business Engine.

### Service Configuration

**TTTranscribe Base URL:** `https://iamromeoly-tttranscribe.hf.space`
**Authentication Method:** Shared Secret via `X-Engine-Auth` header
**Communication Protocol:** HTTPS REST API
**Request Timeout:** 10 minutes for `/transcribe`, 30 seconds for `/status/:id`
**Retry Policy:** Exponential backoff with 3 maximum retries

---

## Authentication and Security

### Required Authentication Header

All requests from the Pluct Business Engine will include:

```
X-Engine-Auth: <shared_secret>
```

**Shared Secret Value:** `hf_sUP3rL0nGrANd0mAp1K3yV4xYb2pL6nM8zJ9fQ1cD5eS7tT0rW3gU`

### Security Requirements

1. **Validate X-Engine-Auth Header:** Reject requests without valid shared secret
2. **HTTPS Only:** All communication must use TLS 1.2 or higher
3. **Request Validation:** Validate all incoming request formats
4. **Rate Limiting:** Implement appropriate rate limiting to prevent abuse
5. **CORS Headers:** Include proper CORS headers for web-based clients

---

## API Endpoints Specification

### 1. Transcription Job Creation

#### POST `/transcribe`

**Purpose:** Start a new transcription job for a TikTok video

**Request Headers:**
```
Content-Type: application/json
X-Engine-Auth: <shared_secret>
User-Agent: Pluct-Business-Engine/1.0.0
```

**Request Body:**
```json
{
  "url": "https://www.tiktok.com/@username/video/1234567890"
}
```

**Timeout:** 10 minutes (600,000ms)

**Expected Response (Success - 202 Accepted):**
```json
{
  "id": "ttt_job_abc123def456",
  "status": "queued",
  "submittedAt": "2024-10-15T03:30:00.000Z",
  "estimatedProcessingTime": 300,
  "url": "https://www.tiktok.com/@username/video/1234567890"
}
```

**Alternative Response Fields (TTTranscribe can use any of these):**
- `id` OR `jobId` OR `requestId` - Job identifier
- `status` OR `state` - Current job status
- `submittedAt` OR `createdAt` - Timestamp

**Error Responses:**

**400 Bad Request - Invalid URL:**
```json
{
  "error": "invalid_url",
  "message": "URL must be a valid TikTok video URL",
  "details": {
    "providedUrl": "invalid-url",
    "expectedFormat": "https://www.tiktok.com/@username/video/1234567890"
  }
}
```

**401 Unauthorized - Missing/Invalid Auth:**
```json
{
  "error": "unauthorized",
  "message": "Missing or invalid X-Engine-Auth header"
}
```

**422 Unprocessable Entity - Unsupported Content:**
```json
{
  "error": "unsupported_content",
  "message": "Video content cannot be processed",
  "details": {
    "reason": "video_too_long",
    "maxDuration": 300
  }
}
```

**429 Too Many Requests - Rate Limited:**
```json
{
  "error": "rate_limited",
  "message": "Too many requests",
  "details": {
    "retryAfter": 60
  }
}
```

**500 Internal Server Error:**
```json
{
  "error": "processing_failed",
  "message": "Failed to start transcription job",
  "details": {
    "reason": "internal_error"
  }
}
```

---

### 2. Job Status Checking

#### GET `/status/{jobId}`

**Purpose:** Check the status and retrieve results of a transcription job

**Request Headers:**
```
X-Engine-Auth: <shared_secret>
User-Agent: Pluct-Business-Engine/1.0.0
```

**URL Parameters:**
- `jobId`: The job identifier returned from `/transcribe`

**Timeout:** 30 seconds (default)

**Expected Response (Job Queued - 200 OK):**
```json
{
  "id": "ttt_job_abc123def456",
  "status": "queued",
  "progress": 0,
  "submittedAt": "2024-10-15T03:30:00.000Z",
  "estimatedCompletion": "2024-10-15T03:35:00.000Z"
}
```

**Expected Response (Job Processing - 200 OK):**
```json
{
  "id": "ttt_job_abc123def456",
  "status": "processing",
  "progress": 45,
  "submittedAt": "2024-10-15T03:30:00.000Z",
  "estimatedCompletion": "2024-10-15T03:35:00.000Z",
  "currentStep": "audio_extraction"
}
```

**Expected Response (Job Completed - 200 OK):**
```json
{
  "id": "ttt_job_abc123def456",
  "status": "completed",
  "progress": 100,
  "submittedAt": "2024-10-15T03:30:00.000Z",
  "completedAt": "2024-10-15T03:33:45.000Z",
  "result": {
    "transcription": "This is the full transcription text of the TikTok video...",
    "confidence": 0.95,
    "language": "en",
    "duration": 30.5,
    "wordCount": 45,
    "speakerCount": 1,
    "audioQuality": "high",
    "processingTime": 225
  },
  "metadata": {
    "title": "TikTok Video Title",
    "author": "username",
    "description": "Video description",
    "url": "https://www.tiktok.com/@username/video/1234567890"
  }
}
```

**Expected Response (Job Failed - 200 OK):**
```json
{
  "id": "ttt_job_abc123def456",
  "status": "failed",
  "progress": 0,
  "submittedAt": "2024-10-15T03:30:00.000Z",
  "failedAt": "2024-10-15T03:31:15.000Z",
  "error": {
    "code": "audio_extraction_failed",
    "message": "Unable to extract audio from video",
    "details": {
      "reason": "corrupted_video",
      "retryable": false
    }
  }
}
```

**Error Responses:**

**404 Not Found - Job Not Found:**
```json
{
  "error": "job_not_found",
  "message": "Transcription job not found",
  "details": {
    "jobId": "ttt_job_abc123def456"
  }
}
```

**401 Unauthorized - Missing/Invalid Auth:**
```json
{
  "error": "unauthorized",
  "message": "Missing or invalid X-Engine-Auth header"
}
```

---

## Response Format Standards

### Job Status Values

TTTranscribe must use these exact status values:

- `queued` - Job accepted and waiting to be processed
- `processing` - Job is currently being processed
- `completed` - Job completed successfully
- `failed` - Job failed with error
- `cancelled` - Job was cancelled (if supported)

### Progress Values

- **Range:** 0-100 (integer)
- **0:** Job not started
- **1-99:** Job in progress
- **100:** Job completed

### Result Object Structure

When `status` is `completed`, the `result` object must include:

**Required Fields:**
```json
{
  "transcription": "string",     // Full transcription text
  "confidence": 0.95,           // Confidence score (0.0-1.0)
  "language": "en",             // Detected language code
  "duration": 30.5              // Video duration in seconds
}
```

**Optional Fields:**
```json
{
  "wordCount": 45,              // Number of words transcribed
  "speakerCount": 1,            // Number of speakers detected
  "audioQuality": "high",       // Audio quality assessment
  "processingTime": 225,        // Processing time in seconds
  "segments": [                 // Detailed transcription segments
    {
      "start": 0.0,
      "end": 5.2,
      "text": "First segment text",
      "confidence": 0.98
    }
  ],
  "keywords": ["keyword1", "keyword2"],  // Extracted keywords
  "sentiment": "positive",               // Sentiment analysis
  "topics": ["topic1", "topic2"]        // Topic classification
}
```

---

## Error Handling Requirements

### Standard Error Response Format

All error responses must follow this structure:

```json
{
  "error": "error_code",
  "message": "Human readable error message",
  "details": {
    "additional": "context information"
  }
}
```

### Required Error Codes

| Error Code | HTTP Status | Description | Retryable |
|------------|-------------|-------------|-----------|
| `invalid_url` | 400 | Invalid TikTok URL format | No |
| `unauthorized` | 401 | Missing/invalid authentication | No |
| `unsupported_content` | 422 | Video cannot be processed | No |
| `rate_limited` | 429 | Too many requests | Yes |
| `job_not_found` | 404 | Job ID not found | No |
| `processing_failed` | 500 | Internal processing error | Yes |
| `service_unavailable` | 503 | Service temporarily unavailable | Yes |
| `timeout` | 504 | Processing timeout | Yes |

### Retry Logic

The Pluct Business Engine implements exponential backoff retry logic:

- **Max Retries:** 3 attempts
- **Backoff:** 2^attempt seconds (1s, 2s, 4s)
- **Retry Conditions:** 5xx errors, timeouts, network failures
- **No Retry:** 4xx errors (except 429), authentication failures

---

## Performance and Reliability Requirements

### Response Time Expectations

- **Job Creation:** < 2 seconds (with 10-minute timeout)
- **Status Check:** < 1 second (with 30-second timeout)
- **Job Processing:** Variable (depends on video length)
- **Maximum Processing Time:** 10 minutes per job

### Availability Requirements

- **Uptime Target:** 99.5%
- **Concurrent Jobs:** Support at least 100 concurrent jobs
- **Job Retention:** Keep job results for 24 hours minimum

### Circuit Breaker Integration

The Pluct Business Engine implements circuit breaker protection:

- **Failure Threshold:** 5 consecutive failures
- **Recovery Timeout:** 60 seconds
- **Half-Open Max Calls:** 3 test calls

When circuit breaker is open, TTTranscribe will receive no requests until recovery.

---

## Request Flow Examples

### Complete Transcription Flow

**Step 1: Job Creation (10-minute timeout)**
```http
POST /transcribe
Content-Type: application/json
X-Engine-Auth: hf_sUP3rL0nGrANd0mAp1K3yV4xYb2pL6nM8zJ9fQ1cD5eS7tT0rW3gU

{
  "url": "https://www.tiktok.com/@username/video/1234567890"
}
```

**Response:**
```json
{
  "id": "ttt_job_abc123def456",
  "status": "queued",
  "submittedAt": "2024-10-15T03:30:00.000Z"
}
```

**Step 2: Status Check (30-second timeout)**
```http
GET /status/ttt_job_abc123def456
X-Engine-Auth: hf_sUP3rL0nGrANd0mAp1K3yV4xYb2pL6nM8zJ9fQ1cD5eS7tT0rW3gU
```

**Response:**
```json
{
  "id": "ttt_job_abc123def456",
  "status": "processing",
  "progress": 25,
  "currentStep": "audio_extraction"
}
```

**Step 3: Status Check (After Processing)**
```http
GET /status/ttt_job_abc123def456
X-Engine-Auth: hf_sUP3rL0nGrANd0mAp1K3yV4xYb2pL6nM8zJ9fQ1cD5eS7tT0rW3gU
```

**Response:**
```json
{
  "id": "ttt_job_abc123def456",
  "status": "completed",
  "progress": 100,
  "result": {
    "transcription": "This is the full transcription of the TikTok video...",
    "confidence": 0.95,
    "language": "en",
    "duration": 30.5
  }
}
```

---

## Monitoring and Logging

### Required Logging

TTTranscribe should log:

1. **Request Logs:**
   - Incoming requests with job IDs
   - Authentication validation results
   - Request processing times

2. **Job Logs:**
   - Job creation and status changes
   - Processing milestones
   - Error conditions and failures

3. **Performance Logs:**
   - Response times
   - Resource utilization
   - Queue lengths

### Health Check Endpoint (Optional)

If TTTranscribe implements a health check endpoint:

**GET `/health`**

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "activeJobs": 15,
  "queueLength": 3
}
```

---

## Integration Testing Requirements

### Test Scenarios

TTTranscribe must handle these test scenarios:

1. **Valid TikTok URL Processing**
   - Short video (< 30 seconds)
   - Medium video (30-60 seconds)
   - Long video (60+ seconds)

2. **Error Handling**
   - Invalid URLs
   - Missing authentication
   - Corrupted video files
   - Network timeouts

3. **Concurrent Processing**
   - Multiple simultaneous jobs
   - Status check during processing
   - Job completion notifications

4. **Edge Cases**
   - Very short videos (< 5 seconds)
   - Videos with no speech
   - Videos with multiple languages
   - Videos with poor audio quality

5. **Timeout Handling**
   - 10-minute timeout for `/transcribe` endpoint
   - 30-second timeout for `/status/:id` endpoint
   - Proper timeout error responses

---

## Security Considerations

### Data Protection

1. **Video Content:** Process videos securely, don't store permanently
2. **Transcription Data:** Handle transcription results securely
3. **User Privacy:** Don't log sensitive user information
4. **Access Control:** Validate all requests with shared secret

### Rate Limiting

Implement rate limiting to prevent abuse:

- **Per IP:** Maximum 10 requests per minute
- **Per Job:** Maximum 1 status check per second per job
- **Global:** Maximum 1000 jobs per hour

---

## Deployment and Configuration

### Environment Variables

TTTranscribe should support these configuration options:

```bash
# Required
TTT_SHARED_SECRET=hf_sUP3rL0nGrANd0mAp1K3yV4xYb2pL6nM8zJ9fQ1cD5eS7tT0rW3gU
TTT_PORT=8000
TTT_HOST=0.0.0.0

# Optional
TTT_MAX_CONCURRENT_JOBS=100
TTT_JOB_TIMEOUT=600
TTT_LOG_LEVEL=info
TTT_RETENTION_HOURS=24
```

### Docker Configuration (If Applicable)

```dockerfile
# Example Dockerfile structure
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "app.py"]
```

---

## Support and Maintenance

### Monitoring Integration

TTTranscribe should provide:

1. **Metrics Endpoint:** `/metrics` for Prometheus-style metrics
2. **Health Checks:** `/health` for load balancer health checks
3. **Log Aggregation:** Structured logs for centralized logging

### Error Reporting

When errors occur, include:

1. **Error Code:** Standardized error codes
2. **Context:** Relevant request/response data
3. **Timestamps:** When errors occurred
4. **Severity:** Error severity levels

---

This communication contract ensures seamless integration between TTTranscribe and the Pluct Business Engine, providing a robust foundation for the PluctMobileApp's transcription and AI analysis features. The contract defines clear expectations for authentication, request/response formats, error handling, and performance requirements that TTTranscribe must implement to work effectively within the Pluct ecosystem.
