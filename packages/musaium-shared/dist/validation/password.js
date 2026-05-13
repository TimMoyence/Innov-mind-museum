"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.passwordSchema = exports.PASSWORD_MAX = exports.PASSWORD_MIN = void 0;
const zod_1 = require("zod");
/** Minimum password length enforced by the backend AND surfaced in client UX. */
exports.PASSWORD_MIN = 8;
/** Maximum password length — protects bcrypt against DoS via huge input. */
exports.PASSWORD_MAX = 128;
/** Canonical Zod schema for password fields shared across BE + Web admin + Mobile. */
exports.passwordSchema = zod_1.z
    .string()
    .min(exports.PASSWORD_MIN, `Password must be at least ${String(exports.PASSWORD_MIN)} characters`)
    .max(exports.PASSWORD_MAX, `Password must be at most ${String(exports.PASSWORD_MAX)} characters`);
