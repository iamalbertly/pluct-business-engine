# PowerShell script to check deployment status
Write-Host "Checking Deployment Status" -ForegroundColor Green
Write-Host "=========================" -ForegroundColor Green

# Check if we're in a git repository
if (-not (Test-Path ".git")) {
    Write-Host "ERROR: Not in a git repository" -ForegroundColor Red
    exit 1
}

# Check current branch
$currentBranch = git branch --show-current
Write-Host "Current branch: $currentBranch" -ForegroundColor Yellow

# Check git status
Write-Host "Git status:" -ForegroundColor Yellow
git status

# Check if there are uncommitted changes
$uncommitted = git status --porcelain
if ($uncommitted) {
    Write-Host "WARNING: There are uncommitted changes:" -ForegroundColor Red
    Write-Host $uncommitted -ForegroundColor Red
    Write-Host ""
    Write-Host "Please commit and push changes first:" -ForegroundColor Yellow
    Write-Host "git add ." -ForegroundColor White
    Write-Host "git commit -m 'Your commit message'" -ForegroundColor White
    Write-Host "git push origin $currentBranch" -ForegroundColor White
} else {
    Write-Host "No uncommitted changes" -ForegroundColor Green
}

# Check remote URL
Write-Host ""
Write-Host "Remote URL:" -ForegroundColor Yellow
git remote get-url origin

# Check recent commits
Write-Host ""
Write-Host "Recent commits:" -ForegroundColor Yellow
git log --oneline -5

Write-Host ""
Write-Host "GitHub Actions URL:" -ForegroundColor Cyan
Write-Host "https://github.com/iamalbertly/pluct-business-engine/actions" -ForegroundColor Cyan

Write-Host ""
Write-Host "Production URL:" -ForegroundColor Cyan
Write-Host "https://pluct-business-engine.romeo-lya2.workers.dev" -ForegroundColor Cyan
