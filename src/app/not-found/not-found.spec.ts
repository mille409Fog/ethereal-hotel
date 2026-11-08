import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, UrlSegment } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { NotFound } from './not-found';

describe('NotFound', () => {
  const segments = (...paths: string[]): UrlSegment[] =>
    paths.map((path) => new UrlSegment(path, {}));

  /** The route's `url` is a BehaviorSubject in the real router too. */
  async function render(url: BehaviorSubject<UrlSegment[]>): Promise<ComponentFixture<NotFound>> {
    TestBed.configureTestingModule({
      providers: [{ provide: ActivatedRoute, useValue: { url } }],
    });
    const fixture = TestBed.createComponent(NotFound);
    await fixture.whenStable();
    return fixture;
  }

  it('names the path it was given and links home', async () => {
    const fixture = await render(new BehaviorSubject(segments('dashbord', 'extra')));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('main h1')?.textContent).toContain('no page');
    expect(host.querySelector('code')?.textContent).toBe('/dashbord/extra');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/');
  });

  it('follows the route when the router reuses it for another unknown path', async () => {
    const url = new BehaviorSubject(segments('first'));
    const fixture = await render(url);

    url.next(segments('second'));
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('code')?.textContent).toBe('/second');
  });
});
