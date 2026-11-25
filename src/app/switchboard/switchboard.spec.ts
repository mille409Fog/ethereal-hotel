import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FakePeerConnection, selectedPairStats } from './peer/peer-connection.testing';
import { encodeQr, qrPath } from './qr/qr';
import { CLOSED, Closed, ICreated, IJoined, IRead, ISignal, SignalError } from './signal/signal';
import { OPEN_GRACE_MS, POLL_INTERVAL_MS } from './switchboard-calibration';
import { Switchboard } from './switchboard';
import {
  SWITCHBOARD_ORIGIN,
  SWITCHBOARD_PEER_CONNECTION,
  SWITCHBOARD_SEARCH,
  SWITCHBOARD_SIGNAL,
} from './switchboard.tokens';

/**
 * The component spec plays both the browser (a fake `RTCPeerConnection`) and
 * the server (a fake `ISignal`), and asserts the protocol between them: the
 * code is shown only once the server issued it, candidates wait until the
 * server would take them, the poll stops for good when the channel opens, the
 * state is whatever `getStats()` says, and a `409` before this device's own
 * `open` is waited out rather than reported as a failure.
 */

const HOST = 'candidate:1 1 udp 2122260223 3f9e1c2a.local 54321 typ host generation 0';
const REMOTE = 'candidate:2 1 udp 2122260223 192.168.1.20 50001 typ host generation 0';

/** A deferred promise, so a spec decides when the server answers. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeSignal implements ISignal {
  public readonly reads: Array<IRead | Closed | Error> = [];
  /** What a read returns once `reads` is empty: nobody has joined, nothing new. */
  public idle: IRead = { state: 'waiting', events: [], expiresIn: 120, relayedBytes: 0 };
  public created = deferred<ICreated>();
  public joined = deferred<IJoined>();
  public candidateResult: Promise<number | Closed> = Promise.resolve(0);
  public openResult: Promise<number> = Promise.resolve(2100);

  public readonly create = vi.fn<ISignal['create']>(() => this.created.promise);
  public readonly join = vi.fn<ISignal['join']>(() => this.joined.promise);
  public readonly answer = vi.fn<ISignal['answer']>(async () => 300);
  public readonly sendCandidate = vi.fn<ISignal['sendCandidate']>(() => this.candidateResult);
  public readonly open = vi.fn(() => this.openResult);
  public readonly read = vi.fn(async (): Promise<IRead | Closed> => {
    const next = this.reads.shift() ?? this.idle;
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });
}

describe('Switchboard', () => {
  let connections: FakePeerConnection[];
  let signals: FakeSignal[];
  let fixture: ComponentFixture<Switchboard>;
  let component: Switchboard;
  let host: HTMLElement;

  const connection = (): FakePeerConnection => connections[connections.length - 1];
  const signal = (): FakeSignal => signals[signals.length - 1];
  const text = (): string => host.textContent ?? '';
  const state = (): string => host.querySelector('[role="status"]')?.textContent?.trim() ?? '';

  async function settle(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  }

  function render(options: { search?: string; webrtc?: boolean; origin?: string } = {}): void {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SWITCHBOARD_PEER_CONNECTION,
          useValue:
            options.webrtc === false
              ? null
              : (): RTCPeerConnection => {
                  connections.push(new FakePeerConnection());
                  return connection().asConnection();
                },
        },
        {
          provide: SWITCHBOARD_SIGNAL,
          useValue: (): ISignal => {
            signals.push(new FakeSignal());
            return signal();
          },
        },
        { provide: SWITCHBOARD_SEARCH, useValue: options.search ?? '' },
        { provide: SWITCHBOARD_ORIGIN, useValue: options.origin ?? 'https://jacobmiller.dev' },
      ],
    });
    fixture = TestBed.createComponent(Switchboard);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  function click(label: string): void {
    const button = [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label
    );
    if (!button) {
      throw new Error(`No button labelled ${label}`);
    }
    button.click();
  }

  /** The offering device, up to `waiting` with code ABC234. */
  async function offerUntilWaiting(): Promise<void> {
    click('Get a code');
    await settle();
    signal().created.resolve({ code: 'ABC234', expiresIn: 120, relayedBytes: 1000 });
    await settle();
  }

  /** The joining device, up to `connecting` on code ABC234. */
  async function joinUntilConnecting(): Promise<void> {
    click('Connect');
    await settle();
    signal().joined.resolve({ offer: 'v=0 offer', relayedBytes: 1500 });
    await settle();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    connections = [];
    signals = [];
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  it('starts having sent nothing, with both ways in offered', () => {
    render();
    expect(state()).toContain('Nothing has been sent');
    expect(text()).toContain('Get a code');
    expect(host.querySelector('input')?.value).toBe('');
    expect(host.querySelector('.switchboard-log')).toBeNull();
    expect(signals).toHaveLength(0);
  });

  it('takes the code from the address, ready for Connect', () => {
    render({ search: '?code=abc234' });
    expect(host.querySelector('input')?.value).toBe('ABC234');
  });

  describe('no route: the browsers found no path', () => {
    const NO_RELAY = 'This site runs no relay, so it cannot carry the call instead.';

    it('says so when the browser has no RTCPeerConnection, and asks the server nothing', async () => {
      render({ webrtc: false });
      click('Get a code');
      await settle();
      expect(component.stage()).toBe('no-route');
      expect(state()).toContain('no RTCPeerConnection');
      expect(state()).toContain('on the same Wi-Fi it would pair over a host pair');
      expect(state()).toContain(NO_RELAY);
      expect(signals).toHaveLength(0);
      click('Start again');
      await settle();
      expect(state()).toContain('Nothing has been sent');
    });

    it('says so on the joining device too', async () => {
      render({ search: '?code=ABC234', webrtc: false });
      click('Connect');
      await settle();
      expect(component.stage()).toBe('no-route');
      expect(state()).toContain('no RTCPeerConnection');
      expect(signals).toHaveLength(0);
    });

    it('says why ICE failed, what would fix it, and that no relay runs', async () => {
      render();
      await offerUntilWaiting();
      connection().setIceState('failed');
      await settle();
      expect(component.stage()).toBe('no-route');
      expect(state()).toBe(
        'No direct path exists between these two networks: the browsers tried every pair of ' +
          'candidates and none of them worked. On the same Wi-Fi the two devices would pair ' +
          `over their own addresses, a host pair. ${NO_RELAY}`
      );
      expect(host.querySelector('.switchboard-code')).toBeNull();
      expect(connection().closed).toBe(true);

      const reads = signal().read.mock.calls.length;
      await settle(POLL_INTERVAL_MS * 4);
      expect(signal().read).toHaveBeenCalledTimes(reads);
      click('Start again');
      await settle();
      expect(state()).toContain('Nothing has been sent');
    });

    it('ignores ICE failing on an attempt the visitor already abandoned', async () => {
      render();
      await offerUntilWaiting();
      const abandoned = connection();
      component.reset();
      abandoned.setIceState('failed');
      await settle();
      expect(state()).toContain('Nothing has been sent');
    });

    it('is not what a refusal from this site says', async () => {
      render();
      click('Get a code');
      await settle();
      signal().created.reject(new SignalError('The switchboard is unreachable.', 0));
      await settle();
      expect(component.stage()).toBe('refused');
      expect(state()).not.toContain(NO_RELAY);
    });
  });

  describe('the offering device', () => {
    it('holds candidates until the code exists, then shows the code and its expiry', async () => {
      render();
      click('Get a code');
      await settle();
      expect(state()).toContain('Making an offer');
      expect(signal().create).toHaveBeenCalledWith('v=0 local');

      connection().findCandidate({ candidate: HOST, sdpMid: '0' });
      await settle();
      expect(signal().sendCandidate).not.toHaveBeenCalled();
      expect(text()).toContain(
        'This device found a host candidate: udp 3f9e1c2a.local port 54321.'
      );
      expect(text()).toContain('An mDNS name, not an address');

      signal().reads.push({ state: 'waiting', events: [], expiresIn: 117, relayedBytes: 1100 });
      signal().created.resolve({ code: 'ABC234', expiresIn: 120, relayedBytes: 1000 });
      await settle();
      expect(signal().sendCandidate).toHaveBeenCalledWith({ candidate: HOST, sdpMid: '0' });
      expect(state()).toContain('Waiting for the other device');
      expect(host.querySelector('.switchboard-code')?.textContent).toBe('ABC234');
      expect(text()).toContain('https://jacobmiller.dev/switchboard?code=ABC234');
      expect(text()).toContain('expires in 117 s');
      expect(host.querySelector('.switchboard-count strong')?.textContent).toBe('1100');
      expect(text()).toContain('This device made an offer: 9 bytes of SDP.');

      // Found after the code exists: relayed at once.
      connection().findCandidate({ candidate: '', sdpMid: '0' });
      await settle();
      expect(signal().sendCandidate).toHaveBeenCalledTimes(2);
      expect(text()).toContain('This device has no more candidates.');
    });

    it('applies the answer and candidates, stops polling on open, and reads `direct` from stats', async () => {
      render();
      await offerUntilWaiting();
      // The poll's first read went out when the code arrived; this is the second.
      signal().reads.push({
        state: 'joined',
        events: [
          { kind: 'answer', sdp: 'v=0 answer' },
          { kind: 'candidate', candidate: { candidate: REMOTE, sdpMid: '0' } },
        ],
        expiresIn: null,
        relayedBytes: 2000,
      });
      await settle(POLL_INTERVAL_MS);
      expect(state()).toContain('Both devices have been introduced');
      expect(text()).toContain('The other device joined with the code.');
      expect(connection().remoteDescriptions).toEqual([{ type: 'answer', sdp: 'v=0 answer' }]);
      expect(connection().addedCandidates).toEqual([{ candidate: REMOTE, sdpMid: '0' }]);
      expect(text()).toContain(
        'The other device found a host candidate: udp 192.168.1.20 port 50001.'
      );

      connection().stats = selectedPairStats('host');
      connection().channel?.open();
      await settle();
      expect(signal().open).toHaveBeenCalledTimes(1);
      expect(state()).toBe('Connected on the local network. The server is out of the call.');
      expect(text()).toContain('You are now talking directly; the server has stopped relaying.');
      expect(text()).toContain('host a1b2.local:50000 here and host 192.168.1.20:50001 there');
      expect(host.querySelector('.switchboard-count strong')?.textContent).toBe('2100');
      expect(host.querySelector('.switchboard-count')?.textContent).toContain('will relay no more');

      // The count stays stopped: no read and no candidate after the channel opened.
      const reads = signal().read.mock.calls.length;
      connection().findCandidate({ candidate: HOST, sdpMid: '0' });
      await settle(60_000);
      expect(signal().read).toHaveBeenCalledTimes(reads);
      expect(signal().sendCandidate).not.toHaveBeenCalled();
      expect(host.querySelector('.switchboard-count strong')?.textContent).toBe('2100');
    });

    it('waits out a 409 that arrives before its own channel opens', async () => {
      render();
      await offerUntilWaiting();
      signal().reads.push(CLOSED);
      await settle(POLL_INTERVAL_MS);
      expect(text()).toContain('The other device reports its channel open');
      expect(state()).not.toContain('never opened');

      connection().stats = selectedPairStats('host');
      connection().channel?.open();
      await settle(OPEN_GRACE_MS);
      expect(state()).toContain('Connected on the local network');
    });

    it('gives up when the channel the other device saw never opens here', async () => {
      render();
      await offerUntilWaiting();
      signal().candidateResult = Promise.resolve(CLOSED);
      connection().findCandidate({ candidate: HOST, sdpMid: '0' });
      await settle();
      signal().reads.push(CLOSED);
      await settle(POLL_INTERVAL_MS);
      expect(text().match(/reports its channel open/g)).toHaveLength(1);

      await settle(OPEN_GRACE_MS);
      expect(component.stage()).toBe('refused');
      expect(state()).toBe('The other device opened a channel that never opened on this one.');
      expect(connection().closed).toBe(true);
      click('Start again');
      await settle();
      expect(host.querySelector('.switchboard-log')).toBeNull();
      expect(host.querySelector('.switchboard-count')).toBeNull();
    });

    it('draws the link to this code as a QR code, with the code as text beside it', async () => {
      render();
      await offerUntilWaiting();
      const link = 'https://jacobmiller.dev/switchboard?code=ABC234';
      const svg = host.querySelector('svg.switchboard-qr');
      expect(svg?.getAttribute('role')).toBe('img');
      expect(svg?.getAttribute('aria-label')).toBe(`QR code for ${link}`);
      // Version 4 is 33 modules a side, and the quiet zone adds four on each.
      expect(svg?.getAttribute('viewBox')).toBe('0 0 41 41');
      expect(svg?.querySelector('path')?.getAttribute('d')).toBe(qrPath(encodeQr(link), 4));
      expect(host.querySelector('.switchboard-code')?.textContent).toBe('ABC234');
    });

    it('says the address is too long for the code it draws, rather than drawing a larger one', async () => {
      // As long as a preview deployment's origin, which pushes the link past version 4's 62 bytes.
      render({ origin: 'https://a-preview-deployment-with-a-long-name.example' });
      expect(component.link()).toBe(
        'https://a-preview-deployment-with-a-long-name.example/switchboard?code='
      );
      await offerUntilWaiting();
      expect(host.querySelector('svg.switchboard-qr')).toBeNull();
      expect(text()).toContain('too long for the QR code it draws');
      expect(host.querySelector('.switchboard-code')?.textContent).toBe('ABC234');
    });

    it('says when the server cannot be reached, or refuses a candidate', async () => {
      render();
      click('Get a code');
      await settle();
      signal().created.reject(new SignalError('The switchboard is unreachable.', 0));
      await settle();
      expect(state()).toBe('The switchboard is unreachable.');

      click('Start again');
      await settle();
      await offerUntilWaiting();
      signal().candidateResult = Promise.reject(new SignalError('Too many', 429));
      connection().findCandidate({ candidate: HOST, sdpMid: '0' });
      await settle();
      expect(state()).toBe('Too many');
    });

    it('says when a poll fails', async () => {
      render();
      await offerUntilWaiting();
      signal().reads.push(new SignalError('Nobody joined before this code expired', 410, 'code'));
      await settle(POLL_INTERVAL_MS);
      expect(state()).toBe('Nobody joined before this code expired');
    });

    it('ignores a code that arrives after the visitor started again', async () => {
      render();
      click('Get a code');
      await settle();
      const abandoned = signal();
      component.reset();
      abandoned.created.resolve({ code: 'ABC234', expiresIn: 120, relayedBytes: 1000 });
      await settle();
      expect(state()).toContain('Nothing has been sent');
      expect(abandoned.read).not.toHaveBeenCalled();
    });
  });

  describe('the joining device', () => {
    it('asks for the code before asking the server anything', async () => {
      render();
      click('Connect');
      await settle();
      expect(text()).toContain('Enter the code shown on the other device.');
      expect(signals).toHaveLength(0);

      const input = host.querySelector('input') as HTMLInputElement;
      input.value = 'abc234';
      input.dispatchEvent(new Event('input'));
      await settle();
      expect(host.querySelector('.switchboard-error')).toBeNull();
      expect(component.codeInput()).toBe('abc234');
    });

    it("puts the server's objection to the code under the input", async () => {
      render({ search: '?code=ZZZZZZ' });
      click('Connect');
      await settle();
      signal().joined.reject(
        new SignalError("No introduction is waiting under 'ZZZZZZ'", 404, 'code')
      );
      await settle();
      expect(state()).toContain('Nothing has been sent');
      const input = host.querySelector('input') as HTMLInputElement;
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe('switchboard-code-error');
      expect(host.querySelector('#switchboard-code-error')?.textContent).toContain(
        'No introduction'
      );
      expect(connection().closed).toBe(true);
    });

    it('answers, holds candidates until the answer is in, and reads `traversed` from stats', async () => {
      render({ search: '?code=abc234' });
      click('Connect');
      await settle();
      expect(signal().join).toHaveBeenCalledWith('ABC234');
      signal().joined.resolve({ offer: 'v=0 offer', relayedBytes: 1500 });
      connection().findCandidate({ candidate: HOST, sdpMid: '0' });
      await settle();

      expect(connection().remoteDescriptions).toEqual([{ type: 'offer', sdp: 'v=0 offer' }]);
      expect(signal().answer).toHaveBeenCalledWith('v=0 local');
      expect(signal().sendCandidate).toHaveBeenCalledTimes(1);
      expect(signal().answer.mock.invocationCallOrder[0]).toBeLessThan(
        signal().sendCandidate.mock.invocationCallOrder[0]
      );
      expect(state()).toContain('Both devices have been introduced');
      expect(text()).toContain('Joined ABC234. The server handed over an offer of 9 bytes.');

      connection().stats = selectedPairStats('srflx', 'srflx');
      connection().receiveChannel().open();
      await settle();
      expect(state()).toBe('Connected across the internet through a NAT, without a relay.');
    });

    it('says the pair was not reported rather than guessing one', async () => {
      render({ search: '?code=ABC234' });
      await joinUntilConnecting();
      connection().receiveChannel().open();
      await settle();
      expect(state()).toContain('has not reported which pair');
      expect(text()).toContain('You are now talking directly');
    });

    it('does not call a type it has no state for `direct`', async () => {
      render({ search: '?code=ABC234' });
      await joinUntilConnecting();
      connection().stats = selectedPairStats('relay');
      connection().receiveChannel().open();
      await settle();
      expect(state()).toContain('has not reported which pair');
    });

    it('still settles when the server did not record the open', async () => {
      render({ search: '?code=ABC234' });
      await joinUntilConnecting();
      signal().openResult = Promise.reject(new SignalError('The switchboard is unreachable.', 0));
      connection().stats = selectedPairStats('host');
      connection().receiveChannel().open();
      await settle();
      expect(text()).toContain(
        'The server did not record the open: The switchboard is unreachable.'
      );
      expect(state()).toContain('Connected on the local network');
    });

    it('ignores an offer that arrives after the visitor started again', async () => {
      render({ search: '?code=ABC234' });
      click('Connect');
      await settle();
      const abandoned = signal();
      component.reset();
      abandoned.joined.resolve({ offer: 'v=0 offer', relayedBytes: 1500 });
      await settle();
      expect(abandoned.answer).not.toHaveBeenCalled();
      expect(state()).toContain('Nothing has been sent');
    });
  });

  describe('an attempt the visitor abandoned', () => {
    it('lets nothing from it reach the page once the visitor starts again', async () => {
      render();
      await offerUntilWaiting();
      const counted = deferred<number | Closed>();
      const refused = deferred<number | Closed>();
      const closed = deferred<number | Closed>();
      const abandoned = signal();
      for (const result of [counted, refused, closed]) {
        abandoned.candidateResult = result.promise;
        connection().findCandidate({ candidate: HOST, sdpMid: '0' });
      }
      component.reset();
      counted.resolve(99_999);
      refused.reject(new SignalError('late', 500));
      closed.resolve(CLOSED);
      await settle();

      expect(state()).toContain('Nothing has been sent');
      expect(host.querySelector('.switchboard-count')).toBeNull();
      expect(host.querySelector('.switchboard-log')).toBeNull();
    });

    it('ignores an answer that is accepted after the visitor started again', async () => {
      render({ search: '?code=ABC234' });
      click('Connect');
      await settle();
      signal().answer.mockImplementation(async () => {
        component.reset();
        return 300;
      });
      signal().joined.resolve({ offer: 'v=0 offer', relayedBytes: 1500 });
      await settle();
      expect(state()).toContain('Nothing has been sent');
      expect(signal().read).not.toHaveBeenCalled();
    });

    it('ignores the stats of a channel that opened just before the visitor started again', async () => {
      render({ search: '?code=ABC234' });
      await joinUntilConnecting();
      const frozen = deferred<number>();
      signal().openResult = frozen.promise;
      connection().stats = selectedPairStats('host');
      connection().receiveChannel().open();
      await settle();
      component.reset();
      frozen.resolve(2100);
      await settle();
      expect(state()).toContain('Nothing has been sent');
    });
  });

  describe('once the channel is open', () => {
    it('is not undone by a late 409 or by ICE failing afterwards', async () => {
      render({ search: '?code=ABC234' });
      await joinUntilConnecting();
      const late = deferred<number | Closed>();
      signal().candidateResult = late.promise;
      connection().findCandidate({ candidate: HOST, sdpMid: '0' });
      connection().stats = selectedPairStats('host');
      connection().receiveChannel().open();
      await settle();

      late.resolve(CLOSED);
      connection().setIceState('failed');
      await settle(OPEN_GRACE_MS);
      expect(state()).toContain('Connected on the local network');
      expect(text()).not.toContain('reports its channel open');
    });
  });

  it('logs candidates it cannot take apart, and pairs whose stats name no address', async () => {
    render({ search: '?code=ABC234' });
    await joinUntilConnecting();
    connection().findCandidate({ sdpMid: '0' });
    signal().reads.push({
      state: 'joined',
      events: [
        { kind: 'candidate', candidate: { candidate: 'candidate:1 1 udp 1 10.0.0.2 x typ host' } },
      ],
      expiresIn: null,
      relayedBytes: 1600,
    });
    await settle(POLL_INTERVAL_MS);
    expect(text()).toContain('This device has no more candidates.');
    expect(text()).toContain('The other device found a host candidate: udp 10.0.0.2.');

    const bare: Record<string, Record<string, unknown>> = {
      L1: { id: 'L1', candidateType: 'host' },
      R1: { id: 'R1', candidateType: 'host', address: '192.168.1.20' },
    };
    connection().stats = selectedPairStats('host').map(
      (record) => bare[String(record['id'])] ?? record
    );
    connection().receiveChannel().open();
    await settle();
    expect(text()).toContain('The browsers chose host here and host 192.168.1.20 there.');
  });

  it("names the port when Chrome withholds an mDNS candidate's address from its stats", async () => {
    render({ search: '?code=ABC234' });
    await joinUntilConnecting();
    // What Chrome reported for two tabs on one machine, measured: an empty address and a port.
    connection().stats = selectedPairStats('host').map((record) =>
      record['type'] === 'local-candidate' ? { ...record, address: '', port: 57226 } : record
    );
    connection().receiveChannel().open();
    await settle();
    expect(text()).toContain(
      'The browsers chose host port 57226 here and host 192.168.1.20:50001 there.'
    );
  });

  it('closes the connection and stops polling when the route is left', async () => {
    render();
    await offerUntilWaiting();
    const reads = signal().read.mock.calls.length;
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 4);
    expect(connection().closed).toBe(true);
    expect(signal().read).toHaveBeenCalledTimes(reads);
  });

  it('falls back to a plain message for a refusal that is not an Error', async () => {
    render();
    click('Get a code');
    await settle();
    signal().created.reject('nope');
    await settle();
    expect(state()).toBe('Something went wrong.');
  });
});
