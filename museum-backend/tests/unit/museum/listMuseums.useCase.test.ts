import { ListMuseumsUseCase } from '@modules/museum/useCase/listMuseums.useCase';
import { InMemoryMuseumRepository } from 'tests/helpers/museum/inMemoryMuseumRepository';

describe('ListMuseumsUseCase', () => {
  let useCase: ListMuseumsUseCase;
  let repo: InMemoryMuseumRepository;

  beforeEach(() => {
    repo = new InMemoryMuseumRepository();
    useCase = new ListMuseumsUseCase(repo);
  });

  it('returns all museums', async () => {
    await repo.create({ name: 'Louvre', slug: 'louvre' });
    await repo.create({ name: 'Orsay', slug: 'orsay' });

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.name)).toEqual(['Louvre', 'Orsay']);
  });

  it('returns only active museums when activeOnly is true', async () => {
    await repo.create({ name: 'Active Museum', slug: 'active' });
    const inactive = await repo.create({ name: 'Inactive Museum', slug: 'inactive' });
    await repo.update(inactive.id, { isActive: false });

    const result = await useCase.execute({ activeOnly: true });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Active Museum');
  });

  it('returns all museums including inactive when activeOnly is false', async () => {
    await repo.create({ name: 'Active', slug: 'active' });
    const inactive = await repo.create({ name: 'Inactive', slug: 'inactive' });
    await repo.update(inactive.id, { isActive: false });

    const result = await useCase.execute({ activeOnly: false });

    expect(result).toHaveLength(2);
  });

  it('returns empty array when no museums exist', async () => {
    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  it('returns all museums when no opts provided', async () => {
    await repo.create({ name: 'Solo', slug: 'solo' });

    const result = await useCase.execute();

    expect(result).toHaveLength(1);
  });
});
