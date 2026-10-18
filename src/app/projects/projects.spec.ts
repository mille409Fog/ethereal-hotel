import { TestBed } from '@angular/core/testing';
import { Projects } from './projects';
import { FRAME, PROJECTS } from './projects.data';

/**
 * The cards as markup. `e2e/project-frames.spec.ts` proves each frame is a
 * true picture of its route; this proves the card asks for it the way the
 * ROADMAP item required — sized, lazy, described — and that the NDA cards ask
 * for no picture at all.
 */
describe('Projects', () => {
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Projects] }).compileComponents();
    const fixture = TestBed.createComponent(Projects);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  const cards = (): HTMLElement[] => Array.from(el.querySelectorAll('.room-card'));

  it('renders one card per project', () => {
    expect(cards()).toHaveLength(PROJECTS.length);
  });

  it('gives every framed project a sized, lazy image with its own alt text', () => {
    PROJECTS.forEach((project, i) => {
      const img = cards()[i].querySelector('img');
      if (!project.frame) {
        expect(img, project.name).toBeNull();
        return;
      }
      expect(img?.getAttribute('src')).toBe(project.frame.src);
      expect(img?.getAttribute('alt')).toBe(project.frame.alt);
      expect(img?.getAttribute('width')).toBe(String(FRAME.width));
      expect(img?.getAttribute('height')).toBe(String(FRAME.height));
      expect(img?.getAttribute('loading')).toBe('lazy');
      expect(img?.getAttribute('src')).toMatch(/\.webp$/);
    });
  });

  it('shows the NDA cards a plate that says there is no screenshot', () => {
    const plates = cards().filter((card) => card.querySelector('.room-plate'));
    expect(plates).toHaveLength(PROJECTS.filter((project) => !project.frame).length);
    plates.forEach((card) => expect(card.textContent).toContain('No screenshot'));
  });

  it('never describes a frame as a screenshot of something', () => {
    for (const project of PROJECTS) {
      expect(project.frame?.alt ?? '').not.toMatch(/screenshot|image of|picture of/i);
    }
  });
});
