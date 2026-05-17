import { AppError } from '@shared/errors/app.error';

/** Extends `AppError` → 503 via global error middleware. */
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
