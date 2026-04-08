import type { MuseumCategory } from '@shared/http/overpass.client';

/** Input for creating a new museum. */
export interface CreateMuseumInput {
  name: string;
  slug: string;
  address?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  config?: Record<string, unknown>;
  museumType?: MuseumCategory;
}

/** Input for updating an existing museum. */
export interface UpdateMuseumInput {
  name?: string;
  slug?: string;
  address?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  config?: Record<string, unknown>;
  isActive?: boolean;
  museumType?: MuseumCategory;
}

/** Museum DTO returned to clients. */
export interface MuseumDTO {
  id: number;
  name: string;
  slug: string;
  address: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  museumType: MuseumCategory;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Public-facing museum directory entry (no internal config or admin fields). */
export interface MuseumDirectoryDTO {
  id: number;
  name: string;
  slug: string;
  address: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  museumType: MuseumCategory;
}
