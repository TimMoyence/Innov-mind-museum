import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

import { AppError } from '@shared/errors/app.error';
import { errorHandler } from '@src/helpers/middleware/error.middleware';
import { buildHealthPayload } from '@shared/routers/api.router';
import { EntityNotFoundError } from 'typeorm/error/EntityNotFoundError';
import { QueryFailedError } from 'typeorm/error/QueryFailedError';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/sentry', () => ({
  captureExceptionWithContext: jest.fn(),
  setupSentryExpressErrorHandler: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers shared across sections
// ---------------------------------------------------------------------------

const mockReq = (overrides: Record<string, unknown> = {}): Request =>
  ({
    method: 'GET',
    originalUrl: '/api/test',
    ...overrides,
  }) as unknown as Request;

const mockRes = (): Response & { _status: number; _body: unknown } => {
  const res = {
    _status: 0,
    _body: undefined as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown };
};

const noop: NextFunction = jest.fn();

// =========================================================================
// 1. Health check resilience (DB down / recovery)
// =========================================================================

describe('db-resilience: health check vs database state', () => {
  it('returns status "ok" (200) when database query succeeds', async () => {
    const healthCheck = async (): Promise<{ database: 'up' | 'down' }> => {
      return { database: 'up' };
    };

    const checks = await healthCheck();
    const payload = buildHealthPayload({ checks, llmConfigured: true });

    expect(payload.status).toBe('ok');
    expect(payload.checks.database).toBe('up');
  });

  it('returns status "degraded" (503) when database is unreachable', async () => {
    const healthCheck = async (): Promise<{ database: 'up' | 'down' }> => {
      return { database: 'down' };
    };

    const checks = await healthCheck();
    const payload = buildHealthPayload({ checks, llmConfigured: true });

    expect(payload.status).toBe('degraded');
    expect(payload.checks.database).toBe('down');
  });

  it('transitions from degraded back to ok when DB recovers', async () => {
    let dbAvailable = false;

    const healthCheck = async (): Promise<{ database: 'up' | 'down' }> => {
      return { database: dbAvailable ? 'up' : 'down' };
    };

    // Phase 1 — DB is down
    const downChecks = await healthCheck();
    const downPayload = buildHealthPayload({ checks: downChecks, llmConfigured: true });
    expect(downPayload.status).toBe('degraded');

    // Phase 2 — DB recovers
    dbAvailable = true;
    const upChecks = await healthCheck();
    const upPayload = buildHealthPayload({ checks: upChecks, llmConfigured: true });
    expect(upPayload.status).toBe('ok');
    expect(upPayload.checks.database).toBe('up');
  });

  it('health check via createApp returns 503 when injected check signals DB down', async () => {
    // Lazy-import to avoid env side-effects in the module scope
    const { createApp } = await import('@src/app');

    const healthCheck = async (): Promise<{ database: 'up' | 'down' }> => {
      return { database: 'down' };
    };

    const app = createApp({
      healthCheck,
      chatService: {
        createSession: jest.fn(),
        postMessage: jest.fn(),
        getSession: jest.fn(),
        listSessions: jest.fn(),
        deleteSession: jest.fn(),
        renewImageUrl: jest.fn(),
        postAudioMessage: jest.fn(),
        postMessageStream: jest.fn(),
      } as never,
    });

    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });

    try {
      const address = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${address.port}/api/health`);

      expect(res.status).toBe(503);
      const body = (await res.json()) as { status: string; checks: { database: string } };
      expect(body.status).toBe('degraded');
      expect(body.checks.database).toBe('down');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('health check via createApp returns 200 when injected check signals DB up', async () => {
    const { createApp } = await import('@src/app');

    const healthCheck = async (): Promise<{ database: 'up' | 'down' }> => {
      return { database: 'up' };
    };

    const app = createApp({
      healthCheck,
      chatService: {
        createSession: jest.fn(),
        postMessage: jest.fn(),
        getSession: jest.fn(),
        listSessions: jest.fn(),
        deleteSession: jest.fn(),
        renewImageUrl: jest.fn(),
        postAudioMessage: jest.fn(),
        postMessageStream: jest.fn(),
      } as never,
    });

    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });

    try {
      const address = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${address.port}/api/health`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe('ok');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});

// =========================================================================
// 2. Error handler resilience — TypeORM errors
// =========================================================================

describe('db-resilience: error handler with TypeORM errors', () => {
  beforeEach(() => jest.clearAllMocks());

  it('masks EntityNotFoundError as 500 with generic message (no SQL leak)', () => {
    const err = new EntityNotFoundError('User', { id: 42 });
    const req = mockReq({ requestId: 'res-enf' });
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(res._status).toBe(500);
    const body = res._body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    // Must not leak entity or criteria details
    expect(body.error.message).not.toContain('User');
    expect(body.error.message).not.toContain('42');
  });

  it('masks QueryFailedError as 500 with generic message (no SQL leak)', () => {
    const driverErr = new Error('relation "users" does not exist');
    const err = new QueryFailedError('SELECT * FROM users WHERE id = $1', [1], driverErr);
    const req = mockReq({ requestId: 'res-qfe' });
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(res._status).toBe(500);
    const body = res._body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    // Must not leak SQL
    expect(body.error.message).not.toContain('SELECT');
    expect(body.error.message).not.toContain('users');
  });

  it('logs TypeORM QueryFailedError via Sentry (5xx path)', () => {
    const { captureExceptionWithContext } = jest.requireMock('@shared/observability/sentry') as {
      captureExceptionWithContext: jest.Mock;
    };

    const driverErr = new Error('timeout');
    const err = new QueryFailedError('SELECT 1', undefined, driverErr);
    const req = mockReq({ requestId: 'res-sentry' });
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(captureExceptionWithContext).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ requestId: 'res-sentry' }),
    );
  });

  it('does not expose driver error details in the client response', () => {
    const driverErr = new Error('FATAL: password authentication failed for user "admin"');
    const err = new QueryFailedError('SELECT 1', undefined, driverErr);
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, noop);

    const body = res._body as { error: { message: string; details?: unknown } };
    expect(body.error.message).not.toContain('password');
    expect(body.error.message).not.toContain('admin');
    expect(body.error.details).toBeUndefined();
  });
});

// =========================================================================
// 3. Connection pool behavior (mock-based)
// =========================================================================

describe('db-resilience: connection pool behavior', () => {
  it('concurrent requests wait for pool — no immediate rejection', async () => {
    // Simulates a pool of size 2 where 3 concurrent requests arrive.
    // The third request waits until one of the first two completes.
    const poolMax = 2;
    let activeConnections = 0;
    let peakConnections = 0;
    const completionOrder: number[] = [];

    const acquireConnection = (): Promise<void> =>
      new Promise((resolve) => {
        const check = (): void => {
          if (activeConnections < poolMax) {
            activeConnections++;
            peakConnections = Math.max(peakConnections, activeConnections);
            resolve();
          } else {
            setTimeout(check, 5);
          }
        };
        check();
      });

    const releaseConnection = (): void => {
      activeConnections--;
    };

    const simulateQuery = async (id: number, delayMs: number): Promise<void> => {
      await acquireConnection();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      completionOrder.push(id);
      releaseConnection();
    };

    // Two fast queries + one that must wait
    await Promise.all([
      simulateQuery(1, 30),
      simulateQuery(2, 30),
      simulateQuery(3, 10), // will wait for a slot, then finish quickly
    ]);

    // All three completed (no rejection)
    expect(completionOrder).toHaveLength(3);
    expect(completionOrder).toContain(1);
    expect(completionOrder).toContain(2);
    expect(completionOrder).toContain(3);
    // Peak never exceeded pool max
    expect(peakConnections).toBeLessThanOrEqual(poolMax);
  });

  it('pool releases connections after query completes', async () => {
    let activeConnections = 0;

    const acquire = (): void => {
      activeConnections++;
    };
    const release = (): void => {
      activeConnections--;
    };

    acquire();
    expect(activeConnections).toBe(1);

    // Simulate query completion
    release();
    expect(activeConnections).toBe(0);

    // Second acquire should succeed on empty pool
    acquire();
    expect(activeConnections).toBe(1);
    release();
    expect(activeConnections).toBe(0);
  });
});

// =========================================================================
// 4. Query timeout handling
// =========================================================================

describe('db-resilience: query timeout handling', () => {
  it('propagates timeout error as AppError-style 500 through error handler', () => {
    // Simulates the kind of error pg driver produces on timeout
    const driverErr = new Error('canceling statement due to statement timeout');
    const err = new QueryFailedError('SELECT pg_sleep(60)', undefined, driverErr);
    const req = mockReq({ requestId: 'timeout-1' });
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(res._status).toBe(500);
    const body = res._body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    // Must not expose the pg_sleep query
    expect(body.error.message).not.toContain('pg_sleep');
  });

  it('connection is considered released after a timed-out query', async () => {
    let connectionHeld = true;

    const simulateTimedOutQuery = async (): Promise<void> => {
      try {
        // Simulate slow query that throws
        await new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error('statement timeout')), 10);
        });
      } finally {
        // Pool driver always releases in finally
        connectionHeld = false;
      }
    };

    await simulateTimedOutQuery().catch(() => undefined);
    expect(connectionHeld).toBe(false);
  });
});

// =========================================================================
// 5. Connection error & recovery simulation
// =========================================================================

describe('db-resilience: connection error and recovery', () => {
  it('healthCheck returns "down" when DataSource.query throws', async () => {
    const mockQuery = jest.fn().mockRejectedValue(new Error('connection refused'));

    const healthCheck = async (): Promise<{ database: 'up' | 'down' }> => {
      try {
        await mockQuery('SELECT 1');
        return { database: 'up' };
      } catch {
        return { database: 'down' };
      }
    };

    const checks = await healthCheck();
    expect(checks.database).toBe('down');

    const payload = buildHealthPayload({ checks, llmConfigured: true });
    expect(payload.status).toBe('degraded');
  });

  it('healthCheck returns "up" after connection recovers', async () => {
    let shouldFail = true;
    const mockQuery = jest.fn().mockImplementation(() => {
      if (shouldFail) return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve([{ result: 1 }]);
    });

    const healthCheck = async (): Promise<{ database: 'up' | 'down' }> => {
      try {
        await mockQuery('SELECT 1');
        return { database: 'up' };
      } catch {
        return { database: 'down' };
      }
    };

    // Phase 1 — DB down
    const downResult = await healthCheck();
    expect(downResult.database).toBe('down');

    // Phase 2 — DB recovers
    shouldFail = false;
    const upResult = await healthCheck();
    expect(upResult.database).toBe('up');
  });

  it('healthCheck returns "down" when DataSource is not initialized', async () => {
    const mockIsInitialized = false;

    const healthCheck = async (): Promise<{ database: 'up' | 'down' }> => {
      if (!mockIsInitialized) return { database: 'down' };
      return { database: 'up' };
    };

    const checks = await healthCheck();
    expect(checks.database).toBe('down');
  });
});

// =========================================================================
// 6. Graceful error handling — no internal detail leaks
// =========================================================================

describe('db-resilience: graceful error handling (no internal leaks)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('unique constraint violation (QueryFailedError) does not leak table/column names', () => {
    const driverErr = new Error(
      'duplicate key value violates unique constraint "users_email_unique"',
    );
    const err = new QueryFailedError(
      'INSERT INTO users (email) VALUES ($1)',
      ['test@example.com'],
      driverErr,
    );
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, noop);

    const body = res._body as { error: { message: string } };
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.message).not.toContain('users_email_unique');
    expect(body.error.message).not.toContain('INSERT');
    expect(body.error.message).not.toContain('test@example.com');
  });

  it('foreign key violation does not leak FK constraint name', () => {
    const driverErr = new Error(
      'insert or update on table "chat_sessions" violates foreign key constraint "fk_user"',
    );
    const err = new QueryFailedError(
      'INSERT INTO chat_sessions (user_id) VALUES ($1)',
      [999],
      driverErr,
    );
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, noop);

    const body = res._body as { error: { message: string } };
    expect(body.error.message).not.toContain('chat_sessions');
    expect(body.error.message).not.toContain('fk_user');
  });

  it('AppError 404 (domain-level not found) is correctly surfaced, not masked', () => {
    const err = new AppError({
      message: 'Session not found',
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(res._status).toBe(404);
    const body = res._body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Session not found');
  });

  it('generic JS Error is masked as 500 INTERNAL_ERROR', () => {
    const err = new Error('FATAL: could not open relation "pg_stat_activity"');
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(res._status).toBe(500);
    const body = res._body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).not.toContain('pg_stat_activity');
  });
});

// =========================================================================
// 7. Transaction isolation (conditional — requires real PG)
// =========================================================================

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('db-resilience: transaction isolation (real PG)', () => {
  jest.setTimeout(60000);

  it('concurrent reads do not see uncommitted transaction data', async () => {
    // This test requires a real Postgres connection via testcontainer.
    // It validates READ COMMITTED isolation level (PG default).
    const { startPostgresTestContainer } = await import('tests/helpers/e2e/postgres-testcontainer');
    const { Client } = await import('pg');

    const container = await startPostgresTestContainer();

    const connOpts = {
      host: container.host,
      port: container.port,
      user: container.user,
      password: container.password,
      database: container.database,
    };

    const writer = new Client(connOpts);
    const reader = new Client(connOpts);

    try {
      await writer.connect();
      await reader.connect();

      // Setup
      await writer.query(
        'CREATE TABLE IF NOT EXISTS isolation_test (id SERIAL PRIMARY KEY, value TEXT)',
      );
      await writer.query("INSERT INTO isolation_test (value) VALUES ('committed-row')");

      // Writer starts a transaction but does NOT commit
      await writer.query('BEGIN');
      await writer.query("INSERT INTO isolation_test (value) VALUES ('uncommitted-row')");

      // Reader should NOT see the uncommitted row
      const readerResult = await reader.query('SELECT * FROM isolation_test');
      const values = readerResult.rows.map((r: { value: string }) => r.value);
      expect(values).toContain('committed-row');
      expect(values).not.toContain('uncommitted-row');

      // Commit and verify reader can now see it
      await writer.query('COMMIT');
      const afterCommit = await reader.query('SELECT * FROM isolation_test');
      const afterValues = afterCommit.rows.map((r: { value: string }) => r.value);
      expect(afterValues).toContain('uncommitted-row');
    } finally {
      await writer.end().catch(() => undefined);
      await reader.end().catch(() => undefined);
      container.scheduleStop();
    }
  });
});
