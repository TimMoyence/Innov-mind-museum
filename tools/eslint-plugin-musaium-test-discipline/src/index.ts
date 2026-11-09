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

export = plugin;
