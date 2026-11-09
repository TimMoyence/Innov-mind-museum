import { assertPgVectorAvailable } from '@data/db/pgvector-preflight';

interface VersionRow {
  version: string;
}

const makeVersionRows = (...versions: string[]): VersionRow[] =>
  versions.map((version) => ({ version }));

interface QueryStub {
  query: jest.Mock<Promise<unknown>, [string]>;
}

const makeRunner = (rows: VersionRow[]): QueryStub => ({
  query: jest.fn().mockResolvedValue(rows),
});

describe('assertPgVectorAvailable (I-OPS6 pgvector pre-flight guard)', () => {
  it('rejects when the only available pgvector version is < 0.7.0', async () => {
    const runner = makeRunner(makeVersionRows('0.6.0'));

    await expect(assertPgVectorAvailable(runner)).rejects.toThrow(/0\.7\.0/);
    await expect(assertPgVectorAvailable(runner)).rejects.toThrow(/halfvec/);
  });

  it('rejects when all available versions are below 0.7.0 (0.5.1, 0.6.2)', async () => {
    const runner = makeRunner(makeVersionRows('0.5.1', '0.6.2'));

    await expect(assertPgVectorAvailable(runner)).rejects.toThrow(/0\.7\.0/);
  });

  it('queries pg_available_extension_versions for the vector extension', async () => {
    const runner = makeRunner(makeVersionRows('0.6.0'));

    await expect(assertPgVectorAvailable(runner)).rejects.toThrow();

    expect(runner.query).toHaveBeenCalled();
    const sql = runner.query.mock.calls[0][0];
    expect(sql).toMatch(/pg_available_extension_versions/i);
    expect(sql).toMatch(/vector/i);
  });

  it('resolves when an available pgvector version is >= 0.7.0 (0.7.4)', async () => {
    const runner = makeRunner(makeVersionRows('0.7.4'));

    await expect(assertPgVectorAvailable(runner)).resolves.toBeUndefined();
  });

  it('resolves when a newer major version is available (0.8.0) alongside an old one', async () => {
    const runner = makeRunner(makeVersionRows('0.6.0', '0.8.0'));

    await expect(assertPgVectorAvailable(runner)).resolves.toBeUndefined();
  });

  it('rejects naming the vector extension when no versions are available (extension not packaged)', async () => {
    const runner = makeRunner(makeVersionRows());

    await expect(assertPgVectorAvailable(runner)).rejects.toThrow(/vector/i);
  });
});
