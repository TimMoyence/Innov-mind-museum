"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_PATTERN = exports.EMAIL_MAX_LENGTH = void 0;
exports.isEmail = isEmail;
exports.EMAIL_MAX_LENGTH = 254;
exports.EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
function isEmail(value) {
    return value.length <= exports.EMAIL_MAX_LENGTH && exports.EMAIL_PATTERN.test(value);
}
