import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

@Entity({ name: 'wikidata_kb_dump' })
@Unique('uq_wikidata_kb_dump_search_lang', ['searchTerm', 'language'])
export class WikidataKbDump {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', name: 'search_term' })
  searchTerm!: string;

  @Column({ type: 'text', name: 'language', default: '' })
  language!: string;

  @Index('ix_wikidata_kb_dump_qid')
  @Column({ type: 'text', name: 'qid', nullable: true })
  qid!: string | null;

  @Column({ type: 'jsonb', name: 'facts' })
  facts!: ArtworkFacts;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
