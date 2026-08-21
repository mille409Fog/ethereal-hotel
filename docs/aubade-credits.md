# AUBADE — sources and provenance

AUBADE's sixth non-negotiable: _"No licensed audio, no scraped text. Public domain or
self-recorded, sourced in a credits file. This is a hiring artifact; a takedown notice is a bad
look and an unattributed translation is worse."_

This is that file. `npm run check:docs` fails if a line ships on Floor −2's frieze without an entry
here.

## The sentence

Floor −2 — the Library — is one sentence that will not stay in a single language. The
sentence is the author's own:

> Give me shelter from the light.

Everything below is a translation of that line, made for this piece. Nothing here is quoted from
a published translation, a corpus, or another work.

### What ships

The tiles are listed in the order the sentence migrates through them, which is the order of
`SENTENCE_SCRIPTS` in `src/aubade/sentence.ts` and the order of the tiles in the atlas. Those three
being one order is deliberate; see that file.

| Tile      | Script     | Language | Line                                | Provenance                 |
| --------- | ---------- | -------- | ----------------------------------- | -------------------------- |
| `english` | Latin      | English  | Give me shelter from the light.     | The author's own sentence. |
| `greek`   | Greek      | Greek    | Δώσε μου καταφύγιο από το φως.      | Reviewed.                  |
| `russian` | Cyrillic   | Russian  | Укрой меня от света.                | Reviewed.                  |
| `hebrew`  | Hebrew     | Hebrew   | תן לי מחסה מן האור.                 | Reviewed.                  |
| `arabic`  | Arabic     | Arabic   | امنحني مأوىً من الضوء.              | Reviewed by Adélie Putain. |
| `french`  | Latin      | French   | Offre-moi un abri contre la lumière. | Reviewed by Ksenija Miho.  |
| `hindi`   | Devanagari | Hindi    | मुझे रोशनी से पनाह दो।                    | Reviewed by Niraj Ayla.    |
| `korean`  | Hangul     | Korean   | 빛을 피할 안식처를 내게 주오.                    | Reviewed by Branka Nedeljka. |

**Eight languages, seven writing systems.** English and French share the Latin alphabet, and that
is not an accident of the list — it is the pair that proves the floor migrates between what is
being said rather than between alphabets. `adjacentSameScript` in `src/aubade/sentence.ts` keeps
the two of them apart in the cycle, because a short morph between two Latin lines reads as a typo
being corrected.

**Chinese is not here, and the reason is the one this file is for.** It was Han in AUBADE's
original table, it has no reviewer, and under a framing that counts languages it is a ninth line
rather than a missing script. The bar is the one the four newest lines cleared: a named person who
reads it. Nothing about the pipeline shortens that bar — adding a line is a row, a font subset and
`npm run build:sentence`, and it has been since the first four shipped. The cost was never
technical.

## Typefaces

Vendored in `scripts/library-fonts/`, subsetted by the Google Fonts `text=` endpoint to exactly
the glyphs of their own line — which is why eight faces are about twenty-five kilobytes rather than
about forty megabytes. A whole Noto Serif KR alone is in the tens of megabytes; asked for one
sentence it returns four. `SOURCES.txt` in that directory records the exact request each was
fetched with, and `npm run build:sentence -- --fonts` re-fetches them.

| File                                                            | Family                 | Licence                   |
| --------------------------------------------------------------- | ---------------------- | ------------------------- |
| `english.woff2`, `french.woff2`, `greek.woff2`, `russian.woff2` | Noto Serif             | SIL Open Font License 1.1 |
| `hebrew.woff2`                                                  | Noto Serif Hebrew      | SIL Open Font License 1.1 |
| `arabic.woff2`                                                  | Noto Naskh Arabic      | SIL Open Font License 1.1 |
| `hindi.woff2`                                                   | Noto Serif Devanagari  | SIL Open Font License 1.1 |
| `korean.woff2`                                                  | Noto Serif KR          | SIL Open Font License 1.1 |

Four of the eight are subsets of one family, which is why the frieze reads as one inscription in
several hands rather than several inscriptions. Arabic is the exception to the naming: Google
publishes no "Noto Serif Arabic", and Naskh is the Arabic serif tradition rather than a substitute
for one.

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

Licensing is the one that remains, and it is the cut the Library used to be making too — until the
four lines it was missing found reviewers and the refusal turned out to have been a queue. That is
the encouraging reading of this section and it should not be over-read: the Library's blocker was
finding four people, and this one is finding a cleared voice, which is the same *kind* of problem
and not the same size. Three routes are open and each needs a decision this file cannot make on
its own:

- **A public-domain recording.** Sound recordings published in the United States before 1930 are
  in the public domain under the Music Modernization Act, which reaches the acoustic Caruso sides
  and a good deal else. It costs a multi-megabyte binary in a repository whose only asset is an
  eight-line distance field, and a 78's usable band is roughly 200 Hz to 3 kHz, which is most of an
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
