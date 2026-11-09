export declare const SENSITIVE_HEADER_REGEX: RegExp;
export declare const SENSITIVE_FIELD_REGEX: RegExp;
export declare const SENSITIVE_QUERY_KEYS: ReadonlySet<string>;
export declare const SENSITIVE_BREADCRUMB_PATHS: readonly string[];
export declare const REDACTED = "[redacted]";
export declare const hashEmail: (email: string) => string | undefined;
export interface ScrubbableEvent {
    request?: {
        headers?: Record<string, unknown>;
        data?: unknown;
        url?: string;
        query_string?: unknown;
    };
    user?: {
        email?: string;
        id?: string;
        username?: string;
        [key: string]: unknown;
    };
    extra?: Record<string, unknown>;
    contexts?: Record<string, unknown>;
    tags?: Record<string, unknown>;
}
export interface ScrubbableBreadcrumb {
    category?: string;
    data?: {
        url?: string;
        [key: string]: unknown;
    };
}
export interface ScrubberDeps {
    hashEmail: (email: string) => string | undefined;
}
export declare const scrubHeaders: (headers: Record<string, unknown>) => Record<string, unknown>;
export declare const scrubRecord: (input: unknown) => unknown;
export declare const isUrlLikeValue: (value: unknown) => value is string;
export declare const scrubUrl: (url: string) => string;
export declare const scrubEvent: <T extends ScrubbableEvent>(event: T, deps: ScrubberDeps) => T;
export declare const shouldDropBreadcrumb: (breadcrumb: ScrubbableBreadcrumb) => boolean;
