# PowerShell script to test production deployment
Write-Host "Testing Production Deployment" -ForegroundColor Green
Write-Host "===============================" -ForegroundColor Green

$prodUrl = "https://pluct-business-engine.romeo-lya2.workers.dev"
$webhookSecret = "prod-webhook-secret-bH9qL2rX5vT8yK3pG6mE1sZ4fN0aC7dR"
$adminSecret = "prod-admin-secret-kPq7rX8sYb2nLw5cFgHjEmV"

Write-Host "Production URL: $prodUrl" -ForegroundColor Cyan
Write-Host ""

# Test 1: Add credits
Write-Host "1. Testing /add-credits endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$prodUrl/add-credits" -Method POST -Headers @{
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
try {
    $response = Invoke-WebRequest -Uri "$prodUrl/vend-token" -Method POST -Headers @{
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
try {
    $response = Invoke-WebRequest -Uri "$prodUrl/admin/users" -Method GET -Headers @{
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
try {
    $response = Invoke-WebRequest -Uri "$prodUrl/admin/transactions" -Method GET -Headers @{
        "Authorization" = "Bearer $adminSecret"
    } -UseBasicParsing
    Write-Host "SUCCESS - Admin Transactions - Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "ERROR - Admin Transactions: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Production testing completed!" -ForegroundColor Green
