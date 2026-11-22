/**
 * `/switchboard`'s one `RTCPeerConnection`: its data channel, its candidates,
 * and the browser's own report of which pair it chose.
 *
 * No WebRTC library (SWITCHBOARD.md §Decisions). This is a thin wrapper that
 * turns the connection's callbacks into three handler calls, so the component
 * never touches the connection directly and its spec can drive a fake one
 * through `SWITCHBOARD_PEER_CONNECTION`.
 *
 * **The pair type comes from `getStats()` and from nowhere else.** The selected
 * `candidate-pair` is found through the `transport` report's
 * `selectedCandidatePairId` (Chrome, Safari), or the pair's own `selected` flag
 * (Firefox). Then `candidateType` is read off the `local-candidate` that pair
 * points at. Not from `googCandidatePair`, which is gone, and not from the
 * address, which would be a guess. If the browser reports no selected pair,
 * {@link readSelectedPair} returns `null` and the page says it was not told.
 */

import { RELIABLE_CHANNEL } from '../switchboard-calibration';

export type CandidateType = 'host' | 'srflx' | 'prflx' | 'relay';

/** One ICE candidate line, taken apart for the introduction log. */
export interface ICandidateLine {
  type: CandidateType | 'unknown';
  protocol: string;
  address: string;
  port: number | null;
  /**
   * The address is an mDNS name (`*.local`) rather than an IP. Chrome hides
   * local addresses this way. It still pairs on the same network, so it is
   * shown as it is, with the reason beside it, and never filtered out.
   */
  mdns: boolean;
}

/** One end of the selected pair, as `getStats()` reported it. */
export interface IStatsCandidate {
  candidateType: string;
  address: string | null;
  port: number | null;
  protocol: string | null;
}

export interface ISelectedPair {
  local: IStatsCandidate;
  remote: IStatsCandidate;
}

const CANDIDATE_TYPES: readonly string[] = ['host', 'srflx', 'prflx', 'relay'];

/**
 * Parse `candidate:<foundation> <component> <protocol> <priority> <address>
 * <port> typ <type> …` (RFC 8839 §5.1). Returns `null` for the empty string,
 * which is the browser's end-of-candidates marker, and for anything that is
 * not a candidate line at all.
 */
export function describeCandidate(candidate: string | undefined): ICandidateLine | null {
  // `RTCIceCandidateInit.candidate` is optional; a missing one is no candidate either.
  const fields = (candidate ?? '').replace(/^a=/, '').trim().split(/\s+/);
  if (fields.length < 8 || fields[6] !== 'typ') {
    return null;
  }
  const port = Number.parseInt(fields[5], 10);
  const type = fields[7];
  return {
    type: CANDIDATE_TYPES.includes(type) ? (type as CandidateType) : 'unknown',
    protocol: fields[2].toLowerCase(),
    address: fields[4],
    port: Number.isFinite(port) ? port : null,
    mdns: fields[4].endsWith('.local'),
  };
}

type StatsRecord = Record<string, unknown>;

function text(record: StatsRecord | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' ? value : null;
}

function candidateFrom(record: StatsRecord | undefined): IStatsCandidate | null {
  const candidateType = text(record, 'candidateType');
  if (candidateType === null) {
    return null;
  }
  const port = record?.['port'];
  return {
    candidateType,
    // `address` is the current name; older Chrome and Safari called it `ip`.
    // Chrome reports an mDNS host candidate's address as the empty string,
    // which is no address, so it becomes `null` like a missing one.
    address: text(record, 'address') || text(record, 'ip') || null,
    port: typeof port === 'number' ? port : null,
    protocol: text(record, 'protocol'),
  };
}

function findSelectedPair(
  records: readonly StatsRecord[],
  byId: ReadonlyMap<string | null, StatsRecord>
): StatsRecord | undefined {
  for (const record of records) {
    const pairId = record['type'] === 'transport' ? text(record, 'selectedCandidatePairId') : null;
    if (pairId !== null && byId.has(pairId)) {
      return byId.get(pairId);
    }
  }
  return records.find(
    (record) => record['type'] === 'candidate-pair' && record['selected'] === true
  );
}

/** The selected pair out of a stats report, or `null` if the browser named none. */
export function readSelectedPair(report: RTCStatsReport): ISelectedPair | null {
  const records: StatsRecord[] = [];
  report.forEach((value: unknown) => {
    if (typeof value === 'object' && value !== null) {
      records.push(value as StatsRecord);
    }
  });
  const byId = new Map(records.map((record) => [text(record, 'id'), record]));
  const pair = findSelectedPair(records, byId);
  if (pair === undefined) {
    return null;
  }
  const local = candidateFrom(byId.get(text(pair, 'localCandidateId')));
  const remote = candidateFrom(byId.get(text(pair, 'remoteCandidateId')));
  return local && remote ? { local, remote } : null;
}

/** What the connection reports, turned into three calls. */
export interface IPeerHandlers {
  /** A local candidate was found; relay it to the other device. */
  candidate(candidate: RTCIceCandidateInit): void;
  /** The data channel is open. Called once. */
  open(): void;
  /** ICE tried every pair and none worked. */
  failed(): void;
}

/** One side of one pairing. Make a new one for each attempt. */
export class Peer {
  private channel: RTCDataChannel | null = null;
  private opened = false;
  private closed = false;

  constructor(
    private readonly connection: RTCPeerConnection,
    private readonly handlers: IPeerHandlers
  ) {
    connection.onicecandidate = (event): void => {
      // The final event carries `null`: gathering is over and there is nothing to relay.
      if (event.candidate && !this.closed) {
        handlers.candidate(event.candidate.toJSON());
      }
    };
    connection.oniceconnectionstatechange = (): void => {
      if (connection.iceConnectionState === 'failed' && !this.closed) {
        handlers.failed();
      }
    };
    connection.ondatachannel = (event): void => this.adopt(event.channel);
  }

  /** The offering side: open the channel, then make and apply the offer. */
  public async offer(): Promise<string> {
    this.adopt(this.connection.createDataChannel(RELIABLE_CHANNEL));
    await this.connection.setLocalDescription();
    return this.localSdp();
  }

  /** The joining side: apply the offer, then make and apply the answer. */
  public async answer(offer: string): Promise<string> {
    await this.connection.setRemoteDescription({ type: 'offer', sdp: offer });
    await this.connection.setLocalDescription();
    return this.localSdp();
  }

  /** The offering side, once the answer has been relayed. */
  public async accept(answer: string): Promise<void> {
    await this.connection.setRemoteDescription({ type: 'answer', sdp: answer });
  }

  public async addCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.connection.addIceCandidate(candidate);
  }

  public async selectedPair(): Promise<ISelectedPair | null> {
    return readSelectedPair(await this.connection.getStats());
  }

  public close(): void {
    this.closed = true;
    this.channel?.close();
    this.connection.close();
  }

  private adopt(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.onopen = (): void => this.reportOpen();
    if (channel.readyState === 'open') {
      this.reportOpen();
    }
  }

  private reportOpen(): void {
    if (!this.opened && !this.closed) {
      this.opened = true;
      this.handlers.open();
    }
  }

  private localSdp(): string {
    const sdp = this.connection.localDescription?.sdp;
    if (!sdp) {
      throw new Error('The browser applied a local description with no SDP.');
    }
    return sdp;
  }
}
