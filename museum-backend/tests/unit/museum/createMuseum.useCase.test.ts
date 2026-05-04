import { CreateMuseumUseCase } from '@modules/museum/useCase/crud/createMuseum.useCase';
import { InMemoryMuseumRepository } from 'tests/helpers/museum/inMemoryMuseumRepository';

describe('CreateMuseumUseCase', () => {
  let useCase: CreateMuseumUseCase;
  let repo: InMemoryMuseumRepository;

  beforeEach(() => {
    repo = new InMemoryMuseumRepository();
    useCase = new CreateMuseumUseCase(repo);
  });

  it('creates a museum with all fields', async () => {
    const result = await useCase.execute({
      name: 'Louvre Museum',
      slug: 'louvre',
      address: '75001 Paris, France',
      description: 'World-famous art museum',
      latitude: 48.8606,
      longitude: 2.3376,
      config: { theme: 'classic' },
    });

    expect(result.id).toBe(1);
    expect(result.name).toBe('Louvre Museum');
    expect(result.slug).toBe('louvre');
    expect(result.address).toBe('75001 Paris, France');
    expect(result.description).toBe('World-famous art museum');
    expect(result.latitude).toBe(48.8606);
    expect(result.longitude).toBe(2.3376);
    expect(result.config).toEqual({ theme: 'classic' });
    expect(result.isActive).toBe(true);
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('creates a museum with minimal fields', async () => {
    const result = await useCase.execute({
      name: 'Petit Palais',
      slug: 'petit-palais',
    });

    expect(result.name).toBe('Petit Palais');
    expect(result.slug).toBe('petit-palais');
    expect(result.address).toBeNull();
    expect(result.description).toBeNull();
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.config).toEqual({});
  });

  it('rejects empty name', async () => {
    await expect(useCase.execute({ name: '', slug: 'test' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects whitespace-only name', async () => {
    await expect(useCase.execute({ name: '   ', slug: 'test' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects empty slug', async () => {
    await expect(useCase.execute({ name: 'Test Museum', slug: '' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects whitespace-only slug', async () => {
    await expect(useCase.execute({ name: 'Test Museum', slug: '   ' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects slug with uppercase letters', async () => {
    await expect(useCase.execute({ name: 'Test', slug: 'My-Museum' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects slug with spaces', async () => {
    await expect(useCase.execute({ name: 'Test', slug: 'my museum' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects slug with special characters', async () => {
    await expect(useCase.execute({ name: 'Test', slug: 'my_museum!' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('accepts slug with numbers and hyphens', async () => {
    const result = await useCase.execute({
      name: 'Museum 21',
      slug: 'museum-21',
    });
    expect(result.slug).toBe('museum-21');
  });

  it('persists the museum in the repository', async () => {
    await useCase.execute({ name: 'Orsay', slug: 'orsay' });

    const all = repo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Orsay');
  });
});
