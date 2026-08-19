# Library fonts

Four faces, vendored as woff2, used by `scripts/build-sentence-atlas.mjs` to lay out Floor −2's
sentence before it is turned into a distance field. They are **not** shipped to the browser: the
only thing that reaches a visitor is `public/aubade-sentence.png`, which is a sampled distance
function rather than a font.

## Why these are four kilobytes each and not four megabytes

Each file is subsetted by the Google Fonts `text=` endpoint to exactly the glyphs of its own line.
A full Noto Serif is about 400KB and a full Noto Serif SC — which this directory will need if Han
ever ships — is nearer twenty megabytes. Asked for one sentence, the same endpoint returns two or
three kilobytes containing that sentence's glyphs and the layout tables that reach them, which is
small enough to commit without apology.

`SOURCES.txt` records the exact request each file was fetched with. Re-fetch them all with:

```bash
npm run build:sentence -- --fonts
```

That rewrites both the woff2 files and `SOURCES.txt`, then rebuilds the atlas. Do it whenever a
line in `SENTENCE_SCRIPTS` changes — a subset built for the old text has no glyphs for the new,
and the atlas builder will fail with the tile it could not ink rather than writing a blank one.

## Why they are committed at all

The same argument `scripts/resume-fonts/README.md` makes, arrived at from the other side. That
directory commits its faces because text metrics decide the PDF's bytes and a byte comparison is
the gate. Here the gate is deliberately *not* a byte comparison — Chromium rasterises differently
on Windows and on Linux CI, so the atlas is checked for shape rather than content, exactly as
`resume:check` learned to check text rather than bytes.

What committing buys instead is that rebuilding the atlas is reproducible and offline. A build
step that reaches for a font over the network is a build step that produces a different inscription
the day Google reflows a subset, and this one is regenerated rarely enough that nobody would
notice.

## The faces

| File                                        | Family            | Licence                   |
| ------------------------------------------- | ----------------- | ------------------------- |
| `latin.woff2`, `greek.woff2`, `cyrillic.woff2` | Noto Serif        | SIL Open Font License 1.1 |
| `hebrew.woff2`                              | Noto Serif Hebrew | SIL Open Font License 1.1 |

Three of the four are subsets of the same family, which is why the frieze reads as one inscription
in several hands rather than several inscriptions. They are registered under per-script family
names at build time (`aubade-latin`, `aubade-greek`, …) because three faces sharing a real family
name, weight and style resolve to whichever was added last — which would draw the English and Greek
lines from the Russian subset, and those have none of their glyphs.

Provenance for the lines themselves — who translated what, and what is deliberately missing — is in
`docs/aubade-credits.md`, which `npm run check:docs` holds against `SENTENCE_SCRIPTS`.
