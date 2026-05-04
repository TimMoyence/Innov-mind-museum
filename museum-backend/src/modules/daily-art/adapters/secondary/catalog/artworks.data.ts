/**
 * Curated list of 30 famous public-domain artworks for the Daily Art feature.
 * Images sourced from Wikimedia Commons.
 */
import type { Artwork } from '@modules/daily-art/domain/artwork/artwork.types';

const artworks: readonly Artwork[] = [
  {
    title: 'Mona Lisa',
    artist: 'Leonardo da Vinci',
    year: 'c. 1503-1519',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/800px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg',
    description:
      'A half-length portrait of a woman by Leonardo da Vinci, widely considered the most famous painting in the world.',
    funFact:
      'The Mona Lisa has her own mailbox at the Louvre because of all the love letters she receives.',
    museum: 'Louvre, Paris',
  },
  {
    title: 'The Starry Night',
    artist: 'Vincent van Gogh',
    year: '1889',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/1280px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
    description:
      'A swirling night sky over a village, painted while Van Gogh was staying at the Saint-Paul-de-Mausole asylum.',
    funFact:
      'Van Gogh painted The Starry Night from memory during the day, not while looking at the night sky.',
    museum: 'Museum of Modern Art (MoMA), New York',
  },
  {
    title: 'Girl with a Pearl Earring',
    artist: 'Johannes Vermeer',
    year: 'c. 1665',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/1665_Girl_with_a_Pearl_Earring.jpg/800px-1665_Girl_with_a_Pearl_Earring.jpg',
    description:
      'A tronie painting depicting a girl wearing an exotic dress and a large pearl earring.',
    funFact:
      'The pearl is likely not a real pearl but a polished piece of tin, as pearls that large did not exist.',
    museum: 'Mauritshuis, The Hague',
  },
  {
    title: 'The Scream',
    artist: 'Edvard Munch',
    year: '1893',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg/800px-Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg',
    description:
      'An iconic expressionist painting showing a figure with an agonized expression against a turbulent orange sky.',
    funFact:
      'Munch created four versions of The Scream using different media between 1893 and 1910.',
    museum: 'National Gallery, Oslo',
  },
  {
    title: 'Water Lilies',
    artist: 'Claude Monet',
    year: '1906',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Claude_Monet_-_Water_Lilies_-_1906%2C_Ryerson.jpg/1280px-Claude_Monet_-_Water_Lilies_-_1906%2C_Ryerson.jpg',
    description:
      "Part of a series of approximately 250 oil paintings depicting Monet's flower garden at Giverny.",
    funFact:
      'Monet had cataracts in his later years, which may have influenced the increasingly abstract style of his Water Lilies.',
    museum: "Musee de l'Orangerie, Paris",
  },
  {
    title: 'The Kiss',
    artist: 'Gustav Klimt',
    year: '1907-1908',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg/800px-The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg',
    description: 'A gold-leaf and oil painting depicting a couple embracing on a flowery meadow.',
    funFact:
      'Klimt used real gold leaf in this painting, inspired by Byzantine mosaics he saw in Ravenna, Italy.',
    museum: 'Belvedere, Vienna',
  },
  {
    title: 'Liberty Leading the People',
    artist: 'Eugene Delacroix',
    year: '1830',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Eug%C3%A8ne_Delacroix_-_Le_28_Juillet._La_Libert%C3%A9_guidant_le_peuple.jpg/1280px-Eug%C3%A8ne_Delacroix_-_Le_28_Juillet._La_Libert%C3%A9_guidant_le_peuple.jpg',
    description:
      'A painting commemorating the July Revolution of 1830, showing Marianne leading the people over barricades.',
    funFact:
      'Delacroix included himself in the painting as the man wearing a top hat to the left of Marianne.',
    museum: 'Louvre, Paris',
  },
  {
    title: 'The Birth of Venus',
    artist: 'Sandro Botticelli',
    year: 'c. 1484-1486',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg/1280px-Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg',
    description:
      'A mythological scene depicting the goddess Venus emerging from the sea as a fully grown woman.',
    funFact:
      "The painting was nearly destroyed by Savonarola's followers during the Bonfire of the Vanities in 1497.",
    museum: 'Uffizi Gallery, Florence',
  },
  {
    title: 'The Persistence of Memory',
    artist: 'Salvador Dali',
    year: '1931',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/en/d/dd/The_Persistence_of_Memory.jpg',
    description: 'A surrealist painting featuring melting pocket watches in a dreamlike landscape.',
    funFact:
      'Dali said the melting watches were inspired by the surrealist perception of a Camembert cheese melting in the sun.',
    museum: 'Museum of Modern Art (MoMA), New York',
  },
  {
    title: 'Guernica',
    artist: 'Pablo Picasso',
    year: '1937',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/en/7/74/Guernica.jpg',
    description:
      'A powerful anti-war painting responding to the bombing of the Basque town of Guernica during the Spanish Civil War.',
    funFact:
      'When a Nazi officer asked Picasso if he had done this, Picasso reportedly replied: "No, you did."',
    museum: 'Museo Reina Sofia, Madrid',
  },
  {
    title: 'The Great Wave off Kanagawa',
    artist: 'Katsushika Hokusai',
    year: 'c. 1831',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/1280px-Tsunami_by_hokusai_19th_century.jpg',
    description:
      'A woodblock print depicting a towering wave threatening boats off the coast of Kanagawa with Mount Fuji in the background.',
    funFact:
      'Hokusai was around 70 years old when he created this iconic print, part of his Thirty-six Views of Mount Fuji series.',
    museum: 'Metropolitan Museum of Art, New York (among others)',
  },
  {
    title: 'American Gothic',
    artist: 'Grant Wood',
    year: '1930',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Grant_Wood_-_American_Gothic_-_Google_Art_Project.jpg/800px-Grant_Wood_-_American_Gothic_-_Google_Art_Project.jpg',
    description:
      'A painting of a farmer and his daughter standing before a house with a Gothic window.',
    funFact:
      "The models were actually Wood's sister and his dentist, not a real farmer and daughter.",
    museum: 'Art Institute of Chicago',
  },
  {
    title: 'A Sunday on La Grande Jatte',
    artist: 'Georges Seurat',
    year: '1884-1886',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/A_Sunday_on_La_Grande_Jatte%2C_Georges_Seurat%2C_1884.jpg/1280px-A_Sunday_on_La_Grande_Jatte%2C_Georges_Seurat%2C_1884.jpg',
    description:
      'A pointillist masterpiece showing Parisians relaxing on an island in the Seine on a sunny afternoon.',
    funFact:
      'Seurat spent over two years painting this work, applying tiny dots of pure color side by side in a technique he called Chromoluminarism.',
    museum: 'Art Institute of Chicago',
  },
  {
    title: 'Nighthawks',
    artist: 'Edward Hopper',
    year: '1942',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Nighthawks_by_Edward_Hopper_1942.jpg/1280px-Nighthawks_by_Edward_Hopper_1942.jpg',
    description:
      'A painting of people sitting in a downtown diner late at night, capturing urban isolation.',
    funFact:
      'Despite its fame, the diner has no visible door, adding to the feeling of isolation and entrapment.',
    museum: 'Art Institute of Chicago',
  },
  {
    title: 'The Son of Man',
    artist: 'Rene Magritte',
    year: '1964',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/en/e/e5/Magritte_TheSonOfMan.jpg',
    description:
      'A surrealist self-portrait showing a man in a bowler hat with a green apple obscuring his face.',
    funFact:
      'Magritte said the apple represents "the visible that is hidden and the visible that is present," the conflict between what we see and what is concealed.',
    museum: 'Private collection',
  },
  {
    title: 'The Thinker',
    artist: 'Auguste Rodin',
    year: '1904',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Mus%C3%A9e_Rodin_1.jpg/800px-Mus%C3%A9e_Rodin_1.jpg',
    description:
      'A bronze sculpture of a nude male figure sitting on a rock, chin resting on his hand in deep thought.',
    funFact:
      'Originally called "The Poet," it was meant to represent Dante contemplating the circles of Hell for The Gates of Hell.',
    museum: 'Musee Rodin, Paris',
  },
  {
    title: 'Venus de Milo',
    artist: 'Alexandros of Antioch (attributed)',
    year: 'c. 130-100 BC',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Front_views_of_the_Venus_de_Milo.jpg/800px-Front_views_of_the_Venus_de_Milo.jpg',
    description:
      'An ancient Greek marble sculpture depicting Aphrodite, famous for its missing arms.',
    funFact:
      'When first discovered on the island of Milos in 1820, the statue still had its arms, which were lost during a skirmish as the French and Turks fought over the sculpture.',
    museum: 'Louvre, Paris',
  },
  {
    title: 'David',
    artist: 'Michelangelo',
    year: '1501-1504',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/%27David%27_by_Michelangelo_Fir_JBU002.jpg/800px-%27David%27_by_Michelangelo_Fir_JBU002.jpg',
    description:
      'A masterpiece of Renaissance sculpture depicting the Biblical hero David, carved from a single block of marble.',
    funFact:
      'The block of marble had been abandoned by two other sculptors before Michelangelo took it on at age 26.',
    museum: "Galleria dell'Accademia, Florence",
  },
  {
    title: 'Olympia',
    artist: 'Edouard Manet',
    year: '1863',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Edouard_Manet_-_Olympia_-_Google_Art_Project_3.jpg/1280px-Edouard_Manet_-_Olympia_-_Google_Art_Project_3.jpg',
    description:
      'A reclining nude that caused a scandal at the 1865 Paris Salon for its confrontational gaze and modern realism.',
    funFact:
      'The painting was so controversial that guards had to be posted to protect it from angry viewers at the Salon.',
    museum: "Musee d'Orsay, Paris",
  },
  {
    title: "Le Dejeuner sur l'herbe",
    artist: 'Edouard Manet',
    year: '1863',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Edouard_Manet_-_Luncheon_on_the_Grass_-_Google_Art_Project.jpg/1280px-Edouard_Manet_-_Luncheon_on_the_Grass_-_Google_Art_Project.jpg',
    description:
      'A painting depicting a nude woman casually lunching with two clothed men in a pastoral setting.',
    funFact:
      'The composition was directly inspired by a Renaissance engraving after Raphael, yet shocked audiences because it placed nudity in a contemporary setting.',
    museum: "Musee d'Orsay, Paris",
  },
  {
    title: 'The Night Watch',
    artist: 'Rembrandt van Rijn',
    year: '1642',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/The_Night_Watch_-_HD.jpg/1280px-The_Night_Watch_-_HD.jpg',
    description:
      'A grand militia group portrait famous for its dramatic use of light, shadow, and motion.',
    funFact:
      "The painting was trimmed on all four sides in 1715 to fit between two columns in Amsterdam's Town Hall, cutting off several figures.",
    museum: 'Rijksmuseum, Amsterdam',
  },
  {
    title: 'Self-Portrait with Thorn Necklace and Hummingbird',
    artist: 'Frida Kahlo',
    year: '1940',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/en/1/1e/Frida_Kahlo_%28self_portrait%29.jpg',
    description:
      'A self-portrait showing Kahlo with a thorn necklace, a dead hummingbird, and symbolic animals.',
    funFact:
      'Kahlo painted this shortly after her divorce from Diego Rivera; the thorns symbolize her pain and the hummingbird is a Mexican love charm.',
    museum: 'Harry Ransom Center, Austin',
  },
  {
    title: 'The Creation of Adam',
    artist: 'Michelangelo',
    year: 'c. 1512',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg/1280px-Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg',
    description:
      'A fresco on the Sistine Chapel ceiling showing God giving life to Adam through their near-touching fingers.',
    funFact:
      'Michelangelo painted the entire Sistine Chapel ceiling standing up, not lying on his back as commonly believed.',
    museum: 'Sistine Chapel, Vatican City',
  },
  {
    title: 'Las Meninas',
    artist: 'Diego Velazquez',
    year: '1656',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Las_Meninas%2C_by_Diego_Vel%C3%A1zquez%2C_from_Prado_in_Google_Earth.jpg/800px-Las_Meninas%2C_by_Diego_Vel%C3%A1zquez%2C_from_Prado_in_Google_Earth.jpg',
    description:
      'A complex scene showing the Infanta Margarita with her entourage, with Velazquez himself painting at a large canvas.',
    funFact:
      'Velazquez included a mirror in the background reflecting the King and Queen, making the viewer the subject being painted.',
    museum: 'Museo del Prado, Madrid',
  },
  {
    title: 'Impression, Sunrise',
    artist: 'Claude Monet',
    year: '1872',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Monet_-_Impression%2C_Sunrise.jpg/1280px-Monet_-_Impression%2C_Sunrise.jpg',
    description: 'A hazy harbor scene at Le Havre that gave the Impressionist movement its name.',
    funFact:
      'A critic used the title mockingly, calling the whole group "Impressionists" as an insult, but the artists adopted the name proudly.',
    museum: 'Musee Marmottan Monet, Paris',
  },
  {
    title: 'The Garden of Earthly Delights',
    artist: 'Hieronymus Bosch',
    year: 'c. 1490-1510',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/The_Garden_of_earthly_Delights_by_Bosch_High_Resolution_2.jpg/1280px-The_Garden_of_earthly_Delights_by_Bosch_High_Resolution_2.jpg',
    description:
      'A triptych depicting Eden, earthly pleasures, and Hell in fantastical and surreal detail.',
    funFact:
      'Scholars have spent centuries debating whether the painting is a moral warning or a celebration of pleasure; no consensus exists.',
    museum: 'Museo del Prado, Madrid',
  },
  {
    title: "Whistler's Mother",
    artist: 'James McNeill Whistler',
    year: '1871',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Whistlers_Mother_high_res.jpg/1280px-Whistlers_Mother_high_res.jpg',
    description:
      'Officially titled "Arrangement in Grey and Black No. 1," a portrait of the artist\'s mother seated in profile.',
    funFact:
      "Whistler's mother was only in the painting because the original model failed to show up for the sitting.",
    museum: "Musee d'Orsay, Paris",
  },
  {
    title: 'The Arnolfini Portrait',
    artist: 'Jan van Eyck',
    year: '1434',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Van_Eyck_-_Arnolfini_Portrait.jpg/800px-Van_Eyck_-_Arnolfini_Portrait.jpg',
    description:
      'A double portrait of Giovanni di Nicolao Arnolfini and his wife in their home in Bruges, rich in symbolism.',
    funFact:
      'Van Eyck signed the painting "Jan van Eyck was here" above the mirror, suggesting he was a witness to the scene rather than just the painter.',
    museum: 'National Gallery, London',
  },
  {
    title: 'Girl with a Red Hat',
    artist: 'Johannes Vermeer',
    year: 'c. 1665-1667',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Vermeer_-_Girl_with_a_Red_Hat.JPG/800px-Vermeer_-_Girl_with_a_Red_Hat.JPG',
    description:
      'A small, luminous painting of a young woman turning toward the viewer, wearing a striking red hat.',
    funFact:
      'This tiny painting (9 x 7 inches) is painted on a wooden panel rather than canvas, unusual for Vermeer, leading some scholars to debate its attribution.',
    museum: 'National Gallery of Art, Washington D.C.',
  },
  {
    title: 'Wanderer above the Sea of Fog',
    artist: 'Caspar David Friedrich',
    year: 'c. 1818',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg/800px-Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg',
    description:
      'A Romantic painting of a man standing on a rocky precipice overlooking a fog-filled landscape.',
    funFact:
      'The painting has become the quintessential image of Romanticism, yet almost nothing is known about who commissioned it or why.',
    museum: 'Hamburger Kunsthalle, Hamburg',
  },
] as const;

export { artworks };
