import type { MuseumCategory } from '@shared/http/overpass.client';

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

/** Public — no internal config or admin fields. */
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
