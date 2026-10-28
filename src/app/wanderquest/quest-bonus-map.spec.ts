import { nameLines } from './quest-bonus-map';
import { BONUS } from './places.data';

describe('nameLines', () => {
  it('breaks a long name at spaces, never mid-word', () => {
    expect(nameLines('Northern Mariana Islands')).toEqual(['Northern Mariana', 'Islands']);
    expect(nameLines('District of Columbia')).toEqual(['District of', 'Columbia']);
  });

  it('leaves a short name on one line', () => {
    expect(nameLines('Guam')).toEqual(['Guam']);
    expect(nameLines('American Samoa')).toEqual(['American Samoa']);
  });

  it('gives a word longer than a line a line of its own', () => {
    expect(nameLines('Llanfairpwllgwyngyll town')).toEqual(['Llanfairpwllgwyngyll', 'town']);
  });

  it('needs no more than the two lines the tile frame leaves room for', () => {
    for (const place of BONUS) {
      expect(nameLines(place.name).length, place.name).toBeLessThanOrEqual(2);
    }
  });
});
