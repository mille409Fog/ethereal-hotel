/**
 * `/switchboard`'s side of the introduction: the six signaling calls and the
 * poll that carries the other device's half.
 *
 * `window.fetch` against `environment.apiUrl`, like `BookingApiService`, and
 * the wire names stay snake_case at the edge of this file. Each `SignalClient`
 * is one pairing. It keeps the token that `create` or `join` handed out and
 * sends it as `X-Pairing-Token` on everything after. It also keeps the read
 * cursor, so a poll never asks for, or pays the server's count for, what it
 * already has.
 *
 * **A `409` from `read` or `sendCandidate` means the other device's channel is
 * open, and comes back as {@link CLOSED} rather than as an error.** The server
 * maps three refusals to `409` (`CodeAlreadyUsed`, `OutOfTurn`,
 * `PairingClosed`), but only one of them can reach these two calls from this
 * client. `CodeAlreadyUsed` is raised only by `join`. `OutOfTurn` on a
 * candidate means the joiner trickled before it answered, and the component
 * holds every candidate until its answer has been accepted. So the `409` here
 * is `PairingClosed`: the other device reported its channel open and the
 * server has stopped relaying.
 *
 * It can arrive **before** this device's own channel opens. The two `open`
 * events fire at slightly different moments, and the poll keeps running until
 * this one's does. So `CLOSED` is not a failure. The component stops relaying
 * and waits for its own `open` (`OPEN_GRACE_MS` in the calibration).
 *
 * A `409` from `answer` is still an error. The offerer's channel cannot open
 * before the answer it needs has been relayed, so nothing can have closed the
 * pairing yet.
 */

/** The server's view of a pairing, as every read reports it. */
export type PairingState = 'waiting' | 'joined' | 'open';

/** One thing the other device sent, in the order it sent it. */
export type SignalEvent =
  { kind: 'answer'; sdp: string } | { kind: 'candidate'; candidate: RTCIceCandidateInit };

/** What `create` returns: the code to show, and the server's count so far. */
export interface ICreated {
  code: string;
  expiresIn: number;
  relayedBytes: number;
}

/** What `join` returns: the offer to answer, and the count. */
export interface IJoined {
  offer: string;
  relayedBytes: number;
}

/** One poll's worth: what the other device sent since the last one. */
export interface IRead {
  state: PairingState;
  events: SignalEvent[];
  /** Seconds left on the code while nobody has joined; `null` after. */
  expiresIn: number | null;
  relayedBytes: number;
}

/** The other device reported its channel open, so the server relays no more. */
export const CLOSED = 'closed';
export type Closed = typeof CLOSED;

/** The six calls, as the component sees them. A spec supplies a fake. */
export interface ISignal {
  create(offer: string): Promise<ICreated>;
  join(code: string): Promise<IJoined>;
  /** Resolves to the server's count after the answer was relayed. */
  answer(sdp: string): Promise<number>;
  sendCandidate(candidate: RTCIceCandidateInit): Promise<number | Closed>;
  read(): Promise<IRead | Closed>;
  /** Reports this device's channel open and resolves to the frozen count. */
  open(): Promise<number>;
}

/**
 * A request the server refused, or could not be made.
 *
 * `field` is the server's: `"code"` for a mistyped, expired or used code, so
 * the page can put the message under the code's input.
 */
export class SignalError extends Error {
  /** HTTP status, or 0 when the request never got a response. */
  public readonly status: number;
  public readonly field: string | null;

  constructor(message: string, status: number, field: string | null = null) {
    super(message);
    this.name = 'SignalError';
    this.status = status;
    this.field = field;
  }
}

/** The subset of `fetch` this file calls, so a spec can supply one. */
export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

interface IWireRead {
  state: PairingState;
  cursor: number;
  events: SignalEvent[];
  expires_in?: number;
  relayed_bytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The server's `{ message, field }`, or the first of FastAPI's own located
 * issues when validation refused the request before a handler ran.
 */
function readDetail(body: unknown, status: number): SignalError {
  const detail = isRecord(body) ? body['detail'] : undefined;
  if (isRecord(detail) && typeof detail['message'] === 'string') {
    const field = typeof detail['field'] === 'string' ? detail['field'] : null;
    return new SignalError(detail['message'], status, field);
  }
  if (Array.isArray(detail) && isRecord(detail[0]) && typeof detail[0]['msg'] === 'string') {
    return new SignalError(detail[0]['msg'], status);
  }
  return new SignalError(`The switchboard refused the request (HTTP ${status}).`, status);
}

/** One pairing's worth of signaling. Make a new one for each attempt. */
export class SignalClient implements ISignal {
  private token: string | null = null;
  private code: string | null = null;
  private cursor = 0;

  constructor(
    private readonly fetch: Fetch,
    private readonly apiUrl: string
  ) {}

  public async create(offer: string): Promise<ICreated> {
    const body = await this.send<{
      code: string;
      token: string;
      expires_in: number;
      relayed_bytes: number;
    }>('', { method: 'POST', body: JSON.stringify({ offer }) });
    this.code = body.code;
    this.token = body.token;
    return { code: body.code, expiresIn: body.expires_in, relayedBytes: body.relayed_bytes };
  }

  public async join(code: string): Promise<IJoined> {
    this.code = code.trim().toUpperCase();
    const body = await this.send<{ token: string; offer: string; relayed_bytes: number }>('/join', {
      method: 'POST',
    });
    this.token = body.token;
    return { offer: body.offer, relayedBytes: body.relayed_bytes };
  }

  public async answer(sdp: string): Promise<number> {
    const body = await this.send<{ relayed_bytes: number }>('/answer', {
      method: 'POST',
      body: JSON.stringify({ sdp }),
    });
    return body.relayed_bytes;
  }

  public async sendCandidate(candidate: RTCIceCandidateInit): Promise<number | Closed> {
    return this.closedOn409(async () => {
      const body = await this.send<{ relayed_bytes: number }>('/candidates', {
        method: 'POST',
        body: JSON.stringify(candidate),
      });
      return body.relayed_bytes;
    });
  }

  public async read(): Promise<IRead | Closed> {
    return this.closedOn409(async () => {
      const body = await this.send<IWireRead>(`?cursor=${this.cursor}`, { method: 'GET' });
      this.cursor = body.cursor;
      return {
        state: body.state,
        events: body.events,
        expiresIn: body.expires_in ?? null,
        relayedBytes: body.relayed_bytes,
      };
    });
  }

  public async open(): Promise<number> {
    const body = await this.send<{ relayed_bytes: number }>('/open', { method: 'POST' });
    return body.relayed_bytes;
  }

  private async closedOn409<T>(call: () => Promise<T>): Promise<T | Closed> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof SignalError && error.status === 409) {
        return CLOSED;
      }
      throw error;
    }
  }

  /** `path` follows `/api/switchboard/{code}`, or `/api/switchboard` before a code exists. */
  private async send<T>(path: string, init: RequestInit): Promise<T> {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.token !== null) {
      headers['X-Pairing-Token'] = this.token;
    }
    const base = `${this.apiUrl}/switchboard`;
    const url =
      this.code === null ? `${base}${path}` : `${base}/${encodeURIComponent(this.code)}${path}`;

    let response: Response;
    try {
      response = await this.fetch(url, { ...init, headers });
    } catch {
      throw new SignalError('The switchboard is unreachable.', 0);
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw readDetail(body, response.status);
    }
    return body as T;
  }
}

/** What a poll hands back to whoever started it. */
export interface IPollHandlers {
  /** Awaited before the next read is scheduled, so events are applied in order. */
  read(result: IRead): Promise<void>;
  closed(): void;
  error(error: unknown): void;
}

/** A running poll. `stop` is idempotent and also discards a read in flight. */
export interface IPoll {
  stop(): void;
}

/**
 * Read now, then every `intervalMs` after each read has been handled.
 *
 * A chain of timeouts rather than an interval, so a slow server or a slow
 * `addIceCandidate` never stacks two reads on one cursor. The poll stops itself
 * on `CLOSED` and on an error, and the owner stops it when the channel opens.
 */
export function startPoll(signal: ISignal, intervalMs: number, handlers: IPollHandlers): IPoll {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async (): Promise<void> => {
    timer = null;
    try {
      const result = await signal.read();
      if (stopped) {
        return;
      }
      if (result === CLOSED) {
        stopped = true;
        handlers.closed();
        return;
      }
      await handlers.read(result);
    } catch (error) {
      if (!stopped) {
        stopped = true;
        handlers.error(error);
      }
      return;
    }
    if (!stopped) {
      timer = setTimeout(() => void tick(), intervalMs);
    }
  };

  void tick();
  return {
    stop: (): void => {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
