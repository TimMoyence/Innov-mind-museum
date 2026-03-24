import { GetMuseumUseCase } from '@modules/museum/core/useCase/getMuseum.useCase';
import { InMemoryMuseumRepository } from 'tests/helpers/museum/inMemoryMuseumRepository';

describe('GetMuseumUseCase', () => {
  let useCase: GetMuseumUseCase;
  let repo: InMemoryMuseumRepository;

  beforeEach(async () => {
    repo = new InMemoryMuseumRepository();
    useCase = new GetMuseumUseCase(repo);

    // Seed a museum (id=1)
    await repo.create({ name: 'Louvre', slug: 'louvre', address: 'Paris' });
  });

  it('gets museum by numeric id', async () => {
    const result = await useCase.execute('1');

    expect(result.id).toBe(1);
    expect(result.name).toBe('Louvre');
  });

  it('gets museum by slug', async () => {
    const result = await useCase.execute('louvre');

    expect(result.slug).toBe('louvre');
    expect(result.name).toBe('Louvre');
  });

  it('throws 404 when id not found', async () => {
    await expect(useCase.execute('999')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 404 when slug not found', async () => {
    await expect(useCase.execute('unknown-museum')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('distinguishes numeric id from slug', async () => {
    // Create a museum with a numeric-looking slug would be invalid,
    // but we can verify the logic: "123" is treated as id, "abc" as slug
    await repo.create({ name: 'Museum ABC', slug: 'abc' });

    const bySlug = await useCase.execute('abc');
    expect(bySlug.name).toBe('Museum ABC');

    const byId = await useCase.execute('1');
    expect(byId.name).toBe('Louvre');
  });
});
