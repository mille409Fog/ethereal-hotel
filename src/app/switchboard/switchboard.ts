import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  Signal,
} from '@angular/core';
import { HomeLink } from '../home-link/home-link';
import { describeCandidate, ISelectedPair, IStatsCandidate, Peer } from './peer/peer';
import { encodeQr, qrPath } from './qr/qr';
import { CLOSED, IPoll, IRead, ISignal, SignalError, startPoll } from './signal/signal';
import { OPEN_GRACE_MS, POLL_INTERVAL_MS } from './switchboard-calibration';
import {
  SWITCHBOARD_ORIGIN,
  SWITCHBOARD_PEER_CONNECTION,
  SWITCHBOARD_SEARCH,
  SWITCHBOARD_SIGNAL,
} from './switchboard.tokens';

/** Modules of light margin around the symbol: ISO/IEC 18004 asks for four. */
const QR_QUIET_ZONE = 4;

/** What the template draws: an SVG path and the side of its square `viewBox`. */
export interface IQrDrawing {
  path: string;
  span: number;
}

/**
 * Where the introduction is. `direct` and `traversed` are the browser's own
 * report of the selected pair; `unreported` is an open channel whose browser
 * named no pair, said as such rather than guessed.
 *
 * An attempt stops in one of two states, split by who said no. `no-route` is
 * the browsers' report about two networks: ICE tried every pair and none
 * worked, or there is no `RTCPeerConnection` to try with. `refused` is this
 * site turning the attempt down: a spent code, a failed request, or the other
 * device opening a channel that never opened here.
 */
export type Stage =
  | 'idle'
  | 'starting'
  | 'waiting'
  | 'connecting'
  | 'direct'
  | 'traversed'
  | 'unreported'
  | 'no-route'
  | 'refused';

/** The two ways an attempt stops; each carries its reason in `reason`. */
type Stopped = Extract<Stage, 'no-route' | 'refused'>;

/** One line of the introduction log, with an optional explanation beside it. */
export interface ILogLine {
  id: number;
  text: string;
  note: string | null;
}

const STAGE_LINES: Readonly<Record<Exclude<Stage, Stopped>, string>> = {
  idle: 'Nothing has been sent. Get a code on this device, or enter the code from the other one.',
  starting: 'Making an offer and asking the server to introduce this device.',
  waiting:
    'Waiting for the other device. The server holds this code and this offer, and nothing else.',
  connecting: 'Both devices have been introduced. The browsers are trying pairs of candidates.',
  direct: 'Connected on the local network. The server is out of the call.',
  traversed: 'Connected across the internet through a NAT, without a relay.',
  unreported: 'Connected, but this browser has not reported which pair of candidates it chose.',
};

/**
 * Why the browsers found no route, each with what would give them one. The
 * remedy lives in the reason rather than in a shared tail because it differs:
 * the same Wi-Fi fixes two networks, but not a browser with no WebRTC.
 */
const NO_ROUTE_ICE =
  'No direct path exists between these two networks: the browsers tried every pair of candidates and none of them worked. On the same Wi-Fi the two devices would pair over their own addresses, a host pair.';
const NO_ROUTE_WEBRTC =
  'This browser has no RTCPeerConnection, so it cannot open a direct channel to another device. A browser that has one would, and on the same Wi-Fi it would pair over a host pair.';

/**
 * Said under every `no-route`. The usual fix for two networks with no direct
 * path is a TURN relay, and this site will not run one (SWITCHBOARD.md
 * §Decisions), so the page says that rather than quietly relaying instead.
 */
const NO_RELAY = 'This site runs no relay, so it cannot carry the call instead.';

/**
 * The local end of the selected pair decides the state. `host` is this
 * device's own address, so the path is the local network. `srflx` and `prflx`
 * are this device as a NAT presents it, so the path crossed one. `relay` is
 * absent because this site runs no TURN server, and any type a browser invents
 * later is said to be unreported rather than guessed at.
 *
 * The local end, not the remote one. Two tabs on one machine have been
 * measured selecting `host` locally while one of them saw the *remote* end as
 * `prflx`, learned from a connectivity check before the candidate arrived
 * through the poll. Reading the remote end would have called that pair
 * `traversed`.
 */
const STAGE_BY_CANDIDATE: Readonly<Record<string, Stage>> = {
  host: 'direct',
  srflx: 'traversed',
  prflx: 'traversed',
};

const MDNS_NOTE =
  'An mDNS name, not an address: the browser hides the local IP behind it. It still pairs on the same network.';

const encoder = new TextEncoder();

function bytes(text: string): number {
  return encoder.encode(text).length;
}

/** `host 192.168.1.20:50001`, or `host port 50982` when the browser withheld the address. */
function describeEnd(end: IStatsCandidate): string {
  const port = end.port === null ? '' : `port ${end.port}`;
  if (end.address === null) {
    return `${end.candidateType} ${port}`.trim();
  }
  return `${end.candidateType} ${end.address}${end.port === null ? '' : `:${end.port}`}`;
}

/**
 * `/switchboard`: two of the visitor's own devices, introduced through the
 * server and then left to talk directly. SWITCHBOARD.md is the plan.
 *
 * Either device can offer. The one that presses **Get a code** makes the offer
 * and shows the code; the other enters it (or arrives with `?code=` in the
 * address) and answers. Each side trickles its candidates through the server,
 * polls for the other side's, and stops polling for good the moment its data
 * channel opens. The server's count of relayed bytes is shown throughout and
 * stops there, which is the route's whole argument.
 *
 * **Candidates are held until the server can take them.** The offerer's first
 * candidates are found before `create` has returned a code to send them under,
 * and the server refuses the joiner's candidates until its answer is in
 * (`OutOfTurn`). So both sides queue candidates until that call returns. That
 * ordering is also what lets `signal.ts` read every `409` on a candidate as
 * the other device having opened first.
 */
@Component({
  selector: 'app-switchboard',
  imports: [HomeLink],
  templateUrl: './switchboard.html',
  styleUrl: './switchboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Switchboard {
  public readonly stage = signal<Stage>('idle');
  public readonly code = signal<string | null>(null);
  public readonly expiresIn = signal<number | null>(null);
  public readonly relayedBytes = signal<number | null>(null);
  public readonly log = signal<readonly ILogLine[]>([]);
  /** Why the attempt stopped; read only in the `no-route` and `refused` stages. */
  public readonly reason = signal('');
  public readonly codeInput = signal('');
  public readonly codeError = signal<string | null>(null);

  public readonly connected: Signal<boolean> = computed(() =>
    ['direct', 'traversed', 'unreported'].includes(this.stage())
  );
  public readonly stopped: Signal<boolean> = computed(() =>
    ['no-route', 'refused'].includes(this.stage())
  );
  public readonly stageLine: Signal<string> = computed(() => {
    const stage = this.stage();
    if (stage === 'refused') {
      return this.reason();
    }
    if (stage === 'no-route') {
      return `${this.reason()} ${NO_RELAY}`;
    }
    return STAGE_LINES[stage];
  });

  /** The address the other device opens: the same route, with this code. */
  public readonly link: Signal<string> = computed(
    () => `${this.origin}/switchboard?code=${this.code() ?? ''}`
  );

  /**
   * The link as a QR code, or `null` when the origin makes it longer than
   * version 4 holds (a Vercel preview's does). Then the page says so and the
   * code is typed instead; the encoder's range is deliberate (see `qr.ts`).
   */
  public readonly qr: Signal<IQrDrawing | null> = computed(() => {
    try {
      const code = encodeQr(this.link());
      return { path: qrPath(code, QR_QUIET_ZONE), span: code.size + 2 * QR_QUIET_ZONE };
    } catch {
      return null;
    }
  });

  private readonly origin = inject(SWITCHBOARD_ORIGIN);
  private readonly makeConnection = inject(SWITCHBOARD_PEER_CONNECTION);
  private readonly makeSignal = inject(SWITCHBOARD_SIGNAL);

  private peer: Peer | null = null;
  private relay: ISignal | null = null;
  private poll: IPoll | null = null;
  private grace: ReturnType<typeof setTimeout> | null = null;
  /** Local candidates found before the server would take them. */
  private held: RTCIceCandidateInit[] = [];
  /** The server will take candidates now: `create` or `answer` has returned. */
  private relaying = false;
  private channelOpen = false;
  private nextLine = 0;

  constructor() {
    const code = new URLSearchParams(inject(SWITCHBOARD_SEARCH)).get('code');
    if (code) {
      this.codeInput.set(code.trim().toUpperCase());
    }
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  /** **Get a code**: this device offers, and shows the code for the other. */
  public async offer(): Promise<void> {
    const started = this.begin();
    if (!started) {
      return;
    }
    const { peer, relay } = started;
    try {
      const sdp = await peer.offer();
      this.note(`This device made an offer: ${bytes(sdp)} bytes of SDP.`);
      const created = await relay.create(sdp);
      if (this.relay !== relay) {
        return;
      }
      this.code.set(created.code);
      this.expiresIn.set(created.expiresIn);
      this.count(created.relayedBytes);
      this.stage.set('waiting');
      this.note(`The server issued the code ${created.code}.`);
      this.flushCandidates(relay);
      this.startPolling(peer, relay);
    } catch (error) {
      this.refuse(error, relay);
    }
  }

  /** **Connect** with a code: this device answers the other's offer. */
  public async join(event?: Event): Promise<void> {
    event?.preventDefault();
    const code = this.codeInput().trim().toUpperCase();
    if (!code) {
      this.codeError.set('Enter the code shown on the other device.');
      return;
    }
    const started = this.begin();
    if (!started) {
      return;
    }
    const { peer, relay } = started;
    try {
      const joined = await relay.join(code);
      if (this.relay !== relay) {
        return;
      }
      this.code.set(code);
      this.count(joined.relayedBytes);
      this.note(`Joined ${code}. The server handed over an offer of ${bytes(joined.offer)} bytes.`);
      const sdp = await peer.answer(joined.offer);
      this.note(`This device made an answer: ${bytes(sdp)} bytes of SDP.`);
      const relayed = await relay.answer(sdp);
      if (this.relay !== relay) {
        return;
      }
      this.count(relayed);
      this.stage.set('connecting');
      this.flushCandidates(relay);
      this.startPolling(peer, relay);
    } catch (error) {
      this.refuse(error, relay);
    }
  }

  public onCodeInput(event: Event): void {
    this.codeInput.set((event.target as HTMLInputElement).value);
    this.codeError.set(null);
  }

  /** **Start again**: forget this attempt entirely. */
  public reset(): void {
    this.teardown();
    this.stage.set('idle');
    this.code.set(null);
    this.expiresIn.set(null);
    this.relayedBytes.set(null);
    this.log.set([]);
    this.reason.set('');
  }

  /** A fresh peer and signaling client, or `no-route` when the browser has no WebRTC. */
  private begin(): { peer: Peer; relay: ISignal } | null {
    this.reset();
    this.codeError.set(null);
    if (this.makeConnection === null) {
      this.stop('no-route', NO_ROUTE_WEBRTC);
      return null;
    }
    const relay = this.makeSignal();
    const peer: Peer = new Peer(this.makeConnection(), {
      candidate: (candidate) => this.onLocalCandidate(candidate, relay),
      open: () => void this.onOpen(peer, relay),
      failed: () => {
        if (this.isCurrent(relay)) {
          this.stop('no-route', NO_ROUTE_ICE);
        }
      },
    });
    this.peer = peer;
    this.relay = relay;
    this.stage.set('starting');
    return { peer, relay };
  }

  private startPolling(peer: Peer, relay: ISignal): void {
    this.poll = startPoll(relay, POLL_INTERVAL_MS, {
      read: (result) => this.onRead(peer, result),
      closed: () => this.onOtherOpened(relay),
      error: (error) => this.refuse(error, relay),
    });
  }

  private async onRead(peer: Peer, result: IRead): Promise<void> {
    this.count(result.relayedBytes);
    this.expiresIn.set(result.expiresIn);
    if (result.state === 'joined' && this.stage() === 'waiting') {
      this.stage.set('connecting');
      this.note('The other device joined with the code.');
    }
    for (const event of result.events) {
      if (event.kind === 'answer') {
        this.note(`The server relayed the answer: ${bytes(event.sdp)} bytes of SDP.`);
        await peer.accept(event.sdp);
      } else {
        this.noteCandidate('The other device', event.candidate.candidate);
        await peer.addCandidate(event.candidate);
      }
    }
  }

  private onLocalCandidate(candidate: RTCIceCandidateInit, relay: ISignal): void {
    this.noteCandidate('This device', candidate.candidate);
    if (this.relaying) {
      this.sendCandidate(candidate, relay);
    } else {
      this.held.push(candidate);
    }
  }

  private flushCandidates(relay: ISignal): void {
    this.relaying = true;
    this.held.splice(0).forEach((candidate) => this.sendCandidate(candidate, relay));
  }

  private sendCandidate(candidate: RTCIceCandidateInit, relay: ISignal): void {
    if (this.channelOpen) {
      return;
    }
    relay.sendCandidate(candidate).then(
      (result) => {
        if (result === CLOSED) {
          this.onOtherOpened(relay);
        } else if (this.relay === relay) {
          this.count(result);
        }
      },
      (error: unknown) => this.refuse(error, relay)
    );
  }

  /**
   * The server refused a poll or a candidate with `409`: the other device's
   * channel is open. This one's is probably milliseconds away, so wait for it.
   */
  private onOtherOpened(relay: ISignal): void {
    if (this.relay !== relay || this.channelOpen || this.grace !== null) {
      return;
    }
    this.poll?.stop();
    this.note('The other device reports its channel open, and the server has stopped relaying.');
    this.grace = setTimeout(() => {
      this.grace = null;
      this.refuse(
        new Error('The other device opened a channel that never opened on this one.'),
        relay
      );
    }, OPEN_GRACE_MS);
  }

  /** `Peer` reports open at most once, and never after it was closed by a reset. */
  private async onOpen(peer: Peer, relay: ISignal): Promise<void> {
    this.channelOpen = true;
    this.poll?.stop();
    this.clearGrace();
    this.note('The data channel is open. This device has stopped polling the server.');
    try {
      this.count(await relay.open());
    } catch (error) {
      this.note(`The server did not record the open: ${this.messageOf(error)}`);
    }
    const pair = await peer.selectedPair();
    // The visitor may have started again while the two calls above were out.
    if (this.relay !== relay) {
      return;
    }
    this.settle(pair);
  }

  private settle(pair: ISelectedPair | null): void {
    if (pair === null) {
      this.stage.set('unreported');
      return;
    }
    this.note(
      `The browsers chose ${describeEnd(pair.local)} here and ${describeEnd(pair.remote)} there.`
    );
    this.stage.set(STAGE_BY_CANDIDATE[pair.local.candidateType] ?? 'unreported');
  }

  /**
   * Stop this attempt and say why. A refusal about the code goes under the
   * code's input and leaves the page where it was, as `/booking` does with a
   * field the server rejected.
   */
  private refuse(error: unknown, relay: ISignal): void {
    if (!this.isCurrent(relay)) {
      return;
    }
    const message = this.messageOf(error);
    if (error instanceof SignalError && error.field === 'code' && this.code() === null) {
      this.reset();
      this.codeError.set(message);
      return;
    }
    this.stop('refused', message);
  }

  /**
   * Whether a report about `relay`'s attempt may still change the page: it is
   * the attempt in progress, and its channel has not opened. Once open, a late
   * `409` or ICE failing afterwards cannot undo the connection.
   */
  private isCurrent(relay: ISignal): boolean {
    return this.relay === relay && !this.channelOpen;
  }

  private stop(stage: Stopped, reason: string): void {
    this.teardown();
    this.stage.set(stage);
    this.reason.set(reason);
  }

  private count(relayedBytes: number): void {
    // Responses can land out of order; the count only ever grows.
    this.relayedBytes.update((seen) => Math.max(seen ?? 0, relayedBytes));
  }

  private noteCandidate(who: string, candidate: string | undefined): void {
    const line = describeCandidate(candidate);
    if (line === null) {
      this.note(`${who} has no more candidates.`);
      return;
    }
    const where = `${line.address}${line.port === null ? '' : ` port ${line.port}`}`;
    this.note(
      `${who} found a ${line.type} candidate: ${line.protocol} ${where}.`,
      line.mdns ? MDNS_NOTE : null
    );
  }

  private note(text: string, note: string | null = null): void {
    const id = this.nextLine++;
    this.log.update((lines) => [...lines, { id, text, note }]);
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong.';
  }

  private clearGrace(): void {
    if (this.grace !== null) {
      clearTimeout(this.grace);
      this.grace = null;
    }
  }

  private teardown(): void {
    this.poll?.stop();
    this.poll = null;
    this.clearGrace();
    this.peer?.close();
    this.peer = null;
    this.relay = null;
    this.held = [];
    this.relaying = false;
    this.channelOpen = false;
  }
}
