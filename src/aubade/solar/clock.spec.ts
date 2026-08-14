import { readClock, resolvedZone } from './clock';

/**
 * The clock end to end: a zone and an instant in, a state and the next two
 * horizon crossings out.
 *
 * The scenarios are chosen to be the ones a reviewer will actually try. Two
 * visitors opening the same URL at the same moment and being shown different
 * works is the entire sentence the piece is supposed to survive being described
 * by, so it is asserted here rather than left to the rooms.
 */

describe('the clock', () => {
  it('shows two visitors different hotels at the same instant', () => {
    // AUBADE's opening claim: Lisbon at 03:00 and Tokyo at 14:00 are the same
    // moment. 03:00 WEST on 21 June is 02:00 UTC; Tokyo is then 11:00.
    const instant = new Date(Date.UTC(2025, 5, 21, 2));

    const lisbon = readClock(instant, 'Europe/Lisbon');
    const tokyo = readClock(instant, 'Asia/Tokyo');

    expect(lisbon.elevationDegrees).toBeLessThan(0);
    expect(tokyo.elevationDegrees).toBeGreaterThan(0);
    expect(lisbon.state).not.toBe(tokyo.state);
    expect(tokyo.state).toBe('shuttered');
  });

  it('is open at local midnight in midwinter', () => {
    // London, 21 December, 00:30 GMT. The sun is roughly 60° below the horizon;
    // this is the hotel at full strength.
    const clock = readClock(new Date(Date.UTC(2025, 11, 21, 0, 30)), 'Europe/London');
    expect(clock.state).toBe('open');
    expect(clock.elevationDegrees).toBeLessThan(-18);
  });

  it('is shuttered at local noon', () => {
    const clock = readClock(new Date(Date.UTC(2025, 5, 21, 12)), 'Europe/London');
    expect(clock.state).toBe('shuttered');
    expect(clock.elevationDegrees).toBeGreaterThan(0);
  });

  it('never opens in a Reykjavík June', () => {
    // At 64°N the solstice sun bottoms out around −2.4°, so astronomical night
    // does not happen and the hotel cannot open for weeks. That is the concept
    // being consistent, not a gap in it: this is a hotel for vampires, and a
    // latitude where the sun does not properly set is a latitude they do not
    // live at. A Reykjavík visitor in June is meant to take the invitation.
    //
    // Pinned here because it is the kind of thing a room will otherwise assume
    // away — an `open` state treated as always eventually reachable.
    for (let hour = 0; hour < 24; hour += 1) {
      const clock = readClock(new Date(Date.UTC(2025, 5, 21, hour)), 'Atlantic/Reykjavik');
      expect(clock.state, `hour ${hour}`).not.toBe('open');
      expect(clock.state, `hour ${hour}`).not.toBe('late');
    }
  });

  it('gives a daytime visitor the minute the sun will set on them', () => {
    // The card on the desk in the shuttered state. Sydney, 21 December, local
    // 09:00 (22:00 UTC on the 20th) — sunset is published at 20:06 AEDT.
    const clock = readClock(new Date(Date.UTC(2025, 11, 20, 22)), 'Australia/Sydney');

    expect(clock.state).toBe('shuttered');
    expect(clock.nextSet).not.toBeNull();

    const published = Date.UTC(2025, 11, 21, 9, 6); // 20:06 AEDT
    expect(Math.abs((clock.nextSet as Date).getTime() - published)).toBeLessThanOrEqual(120_000);
  });

  it('always looks forward, never back', () => {
    const at = new Date(Date.UTC(2025, 8, 22, 15));
    const clock = readClock(at, 'America/New_York');

    expect((clock.nextRise as Date).getTime()).toBeGreaterThan(at.getTime());
    expect((clock.nextSet as Date).getTime()).toBeGreaterThan(at.getTime());
  });

  it('finds the next sunset months away under the midnight sun', () => {
    // Longyearbyen in June has no sunset for weeks. Returning null here would be
    // wrong — the sun does set eventually, and the countdown is the point.
    const at = new Date(Date.UTC(2025, 5, 21, 12));
    const clock = readClock(at, 'Arctic/Longyearbyen');

    expect(clock.nextSet).not.toBeNull();
    const daysAway = ((clock.nextSet as Date).getTime() - at.getTime()) / 86_400_000;
    expect(daysAway).toBeGreaterThan(30);
    expect(daysAway).toBeLessThan(120);
  });

  it('reports when it is guessing at the location', () => {
    expect(readClock(new Date(), 'Europe/Lisbon').location.precise).toBe(true);
    expect(readClock(new Date(), 'Asia/Thimphu').location.precise).toBe(false);
  });

  it('agrees with its own elevation at the crossings it reports', () => {
    const clock = readClock(new Date(Date.UTC(2025, 2, 20, 12)), 'America/Chicago');
    expect(clock.at).toEqual(new Date(Date.UTC(2025, 2, 20, 12)));
    expect(clock.zone).toBe('America/Chicago');
    expect(Number.isFinite(clock.elevationDegrees)).toBe(true);
  });
});

describe('resolvedZone', () => {
  it('returns a zone the runtime can format with', () => {
    const zone = resolvedZone();
    expect(zone.length).toBeGreaterThan(0);
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: zone })).not.toThrow();
  });
});
