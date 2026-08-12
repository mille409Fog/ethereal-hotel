# What this site measures

Applications go out and nothing comes back. This site collects enough to tell whether a link was
opened and what was read, and deliberately not enough to tell who did it. Both halves are decisions;
this note is here so the second half is as legible as the first.

The same instinct as the accessibility comments in `src/styles.css` — say what was chosen and why,
where the next person will find it.

## What is collected

[Vercel Web Analytics](https://vercel.com/docs/analytics), served by the deployment itself from
`/_vercel/insights/script.js`. It is same-origin: there is no third-party host in the request, which
is also why there is nothing for a blocklist to match a hostname against.

Per page view, Vercel records the path, the referrer, and coarse device and location fields —
country, OS, browser, desktop or mobile. On top of that, this site fires three custom events:

| Event               | Fired when                                        | Properties                     |
| ------------------- | ------------------------------------------------- | ------------------------------ |
| `dashboard_reached` | `/dashboard` is opened                            | `transport`: socket or polling |
| `case_study_read`   | A case study on `/work` is read to the end        | `study`: the study's slug      |
| `resume_downloaded` | The resume link in the contact section is clicked | none                           |

Those three are the whole list, and they are a closed union in
[`analytics.service.ts`](../src/app/services/analytics.service.ts) rather than free strings, so this
table cannot quietly fall behind the code — `npm run check:docs` fails if it does.

Two honest caveats on what the numbers mean:

- **`resume_downloaded` counts clicks, not downloads.** The anchor carries a real `href` and a
  `download` attribute, so the file also arrives via middle click, "Save link as", and any path that
  never reaches the click handler. Those are downloads this never sees. Nothing is inferred about
  whether the transfer finished.
- **`case_study_read` is a rule, not a measurement of reading.** It requires that the end of the
  study came into view _and_ that the study had been on screen for at least twenty seconds. That
  threshold is a floor under "did not simply scroll past" — the studies run about four hundred words,
  so an actual reader needs minutes — and it is not evidence that anybody read anything. See
  `countsAsRead` in [`study-read.directive.ts`](../src/app/work/study-read.directive.ts).

## What is not collected

- **No cookies, and no `localStorage`.** Nothing is written to the visitor's machine, which is why
  there is no consent banner: there is no consent to collect. This is the reason for the provider
  choice, not a happy side effect of it.
- **No cross-site identifier, and no ad network.** Nothing here is shared with an advertising
  platform or joined to a profile from another site. Vercel derives a per-day visitor hash from
  request-level data and discards it every twenty-four hours, so a visitor cannot be followed across
  days, let alone across sites.
- **No raw IP addresses, and no fine-grained location.** Country, not city block.
- **Nothing anybody typed.** The event properties are typed as scalars only
  (`AnalyticsProperties`), and the three values ever sent are a transport name from configuration
  and a case-study slug from a compiled-in constant. There is no shape in that type that can carry a
  form field, a search string, or a URL with a query on it.
- **Nothing from the booking demo.** `/booking` writes to a database and none of it is reported
  here. What a visitor typed into a demo booking form is between them and the demo.

## Turning it off

Blocking the script disables all of it, and the site does not notice: every call goes through one
service that buffers into `window.vaq` and never retries, never reports, and never blocks a render.
No feature on this site is gated on analytics loading, and there is no fallback pixel or beacon —
when it is blocked, it is off.

That path is also the normal one in local development, where `/_vercel/insights/script.js` does not
exist. Fire an event under `ng serve` and read `window.vaq` in the console to check wiring without
deploying anything.
