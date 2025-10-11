# PowerShell script to verify deployment status
Write-Host "Verifying Deployment Status" -ForegroundColor Green
Write-Host "============================" -ForegroundColor Green

# Check git status
Write-Host "Git Status:" -ForegroundColor Yellow
git status

# Check if we're up to date
$status = git status --porcelain
if ($status) {
    Write-Host "WARNING: There are uncommitted changes" -ForegroundColor Red
    Write-Host $status -ForegroundColor Red
} else {
    Write-Host "SUCCESS: All changes committed" -ForegroundColor Green
}

# Check remote status
Write-Host ""
Write-Host "Remote Status:" -ForegroundColor Yellow
git log --oneline -3

Write-Host ""
Write-Host "GitHub Actions Status:" -ForegroundColor Cyan
Write-Host "Check: https://github.com/iamalbertly/pluct-business-engine/actions" -ForegroundColor Cyan

Write-Host ""
Write-Host "Production URL:" -ForegroundColor Cyan
Write-Host "https://pluct-business-engine.romeo-lya2.workers.dev" -ForegroundColor Cyan

Write-Host ""
Write-Host "Testing Production Endpoints:" -ForegroundColor Yellow
$prodUrl = "https://pluct-business-engine.romeo-lya2.workers.dev"

# Test basic connectivity
try {
    $response = Invoke-WebRequest -Uri $prodUrl -Method GET -UseBasicParsing -TimeoutSec 10
    Write-Host "SUCCESS: Production endpoint is responding" -ForegroundColor Green
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Production endpoint not responding" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "This might mean the deployment is still in progress..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Check GitHub Actions for deployment status" -ForegroundColor White
Write-Host "2. Wait for green checkmark in GitHub Actions" -ForegroundColor White
Write-Host "3. Run .\scripts\test-production.ps1 to test endpoints" -ForegroundColor White
