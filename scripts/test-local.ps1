# PowerShell test script for local development
Write-Host "Testing Pluct Business Engine Local Endpoints" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

$baseUrl = "http://localhost:8787"
$webhookSecret = "local-dev-webhook-secret-never-use-in-prod-67890"
$adminSecret = "local-dev-admin-secret-never-use-in-prod-12345"

Write-Host ""
Write-Host "Base URL: $baseUrl" -ForegroundColor Cyan
Write-Host ""

# Test 1: Add credits
Write-Host "1. Testing /add-credits endpoint..." -ForegroundColor Yellow
Write-Host "Adding 5 credits to test-user-1"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/add-credits" -Method POST -Headers @{
        "Content-Type" = "application/json"
        "x-webhook-secret" = $webhookSecret
    } -Body '{"userId": "test-user-1", "amount": 5}' -UseBasicParsing
    Write-Host "SUCCESS - Add Credits - Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "ERROR - Add Credits: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: Vend token
Write-Host "2. Testing /vend-token endpoint..." -ForegroundColor Yellow
Write-Host "Exchanging 1 credit for a JWT token"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/vend-token" -Method POST -Headers @{
        "Content-Type" = "application/json"
    } -Body '{"userId": "test-user-1"}' -UseBasicParsing
    Write-Host "SUCCESS - Vend Token - Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "ERROR - Vend Token: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Admin users
Write-Host "3. Testing /admin/users endpoint..." -ForegroundColor Yellow
Write-Host "Getting user analytics"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/admin/users" -Method GET -Headers @{
        "Authorization" = "Bearer $adminSecret"
    } -UseBasicParsing
    Write-Host "SUCCESS - Admin Users - Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "ERROR - Admin Users: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: Admin transactions
Write-Host "4. Testing /admin/transactions endpoint..." -ForegroundColor Yellow
Write-Host "Getting transaction history"
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/admin/transactions" -Method GET -Headers @{
        "Authorization" = "Bearer $adminSecret"
    } -UseBasicParsing
    Write-Host "SUCCESS - Admin Transactions - Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "ERROR - Admin Transactions: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Local testing completed!" -ForegroundColor Green
