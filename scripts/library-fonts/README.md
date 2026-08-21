# Library fonts

Eight faces, vendored as woff2, used by `scripts/build-sentence-atlas.mjs` to lay out Floor −2's
sentence before it is turned into a distance field. They are **not** shipped to the browser: the
only thing that reaches a visitor is `public/aubade-sentence.png`, which is a sampled distance
function rather than a font.

## Why these are a few kilobytes each and not a few megabytes

Each file is subsetted by the Google Fonts `text=` endpoint to exactly the glyphs of its own line.
A full Noto Serif is about 400KB and a full Noto Serif KR is in the tens of megabytes. Asked for
one sentence, the same endpoint returns two to five kilobytes containing that sentence's glyphs and
the layout tables that reach them — the whole directory is about twenty-five kilobytes, which is
small enough to commit without apology.

The CJK case is the one the `text=` pipeline was really built for, and Korean is where it shows:
`korean.woff2` is four kilobytes of a face that is otherwise unvendorable.

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

| File                                                            | Family                | Licence                   |
| --------------------------------------------------------------- | --------------------- | ------------------------- |
| `english.woff2`, `french.woff2`, `greek.woff2`, `russian.woff2` | Noto Serif            | SIL Open Font License 1.1 |
| `hebrew.woff2`                                                  | Noto Serif Hebrew     | SIL Open Font License 1.1 |
| `arabic.woff2`                                                  | Noto Naskh Arabic     | SIL Open Font License 1.1 |
| `hindi.woff2`                                                   | Noto Serif Devanagari | SIL Open Font License 1.1 |
| `korean.woff2`                                                  | Noto Serif KR         | SIL Open Font License 1.1 |

Half of them are subsets of the same family, which is why the frieze reads as one inscription in
several hands rather than several inscriptions. They are registered under per-line family names at
build time (`aubade-english`, `aubade-french`, …) because four faces sharing a real family name,
weight and style resolve to whichever was added last — which would draw the English, French and
Greek lines from the Russian subset, and those have none of their glyphs.

**The files are named for the language, not the writing system**, and that is what French made
necessary: `latin.woff2` was the English line only while English was the one language here written
in Latin letters. The name is `SENTENCE_SCRIPTS`'s `id`, and `npm run check:docs` matches it
against a row of `docs/aubade-credits.md` — so renaming one side alone fails loudly rather than
quietly drawing the wrong line.

Arabic is the one family not named "Noto Serif …": Google publishes no Noto Serif Arabic, and
Naskh is the Arabic serif tradition rather than a substitute for one.

Provenance for the lines themselves — who translated what, who reviewed it, and what is
deliberately missing — is in `docs/aubade-credits.md`, which `npm run check:docs` holds against
`SENTENCE_SCRIPTS`.
