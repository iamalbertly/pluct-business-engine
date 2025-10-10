#!/bin/bash

echo "🧪 Testing Pluct Business Engine Endpoints"
echo "=========================================="

BASE_URL="http://localhost:8787"
WEBHOOK_SECRET="local-dev-webhook-secret-never-use-in-prod-67890"
ADMIN_SECRET="local-dev-admin-secret-never-use-in-prod-12345"

echo ""
echo "1️⃣ Testing /add-credits endpoint..."
echo "Adding 5 credits to test-user-1"
curl -X POST $BASE_URL/add-credits \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d '{"userId": "test-user-1", "amount": 5}' \
  -w "\nStatus: %{http_code}\n\n"

echo ""
echo "2️⃣ Testing /vend-token endpoint..."
echo "Exchanging 1 credit for a JWT token"
curl -X POST $BASE_URL/vend-token \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-1"}' \
  -w "\nStatus: %{http_code}\n\n"

echo ""
echo "3️⃣ Testing /admin/users endpoint..."
echo "Getting user analytics"
curl -X GET $BASE_URL/admin/users \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -w "\nStatus: %{http_code}\n\n"

echo ""
echo "4️⃣ Testing /admin/transactions endpoint..."
echo "Getting transaction history"
curl -X GET $BASE_URL/admin/transactions \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -w "\nStatus: %{http_code}\n\n"

echo ""
echo "5️⃣ Testing /admin/credits/add endpoint..."
echo "Manually adding credits via admin API"
curl -X POST $BASE_URL/admin/credits/add \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -d '{"userId": "test-user-2", "amount": 10, "reason": "Test admin credit addition"}' \
  -w "\nStatus: %{http_code}\n\n"

echo "✅ All tests completed!"
