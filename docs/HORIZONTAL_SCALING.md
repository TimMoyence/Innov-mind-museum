# Horizontal Scaling Guide — Musaium Backend

## Architecture Overview

- Stateless Express backend (no server-side sessions)
- JWT for authentication (no session store needed)
- PostgreSQL for persistent state
- Redis for caching + distributed locks

## Scaling Strategy

### Application Layer

- Deploy N replicas behind a load balancer
- No sticky sessions needed (stateless)
- Health check: `GET /api/health` (readiness + liveness probe)

### Database

- Connection pool: `DB_POOL_MAX` per instance
- Formula: `poolMax = (pg max_connections - reserved) / num_instances`
- Default: 10 per instance, 100 `max_connections` -> supports 10 instances

### Redis

- Shared Redis instance for cache + distributed locks
- Rate limiter: current in-memory implementation needs migration to Redis for multi-instance
- Token cleanup cron: already uses distributed lock via `setNx`

### Rate Limiting Caveat

- Current rate limiter uses in-memory `Map` (per-instance)
- For horizontal scaling: migrate to Redis-backed rate limiter using existing `ioredis`
- The `CacheService.setNx()` can be used for distributed rate limiting

## Docker Swarm Deployment

```yaml
services:
  backend:
    image: ghcr.io/org/museum-backend:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

## Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: museum-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: museum-backend
  template:
    metadata:
      labels:
        app: museum-backend
    spec:
      containers:
      - name: museum-backend
        image: ghcr.io/org/museum-backend:latest
        ports:
        - containerPort: 3000
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 15
          periodSeconds: 20
        resources:
          requests:
            cpu: 250m
            memory: 256Mi
          limits:
            cpu: "1"
            memory: 512Mi
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: museum-backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: museum-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## OpenTelemetry

- When `OTEL_ENABLED=true`, each instance exports traces with its hostname
- Distributed tracing across instances via trace context propagation (W3C headers)

## Load Testing

Install k6:

```bash
brew install k6
```

Run individual scenarios:

```bash
# Auth lifecycle (register -> login -> refresh -> me -> logout)
k6 run tests/perf/k6/auth-flow.k6.js

# Chat lifecycle (create session -> post messages -> list -> delete)
k6 run tests/perf/k6/chat-flow.k6.js

# Full concurrent ramp-up (0 -> 50 VUs, mixed operations)
k6 run tests/perf/k6/concurrent-users.k6.js
```

Target a specific environment:

```bash
k6 run -e BASE_URL=https://staging.musaium.com tests/perf/k6/concurrent-users.k6.js
```

## Scaling Checklist

Before deploying multiple instances:

1. Ensure Redis is accessible from all instances (`REDIS_URL` env var)
2. Set `DB_POOL_MAX` based on total instance count (see formula above)
3. Migrate rate limiter to Redis-backed implementation
4. Verify health endpoint responds correctly on each instance
5. Configure load balancer with health check on `/api/health`
6. Run `concurrent-users.k6.js` against the scaled deployment to validate
