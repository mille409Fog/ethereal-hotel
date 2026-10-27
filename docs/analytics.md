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

- **No cookies, and nothing stored for measurement.** Analytics writes nothing to the visitor's
  machine, which is why there is no consent banner: there is no consent to collect. This is the
  reason for the provider choice, not a happy side effect of it. The one thing the site does store
  is described under [What the site keeps for you](#what-the-site-keeps-for-you), and it is not
  measurement.
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

## What the site keeps for you

`/wanderquest` lets a visitor mark the places they have been. Those marks are saved in the
browser's `localStorage`, under the single key `wanderquest.guest.v1`, as four lists of place
codes — `{"states":["CA","OR"],"bonus":[],…}` and nothing more. They are written only when the visitor ticks or unticks a place,
read back only by that page, and never leave the browser: no backend call carries them, no analytics
event reports them, and the owner's own progress is a committed file that a visitor's marks never
touch.

That is why it needs no consent either. The ePrivacy rule that drives cookie banners exempts storage
that is strictly necessary for a service the visitor explicitly asked for, and a record of places
the visitor ticked, kept so it is still there when they come back, is exactly that service. It is
not used to recognise anyone, it holds nothing the visitor did not put there, and the page's clear
control (or clearing site data) removes it. Where the browser refuses storage, the page still works
and says the marks will not be kept. See
[`guest-progress.ts`](../src/app/wanderquest/guest-progress.ts).

## Turning it off

Blocking the script disables all of it, and the site does not notice: every call goes through one
service that buffers into `window.vaq` and never retries, never reports, and never blocks a render.
No feature on this site is gated on analytics loading, and there is no fallback pixel or beacon —
when it is blocked, it is off.

That path is also the normal one in local development, where `/_vercel/insights/script.js` does not
exist. Fire an event under `ng serve` and read `window.vaq` in the console to check wiring without
deploying anything.
