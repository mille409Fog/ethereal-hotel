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

| Tile       | Script   | Language | Line                            | Provenance                 |
| ---------- | -------- | -------- | ------------------------------- | -------------------------- |
| `latin`    | Latin    | English  | Give me shelter from the light. | The author's own sentence. |
| `greek`    | Greek    | Greek    | Δώσε μου καταφύγιο από το φως.  | Reviewed                   |
| `cyrillic` | Cyrillic | Russian  | Укрой меня от света.            | Reviewd.                   |
| `hebrew`   | Hebrew   | Hebrew   | תן לי מחסה מן האור.             | Reviewed                   |

**Three of those four say "not reviewed by a native speaker", and that sentence is the reason
this file exists rather than a reason to be uneasy about it.** The claim being made on the wall
is not that these are authoritative translations; it is that they are this sentence, in these
hands, offered honestly. Anyone who reads Greek, Russian or Hebrew and finds a better line is
right, and the fix is one string in `src/aubade/sentence.ts` and one `npm run build:sentence`.

## Typefaces

Vendored in `scripts/library-fonts/`, subsetted by the Google Fonts `text=` endpoint to exactly
the glyphs of their own line — which is why four faces are about ten kilobytes rather than about
twenty megabytes. `SOURCES.txt` in that directory records the exact request each was fetched with,
and `npm run build:sentence -- --fonts` re-fetches them.

| File                                           | Family            | Licence                   |
| ---------------------------------------------- | ----------------- | ------------------------- |
| `latin.woff2`, `greek.woff2`, `cyrillic.woff2` | Noto Serif        | SIL Open Font License 1.1 |
| `hebrew.woff2`                                 | Noto Serif Hebrew | SIL Open Font License 1.1 |

The Noto project is published by Google under the OFL. The OFL permits redistribution of subsets
and of derivative binaries; the atlas in `public/aubade-sentence.png` is a rendering of these
faces rather than a font, and carries no reserved font name.

The résumé's two faces are vendored separately under `scripts/resume-fonts/`, with their own
licence texts, and are unrelated to this.

## The aria

Floor −5 — the Box — is an opera box looking into a house, and the geometry of that house moves
to a single aria. The room is built. **The sound is not, and that is what this section is for.**

### What ships

| Item                                                | Provenance                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The aria's melody, in `src/aubade/box.ts` as `ARIA` | The author's own, written for this piece. Nineteen notes in D minor, notated as semitones from middle C. Not transcribed from, quoted from, or derived from any existing work. |
| The voice's spectrum, in `bandsFor`                 | A model, not a recording. A harmonic series under three formants, computed from the pitch. Nothing is sampled and nothing is played.                                           |

### What does not ship, and why

**There is no audio on Floor −5.** No `AudioContext` is created, nothing plays, and no visitor is
asked to click before a room will work. What drives the geometry is the score above, evaluated at
the room's clock and reduced to eight frequency bands — the same eight bands an `AnalyserNode`
would hand back, binned the same way, so the shader is already written against the shape the real
thing has.

AUBADE's sixth non-negotiable is the reason: _"No licensed audio, no scraped text. Public domain
or self-recorded, sourced in a credits file."_ The phase note puts this floor last and says why —
_"audio licensing and autoplay policy are the two things most likely to eat a week."_ Only one of
those two turned out to be hard. Autoplay is answered by the piece being silent: a work with no
audio graph has no autoplay policy to lose to, and AUBADE already required this floor to be worth
looking at in silence _"because for most visitors it will be"_.

Licensing is the one that remains, and it is the same cut the Library took over its four missing
writing systems. Three routes are open and each needs a decision this file cannot make on its own:

- **A public-domain recording.** Sound recordings published in the United States before 1930 are
  in the public domain under the Music Modernization Act, which reaches the acoustic Caruso sides
  and a good deal else. It costs a multi-megabyte binary in a repository whose only asset is a
  four-line distance field, and a 78's usable band is roughly 200 Hz to 3 kHz, which is most of an
  eight-band spectrum arriving empty.
- **A recording made for this piece.** The strongest line this file could print, and the only one
  where the voice belongs to somebody named in it.
- **Synthesis from the score above**, which needs no licence at all and would make the analyser
  real without adding an asset.

**Until one of those is chosen and the provenance can be written down here, the floor is silent
and says so.** It says so on the plate, in the prose under the room, and in the Reader's Edition,
because a room that quietly did not do the thing its own documentation describes would be the
failure this file exists to prevent. The code path is one function — `voiceAt` in
`src/aubade/box.ts` — replaced by a read of an `AnalyserNode`. Nothing in the shader, the rig, the
uniforms or the committed frames changes.
