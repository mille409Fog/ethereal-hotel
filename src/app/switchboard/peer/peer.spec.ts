import { describeCandidate, IPeerHandlers, Peer, readSelectedPair } from './peer';
import { FakePeerConnection, selectedPairStats } from './peer-connection.testing';

function report(records: Array<Record<string, unknown>>): RTCStatsReport {
  return new Map(
    records.map((record) => [String(record['id']), record])
  ) as unknown as RTCStatsReport;
}

describe('describeCandidate', () => {
  it('takes a host candidate apart, and marks an mDNS name as one', () => {
    expect(
      describeCandidate(
        'candidate:842163049 1 udp 2122260223 3f9e1c2a-77.local 54321 typ host generation 0'
      )
    ).toEqual({
      type: 'host',
      protocol: 'udp',
      address: '3f9e1c2a-77.local',
      port: 54321,
      mdns: true,
    });
  });

  it('reads a server-reflexive candidate with its SDP prefix', () => {
    expect(
      describeCandidate(
        'a=candidate:1 1 UDP 1686052607 203.0.113.9 61000 typ srflx raddr 0.0.0.0 rport 0'
      )
    ).toMatchObject({ type: 'srflx', protocol: 'udp', address: '203.0.113.9', mdns: false });
  });

  it('keeps a type it does not know as unknown, and a bad port as no port', () => {
    expect(describeCandidate('candidate:1 1 tcp 1 10.0.0.2 x typ weird')).toMatchObject({
      type: 'unknown',
      port: null,
    });
  });

  it('returns null for the end-of-candidates marker and for anything else', () => {
    expect(describeCandidate('')).toBeNull();
    expect(describeCandidate('candidate:1 1 udp 1 10.0.0.2 9 host typ')).toBeNull();
  });
});

describe('readSelectedPair', () => {
  it("follows the transport's selected pair to its local and remote candidates", () => {
    expect(readSelectedPair(report(selectedPairStats('host', 'srflx')))).toEqual({
      local: { candidateType: 'host', address: 'a1b2.local', port: 50000, protocol: 'udp' },
      remote: { candidateType: 'srflx', address: '192.168.1.20', port: 50001, protocol: 'udp' },
    });
  });

  it("falls back to the pair's own selected flag, and to the old `ip` name", () => {
    const records = [
      {
        id: 'CP0',
        type: 'candidate-pair',
        selected: false,
        localCandidateId: 'X',
        remoteCandidateId: 'X',
      },
      {
        id: 'CP1',
        type: 'candidate-pair',
        selected: true,
        localCandidateId: 'L',
        remoteCandidateId: 'R',
      },
      { id: 'L', type: 'local-candidate', candidateType: 'srflx', ip: '203.0.113.9' },
      { id: 'R', type: 'remote-candidate', candidateType: 'host' },
    ];
    expect(readSelectedPair(report(records))).toEqual({
      local: { candidateType: 'srflx', address: '203.0.113.9', port: null, protocol: null },
      remote: { candidateType: 'host', address: null, port: null, protocol: null },
    });
  });

  it('reports nothing rather than guessing when no pair is named or a candidate is missing', () => {
    expect(readSelectedPair(report([{ id: 'T', type: 'transport' }]))).toBeNull();
    const missingRemote = selectedPairStats('host').filter((record) => record['id'] !== 'R1');
    expect(readSelectedPair(report(missingRemote))).toBeNull();
    expect(readSelectedPair(new Map([['x', 7]]) as unknown as RTCStatsReport)).toBeNull();
  });
});

describe('Peer', () => {
  let connection: FakePeerConnection;
  let handlers: { [K in keyof IPeerHandlers]: ReturnType<typeof vi.fn> };
  let peer: Peer;

  beforeEach(() => {
    connection = new FakePeerConnection();
    handlers = { candidate: vi.fn(), open: vi.fn(), failed: vi.fn() };
    peer = new Peer(connection.asConnection(), handlers as unknown as IPeerHandlers);
  });

  it('offers on a reliable channel and reports it open once', async () => {
    await expect(peer.offer()).resolves.toBe('v=0 local');
    expect(connection.channel?.label).toBe('reliable');
    connection.channel?.open();
    connection.channel?.onopen?.();
    expect(handlers.open).toHaveBeenCalledTimes(1);
  });

  it('answers an offer, and adopts the channel the offerer opened', async () => {
    await expect(peer.answer('v=0 offer')).resolves.toBe('v=0 local');
    expect(connection.remoteDescriptions).toEqual([{ type: 'offer', sdp: 'v=0 offer' }]);
    connection.receiveChannel().open();
    expect(handlers.open).toHaveBeenCalledTimes(1);
  });

  it('reports a channel that arrives already open', () => {
    const channel = connection.receiveChannel();
    channel.readyState = 'open';
    connection.ondatachannel?.({ channel });
    expect(handlers.open).toHaveBeenCalledTimes(1);
  });

  it('applies the answer and remote candidates', async () => {
    await peer.accept('v=0 answer');
    await peer.addCandidate({ candidate: 'candidate:x', sdpMid: '0' });
    expect(connection.remoteDescriptions).toEqual([{ type: 'answer', sdp: 'v=0 answer' }]);
    expect(connection.addedCandidates).toEqual([{ candidate: 'candidate:x', sdpMid: '0' }]);
  });

  it('relays local candidates but not the end of gathering', () => {
    connection.findCandidate({ candidate: 'candidate:1', sdpMid: '0' });
    connection.findCandidate(null);
    expect(handlers.candidate).toHaveBeenCalledTimes(1);
    expect(handlers.candidate).toHaveBeenCalledWith({ candidate: 'candidate:1', sdpMid: '0' });
  });

  it('reports ICE failure, and nothing else ICE does', () => {
    connection.setIceState('checking');
    connection.setIceState('failed');
    expect(handlers.failed).toHaveBeenCalledTimes(1);
  });

  it('reads the selected pair from the connection stats', async () => {
    connection.stats = selectedPairStats('host');
    await expect(peer.selectedPair()).resolves.toMatchObject({ local: { candidateType: 'host' } });
  });

  it('refuses a local description with no SDP rather than relaying an empty one', async () => {
    connection.localSdp = '';
    await expect(peer.offer()).rejects.toThrow('no SDP');
  });

  it('closes the channel and the connection, and goes quiet after', async () => {
    await peer.offer();
    peer.close();
    expect(connection.channel?.closed).toBe(true);
    expect(connection.closed).toBe(true);

    connection.findCandidate({ candidate: 'late' });
    connection.setIceState('failed');
    connection.channel?.open();
    expect(handlers.candidate).not.toHaveBeenCalled();
    expect(handlers.failed).not.toHaveBeenCalled();
    expect(handlers.open).not.toHaveBeenCalled();
  });

  it('closes cleanly before any channel exists', () => {
    peer.close();
    expect(connection.closed).toBe(true);
  });
});
