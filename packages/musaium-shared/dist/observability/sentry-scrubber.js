"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldDropBreadcrumb = exports.scrubEvent = exports.scrubUrl = exports.isUrlLikeValue = exports.scrubRecord = exports.scrubHeaders = exports.hashEmail = exports.REDACTED = exports.SENSITIVE_BREADCRUMB_PATHS = exports.SENSITIVE_QUERY_KEYS = exports.SENSITIVE_FIELD_REGEX = exports.SENSITIVE_HEADER_REGEX = void 0;
exports.SENSITIVE_HEADER_REGEX = /^(authorization|cookie|x-api-key|x-auth-token)$/i;
exports.SENSITIVE_FIELD_REGEX = /password|token|secret|api[_-]?key|refresh/i;
exports.SENSITIVE_QUERY_KEYS = new Set([
    'access_token',
    'api_key',
    'apikey',
    'code',
    'email',
    'password',
    'phone',
    'refresh_token',
    'secret',
    'sig',
    'signature',
    'state',
    'token',
    'x-amz-credential',
    'x-amz-security-token',
    'x-amz-signature',
]);
exports.SENSITIVE_BREADCRUMB_PATHS = [
    '/auth/login',
    '/auth/register',
    '/auth/reset-password',
    '/auth/change-password',
];
exports.REDACTED = '[redacted]';
const hashEmail = (email) => {
    if (!email)
        return undefined;
    let hash = 0xdeadbeef;
    for (let i = 0; i < email.length; i += 1) {
        hash = Math.imul(hash ^ email.charCodeAt(i), 2654435761);
    }
    return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8);
};
exports.hashEmail = hashEmail;
const scrubHeaders = (headers) => {
    const out = { ...headers };
    for (const key of Object.keys(out)) {
        if (exports.SENSITIVE_HEADER_REGEX.test(key)) {
            out[key] = exports.REDACTED;
        }
    }
    return out;
};
exports.scrubHeaders = scrubHeaders;
const scrubRecord = (input) => {
    if (Array.isArray(input)) {
        return input.map((item) => (0, exports.scrubRecord)(item));
    }
    if (input !== null && typeof input === 'object') {
        const src = input;
        const out = {};
        for (const [key, value] of Object.entries(src)) {
            if (exports.SENSITIVE_FIELD_REGEX.test(key)) {
                out[key] = exports.REDACTED;
            }
            else if ((0, exports.isUrlLikeValue)(value)) {
                out[key] = (0, exports.scrubUrl)(value);
            }
            else {
                out[key] = (0, exports.scrubRecord)(value);
            }
        }
        return out;
    }
    return input;
};
exports.scrubRecord = scrubRecord;
const isUrlLikeValue = (value) => typeof value === 'string' &&
    (value.includes('?') ||
        value.startsWith('/') ||
        value.startsWith('http://') ||
        value.startsWith('https://'));
exports.isUrlLikeValue = isUrlLikeValue;
const scrubUrl = (url) => {
    const qIndex = url.indexOf('?');
    if (qIndex === -1)
        return url;
    const base = url.slice(0, qIndex);
    const qs = url.slice(qIndex + 1);
    const parts = qs.split('&').map((pair) => {
        const eq = pair.indexOf('=');
        if (eq === -1)
            return pair;
        const key = pair.slice(0, eq);
        if (exports.SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
            return `${key}=${exports.REDACTED}`;
        }
        return pair;
    });
    return `${base}?${parts.join('&')}`;
};
exports.scrubUrl = scrubUrl;
const scrubRequest = (request) => {
    const out = { ...request };
    if (out.headers && typeof out.headers === 'object') {
        out.headers = (0, exports.scrubHeaders)(out.headers);
    }
    if (out.data && typeof out.data === 'object') {
        out.data = (0, exports.scrubRecord)(out.data);
    }
    if (typeof out.url === 'string') {
        out.url = (0, exports.scrubUrl)(out.url);
    }
    if (typeof out.query_string === 'string') {
        const rawQuery = out.query_string.replace(/^\?/, '');
        out.query_string = (0, exports.scrubUrl)(`?${rawQuery}`).slice(1);
    }
    return out;
};
const scrubUser = (user, deps) => {
    const out = { ...user };
    const fingerprint = deps.hashEmail(out.email ?? '');
    delete out.email;
    if (fingerprint) {
        out.id = out.id ?? fingerprint;
        out.email_hash = fingerprint;
    }
    return out;
};
const scrubEvent = (event, deps) => {
    const next = { ...event };
    if (next.request) {
        next.request = scrubRequest(next.request);
    }
    if (next.user?.email) {
        next.user = scrubUser(next.user, deps);
    }
    if (next.extra && typeof next.extra === 'object') {
        next.extra = (0, exports.scrubRecord)(next.extra);
    }
    if (next.tags && typeof next.tags === 'object') {
        const scrubbedTags = (0, exports.scrubRecord)(next.tags);
        for (const [key, value] of Object.entries(scrubbedTags)) {
            if (exports.SENSITIVE_HEADER_REGEX.test(key)) {
                scrubbedTags[key] = exports.REDACTED;
                continue;
            }
            if ((0, exports.isUrlLikeValue)(value)) {
                scrubbedTags[key] = (0, exports.scrubUrl)(value);
            }
        }
        next.tags = scrubbedTags;
    }
    return next;
};
exports.scrubEvent = scrubEvent;
const shouldDropBreadcrumb = (breadcrumb) => {
    if (breadcrumb.category !== 'http')
        return false;
    const url = breadcrumb.data?.url;
    if (typeof url !== 'string')
        return false;
    return exports.SENSITIVE_BREADCRUMB_PATHS.some((path) => url.includes(path));
};
exports.shouldDropBreadcrumb = shouldDropBreadcrumb;
