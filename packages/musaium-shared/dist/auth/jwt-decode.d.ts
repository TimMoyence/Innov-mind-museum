import { z, type ZodType } from 'zod';
/** Decode buffer adapter — Node vs browser. Provided by the host to keep this package isomorphic. */
export type Base64UrlDecoder = (segment: string) => string;
/**
 * Cross-platform JWT-payload decoder. The host provides the base64url decoder
 * (`Buffer.from(s, 'base64url').toString('utf8')` in Node, `atob(s)` in the
 * browser/RN). On any failure — short token, JSON parse, schema mismatch —
 * the function returns `null`. NEVER use this for trust decisions; signature
 * verification must happen via `jsonwebtoken.verify(...)` elsewhere.
 */
export declare function decodeJwtPayloadWith<T>(token: string | undefined | null, schema: ZodType<T>, decode: Base64UrlDecoder): T | null;
/** Common schema for OIDC-style JWT headers (kid + alg). */
export declare const jwtHeaderSchema: z.ZodObject<{
    kid: z.ZodOptional<z.ZodString>;
    alg: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** Common schema for Musaium-issued JWT payloads (id/sub + exp). */
export declare const baseJwtPayloadSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    sub: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    exp: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
