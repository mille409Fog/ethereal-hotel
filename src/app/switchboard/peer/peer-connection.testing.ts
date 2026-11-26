/**
 * An `RTCPeerConnection` that does nothing on its own and lets a spec play
 * the browser: find a candidate, open the channel, fail ICE, report stats.
 *
 * jsdom has no WebRTC. This proves the protocol the component and `Peer`
 * follow (offer before code, candidates held until the server takes them, the
 * poll stopped on open, the state read from stats). Whether two real browsers
 * pair is not a question a double can answer; that is the Definition of Done's
 * two tabs, and later the e2e suite's two contexts.
 *
 * Excluded from coverage by `coverageExclude` in angular.json, like
 * `src/aubade/gl/webgl.testing.ts` and for its reason.
 */

export class FakeDataChannel {
  public readyState: RTCDataChannelState = 'connecting';
  public onopen: (() => void) | null = null;
  public closed = false;

  constructor(public readonly label: string) {}

  public open(): void {
    this.readyState = 'open';
    this.onopen?.();
  }

  public close(): void {
    this.closed = true;
    this.readyState = 'closed';
  }
}

export class FakePeerConnection {
  public onicecandidate:
    ((event: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null = null;
  public oniceconnectionstatechange: (() => void) | null = null;
  public ondatachannel: ((event: { channel: FakeDataChannel }) => void) | null = null;
  public iceConnectionState: RTCIceConnectionState = 'new';
  public localDescription: { type: RTCSdpType; sdp: string } | null = null;
  public readonly remoteDescriptions: RTCSessionDescriptionInit[] = [];
  public readonly addedCandidates: RTCIceCandidateInit[] = [];
  public channel: FakeDataChannel | null = null;
  public stats: Array<Record<string, unknown>> = [];
  public closed = false;
  /** What `setLocalDescription` produces; empty to imitate a broken browser. */
  public localSdp = 'v=0 local';

  constructor(private readonly configuration: RTCConfiguration = { iceServers: [] }) {}

  public getConfiguration(): RTCConfiguration {
    return this.configuration;
  }

  public createDataChannel(label: string): FakeDataChannel {
    this.channel = new FakeDataChannel(label);
    return this.channel;
  }

  public async setLocalDescription(): Promise<void> {
    const type: RTCSdpType = this.remoteDescriptions.length > 0 ? 'answer' : 'offer';
    this.localDescription = { type, sdp: this.localSdp };
  }

  public async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescriptions.push(description);
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.addedCandidates.push(candidate);
  }

  public async getStats(): Promise<Map<string, Record<string, unknown>>> {
    return new Map(this.stats.map((record) => [String(record['id']), record]));
  }

  public close(): void {
    this.closed = true;
  }

  /** The browser found a local candidate; `null` ends gathering. */
  public findCandidate(candidate: RTCIceCandidateInit | null): void {
    this.onicecandidate?.({ candidate: candidate === null ? null : { toJSON: () => candidate } });
  }

  /** The remote side opened a channel, as the joiner sees the offerer's. */
  public receiveChannel(label = 'reliable'): FakeDataChannel {
    this.channel = new FakeDataChannel(label);
    this.ondatachannel?.({ channel: this.channel });
    return this.channel;
  }

  public setIceState(state: RTCIceConnectionState): void {
    this.iceConnectionState = state;
    this.oniceconnectionstatechange?.();
  }

  public asConnection(): RTCPeerConnection {
    return this as unknown as RTCPeerConnection;
  }
}

/** A `getStats()` report whose transport selected a pair of the given local and remote types. */
export function selectedPairStats(
  localType: string,
  remoteType = 'host'
): Array<Record<string, unknown>> {
  return [
    { id: 'T1', type: 'transport', selectedCandidatePairId: 'CP1' },
    { id: 'CP1', type: 'candidate-pair', localCandidateId: 'L1', remoteCandidateId: 'R1' },
    {
      id: 'L1',
      type: 'local-candidate',
      candidateType: localType,
      address: 'a1b2.local',
      port: 50000,
      protocol: 'udp',
    },
    {
      id: 'R1',
      type: 'remote-candidate',
      candidateType: remoteType,
      address: '192.168.1.20',
      port: 50001,
      protocol: 'udp',
    },
  ];
}
