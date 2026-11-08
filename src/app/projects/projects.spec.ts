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

  it('gives every card a frame or a case study, never both and never neither', () => {
    for (const project of PROJECTS) {
      expect(Boolean(project.frame) !== Boolean(project.study), project.name).toBe(true);
    }
  });

  it('links each NDA card to the study it quotes', () => {
    for (const project of PROJECTS) {
      if (project.study) {
        expect(project.link, project.name).toBe(`/work#${project.study.slug}`);
      }
    }
  });

  it('prints each NDA card its own line from its case study', () => {
    const plated = PROJECTS.filter((project) => project.study);
    const lines = cards()
      .map((card) => card.querySelector('.room-plate-line')?.textContent?.trim())
      .filter((line): line is string => line !== undefined);
    expect(lines).toEqual(plated.map((project) => project.study?.plate));
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('still explains under the grid why there are no screenshots', () => {
    expect(el.querySelector('.demo-note')?.textContent).toMatch(/no screenshots/i);
  });

  it('writes every name and button label in title case', () => {
    const minorWords = new Set(['a', 'an', 'and', 'in', 'of', 'the', 'to']);
    for (const project of PROJECTS) {
      for (const phrase of [project.name, project.category, project.linkLabel ?? '']) {
        const lowercase = phrase
          .split(/\s+/)
          .filter((word) => /^[a-z]/.test(word) && !minorWords.has(word));
        expect(lowercase, `${project.name}: "${phrase}"`).toEqual([]);
      }
    }
  });

  it('starts every description and alt with a capital, and ends no description with a stop', () => {
    for (const project of PROJECTS) {
      expect(project.description, project.name).toMatch(/^[A-Z].*[^.]$/);
      expect(project.frame?.alt ?? 'None', project.name).toMatch(/^[A-Z]/);
    }
  });

  it('names in the intro the sector of every NDA card', () => {
    const intro = el.querySelector('.section-description')?.textContent?.toLowerCase() ?? '';
    expect(intro).toContain('demos');
    expect(intro).toContain('under nda');
    for (const project of PROJECTS.filter((candidate) => candidate.study)) {
      expect(intro, project.name).toContain(project.category.toLowerCase());
    }
  });

  it('never describes a frame as a screenshot of something', () => {
    for (const project of PROJECTS) {
      expect(project.frame?.alt ?? '').not.toMatch(/screenshot|image of|picture of/i);
    }
  });
});
