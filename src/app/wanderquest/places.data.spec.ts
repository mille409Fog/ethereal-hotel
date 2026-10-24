import {
  BONUS,
  CONTINENTS,
  COUNTRIES,
  COUNTRY_SOURCES,
  type IPlace,
  STATES,
  UN_MEMBERS,
  UN_OBSERVERS,
} from './places.data';
import { OWNER_PROGRESS } from './progress.data';

const ids = (places: readonly IPlace[]): string[] => places.map((place) => place.id);

describe('places.data', () => {
  it('counts what each definition says it counts', () => {
    expect(STATES).toHaveLength(50);
    expect(BONUS).toHaveLength(6);
    expect(CONTINENTS).toHaveLength(7);
    expect(UN_MEMBERS).toHaveLength(193);
    expect(UN_OBSERVERS).toHaveLength(2);
    expect(COUNTRIES).toHaveLength(195);
  });

  it.each([
    ['STATES', STATES],
    ['BONUS', BONUS],
    ['CONTINENTS', CONTINENTS],
    ['COUNTRIES', COUNTRIES],
  ] as const)('gives every place in %s a unique two-letter id and name', (_, places) => {
    expect(new Set(ids(places)).size).toBe(places.length);
    expect(new Set(places.map((place) => place.name)).size).toBe(places.length);
    for (const id of ids(places)) expect(id).toMatch(/^[A-Z]{2}$/);
  });

  it('keeps the bonus category apart from the states', () => {
    const states = new Set(ids(STATES));
    expect(ids(BONUS).filter((id) => states.has(id))).toEqual([]);
  });

  it('cites the UN for both halves of the country count', () => {
    for (const source of COUNTRY_SOURCES) expect(source.url).toMatch(/^https:\/\/www\.un\.org\//);
  });
});

describe('progress.data', () => {
  it.each(Object.entries(OWNER_PROGRESS))('lists no place in %s twice', (_, visited) => {
    expect(new Set(visited).size).toBe(visited.length);
  });
});
