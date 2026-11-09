import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('RAZ-M12e', () => {
  it('RAZ-M12e · le contrat OpenAPI et les types générés ne portent plus /api/chat/describe ni ses schémas', () => {
    const openapi = JSON.parse(
      readFileSync(resolve(__dirname, '../../../openapi/openapi.json'), 'utf8'),
    ) as { paths: Record<string, unknown>; components: { schemas: Record<string, unknown> } };
    const generated = [
      readFileSync(
        resolve(__dirname, '../../../../museum-frontend/shared/api/generated/openapi.ts'),
        'utf8',
      ),
      readFileSync(
        resolve(__dirname, '../../../../museum-web/src/lib/api/generated/openapi.ts'),
        'utf8',
      ),
    ];

    expect(Object.keys(openapi.paths)).not.toContain('/api/chat/describe');
    expect(Object.keys(openapi.components.schemas)).not.toContain('DescribeRequest');
    expect(Object.keys(openapi.components.schemas)).not.toContain('DescribeResponse');
    expect(generated.filter((types) => types.includes('/api/chat/describe'))).toEqual([]);
  });
});
