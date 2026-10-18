# Brand fonts

Two faces, vendored as woff2. There is one copy of each, and three things read it:

- `scripts/render-resume.mjs` embeds them into the résumé as data URIs.
- `src/styles.css` declares them with `@font-face`; the Angular build resolves the relative `url()`
  and serves hashed copies under `media/`.
- `scripts/gen-social-assets.mjs` embeds them into the social card.

They are committed rather than fetched because **text metrics decide the PDF's layout**, and
`npm run resume:check` fails when a re-render stops matching. Rendering with whatever fonts happen to
be installed would lay the page out one way on a Windows box and another on ubuntu CI. Embedding the
faces makes the layout identical everywhere, and removes the network from a build gate as a bonus.
Serving the site from the same files means it asks no third-party host for anything, and cannot
drift onto a different cut of a face than the résumé.

| File                             | Family         | Source                                                            |
| -------------------------------- | -------------- | ----------------------------------------------------------------- |
| `source-serif-4-latin-var.woff2` | Source Serif 4 | Google Fonts `sourceserif4` v15, `latin` subset, variable weight |
| `source-sans-3-latin-var.woff2`  | Source Sans 3  | Google Fonts `sourcesans3` v20, `latin` subset, variable weight  |

Only the `latin` subset is vendored; nothing on the site or the résumé falls outside it, and the
other subsets would multiply the size for nothing. Source Serif 4 is the weight-only file, without
its optical-size axis: with the axis it is 122KB, without it 51KB, and only the headings use it.

## Licence

Both families are licensed under the SIL Open Font License 1.1, which permits redistribution
provided the licence travels with the font. `OFL-SourceSerif4.txt` and `OFL-SourceSans3.txt` are
those licences, copied verbatim from the upstream `google/fonts` repository. Do not delete them.

## Replacing a font

Fetch the `latin` `@font-face` block's woff2 from the Google Fonts CSS API with a browser
`User-Agent` (it serves TTF to unrecognised clients), drop the file here, update the table above and
the licence beside it, and point `src/styles.css`, `render-resume.mjs` and `gen-social-assets.mjs`
at it. Then run `npm run resume:pdf` and `npm run gen:social` and commit what they write — the
résumé check will otherwise fail on the next push, correctly.
