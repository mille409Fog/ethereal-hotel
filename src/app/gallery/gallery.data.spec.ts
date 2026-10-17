import { COLOURS, filesOf, IPainting, ORBS_SHOWN, SMALLER_EDGES } from './gallery.data';

/**
 * The collection's invariants.
 *
 * The page promises four things it cannot show: that the colour groups never
 * overlap, that every image is free to publish, that every label can be
 * checked, and that the facts inside the readings were. Each erodes quietly
 * under editing — a painting pasted into a second group because it "also
 * fits", a modern work added because it is perfect for a colour, a source left
 * blank for later, an anecdote remembered rather than looked up — so each is a
 * test.
 */

const paintings: readonly IPainting[] = COLOURS.flatMap((colour) => colour.paintings);

/** WCAG 2 relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('gallery collection', () => {
  it('partitions the paintings: no work appears in two colours', () => {
    const slugs = paintings.map((painting) => painting.slug);
    const repeated = slugs.filter((slug, index) => slugs.indexOf(slug) !== index);
    expect(repeated, 'a painting is listed under more than one colour').toEqual([]);
  });

  it('gives every colour at least one painting', () => {
    for (const colour of COLOURS) {
      expect(colour.paintings.length, `${colour.name} is empty`).toBeGreaterThan(0);
    }
  });

  it('offers a real choice, but not every colour at once', () => {
    // Fewer than two orbs is not a choice. Offering all of them makes the
    // "different colours" control pointless, and the page hides it.
    expect(ORBS_SHOWN).toBeGreaterThanOrEqual(2);
    expect(ORBS_SHOWN).toBeLessThan(COLOURS.length);
  });

  it('gives each colour a unique id and a hex for its orb', () => {
    const ids = COLOURS.map((colour) => colour.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const colour of COLOURS) {
      expect(colour.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(colour.mood.trim().length).toBeGreaterThan(0);
      expect(colour.connotation.trim().length).toBeGreaterThan(0);
    }
  });

  it('hangs each colour in a room of its own', () => {
    const frames = COLOURS.map((colour) => colour.palette.frame);
    const surfaces = COLOURS.map((colour) => colour.palette.surface);
    expect(new Set(frames).size, 'two colours share a frame').toBe(COLOURS.length);
    expect(new Set(surfaces).size, 'two colours share a surface').toBe(COLOURS.length);
    for (const colour of COLOURS) {
      const swatches = Object.entries(colour.palette).filter(([name]) => name !== 'frame');
      for (const [name, value] of swatches) {
        expect(value, `${colour.id}.palette.${name}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('keeps every palette readable: AA contrast for each text colour on its surface', () => {
    // axe enforces this in the browser, but only for the one colour the e2e
    // run happens to press. Six palettes would otherwise go unaudited.
    for (const colour of COLOURS) {
      const { surface, text, muted, accentText } = colour.palette;
      for (const [role, ink] of Object.entries({ text, muted, accentText })) {
        const ratio = contrast(ink, surface);
        expect(
          ratio,
          `${colour.id} ${role} ${ink} on ${surface} is ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('only collects painters dead for more than seventy years', () => {
    // The reproductions are committed on the strength of the work being in the
    // public domain, and life plus seventy is the longest term that applies to
    // any of the collections here. This is that argument, executable.
    const latestDeath = new Date().getFullYear() - 71;
    for (const painting of paintings) {
      const death = Number(/(\d{4})$/.exec(painting.artistLife)?.[1]);
      expect(death, `${painting.slug}: artistLife must end in a death year`).toBeGreaterThan(0);
      expect(death, `${painting.slug}: ${painting.artist} died in ${death}`).toBeLessThanOrEqual(
        latestDeath
      );
    }
  });

  it('names each reproduction after its painting, once', () => {
    for (const painting of paintings) {
      expect(painting.image.file).toBe(`${painting.slug}.webp`);
      expect(painting.image.commons.trim().length).toBeGreaterThan(0);
      expect(painting.image.width).toBeGreaterThan(0);
      expect(painting.image.height).toBeGreaterThan(0);
    }
  });

  it('offers every painting at every smaller size, narrowest first', () => {
    // filesOf skips a copy that would be no smaller than the full-size file. No
    // painting here is that small, so a skipped copy would mean a full-size
    // image had shrunk and phones were quietly back to downloading all of it.
    for (const painting of paintings) {
      const files = filesOf(painting.image);
      expect(files.length, painting.slug).toBe(SMALLER_EDGES.length + 1);
      expect(files.at(-1)?.file).toBe(painting.image.file);
      const widths = files.map((file) => file.width);
      expect(widths, painting.slug).toEqual([...widths].sort((a, b) => a - b));
      expect(new Set(widths).size, painting.slug).toBe(widths.length);
    }
  });

  it('describes every image for someone who cannot see it', () => {
    for (const painting of paintings) {
      const alt = painting.image.alt;
      expect(alt.length, `${painting.slug} alt is too thin`).toBeGreaterThan(40);
      // The image is already announced as an image, and the title is the
      // heading beside it; alt text that repeats either wastes the listener's time.
      expect(alt).not.toMatch(/^(an? )?(image|picture|painting|photo) of/i);
      expect(alt).not.toContain(painting.title);
    }
  });

  it('cites a source for every label', () => {
    for (const painting of paintings) {
      expect(painting.source).toMatch(/^https:\/\/(en\.wikipedia\.org|www\.metmuseum\.org)\//);
    }
  });

  it('cites where the facts in every reading were checked', () => {
    // The readings were first written from memory, and a check against sources
    // found Caillebotte's "bequest", a hare nobody can see any more and a
    // Hiroshige source that no museum asserts. This makes the check a condition
    // of entry. The hosts are deliberately few: an encyclopedia, the holding
    // museums and one art journal. A new host is a decision, not a paste.
    const trusted =
      /^https:\/\/(en\.wikipedia\.org|www\.metmuseum\.org|www\.nationalgallery\.org\.uk|www\.wallacecollection\.org|apollo-magazine\.com)\//;
    for (const painting of paintings) {
      const sources = painting.readingSources;
      expect(sources.length, `${painting.slug} has unchecked readings`).toBeGreaterThan(0);
      expect(new Set(sources).size, `${painting.slug} cites a source twice`).toBe(sources.length);
      for (const source of sources) {
        expect(source, painting.slug).toMatch(trusted);
      }
    }
  });

  it('gives every painting the full guide', () => {
    for (const painting of paintings) {
      expect(painting.techniques.length, painting.slug).toBeGreaterThanOrEqual(2);
      const { distance, close, context } = painting.lenses;
      for (const reading of [painting.whyThisColour, distance, close, context]) {
        expect(reading.trim().length, painting.slug).toBeGreaterThan(0);
      }
    }
  });
});
