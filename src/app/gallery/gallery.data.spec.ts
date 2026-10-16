import { COLOURS, IPainting, ORBS_SHOWN } from './gallery.data';

/**
 * The collection's invariants.
 *
 * The page promises three things it cannot show: that the colour groups never
 * overlap, that every image is free to publish, and that every label can be
 * checked. Each erodes quietly under editing — a painting pasted into a second
 * group because it "also fits", a modern work added because it is perfect for
 * a colour, a source left blank for later — so each is a test.
 */

const paintings: readonly IPainting[] = COLOURS.flatMap((colour) => colour.paintings);

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
