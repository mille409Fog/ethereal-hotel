# SWITCHBOARD — two of your own machines, introduced and then left alone

A route, `/switchboard`, that connects the visitor's laptop to their phone with a WebRTC data
channel, then shows what flows between them. The server takes part only in the introduction. It
relays an offer, an answer and a handful of ICE candidates, then forgets them. The route is
named for that: a hotel switchboard connects two parties and does not stay on the line.

This is the whole plan: what the piece is, the decisions already taken and why, and the phases,
each with a Definition of Done so that one instance can build a phase and another can verify it.
Three items have landed: the `Pairing` table with `services/switchboard.py`;
`routers/switchboard.py`; and the introduction itself, `src/app/switchboard/` with `peer/` and
`signal/`, which pairs two tabs over host candidates. Their headers record what was decided while
building them (per-side tokens, the cursor, why `record_open` is never charged, why the rate limit
is per instance, why a `409` on a poll or a candidate means the other device opened first and is
waited out rather than reported, why candidates are held until the server will take them).

**Phases are deleted as they land and the rest renumbered from 0**, as `ROADMAP.md` does. The
reasoning that survives a finished phase moves into the header of the file it describes. So a
phase number is a position in a queue; never cite one from outside this file.

## The piece

The laptop opens `/switchboard` and shows a QR code and a six-character code. The phone scans
it and opens the same route with the code in the URL. For two or three seconds both screens show
the introduction as it happens, line by line: the offer's size in bytes, each ICE candidate as
it is found (host, server-reflexive) and which pair the browsers chose. Then both screens show
one sentence, _You are now talking directly; the server has stopped relaying_, and a counter
that has stopped at the number of bytes the server ever relayed for this pair.

From then on, the screens show three things travelling between the two devices:

1. **Round-trip time**, as a live histogram of ping/pong over the channel, timestamped by the
   sender's own `performance.now()`, so no clock sync is needed.
2. **Head-of-line blocking, shown rather than described.** Two channels on one connection: one
   ordered and reliable, one unordered with `maxRetransmits: 0`. The phone sends a numbered
   message every 16 ms on both. The laptop draws the arrival order of each. On a clean network
   they look the same. Walk the phone to the edge of the Wi-Fi and the reliable channel stalls
   and then bursts, while the unreliable one keeps time and drops numbers. Nothing on screen is
   staged. It shows how the visitor's own network behaves.
3. **The phone's orientation** (`deviceorientation`, after the permission prompt iOS requires),
   sent on the unreliable channel and drawn on the laptop as one rotating outline. The newest
   reading is the only one worth having, so this channel is the right one for it.

### What is real, and the one thing that is not

Everything is real: the candidates are the browsers', the RTTs are the channel's, and the
dropped numbers really were dropped. There is no simulated network.

**What is missing is a relay, and the piece says so instead of faking one.** Two devices behind
a symmetric NAT, or a network that blocks UDP, cannot connect without TURN. A TURN relay forwards
every byte, which means bandwidth, and bandwidth costs money. When ICE fails, the route does not
quietly fall back to relaying through the API. It says what happened: no direct path exists
between these two networks, the usual fix is a relay, and this site does not run one. Then it
suggests putting both devices on the same Wi-Fi, which yields a host-candidate pair.

### Four states, said on screen

| State       | When                                              | What the line says                                              |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------- |
| `waiting`   | A code exists and nobody has joined               | The code, its expiry, and that the server holds only this code  |
| `direct`    | ICE selected a `host` pair                        | Connected on the local network; the server is out of the call   |
| `traversed` | ICE selected a `srflx` pair                       | Connected across the internet through a NAT, without a relay    |
| `no-route`  | ICE failed, or `RTCPeerConnection` does not exist | Why, and what would fix it (same Wi-Fi), and that no relay runs |

The pair type comes from `getStats()` (`candidate-pair` → `local-candidate.candidateType`), not
from a guess. That makes it the one fact here that a visitor cannot easily check from a terminal,
so the route prints the selected pair's raw stats under the state line.

## Decisions already taken

- **The server relays the introduction and nothing else, and counts what it relayed.** Every
  signaling request adds to a `relayed_bytes` column on the pairing row. The number is shown on
  both screens and stops moving the moment the data channel opens. That stop is the route's
  thesis, made visible.
- **Signaling is short polling, not a WebSocket.** The Vercel function has no socket (see
  `api/index.py`), and the introduction lasts seconds. Each side polls
  `GET /api/switchboard/{code}` at 500 ms while `waiting` or connecting, and never again once
  the channel is open. A third transport just for this would be a second `/ws` that works only in
  the container.
- **Trickle ICE over the poll, not one fat offer.** Vanilla ICE waits for gathering to finish and
  makes the introduction take as long as the slowest STUN reply. Trickling candidates through
  the poll is how real clients do it, and it puts each candidate on screen as it is found.
- **One STUN server, named on screen.** Without STUN only host candidates exist and `traversed`
  is impossible. STUN learns the visitor's public address, so the route says which server it
  asked. `stun.cloudflare.com:3478` is the proposed choice: free, no account. Settle it with
  the owner in Phase 0, because it adds a third party. `docs/analytics.md` gains a paragraph, because a third party now learns a
  visitor's IP when they open this route. The STUN request is not sent until the visitor presses
  **Connect**, so merely opening the page tells Cloudflare nothing.
- **No TURN, permanently.** See above. The free TURN tiers that exist need an account and
  short-lived credentials minted per session. That is a credential flow on a route with no auth,
  and a bandwidth bill held off only by a quota. Recorded so nobody adds one to make `no-route`
  go away.
- **The pairing code is short, short-lived and single-use.** Six characters from an alphabet
  without lookalikes (`23456789ABCDEFGHJKMNPQRSTVWXYZ`, 30⁶ ≈ 7.3 × 10⁸). It expires after 120
  s, is consumed by the first join, and the row is deleted 60 s after the channel opens or the
  code expires. SDP carries IP addresses, and keeping them longer than needed would be the only
  personal data this site stores. Rate-limit creation per IP in the router, with the limit kept
  in a calibration constant.
- **Nothing crosses the channel that the server could not see anyway, and nothing is stored.**
  The messages are numbers and quaternions. No text box, no file transfer: a peer-to-peer
  channel with a text box is a chat app with no moderation, attached to a portfolio.
- **The QR encoder is ours, not a dependency.** Byte mode, error-correction level M, versions 1
  to 4 are enough for a URL with a six-character code. That is about 300 lines of TypeScript
  against ISO/IEC 18004, tested against reference vectors. The site adds a dependency only when
  writing the code would be the riskier choice, and here it is not.
- **No WebRTC library.** `RTCPeerConnection` is the API. A wrapper such as simple-peer hides
  exactly the parts this route exists to show.
- **Reduced motion still connects.** The histogram updates without animating, and the
  orientation outline is replaced by three numbers.

## The same open decision as `PORTER.md`

A pairing row must be visible to both devices' requests, and on Vercel those can land on two
instances, each seeding its own SQLite in `/tmp`. If the laptop's offer is written on one
instance and the phone polls another, the phone never sees it. Unlike Porter, this route would
not just show a partial history. It would not work at all.

So `/switchboard` on Vercel **requires a shared store**. The recommendation is the one in
`PORTER.md`: a free-tier hosted Postgres behind its own `DATABASE_URL`-style variable, created
by the owner, and only these tables live there. If Porter has already landed, use its engine.
Pairing rows are tiny and live for two minutes, so free-tier storage is no concern here, but
suspend-on-idle is: the first `POST` after a quiet hour waits for the database to wake, and the
`waiting` line shows that wait instead of hiding it.

Without the shared store the route shows `no-route` with a different reason (this deployment
cannot introduce two devices) and the container stack works fully. That fallback is built
either way.

## Traps specific to this piece

- **`getStats()` field names have changed more than once.** Read `candidateType` from the
  `local-candidate` report that the selected `candidate-pair` points at. Do not read it from the
  deprecated `googCandidatePair`, and do not infer it from the address.
- **iOS asks for orientation permission and only inside a user gesture.**
  `DeviceOrientationEvent.requestPermission()` must be called in the **Connect** tap's handler.
  Called anywhere else it rejects without saying why.
- **mDNS host candidates.** Chrome hides local IPs behind `*.local` names. They still pair on the
  same LAN, so do not filter them out as unresolvable. The candidate list should show the name,
  and the explanation beside it should say why it is not an address.
- **`maxRetransmits: 0` and `ordered: false` are separate options.** The unreliable channel needs
  both, or it is unordered but reliable, and the head-of-line demonstration shows nothing.
- **The e2e suite stubs the backend at the network layer.** For a pairing test, the stub in
  `e2e/support/backend.ts` must hold state between two browser contexts. Two contexts in one
  Chromium should pair over host candidates on CI's loopback, which would make the `direct`
  state testable without STUN. **Measured on this box, not yet on CI:** on 2026-11-22 two
  contexts in Playwright's headless shell on Windows, against the real backend and `ng serve`,
  reached `direct` in about 840 ms over mDNS host candidates. Both screens froze at the same
  count, no request left either page in the following minute, and a `join` on the code 65 s
  after open was a `404`. The wiring phase's e2e spec settles it on CI's Linux shell. Never point
  CI at the real STUN server.
- **The QR code must be real DOM text too.** The six-character code stays visible as text beside
  it, for axe and for a visitor without a camera.
- **Do not turn the histogram into decoration.** It changes only when a pong arrives; it is not
  animated between readings.

## Layout

```text
backend/
  db/models.py               + Pairing (code, offer, answer, candidates JSON, relayed_bytes,
                               created_at, joined_at, opened_at)
  services/switchboard.py    create, join, answer, append_candidate, read, record_open, expire
  routers/switchboard.py     POST /api/switchboard, GET /api/switchboard/{code},
                             POST /api/switchboard/{code}/{join,answer,candidates,open}
src/app/switchboard/
  switchboard.ts .html .css .spec.ts
  switchboard.tokens.ts        the peer-connection factory, the signal factory, the query string
  peer/          peer.ts       RTCPeerConnection, both channels, the stats read; behind a token
                 peer-connection.testing.ts   the fake RTCPeerConnection the specs drive
  signal/        signal.ts     the six calls and the poll; stops when the channel opens
  qr/            qr.ts         the encoder (leaf, importable by Node) + qr.spec.ts vectors
  readouts/      rtt-histogram, arrival-order, orientation
  switchboard-calibration.ts   poll interval, expiry, rate limit, message cadence
e2e/switchboard.spec.ts       two contexts, one pairing, `direct`
```

## The phases

### Phase 0 — two devices

1. `qr.ts`, with reference vectors in its spec, and the QR code on the `waiting` screen.
2. Cloudflare STUN behind **Connect**, the `traversed` state, and the `no-route` state with its
   reason. Test `no-route` with a fake peer whose ICE fails. Do not test it against a real
   network. Both taps start the introduction today, **Get a code** on the offering device and
   **Connect** on the joining one, and nothing is sent before either. So the ICE servers belong
   in `SWITCHBOARD_PEER_CONNECTION`'s factory, which is first called inside those handlers.
   `STAGE_BY_CANDIDATE` already maps `srflx` and `prflx` to `traversed`; without STUN nothing
   reaches it. An ICE failure today is a generic `refused` line, which becomes `no-route`.
3. The selected pair's raw stats printed under the state line.
4. `docs/analytics.md`: the STUN paragraph.

**DoD.** A phone on mobile data pairs with the laptop on Wi-Fi and shows `traversed`, or shows
`no-route` with the correct reason. Both outcomes are recorded in this file, with the carrier
and the router, as the first field measurement.

### Phase 1 — what flows

1. Ping/pong and the RTT histogram.
2. The two channels and the arrival-order readout, at the cadence in
   `switchboard-calibration.ts`.
3. Orientation on the unreliable channel, with the iOS permission inside the tap.
4. Reduced-motion variants.

**DoD.** Walking the phone away from the router produces a visible stall-and-burst on the
reliable channel and gaps on the unreliable one. A screenshot of both readouts at that moment is
committed to `docs/images/` and described in ARCHITECTURE. The component spec covers all four
states. `npm test` coverage has not fallen.

### Phase 2 — the wiring

1. `vercel.json`'s rewrite, `src/route-meta.json`, and the card in `projects.data.ts`. The lazy
   route is already registered in `app.routes.ts` with its title written inline, so two tabs
   could pair in development. Move its path and title into `route-meta.json` like every other
   route's. Build with `npm run build`.
2. `e2e/switchboard.spec.ts`: two contexts reach `direct` through the stubbed signaling. The
   `waiting` screen passes axe.
3. `e2e/project-frames.spec.ts`: a recipe anchored on the `waiting` screen (the code is seeded
   in the stub, so the frame is stable), then run `npm run frames:capture`.
4. ARCHITECTURE gains a §Peer-to-peer covering the endpoints, the four states, the no-TURN
   decision, the STUN disclosure and the shared-store requirement.
5. `CLAUDE.md` gains a doc-map row and §Don't helpfully add these gains "no TURN relay".
   `check:docs` gains checks that no `turn:` URL appears under `src/app/switchboard/`, that the
   STUN request sits behind the **Connect** handler, and that `docs/analytics.md` names the STUN
   host the code uses.
6. All six gates, `npm run e2e` and `npm run check:docs`, green.

**DoD.** The card is on the home page with a committed frame, and a phone and a laptop on the
same Wi-Fi pair on the production deployment.

## Rules for every phase

- **The server's part ends when the channel opens.** Any feature that needs the server after that
  belongs in `PORTER.md` or nowhere.
- **Every state is the browser's own report.** Never infer `direct` from a fast RTT.
- **Delete what you do not need.** Pairing rows, logs and candidates go when their minute is up.
  This route holds the only IP addresses the site ever stores, and only for that minute.
- **$0.** No TURN, no paid signaling service, no service the owner has not created themselves.
- **When a phase lands**: delete it here, renumber, move what was learned into the header of the
  file it concerns, and add this file to `CLAUDE.md`'s doc map or update its size there.
