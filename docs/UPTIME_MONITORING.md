# Uptime Monitoring

## Provider

**Better Stack Uptime** (formerly BetterUptime) — https://betteruptime.com

## Monitors

### Production API
- **URL**: `https://<prod-domain>/api/health`
- **Method**: GET
- **Expected status**: 200
- **Check interval**: 60 seconds
- **Timeout**: 10 seconds
- **Keyword check**: `"status":"ok"` in response body

### Staging API
- **URL**: `https://<staging-domain>/api/health`
- **Method**: GET
- **Expected status**: 200
- **Check interval**: 300 seconds
- **Timeout**: 10 seconds
- **Alerting**: email only (relaxed)

## Health Endpoint Response

```json
{
  "status": "ok" | "degraded",
  "checks": {
    "database": "up" | "down",
    "llmConfigured": true | false
  },
  "environment": "production",
  "version": "1.0.0",
  "timestamp": "2026-03-21T12:00:00.000Z",
  "commitSha": "abc123",
  "responseTimeMs": 42
}
```

Returns HTTP 200 when healthy, HTTP 503 when degraded (database unreachable).

## Alert Policy

- **Confirmed after**: 2 consecutive failures (2 minutes)
- **Channels**: Email (required), Slack (optional)
- **Escalation**: If not acknowledged within 15 minutes, re-alert

## Adding New Monitors

1. Log in to Better Stack Uptime dashboard
2. Click "Create monitor" → HTTP(S)
3. Enter endpoint URL and expected status code
4. Assign to the "Musaium" team
5. Set check interval and alert policy

## Heartbeat Monitors

Used for scheduled tasks (e.g., database backups):
1. Create a "Heartbeat" monitor in Better Stack
2. Set expected period (e.g., every 25 hours for daily tasks)
3. Add the heartbeat URL to the task's environment as `BACKUP_HEARTBEAT_URL`
4. The task pings the URL on successful completion
