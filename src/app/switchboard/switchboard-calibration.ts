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

/** The label of the ordered, reliable data channel, the only one opened so far. */
export const RELIABLE_CHANNEL = 'reliable';
