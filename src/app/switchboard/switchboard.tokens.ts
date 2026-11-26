/** Injection tokens for `/switchboard`, each a seam a spec replaces. */
import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';
import { ISignal, SignalClient } from './signal/signal';
import { ICE_SERVERS } from './switchboard-calibration';

/**
 * Makes one `RTCPeerConnection`, or is `null` in a browser that has none.
 * jsdom has none, so a component spec supplies a factory for a fake.
 *
 * The one reader of `ICE_SERVERS`. This factory is first called inside the
 * tap that starts an introduction (**Get a code** or **Connect**), never on
 * rendering the page, so opening the page tells no STUN server anything.
 */
export const SWITCHBOARD_PEER_CONNECTION = new InjectionToken<(() => RTCPeerConnection) | null>(
  'SWITCHBOARD_PEER_CONNECTION',
  {
    factory: () =>
      typeof RTCPeerConnection === 'undefined'
        ? null
        : (): RTCPeerConnection => new RTCPeerConnection({ iceServers: [...ICE_SERVERS] }),
  }
);

/** Makes the signaling client for one pairing. A spec supplies a fake. */
export const SWITCHBOARD_SIGNAL = new InjectionToken<() => ISignal>('SWITCHBOARD_SIGNAL', {
  factory: () => (): ISignal =>
    new SignalClient((input, init) => window.fetch(input, init), environment.apiUrl),
});

/**
 * The origin the QR code's link points at: this page's own, so a preview
 * deployment's code opens the preview and `ng serve`'s opens `localhost`.
 */
export const SWITCHBOARD_ORIGIN = new InjectionToken<string>('SWITCHBOARD_ORIGIN', {
  factory: () => window.location.origin,
});

/** The address's query string, which may carry `?code=` from the other device. */
export const SWITCHBOARD_SEARCH = new InjectionToken<string>('SWITCHBOARD_SEARCH', {
  factory: () => window.location.search,
});
