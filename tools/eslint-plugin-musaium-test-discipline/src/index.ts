import noInlineTestEntities from './rules/no-inline-test-entities';
import noUndisabledTestDisciplineDisable from './rules/no-undisabled-test-discipline-disable';

const plugin = {
  rules: {
    'no-inline-test-entities': noInlineTestEntities,
    'no-undisabled-test-discipline-disable': noUndisabledTestDisciplineDisable,
  },
};

// eslint-plugin-* packages use module.exports for compatibility with both ESM and CJS consumers
// export = compiles to module.exports = plugin, which is the conventional plugin shape
export = plugin;
