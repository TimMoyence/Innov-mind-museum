/**
 * Seed script for knowledge extraction data.
 * Populates artwork_knowledge and museum_enrichment tables with real museum data.
 * Idempotent — uses ON CONFLICT DO NOTHING for safe re-runs.
 *
 * Usage: pnpm seed:knowledge
 * Deploy: runs automatically after migrations in CI deploy pipeline.
 */
import 'dotenv/config';
import 'reflect-metadata';

import { AppDataSource } from '@data/db/data-source';
import { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';
import { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment/museum-enrichment.entity';

// ────────────────────────────────────────────────────────────
// Artwork seed data — real artworks from major world museums
// ────────────────────────────────────────────────────────────

interface ArtworkSeed {
  title: string;
  artist: string | null;
  period: string | null;
  technique: string | null;
  description: string;
  historicalContext: string | null;
  dimensions: string | null;
  currentLocation: string | null;
  sourceUrls: string[];
  confidence: number;
  locale: string;
}

const ARTWORKS: ArtworkSeed[] = [
  // ── Louvre ──
  {
    title: 'Mona Lisa',
    artist: 'Leonardo da Vinci',
    period: 'Renaissance',
    technique: 'Oil on poplar panel',
    description:
      'A half-length portrait of a woman believed to be Lisa Gherardini, renowned for her enigmatic smile and pioneering use of sfumato. It is the most visited and most recognized painting in the world.',
    historicalContext:
      'Painted between 1503 and 1519 in Florence and France, the work was acquired by King Francis I and has been a French state property since the Revolution. It survived theft in 1911 and an acid attack in 1956.',
    dimensions: '77 cm x 53 cm',
    currentLocation: 'Musee du Louvre, Paris',
    sourceUrls: ['https://en.wikipedia.org/wiki/Mona_Lisa'],
    confidence: 0.95,
    locale: 'en',
  },
  {
    title: 'Winged Victory of Samothrace',
    artist: null,
    period: 'Hellenistic',
    technique: 'Parian marble sculpture',
    description:
      'A monumental marble sculpture of Nike, the Greek goddess of victory, depicted alighting on the prow of a warship. The dynamic drapery and sense of forward motion make it one of the greatest masterpieces of Hellenistic sculpture.',
    historicalContext:
      'Created around 190 BC, likely to commemorate a naval victory. Discovered on the island of Samothrace in 1863 by Charles Champoiseau and transported to Paris.',
    dimensions: '244 cm height',
    currentLocation: 'Musee du Louvre, Paris',
    sourceUrls: ['https://en.wikipedia.org/wiki/Winged_Victory_of_Samothrace'],
    confidence: 0.93,
    locale: 'en',
  },
  {
    title: 'Venus de Milo',
    artist: 'Alexandros of Antioch',
    period: 'Hellenistic',
    technique: 'Marble sculpture',
    description:
      'An ancient Greek statue depicting Aphrodite, the goddess of love and beauty. Famous for its missing arms and graceful contrapposto pose, it epitomizes classical beauty ideals.',
    historicalContext:
      'Created between 130 and 100 BC. Discovered in 1820 on the island of Milos by a peasant farmer and acquired by France. Its missing arms have fueled centuries of speculation about the original pose.',
    dimensions: '204 cm height',
    currentLocation: 'Musee du Louvre, Paris',
    sourceUrls: ['https://en.wikipedia.org/wiki/Venus_de_Milo'],
    confidence: 0.94,
    locale: 'en',
  },
  {
    title: 'Liberty Leading the People',
    artist: 'Eugene Delacroix',
    period: 'Romanticism',
    technique: 'Oil on canvas',
    description:
      'An allegorical painting commemorating the July Revolution of 1830. The bare-breasted figure of Marianne strides over a barricade holding the French tricolor, embodying the spirit of liberty.',
    historicalContext:
      'Painted in 1830 immediately after the revolution that overthrew Charles X. The painting became an enduring symbol of the French Republic and inspired the design of the Statue of Liberty.',
    dimensions: '260 cm x 325 cm',
    currentLocation: 'Musee du Louvre, Paris',
    sourceUrls: ['https://en.wikipedia.org/wiki/Liberty_Leading_the_People'],
    confidence: 0.92,
    locale: 'en',
  },
  // ── Musee d'Orsay ──
  {
    title: 'Starry Night Over the Rhone',
    artist: 'Vincent van Gogh',
    period: 'Post-Impressionism',
    technique: 'Oil on canvas',
    description:
      "A nocturnal scene of the Rhone river at Arles with gas lamps reflecting on the water and the stars of the Great Bear constellation. The swirling reflections and luminous sky showcase van Gogh's mastery of color and night painting.",
    historicalContext:
      'Painted in September 1888 during van Gogh\'s stay in Arles. He wrote to his brother Theo about his ambition to paint a "starry night" and produced this work en plein air on the bank of the Rhone.',
    dimensions: '72.5 cm x 92 cm',
    currentLocation: "Musee d'Orsay, Paris",
    sourceUrls: ['https://en.wikipedia.org/wiki/Starry_Night_Over_the_Rh%C3%B4ne'],
    confidence: 0.93,
    locale: 'en',
  },
  {
    title: 'Olympia',
    artist: 'Edouard Manet',
    period: 'Realism / Early Modernism',
    technique: 'Oil on canvas',
    description:
      'A reclining nude woman, identified as a courtesan, gazes directly at the viewer with a confrontational expression. The painting scandalized the 1865 Salon with its stark lighting and unapologetic subject matter.',
    historicalContext:
      'Exhibited at the Paris Salon of 1865, Olympia caused outrage for depicting a contemporary sex worker rather than a mythological Venus. Guards were posted to protect it from angry crowds. It became a landmark of modern art.',
    dimensions: '130.5 cm x 190 cm',
    currentLocation: "Musee d'Orsay, Paris",
    sourceUrls: ['https://en.wikipedia.org/wiki/Olympia_(Manet)'],
    confidence: 0.91,
    locale: 'en',
  },
  {
    title: 'Bal du moulin de la Galette',
    artist: 'Pierre-Auguste Renoir',
    period: 'Impressionism',
    technique: 'Oil on canvas',
    description:
      'A sun-dappled scene of Parisians dancing and socializing at the outdoor dance hall Moulin de la Galette in Montmartre. The painting captures the joyful atmosphere of working-class leisure through vibrant brushwork and dappled light.',
    historicalContext:
      'Painted in 1876, it represents the heart of Impressionist ideals: capturing the fleeting effects of light and the vibrancy of modern urban life. Renoir worked partly on-site, carrying the large canvas to the dance hall.',
    dimensions: '131 cm x 175 cm',
    currentLocation: "Musee d'Orsay, Paris",
    sourceUrls: ['https://en.wikipedia.org/wiki/Bal_du_moulin_de_la_Galette'],
    confidence: 0.92,
    locale: 'en',
  },
  // ── Rijksmuseum, Amsterdam ──
  {
    title: 'The Night Watch',
    artist: 'Rembrandt van Rijn',
    period: 'Dutch Golden Age',
    technique: 'Oil on canvas',
    description:
      'A monumental group portrait of a militia company led by Captain Frans Banning Cocq. Breaking with static group portrait conventions, Rembrandt infused the scene with dramatic movement, light, and shadow.',
    historicalContext:
      'Commissioned in 1642 for the Kloveniersdoelen militia hall in Amsterdam. The painting was trimmed on all sides when relocated in 1715. Restored extensively after a knife attack in 1975 and an acid attack in 1990.',
    dimensions: '363 cm x 437 cm',
    currentLocation: 'Rijksmuseum, Amsterdam',
    sourceUrls: ['https://en.wikipedia.org/wiki/The_Night_Watch'],
    confidence: 0.95,
    locale: 'en',
  },
  {
    title: 'The Milkmaid',
    artist: 'Johannes Vermeer',
    period: 'Dutch Golden Age',
    technique: 'Oil on canvas',
    description:
      'A kitchen maid carefully pours milk from an earthenware jug. The painting is celebrated for its serene composition, masterful rendering of light streaming through a window, and the pointillist treatment of the bread and basket.',
    historicalContext:
      'Painted around 1658-1660 in Delft. The quiet domestic scene reflects the Dutch Golden Age interest in genre painting. The work was auctioned multiple times before entering the Rijksmuseum collection in 1908.',
    dimensions: '45.5 cm x 41 cm',
    currentLocation: 'Rijksmuseum, Amsterdam',
    sourceUrls: ['https://en.wikipedia.org/wiki/The_Milkmaid_(Vermeer)'],
    confidence: 0.94,
    locale: 'en',
  },
  // ── Mauritshuis, The Hague ──
  {
    title: 'Girl with a Pearl Earring',
    artist: 'Johannes Vermeer',
    period: 'Dutch Golden Age',
    technique: 'Oil on canvas',
    description:
      'A tronie of a girl wearing an exotic turban and an oversized pearl earring, turning toward the viewer with parted lips and a luminous gaze. Often called the "Mona Lisa of the North" for its captivating intimacy.',
    historicalContext:
      'Painted around 1665, this is not a portrait but a tronie — a study of an idealized figure. The pearl earring, likely tin rather than a real pearl, was a common baroque motif. The painting was virtually forgotten until its rediscovery in the late 19th century.',
    dimensions: '44.5 cm x 39 cm',
    currentLocation: 'Mauritshuis, The Hague',
    sourceUrls: ['https://en.wikipedia.org/wiki/Girl_with_a_Pearl_Earring'],
    confidence: 0.95,
    locale: 'en',
  },
  // ── National Gallery, Oslo ──
  {
    title: 'The Scream',
    artist: 'Edvard Munch',
    period: 'Expressionism',
    technique: 'Tempera and crayon on cardboard',
    description:
      'A figure with an agonized expression against a tumultuous orange sky, hands raised to its face. The undulating lines of the landscape and sky create a visual representation of existential anxiety and modern alienation.',
    historicalContext:
      'Created in 1893, part of a series of four versions. Munch described the inspiration as a moment when "the sky turned blood red" during a walk. The painting was stolen in 1994 and again in 2004, both times recovered.',
    dimensions: '91 cm x 73.5 cm',
    currentLocation: 'National Gallery, Oslo',
    sourceUrls: ['https://en.wikipedia.org/wiki/The_Scream'],
    confidence: 0.95,
    locale: 'en',
  },
  // ── MoMA, New York ──
  {
    title: 'The Starry Night',
    artist: 'Vincent van Gogh',
    period: 'Post-Impressionism',
    technique: 'Oil on canvas',
    description:
      "A swirling nocturnal landscape viewed from van Gogh's asylum window at Saint-Remy-de-Provence. The dramatic spiraling sky, luminous stars, and dark cypress tree create a visionary interpretation of the night that transcends observation.",
    historicalContext:
      'Painted in June 1889 while van Gogh was voluntarily confined at the Saint-Paul-de-Mausole asylum. He considered this painting a "failure," yet it became his most iconic work and a symbol of artistic genius.',
    dimensions: '73.7 cm x 92.1 cm',
    currentLocation: 'Museum of Modern Art, New York',
    sourceUrls: ['https://en.wikipedia.org/wiki/The_Starry_Night'],
    confidence: 0.95,
    locale: 'en',
  },
  {
    title: 'The Persistence of Memory',
    artist: 'Salvador Dali',
    period: 'Surrealism',
    technique: 'Oil on canvas',
    description:
      'Soft, melting pocket watches draped over a barren landscape with a distorted face-like figure. The dreamlike imagery explores the fluidity of time and the unreliability of perception in the unconscious mind.',
    historicalContext:
      'Painted in 1931, this small canvas became the defining image of Surrealism. Dali claimed the melting watches were inspired by the sight of Camembert cheese melting in the sun. Acquired by MoMA in 1934.',
    dimensions: '24.1 cm x 33 cm',
    currentLocation: 'Museum of Modern Art, New York',
    sourceUrls: ['https://en.wikipedia.org/wiki/The_Persistence_of_Memory'],
    confidence: 0.94,
    locale: 'en',
  },
  {
    title: "Les Demoiselles d'Avignon",
    artist: 'Pablo Picasso',
    period: 'Proto-Cubism',
    technique: 'Oil on canvas',
    description:
      'Five nude women composed of flat, angular planes and African-mask-inspired faces confront the viewer in a shallow, fragmented space. The painting broke radically with Western traditions of perspective and idealized beauty.',
    historicalContext:
      "Painted in 1907, it shocked even Picasso's closest friends including Braque and Matisse. Kept in his studio for years before public exhibition, it is now considered the most influential painting of the 20th century and the genesis of Cubism.",
    dimensions: '243.9 cm x 233.7 cm',
    currentLocation: 'Museum of Modern Art, New York',
    sourceUrls: ['https://en.wikipedia.org/wiki/Les_Demoiselles_d%27Avignon'],
    confidence: 0.94,
    locale: 'en',
  },
  // ── Uffizi Gallery, Florence ──
  {
    title: 'The Birth of Venus',
    artist: 'Sandro Botticelli',
    period: 'Renaissance',
    technique: 'Tempera on canvas',
    description:
      'The goddess Venus emerges from the sea as a fully grown woman, standing on a giant scallop shell and blown toward shore by the winds Zephyr and Chloris. Her flowing hair and graceful pose embody Renaissance ideals of classical beauty.',
    historicalContext:
      'Painted around 1484-1486 for Lorenzo di Pierfrancesco de Medici. The work reflects the Neoplatonic philosophy prevalent in Medicean Florence, interpreting the birth of Venus as an allegory for the birth of beauty and truth.',
    dimensions: '172.5 cm x 278.9 cm',
    currentLocation: 'Uffizi Gallery, Florence',
    sourceUrls: ['https://en.wikipedia.org/wiki/The_Birth_of_Venus'],
    confidence: 0.95,
    locale: 'en',
  },
  {
    title: 'Primavera',
    artist: 'Sandro Botticelli',
    period: 'Renaissance',
    technique: 'Tempera on panel',
    description:
      'An allegorical scene set in a mythological garden with nine figures including Venus, Mercury, the Three Graces, and Flora strewing flowers. The painting celebrates spring, fertility, and the transformative power of love.',
    historicalContext:
      'Painted around 1477-1482, likely for the same Medici patron as The Birth of Venus. The complex iconography draws on Ovid, Lucretius, and Neoplatonic philosophy. It hung in the Villa di Castello for centuries.',
    dimensions: '202 cm x 314 cm',
    currentLocation: 'Uffizi Gallery, Florence',
    sourceUrls: ['https://en.wikipedia.org/wiki/Primavera_(Botticelli)'],
    confidence: 0.93,
    locale: 'en',
  },
  // ── Prado, Madrid ──
  {
    title: 'Las Meninas',
    artist: 'Diego Velazquez',
    period: 'Baroque',
    technique: 'Oil on canvas',
    description:
      'A complex scene showing the Infanta Margarita surrounded by her attendants, a dog, two dwarfs, and Velazquez himself painting at a large canvas. A mirror in the background reflects the king and queen, blurring the line between observer and observed.',
    historicalContext:
      "Painted in 1656 in the Alcazar palace of Madrid. The painting's revolutionary approach to perspective, spectatorship, and the nature of representation has made it one of the most analyzed works in Western art history.",
    dimensions: '318 cm x 276 cm',
    currentLocation: 'Museo del Prado, Madrid',
    sourceUrls: ['https://en.wikipedia.org/wiki/Las_Meninas'],
    confidence: 0.95,
    locale: 'en',
  },
  {
    title: 'Guernica',
    artist: 'Pablo Picasso',
    period: 'Cubism / Surrealism',
    technique: 'Oil on canvas',
    description:
      'A monumental anti-war painting rendered in stark black, white, and grey depicting the horrors of the bombing of the Basque town of Guernica. Fragmented figures of screaming women, a dismembered soldier, a bull, and a wounded horse convey the brutality of war.',
    historicalContext:
      "Commissioned for the 1937 Paris International Exposition, Picasso created it in response to the Nazi bombing of Guernica during the Spanish Civil War. It toured the world to raise awareness and was held at MoMA until returned to Spain in 1981 after Franco's death.",
    dimensions: '349.3 cm x 776.6 cm',
    currentLocation: 'Museo Reina Sofia, Madrid',
    sourceUrls: ['https://en.wikipedia.org/wiki/Guernica_(Picasso)'],
    confidence: 0.95,
    locale: 'en',
  },
  // ── National Gallery, London ──
  {
    title: 'Sunflowers',
    artist: 'Vincent van Gogh',
    period: 'Post-Impressionism',
    technique: 'Oil on canvas',
    description:
      'A vase of fifteen sunflowers in various stages of bloom, from fresh to wilting, painted in a rich palette of yellows. The thick impasto brushwork gives the flowers a sculptural, almost three-dimensional quality.',
    historicalContext:
      'Painted in August 1888 in Arles to decorate the room he prepared for Gauguin. Van Gogh created a series of sunflower paintings; this version was among those he considered his best. It became a symbol of the Impressionist movement.',
    dimensions: '92.1 cm x 73 cm',
    currentLocation: 'National Gallery, London',
    sourceUrls: ['https://en.wikipedia.org/wiki/Sunflowers_(Van_Gogh_series)'],
    confidence: 0.93,
    locale: 'en',
  },
  // ── Vatican Museums ──
  {
    title: 'The Creation of Adam',
    artist: 'Michelangelo',
    period: 'High Renaissance',
    technique: 'Fresco',
    description:
      'God, borne by angels, reaches out to transmit the spark of life to Adam, whose languid body reclines on the earth. The near-touching fingers have become one of the most replicated images in art history.',
    historicalContext:
      'Painted between 1508 and 1512 as part of the Sistine Chapel ceiling commission from Pope Julius II. Michelangelo, who considered himself primarily a sculptor, initially resisted the project but produced one of the supreme achievements of Western art.',
    dimensions: '280 cm x 570 cm',
    currentLocation: 'Sistine Chapel, Vatican City',
    sourceUrls: ['https://en.wikipedia.org/wiki/The_Creation_of_Adam'],
    confidence: 0.95,
    locale: 'en',
  },
  // ── Art Institute of Chicago ──
  {
    title: 'A Sunday Afternoon on the Island of La Grande Jatte',
    artist: 'Georges Seurat',
    period: 'Neo-Impressionism / Pointillism',
    technique: 'Oil on canvas',
    description:
      'Parisians relax on a sunlit island in the Seine, rendered entirely in tiny dots of pure color that blend optically when viewed from a distance. The monumental canvas took Seurat two years and pioneered the Pointillist technique.',
    historicalContext:
      "Exhibited at the 1886 Impressionist exhibition, it caused a sensation and effectively founded the Neo-Impressionist movement. Seurat made over 60 preparatory studies. The painting appeared in the film Ferris Bueller's Day Off.",
    dimensions: '207.6 cm x 308 cm',
    currentLocation: 'Art Institute of Chicago',
    sourceUrls: [
      'https://en.wikipedia.org/wiki/A_Sunday_Afternoon_on_the_Island_of_La_Grande_Jatte',
    ],
    confidence: 0.93,
    locale: 'en',
  },
  {
    title: 'American Gothic',
    artist: 'Grant Wood',
    period: 'Regionalism',
    technique: 'Oil on beaverboard',
    description:
      'A stern-faced farmer holding a pitchfork stands beside a woman in front of a house with a distinctive Gothic window. The painting has become an iconic image of rural American identity, inspiring countless parodies.',
    historicalContext:
      "Painted in 1930 after Wood saw a small house with a Gothic-style window in Eldon, Iowa. The models were Wood's sister and his dentist. Initially read as satire of small-town life, Wood insisted it was a tribute to Midwestern values.",
    dimensions: '78 cm x 65.3 cm',
    currentLocation: 'Art Institute of Chicago',
    sourceUrls: ['https://en.wikipedia.org/wiki/American_Gothic'],
    confidence: 0.92,
    locale: 'en',
  },
  // ── Galleria dell'Accademia, Florence ──
  {
    title: 'David',
    artist: 'Michelangelo',
    period: 'High Renaissance',
    technique: 'Marble sculpture',
    description:
      "A colossal marble statue of the biblical hero David, depicted in the tense moment before battle with Goliath. The figure's idealized anatomy, veined hands, and focused gaze embody the Renaissance ideal of human perfection.",
    historicalContext:
      'Carved between 1501 and 1504 from a block of Carrara marble that had been abandoned by two previous sculptors. Originally placed in the Piazza della Signoria as a symbol of Florentine civic virtue, it was moved indoors in 1873 to protect it from weathering.',
    dimensions: '517 cm height',
    currentLocation: "Galleria dell'Accademia, Florence",
    sourceUrls: ['https://en.wikipedia.org/wiki/David_(Michelangelo)'],
    confidence: 0.95,
    locale: 'en',
  },
  // ── Musee de l'Orangerie ──
  {
    title: 'Water Lilies (Nympheas)',
    artist: 'Claude Monet',
    period: 'Impressionism',
    technique: 'Oil on canvas',
    description:
      "A series of monumental panoramic canvases depicting Monet's water garden at Giverny — floating lilies, weeping willows, and reflections of sky on water. The immersive curved installation dissolves the boundary between painting and environment.",
    historicalContext:
      "Monet worked on these panels from 1914 until his death in 1926, donating them to France. Installed in two oval rooms designed to Monet's specifications, they were inaugurated in 1927. The series prefigured Abstract Expressionism.",
    dimensions: 'Variable, approximately 200 cm x 1275 cm each panel',
    currentLocation: "Musee de l'Orangerie, Paris",
    sourceUrls: ['https://en.wikipedia.org/wiki/Water_Lilies_(Monet_series)'],
    confidence: 0.93,
    locale: 'en',
  },
  // ── Tate Modern, London ──
  {
    title: 'The Weeping Woman',
    artist: 'Pablo Picasso',
    period: 'Cubism',
    technique: 'Oil on canvas',
    description:
      "A woman's anguished face rendered in sharp, angular Cubist planes with vivid yellows, greens, and purples. Tears stream from her fragmented features as she bites a handkerchief. The painting extends the themes of suffering explored in Guernica.",
    historicalContext:
      "Painted in October 1937 as the culmination of a series exploring grief, directly linked to Guernica. The model was Dora Maar, Picasso's companion and a photographer who documented the creation of Guernica.",
    dimensions: '60 cm x 49 cm',
    currentLocation: 'Tate Modern, London',
    sourceUrls: ['https://en.wikipedia.org/wiki/The_Weeping_Woman'],
    confidence: 0.91,
    locale: 'en',
  },
  // ── Metropolitan Museum of Art ──
  {
    title: 'Washington Crossing the Delaware',
    artist: 'Emanuel Leutze',
    period: 'Romanticism',
    technique: 'Oil on canvas',
    description:
      'General George Washington stands heroically at the prow of a boat crossing the ice-choked Delaware River on Christmas night 1776. The dramatic composition, with soldiers straining against wind and ice, captures a pivotal moment in the American Revolution.',
    historicalContext:
      'Painted in 1851 in Dusseldorf, Germany, by a German-American artist. The original was damaged by fire; this is the full-sized replica Leutze made. Despite historical inaccuracies (wrong boat type, flag design), it became an enduring symbol of American resolve.',
    dimensions: '378.5 cm x 647.7 cm',
    currentLocation: 'Metropolitan Museum of Art, New York',
    sourceUrls: ['https://en.wikipedia.org/wiki/Washington_Crossing_the_Delaware'],
    confidence: 0.92,
    locale: 'en',
  },
];

// ────────────────────────────────────────────────────────────
// Museum enrichment seed data — practical visitor information
// ────────────────────────────────────────────────────────────

interface MuseumEnrichmentSeed {
  name: string;
  museumId: null;
  openingHours: Record<string, unknown> | null;
  admissionFees: Record<string, unknown> | null;
  website: string | null;
  collections: Record<string, unknown> | null;
  currentExhibitions: Record<string, unknown> | null;
  accessibility: Record<string, unknown> | null;
  sourceUrls: string[];
  confidence: number;
  locale: string;
}

const MUSEUM_ENRICHMENTS: MuseumEnrichmentSeed[] = [
  {
    name: 'Musee du Louvre',
    museumId: null,
    openingHours: {
      monday: 'Closed',
      tuesday: 'Closed',
      wednesday: '09:00-18:00',
      thursday: '09:00-18:00',
      friday: '09:00-21:45',
      saturday: '09:00-18:00',
      sunday: '09:00-18:00',
      note: 'Last admission 30 minutes before closing',
    },
    admissionFees: {
      adult: '22 EUR',
      under18: 'Free',
      under26EU: 'Free',
      firstSaturdayEvening: 'Free (6pm-9:45pm)',
    },
    website: 'https://www.louvre.fr',
    collections: {
      departments: [
        'Egyptian Antiquities',
        'Near Eastern Antiquities',
        'Greek, Etruscan, and Roman Antiquities',
        'Islamic Art',
        'Sculptures',
        'Decorative Arts',
        'Paintings',
        'Prints and Drawings',
      ],
      highlights: ['Mona Lisa', 'Venus de Milo', 'Winged Victory of Samothrace'],
    },
    currentExhibitions: null,
    accessibility: {
      wheelchairAccess: true,
      audioGuide: true,
      signLanguageTours: true,
      tactileGallery: true,
    },
    sourceUrls: ['https://www.louvre.fr/en/visit'],
    confidence: 0.9,
    locale: 'en',
  },
  {
    name: "Musee d'Orsay",
    museumId: null,
    openingHours: {
      monday: 'Closed',
      tuesday: '09:30-18:00',
      wednesday: '09:30-18:00',
      thursday: '09:30-21:45',
      friday: '09:30-18:00',
      saturday: '09:30-18:00',
      sunday: '09:30-18:00',
    },
    admissionFees: {
      adult: '16 EUR',
      under18: 'Free',
      under26EU: 'Free',
    },
    website: 'https://www.musee-orsay.fr',
    collections: {
      focus: 'Impressionism and Post-Impressionism (1848-1914)',
      highlights: [
        'Bal du moulin de la Galette (Renoir)',
        'Starry Night Over the Rhone (Van Gogh)',
        'Olympia (Manet)',
        "L'Origine du monde (Courbet)",
      ],
    },
    currentExhibitions: null,
    accessibility: {
      wheelchairAccess: true,
      audioGuide: true,
      tactileVisits: true,
    },
    sourceUrls: ['https://www.musee-orsay.fr/en/visit'],
    confidence: 0.9,
    locale: 'en',
  },
  {
    name: 'Rijksmuseum',
    museumId: null,
    openingHours: {
      everyday: '09:00-17:00',
      note: 'Open every day including public holidays',
    },
    admissionFees: {
      adult: '22.50 EUR',
      under18: 'Free',
      museumkaart: 'Free',
    },
    website: 'https://www.rijksmuseum.nl',
    collections: {
      focus: 'Dutch Golden Age (1600-1700)',
      highlights: [
        'The Night Watch (Rembrandt)',
        'The Milkmaid (Vermeer)',
        'The Merry Drinker (Hals)',
      ],
      totalWorks: 'Over 8,000 objects on display',
    },
    currentExhibitions: null,
    accessibility: {
      wheelchairAccess: true,
      audioGuide: true,
      signLanguageApp: true,
      assistanceDogs: true,
    },
    sourceUrls: ['https://www.rijksmuseum.nl/en/visit'],
    confidence: 0.9,
    locale: 'en',
  },
  {
    name: 'Museum of Modern Art',
    museumId: null,
    openingHours: {
      sunday: '10:30-17:30',
      monday: '10:30-17:30',
      tuesday: '10:30-17:30',
      wednesday: 'Closed',
      thursday: '10:30-17:30',
      friday: '10:30-17:30',
      saturday: '10:30-19:00',
    },
    admissionFees: {
      adult: '30 USD',
      seniors: '22 USD',
      students: '17 USD',
      under16: 'Free',
      fridayEvening: 'Free (5:30pm-7pm, UNIQLO partnership)',
    },
    website: 'https://www.moma.org',
    collections: {
      departments: [
        'Architecture and Design',
        'Drawings and Prints',
        'Film',
        'Media and Performance',
        'Painting and Sculpture',
        'Photography',
      ],
      highlights: [
        'The Starry Night (Van Gogh)',
        'The Persistence of Memory (Dali)',
        "Les Demoiselles d'Avignon (Picasso)",
        "Campbell's Soup Cans (Warhol)",
      ],
    },
    currentExhibitions: null,
    accessibility: {
      wheelchairAccess: true,
      audioGuide: true,
      ASLTours: true,
      verbalDescriptionTours: true,
    },
    sourceUrls: ['https://www.moma.org/visit'],
    confidence: 0.9,
    locale: 'en',
  },
  {
    name: 'Uffizi Gallery',
    museumId: null,
    openingHours: {
      monday: 'Closed',
      tuesday: '08:15-18:30',
      wednesday: '08:15-18:30',
      thursday: '08:15-18:30',
      friday: '08:15-18:30',
      saturday: '08:15-18:30',
      sunday: '08:15-18:30',
      note: 'Last entry at 17:30',
    },
    admissionFees: {
      adult: '26 EUR (high season) / 16 EUR (low season)',
      under18EU: 'Free',
      firstSunday: 'Free',
    },
    website: 'https://www.uffizi.it',
    collections: {
      focus: 'Italian Renaissance (13th-17th century)',
      highlights: [
        'The Birth of Venus (Botticelli)',
        'Primavera (Botticelli)',
        'Annunciation (Leonardo)',
        'Tondo Doni (Michelangelo)',
      ],
    },
    currentExhibitions: null,
    accessibility: {
      wheelchairAccess: true,
      audioGuide: true,
      tactileModels: true,
    },
    sourceUrls: ['https://www.uffizi.it/en/visit'],
    confidence: 0.9,
    locale: 'en',
  },
  {
    name: 'Museo del Prado',
    museumId: null,
    openingHours: {
      monday: '10:00-20:00',
      tuesday: '10:00-20:00',
      wednesday: '10:00-20:00',
      thursday: '10:00-20:00',
      friday: '10:00-20:00',
      saturday: '10:00-20:00',
      sunday: '10:00-19:00',
    },
    admissionFees: {
      adult: '15 EUR',
      under18: 'Free',
      over65: 'Free',
      lastTwoHours: 'Free',
    },
    website: 'https://www.museodelprado.es',
    collections: {
      focus: 'European art (12th-20th century)',
      highlights: [
        'Las Meninas (Velazquez)',
        'The Garden of Earthly Delights (Bosch)',
        'The Third of May 1808 (Goya)',
        'The Descent from the Cross (van der Weyden)',
      ],
    },
    currentExhibitions: null,
    accessibility: {
      wheelchairAccess: true,
      audioGuide: true,
      brailleGuide: true,
      signLanguageVideos: true,
    },
    sourceUrls: ['https://www.museodelprado.es/en/visit'],
    confidence: 0.9,
    locale: 'en',
  },
  {
    name: 'National Gallery',
    museumId: null,
    openingHours: {
      everyday: '10:00-18:00',
      friday: '10:00-21:00',
      note: 'Open every day including public holidays',
    },
    admissionFees: {
      permanent: 'Free',
      specialExhibitions: 'Varies (typically 10-25 GBP)',
    },
    website: 'https://www.nationalgallery.org.uk',
    collections: {
      focus: 'Western European painting (1250-1900)',
      highlights: [
        'Sunflowers (Van Gogh)',
        'The Arnolfini Portrait (Van Eyck)',
        'The Fighting Temeraire (Turner)',
        'The Hay Wain (Constable)',
      ],
      totalWorks: 'Over 2,300 paintings',
    },
    currentExhibitions: null,
    accessibility: {
      wheelchairAccess: true,
      audioGuide: true,
      BSLTours: true,
      audioDescribedTours: true,
    },
    sourceUrls: ['https://www.nationalgallery.org.uk/visiting'],
    confidence: 0.9,
    locale: 'en',
  },
  {
    name: 'Metropolitan Museum of Art',
    museumId: null,
    openingHours: {
      sunday: '10:00-17:00',
      monday: '10:00-17:00',
      tuesday: 'Closed',
      wednesday: 'Closed',
      thursday: '10:00-17:00',
      friday: '10:00-21:00',
      saturday: '10:00-21:00',
    },
    admissionFees: {
      adult: '30 USD',
      seniors: '22 USD',
      students: '17 USD',
      under12: 'Free',
      NYresidents: 'Pay what you wish',
    },
    website: 'https://www.metmuseum.org',
    collections: {
      departments: [
        'American Wing',
        'Arms and Armor',
        'Asian Art',
        'Egyptian Art',
        'European Paintings',
        'Greek and Roman Art',
        'Medieval Art',
        'Modern and Contemporary Art',
      ],
      highlights: [
        'Washington Crossing the Delaware (Leutze)',
        'Temple of Dendur',
        'The Great Wave (Hokusai print)',
      ],
      totalWorks: 'Over 1.5 million works',
    },
    currentExhibitions: null,
    accessibility: {
      wheelchairAccess: true,
      audioGuide: true,
      ASLTours: true,
      verbalDescriptionTours: true,
      touchTours: true,
    },
    sourceUrls: ['https://www.metmuseum.org/visit'],
    confidence: 0.9,
    locale: 'en',
  },
];

// ────────────────────────────────────────────────────────────
// Main script
// ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await AppDataSource.initialize();
  console.log('Database connected.');

  // ── Seed artworks ──
  const artworkRepo = AppDataSource.getRepository(ArtworkKnowledge);
  const artworkResult = await artworkRepo
    .createQueryBuilder()
    .insert()
    .into(ArtworkKnowledge)
    .values(
      ARTWORKS.map((a) => ({
        title: a.title,
        artist: a.artist,
        period: a.period,
        technique: a.technique,
        description: a.description,
        historicalContext: a.historicalContext,
        dimensions: a.dimensions,
        currentLocation: a.currentLocation,
        sourceUrls: a.sourceUrls,
        confidence: a.confidence,
        needsReview: false,
        locale: a.locale,
      })),
    )
    .orIgnore() // ON CONFLICT DO NOTHING — safe to re-run
    .execute();

  const artworksInserted = artworkResult.identifiers.filter((id) => id?.id != null).length;
  const artworkTotal = await artworkRepo.count();
  console.log(
    `Artworks: seeded ${artworksInserted} new record(s) (${ARTWORKS.length} in seed list, ${artworkTotal} total in DB).`,
  );

  // ── Seed museum enrichments ──
  const enrichmentRepo = AppDataSource.getRepository(MuseumEnrichment);
  const enrichmentResult = await enrichmentRepo
    .createQueryBuilder()
    .insert()
    .into(MuseumEnrichment)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TypeORM _QueryDeepPartialEntity cannot represent nullable JSONB columns; safe in seed script
    .values(MUSEUM_ENRICHMENTS as any)
    .orIgnore() // ON CONFLICT DO NOTHING — safe to re-run
    .execute();

  const enrichmentsInserted = enrichmentResult.identifiers.filter((id) => id?.id != null).length;
  const enrichmentTotal = await enrichmentRepo.count();
  console.log(
    `Museum enrichments: seeded ${enrichmentsInserted} new record(s) (${MUSEUM_ENRICHMENTS.length} in seed list, ${enrichmentTotal} total in DB).`,
  );

  await AppDataSource.destroy();
  console.log('Done.');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
