# Résumé fonts

Two brand faces, vendored as woff2 and embedded into the print HTML by
`scripts/render-resume.mjs` as data URIs.

They are committed rather than fetched because **text metrics decide the PDF's
bytes**, and `npm run resume:check` compares those bytes to catch a stale
résumé. Rendering with whatever fonts happen to be installed would lay the page
out one way on a Windows box and another on ubuntu CI, and the check would fail
on every push for reasons that have nothing to do with the résumé. Embedding the
faces makes the render identical everywhere, and removes the network from a
build gate as a bonus.

The site itself still loads these from Google Fonts (`src/styles.css`) — that is
a page-weight decision, and unrelated.

| File                          | Family      | Source                                                                 |
| ----------------------------- | ----------- | ---------------------------------------------------------------------- |
| `cinzel-latin-var.woff2`      | Cinzel      | Google Fonts `cinzel` v26, `latin` subset, variable weight             |
| `crimson-pro-latin-var.woff2` | Crimson Pro | Google Fonts `crimsonpro` v28, `latin` subset, variable weight         |

Only the `latin` subset is vendored; the résumé contains no character outside
it, and the other subsets would quadruple the size for nothing.

## Licence

Both families are licensed under the SIL Open Font License 1.1, which permits
redistribution provided the licence travels with the font. `OFL-Cinzel.txt` and
`OFL-CrimsonPro.txt` are those licences, copied verbatim from the upstream
projects. Do not delete them.

## Replacing a font

Fetch the `latin` `@font-face` block's woff2 from the Google Fonts CSS API with a
browser `User-Agent` (it serves TTF to unrecognised clients), drop the file here,
update the table above and the licence beside it, then run `npm run resume:pdf`
and commit the regenerated PDF — the check will otherwise fail on the next push,
correctly.
