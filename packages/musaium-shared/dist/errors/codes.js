"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_CODES = void 0;
/**
 * Canonical error codes shared across BE response envelopes and FE/Web
 * error mapping. When adding a new code:
 *   1. Add the literal here.
 *   2. Surface the same code in the matching backend `AppError({code})`.
 *   3. Update the FE/Web mapper that branches on this union.
 */
exports.ERROR_CODES = {
    DAILY_LIMIT_REACHED: 'DAILY_LIMIT_REACHED',
    COMPARE_INVALID_IMAGE: 'COMPARE_INVALID_IMAGE',
    CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
    SEMAPHORE_QUEUE_FULL: 'SEMAPHORE_QUEUE_FULL',
    SEMAPHORE_TIMEOUT: 'SEMAPHORE_TIMEOUT',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    RATE_LIMITED: 'RATE_LIMITED',
};
