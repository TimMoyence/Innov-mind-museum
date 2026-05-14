import noInlineTestEntities from './rules/no-inline-test-entities';
import noTypeormSetUndefined from './rules/no-typeorm-set-undefined';
import noUndisabledTestDisciplineDisable from './rules/no-undisabled-test-discipline-disable';

const plugin = {
  rules: {
    'no-inline-test-entities': noInlineTestEntities,
    'no-typeorm-set-undefined': noTypeormSetUndefined,
    'no-undisabled-test-discipline-disable': noUndisabledTestDisciplineDisable,
  },
};

// eslint-plugin-* packages use module.exports for compatibility with both ESM and CJS consumers
// export = compiles to module.exports = plugin, which is the conventional plugin shape
export = plugin;
