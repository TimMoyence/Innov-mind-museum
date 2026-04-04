/**
 * Museum module composition root.
 * Wires repository implementations to use-case classes and exports ready-to-use singletons.
 */
import { AppDataSource } from '@src/data/db/data-source';

import { CreateMuseumUseCase } from './createMuseum.useCase';
import { GetMuseumUseCase } from './getMuseum.useCase';
import { ListMuseumsUseCase } from './listMuseums.useCase';
import { SearchMuseumsUseCase } from './searchMuseums.useCase';
import { UpdateMuseumUseCase } from './updateMuseum.useCase';
import { MuseumRepositoryPg } from '../adapters/secondary/museum.repository.pg';

import type { CacheService } from '@shared/cache/cache.port';

const museumRepository = new MuseumRepositoryPg(AppDataSource);

export const createMuseumUseCase = new CreateMuseumUseCase(museumRepository);
export const getMuseumUseCase = new GetMuseumUseCase(museumRepository);
export const listMuseumsUseCase = new ListMuseumsUseCase(museumRepository);
export const updateMuseumUseCase = new UpdateMuseumUseCase(museumRepository);

/** Creates the search use case with an optional cache service (resolved at runtime). */
export const buildSearchMuseumsUseCase = (cache?: CacheService): SearchMuseumsUseCase =>
  new SearchMuseumsUseCase(museumRepository, cache);

export { museumRepository };
