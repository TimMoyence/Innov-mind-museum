import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const IOS = resolve(__dirname, '../../../../museum-frontend/ios');
const CODEGEN_SUFFIX = 'build/generated/ios/ReactCodegen';

const podsExpect = (): string[] => {
  const dir = join(IOS, 'Pods/Target Support Files/ReactCodegen');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.xcconfig'))
    .flatMap(
      (file) => readFileSync(join(dir, file), 'utf8').match(/\$\{PODS_ROOT\}\/\.\.\/[\w/]+/g) ?? [],
    )
    .filter((path) => path.endsWith(CODEGEN_SUFFIX));
};

describe('IOS-CODEGEN-OUTPUT', () => {
  it('IOS-CODEGEN-OUTPUT · le codegen de ci_post_clone écrit là où le pod ReactCodegen lit', () => {
    const script = readFileSync(join(IOS, 'ci_scripts/ci_post_clone.sh'), 'utf8');
    const outputPath = /--outputPath "([^"]+)"/.exec(script)?.[1];

    expect(podsExpect()).toContain(`\${PODS_ROOT}/../${CODEGEN_SUFFIX}`);
    expect(`${outputPath}/${CODEGEN_SUFFIX}`).toBe(
      `$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/${CODEGEN_SUFFIX}`,
    );
  });
});
