# PowerShell test script for Pluct Business Engine
Write-Host "🧪 Testing Pluct Business Engine Endpoints" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

$baseUrl = "http://localhost:8787"
$webhookSecret = "local-dev-webhook-secret-never-use-in-prod-67890"
$adminSecret = "local-dev-admin-secret-never-use-in-prod-12345"

Write-Host ""
Write-Host "1️⃣ Testing /add-credits endpoint..." -ForegroundColor Yellow
Write-Host "Adding 5 credits to test-user-1"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/add-credits" -Method POST -Headers @{
        "Content-Type" = "application/json"
        "x-webhook-secret" = $webhookSecret
    } -Body '{"userId": "test-user-1", "amount": 5}' -UseBasicParsing
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "2️⃣ Testing /vend-token endpoint..." -ForegroundColor Yellow
Write-Host "Exchanging 1 credit for a JWT token"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/vend-token" -Method POST -Headers @{
        "Content-Type" = "application/json"
    } -Body '{"userId": "test-user-1"}' -UseBasicParsing
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "3️⃣ Testing /admin/users endpoint..." -ForegroundColor Yellow
Write-Host "Getting user analytics"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/admin/users" -Method GET -Headers @{
        "Authorization" = "Bearer $adminSecret"
    } -UseBasicParsing
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "4️⃣ Testing /admin/transactions endpoint..." -ForegroundColor Yellow
Write-Host "Getting transaction history"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/admin/transactions" -Method GET -Headers @{
        "Authorization" = "Bearer $adminSecret"
    } -UseBasicParsing
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "5️⃣ Testing /admin/credits/add endpoint..." -ForegroundColor Yellow
Write-Host "Manually adding credits via admin API"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/admin/credits/add" -Method POST -Headers @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $adminSecret"
    } -Body '{"userId": "test-user-2", "amount": 10, "reason": "Test admin credit addition"}' -UseBasicParsing
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ All tests completed!" -ForegroundColor Green
