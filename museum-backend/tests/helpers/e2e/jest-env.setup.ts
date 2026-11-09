process.env.EXTRACTION_WORKER_ENABLED = process.env.EXTRACTION_WORKER_ENABLED ?? 'false';

process.env.CACHE_ENABLED = process.env.CACHE_ENABLED ?? 'false';

process.env.GUARDRAIL_BUDGET_BACKEND = process.env.GUARDRAIL_BUDGET_BACKEND ?? 'memory';

process.env.PASSWORD_BREACH_CHECK_ENABLED = process.env.PASSWORD_BREACH_CHECK_ENABLED ?? 'false';

process.env.AUTH_EMAIL_SERVICE_KIND = process.env.AUTH_EMAIL_SERVICE_KIND ?? 'test';

process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:8081';

process.env.PGDATABASE = process.env.PGDATABASE ?? 'museum_e2e_placeholder';
