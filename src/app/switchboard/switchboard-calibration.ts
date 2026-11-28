/**
 * The numbers `/switchboard`'s client is tuned by, in one place.
 *
 * The code's lifetime and the creation rate limit are the server's
 * (`CODE_LIFETIME` in `backend/services/switchboard.py`, `CREATE_LIMIT` in
 * `backend/routers/switchboard.py`) and are not copied here. The server reports
 * `expires_in` on every read while a code is waiting, so the client shows the
 * server's number and never needs its own.
 */

/**
 * How often each side asks the server for what the other side sent, while a
 * code is waiting or the browsers are connecting. Never once the channel is
 * open. SWITCHBOARD.md §Decisions has why this is a poll and not a socket.
 */
export const POLL_INTERVAL_MS = 500;

/**
 * How long this device waits for its own channel to open after the server
 * says the other device's already has.
 *
 * The two `open` events do not fire at the same instant. When the other
 * device reports first, this one's next poll or trickled candidate is refused
 * with a `409`, usually a few milliseconds before its own `open` arrives.
 * Treating that refusal as a failure would break most pairings, so the device
 * stops relaying and waits. Past this long, the channel the other device saw
 * is not coming, and the route says so.
 */
export const OPEN_GRACE_MS = 5000;

/**
 * The STUN servers each `RTCPeerConnection` is made with: Cloudflare's one.
 *
 * A STUN server learns the visitor's public address and port, so this list is
 * the route's one third party, and it lives here and nowhere else. Only
 * `SWITCHBOARD_PEER_CONNECTION`'s factory reads it, and `docs/analytics.md`
 * names the same host. The page logs what the connection reports in
 * `getConfiguration()` instead, so what it says is the browser's account and
 * not this constant's.
 *
 * Cloudflare over Google's `stun.l.google.com:19302`: both are free and need no
 * account, but only Cloudflare documents its server for other sites to use, so
 * only it can be disclosed without guessing. Without any server the browser
 * gathers host candidates only and `traversed` is impossible.
 *
 * Never a `turn:` URL (SWITCHBOARD.md §Decisions).
 */
export const ICE_SERVERS: readonly RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];

/** The label of the ordered, reliable data channel, the only one opened so far. */
export const RELIABLE_CHANNEL = 'reliable';
