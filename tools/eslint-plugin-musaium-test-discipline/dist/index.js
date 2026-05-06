"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const no_inline_test_entities_1 = __importDefault(require("./rules/no-inline-test-entities"));
const no_undisabled_test_discipline_disable_1 = __importDefault(require("./rules/no-undisabled-test-discipline-disable"));
const plugin = {
    rules: {
        'no-inline-test-entities': no_inline_test_entities_1.default,
        'no-undisabled-test-discipline-disable': no_undisabled_test_discipline_disable_1.default,
    },
};
module.exports = plugin;
