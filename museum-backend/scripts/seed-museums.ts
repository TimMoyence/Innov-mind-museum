import 'dotenv/config';
import 'reflect-metadata';

import { AppDataSource } from '@data/db/data-source';
import { Museum } from '@modules/museum/domain/museum/museum.entity';

interface MuseumSeed {
  name: string;
  slug: string;
  address: string;
  description: string;
  latitude: number;
  longitude: number;
}

const MUSEUMS: MuseumSeed[] = [
  // ── Paris ──
  {
    name: 'Musée du Louvre',
    slug: 'musee-du-louvre',
    address: 'Rue de Rivoli, 75001 Paris',
    description:
      "Le plus grand musée d'art du monde, abritant la Joconde et la Vénus de Milo dans un palais royal historique.",
    latitude: 48.8606,
    longitude: 2.3376,
  },
  {
    name: "Musée d'Orsay",
    slug: 'musee-d-orsay',
    address: "1 Rue de la Légion d'Honneur, 75007 Paris",
    description:
      "Installé dans une ancienne gare, il présente la plus grande collection d'art impressionniste et post-impressionniste au monde.",
    latitude: 48.86,
    longitude: 2.3265,
  },
  {
    name: 'Centre Pompidou',
    slug: 'centre-pompidou',
    address: 'Place Georges-Pompidou, 75004 Paris',
    description:
      "Centre national d'art et de culture dédié à l'art moderne et contemporain, reconnaissable à son architecture high-tech.",
    latitude: 48.8607,
    longitude: 2.3525,
  },
  {
    name: "Musée de l'Orangerie",
    slug: 'musee-de-l-orangerie',
    address: 'Jardin des Tuileries, 75001 Paris',
    description:
      'Célèbre pour les Nymphéas de Claude Monet présentés dans deux salles ovales conçues par le peintre lui-même.',
    latitude: 48.8638,
    longitude: 2.3226,
  },
  {
    name: 'Musée Rodin',
    slug: 'musee-rodin',
    address: '77 Rue de Varenne, 75007 Paris',
    description:
      "Consacré à l'œuvre du sculpteur Auguste Rodin, installé dans l'Hôtel Biron et son jardin de sculptures.",
    latitude: 48.8554,
    longitude: 2.3158,
  },
  {
    name: 'Petit Palais',
    slug: 'petit-palais',
    address: 'Avenue Winston-Churchill, 75008 Paris',
    description:
      "Musée des Beaux-Arts de la Ville de Paris, abritant des collections allant de l'Antiquité au début du XXe siècle.",
    latitude: 48.8661,
    longitude: 2.3142,
  },
  // ── Lyon ──
  {
    name: 'Musée des Beaux-Arts de Lyon',
    slug: 'musee-des-beaux-arts-de-lyon',
    address: '20 Place des Terreaux, 69001 Lyon',
    description:
      "L'un des plus grands musées des beaux-arts de France, installé dans un ancien couvent bénédictin du XVIIe siècle.",
    latitude: 45.7676,
    longitude: 4.8339,
  },
  {
    name: 'Musée des Confluences',
    slug: 'musee-des-confluences',
    address: '86 Quai Perrache, 69002 Lyon',
    description:
      "Musée d'histoire naturelle et des sociétés au confluent du Rhône et de la Saône, dans un bâtiment déconstructiviste spectaculaire.",
    latitude: 45.7326,
    longitude: 4.818,
  },
  // ── Bordeaux ──
  {
    name: "Musée d'Aquitaine",
    slug: 'musee-d-aquitaine',
    address: '20 Cours Pasteur, 33000 Bordeaux',
    description:
      "Retrace l'histoire de Bordeaux et de l'Aquitaine de la Préhistoire à nos jours à travers des collections archéologiques et ethnographiques.",
    latitude: 44.8346,
    longitude: -0.5745,
  },
  {
    name: "CAPC Musée d'art contemporain",
    slug: 'capc-musee-d-art-contemporain',
    address: '7 Rue Ferrère, 33000 Bordeaux',
    description:
      "Installé dans un ancien entrepôt de denrées coloniales, il est l'un des premiers centres d'art contemporain créés en France.",
    latitude: 44.8497,
    longitude: -0.5714,
  },
  {
    name: 'La Cité du Vin',
    slug: 'la-cite-du-vin',
    address: '134 Quai de Bacalan, 33300 Bordeaux',
    description:
      'Centre culturel dédié au vin comme patrimoine universel, dans un édifice emblématique aux formes évoquant le vin dans un verre.',
    latitude: 44.8625,
    longitude: -0.5502,
  },
  // ── Marseille ──
  {
    name: 'MuCEM',
    slug: 'mucem',
    address: '7 Promenade Robert Laffont, 13002 Marseille',
    description:
      "Musée des civilisations de l'Europe et de la Méditerranée, relié au Fort Saint-Jean par une passerelle suspendue.",
    latitude: 43.2966,
    longitude: 5.3609,
  },
  {
    name: 'Musée des Beaux-Arts de Marseille',
    slug: 'musee-des-beaux-arts-de-marseille',
    address: 'Palais Longchamp, 13004 Marseille',
    description:
      "Installé dans l'aile gauche du Palais Longchamp, il possède des peintures et sculptures du XVIe au XIXe siècle.",
    latitude: 43.3042,
    longitude: 5.3944,
  },
  // ── Toulouse ──
  {
    name: 'Les Abattoirs',
    slug: 'les-abattoirs',
    address: '76 Allées Charles de Fitte, 31300 Toulouse',
    description:
      "Musée d'art moderne et contemporain installé dans les anciens abattoirs de Toulouse, abritant le rideau de scène de Picasso.",
    latitude: 43.6004,
    longitude: 1.4302,
  },
  {
    name: 'Musée des Augustins',
    slug: 'musee-des-augustins',
    address: '21 Rue de Metz, 31000 Toulouse',
    description:
      "Musée des beaux-arts de Toulouse installé dans un ancien couvent augustinien, riche d'une collection de sculptures romanes et gothiques.",
    latitude: 43.6012,
    longitude: 1.4446,
  },
  // ── Lille ──
  {
    name: 'Palais des Beaux-Arts de Lille',
    slug: 'palais-des-beaux-arts-de-lille',
    address: '18 bis Rue de Valmy, 59000 Lille',
    description:
      'Deuxième plus grand musée de France après le Louvre, avec des collections de peintures, sculptures et céramiques remarquables.',
    latitude: 50.6311,
    longitude: 3.0625,
  },
  // ── Nice ──
  {
    name: 'MAMAC Nice',
    slug: 'mamac-nice',
    address: 'Place Yves Klein, 06000 Nice',
    description:
      "Musée d'Art Moderne et d'Art Contemporain de Nice, dédié aux avant-gardes des années 1960 à nos jours, dont le Nouveau Réalisme.",
    latitude: 43.7003,
    longitude: 7.2776,
  },
  {
    name: 'Musée Matisse',
    slug: 'musee-matisse',
    address: '164 Avenue des Arènes de Cimiez, 06000 Nice',
    description:
      "Consacré à l'œuvre de Henri Matisse, installé dans une villa génoise du XVIIe siècle sur la colline de Cimiez.",
    latitude: 43.7197,
    longitude: 7.2769,
  },
  // ── Strasbourg ──
  {
    name: "Musée d'Art Moderne et Contemporain de Strasbourg",
    slug: 'musee-d-art-moderne-et-contemporain-de-strasbourg',
    address: '1 Place Hans Jean Arp, 67000 Strasbourg',
    description:
      "Présente l'art du tournant du XXe siècle à nos jours, avec des œuvres de Klimt, Kandinsky, Ernst et Arp entre autres.",
    latitude: 48.5793,
    longitude: 7.7528,
  },
];

async function main(): Promise<void> {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const repo = AppDataSource.getRepository(Museum);
  const result = await repo
    .createQueryBuilder()
    .insert()
    .into(Museum)
    .values(
      MUSEUMS.map((m) => ({
        name: m.name,
        slug: m.slug,
        address: m.address,
        description: m.description,
        latitude: m.latitude,
        longitude: m.longitude,
        config: {},
        isActive: true,
      })),
    )
    .orIgnore() // ON CONFLICT DO NOTHING — safe to re-run
    .execute();

  // With orIgnore(), rows already present produce undefined entries in identifiers.
  // Count only entries where id.id is a valid number.
  const inserted = result.identifiers.filter((id) => id?.id != null).length;
  const totalInDb = await repo.count();
  console.log(
    `Seeded ${inserted} new museum(s) (${MUSEUMS.length} in seed list, ${totalInDb} total in DB).`,
  );

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
