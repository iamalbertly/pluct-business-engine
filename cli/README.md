Pluct Business Engine - Local CLI

Commands (reads .dev.vars at repo root; override with BASE_URL):

- status: Health check against the deployed worker
- seed-credits <userId> <amount>: Add credits using X-API-Key
- vend-token <userId>: Vend a JWT (spends 1 credit)
- validate <jwt>: Attempts an authenticated status call to validate JWT

Usage examples:

```bash
npm run cli:status
npm run cli:seed -- some-user 10
npm run cli:vend -- some-user
```

Logs are written to logs/cli.log with timestamps.


