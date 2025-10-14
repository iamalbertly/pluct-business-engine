Pluct Business Engine - Local CLI

Commands (reads .dev.vars at repo root; override with BASE_URL):

- status: Health check against the deployed worker
- seed-credits <userId> <amount>: Add credits using X-API-Key
- vend-token <userId>: Vend a JWT (spends 1 credit)
- validate <jwt>: Attempts an authenticated status call to validate JWT
- add-user <userId> <initialCredits>: Create a user with starting credits
- balance <userId> (alias: tokens): Show user balance
- admin:list-users: List users (requires ADMIN_SECRET as Bearer)
- admin:list-transactions: List transactions (requires ADMIN_SECRET)
- admin:api-keys <list|create [name]|revoke <id>>

Usage examples:

```bash
npm run cli:status
npm run cli:seed -- some-user 10
npm run cli:vend -- some-user
```

Logs are written to logs/cli.log with timestamps.

Verbose output:
- Every command prints a JSON object with `request` and `response` containing the exact headers, body, and raw text returned by the API.

Interactive menu:
- Launch with no args or `npm run cli` or `npm run cli -- menu`
- Auto-detects superuser auth from `.dev.vars` using: `ENGINE_ADMIN_KEY`, `ADMIN_SECRET|ADMIN_TOKEN`, `WEBHOOK_SECRET`
- Menu levels:
  - Users: create, balance, add credits
  - Tokens: vend, validate
  - Admin: list users, list transactions
  - API Keys: list, create, revoke


