import { parseFakeClock } from './fake-clock';

/**
 * The back door, and its manners.
 *
 * Most of what matters here is what it does with rubbish. This is a debugging
 * affordance reached by typing into an address bar, so every wrong input has to
 * degrade to "show the real hour" — a thrown error, or a `NaN` date reaching the
 * solar arithmetic, would turn a typo into a blank page and a console trace.
 */

describe('the fake clock', () => {
  it('asks for nothing when nothing was asked', () => {
    expect(parseFakeClock('')).toEqual({ at: null, zone: null, state: null });
    expect(parseFakeClock('?')).toEqual({ at: null, zone: null, state: null });
  });

  it('takes the query string with or without its leading question mark', () => {
    // `location.search` includes it; a hand-written test or a router fragment
    // often does not.
    expect(parseFakeClock('?t=open').state).toBe('open');
    expect(parseFakeClock('t=open').state).toBe('open');
  });

  describe('given a state name', () => {
    it('forces that state', () => {
      for (const state of ['open', 'late', 'warning', 'aubade', 'shuttered'] as const) {
        expect(parseFakeClock(`?t=${state}`).state).toBe(state);
      }
    });

    it('leaves the instant alone, so the sun stays real', () => {
      // The point of the state-name form: the countdown card and the invitation
      // are never exercised against a sunrise that could not occur.
      expect(parseFakeClock('?t=shuttered').at).toBeNull();
    });

    it('is case-sensitive, because the states are', () => {
      expect(parseFakeClock('?t=Shuttered').state).toBeNull();
    });
  });

  describe('given an instant', () => {
    it('reads it', () => {
      const asked = parseFakeClock('?t=2026-08-14T03:00:00Z');

      expect(asked.at?.toISOString()).toBe('2026-08-14T03:00:00.000Z');
      expect(asked.state).toBeNull();
    });

    it('ignores one it cannot parse', () => {
      // Not an error: a mistyped URL should show the real hour.
      expect(parseFakeClock('?t=half+past+four').at).toBeNull();
      expect(parseFakeClock('?t=2026-13-40').at).toBeNull();
    });
  });

  describe('given a zone', () => {
    it('passes it through alongside either form of t', () => {
      expect(parseFakeClock('?t=open&tz=Asia/Tokyo').zone).toBe('Asia/Tokyo');
      expect(parseFakeClock('?t=2026-08-14T03:00Z&tz=Europe/Lisbon').zone).toBe('Europe/Lisbon');
    });

    it('accepts one on its own — the commonest thing to want', () => {
      // "What does the hotel look like to somebody in Tokyo, right now."
      expect(parseFakeClock('?tz=Asia/Tokyo')).toEqual({
        at: null,
        zone: 'Asia/Tokyo',
        state: null,
      });
    });

    it('does not validate it, because the zone table already falls back', () => {
      // `locationForZone` answers for an unknown zone with a UTC-offset guess and
      // reports `precise: false`. Rejecting it here would only replace a stated
      // approximation with a silent one.
      expect(parseFakeClock('?tz=Mars/Olympus').zone).toBe('Mars/Olympus');
    });
  });

  it('ignores parameters that are not its business', () => {
    expect(parseFakeClock('?utm_source=somewhere&t=late')).toEqual({
      at: null,
      zone: null,
      state: 'late',
    });
  });
});
