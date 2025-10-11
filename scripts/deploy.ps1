# PowerShell script to deploy Pluct Business Engine
Write-Host "Deploying Pluct Business Engine to Cloudflare" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green

# Check if we're in a git repository
if (-not (Test-Path ".git")) {
    Write-Host "ERROR: Not in a git repository. Please run this from the project root." -ForegroundColor Red
    exit 1
}

# Check current branch
$currentBranch = git branch --show-current
Write-Host "Current branch: $currentBranch" -ForegroundColor Yellow

# Check git status
Write-Host "Checking git status..." -ForegroundColor Yellow
git status

# Add all changes
Write-Host "Adding all changes..." -ForegroundColor Yellow
git add .

# Commit changes
Write-Host "Committing changes..." -ForegroundColor Yellow
git commit -m "feat: Complete D1 database integration and CI/CD pipeline

- Add Cloudflare D1 database for transaction logging
- Refactor to lean, professional-grade service
- Remove admin UI, implement secure API endpoints
- Add bearer token authentication for admin endpoints
- Update CI/CD pipeline with D1 migrations
- Add comprehensive test scripts for all endpoints
- Fix wrangler.jsonc configuration
- Ensure proper GitHub Actions workflow
- Organize scripts in /scripts directory"

# Push to trigger deployment
Write-Host "Pushing to GitHub to trigger deployment..." -ForegroundColor Yellow
git push origin $currentBranch

Write-Host "Push completed!" -ForegroundColor Green
Write-Host "Check GitHub Actions: https://github.com/iamalbertly/pluct-business-engine/actions" -ForegroundColor Cyan
Write-Host "Production URL: https://pluct-business-engine.romeo-lya2.workers.dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Go to GitHub Actions to monitor the deployment" -ForegroundColor White
Write-Host "2. Wait for the workflow to complete (green checkmark)" -ForegroundColor White
Write-Host "3. Test the production endpoints" -ForegroundColor White
