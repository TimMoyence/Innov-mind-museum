/**
 * Canonical error codes shared across BE response envelopes and FE/Web
 * error mapping. When adding a new code:
 *   1. Add the literal here.
 *   2. Surface the same code in the matching backend `AppError({code})`.
 *   3. Update the FE/Web mapper that branches on this union.
 */
export declare const ERROR_CODES: {
    readonly DAILY_LIMIT_REACHED: "DAILY_LIMIT_REACHED";
    readonly COMPARE_INVALID_IMAGE: "COMPARE_INVALID_IMAGE";
    readonly CIRCUIT_BREAKER_OPEN: "CIRCUIT_BREAKER_OPEN";
    readonly SEMAPHORE_QUEUE_FULL: "SEMAPHORE_QUEUE_FULL";
    readonly SEMAPHORE_TIMEOUT: "SEMAPHORE_TIMEOUT";
    readonly UNAUTHORIZED: "UNAUTHORIZED";
    readonly FORBIDDEN: "FORBIDDEN";
    readonly RATE_LIMITED: "RATE_LIMITED";
};
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
