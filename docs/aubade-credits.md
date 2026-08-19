# AUBADE — sources and provenance

AUBADE's sixth non-negotiable: _"No licensed audio, no scraped text. Public domain or
self-recorded, sourced in a credits file. This is a hiring artifact; a takedown notice is a bad
look and an unattributed translation is worse."_

This is that file. `npm run check:docs` fails if a writing system ships on Floor −2's frieze
without an entry here.

## The sentence

Floor −2 — the Library — is one sentence that will not stay in a single writing system. The
sentence is the author's own:

> Give me shelter from the light.

Everything below is a translation of that line, made for this piece. Nothing here is quoted from
a published translation, a corpus, or another work.

### What ships

| Tile | Script | Language | Line | Provenance |
| ---- | ------ | -------- | ---- | ---------- |
| `latin` | Latin | English | Give me shelter from the light. | The author's own sentence. |
| `greek` | Greek | Greek | Δώσε μου καταφύγιο από το φως. | Drafted for this piece with model assistance. Not reviewed by a native speaker. |
| `cyrillic` | Cyrillic | Russian | Укрой меня от света. | Drafted for this piece with model assistance. Not reviewed by a native speaker. |
| `hebrew` | Hebrew | Hebrew | תן לי מחסה מן האור. | Drafted for this piece with model assistance. Not reviewed by a native speaker. |

**Three of those four say "not reviewed by a native speaker", and that sentence is the reason
this file exists rather than a reason to be uneasy about it.** The claim being made on the wall
is not that these are authoritative translations; it is that they are this sentence, in these
hands, offered honestly. Anyone who reads Greek, Russian or Hebrew and finds a better line is
right, and the fix is one string in `src/aubade/sentence.ts` and one `npm run build:sentence`.

### What does not ship, and why

AUBADE's floor table asks for eight writing systems: the four above plus Arabic, Devanagari, Han
and Hangul. The phase note attaches a condition to two of them — _"get the Arabic and Devanagari
shaping right or cut those two; broken shaping is an insult, not an effect"_ — and that condition,
taken seriously, cuts all four for two different reasons.

**Shaping.** Every script above is unjoined and unreordered: a Greek sigma and a Cyrillic ze are
the same shape wherever in a word they fall, and Hebrew's five final forms are separate codepoints
rather than a contextual substitution. So the line that goes into the atlas is the line that was
typed. Arabic joins its letters and Devanagari reorders its vowel signs and stacks conjuncts, and
those are a class of correctness the pipeline can produce but this file cannot vouch for.

That said, the pipeline is not the obstacle. `scripts/build-sentence-atlas.mjs` lays the text out
in Chromium, which shapes with HarfBuzz — the same engine a reader of those scripts uses every
day. Arabic and Devanagari would very probably come out right. "Very probably right" is not a
standard to put on a wall in a language you cannot read.

**Authorship.** Han and Hangul carry no shaping risk at all, and are cut for the other reason: a
translation nobody involved can read is a claim nobody involved can stand behind. The three
alphabetic lines above are short, structurally simple, and checkable against a dictionary by a
careful person; a Chinese line is a set of choices about register that is not.

Adding any of the four is a font subset and a row in `SENTENCE_SCRIPTS` — no shader change, no
pipeline change, and nothing in the gates counts to four. What it needs is a person, named here,
who reads it.

## Typefaces

Vendored in `scripts/library-fonts/`, subsetted by the Google Fonts `text=` endpoint to exactly
the glyphs of their own line — which is why four faces are about ten kilobytes rather than about
twenty megabytes. `SOURCES.txt` in that directory records the exact request each was fetched with,
and `npm run build:sentence -- --fonts` re-fetches them.

| File | Family | Licence |
| ---- | ------ | ------- |
| `latin.woff2`, `greek.woff2`, `cyrillic.woff2` | Noto Serif | SIL Open Font License 1.1 |
| `hebrew.woff2` | Noto Serif Hebrew | SIL Open Font License 1.1 |

The Noto project is published by Google under the OFL. The OFL permits redistribution of subsets
and of derivative binaries; the atlas in `public/aubade-sentence.png` is a rendering of these
faces rather than a font, and carries no reserved font name.

The résumé's two faces are vendored separately under `scripts/resume-fonts/`, with their own
licence texts, and are unrelated to this.

## Audio

None yet. Floor −5 — the Box — is the phase that needs it, and it has not been built. When it is,
its sources belong in this file before its first commit.
