import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { SignalClient } from './signal/signal';
import {
  SWITCHBOARD_ORIGIN,
  SWITCHBOARD_PEER_CONNECTION,
  SWITCHBOARD_SEARCH,
  SWITCHBOARD_SIGNAL,
} from './switchboard.tokens';

/** The defaults the route runs on, which every other spec replaces. */
describe('switchboard tokens', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('has no peer connection where the browser has none, as jsdom has none', () => {
    expect(TestBed.inject(SWITCHBOARD_PEER_CONNECTION)).toBeNull();
  });

  it('makes a peer connection with no ICE servers, so nothing is asked of STUN', () => {
    const made: RTCConfiguration[] = [];
    vi.stubGlobal(
      'RTCPeerConnection',
      class {
        constructor(configuration: RTCConfiguration) {
          made.push(configuration);
        }
      }
    );
    const factory = TestBed.inject(SWITCHBOARD_PEER_CONNECTION);
    expect(factory).not.toBeNull();
    factory?.();
    expect(made).toEqual([{ iceServers: [] }]);
  });

  it('signals through window.fetch against the API base', async () => {
    const fetch = vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ relayed_bytes: 1 }),
    } as Response);
    const relay = TestBed.inject(SWITCHBOARD_SIGNAL)();
    expect(relay).toBeInstanceOf(SignalClient);
    await relay.open();
    expect(fetch.mock.calls[0][0]).toBe(`${environment.apiUrl}/switchboard/open`);
  });

  it("points the QR code at this page's own origin", () => {
    expect(TestBed.inject(SWITCHBOARD_ORIGIN)).toBe(window.location.origin);
  });

  it("reads the address's query string", () => {
    expect(TestBed.inject(SWITCHBOARD_SEARCH)).toBe(window.location.search);
  });
});
