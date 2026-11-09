import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

export type FallbackReason = 'no_visual_neighbor' | 'encoder_unavailable' | 'quota_exceeded';

export interface ArtworkMetadata {
  title: string;
  artist?: string;
  date?: string;
  museumQid?: string;
  technique?: string;
  movement?: string;
  genre?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  attribution?: string;
}

export interface NearestResult {
  qid: string;
  visualScore: number;
  metadata: ArtworkMetadata;
  modelVersion: string;
}

export interface CompareMatch {
  qid: string;
  title: string;
  imageUrl: string;
  thumbnailUrl?: string;
  visualScore: number;
  metadataScore: number;
  finalScore: number;
  rationale: string;
  facts: ArtworkFacts;
  attribution?: string;
}

export interface CompareResult {
  matches: CompareMatch[];
  durationMs: number;
  modelVersion: string;
  fallbackReason?: FallbackReason;
}
