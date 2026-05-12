import { AppError } from '@shared/errors/app.error';

/**
 * Thrown when the LLM circuit breaker is in OPEN state and calls are blocked.
 * Extends `AppError` so the global error middleware emits a 503 response
 * uniformly across degraded-dependency paths.
 */
export class CircuitOpenError extends AppError {
  constructor() {
    super({
      message: 'Circuit breaker is OPEN — LLM calls are temporarily blocked',
      statusCode: 503,
      code: 'CIRCUIT_BREAKER_OPEN',
    });
    this.name = 'CircuitOpenError';
  }
}
