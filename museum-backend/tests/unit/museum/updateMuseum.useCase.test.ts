import { UpdateMuseumUseCase } from '@modules/museum/core/useCase/updateMuseum.useCase';
import { InMemoryMuseumRepository } from 'tests/helpers/museum/inMemoryMuseumRepository';

describe('UpdateMuseumUseCase', () => {
  let useCase: UpdateMuseumUseCase;
  let repo: InMemoryMuseumRepository;
  let museumId: number;

  beforeEach(async () => {
    repo = new InMemoryMuseumRepository();
    useCase = new UpdateMuseumUseCase(repo);

    const museum = await repo.create({
      name: 'Louvre',
      slug: 'louvre',
      address: 'Paris',
      description: 'Famous museum',
    });
    museumId = museum.id;
  });

  it('updates museum name', async () => {
    const result = await useCase.execute(museumId, { name: 'Musee du Louvre' });

    expect(result.name).toBe('Musee du Louvre');
    expect(result.slug).toBe('louvre'); // unchanged
  });

  it('updates multiple fields at once', async () => {
    const result = await useCase.execute(museumId, {
      name: 'New Name',
      address: 'New Address',
      description: 'New description',
      latitude: 10.5,
      longitude: 20.5,
    });

    expect(result.name).toBe('New Name');
    expect(result.address).toBe('New Address');
    expect(result.description).toBe('New description');
    expect(result.latitude).toBe(10.5);
    expect(result.longitude).toBe(20.5);
  });

  it('deactivates a museum', async () => {
    const result = await useCase.execute(museumId, { isActive: false });

    expect(result.isActive).toBe(false);
  });

  it('reactivates a museum', async () => {
    await useCase.execute(museumId, { isActive: false });
    const result = await useCase.execute(museumId, { isActive: true });

    expect(result.isActive).toBe(true);
  });

  it('updates slug with valid value', async () => {
    const result = await useCase.execute(museumId, { slug: 'louvre-museum' });

    expect(result.slug).toBe('louvre-museum');
  });

  it('rejects invalid slug format', async () => {
    await expect(useCase.execute(museumId, { slug: 'Invalid Slug!' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects slug with uppercase', async () => {
    await expect(useCase.execute(museumId, { slug: 'Louvre' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws 404 when museum not found', async () => {
    await expect(useCase.execute(999, { name: 'Does not exist' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('allows update with no slug field (skips slug validation)', async () => {
    const result = await useCase.execute(museumId, { name: 'Updated' });

    expect(result.name).toBe('Updated');
    expect(result.slug).toBe('louvre');
  });

  it('updates config', async () => {
    const result = await useCase.execute(museumId, {
      config: { theme: 'dark', language: 'fr' },
    });

    expect(result.config).toEqual({ theme: 'dark', language: 'fr' });
  });

  it('sets nullable fields to null', async () => {
    const result = await useCase.execute(museumId, {
      address: null,
      description: null,
      latitude: null,
      longitude: null,
    });

    expect(result.address).toBeNull();
    expect(result.description).toBeNull();
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });
});
