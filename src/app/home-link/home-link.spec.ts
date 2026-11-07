import { TestBed } from '@angular/core/testing';
import { HomeLink } from './home-link';

describe('HomeLink', () => {
  it('links home under a named landmark, with the arrow kept out of the name', async () => {
    const fixture = TestBed.createComponent(HomeLink);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const nav = host.querySelector('nav');
    const link = nav?.querySelector<HTMLAnchorElement>('a');

    expect(nav?.getAttribute('aria-label')).toBe('Site');
    expect(link?.getAttribute('href')).toBe('/');
    expect(link?.querySelector('[aria-hidden="true"]')?.textContent).toBe('←');
    expect(link?.textContent?.replace('←', '').trim()).toBe('Jacob Miller');
  });

  it('sits in the flow by default and floats only when asked', async () => {
    const fixture = TestBed.createComponent(HomeLink);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList.contains('floating')).toBe(false);

    fixture.componentRef.setInput('floating', true);
    await fixture.whenStable();
    expect(host.classList.contains('floating')).toBe(true);
  });
});
