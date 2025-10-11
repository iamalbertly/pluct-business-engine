#!/bin/bash

echo "🚀 Deploying Pluct Business Engine to Cloudflare"
echo "================================================="

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Not in a git repository. Please run this from the project root."
    exit 1
fi

# Check current branch
currentBranch=$(git branch --show-current)
echo "📍 Current branch: $currentBranch"

# Check git status
echo "📋 Checking git status..."
git status

# Add all changes
echo "📦 Adding all changes..."
git add .

# Commit changes
echo "💾 Committing changes..."
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
echo "🚀 Pushing to GitHub to trigger deployment..."
git push origin $currentBranch

echo "✅ Push completed!"
echo "🔗 Check GitHub Actions: https://github.com/iamalbertly/pluct-business-engine/actions"
echo "🌐 Production URL: https://pluct-business-engine.romeo-lya2.workers.dev"
echo ""
echo "📝 Next steps:"
echo "1. Go to GitHub Actions to monitor the deployment"
echo "2. Wait for the workflow to complete (green checkmark)"
echo "3. Test the production endpoints"
