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
| Each painting's readings cite a trusted host         | `gallery.data.spec.ts`, which holds the host list; adding a host is a decision         |
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
   set to 0 for now. Check every fact in the readings before writing it, not after, and list
   the pages in `readingSources`. If no source states something, leave it out.
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
- **Each colour hangs its painting in a room of its own.** `palette` on each colour sets the
  card's surface, type, hairlines, accent and mat, and `gallery.ts` passes them to the card as
  `--room-*` custom properties. `palette.frame` picks one of seven frame treatments in
  `gallery.css`, keyed on `data-frame`: lacquer, gilt, nocturne, oak, blush, ebony and float. The
  palettes live in data, not CSS, so `gallery.data.spec.ts` can hold every text colour to 4.5:1
  on its own surface. axe only sees whichever colour the e2e run presses, which leaves the other
  six unchecked in the browser. Pearl is the one light room, so it switches off the global
  heading shadow from `styles.css`, which smudges type on a pale ground.
- **The all-scripts size warning moved from 950 kB to 975 kB** when the gallery chunk (about
  53 kB raw) took the build to 951 kB. Only the 1200 kB error limit is gated. The README says
  warnings sit just above today's build, and the move keeps that true. If the collection grows
  much more, load the prose as JSON from `public/` instead of compiling it into the chunk.

## How the readings were checked

The label fields are checked against `source`. The readings (`whyThisColour`, `techniques`,
`lenses`) were first written from memory, then checked claim by claim in October 2026. Each
painting's `readingSources` lists the pages they were checked against. Three kinds of sentence
were treated differently:

- **Facts** (a date, a quote, an attribution, who owned what) must be stated by one of the
  `readingSources`. Where the source said something narrower, the sentence was narrowed to match.
- **What the picture shows** (a dog on the bank, bare cardboard in the corners) was checked
  against the committed reproduction in `public/gallery/`.
- **Interpretation** ("the room has more personality than anyone in it") is not checked. The
  method paragraph on the page says the readings are one person's interpretation.

The check corrected these, which are worth knowing as the kinds of error memory makes:

- _Bal du moulin de la Galette_ did not reach the state by Caillebotte's bequest. It was taken in
  payment of death duties.
- The hare in _Rain, Steam and Speed_ is now barely visible, if at all: the paint has turned
  transparent. The old text called it "hard to forget once seen".
- The Hiroshige source for Whistler's bridge is a museum's "might have", not a fact. It was cut.
  So was the claim that the canvas was shown in court; the source says only that it was discussed.
- _A Burial at Ornans_ "brought Realism to public attention"; "founding work" was an upgrade.
- The Munch inscription reads "could only have been painted by a madman", not "can".

The Met's catalogue pages rate-limited every request during the check, so the Monet reading is
sourced from Wikipedia instead. A search result quoted the Met's essay as saying the 1899
footbridge series was eighteen views. Nobody has read that on the Met's page, so the reading says
only "several". Check the essay before adding the number.

Correct an entry in `gallery.data.ts` and the page follows. Nothing else holds a copy.

## Open items

- **The home-page card sits in a section headed "enterprise applications".** It goes after the
  two live demos so the "last three are under NDA" note stays true. The owner may want to move it
  or reword the heading.
- **Lighthouse does not audit `/gallery`.** `lighthouserc.json` covers `/` and `/dashboard` only.
  A painting shown at full size would dominate the largest-contentful-paint metric if it did.
- **The collection is Western-heavy, with one Japanese print.** Widening it is a content
  decision, not a code one. The 70-year rule is the only hard constraint.
