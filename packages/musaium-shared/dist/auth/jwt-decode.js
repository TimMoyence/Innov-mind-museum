"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseJwtPayloadSchema = exports.jwtHeaderSchema = void 0;
exports.decodeJwtPayloadWith = decodeJwtPayloadWith;
const zod_1 = require("zod");
/**
 * Cross-platform JWT-payload decoder. The host provides the base64url decoder
 * (`Buffer.from(s, 'base64url').toString('utf8')` in Node, `atob(s)` in the
 * browser/RN). On any failure — short token, JSON parse, schema mismatch —
 * the function returns `null`. NEVER use this for trust decisions; signature
 * verification must happen via `jsonwebtoken.verify(...)` elsewhere.
 */
function decodeJwtPayloadWith(token, schema, decode) {
    if (typeof token !== 'string')
        return null;
    const parts = token.split('.');
    if (parts.length !== 3)
        return null;
    try {
        const segment = parts[1];
        if (!segment)
            return null;
        const raw = JSON.parse(decode(segment));
        const result = schema.safeParse(raw);
        return result.success ? result.data : null;
    }
    catch {
        return null;
    }
}
/** Common schema for OIDC-style JWT headers (kid + alg). */
exports.jwtHeaderSchema = zod_1.z.object({
    kid: zod_1.z.string().optional(),
    alg: zod_1.z.string().optional(),
});
/** Common schema for Musaium-issued JWT payloads (id/sub + exp). */
exports.baseJwtPayloadSchema = zod_1.z.object({
    id: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional(),
    sub: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional(),
    exp: zod_1.z.number().optional(),
});
