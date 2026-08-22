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
to a single aria. **Everything on this floor is the author's own, nothing on it is licensed from
anybody, and it makes no sound.** The last of those is the room rather than a gap in it, and this
section is why.

### What ships

| Item                                                | Provenance                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The aria's melody, in `src/aubade/box.ts` as `ARIA` | The author's own, written for this piece. Nineteen notes in D minor, notated as semitones from middle C. Not transcribed from, quoted from, or derived from any existing work. |
| The voice's spectrum, in `bandsFor`                 | A model, not a recording. A harmonic series under three formants, computed from the pitch. Nothing is sampled and nothing is played.                                           |

### Why there is no sound

**No `AudioContext` exists anywhere in `src/aubade/`.** Nothing plays, and no visitor is asked to
click before a room will work. What drives the geometry is the score above, evaluated at the
room's clock and reduced to eight frequency bands — the same eight bands an `AnalyserNode` would
hand back, binned the same way.

The reason is not a licence that could not be obtained. **The aria has never been sung.** It is a
score: nineteen notes written for this hotel, performed by nobody, and the tiers moving beyond the
balustrade are the only performance it has ever had. AUBADE's second non-negotiable is _"It
refuses"_, and this is the one floor that turns the refusal on the work itself rather than on the
visitor — who is sitting in the best seat in the house and cannot hear a thing.

That was not the plan, and the way it stopped being the plan is worth recording. The phase note
put this floor last because _"audio licensing and autoplay policy are the two things most likely
to eat a week"_, and both were expected to be fought. Neither was. Autoplay is answered by the
piece being silent, since a work with no audio graph has no autoplay policy to lose to. And
licensing turned out never to apply: `ARIA` is the author's own, so there was no third party to
clear and there never had been. This section spent a while describing a floor waiting on
provenance. It was a floor that had already found its ending.

### The route that was declined

One way of making this floor audible is worse than the others and is recorded here so it is not
revisited. **Do not drop in a public-domain recording.**

- **A public-domain recording.** Under the Music Modernization Act a sound recording published in
  the United States falls into the public domain 100 years after publication, on the 1 January
  following — so the line moves a year every January. Written in 2026 it stands at 1925 and
  earlier, which reaches every Caruso side and a good deal else. Three costs, and the first one
  decides it. **Such a recording does not sing this aria** — `ARIA` is the author's own and a
  cleared Caruso side is Verdi, so this route does not find a voice for the score, it replaces the
  score, and what is left is a floor about somebody else's opera. Second, a 78's usable band is
  roughly 200 Hz to 3 kHz against eight bands running to 8 kHz: the lowest and the top two arrive
  empty and stay empty, and the vector that `bandsFor` exists to keep from being a loudness meter
  becomes one. Third, the _recording_ being public domain is not the _transfer_ being free, which
  is where this route fails — UCSB licenses its restorations CC BY-NC and charges a use fee for
  them, the Great 78 Project's rights page reads research and private study only and its
  proprietors settled with UMG in 2025 on confidential terms, and the National Jukebox streams
  under a gratis licence from Sony rather than a rights determination. Per-file reviewed statements
  do exist on Wikimedia Commons. They are still Verdi. And it still costs a multi-megabyte binary
  in a repository whose only asset is an eight-line distance field.

The other two ways — a singer recorded for this piece, or synthesis from the score, which needs no
licence at all — are not declined on the merits. They are simply not this floor. Either would make
the aria audible, and in doing so would replace a room about not hearing it with a room about
hearing it. That is a new floor, not a finished one.

**The floor is silent and it says so out loud** — on the plate, in the prose under the room, and in
the Reader's Edition — because a room that quietly did not do the thing its own documentation
describes would be the failure this file exists to prevent.

**The option is not burned.** `voiceAt` in `src/aubade/box.ts` returns a band vector rather than a
pitch precisely so that a read of an `AnalyserNode` can replace it, and nothing in the shader, the
rig, the uniforms or the committed frames would change. That seam was built before there was any
decision to use it, and it stays built.
