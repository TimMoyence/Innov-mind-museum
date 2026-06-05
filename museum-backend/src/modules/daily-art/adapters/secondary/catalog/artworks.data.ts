/* eslint-disable max-lines -- Justification: pure static data catalog (30 artworks × 8 localized funFact strings = inherently >600 lines after QA-08 localization). No logic, no false-positive alternative. Mirrors the project's max-lines:'off' policy for data/config files. Approved-by: QA-08 */
/**
 * Curated list of 30 famous public-domain artworks for the Daily Art feature.
 * Images sourced from Wikimedia Commons.
 *
 * `funFact` is localized for every supported locale (QA-08). `en` is the
 * canonical source; the other 7 are human-quality translations.
 */
import type { Artwork } from '@modules/daily-art/domain/artwork.types';

const artworks: readonly Artwork[] = [
  {
    title: 'Mona Lisa',
    artist: 'Leonardo da Vinci',
    year: 'c. 1503-1519',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/1280px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg',
    description:
      'A half-length portrait of a woman by Leonardo da Vinci, widely considered the most famous painting in the world.',
    funFact: {
      en: 'The Mona Lisa has her own mailbox at the Louvre because of all the love letters she receives.',
      fr: 'La Joconde possède sa propre boîte aux lettres au Louvre tant elle reçoit de lettres d’amour.',
      es: 'La Mona Lisa tiene su propio buzón en el Louvre por todas las cartas de amor que recibe.',
      de: 'Die Mona Lisa hat im Louvre ihren eigenen Briefkasten, weil sie so viele Liebesbriefe erhält.',
      it: 'La Gioconda ha una propria cassetta delle lettere al Louvre per via di tutte le lettere d’amore che riceve.',
      ja: 'モナ・リザは数えきれないほどの恋文が届くため、ルーヴル美術館に専用の郵便受けを持っています。',
      zh: '由于收到太多情书，《蒙娜丽莎》在卢浮宫拥有自己的专属信箱。',
      ar: 'تمتلك الموناليزا صندوق بريد خاصًا بها في متحف اللوفر بسبب كثرة رسائل الحب التي تتلقاها.',
    },
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
    funFact: {
      en: 'Van Gogh painted The Starry Night from memory during the day, not while looking at the night sky.',
      fr: 'Van Gogh a peint La Nuit étoilée de mémoire, en pleine journée, et non en observant le ciel nocturne.',
      es: 'Van Gogh pintó La noche estrellada de memoria durante el día, no mirando el cielo nocturno.',
      de: 'Van Gogh malte Die Sternennacht tagsüber aus der Erinnerung, nicht mit Blick auf den Nachthimmel.',
      it: 'Van Gogh dipinse Notte stellata a memoria di giorno, non osservando il cielo notturno.',
      ja: 'ゴッホは《星月夜》を夜空を見ながらではなく、昼間に記憶を頼りに描きました。',
      zh: '凡·高是在白天凭记忆画下《星月夜》的，而非对着夜空作画。',
      ar: 'رسم فان غوخ «ليلة النجوم» من الذاكرة في النهار، وليس أثناء النظر إلى سماء الليل.',
    },
    museum: 'Museum of Modern Art (MoMA), New York',
  },
  {
    title: 'Girl with a Pearl Earring',
    artist: 'Johannes Vermeer',
    year: 'c. 1665',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/1665_Girl_with_a_Pearl_Earring.jpg/1280px-1665_Girl_with_a_Pearl_Earring.jpg',
    description:
      'A tronie painting depicting a girl wearing an exotic dress and a large pearl earring.',
    funFact: {
      en: 'The pearl is likely not a real pearl but a polished piece of tin, as pearls that large did not exist.',
      fr: 'La perle n’est probablement pas une vraie perle mais un morceau d’étain poli, car des perles aussi grosses n’existaient pas.',
      es: 'La perla probablemente no sea real sino una pieza de estaño pulida, ya que no existían perlas tan grandes.',
      de: 'Die Perle ist vermutlich keine echte Perle, sondern poliertes Zinn, da es so große Perlen nicht gab.',
      it: 'La perla probabilmente non è vera ma un pezzo di stagno lucidato, poiché perle così grandi non esistevano.',
      ja: 'これほど大きな真珠は存在しなかったため、この真珠は本物ではなく磨かれた錫だと考えられています。',
      zh: '由于当时不存在如此巨大的珍珠，画中的珍珠很可能并非真珠，而是一块抛光的锡。',
      ar: 'على الأرجح أن اللؤلؤة ليست حقيقية بل قطعة قصدير مصقولة، إذ لم تكن توجد لآلئ بهذا الحجم.',
    },
    museum: 'Mauritshuis, The Hague',
  },
  {
    title: 'The Scream',
    artist: 'Edvard Munch',
    year: '1893',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg/1280px-Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg',
    description:
      'An iconic expressionist painting showing a figure with an agonized expression against a turbulent orange sky.',
    funFact: {
      en: 'Munch created four versions of The Scream using different media between 1893 and 1910.',
      fr: 'Munch a réalisé quatre versions du Cri avec des techniques différentes entre 1893 et 1910.',
      es: 'Munch creó cuatro versiones de El grito con distintas técnicas entre 1893 y 1910.',
      de: 'Munch schuf zwischen 1893 und 1910 vier Versionen von Der Schrei mit verschiedenen Techniken.',
      it: 'Munch realizzò quattro versioni de L’urlo con tecniche diverse tra il 1893 e il 1910.',
      ja: 'ムンクは1893年から1910年にかけて、異なる画材で《叫び》を4つのバージョン制作しました。',
      zh: '蒙克在1893年至1910年间用不同的媒材创作了四个版本的《呐喊》。',
      ar: 'أبدع مونك أربع نسخ من «الصرخة» باستخدام وسائط مختلفة بين عامي 1893 و1910.',
    },
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
    funFact: {
      en: 'Monet had cataracts in his later years, which may have influenced the increasingly abstract style of his Water Lilies.',
      fr: 'Monet souffrait de cataracte vers la fin de sa vie, ce qui a peut-être influencé le style de plus en plus abstrait de ses Nymphéas.',
      es: 'Monet tuvo cataratas en sus últimos años, lo que pudo influir en el estilo cada vez más abstracto de sus Nenúfares.',
      de: 'Monet litt in späteren Jahren an Grauem Star, was den zunehmend abstrakten Stil seiner Seerosen beeinflusst haben könnte.',
      it: 'Negli ultimi anni Monet soffriva di cataratta, fatto che potrebbe aver influenzato lo stile sempre più astratto delle sue Ninfee.',
      ja: 'モネは晩年に白内障を患っており、それが《睡蓮》のますます抽象的な作風に影響したと考えられています。',
      zh: '莫奈晚年患有白内障，这或许影响了他《睡莲》系列愈发抽象的风格。',
      ar: 'أصيب مونيه بإعتام عدسة العين في سنواته الأخيرة، وربما أثّر ذلك في الأسلوب المتزايد التجريد في لوحات «زنابق الماء».',
    },
    museum: "Musee de l'Orangerie, Paris",
  },
  {
    title: 'The Kiss',
    artist: 'Gustav Klimt',
    year: '1907-1908',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg/1280px-The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg',
    description: 'A gold-leaf and oil painting depicting a couple embracing on a flowery meadow.',
    funFact: {
      en: 'Klimt used real gold leaf in this painting, inspired by Byzantine mosaics he saw in Ravenna, Italy.',
      fr: 'Klimt a utilisé de véritables feuilles d’or dans ce tableau, inspiré par les mosaïques byzantines vues à Ravenne, en Italie.',
      es: 'Klimt empleó pan de oro auténtico en esta pintura, inspirado por los mosaicos bizantinos que vio en Rávena, Italia.',
      de: 'Klimt verwendete in diesem Gemälde echtes Blattgold, inspiriert von byzantinischen Mosaiken, die er in Ravenna in Italien sah.',
      it: 'Klimt usò vera foglia d’oro in questo dipinto, ispirato dai mosaici bizantini visti a Ravenna, in Italia.',
      ja: 'クリムトはイタリアのラヴェンナで見たビザンチン様式のモザイクに着想を得て、この絵に本物の金箔を用いました。',
      zh: '克里姆特受到他在意大利拉文纳所见拜占庭马赛克的启发，在这幅画中使用了真正的金箔。',
      ar: 'استخدم كليمت أوراق ذهب حقيقية في هذه اللوحة، مستلهمًا من الفسيفساء البيزنطية التي شاهدها في رافينا بإيطاليا.',
    },
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
    funFact: {
      en: 'Delacroix included himself in the painting as the man wearing a top hat to the left of Marianne.',
      fr: 'Delacroix s’est représenté dans le tableau sous les traits de l’homme au haut-de-forme à gauche de Marianne.',
      es: 'Delacroix se incluyó a sí mismo en el cuadro como el hombre con sombrero de copa a la izquierda de Marianne.',
      de: 'Delacroix stellte sich selbst im Gemälde als den Mann mit Zylinder links neben Marianne dar.',
      it: 'Delacroix si raffigurò nel dipinto come l’uomo con il cilindro alla sinistra di Marianna.',
      ja: 'ドラクロワは、マリアンヌの左側にいるシルクハットの男として自身をこの絵に描き込みました。',
      zh: '德拉克罗瓦把自己也画进了作品中，即玛丽安娜左侧那位戴礼帽的男子。',
      ar: 'صوّر دولاكروا نفسه في اللوحة كالرجل الذي يرتدي قبعة عالية على يسار ماريان.',
    },
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
    funFact: {
      en: "The painting was nearly destroyed by Savonarola's followers during the Bonfire of the Vanities in 1497.",
      fr: 'Le tableau a failli être détruit par les partisans de Savonarole lors du Bûcher des vanités en 1497.',
      es: 'La pintura estuvo a punto de ser destruida por los seguidores de Savonarola durante la Hoguera de las vanidades en 1497.',
      de: 'Das Gemälde wäre 1497 beim Fegefeuer der Eitelkeiten beinahe von Savonarolas Anhängern zerstört worden.',
      it: 'Il dipinto rischiò di essere distrutto dai seguaci di Savonarola durante il Falò delle vanità del 1497.',
      ja: 'この絵は1497年の「虚栄の焼却」の際、サヴォナローラの信奉者によって危うく破壊されかけました。',
      zh: '这幅画在1497年的「虚荣之火」中险些被萨佛纳罗拉的追随者焚毁。',
      ar: 'كادت اللوحة أن تُدمَّر على يد أتباع سافونارولا خلال «محرقة الغرور» عام 1497.',
    },
    museum: 'Uffizi Gallery, Florence',
  },
  {
    title: 'Lady with an Ermine',
    artist: 'Leonardo da Vinci',
    year: 'c. 1489-1491',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Lady_with_an_Ermine_-_Leonardo_da_Vinci_%28adjusted_levels%29.jpg/1280px-Lady_with_an_Ermine_-_Leonardo_da_Vinci_%28adjusted_levels%29.jpg',
    description:
      'A portrait of Cecilia Gallerani, mistress of the Duke of Milan, holding a white ermine.',
    funFact: {
      en: 'The ermine is a symbol of purity and also a pun on Cecilia\'s surname: the Greek word for ermine, "galé," echoes Gallerani.',
      fr: 'L’hermine symbolise la pureté et fait aussi un jeu de mots sur le nom de Cecilia : le mot grec pour hermine, « galé », évoque Gallerani.',
      es: 'El armiño simboliza la pureza y es además un juego de palabras con el apellido de Cecilia: la palabra griega para armiño, «galé», recuerda a Gallerani.',
      de: 'Das Hermelin symbolisiert Reinheit und ist zugleich ein Wortspiel mit Cecilias Nachnamen: Das griechische Wort für Hermelin, „galé“, klingt nach Gallerani.',
      it: 'L’ermellino simboleggia la purezza ed è anche un gioco di parole sul cognome di Cecilia: la parola greca per ermellino, «galé», richiama Gallerani.',
      ja: 'オコジョは純潔の象徴であると同時に、チェチリアの姓を踏まえた言葉遊びでもあります。オコジョを意味するギリシャ語「galé」がガッレラーニを連想させるのです。',
      zh: '白貂象征纯洁，同时也是对切奇莉亚姓氏的双关：希腊语中「白貂」一词「galé」与盖莱拉尼（Gallerani）谐音。',
      ar: 'القاقم رمز للنقاء وهو أيضًا تورية على لقب تشيتشيليا: فالكلمة اليونانية للقاقم «galé» تشبه في وقعها اسم غاليراني.',
    },
    museum: 'Czartoryski Museum, Krakow',
  },
  {
    title: 'The Hay Wain',
    artist: 'John Constable',
    year: '1821',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/John_Constable_The_Hay_Wain.jpg/1280px-John_Constable_The_Hay_Wain.jpg',
    description:
      "A pastoral scene of a hay wagon crossing the River Stour, depicting rural Suffolk near Constable's childhood home.",
    funFact: {
      en: 'Largely ignored in England, the painting won a gold medal at the 1824 Paris Salon and deeply influenced French painters like Delacroix.',
      fr: 'Largement ignoré en Angleterre, le tableau a remporté une médaille d’or au Salon de Paris de 1824 et a profondément influencé des peintres français comme Delacroix.',
      es: 'Ignorado en gran medida en Inglaterra, el cuadro ganó una medalla de oro en el Salón de París de 1824 e influyó profundamente en pintores franceses como Delacroix.',
      de: 'In England weitgehend unbeachtet, gewann das Gemälde 1824 im Pariser Salon eine Goldmedaille und beeinflusste französische Maler wie Delacroix tiefgreifend.',
      it: 'Largamente ignorato in Inghilterra, il dipinto vinse una medaglia d’oro al Salon di Parigi del 1824 e influenzò profondamente pittori francesi come Delacroix.',
      ja: 'イギリスではほとんど顧みられなかったこの絵は、1824年のパリ・サロンで金賞を受賞し、ドラクロワらフランスの画家に大きな影響を与えました。',
      zh: '这幅画在英国几乎无人问津，却在1824年的巴黎沙龙上荣获金奖，并深深影响了德拉克罗瓦等法国画家。',
      ar: 'رغم تجاهلها إلى حد كبير في إنجلترا، فازت اللوحة بميدالية ذهبية في صالون باريس عام 1824 وأثّرت بعمق في رسامين فرنسيين مثل دولاكروا.',
    },
    museum: 'National Gallery, London',
  },
  {
    title: 'The Great Wave off Kanagawa',
    artist: 'Katsushika Hokusai',
    year: 'c. 1831',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/1280px-Tsunami_by_hokusai_19th_century.jpg',
    description:
      'A woodblock print depicting a towering wave threatening boats off the coast of Kanagawa with Mount Fuji in the background.',
    funFact: {
      en: 'Hokusai was around 70 years old when he created this iconic print, part of his Thirty-six Views of Mount Fuji series.',
      fr: 'Hokusai avait environ 70 ans lorsqu’il a créé cette estampe emblématique, issue de sa série Trente-six vues du mont Fuji.',
      es: 'Hokusai tenía unos 70 años cuando creó este grabado emblemático, parte de su serie Treinta y seis vistas del monte Fuji.',
      de: 'Hokusai war etwa 70 Jahre alt, als er diesen ikonischen Druck schuf, Teil seiner Serie Sechsunddreißig Ansichten des Berges Fuji.',
      it: 'Hokusai aveva circa 70 anni quando creò questa stampa iconica, parte della serie Trentasei vedute del monte Fuji.',
      ja: '北斎がこの象徴的な版画を制作したのは70歳ごろで、《富嶽三十六景》の一図として描かれました。',
      zh: '北斋创作这幅标志性版画时已约70岁，它是其《富岳三十六景》系列之一。',
      ar: 'كان هوكوساي في نحو السبعين من عمره حين أبدع هذه المطبوعة الأيقونية، وهي جزء من سلسلته «ست وثلاثون منظرًا لجبل فوجي».',
    },
    museum: 'Metropolitan Museum of Art, New York (among others)',
  },
  {
    title: 'American Gothic',
    artist: 'Grant Wood',
    year: '1930',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Grant_Wood_-_American_Gothic_-_Google_Art_Project.jpg/1280px-Grant_Wood_-_American_Gothic_-_Google_Art_Project.jpg',
    description:
      'A painting of a farmer and his daughter standing before a house with a Gothic window.',
    funFact: {
      en: "The models were actually Wood's sister and his dentist, not a real farmer and daughter.",
      fr: 'Les modèles étaient en réalité la sœur de Wood et son dentiste, et non un véritable fermier et sa fille.',
      es: 'Los modelos eran en realidad la hermana de Wood y su dentista, no un granjero y su hija reales.',
      de: 'Die Modelle waren in Wirklichkeit Woods Schwester und sein Zahnarzt, nicht ein echter Farmer und seine Tochter.',
      it: 'I modelli erano in realtà la sorella di Wood e il suo dentista, non un vero contadino e sua figlia.',
      ja: 'モデルは実在の農夫と娘ではなく、ウッドの妹と彼の歯科医でした。',
      zh: '画中模特其实是伍德的妹妹和他的牙医，而非真正的农夫与女儿。',
      ar: 'كان النموذجان في الحقيقة شقيقة وود وطبيب أسنانه، وليسا مزارعًا وابنته حقيقيين.',
    },
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
    funFact: {
      en: 'Seurat spent over two years painting this work, applying tiny dots of pure color side by side in a technique he called Chromoluminarism.',
      fr: 'Seurat a passé plus de deux ans à peindre cette œuvre, appliquant de minuscules points de couleur pure côte à côte selon une technique qu’il nommait le chromoluminarisme.',
      es: 'Seurat dedicó más de dos años a esta obra, aplicando diminutos puntos de color puro uno junto a otro mediante una técnica que llamó cromoluminarismo.',
      de: 'Seurat malte über zwei Jahre an diesem Werk und setzte winzige Punkte reiner Farbe nebeneinander – eine Technik, die er Chromoluminarismus nannte.',
      it: 'Seurat impiegò oltre due anni per dipingere quest’opera, accostando minuscoli punti di colore puro con una tecnica che chiamò cromoluminarismo.',
      ja: 'スーラはこの作品の制作に2年以上を費やし、純色の小さな点を並べる「色彩光学主義」と呼ぶ技法を用いました。',
      zh: '修拉花了两年多创作这幅作品，运用他称之为「色光主义」的技法，将纯色的细小点并置排列。',
      ar: 'أمضى سورا أكثر من عامين في رسم هذا العمل، واضعًا نقاطًا صغيرة من اللون النقي جنبًا إلى جنب بتقنية أسماها «التلوين الضوئي».',
    },
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
    funFact: {
      en: 'Despite its fame, the diner has no visible door, adding to the feeling of isolation and entrapment.',
      fr: 'Malgré sa célébrité, le diner ne comporte aucune porte visible, ce qui renforce le sentiment d’isolement et d’enfermement.',
      es: 'A pesar de su fama, el restaurante no tiene una puerta visible, lo que acentúa la sensación de aislamiento y encierro.',
      de: 'Trotz seiner Berühmtheit hat das Lokal keine sichtbare Tür, was das Gefühl von Isolation und Gefangenschaft verstärkt.',
      it: 'Nonostante la sua fama, il locale non ha una porta visibile, accentuando il senso di isolamento e di prigionia.',
      ja: '有名なこの絵のダイナーには見える出入り口がなく、孤立感と閉塞感を一層強めています。',
      zh: '尽管声名远播，画中餐馆却没有可见的门，更增添了孤立与被困的感觉。',
      ar: 'رغم شهرته، لا يحتوي المطعم على باب ظاهر، ما يضاعف الإحساس بالعزلة والانحباس.',
    },
    museum: 'Art Institute of Chicago',
  },
  {
    title: 'The Fighting Temeraire',
    artist: 'J. M. W. Turner',
    year: '1839',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/The_Fighting_Temeraire%2C_JMW_Turner%2C_National_Gallery.jpg/1280px-The_Fighting_Temeraire%2C_JMW_Turner%2C_National_Gallery.jpg',
    description:
      'A veteran warship of the Battle of Trafalgar being towed by a steam tug to its final berth to be broken up, set against a blazing sunset.',
    funFact: {
      en: 'Turner refused to ever sell the painting, calling it his "darling," and bequeathed it to the British nation in 1851.',
      fr: 'Turner a toujours refusé de vendre ce tableau, qu’il appelait son « chéri », et l’a légué à la nation britannique en 1851.',
      es: 'Turner se negó siempre a vender el cuadro, al que llamaba su «favorito», y lo legó a la nación británica en 1851.',
      de: 'Turner weigerte sich stets, das Gemälde zu verkaufen – er nannte es seinen „Liebling“ – und vermachte es 1851 der britischen Nation.',
      it: 'Turner si rifiutò sempre di vendere il dipinto, che chiamava il suo «tesoro», e lo lasciò in eredità alla nazione britannica nel 1851.',
      ja: 'ターナーはこの絵を「最愛の一枚」と呼んで決して手放そうとせず、1851年に英国民へ遺贈しました。',
      zh: '透纳始终拒绝出售这幅他称为「心爱之作」的画，并于1851年将其遗赠给英国国家。',
      ar: 'رفض تيرنر بيع اللوحة على الدوام، واصفًا إياها بأنها «حبيبته»، وأوصى بها للأمة البريطانية عام 1851.',
    },
    museum: 'National Gallery, London',
  },
  {
    title: 'The Thinker',
    artist: 'Auguste Rodin',
    year: '1904',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Mus%C3%A9e_Rodin_1.jpg/1280px-Mus%C3%A9e_Rodin_1.jpg',
    description:
      'A bronze sculpture of a nude male figure sitting on a rock, chin resting on his hand in deep thought.',
    funFact: {
      en: 'Originally called "The Poet," it was meant to represent Dante contemplating the circles of Hell for The Gates of Hell.',
      fr: 'Intitulée à l’origine « Le Poète », l’œuvre devait représenter Dante contemplant les cercles de l’Enfer pour La Porte de l’Enfer.',
      es: 'Llamada originalmente «El poeta», debía representar a Dante contemplando los círculos del Infierno para La puerta del Infierno.',
      de: 'Ursprünglich „Der Dichter“ genannt, sollte sie Dante darstellen, der für Das Höllentor über die Höllenkreise sinnt.',
      it: 'In origine chiamata «Il poeta», doveva rappresentare Dante che contempla i gironi dell’Inferno per La porta dell’Inferno.',
      ja: '当初は「詩人」と呼ばれ、《地獄の門》のためにダンテが地獄の輪を見つめる姿を表すものでした。',
      zh: '该作最初名为「诗人」，本意是表现但丁为《地狱之门》凝望地狱诸层的情景。',
      ar: 'كان اسمها في الأصل «الشاعر»، وكان المقصود أن تمثّل دانتي وهو يتأمل دوائر الجحيم من أجل «باب الجحيم».',
    },
    museum: 'Musee Rodin, Paris',
  },
  {
    title: 'Venus de Milo',
    artist: 'Alexandros of Antioch (attributed)',
    year: 'c. 130-100 BC',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Front_views_of_the_Venus_de_Milo.jpg/1280px-Front_views_of_the_Venus_de_Milo.jpg',
    description:
      'An ancient Greek marble sculpture depicting Aphrodite, famous for its missing arms.',
    funFact: {
      en: 'When first discovered on the island of Milos in 1820, the statue still had its arms, which were lost during a skirmish as the French and Turks fought over the sculpture.',
      fr: 'Lors de sa découverte sur l’île de Milos en 1820, la statue avait encore ses bras, perdus au cours d’une échauffourée entre Français et Turcs se disputant la sculpture.',
      es: 'Cuando se descubrió en la isla de Milos en 1820, la estatua aún conservaba los brazos, que se perdieron durante una refriega entre franceses y turcos que se disputaban la escultura.',
      de: 'Als die Statue 1820 auf der Insel Milos entdeckt wurde, besaß sie noch ihre Arme, die bei einem Gerangel zwischen Franzosen und Türken um die Skulptur verloren gingen.',
      it: 'Quando fu scoperta sull’isola di Milo nel 1820, la statua aveva ancora le braccia, perdute durante una zuffa tra francesi e turchi che si contendevano la scultura.',
      ja: '1820年にミロス島で発見された当時、像にはまだ両腕がありましたが、彫像をめぐるフランス人とトルコ人の小競り合いの最中に失われました。',
      zh: '1820年在米洛斯岛被发现时，雕像仍带有双臂，后在法国人与土耳其人争夺这件雕塑的混战中遗失。',
      ar: 'حين اكتُشف التمثال لأول مرة في جزيرة ميلوس عام 1820 كان لا يزال يحتفظ بذراعيه، اللتين فُقدتا في مناوشة بين الفرنسيين والأتراك أثناء تنازعهم على المنحوتة.',
    },
    museum: 'Louvre, Paris',
  },
  {
    title: 'David',
    artist: 'Michelangelo',
    year: '1501-1504',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/%27David%27_by_Michelangelo_Fir_JBU002.jpg/1280px-%27David%27_by_Michelangelo_Fir_JBU002.jpg',
    description:
      'A masterpiece of Renaissance sculpture depicting the Biblical hero David, carved from a single block of marble.',
    funFact: {
      en: 'The block of marble had been abandoned by two other sculptors before Michelangelo took it on at age 26.',
      fr: 'Le bloc de marbre avait été abandonné par deux autres sculpteurs avant que Michel-Ange ne s’en empare à 26 ans.',
      es: 'El bloque de mármol había sido abandonado por otros dos escultores antes de que Miguel Ángel lo asumiera a los 26 años.',
      de: 'Der Marmorblock war bereits von zwei anderen Bildhauern aufgegeben worden, bevor Michelangelo ihn mit 26 Jahren übernahm.',
      it: 'Il blocco di marmo era stato abbandonato da altri due scultori prima che Michelangelo, a 26 anni, lo prendesse in carico.',
      ja: 'この大理石の塊は他の2人の彫刻家に放棄された後、26歳のミケランジェロが引き受けました。',
      zh: '这块大理石曾被另外两位雕塑家放弃，后由26岁的米开朗基罗接手。',
      ar: 'كانت كتلة الرخام قد تخلّى عنها نحّاتان آخران قبل أن يتولّاها مايكل أنجلو وهو في السادسة والعشرين من عمره.',
    },
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
    funFact: {
      en: 'The painting was so controversial that guards had to be posted to protect it from angry viewers at the Salon.',
      fr: 'Le tableau a tellement fait scandale qu’il a fallu poster des gardes pour le protéger des visiteurs furieux au Salon.',
      es: 'La pintura fue tan polémica que hubo que apostar guardias para protegerla de los espectadores furiosos en el Salón.',
      de: 'Das Gemälde war so umstritten, dass Wachen aufgestellt werden mussten, um es im Salon vor wütenden Besuchern zu schützen.',
      it: 'Il dipinto fu così controverso che si dovettero appostare guardie per proteggerlo dai visitatori inferociti al Salon.',
      ja: 'この絵はあまりに物議を醸し、サロンでは激怒した観客から守るために警備員を配置せざるを得ませんでした。',
      zh: '这幅画极具争议，以至于沙龙不得不派警卫保护它免遭愤怒观众的破坏。',
      ar: 'أثارت اللوحة جدلًا بالغًا حتى اضطُرّ المنظمون لوضع حُرّاس لحمايتها من الزوار الغاضبين في الصالون.',
    },
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
    funFact: {
      en: 'The composition was directly inspired by a Renaissance engraving after Raphael, yet shocked audiences because it placed nudity in a contemporary setting.',
      fr: 'La composition s’inspirait directement d’une gravure de la Renaissance d’après Raphaël, mais elle a choqué le public en plaçant la nudité dans un cadre contemporain.',
      es: 'La composición se inspiraba directamente en un grabado renacentista a partir de Rafael, pero escandalizó al público al situar el desnudo en un entorno contemporáneo.',
      de: 'Die Komposition war direkt von einem Renaissance-Stich nach Raffael inspiriert, schockierte das Publikum jedoch, weil sie die Nacktheit in einen zeitgenössischen Rahmen setzte.',
      it: 'La composizione si ispirava direttamente a un’incisione rinascimentale tratta da Raffaello, ma scandalizzò il pubblico perché collocava la nudità in un contesto contemporaneo.',
      ja: '構図はラファエロに基づくルネサンス期の版画から直接着想を得ていましたが、裸体を同時代の場面に置いたために観客に衝撃を与えました。',
      zh: '该构图直接取自一幅源于拉斐尔的文艺复兴版画，却因将裸体置于当代场景而震惊了观众。',
      ar: 'استُلهم التكوين مباشرة من نقش عصر النهضة مأخوذ عن رفائيل، لكنه صدم الجمهور لأنه وضع العُري في سياق معاصر.',
    },
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
    funFact: {
      en: "The painting was trimmed on all four sides in 1715 to fit between two columns in Amsterdam's Town Hall, cutting off several figures.",
      fr: 'Le tableau a été rogné sur ses quatre côtés en 1715 pour tenir entre deux colonnes de l’hôtel de ville d’Amsterdam, supprimant plusieurs personnages.',
      es: 'En 1715 el cuadro fue recortado por sus cuatro lados para caber entre dos columnas del Ayuntamiento de Ámsterdam, eliminando varias figuras.',
      de: 'Das Gemälde wurde 1715 an allen vier Seiten beschnitten, um zwischen zwei Säulen im Amsterdamer Rathaus zu passen, wobei mehrere Figuren wegfielen.',
      it: 'Nel 1715 il dipinto fu tagliato su tutti e quattro i lati per entrare tra due colonne del municipio di Amsterdam, eliminando diverse figure.',
      ja: '1715年、アムステルダム市庁舎の2本の柱の間に収めるため絵は四辺すべてが切り取られ、複数の人物が失われました。',
      zh: '1715年，为了让画作能容于阿姆斯特丹市政厅的两根柱子之间，四边均被裁切，几个人物因此被剪掉。',
      ar: 'في عام 1715 قُصّت اللوحة من جوانبها الأربعة لتلائم المساحة بين عمودين في دار بلدية أمستردام، فحُذفت عدة شخصيات.',
    },
    museum: 'Rijksmuseum, Amsterdam',
  },
  {
    title: 'Ophelia',
    artist: 'John Everett Millais',
    year: '1851-1852',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Millais_-_Ophelia.jpg/1280px-Millais_-_Ophelia.jpg',
    description:
      "A Pre-Raphaelite painting of Shakespeare's Ophelia singing as she drowns in a stream, surrounded by meticulously detailed flowers.",
    funFact: {
      en: 'The model, Elizabeth Siddal, posed in a bathtub of water for hours; the lamps warming it went out and she caught a severe cold.',
      fr: 'Le modèle, Elizabeth Siddal, a posé des heures dans une baignoire remplie d’eau ; les lampes qui la chauffaient se sont éteintes et elle a attrapé un gros rhume.',
      es: 'La modelo, Elizabeth Siddal, posó durante horas en una bañera con agua; las lámparas que la calentaban se apagaron y cogió un fuerte resfriado.',
      de: 'Das Modell Elizabeth Siddal lag stundenlang in einer mit Wasser gefüllten Badewanne; die wärmenden Lampen erloschen und sie zog sich eine schwere Erkältung zu.',
      it: 'La modella, Elizabeth Siddal, posò per ore in una vasca piena d’acqua; le lampade che la riscaldavano si spensero e prese un forte raffreddore.',
      ja: 'モデルのエリザベス・シダルは水を張った浴槽に何時間も横たわりました。浴槽を温めていたランプが消え、彼女はひどい風邪をひいてしまいました。',
      zh: '模特伊丽莎白·西达尔在盛满水的浴缸里摆姿势数小时；加热浴缸的灯熄灭后，她患上了重感冒。',
      ar: 'وقفت العارضة إليزابيث سيدال للرسم ساعات طويلة في حوض مملوء بالماء؛ وانطفأت المصابيح التي كانت تدفئه فأُصيبت بزكام شديد.',
    },
    museum: 'Tate Britain, London',
  },
  {
    title: 'The Creation of Adam',
    artist: 'Michelangelo',
    year: 'c. 1512',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg/1280px-Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg',
    description:
      'A fresco on the Sistine Chapel ceiling showing God giving life to Adam through their near-touching fingers.',
    funFact: {
      en: 'Michelangelo painted the entire Sistine Chapel ceiling standing up, not lying on his back as commonly believed.',
      fr: 'Michel-Ange a peint tout le plafond de la chapelle Sixtine debout, et non allongé sur le dos comme on le croit souvent.',
      es: 'Miguel Ángel pintó todo el techo de la Capilla Sixtina de pie, no tumbado de espaldas como se cree comúnmente.',
      de: 'Michelangelo malte die gesamte Decke der Sixtinischen Kapelle im Stehen, nicht auf dem Rücken liegend, wie oft angenommen wird.',
      it: 'Michelangelo dipinse tutto il soffitto della Cappella Sistina in piedi, non sdraiato sulla schiena come si crede comunemente.',
      ja: 'ミケランジェロは、よく信じられているように仰向けに寝てではなく、立ったままシスティーナ礼拝堂の天井すべてを描きました。',
      zh: '米开朗基罗是站着画完整座西斯廷礼拜堂天顶的，并非如人们普遍以为的那样仰躺作画。',
      ar: 'رسم مايكل أنجلو سقف كنيسة سيستينا بأكمله وهو واقف، لا مستلقيًا على ظهره كما يُعتقَد عادة.',
    },
    museum: 'Sistine Chapel, Vatican City',
  },
  {
    title: 'Las Meninas',
    artist: 'Diego Velazquez',
    year: '1656',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Las_Meninas%2C_by_Diego_Vel%C3%A1zquez%2C_from_Prado_in_Google_Earth.jpg/1280px-Las_Meninas%2C_by_Diego_Vel%C3%A1zquez%2C_from_Prado_in_Google_Earth.jpg',
    description:
      'A complex scene showing the Infanta Margarita with her entourage, with Velazquez himself painting at a large canvas.',
    funFact: {
      en: 'Velazquez included a mirror in the background reflecting the King and Queen, making the viewer the subject being painted.',
      fr: 'Velázquez a placé en arrière-plan un miroir reflétant le roi et la reine, faisant du spectateur le sujet en train d’être peint.',
      es: 'Velázquez incluyó al fondo un espejo que refleja al rey y a la reina, convirtiendo al espectador en el sujeto retratado.',
      de: 'Velázquez fügte im Hintergrund einen Spiegel ein, der König und Königin zeigt, wodurch der Betrachter zum gemalten Modell wird.',
      it: 'Velázquez inserì sullo sfondo uno specchio che riflette il re e la regina, rendendo lo spettatore il soggetto ritratto.',
      ja: 'ベラスケスは背景に国王夫妻を映す鏡を描き込み、鑑賞者をまさに描かれている対象に変えました。',
      zh: '委拉斯开兹在背景里安排了一面映出国王与王后的镜子，使观者成为正被描绘的对象。',
      ar: 'أدرج فيلاثكيث في الخلفية مرآة تعكس الملك والملكة، فجعل المشاهد هو الموضوع الذي يُرسَم.',
    },
    museum: 'Museo del Prado, Madrid',
  },
  {
    title: 'Impression, Sunrise',
    artist: 'Claude Monet',
    year: '1872',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Monet_-_Impression%2C_Sunrise.jpg/1280px-Monet_-_Impression%2C_Sunrise.jpg',
    description: 'A hazy harbor scene at Le Havre that gave the Impressionist movement its name.',
    funFact: {
      en: 'A critic used the title mockingly, calling the whole group "Impressionists" as an insult, but the artists adopted the name proudly.',
      fr: 'Un critique a repris le titre par dérision, qualifiant tout le groupe d’« impressionnistes » comme une insulte, mais les artistes ont adopté ce nom avec fierté.',
      es: 'Un crítico usó el título con burla, llamando a todo el grupo «impresionistas» como insulto, pero los artistas adoptaron el nombre con orgullo.',
      de: 'Ein Kritiker griff den Titel spöttisch auf und nannte die ganze Gruppe als Beleidigung „Impressionisten“ – doch die Künstler übernahmen den Namen voller Stolz.',
      it: 'Un critico riprese il titolo in tono di scherno, chiamando l’intero gruppo «impressionisti» come un insulto, ma gli artisti adottarono il nome con orgoglio.',
      ja: 'ある批評家がこの題名を揶揄して一団全体を侮辱的に「印象派」と呼びましたが、画家たちはその名を誇りをもって受け入れました。',
      zh: '一位评论家以此画名讥讽，把整个团体蔑称为「印象派」，画家们却自豪地接受了这个名字。',
      ar: 'استخدم أحد النقّاد العنوان للسخرية، واصفًا المجموعة كلها بـ«الانطباعيين» على سبيل الإهانة، لكن الفنانين تبنّوا الاسم بفخر.',
    },
    museum: 'Musee Marmottan Monet, Paris',
  },
  {
    title: 'The Garden of Earthly Delights',
    artist: 'Hieronymus Bosch',
    year: 'c. 1490-1510',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/The_Garden_of_earthly_delights.jpg/1280px-The_Garden_of_earthly_delights.jpg',
    description:
      'A triptych depicting Eden, earthly pleasures, and Hell in fantastical and surreal detail.',
    funFact: {
      en: 'Scholars have spent centuries debating whether the painting is a moral warning or a celebration of pleasure; no consensus exists.',
      fr: 'Les spécialistes débattent depuis des siècles pour savoir si l’œuvre est une mise en garde morale ou une célébration du plaisir ; aucun consensus n’existe.',
      es: 'Los estudiosos llevan siglos debatiendo si la obra es una advertencia moral o una celebración del placer; no hay consenso.',
      de: 'Gelehrte streiten seit Jahrhunderten, ob das Gemälde eine moralische Warnung oder eine Feier der Lust ist; es gibt keinen Konsens.',
      it: 'Gli studiosi dibattono da secoli se l’opera sia un monito morale o una celebrazione del piacere; non esiste un consenso.',
      ja: 'この絵が道徳的な戒めなのか快楽の称賛なのか、研究者たちは何世紀も議論を続けており、いまだ定説はありません。',
      zh: '数百年来，学者们一直争论这幅画究竟是道德警示还是对欢愉的礼赞，至今未有定论。',
      ar: 'ظل الباحثون قرونًا يتجادلون حول ما إذا كانت اللوحة تحذيرًا أخلاقيًا أم احتفاءً بالمتعة؛ ولا يوجد إجماع حتى الآن.',
    },
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
    funFact: {
      en: "Whistler's mother was only in the painting because the original model failed to show up for the sitting.",
      fr: 'La mère de Whistler n’a posé que parce que le modèle prévu ne s’est pas présenté à la séance.',
      es: 'La madre de Whistler solo aparece en el cuadro porque la modelo original no se presentó a la sesión.',
      de: 'Whistlers Mutter war nur deshalb auf dem Gemälde, weil das ursprüngliche Modell nicht zur Sitzung erschien.',
      it: 'La madre di Whistler finì nel dipinto solo perché la modella prevista non si presentò alla posa.',
      ja: 'ホイッスラーの母が絵に描かれたのは、本来のモデルがポーズの約束に現れなかったからにすぎません。',
      zh: '惠斯勒之所以画了自己的母亲，只是因为原定的模特没有按时出现。',
      ar: 'لم تظهر والدة ويسلر في اللوحة إلا لأن العارضة الأصلية لم تحضر جلسة الرسم.',
    },
    museum: "Musee d'Orsay, Paris",
  },
  {
    title: 'The Arnolfini Portrait',
    artist: 'Jan van Eyck',
    year: '1434',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Van_Eyck_-_Arnolfini_Portrait.jpg/1280px-Van_Eyck_-_Arnolfini_Portrait.jpg',
    description:
      'A double portrait of Giovanni di Nicolao Arnolfini and his wife in their home in Bruges, rich in symbolism.',
    funFact: {
      en: 'Van Eyck signed the painting "Jan van Eyck was here" above the mirror, suggesting he was a witness to the scene rather than just the painter.',
      fr: 'Van Eyck a signé le tableau « Jan van Eyck était ici » au-dessus du miroir, laissant entendre qu’il fut témoin de la scène et pas seulement le peintre.',
      es: 'Van Eyck firmó el cuadro con «Jan van Eyck estuvo aquí» sobre el espejo, sugiriendo que fue testigo de la escena y no solo el pintor.',
      de: 'Van Eyck signierte das Gemälde über dem Spiegel mit „Jan van Eyck war hier“ und deutete damit an, dass er Zeuge der Szene und nicht nur der Maler war.',
      it: 'Van Eyck firmò il dipinto con «Jan van Eyck era qui» sopra lo specchio, lasciando intendere di essere stato testimone della scena e non solo il pittore.',
      ja: 'ファン・エイクは鏡の上に「ヤン・ファン・エイクここにありき」と署名し、自分が単なる画家ではなくこの場面の証人であったことを示唆しました。',
      zh: '凡·艾克在镜子上方题写「扬·凡·艾克曾在此」，暗示他不仅是画家，更是这一场景的见证者。',
      ar: 'وقّع فان إيك اللوحة فوق المرآة بعبارة «كان يان فان إيك هنا»، ملمّحًا إلى أنه كان شاهدًا على المشهد لا مجرد الرسام.',
    },
    museum: 'National Gallery, London',
  },
  {
    title: 'Girl with a Red Hat',
    artist: 'Johannes Vermeer',
    year: 'c. 1665-1667',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Vermeer_-_Girl_with_a_Red_Hat.JPG/1280px-Vermeer_-_Girl_with_a_Red_Hat.JPG',
    description:
      'A small, luminous painting of a young woman turning toward the viewer, wearing a striking red hat.',
    funFact: {
      en: 'This tiny painting (9 x 7 inches) is painted on a wooden panel rather than canvas, unusual for Vermeer, leading some scholars to debate its attribution.',
      fr: 'Ce tout petit tableau (23 x 18 cm) est peint sur un panneau de bois et non sur toile, ce qui est inhabituel pour Vermeer et a conduit certains spécialistes à débattre de son attribution.',
      es: 'Esta pequeñísima pintura (23 x 18 cm) está realizada sobre un panel de madera en lugar de lienzo, algo inusual en Vermeer, lo que ha llevado a algunos estudiosos a debatir su atribución.',
      de: 'Dieses winzige Gemälde (23 x 18 cm) ist auf eine Holztafel statt auf Leinwand gemalt – ungewöhnlich für Vermeer –, weshalb einige Forscher über seine Zuschreibung streiten.',
      it: 'Questo minuscolo dipinto (23 x 18 cm) è realizzato su una tavola di legno anziché su tela, cosa insolita per Vermeer, e ciò ha spinto alcuni studiosi a discuterne l’attribuzione.',
      ja: 'この小さな絵（約23×18cm）はフェルメールには珍しく、キャンバスではなく木の板に描かれており、一部の研究者がその帰属を巡って議論しています。',
      zh: '这幅极小的画作（约23×18厘米）画在木板而非画布上，这在维米尔作品中颇为罕见，致使部分学者对其归属产生争论。',
      ar: 'رُسمت هذه اللوحة الصغيرة جدًا (نحو 23 × 18 سم) على لوح خشبي بدلًا من القماش، وهو أمر غير معتاد لدى فيرمير، ما دفع بعض الباحثين إلى التشكيك في نسبتها إليه.',
    },
    museum: 'National Gallery of Art, Washington D.C.',
  },
  {
    title: 'Wanderer above the Sea of Fog',
    artist: 'Caspar David Friedrich',
    year: 'c. 1818',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg/1280px-Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg',
    description:
      'A Romantic painting of a man standing on a rocky precipice overlooking a fog-filled landscape.',
    funFact: {
      en: 'The painting has become the quintessential image of Romanticism, yet almost nothing is known about who commissioned it or why.',
      fr: 'Le tableau est devenu l’image par excellence du romantisme, et pourtant on ne sait presque rien de son commanditaire ni de ses raisons.',
      es: 'La pintura se ha convertido en la imagen por excelencia del Romanticismo y, sin embargo, apenas se sabe nada sobre quién la encargó ni por qué.',
      de: 'Das Gemälde ist zum Inbegriff der Romantik geworden, doch über den Auftraggeber und seine Beweggründe ist fast nichts bekannt.',
      it: 'Il dipinto è diventato l’immagine per eccellenza del Romanticismo, eppure non si sa quasi nulla su chi lo commissionò né perché.',
      ja: 'この絵はロマン主義を象徴する一枚となりましたが、誰が何のために注文したのかはほとんど分かっていません。',
      zh: '这幅画已成为浪漫主义的典型形象，然而人们对它由谁出资、为何而作几乎一无所知。',
      ar: 'أصبحت اللوحة الصورة المثالية للرومانسية، ومع ذلك لا يُعرف تقريبًا شيء عمّن طلب رسمها أو لماذا.',
    },
    museum: 'Hamburger Kunsthalle, Hamburg',
  },
] as const;

export { artworks };
