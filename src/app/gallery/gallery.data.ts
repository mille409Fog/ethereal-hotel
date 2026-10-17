/**
 * The collection behind `/gallery`: paintings, grouped by the colour that
 * recommends them.
 *
 * The groups are a partition, and the shape of this file is what makes them
 * one. Each painting is written *inside* its colour rather than tagged with
 * one, so a work cannot belong to two groups without being written out twice —
 * and `gallery.data.spec.ts` fails on a duplicated slug. The engine never has
 * to check for overlap because there is nowhere for overlap to live.
 *
 * Every fact here was checked against a source rather than recalled: the
 * collection, date, medium and size against the work's Wikipedia infobox or,
 * for the two Metropolitan Museum objects, the Met's own collection API. Each
 * entry carries that source as `source`, and the page links it, so a reader can
 * check the label the way a reviewer can check the dashboard's numbers. The
 * facts inside the readings were checked too, and `readingSources` says where.
 * The colour groupings and the readings themselves are interpretation, and the
 * page says so.
 *
 * Every image is a public-domain reproduction (PD-Art, or the Met's CC0
 * release) of a work whose painter died more than seventy years ago. They are
 * committed under `public/gallery/` by `scripts/fetch-gallery.mjs`, which
 * reads `image.commons` from this file; `scripts/gallery.test.mjs` fails when a
 * file is missing or its pixel size disagrees with `image.width`/`height`,
 * which the template uses to reserve the frame before the image arrives.
 *
 * `.ts` rather than JSON for the reason `resume.data.ts` gives: the fetch
 * script imports it directly under Node's type stripping, so keep the syntax
 * erasable — interfaces and `as const`, no `enum`.
 */

/** A technique the painting is a good example of, and what it does here. */
export interface ITechnique {
  readonly name: string;
  readonly detail: string;
}

/**
 * Three ways of looking, always the same three, so the page reads as a guide
 * rather than as twenty-four differently shaped essays.
 */
export interface ILenses {
  /** What the composition does before you can name anything in it. */
  readonly distance: string;
  /** The detail that rewards walking up to the frame. */
  readonly close: string;
  /** What the picture meant when and where it was made. */
  readonly context: string;
}

/** One file a reproduction is committed as, and its pixel size. */
export interface IImageFile {
  readonly file: string;
  readonly width: number;
  readonly height: number;
}

/**
 * The long edges of the smaller copies committed beside every full-size
 * reproduction, so a phone does not download pixels it cannot show. The phone
 * layout gives a painting about 290 CSS px; 700 covers that at 2× density and
 * a desktop column at 1×, and 1050 covers it at 3×, which most phones are.
 */
export const SMALLER_EDGES = [700, 1050] as const;

/**
 * Every file one reproduction is committed as, narrowest first: a copy at
 * each of `SMALLER_EDGES`, then the full-size file. The copies' names and
 * sizes are derived from the full-size one rather than written into the data,
 * so they cannot disagree with it. `fetch-gallery.mjs` encodes at exactly these
 * sizes, `gallery.test.mjs` checks the committed files against them, and the
 * template builds `srcset` from them.
 */
export function filesOf(image: IImageFile): readonly IImageFile[] {
  const longEdge = Math.max(image.width, image.height);
  const copies = SMALLER_EDGES.filter((edge) => edge < longEdge).map((edge) => ({
    file: image.file.replace(/\.webp$/, `-${edge}.webp`),
    width: Math.round((image.width * edge) / longEdge),
    height: Math.round((image.height * edge) / longEdge),
  }));
  return [...copies, { file: image.file, width: image.width, height: image.height }];
}

/** A committed reproduction under `public/gallery/`. */
export interface IReproduction {
  /** The full-size file under `public/gallery/`; `filesOf` names the smaller copies. */
  readonly file: string;
  /** The Wikimedia Commons file it was made from, without the `File:` prefix. */
  readonly commons: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export interface IPainting {
  readonly slug: string;
  readonly title: string;
  readonly artist: string;
  /** Birth and death years, which is also the argument that the image is free. */
  readonly artistLife: string;
  readonly made: string;
  readonly medium: string;
  readonly size: string;
  readonly museum: string;
  readonly city: string;
  /** Where the facts above were checked. */
  readonly source: string;
  /**
   * Where the facts inside the readings below were checked: every quote, date,
   * attribution and "Munch wrote" in `whyThisColour`, `techniques` and
   * `lenses`. What the readings say about the picture's look was checked
   * against the committed reproduction; the rest is interpretation, and the
   * page says so. A painting cannot be added without at least one of these,
   * because the readings were once written from memory and several were wrong.
   */
  readonly readingSources: readonly string[];
  /** Why this work is in this colour's group rather than another. */
  readonly whyThisColour: string;
  readonly techniques: readonly ITechnique[];
  readonly lenses: ILenses;
  readonly image: IReproduction;
}

/**
 * How the frame around the reproduction is built. One per colour, and each is
 * a block of CSS in `gallery.css` keyed on `data-frame`; the names describe the
 * object, so the stylesheet reads like a framer's order rather than a theme.
 */
export type FrameStyle = 'lacquer' | 'gilt' | 'nocturne' | 'oak' | 'blush' | 'ebony' | 'float';

/**
 * How much each frame takes off one side of the picture on a phone, in px: the
 * smaller end of its `clamp()` padding plus its border, which is what applies
 * at phone widths. The template's `sizes` subtracts it so the browser chooses
 * a file for the width the painting is actually drawn at. A guess shared by all
 * seven frames was tried and overshot by up to 14px, enough on a 3× phone to
 * miss the 1050 copy and fetch the full-size file. `gallery.test.mjs` reads
 * these back out of `gallery.css` and fails when they disagree.
 */
export const PHONE_FRAME_INSET: Readonly<Record<FrameStyle, number>> = {
  lacquer: 15,
  gilt: 20,
  nocturne: 17,
  oak: 22,
  blush: 17,
  ebony: 17,
  float: 17,
};

/**
 * The room a colour's painting is hung in: the card, its type, and the mount.
 *
 * Data rather than CSS so `gallery.data.spec.ts` can hold every text colour to
 * WCAG AA against its own surface. Seven palettes are seven chances to ship
 * unreadable labels, and axe only scans whichever colour the e2e run presses.
 */
export interface IPalette {
  /** The card's background. */
  readonly surface: string;
  /** Hairlines: the card edge, rules, the bar beside each reading. */
  readonly border: string;
  /** Body text. At least 4.5:1 on `surface`. */
  readonly text: string;
  /** Labels and secondary text. At least 4.5:1 on `surface`. */
  readonly muted: string;
  /** Decorative only: button outline and glow. Never text. */
  readonly accent: string;
  /** The accent as text: kicker and links. At least 4.5:1 on `surface`. */
  readonly accentText: string;
  /** The mount between frame and painting. */
  readonly mat: string;
  readonly frame: FrameStyle;
}

export interface IColour {
  readonly id: string;
  readonly name: string;
  /** The orb's core colour. Decorative: the name and mood carry the meaning. */
  readonly hex: string;
  readonly palette: IPalette;
  /** Two or three words, shown under the orb. */
  readonly mood: string;
  /** One sentence on what the colour has been taken to mean. */
  readonly connotation: string;
  readonly paintings: readonly IPainting[];
}

/** How many of the colours are offered at once. */
export const ORBS_SHOWN = 5;

export const COLOURS: readonly IColour[] = [
  {
    id: 'crimson',
    name: 'Crimson',
    hex: '#c4182f',
    palette: {
      surface: '#22080d',
      border: '#5c1422',
      text: '#f2e4e6',
      muted: '#c9a3aa',
      accent: '#d0233c',
      accentText: '#f2909f',
      mat: '#120407',
      frame: 'lacquer',
    },
    mood: 'Passion & alarm',
    connotation:
      'Red is the colour the body answers before the mind does: desire, danger, a pulse you can hear.',
    paintings: [
      {
        slug: 'night-cafe',
        title: 'The Night Café',
        artist: 'Vincent van Gogh',
        artistLife: '1853–1890',
        made: '1888',
        medium: 'Oil on canvas',
        size: '72.4 × 92.1 cm',
        museum: 'Yale University Art Gallery',
        city: 'New Haven',
        source: 'https://en.wikipedia.org/wiki/The_Night_Caf%C3%A9',
        readingSources: ['https://en.wikipedia.org/wiki/The_Night_Caf%C3%A9'],
        whyThisColour:
          'Van Gogh wrote to his brother that he had tried to express "the terrible passions of humanity by means of red and green." The blood-red walls under a green ceiling are meant to clash, not to settle.',
        techniques: [
          {
            name: 'Complementary clash',
            detail:
              'Red and green sit opposite each other on the colour wheel. Laid edge to edge at full strength, each makes the other vibrate.',
          },
          {
            name: 'Haloed gaslight',
            detail:
              'He described the lamps as lemon-yellow with a glow of orange and green, and painted them as rings of strokes, so the light reads as glare rather than as something that helps you see.',
          },
        ],
        lenses: {
          distance:
            'The floor tilts up towards you and the billiard table drags the eye to a doorway at the back. The room is built to feel slightly too steep.',
          close:
            'The drinkers slumped at the tables are a few strokes each. The room has more personality than anyone in it.',
          context:
            'Painted in Arles in September 1888, in a café that stayed open all night. He described it as a place "where one can ruin oneself, go mad or commit a crime."',
        },
        image: {
          file: 'night-cafe.webp',
          commons: 'Vincent_Willem_van_Gogh_076.jpg',
          width: 1400,
          height: 1105,
          alt: 'A café interior at night: red walls, a green ceiling, four glowing gas lamps, a billiard table in the centre and a few figures slumped at tables along the walls.',
        },
      },
      {
        slug: 'the-scream',
        title: 'The Scream',
        artist: 'Edvard Munch',
        artistLife: '1863–1944',
        made: '1893',
        medium: 'Oil, tempera, pastel and crayon on cardboard',
        size: '91 × 73.5 cm',
        museum: 'National Museum',
        city: 'Oslo',
        source: 'https://en.wikipedia.org/wiki/The_Scream',
        readingSources: [
          'https://en.wikipedia.org/wiki/The_Scream',
          'https://apollo-magazine.com/munch-secret-message-scream/',
        ],
        whyThisColour:
          'Munch remembered the clouds at sunset turning "a blood red" and sensing "an infinite scream passing through nature." The red here is the sky, not a wound.',
        techniques: [
          {
            name: 'Bare support',
            detail:
              'The cardboard shows through in places. The paint is thin and fast, closer to a record of a sensation than a finished surface.',
          },
          {
            name: 'Echoing curves',
            detail:
              "The figure's body, the shoreline and the sky swing with the same lines, so the person and the landscape seem to bend together.",
          },
        ],
        lenses: {
          distance:
            'The railing is the one hard straight line, a diagonal; everything else undulates. The two walkers behind the figure look entirely untroubled.',
          close:
            'The figure is not screaming so much as hearing one, hands pressed to its head. Munch wrote that he "sensed a scream passing through nature": the sound is in the landscape, not the mouth.',
          context:
            'Munch returned to the image for years, in paint, pastel and lithograph. A faint pencilled line on this version, "could only have been painted by a madman," was confirmed by the museum in 2021 to be in his own hand.',
        },
        image: {
          file: 'the-scream.webp',
          commons:
            'Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg',
          width: 1128,
          height: 1400,
          alt: 'A figure with a skull-like face clutches its head on a bridge railing, under a swirling orange and red sky above a dark blue fjord; two figures walk away behind it.',
        },
      },
      {
        slug: 'judith-holofernes',
        title: 'Judith Beheading Holofernes',
        artist: 'Caravaggio',
        artistLife: '1571–1610',
        made: 'c. 1599–1602',
        medium: 'Oil on canvas',
        size: '145 × 195 cm',
        museum: "Galleria Nazionale d'Arte Antica, Palazzo Barberini",
        city: 'Rome',
        source: 'https://en.wikipedia.org/wiki/Judith_Beheading_Holofernes_(Caravaggio)',
        readingSources: [
          'https://en.wikipedia.org/wiki/Judith_Beheading_Holofernes_(Caravaggio)',
          'https://en.wikipedia.org/wiki/Caravaggio',
        ],
        whyThisColour:
          'A red curtain hangs over the scene like a stage drape, and the same red, darker, comes from the wound beneath it.',
        techniques: [
          {
            name: 'Tenebrism',
            detail:
              'One hard light from the left against near-black, so the event seems to surface out of darkness rather than happen in a room.',
          },
          {
            name: 'Painting from the model',
            detail:
              'Caravaggio worked fast from live models, preferring to go straight to the canvas rather than through drawings, which is why the faces read as particular people rather than types.',
          },
        ],
        lenses: {
          distance:
            "Three faces in a row, three reactions: Holofernes's shock, Judith's frown of effort, the eager concentration of her old maid, Abra.",
          close:
            "Judith holds herself at arm's length, elbows locked and body leaning away, as if doing something repellent and necessary.",
          context:
            'Painted in Rome around 1600, when his Contarelli Chapel canvases had just made him a sensation. It was lost from view until its rediscovery in 1950.',
        },
        image: {
          file: 'judith-holofernes.webp',
          commons: 'Caravaggio_-_Giuditta_e_Oloferne_(ca._1599).jpg',
          width: 1400,
          height: 1044,
          alt: 'Against a dark background and under a red curtain, a young woman draws a sword through the neck of a man lying on a bed, while an old woman beside her holds a cloth ready.',
        },
      },
    ],
  },
  {
    id: 'gold',
    name: 'Gold',
    hex: '#e0a92a',
    palette: {
      surface: '#1e170a',
      border: '#5e4a1c',
      text: '#f3ead2',
      muted: '#c9b88e',
      accent: '#d9a53a',
      accentText: '#ecc76c',
      mat: '#0e0b05',
      frame: 'gilt',
    },
    mood: 'Radiance & reverence',
    connotation:
      'Gold is light you can hold: the colour of icons and harvests, and of the last hour of the sun.',
    paintings: [
      {
        slug: 'the-kiss',
        title: 'The Kiss',
        artist: 'Gustav Klimt',
        artistLife: '1862–1918',
        made: '1907–1908',
        medium: 'Oil and gold leaf on canvas',
        size: '180 × 180 cm',
        museum: 'Belvedere',
        city: 'Vienna',
        source: 'https://en.wikipedia.org/wiki/The_Kiss_(Klimt)',
        readingSources: ['https://en.wikipedia.org/wiki/The_Kiss_(Klimt)'],
        whyThisColour:
          'The gold is gold. Beaten leaf is laid on the canvas, so the surface glows with reflected light the way a Byzantine mosaic does.',
        techniques: [
          {
            name: 'Gold leaf',
            detail:
              'Metal leaf, with touches of silver and platinum, laid beside oil paint. The picture changes as you move in front of it.',
          },
          {
            name: 'Ornament as character',
            detail:
              'His robe is upright black and white rectangles, hers is circles and flowers. The two figures are told apart by pattern more than by anatomy.',
          },
        ],
        lenses: {
          distance:
            'The couple form a single golden column on a speckled ground. You see a shape before you see two people.',
          close:
            'Only the faces, hands and her feet are painted naturalistically. Her toes curl at the edge of the flowered meadow, which ends just beneath her bare feet.',
          context:
            'Painted at the height of what is called Klimt\'s Golden Period and first shown in 1908 under the title "The Lovers."',
        },
        image: {
          file: 'the-kiss.webp',
          commons: 'The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg',
          width: 1395,
          height: 1400,
          alt: 'A man and a woman embrace on a flowered meadow, wrapped together in a golden robe patterned with rectangles and circles, against a gold-flecked background.',
        },
      },
      {
        slug: 'sunflowers',
        title: 'Sunflowers',
        artist: 'Vincent van Gogh',
        artistLife: '1853–1890',
        made: '1888',
        medium: 'Oil on canvas',
        size: '92.1 × 73 cm',
        museum: 'National Gallery',
        city: 'London',
        source: 'https://en.wikipedia.org/wiki/Sunflowers_(Van_Gogh_series)',
        readingSources: [
          'https://www.nationalgallery.org.uk/paintings/vincent-van-gogh-sunflowers',
          'https://en.wikipedia.org/wiki/Sunflowers_(Van_Gogh_series)',
        ],
        whyThisColour:
          'Yellow on yellow on yellow: flowers, vase and wall are all close in hue, which is the challenge Van Gogh set himself.',
        techniques: [
          {
            name: 'Impasto',
            detail:
              'The seed heads are built up in thick paint, so they stand physically proud of the canvas and catch real light.',
          },
          {
            name: 'Separating like from like',
            detail:
              'With so little contrast of hue, the forms are held apart by texture, by direction of stroke and by thin lines of blue.',
          },
        ],
        lenses: {
          distance:
            'Fifteen sunflowers in one vase, from a bud to full bloom to heads that have lost their petals. It is a still life about time passing.',
          close:
            'His first name, "Vincent", is painted on the vase in blue, as though it were part of the pottery\'s decoration.',
          context:
            "One of four painted in Arles in August 1888 to decorate his house before Paul Gauguin's visit. This one he hung in the room Gauguin was to sleep in.",
        },
        image: {
          file: 'sunflowers.webp',
          commons: 'Vincent_Willem_van_Gogh_127.jpg',
          width: 1109,
          height: 1400,
          alt: 'Fifteen sunflowers, some fresh and some wilting, in a yellow earthenware vase against a pale yellow wall.',
        },
      },
      {
        slug: 'fighting-temeraire',
        title: 'The Fighting Temeraire',
        artist: 'J. M. W. Turner',
        artistLife: '1775–1851',
        made: '1839',
        medium: 'Oil on canvas',
        size: '90.7 × 121.6 cm',
        museum: 'National Gallery',
        city: 'London',
        source: 'https://en.wikipedia.org/wiki/The_Fighting_Temeraire',
        readingSources: [
          'https://en.wikipedia.org/wiki/The_Fighting_Temeraire',
          'https://www.nationalgallery.org.uk/paintings/joseph-mallord-william-turner-the-fighting-temeraire',
        ],
        whyThisColour:
          'The sunset fills half the sky in molten orange and gold. The ship it mourns is a pale ghost against it.',
        techniques: [
          {
            name: 'Thick light, ghostly ship',
            detail:
              'Around the sun the paint is so thick it stands proud of the canvas, while the old warship is pale and insubstantial, so the light has more body than the subject.',
          },
          {
            name: 'Colour as story',
            detail:
              'The real ship was black and yellow; Turner repainted her white and gold, beside a squat, dark reddish-brown tug. The colour does the narrating.',
          },
        ],
        lenses: {
          distance:
            'The picture splits into a cool half and a blazing half, and the old ship sits in the cool one like a memory.',
          close:
            "The tug's black funnel spews orange-brown smoke back through the old ship's masts, and the tug is the one doing the work.",
          context:
            "HMS Temeraire fought at Trafalgar and was towed up the Thames to be broken up in 1838. Turner kept the painting until he died and left it to the nation, and a 2005 BBC Radio 4 poll voted it Britain's greatest painting.",
        },
        image: {
          file: 'fighting-temeraire.webp',
          commons: 'The_Fighting_Temeraire,_JMW_Turner,_National_Gallery.jpg',
          width: 1400,
          height: 1040,
          alt: 'A pale, ghostly sailing warship is towed up a river by a small dark steam tug, under a sky blazing orange and gold with sunset.',
        },
      },
      {
        slug: 'rain-steam-speed',
        title: 'Rain, Steam and Speed – The Great Western Railway',
        artist: 'J. M. W. Turner',
        artistLife: '1775–1851',
        made: '1844',
        medium: 'Oil on canvas',
        size: '91 × 121.8 cm',
        museum: 'National Gallery',
        city: 'London',
        source:
          'https://en.wikipedia.org/wiki/Rain,_Steam_and_Speed_%E2%80%93_The_Great_Western_Railway',
        readingSources: [
          'https://en.wikipedia.org/wiki/Rain,_Steam_and_Speed_%E2%80%93_The_Great_Western_Railway',
          'https://www.nationalgallery.org.uk/paintings/joseph-mallord-william-turner-rain-steam-and-speed-the-great-western-railway',
        ],
        whyThisColour:
          'The canvas is a haze of gold and grey light, and the railway is less painted than dissolved into the weather.',
        techniques: [
          {
            name: 'Edges dissolved',
            detail:
              'Rain, steam and light are laid over one another with almost no hard edge between them, so the weather and the machine are made of the same stuff.',
          },
          {
            name: 'The rushing diagonal',
            detail:
              'The bridge runs out of the haze in steep perspective, so the train bursts towards you rather than crossing in front of you.',
          },
        ],
        lenses: {
          distance:
            'The black funnel of the locomotive is the hardest object in the painting. Everything else is atmosphere.',
          close:
            'Turner brushed a hare onto the track late, running ahead of the train. The paint has turned transparent with age, and the hare can now barely be seen, if at all.',
          context:
            "The bridge is Brunel's crossing of the Thames at Maidenhead, completed in 1838. Railways were new; Turner painted one as a force of nature.",
        },
        image: {
          file: 'rain-steam-speed.webp',
          commons: 'J._M._W._Turner_-_Rain,_Steam_and_Speed_–_The_Great_Western_Railway.jpg',
          width: 1400,
          height: 1051,
          alt: 'A dark steam locomotive crosses a bridge towards the viewer through a blur of golden rain and mist, a river below and indistinct fields to either side.',
        },
      },
    ],
  },
  {
    id: 'blue',
    name: 'Blue',
    hex: '#2f5fd0',
    palette: {
      surface: '#0a1222',
      border: '#22385f',
      text: '#e2e9f5',
      muted: '#9fb1cf',
      accent: '#4a78e0',
      accentText: '#94b4f7',
      mat: '#050912',
      frame: 'nocturne',
    },
    mood: 'Solitude & reverie',
    connotation: 'Blue is distance: the colour of things far away, at night, or very deep down.',
    paintings: [
      {
        slug: 'starry-night',
        title: 'The Starry Night',
        artist: 'Vincent van Gogh',
        artistLife: '1853–1890',
        made: '1889',
        medium: 'Oil on canvas',
        size: '73.7 × 92.1 cm',
        museum: 'Museum of Modern Art',
        city: 'New York',
        source: 'https://en.wikipedia.org/wiki/The_Starry_Night',
        readingSources: ['https://en.wikipedia.org/wiki/The_Starry_Night'],
        whyThisColour:
          'Night painted not as black but as layered blues, with the stars as coils of yellow and white.',
        techniques: [
          {
            name: 'Directional brushwork',
            detail:
              'Every stroke follows a path, so the sky becomes currents. The movement is in the handling, not just in the subject.',
          },
          {
            name: 'An invented village',
            detail:
              'The view is from his window, but the village could not be seen from it and was added from sketches. It is a landscape assembled, not observed.',
          },
        ],
        lenses: {
          distance:
            'The cypress on the left is a dark flame joining ground to sky. The church spire is the only calm vertical in the picture.',
          close:
            'Strokes lie side by side like woven thread. Follow one through the large swirl and you can see how fast it was laid down.',
          context:
            'Painted in June 1889 at the asylum of Saint-Rémy-de-Provence, from the east-facing window of his room, just before sunrise.',
        },
        image: {
          file: 'starry-night.webp',
          commons: 'Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
          width: 1400,
          height: 1109,
          alt: 'A swirling blue night sky with a crescent moon and glowing stars over a small village with a church spire; a tall dark cypress rises in the foreground.',
        },
      },
      {
        slug: 'great-wave',
        title: 'The Great Wave off Kanagawa',
        artist: 'Katsushika Hokusai',
        artistLife: '1760–1849',
        made: 'c. 1830–1832',
        medium: 'Woodblock print; ink and colour on paper',
        size: '25.7 × 37.9 cm',
        museum: 'Metropolitan Museum of Art (one of many impressions)',
        city: 'New York',
        source: 'https://www.metmuseum.org/art/collection/search/45434',
        readingSources: ['https://en.wikipedia.org/wiki/The_Great_Wave_off_Kanagawa'],
        whyThisColour:
          'The deep blue is Prussian blue, a synthetic pigment newly available in Japan. Its use in this series transformed Japanese prints.',
        techniques: [
          {
            name: 'Woodblock printing',
            detail:
              'Carved blocks for the colours, printed by hand in register. About a thousand impressions were pulled at first and perhaps eight thousand in all; this is one.',
          },
          {
            name: 'Prussian blue',
            detail:
              'Imported from Europe, it resisted fading where the indigo of earlier prints faded quickly, so the sea could be dark and stay dark.',
          },
        ],
        lenses: {
          distance:
            'Mount Fuji, the subject of the whole series, is tiny: it sits in the trough of the wave as if the wave were the mountain.',
          close:
            'Rowers crouch low in three long boats, and the crest of the wave breaks into claw-like fingers of foam.',
          context:
            'The first of Thirty-six Views of Mount Fuji. Prints like it reached the West later in the century and inspired painters there, Monet and Van Gogh among them.',
        },
        image: {
          file: 'great-wave.webp',
          commons: 'Tsunami_by_hokusai_19th_century.jpg',
          width: 1400,
          height: 941,
          alt: 'An enormous blue wave with a claw-like crest of white foam curls over three long boats of crouching rowers; small snow-capped Mount Fuji sits in the distance.',
        },
      },
      {
        slug: 'nocturne-battersea',
        title: 'Nocturne: Blue and Gold – Old Battersea Bridge',
        artist: 'James McNeill Whistler',
        artistLife: '1834–1903',
        made: 'c. 1872–1875',
        medium: 'Oil on canvas',
        size: '68.3 × 51.2 cm',
        museum: 'Tate Britain',
        city: 'London',
        source:
          'https://en.wikipedia.org/wiki/Nocturne:_Blue_and_Gold_%E2%80%93_Old_Battersea_Bridge',
        readingSources: [
          'https://en.wikipedia.org/wiki/Nocturne:_Blue_and_Gold_%E2%80%93_Old_Battersea_Bridge',
        ],
        whyThisColour:
          'A night river in thinned blue-green, almost a single colour, with a few flecks of gold for fireworks.',
        techniques: [
          {
            name: 'Runny paint',
            detail:
              'Whistler thinned his paint so far that he often had to lay the canvas flat to stop it running, and laid it in broad veils, so the river and sky are one breath of tone.',
          },
          {
            name: 'A bridge made taller',
            detail:
              'Whistler exaggerated the height of the bridge. Accuracy has been traded for a single strong shape.',
          },
        ],
        lenses: {
          distance:
            'The pier rises like a T across the picture and splits it in two. Everything else is mist.',
          close:
            'The gold specks at the top are fireworks. A barge at the foot of the pier is barely more than a smudge with a figure in it.',
          context:
            "Discussed in Whistler's 1878 libel suit against the critic John Ruskin. Whistler won, and was awarded one farthing.",
        },
        image: {
          file: 'nocturne-battersea.webp',
          commons: 'James_Abbot_McNeill_Whistler_006.jpg',
          width: 1060,
          height: 1400,
          alt: 'A dim blue-green night river seen from below a tall wooden bridge pier, with faint golden fireworks falling in the sky and a small barge near the pier.',
        },
      },
      {
        slug: 'monk-by-the-sea',
        title: 'The Monk by the Sea',
        artist: 'Caspar David Friedrich',
        artistLife: '1774–1840',
        made: '1808–1810',
        medium: 'Oil on canvas',
        size: '110 × 171.5 cm',
        museum: 'Alte Nationalgalerie',
        city: 'Berlin',
        source: 'https://en.wikipedia.org/wiki/The_Monk_by_the_Sea',
        readingSources: ['https://en.wikipedia.org/wiki/The_Monk_by_the_Sea'],
        whyThisColour:
          'Three bands, pale dune, near-black sea and an enormous sky shading from deep blue to mist, with one small figure.',
        techniques: [
          {
            name: 'Painting out',
            detail:
              'Friedrich first painted two small sailing ships on the horizon and later removed them, leaving nothing between the figure and the edge of the world.',
          },
          {
            name: 'A low horizon',
            detail:
              'The sky takes about three quarters of the canvas, and there are no trees or rocks at the edges to lead you in.',
          },
        ],
        lenses: {
          distance:
            "Nothing frames the view. The poet Heinrich von Kleist wrote that looking at it felt as if one's eyelids had been cut away.",
          close:
            'The monk is a few strokes of dark paint against the pale strip of dune. He is the only vertical in the picture.',
          context:
            'Shown at the Berlin Academy in 1810 alongside The Abbey in the Oakwood. King Frederick William III bought both, and they still hang side by side.',
        },
        image: {
          file: 'monk-by-the-sea.webp',
          commons: 'Friedrich,_Caspar_David_-_Mönch_am_Meer_-_Alte_Nationalgalerie_in_Berlin.jpg',
          width: 1400,
          height: 900,
          alt: 'A tiny figure in dark robes stands on a pale strip of dune before a dark sea, under a vast sky that fades from deep blue to grey mist.',
        },
      },
    ],
  },
  {
    id: 'green',
    name: 'Green',
    hex: '#3c9a58',
    palette: {
      surface: '#0c1a11',
      border: '#28513a',
      text: '#e3efe5',
      muted: '#a3c2ab',
      accent: '#3c9a58',
      accentText: '#8fd2a2',
      mat: '#e9e4d2',
      frame: 'oak',
    },
    mood: 'Renewal & calm',
    connotation:
      'Green is the colour the eye rests on: growth and shade, and water that has stood still long enough to grow.',
    paintings: [
      {
        slug: 'water-lily-bridge',
        title: 'Bridge over a Pond of Water Lilies',
        artist: 'Claude Monet',
        artistLife: '1840–1926',
        made: '1899',
        medium: 'Oil on canvas',
        size: '92.7 × 73.7 cm',
        museum: 'Metropolitan Museum of Art',
        city: 'New York',
        source: 'https://www.metmuseum.org/art/collection/search/437127',
        readingSources: [
          'https://en.wikipedia.org/wiki/Claude_Monet',
          'https://en.wikipedia.org/wiki/Water_Lilies_(Monet_series)',
        ],
        whyThisColour:
          'Almost every inch is a green: willow, bridge, lily pads and their reflections, with no sky at all.',
        techniques: [
          {
            name: 'Painting a garden he made',
            detail:
              'Monet bought a water meadow at Giverny, made a water garden of it, and kept enlarging the pond, in 1901 and again in 1910. Then he painted it for decades.',
          },
          {
            name: 'Stroke direction',
            detail:
              'The pads are horizontal dabs and the reflections vertical strokes, so the brush tells surface from depth.',
          },
        ],
        lenses: {
          distance:
            'The bridge arcs across the top and closes the view. There is no horizon, so the pond becomes the whole world.',
          close:
            'The lilies are touches of pink and white floating on the green. Look for where Monet let the water show between them.',
          context:
            'One of several views of the footbridge from 1899. The water lilies were the main subject of the last thirty-one years of his life.',
        },
        image: {
          file: 'water-lily-bridge.webp',
          commons: 'Bridge_over_a_Pond_of_Water_Lilies_MET_DT1854.jpg',
          width: 1116,
          height: 1400,
          alt: 'A green arched footbridge spans a pond covered in water lilies, framed by dense green willows and foliage, with no sky visible.',
        },
      },
      {
        slug: 'the-dream',
        title: 'The Dream',
        artist: 'Henri Rousseau',
        artistLife: '1844–1910',
        made: '1910',
        medium: 'Oil on canvas',
        size: '204.5 × 298.5 cm',
        museum: 'Museum of Modern Art',
        city: 'New York',
        source: 'https://en.wikipedia.org/wiki/The_Dream_(Rousseau)',
        readingSources: [
          'https://en.wikipedia.org/wiki/The_Dream_(Rousseau)',
          'https://en.wikipedia.org/wiki/Henri_Rousseau',
        ],
        whyThisColour:
          'A jungle in a crowd of distinct greens, each leaf its own flat shape, as dense as a tapestry.',
        techniques: [
          {
            name: 'Self-taught precision',
            detail:
              'Rousseau had no academic training. Every leaf is outlined and filled, with none of the blur his contemporaries used for depth.',
          },
          {
            name: 'Jungles from Paris',
            detail:
              "He never left France or saw a jungle. The plants come from the Jardin des Plantes in Paris and from the illustrations in children's books.",
          },
        ],
        lenses: {
          distance:
            'A nude woman reclines on a red sofa in the middle of a jungle. One reading, from a letter, is that she is asleep, dreaming she is listening to the flute player in the forest.',
          close:
            'Eyes look out of the leaves: a lion and lioness, an elephant, monkeys, birds and a snake, and a dark figure playing a flute.',
          context:
            'His last completed work, shown at the Salon des Indépendants in 1910 a few months before he died. Apollinaire wrote: "I believe nobody will laugh this year."',
        },
        image: {
          file: 'the-dream.webp',
          commons: 'Henri_Rousseau_-_Le_Rêve_-_Google_Art_Project.jpg',
          width: 1400,
          height: 953,
          alt: 'A nude woman reclines on a red sofa amid a dense jungle of large green leaves and flowers, where lions, an elephant, birds and a flute player half hide in the foliage.',
        },
      },
      {
        slug: 'hay-wain',
        title: 'The Hay Wain',
        artist: 'John Constable',
        artistLife: '1776–1837',
        made: '1821',
        medium: 'Oil on canvas',
        size: '130.2 × 185.4 cm',
        museum: 'National Gallery',
        city: 'London',
        source: 'https://en.wikipedia.org/wiki/The_Hay_Wain',
        readingSources: [
          'https://en.wikipedia.org/wiki/The_Hay_Wain',
          'https://www.nationalgallery.org.uk/about-us/press-and-media/press-releases/discover-constable-and-the-hay-wain-2024',
        ],
        whyThisColour:
          'The full summer green of the Stour valley, under a sky that is about to change its mind.',
        techniques: [
          {
            name: 'Full-size sketches',
            detail:
              "Constable worked this picture out first in a full-scale oil sketch, now in the Victoria and Albert Museum, so the finished canvas keeps some of the sketch's speed.",
          },
          {
            name: 'Flecks of white',
            detail:
              'Small touches of pure white on leaves and water make the sunlight glitter. They were often dismissed as "Constable\'s snow."',
          },
        ],
        lenses: {
          distance:
            'An empty farm wagon stands in the shallows of the river, and a dog on the bank watches it. Nothing much is happening, which is the point.',
          close:
            'Look into the clouds. Constable studied skies obsessively, and these are particular, weather that could happen on one afternoon.',
          context:
            'First shown at the Royal Academy as "Landscape: Noon" in 1821, it found no buyer. At the Paris Salon of 1824 it earned a gold medal from Charles X, and it went on to inspire French painters, Delacroix among them.',
        },
        image: {
          file: 'hay-wain.webp',
          commons: 'John_Constable_-_The_Hay_Wain_(1821).jpg',
          width: 1400,
          height: 965,
          alt: 'A horse-drawn wooden cart stands in a shallow river beside a cottage among tall green trees, under a large sky of white and grey clouds; a dog watches from the bank.',
        },
      },
      {
        slug: 'grande-jatte',
        title: 'A Sunday Afternoon on the Island of La Grande Jatte',
        artist: 'Georges Seurat',
        artistLife: '1859–1891',
        made: '1884–1886',
        medium: 'Oil on canvas',
        size: '207.6 × 308 cm',
        museum: 'Art Institute of Chicago',
        city: 'Chicago',
        source: 'https://en.wikipedia.org/wiki/A_Sunday_Afternoon_on_the_Island_of_La_Grande_Jatte',
        readingSources: [
          'https://en.wikipedia.org/wiki/A_Sunday_Afternoon_on_the_Island_of_La_Grande_Jatte',
        ],
        whyThisColour:
          "The lawn's afternoon greens are not mixed on the palette. They are mixed in your eye, from dots of separate colour.",
        techniques: [
          {
            name: 'Pointillism',
            detail:
              'Small touches of unmixed colour placed side by side, so they blend optically at a distance. Seurat built this painting on that idea.',
          },
          {
            name: 'A painted border',
            detail:
              'In 1889 Seurat painted a border of dots around the edge, so the transition into the frame is part of the picture.',
          },
        ],
        lenses: {
          distance:
            'Dozens of Parisians at leisure, arranged like a frieze. Nobody looks at anybody else, and the stillness is strange for a holiday.',
          close:
            'Walk up until the grass falls apart into dots, then step back until it becomes grass again. The painting happens in between.',
          context:
            'Painted in two campaigns between 1884 and 1886, it was shown at the eighth and last Impressionist exhibition in 1886. It is a founding work of Neo-Impressionism.',
        },
        image: {
          file: 'grande-jatte.webp',
          commons: 'A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg',
          width: 1400,
          height: 932,
          alt: 'Parisians in Sunday dress relax on a sunlit riverside lawn with trees, parasols and boats on the water, painted entirely in small dots of colour.',
        },
      },
    ],
  },
  {
    id: 'rose',
    name: 'Rose',
    hex: '#ec8fae',
    palette: {
      surface: '#26131c',
      border: '#6a3850',
      text: '#f7e8ee',
      muted: '#d2aebd',
      accent: '#e584a6',
      accentText: '#f5abc5',
      mat: '#f4dfe7',
      frame: 'blush',
    },
    mood: 'Tenderness & delight',
    connotation:
      'Pink is red with the danger taken out: flushed skin and blossom, the colour of being at ease.',
    paintings: [
      {
        slug: 'moulin-galette',
        title: 'Bal du moulin de la Galette',
        artist: 'Pierre-Auguste Renoir',
        artistLife: '1841–1919',
        made: '1876',
        medium: 'Oil on canvas',
        size: '131 × 175 cm',
        museum: "Musée d'Orsay",
        city: 'Paris',
        source: 'https://en.wikipedia.org/wiki/Bal_du_moulin_de_la_Galette',
        readingSources: ['https://en.wikipedia.org/wiki/Bal_du_moulin_de_la_Galette'],
        whyThisColour:
          'Flushed faces, pink and blue dresses, warm sunlight: a whole crowd painted in the colours of a good afternoon.',
        techniques: [
          {
            name: 'Dappled light',
            detail:
              'Sun filtering through the trees falls as pale patches on jackets, hats and the ground, painted as light rather than as objects.',
          },
          {
            name: 'Feathery handling',
            detail:
              'Soft, broken strokes keep every edge moving, so the crowd seems to sway without anyone being blurred.',
          },
        ],
        lenses: {
          distance:
            "There is no single centre. Your eye drifts from table to dancers to the trees, the way a guest's would.",
          close:
            "Look at the faces in the foreground. Renoir's friends, painters and a critic among them, posed for several.",
          context:
            'A Sunday dance in Montmartre, where working Parisians dressed up to dance and eat galettes. The painter Gustave Caillebotte owned it, and at his death it passed to the French state in payment of death duties.',
        },
        image: {
          file: 'moulin-galette.webp',
          commons: 'Renoir,_Pierre-Auguste_-_Dance_at_Le_Moulin_de_la_Galette,_1876.jpg',
          width: 1400,
          height: 1041,
          alt: 'A crowded outdoor dance under trees: couples dance and groups talk at tables, with sunlight falling in patches across their clothes.',
        },
      },
      {
        slug: 'the-swing',
        title: 'The Swing',
        artist: 'Jean-Honoré Fragonard',
        artistLife: '1732–1806',
        made: 'c. 1767–1768',
        medium: 'Oil on canvas',
        size: '81 × 64.2 cm',
        museum: 'Wallace Collection',
        city: 'London',
        source: 'https://en.wikipedia.org/wiki/The_Swing_(Fragonard)',
        readingSources: [
          'https://en.wikipedia.org/wiki/The_Swing_(Fragonard)',
          'https://www.wallacecollection.org/explore/explore-in-depth/fragonards-the-swing/origins-of-the-swing/the-painting',
        ],
        whyThisColour:
          'A froth of pink silk at the centre of a green and gold garden, the brightest thing in the picture.',
        techniques: [
          {
            name: 'Rococo brushwork',
            detail:
              'The foliage is quick, feathery strokes; the dress is finished to a high gloss. The contrast keeps the eye on her.',
          },
          {
            name: 'A rising diagonal',
            detail:
              'From the man in the shadows at the lower right up to the swinging woman, the composition climbs towards the light.',
          },
        ],
        lenses: {
          distance:
            'A young woman swings high, pushed from the shadows by an older man, while a younger one hides in the bushes below.',
          close:
            "Her slipper flies off her outstretched foot. At the left, a statue of Cupid, after Falconet's Menacing Cupid, holds a finger to his lips. Everyone in the garden is keeping a secret.",
          context:
            'Its original title was "The Happy Accidents of the Swing." It is one of the masterpieces of the Rococo, the style of pleasure that Enlightenment critics wanted painting to give up.',
        },
        image: {
          file: 'the-swing.webp',
          commons: 'Fragonard,_The_Swing.jpg',
          width: 1115,
          height: 1400,
          alt: 'A young woman in a billowing pink dress swings high in a leafy garden, kicking off a slipper; a man reclines in the bushes below and a statue of Cupid stands to the side.',
        },
      },
      {
        slug: 'childs-bath',
        title: "The Child's Bath",
        artist: 'Mary Cassatt',
        artistLife: '1844–1926',
        made: '1893',
        medium: 'Oil on canvas',
        size: '100.3 × 66.1 cm',
        museum: 'Art Institute of Chicago',
        city: 'Chicago',
        source: 'https://en.wikipedia.org/wiki/The_Child%27s_Bath',
        readingSources: [
          'https://en.wikipedia.org/wiki/The_Child%27s_Bath',
          'https://en.wikipedia.org/wiki/Mary_Cassatt',
        ],
        whyThisColour:
          'Warm skin tones, a striped dress and soft light: tenderness painted without a trace of sweetness.',
        techniques: [
          {
            name: 'The view from above',
            detail:
              'A high viewpoint looking down on foreshortened figures, an idea she took from Japanese woodblock prints and from Degas.',
          },
          {
            name: 'Pattern against flesh',
            detail:
              'Flat patterns in the stripes, rug and jug set off the rounded, carefully modelled bodies of the woman and child.',
          },
        ],
        lenses: {
          distance:
            'Both heads meet at the centre and both look down into the basin. The composition is a circle of attention.',
          close:
            "Watch the hands. One of the woman's holds the child steady, the other washes a foot in the basin; the child's rests on her knee.",
          context:
            'Cassatt was the only American officially associated with the Impressionists. The Art Institute bought this painting in 1910.',
        },
        image: {
          file: 'childs-bath.webp',
          commons: "Mary_Cassatt_-_The_Child's_Bath_-_Google_Art_Project.jpg",
          width: 917,
          height: 1400,
          alt: "Seen from above, a woman in a striped dress holds a small child on her lap and washes the child's feet in a basin, beside a floral jug on a patterned rug.",
        },
      },
    ],
  },
  {
    id: 'shadow',
    name: 'Umber',
    hex: '#8a5a3a',
    palette: {
      surface: '#17100b',
      border: '#4a3322',
      text: '#ece0d4',
      muted: '#bea48c',
      accent: '#9a6a44',
      accentText: '#d9ab80',
      mat: '#0a0705',
      frame: 'ebony',
    },
    mood: 'Gravity & grief',
    connotation:
      'Umber and black are where light runs out: mourning and weight, the things painting usually looks away from.',
    paintings: [
      {
        slug: 'saturn',
        title: 'Saturn Devouring His Son',
        artist: 'Francisco Goya',
        artistLife: '1746–1828',
        made: 'c. 1820–1823',
        medium: 'Mixed media mural transferred to canvas',
        size: '143.5 × 81.4 cm',
        museum: 'Museo del Prado',
        city: 'Madrid',
        source: 'https://en.wikipedia.org/wiki/Saturn_Devouring_His_Son',
        readingSources: ['https://en.wikipedia.org/wiki/Saturn_Devouring_His_Son'],
        whyThisColour:
          'A figure lurching out of black, painted in a handful of earths with one red, the darkest picture in the collection.',
        techniques: [
          {
            name: 'Painted on a wall',
            detail:
              'One of the fourteen Black Paintings Goya made on the walls of his own house. They were transferred to canvas after his death.',
          },
          {
            name: 'A narrow palette',
            detail:
              'Black, earth browns and dirty whites, with red kept for the blood, applied fast and rough. The violence is in the handling as much as the subject.',
          },
        ],
        lenses: {
          distance:
            'The god is cramped by the frame, knees bent and arms clenched, as if the canvas were too small to hold him.',
          close: 'Look at his eyes. They bulge, wide and fixed, closer to madness than to hunger.',
          context:
            'The myth is Saturn eating his children because it was foretold that one would overthrow him. Goya never intended the picture for public exhibition.',
        },
        image: {
          file: 'saturn.webp',
          commons: 'Francisco_de_Goya,_Saturno_devorando_a_su_hijo_(1819-1823).jpg',
          width: 762,
          height: 1400,
          alt: 'Against a black background, a wild-haired giant with staring eyes grips a headless human body and bites into its arm.',
        },
      },
      {
        slug: 'rembrandt-two-circles',
        title: 'Self-Portrait with Two Circles',
        artist: 'Rembrandt van Rijn',
        artistLife: '1606–1669',
        made: 'c. 1665–1669',
        medium: 'Oil on canvas',
        size: '114.3 × 94 cm',
        museum: 'Kenwood House',
        city: 'London',
        source: 'https://en.wikipedia.org/wiki/Self-Portrait_with_Two_Circles',
        readingSources: [
          'https://en.wikipedia.org/wiki/Self-Portrait_with_Two_Circles',
          'https://en.wikipedia.org/wiki/Rembrandt',
        ],
        whyThisColour: 'Browns and blacks throughout, out of which a face is built from light.',
        techniques: [
          {
            name: 'Uneven finish',
            detail:
              'The head is built from many colours, thickly painted; the hands, palette and brushes were put down at great speed. Rembrandt finished only what mattered.',
          },
          {
            name: 'Impasto for light',
            detail:
              "The lit side of the face stands up from the canvas in thick paint, so it catches the gallery's own light.",
          },
        ],
        lenses: {
          distance:
            "Two arcs of circles hang on the wall behind him and nobody knows why. The hemispheres of a world map and Giotto's perfect freehand circle have both been proposed.",
          close:
            'The face is old, steady and unflattered. He is holding the tools of his trade, not a symbol of status.',
          context:
            'Painted in his last years, long after he declared himself insolvent in 1656. It is one of more than forty painted self-portraits, a lifelong record of one face.',
        },
        image: {
          file: 'rembrandt-two-circles.webp',
          commons: 'Rembrandt_Self-portrait_(Kenwood).jpg',
          width: 1162,
          height: 1400,
          alt: 'An elderly Rembrandt in a white cap and dark fur-trimmed robe stands holding a palette and brushes, before a pale wall marked with two partial circles.',
        },
      },
      {
        slug: 'burial-at-ornans',
        title: 'A Burial at Ornans',
        artist: 'Gustave Courbet',
        artistLife: '1819–1877',
        made: '1849–1850',
        medium: 'Oil on canvas',
        size: '315 × 660 cm',
        museum: "Musée d'Orsay",
        city: 'Paris',
        source: 'https://en.wikipedia.org/wiki/A_Burial_at_Ornans',
        readingSources: ['https://en.wikipedia.org/wiki/A_Burial_at_Ornans'],
        whyThisColour:
          'A band of black mourning clothes stretches across a canvas more than six metres wide, under a low grey sky.',
        techniques: [
          {
            name: "History painting's scale",
            detail:
              'A size reserved for heroes and saints, given to a provincial funeral. The scale is the argument.',
          },
          {
            name: 'Real sitters',
            detail:
              "The mourners are people of Ornans, Courbet's home town, painted as themselves rather than idealised.",
          },
        ],
        lenses: {
          distance: 'The crowd forms a long, flat frieze. Almost nobody is looking at the grave.',
          close:
            'Find the dog, the kneeling gravedigger, and the skull at the edge of the open grave.',
          context:
            'Shown at the Paris Salon of 1850, it caused an uproar, brought Courbet instant fame, and brought Realism to public attention.',
        },
        image: {
          file: 'burial-at-ornans.webp',
          commons: 'Gustave_Courbet_-_A_Burial_at_Ornans_-_Google_Art_Project_2.jpg',
          width: 1400,
          height: 643,
          alt: 'A long line of mourners in black, clergy in white and red, and townspeople gather around an open grave beneath grey cliffs and an overcast sky.',
        },
      },
    ],
  },
  {
    id: 'pale',
    name: 'Pearl',
    hex: '#ece6d6',
    // The one light room: stillness and clarity read as a pale wall, so the
    // text inverts to dark ink rather than the site's usual light-on-dark.
    palette: {
      surface: '#ece6d8',
      border: '#c9bfa8',
      text: '#2a241c',
      muted: '#5f5546',
      accent: '#8c7a55',
      accentText: '#6e5526',
      mat: '#faf7ef',
      frame: 'float',
    },
    mood: 'Stillness & clarity',
    connotation:
      'Pale is the colour of quiet: morning light on plaster, a page before anything is written on it.',
    paintings: [
      {
        slug: 'milkmaid',
        title: 'The Milkmaid',
        artist: 'Johannes Vermeer',
        artistLife: '1632–1675',
        made: 'c. 1657–1658',
        medium: 'Oil on canvas',
        size: '45.5 × 41 cm',
        museum: 'Rijksmuseum',
        city: 'Amsterdam',
        source: 'https://en.wikipedia.org/wiki/The_Milkmaid_(Vermeer)',
        readingSources: ['https://en.wikipedia.org/wiki/The_Milkmaid_(Vermeer)'],
        whyThisColour:
          'Daylight across a whitewashed wall is half the picture, and the stillest light in the collection.',
        techniques: [
          {
            name: 'Points of light',
            detail:
              'Tiny dots of pale paint on the bread and basket make the surfaces sparkle the way light does on crust and wicker.',
          },
          {
            name: 'Ultramarine',
            detail:
              "The blue of her cuff and apron is ultramarine, ground from lapis lazuli and one of the most expensive pigments a painter could buy, spent on a servant's working clothes.",
          },
        ],
        lenses: {
          distance:
            'The only movement is the thin stream of milk. Everything else in the room has stopped to watch it.',
          close:
            'Look at the wall. Vermeer painted a nail and a nail hole, and a foot warmer sits on the floor behind her.',
          context:
            'It is smaller than most people expect, under half a metre on each side. The Rijksmuseum counts it among its finest attractions.',
        },
        image: {
          file: 'milkmaid.webp',
          commons: 'Johannes_Vermeer_-_Het_melkmeisje_-_Google_Art_Project.png',
          width: 1246,
          height: 1400,
          alt: 'A kitchen maid in a yellow bodice and blue apron pours milk from a jug into a bowl on a table with bread, lit by daylight from a window on a pale wall.',
        },
      },
      {
        slug: 'white-girl',
        title: 'Symphony in White, No. 1: The White Girl',
        artist: 'James McNeill Whistler',
        artistLife: '1834–1903',
        made: '1861–1863',
        medium: 'Oil on canvas',
        size: '215 × 108 cm',
        museum: 'National Gallery of Art',
        city: 'Washington, D.C.',
        source: 'https://en.wikipedia.org/wiki/Symphony_in_White,_No._1:_The_White_Girl',
        readingSources: ['https://en.wikipedia.org/wiki/Symphony_in_White,_No._1:_The_White_Girl'],
        whyThisColour:
          'A white dress against a white curtain. The whole picture is a study in how many whites there are.',
        techniques: [
          {
            name: 'White on white',
            detail:
              'Warm, cool, chalky and creamy whites set against each other. The painting depends on differences most painters would flatten.',
          },
          {
            name: 'A musical title',
            detail:
              'About ten years later Whistler began calling it a "symphony," to insist the picture is an arrangement of colour, not a story. Art for art\'s sake.',
          },
        ],
        lenses: {
          distance:
            'A full-length woman stands head-on, holding a lily, her expression blank. She gives nothing away.',
          close:
            'At her feet is a wolf skin with a snarling head, the one dark and violent note in the room.',
          context:
            "The model is Joanna Hiffernan. Rejected by the Royal Academy and the Paris Salon, it was shown at the Salon des Refusés of 1863, where it drew even more attention than Manet's Déjeuner sur l'herbe.",
        },
        image: {
          file: 'white-girl.webp',
          commons: 'Whistler_James_Symphony_in_White_no_1_(The_White_Girl)_1862.jpg',
          width: 698,
          height: 1400,
          alt: 'A young woman with long red-brown hair stands in a white dress before a white curtain, holding a lily, on a wolf-skin rug with the head at her feet.',
        },
      },
      {
        slug: 'wanderer',
        title: 'Wanderer above the Sea of Fog',
        artist: 'Caspar David Friedrich',
        artistLife: '1774–1840',
        made: 'c. 1818',
        medium: 'Oil on canvas',
        size: '94.8 × 74.8 cm',
        museum: 'Hamburger Kunsthalle',
        city: 'Hamburg',
        source: 'https://en.wikipedia.org/wiki/Wanderer_above_the_Sea_of_Fog',
        readingSources: ['https://en.wikipedia.org/wiki/Wanderer_above_the_Sea_of_Fog'],
        whyThisColour:
          'Fog in pale greys and lilac fills the valley. The man is dark, and the world beyond him is almost white.',
        techniques: [
          {
            name: 'Rückenfigur',
            detail:
              'A figure seen from behind. We cannot read his face, so we stand where he stands and look at what he sees.',
          },
          {
            name: 'A composed landscape',
            detail:
              'The view is assembled in the studio from sketches made in the Elbe Sandstone Mountains. No single place looks like this.',
          },
        ],
        lenses: {
          distance:
            "He stands dead centre, and the lines of the ridges converge on him. The landscape seems arranged around one person's attention.",
          close:
            'Each ridge is a step paler than the one before. Distance is painted as a fading of tone.',
          context:
            'One of the most representative works of Romanticism, read as self-reflection or as the sublime: nature too large to take in.',
        },
        image: {
          file: 'wanderer.webp',
          commons: 'Caspar_David_Friedrich_-_Wanderer_above_the_Sea_of_Fog.jpeg',
          width: 1091,
          height: 1400,
          alt: 'A man in a dark coat stands with his back to us on a rocky summit, looking out over a sea of pale fog with ridges and mountains rising through it.',
        },
      },
    ],
  },
];
