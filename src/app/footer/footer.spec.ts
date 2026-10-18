import { TestBed } from '@angular/core/testing';
import { RESUME } from '../resume/resume.data';
import { Footer } from './footer';

describe('Footer', () => {
  it('links the repository under the profile resume.data.ts names', async () => {
    const fixture = TestBed.createComponent(Footer);
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a[href^="https://github.com/"]'
    );

    expect(link?.getAttribute('href')).toBe(`https://${RESUME.contact.github}/ethereal-hotel`);
    expect(link?.textContent?.trim()).toBe(`${RESUME.contact.github}/ethereal-hotel`);
  });
});
