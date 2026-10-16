# The Gallery (`/gallery`)

A visitor chooses one of several glowing colour orbs. A painting from that colour's group is
then shown, with where it is held, how it was made, and three ways of looking at it. This file
records what has been built, what the code enforces, and what is still open, so the next change
starts from the reasoning rather than from scratch.

## What it is, and what it is not

- **A portfolio section in `src/app/`, not part of the technical argument.** It reads no API and
  writes nothing. `/dashboard` and `/booking` still carry the case CLAUDE.md describes; this route
  should not be folded into either.
- **Not a separate work like `/aubade`.** It lives in `src/app/gallery/`, uses the site's tokens
  from `src/styles.css`, and has no import boundary of its own.
- **Not a model.** The "recommendation" is two uniform random draws over a hand-made partition.
  The page says exactly that under the orbs. Do not add scoring, embeddings or personalisation
  and keep the old wording: the site's bar is that every claim on screen is true.

## The model in one paragraph

`n` paintings are partitioned into `m` colour groups of unequal size `k` (today 24 paintings,
7 groups of 3–4). `ORBS_SHOWN` colours (today 5) are offered, drawn without replacement by a
partial Fisher–Yates shuffle. Choosing a colour picks one painting from its group uniformly,
excluding the one already on the wall when the group has another. Pressing the lit orb again, or
"Another … painting", draws again. "Show me different colours" redraws the orbs and clears the
wall.

## File map

| File                                        | What it holds                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/app/gallery/gallery.data.ts`           | The collection: `COLOURS` (each with its `paintings`), `ORBS_SHOWN`, and the types. All prose lives here.  |
| `src/app/gallery/recommend.ts`              | `offerColours` and `recommend`: pure, Angular-free, with the random source passed in.                      |
| `src/app/gallery/gallery.ts`/`.html`/`.css` | The route. `GALLERY_RANDOM` is the injection token tests override.                                         |
| `src/app/gallery/*.spec.ts`                 | Data invariants, draw fairness, and the rendered page.                                                     |
| `scripts/fetch-gallery.mjs`                 | `npm run gallery:fetch`: downloads, licence-checks and encodes the images. Needs the network; run by hand. |
| `scripts/gallery.test.mjs`                  | Part of `npm run test:scripts`: each image exists at its declared size, and no unused files exist.         |
| `public/gallery/*.webp`                     | The 24 committed reproductions, about 6.3 MB in all.                                                       |
| `e2e/gallery.spec.ts`                       | A real browser presses an orb and checks that the image decodes.                                           |

Wiring outside the folder: the route in `src/app/app.routes.ts`, its card in
`src/route-meta.json`, its rewrite in `vercel.json`, an entry in `ROUTES` in `e2e/a11y.spec.ts`
(scanned with a painting showing), and a card in `src/app/projects/projects.ts`.

## Invariants, and what enforces each

| Claim                                                | Enforced by                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| No painting is in two groups                         | Nesting in `gallery.data.ts`; duplicate-slug test in `gallery.data.spec.ts`            |
| Every group has at least one painting                | `gallery.data.spec.ts`                                                                 |
| `2 ≤ ORBS_SHOWN < COLOURS.length`                    | `gallery.data.spec.ts` (otherwise the reshuffle link is pointless)                     |
| Every painter died more than 70 years ago            | `gallery.data.spec.ts`, from the last year in `artistLife`; it moves with the calendar |
| Every image is public domain or CC0 on Commons       | `fetch-gallery.mjs` refuses any other licence before downloading                       |
| `image.width`/`height` match the committed file      | `scripts/gallery.test.mjs`, using `readStillWebp` from `webp-anim.mjs`                 |
| `public/gallery/` holds nothing unreferenced         | `scripts/gallery.test.mjs`                                                             |
| Each label cites Wikipedia or the Met                | `gallery.data.spec.ts`                                                                 |
| Alt text is substantive and doesn't repeat the title | `gallery.data.spec.ts`                                                                 |
| "Another" never shows the same painting again        | `recommend.spec.ts`, `gallery.spec.ts`                                                 |
| The method paragraph's counts match the data         | `gallery.spec.ts`; the template reads them from `COLOURS`                              |

## How to add or swap a painting

1. **Pick a painter who died more than 70 years ago**, or the data test fails. Then find the work
   on Wikimedia Commons. Prefer the holding museum's own photograph (its `Credit` field names the
   institution). Avoid photographs of the gallery wall, which carry the photographer's CC BY-SA
   licence. The first file found for _The Swing_ was one of those.
2. **Check the label against a source.** Read the date, medium, size, museum and city from the
   work's Wikipedia infobox, or from `collectionapi.metmuseum.org` for a Met object, and put that
   URL in `source`. The infobox's wikitext (`action=parse&prop=wikitext`) gives the fields cleanly.
3. **Write the entry inside one colour**, with `image.file` set to `<slug>.webp` and `width`/`height`
   set to 0 for now.
4. **Run `npm run gallery:fetch -- --only <slug>`.** It prints the real pixel size; copy it into
   the data. Without `--only` it refetches all 24 files, which takes about a minute.
5. **Delete any WebP the change orphaned**, then run `npm test` and `npm run test:scripts`.

Images are 1400 px on the long edge at WebP quality 0.82. That is large enough to show the
detail the "Up close" reading points at, and small enough to keep the folder near 6 MB. Commons
serves thumbnails only at standard widths, so the script downloads at 2000 px and scales down
locally.

## Decisions that look like mistakes

- **The orbs are toggle buttons (`aria-pressed`), not a radio group.** Pressing a lit orb again
  is a real request for another painting, and a radio button cannot express that.
- **Focus moves to the painting's heading, and the article is scrolled into view separately.**
  On a desktop the heading is often just inside the viewport, so focus alone does not scroll and
  the picture stays below the fold. `preventScroll` on the focus call, followed by
  `scrollIntoView`, fixes that. The global `scroll-behavior` makes the scroll smooth, and the
  reduced-motion block makes it instant.
- **The glow breathes on a `::before` layer through `opacity` and `transform`**, not by animating
  `box-shadow`, which would repaint five orbs on every frame. That layer sits at `z-index: -1`, so
  `.orb` needs `isolation: isolate`; without it the glow disappears behind the page background.
- **The button styles are the gallery's own.** `.btn` is scoped to each component on this site,
  not global, so reusing the class name renders unstyled.
- **No analytics event is sent when an orb is chosen.** Adding one means adding it to
  `docs/analytics.md` too, which `check:docs` enforces. The page also currently promises that
  nothing about a choice is stored.
- **Group sizes are deliberately unequal**, as the brief allowed.

## What was verified, and what was not

The label fields (date, medium, size, museum, city) were checked against the cited source. So
were these prose claims, which appear in the Wikipedia intros: Munch's "blood red" and "infinite
scream", Apollinaire's line on _The Dream_, the 2005 Radio 4 poll for _The Fighting Temeraire_,
the 1950 rediscovery of _Judith_, Hokusai's Prussian blue, and Cassatt's debt to Japanese prints.

**The rest of the readings and quotes were written from memory and have not been checked.**
They should be checked before anyone quotes them. In particular:

- Van Gogh's "terrible passions of humanity" and "ruin oneself, go mad, or commit a crime"
  (his letters of September 1888);
- the 2021 confirmation that the pencilled line on _The Scream_ is in Munch's hand;
- Kleist's "eyelids cut away", and Friedrich painting out ships on _The Monk by the Sea_;
- Rousseau's explanation that the woman is dreaming, and his studies at the Jardin des Plantes;
- "Constable's snow", the full-size sketch, and the 1824 Salon gold medal;
- Seurat's later painted border;
- Whistler's farthing in damages, and the Hiroshige source for the bridge;
- the Cupid statue in _The Swing_, and Caillebotte's bequest of the Renoir;
- the foot warmer and nail holes in _The Milkmaid_.

Correct an entry in `gallery.data.ts` and the page follows. Nothing else holds a copy.

## Open items

- **The home-page card sits in a section headed "enterprise applications".** It goes after the
  two live demos so the "last three are under NDA" note stays true. The owner may want to move it
  or reword the heading.
- **Lighthouse does not audit `/gallery`.** `lighthouserc.json` covers `/` and `/dashboard` only.
  A painting shown at full size would dominate the largest-contentful-paint metric if it did.
- **The collection is Western-heavy, with one Japanese print.** Widening it is a content
  decision, not a code one. The 70-year rule is the only hard constraint.
