import { CLOSED, Fetch, IRead, ISignal, SignalClient, SignalError, startPoll } from './signal';

/**
 * The client's job is to hold the token and the cursor, put them on the wire
 * where `routers/switchboard.py` expects them, and turn a `409` on the two
 * calls that can meet a closed pairing into `CLOSED` instead of an error.
 */

const API = 'http://api.test/api';

function respond(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function unreadable(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('not JSON');
    },
  } as unknown as Response;
}

describe('SignalClient', () => {
  let fetch: ReturnType<typeof vi.fn<Fetch>>;
  let client: SignalClient;

  const call = (index: number): { url: string; init: RequestInit } => {
    const [url, init] = fetch.mock.calls[index];
    return { url, init };
  };

  beforeEach(() => {
    fetch = vi.fn<Fetch>();
    client = new SignalClient(fetch, API);
  });

  it('creates with the offer, then addresses every call by code and token', async () => {
    fetch.mockResolvedValueOnce(
      respond(201, { code: 'ABC234', token: 'tok-o', expires_in: 120, relayed_bytes: 90 })
    );
    await expect(client.create('v=0 offer')).resolves.toEqual({
      code: 'ABC234',
      expiresIn: 120,
      relayedBytes: 90,
    });
    expect(call(0).url).toBe(`${API}/switchboard`);
    expect(call(0).init.method).toBe('POST');
    expect(call(0).init.body).toBe('{"offer":"v=0 offer"}');
    expect(call(0).init.headers).toEqual({ 'Content-Type': 'application/json' });

    fetch.mockResolvedValueOnce(respond(200, { state: 'waiting', relayed_bytes: 140 }));
    await expect(client.sendCandidate({ candidate: 'c', sdpMid: '0' })).resolves.toBe(140);
    expect(call(1).url).toBe(`${API}/switchboard/ABC234/candidates`);
    expect(call(1).init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Pairing-Token': 'tok-o',
    });

    fetch.mockResolvedValueOnce(respond(200, { state: 'open', relayed_bytes: 500 }));
    await expect(client.open()).resolves.toBe(500);
    expect(call(2).url).toBe(`${API}/switchboard/ABC234/open`);
    expect(call(2).init.headers).toEqual({ 'X-Pairing-Token': 'tok-o' });
  });

  it('joins by a normalised code, answers, and sends the token it was given', async () => {
    fetch.mockResolvedValueOnce(respond(200, { token: 'tok-a', offer: 'v=0 o', relayed_bytes: 7 }));
    await expect(client.join(' abc234 ')).resolves.toEqual({ offer: 'v=0 o', relayedBytes: 7 });
    expect(call(0).url).toBe(`${API}/switchboard/ABC234/join`);
    expect(call(0).init.headers).toEqual({});

    fetch.mockResolvedValueOnce(respond(200, { state: 'joined', relayed_bytes: 30 }));
    await expect(client.answer('v=0 a')).resolves.toBe(30);
    expect(call(1).url).toBe(`${API}/switchboard/ABC234/answer`);
    expect(call(1).init.body).toBe('{"sdp":"v=0 a"}');
    expect((call(1).init.headers as Record<string, string>)['X-Pairing-Token']).toBe('tok-a');
  });

  it('advances its cursor so a poll never asks twice for the same events', async () => {
    fetch.mockResolvedValueOnce(respond(200, { token: 't', offer: 'o', relayed_bytes: 1 }));
    await client.join('ABC234');

    fetch.mockResolvedValueOnce(
      respond(200, {
        state: 'joined',
        cursor: 2,
        events: [
          { kind: 'candidate', candidate: { candidate: 'a' } },
          { kind: 'candidate', candidate: { candidate: 'b' } },
        ],
        relayed_bytes: 50,
      })
    );
    const first = (await client.read()) as IRead;
    expect(first.events).toHaveLength(2);
    expect(first.expiresIn).toBeNull();
    expect(call(1).url).toBe(`${API}/switchboard/ABC234?cursor=0`);
    expect(call(1).init.method).toBe('GET');

    fetch.mockResolvedValueOnce(
      respond(200, { state: 'waiting', cursor: 2, events: [], expires_in: 80, relayed_bytes: 60 })
    );
    await expect(client.read()).resolves.toEqual({
      state: 'waiting',
      events: [],
      expiresIn: 80,
      relayedBytes: 60,
    });
    expect(call(2).url).toBe(`${API}/switchboard/ABC234?cursor=2`);
  });

  it('reads a 409 on a poll or a candidate as the other device having opened', async () => {
    const closed = { detail: { message: 'talking directly', field: null } };
    fetch.mockResolvedValue(respond(409, closed));
    await expect(client.read()).resolves.toBe(CLOSED);
    await expect(client.sendCandidate({ candidate: 'c' })).resolves.toBe(CLOSED);
  });

  it('still throws a 409 on the answer, which nothing can have closed yet', async () => {
    fetch.mockResolvedValue(respond(409, { detail: { message: 'already answered', field: null } }));
    await expect(client.answer('a')).rejects.toMatchObject({
      status: 409,
      message: 'already answered',
    });
  });

  it('carries the field the server blamed, so the page can show it under the input', async () => {
    fetch.mockResolvedValue(
      respond(404, { detail: { message: 'No introduction', field: 'code' } })
    );
    const error = await client.join('ZZZZZZ').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SignalError);
    expect(error).toMatchObject({ status: 404, field: 'code', message: 'No introduction' });
  });

  it("reads FastAPI's own validation body, and copes with none at all", async () => {
    fetch.mockResolvedValueOnce(
      respond(422, { detail: [{ loc: ['body', 'offer'], msg: 'too long' }] })
    );
    await expect(client.create('x')).rejects.toMatchObject({
      status: 422,
      message: 'too long',
      field: null,
    });

    fetch.mockResolvedValueOnce(unreadable(502));
    await expect(client.create('x')).rejects.toMatchObject({
      status: 502,
      message: 'The switchboard refused the request (HTTP 502).',
    });
  });

  it('says the server is unreachable when fetch itself fails, and does not call that closed', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(client.read()).rejects.toMatchObject({
      status: 0,
      message: 'The switchboard is unreachable.',
    });
  });
});

describe('startPoll', () => {
  const read = (overrides: Partial<IRead> = {}): IRead => ({
    state: 'waiting',
    events: [],
    expiresIn: 100,
    relayedBytes: 10,
    ...overrides,
  });

  function fakeSignal(reads: ISignal['read']): ISignal {
    return {
      create: vi.fn(),
      join: vi.fn(),
      answer: vi.fn(),
      sendCandidate: vi.fn(),
      open: vi.fn(),
      read: vi.fn(reads),
    };
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads at once, then again an interval after each read was handled', async () => {
    const signal = fakeSignal(async () => read());
    const handled = vi.fn(async () => undefined);
    const poll = startPoll(signal, 500, { read: handled, closed: vi.fn(), error: vi.fn() });

    await vi.advanceTimersByTimeAsync(0);
    expect(handled).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(signal.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(handled).toHaveBeenCalledTimes(2);

    poll.stop();
    poll.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(signal.read).toHaveBeenCalledTimes(2);
  });

  it('stops itself on CLOSED and reports it', async () => {
    const signal = fakeSignal(async () => CLOSED);
    const closed = vi.fn();
    startPoll(signal, 500, { read: vi.fn(), closed, error: vi.fn() });

    await vi.advanceTimersByTimeAsync(5000);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(signal.read).toHaveBeenCalledTimes(1);
  });

  it('stops itself on an error, including one thrown while handling a read', async () => {
    const signal = fakeSignal(async () => read());
    const error = vi.fn();
    startPoll(signal, 500, {
      read: async () => {
        throw new Error('bad candidate');
      },
      closed: vi.fn(),
      error,
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(error).toHaveBeenCalledWith(new Error('bad candidate'));
    expect(signal.read).toHaveBeenCalledTimes(1);
  });

  it('schedules nothing after a read whose handler stopped it, as opening the channel does', async () => {
    const signal = fakeSignal(async () => read());
    const poll: { current: { stop(): void } | null } = { current: null };
    poll.current = startPoll(signal, 500, {
      read: async () => poll.current?.stop(),
      closed: vi.fn(),
      error: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(signal.read).toHaveBeenCalledTimes(1);
  });

  it('discards a read that lands after it was stopped, whatever it carried', async () => {
    let settle: (value: IRead) => void = () => undefined;
    let fail: (reason: unknown) => void = () => undefined;
    const pending = (): Promise<IRead> =>
      new Promise<IRead>((resolve, reject) => {
        settle = resolve;
        fail = reject;
      });
    const handlers = { read: vi.fn(), closed: vi.fn(), error: vi.fn() };

    const first = startPoll(fakeSignal(pending), 500, handlers);
    first.stop();
    settle(read());
    await vi.advanceTimersByTimeAsync(0);

    const second = startPoll(fakeSignal(pending), 500, handlers);
    second.stop();
    fail(new Error('late'));
    await vi.advanceTimersByTimeAsync(0);

    expect(handlers.read).not.toHaveBeenCalled();
    expect(handlers.error).not.toHaveBeenCalled();
  });
});
