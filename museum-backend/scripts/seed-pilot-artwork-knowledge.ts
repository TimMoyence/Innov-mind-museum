import 'dotenv/config';
import 'reflect-metadata';

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AppDataSource } from '@data/db/data-source';
import { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';

/**
 * W3 (T5.5) — Seeds 12 placeholder `artwork_knowledge` rows for the
 * Bordeaux pilot (4 per pilot museum) and emits the matching strict-format
 * CSVs consumed by `generate-qr-cartels.cjs`.
 *
 * All rows ship with `needsReview = true` + a placeholder note in the
 * description — the visit partner replaces the curated catalog before the
 * 2026-05-23 event. The UUIDs are stable across re-runs so re-seeding +
 * re-printing the PDFs yields identical QR payloads (idempotent).
 *
 * Insertion uses `orIgnore` on the `(title, artist, locale)` unique index;
 * re-running upserts nothing, so titles MUST stay stable until the partner
 * curated list lands (then we switch to `orUpdate`).
 */

type Slug = 'musee-d-aquitaine' | 'capc-musee-d-art-contemporain' | 'la-cite-du-vin';

interface PilotArtwork {
  id: string;
  title: string;
  artist: string | null;
  period: string | null;
  technique: string | null;
  currentLocation: string;
}

interface PilotMuseum {
  slug: Slug;
  museumUuid: string;
  csvFileName: string;
  artworks: PilotArtwork[];
}

const LOCALE = 'fr';
const PLACEHOLDER_DESCRIPTION =
  "Placeholder pilote Bordeaux 2026-05 — à remplacer par la fiche officielle " +
  'fournie par le musée partenaire avant le go-live.';

const PILOT: PilotMuseum[] = [
  {
    slug: 'musee-d-aquitaine',
    museumUuid: 'bdcabdca-1111-4222-9333-aaaa11000001',
    csvFileName: 'pilot-artworks-bordeaux-aquitaine.csv',
    artworks: [
      {
        id: 'bdcabdca-2222-4001-a001-aaaa11000001',
        title: 'Vénus à la corne de Laussel',
        artist: null,
        period: 'Paléolithique supérieur (~25 000 BP)',
        technique: 'Bas-relief sur bloc calcaire',
        currentLocation: "Musée d'Aquitaine — Salle Préhistoire",
      },
      {
        id: 'bdcabdca-2222-4001-a001-aaaa11000002',
        title: 'Statuette de Tutela Augusta',
        artist: null,
        period: 'Gallo-romain (IIe siècle)',
        technique: 'Bronze',
        currentLocation: "Musée d'Aquitaine — Salle Bordeaux gallo-romain",
      },
      {
        id: 'bdcabdca-2222-4001-a001-aaaa11000003',
        title: 'Maquette du port de Bordeaux au XVIIIe siècle',
        artist: null,
        period: 'Évocation XVIIIe siècle',
        technique: 'Maquette muséographique',
        currentLocation: "Musée d'Aquitaine — Salle Bordeaux au XVIIIe siècle",
      },
      {
        id: 'bdcabdca-2222-4001-a001-aaaa11000004',
        title: 'Trésor de Tayac',
        artist: null,
        period: 'Âge du Fer (IIe siècle av. J.-C.)',
        technique: 'Orfèvrerie celtique',
        currentLocation: "Musée d'Aquitaine — Salle Protohistoire",
      },
    ],
  },
  {
    slug: 'capc-musee-d-art-contemporain',
    museumUuid: 'bdcabdca-1111-4222-9333-aaaa11000002',
    csvFileName: 'pilot-artworks-bordeaux-capc.csv',
    artworks: [
      {
        id: 'bdcabdca-2222-4002-a002-aaaa11000001',
        title: 'Stone Line',
        artist: 'Richard Long',
        period: '1990',
        technique: 'Installation in situ — pierres',
        currentLocation: 'CAPC — Nef',
      },
      {
        id: 'bdcabdca-2222-4002-a002-aaaa11000002',
        title: 'Intervention rayée in situ',
        artist: 'Daniel Buren',
        period: 'Années 1990–2000',
        technique: 'Peinture acrylique sur colonnes',
        currentLocation: 'CAPC — Galeries',
      },
      {
        id: 'bdcabdca-2222-4002-a002-aaaa11000003',
        title: 'Ensemble photographique',
        artist: 'Christian Boltanski',
        period: 'Fin XXe siècle',
        technique: 'Installation photographique',
        currentLocation: 'CAPC — Salle collection permanente',
      },
      {
        id: 'bdcabdca-2222-4002-a002-aaaa11000004',
        title: 'Sculpture monumentale',
        artist: 'Tatiana Trouvé',
        period: 'Années 2010',
        technique: 'Sculpture mixed-media',
        currentLocation: 'CAPC — Galerie est',
      },
    ],
  },
  {
    slug: 'la-cite-du-vin',
    museumUuid: 'bdcabdca-1111-4222-9333-aaaa11000003',
    csvFileName: 'pilot-artworks-bordeaux-citevin.csv',
    artworks: [
      {
        id: 'bdcabdca-2222-4003-a003-aaaa11000001',
        title: 'Tour des Sens',
        artist: null,
        period: '2016',
        technique: 'Installation immersive multisensorielle',
        currentLocation: 'Cité du Vin — Parcours permanent',
      },
      {
        id: 'bdcabdca-2222-4003-a003-aaaa11000002',
        title: 'Table des Terroirs',
        artist: null,
        period: '2016',
        technique: 'Cartographie interactive',
        currentLocation: 'Cité du Vin — Galerie des terroirs',
      },
      {
        id: 'bdcabdca-2222-4003-a003-aaaa11000003',
        title: 'Galerie des Civilisations du vin',
        artist: null,
        period: '2016',
        technique: 'Parcours scénographique',
        currentLocation: 'Cité du Vin — Parcours permanent',
      },
      {
        id: 'bdcabdca-2222-4003-a003-aaaa11000004',
        title: 'Belvédère panoramique',
        artist: null,
        period: '2016',
        technique: 'Architecture immersive',
        currentLocation: 'Cité du Vin — Belvédère 8e étage',
      },
    ],
  },
];

function writePilotCsv(museum: PilotMuseum): string {
  const lines: string[] = ['artworkId,title,roomId'];
  for (const art of museum.artworks) {
    // Title MUST NOT contain commas in pilot dataset (the QR script uses naive
    // CSV split). Replace defensively (would-be a bug, not a sanitisation).
    const safeTitle = art.title.includes(',') ? art.title.replace(/,/g, ' ') : art.title;
    lines.push(`${art.id},${safeTitle},`);
  }
  const path = resolve(__dirname, '..', 'fixtures', museum.csvFileName);
  writeFileSync(path, lines.join('\n') + '\n', 'utf8');
  return path;
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const repo = AppDataSource.getRepository(ArtworkKnowledge);
  const rows = PILOT.flatMap((m) =>
    m.artworks.map((a) => ({
      id: a.id,
      title: a.title,
      artist: a.artist,
      period: a.period,
      technique: a.technique,
      description: PLACEHOLDER_DESCRIPTION,
      historicalContext: null,
      dimensions: null,
      currentLocation: a.currentLocation,
      sourceUrls: [],
      confidence: 0.5,
      needsReview: true,
      locale: LOCALE,
      roomId: null,
    })),
  );

  // `orIgnore()` always populates `result.identifiers` with the supplied IDs
  // regardless of whether the row was actually inserted, so we measure
  // before/after counts to report the real delta (idempotency check).
  const idsClause = rows.map((r) => `'${r.id}'`).join(',');
  const beforeRaw = await repo.query(
    `SELECT count(*)::int AS n FROM artwork_knowledge WHERE id IN (${idsClause})`,
  );
  const before = Number(beforeRaw[0].n);

  await repo
    .createQueryBuilder()
    .insert()
    .into(ArtworkKnowledge)
    .values(rows)
    .orIgnore()
    .execute();

  const afterRaw = await repo.query(
    `SELECT count(*)::int AS n FROM artwork_knowledge WHERE id IN (${idsClause})`,
  );
  const after = Number(afterRaw[0].n);
  const inserted = after - before;
  console.log(
    `pilot rows in DB: before=${before} after=${after} inserted=${inserted} (total expected=${rows.length})`,
  );

  console.log('\nGenerated CSVs:');
  for (const museum of PILOT) {
    const path = writePilotCsv(museum);
    console.log(
      `  ${museum.slug}: museumUuid=${museum.museumUuid} csv=${path} artworks=${museum.artworks.length}`,
    );
  }

  console.log('\nNext: generate PDFs via');
  for (const museum of PILOT) {
    console.log(
      `  node scripts/generate-qr-cartels.cjs --museum-id=${museum.museumUuid} --input=fixtures/${museum.csvFileName} --out=cartels-${museum.slug}.pdf`,
    );
  }

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
