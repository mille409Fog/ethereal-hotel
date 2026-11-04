import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LinearRgb, linearToOklab } from '../aesthetic/colour';
import { Deficiency, simulateLinear } from '../aesthetic/cvd';
import { contrastRatio } from '../aesthetic/winnow';
import { BONUS_OUTLINE } from './bonus.outline';
import { COUNTRIES_OUTLINE } from './countries.outline';
import { CARIBBEAN_OUTLINE } from './caribbean.outline';
import { EUROPE_OUTLINE } from './europe.outline';
import { GUEST_PROGRESS_KEY, GUEST_STORAGE, GuestProgressStore } from './guest-progress';
import { BONUS, CONTINENTS, COUNTRIES, STATES } from './places.data';
import { OWNER_PROGRESS } from './progress.data';
import { QUEST_STATE, QUESTS, stepQuest } from './quest-state';
import { Wanderquest } from './wanderquest';

/**
 * `--color-bg`, the ground every map will sit on. The unit tests load no
 * global stylesheet, so this is a copy, and `check:docs` fails when it stops
 * matching `styles.css`.
 */
const PAGE_BACKGROUND = '#1a2a25';

/** `--color-negative`, the destructive answer's text; a copy held the same way. */
const NEGATIVE = '#e8a0a8';

/** `--color-surface`, the sea the world maps' places sit on; a copy held the same way. */
const SEA = '#24342f';

/** `--color-inactive`, the land that is none of the places; a copy held the same way. */
const UNKEYED = '#75847e';

/** WCAG 1.4.11: a mark a reader has to tell apart from what surrounds it. */
const NON_TEXT_CONTRAST = 3;

/** WCAG 1.4.3: body-size text. */
const TEXT_CONTRAST = 4.5;

/**
 * OKLab's just-noticeable difference is about 0.02. Two roles in one palette
 * must stay five of those apart for a red–green dichromat, and one role in
 * two palettes four: the palettes are never on screen together, so mistaking
 * one for another costs less than mistaking visited for unvisited.
 */
const WITHIN_PALETTE = 0.1;
const ACROSS_PALETTES = 0.08;

/** The deficiencies a red, a green and a blue palette are most at risk from. */
const RED_GREEN: readonly Deficiency[] = ['protanopia', 'deuteranopia'];

const ROLES = ['unvisited', 'visited', 'highlight', 'bonus'] as const;
type Role = (typeof ROLES)[number];
/** A panel's palette as its tokens resolve; a role the panel lacks is ''. */
type Palette = Readonly<Record<Role, string>>;

function linear(hex: string): LinearRgb {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return [r, g, b];
}

function contrast(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const [r, g, b] = linear(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  return contrastRatio(luminance(a), luminance(b));
}

/**
 * OKLab distance between two colours as someone with `deficiency` sees them,
 * or with typical vision when there is none.
 */
function apart(a: string, b: string, deficiency: Deficiency | null): number {
  const [p, q] = [a, b].map((hex) =>
    linearToOklab(deficiency ? simulateLinear(linear(hex), deficiency) : linear(hex))
  );
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

describe('stepQuest', () => {
  it('walks right and left, wrapping at both ends', () => {
    expect(stepQuest(QUEST_STATE.STATES, 'ArrowRight')).toBe(QUEST_STATE.CONTINENTS);
    expect(stepQuest(QUEST_STATE.COUNTRIES, 'ArrowRight')).toBe(QUEST_STATE.STATES);
    expect(stepQuest(QUEST_STATE.STATES, 'ArrowLeft')).toBe(QUEST_STATE.COUNTRIES);
  });

  it('jumps to the ends on Home and End', () => {
    expect(stepQuest(QUEST_STATE.CONTINENTS, 'Home')).toBe(QUEST_STATE.STATES);
    expect(stepQuest(QUEST_STATE.CONTINENTS, 'End')).toBe(QUEST_STATE.COUNTRIES);
  });

  it('ignores keys the tablist does not use', () => {
    expect(stepQuest(QUEST_STATE.STATES, 'ArrowDown')).toBeNull();
    expect(stepQuest(QUEST_STATE.STATES, 'a')).toBeNull();
  });
});

describe('QUESTS', () => {
  it('counts the real lists, not typed figures', () => {
    const totals = Object.fromEntries(QUESTS.map((quest) => [quest.id, quest.places.length]));
    expect(totals).toEqual({
      [QUEST_STATE.STATES]: STATES.length,
      [QUEST_STATE.CONTINENTS]: CONTINENTS.length,
      [QUEST_STATE.COUNTRIES]: COUNTRIES.length,
    });
    expect(Object.values(totals)).toEqual([50, 7, 195]);
  });

  it('gives the bonus category to the states quest only', () => {
    expect(QUESTS.map((quest) => quest.bonusPlaces?.length ?? null)).toEqual([
      BONUS.length,
      null,
      null,
    ]);
    expect(QUESTS.map((quest) => quest.ownerBonus?.total ?? null)).toEqual([
      BONUS.length,
      null,
      null,
    ]);
  });

  it("lists each of the owner's places once, so a count can never pass its total", () => {
    for (const [list, ids] of Object.entries(OWNER_PROGRESS)) {
      expect(new Set(ids).size, list).toBe(ids.length);
    }
  });

  it("takes the owner's figures from the committed record", () => {
    expect(QUESTS.map((quest) => quest.owner)).toEqual([
      { visited: OWNER_PROGRESS.states.length, total: STATES.length },
      { visited: OWNER_PROGRESS.continents.length, total: CONTINENTS.length },
      { visited: OWNER_PROGRESS.countries.length, total: COUNTRIES.length },
    ]);
  });
});

describe('Wanderquest', () => {
  let fixture: ComponentFixture<Wanderquest>;
  let host: HTMLElement;

  const tabs = (): HTMLButtonElement[] => Array.from(host.querySelectorAll('[role="tab"]'));
  const selected = (): string[] =>
    tabs()
      .filter((tab) => tab.getAttribute('aria-selected') === 'true')
      .map((tab) => tab.textContent?.trim() ?? '');
  const visiblePanels = (): HTMLElement[] =>
    Array.from(host.querySelectorAll<HTMLElement>('[role="tabpanel"]')).filter(
      (panel) => !panel.hidden
    );

  /** Each panel's palette, read from the tokens the stylesheet gives it. */
  const palettes = (): Readonly<Record<QUEST_STATE, Palette>> => {
    const of = (quest: QUEST_STATE): Palette => {
      const panel = host.querySelector<HTMLElement>(`#quest-panel-${quest}`);
      const style = panel ? window.getComputedStyle(panel) : null;
      const read = (role: Role): string => style?.getPropertyValue(`--quest-${role}`).trim() ?? '';
      return {
        unvisited: read('unvisited'),
        visited: read('visited'),
        highlight: read('highlight'),
        bonus: read('bonus'),
      };
    };
    return {
      [QUEST_STATE.STATES]: of(QUEST_STATE.STATES),
      [QUEST_STATE.CONTINENTS]: of(QUEST_STATE.CONTINENTS),
      [QUEST_STATE.COUNTRIES]: of(QUEST_STATE.COUNTRIES),
    };
  };

  const press = async (key: string): Promise<KeyboardEvent> => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    (document.activeElement ?? host).dispatchEvent(event);
    await fixture.whenStable();
    return event;
  };

  const open = async (): Promise<void> => {
    fixture = TestBed.createComponent(Wanderquest);
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  };

  /** A fresh page on the same storage: what a reload looks like to the store. */
  const reload = async (): Promise<void> => {
    fixture.destroy();
    host.remove();
    await open();
  };

  /** Opens the page on storage of the test's choosing, or on none at all. */
  const openWith = async (chosen: Storage | null): Promise<void> => {
    fixture.destroy();
    host.remove();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Wanderquest],
      providers: [{ provide: GUEST_STORAGE, useValue: chosen }],
    }).compileComponents();
    await open();
  };

  const statesPanel = (): HTMLElement =>
    host.querySelector<HTMLElement>(`#quest-panel-${QUEST_STATE.STATES}`) ?? host;
  const text = (within: Element, selector: string): string =>
    within.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const shape = (id: string): SVGPathElement | null =>
    statesPanel().querySelector(`svg.quest-outline path[data-id="${id}"]`);
  const box = (name: string): HTMLInputElement | null => {
    const label = Array.from(statesPanel().querySelectorAll('label')).find(
      (candidate) => candidate.textContent?.trim() === name
    );
    return label ? statesPanel().querySelector<HTMLInputElement>(`#${label.htmlFor}`) : null;
  };
  const clickShape = async (id: string): Promise<void> => {
    shape(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
  };
  const clickBox = async (name: string): Promise<void> => {
    box(name)?.click();
    await fixture.whenStable();
  };

  let storage: Storage;

  beforeEach(async () => {
    storage = memoryStorage();
    await TestBed.configureTestingModule({
      imports: [Wanderquest],
      providers: [{ provide: GUEST_STORAGE, useValue: storage }],
    }).compileComponents();
    await open();
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  it('starts on the states quest with exactly one tab selected', () => {
    expect(selected()).toEqual(['States']);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  });

  it('wires each tab to its panel and back', () => {
    for (const tab of tabs()) {
      const panel = host.querySelector(`#${tab.getAttribute('aria-controls')}`);
      expect(panel?.getAttribute('role')).toBe('tabpanel');
      expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
    }
  });

  it('selects a quest on click and shows only its panel', async () => {
    tabs()[2].click();
    await fixture.whenStable();

    expect(selected()).toEqual(['Countries']);
    expect(visiblePanels().map((panel) => panel.id)).toEqual(['quest-panel-countries']);
  });

  it('moves selection and focus with the arrow keys, Home and End', async () => {
    tabs()[0].focus();

    const event = await press('ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(selected()).toEqual(['Continents']);
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);

    await press('End');
    expect(selected()).toEqual(['Countries']);
    expect(document.activeElement).toBe(tabs()[2]);

    await press('ArrowRight');
    expect(selected()).toEqual(['States']);
    expect(document.activeElement).toBe(tabs()[0]);

    await press('ArrowLeft');
    expect(selected()).toEqual(['Countries']);

    await press('Home');
    expect(selected()).toEqual(['States']);
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('steps from the focused tab, not from the selected one', async () => {
    // Focus reaches "continents" while "states" is still selected.
    tabs()[1].focus();

    await press('ArrowLeft');
    expect(selected()).toEqual(['States']);
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('leaves other keys to the browser', async () => {
    tabs()[0].focus();
    const event = await press('ArrowDown');
    expect(event.defaultPrevented).toBe(false);
    expect(selected()).toEqual(['States']);
  });

  it("counts the guest, from empty, and gives the owner's figures a line of their own", async () => {
    const lines: Array<[string, string]> = [];
    for (const tab of tabs()) {
      tab.click();
      await fixture.whenStable();
      lines.push([
        text(visiblePanels()[0], '.quest-tally'),
        text(visiblePanels()[0], '.quest-owner'),
      ]);
    }

    expect(lines).toEqual([
      [
        '0 of 50 states visited',
        `Jacob's own record: ${OWNER_PROGRESS.states.length} of 50 states, and ` +
          `${OWNER_PROGRESS.bonus.length} of 6 bonus`,
      ],
      [
        '0 of 7 continents visited',
        `Jacob's own record: ${OWNER_PROGRESS.continents.length} of 7 continents`,
      ],
      [
        '0 of 195 countries visited',
        `Jacob's own record: ${OWNER_PROGRESS.countries.length} of 195 countries`,
      ],
    ]);
  });

  it('shows the bonus category on the states panel only', async () => {
    expect(text(visiblePanels()[0], '.quest-bonus')).toContain('0 of 6');

    tabs()[1].click();
    await fixture.whenStable();
    expect(visiblePanels()[0].querySelector('.quest-bonus')).toBeNull();
  });

  it('outlines every quest as one named image, keyed by place, with nothing to focus', () => {
    const labels = {
      [QUEST_STATE.STATES]: 'Outline map of the fifty states',
      [QUEST_STATE.CONTINENTS]: 'Outline map of the seven continents',
      [QUEST_STATE.COUNTRIES]: 'Outline map of the countries of the world',
    };
    expect(host.querySelectorAll('svg.quest-outline:not(.quest-outline-inset)').length).toBe(
      QUESTS.length
    );

    for (const quest of QUESTS) {
      const svg = host.querySelector(`#quest-panel-${quest.id} svg.quest-outline`);
      expect(svg?.getAttribute('role'), quest.id).toBe('img');
      expect(svg?.getAttribute('aria-label')).toBe(labels[quest.id]);

      const keyed = Array.from(svg?.querySelectorAll('path[data-id]') ?? []).map((path) =>
        path.getAttribute('data-id')
      );
      expect(keyed).toEqual(quest.outline?.shapes.map((shape) => shape.id));
      expect(svg?.querySelectorAll('[tabindex], a, [focusable="true"]').length).toBe(0);
    }
  });

  describe('the caption under each outline', () => {
    /** A pointer event as the browser sends it; jsdom's lacks `pointerType`. */
    const point = async (
      target: Element | null,
      type: 'pointerover' | 'pointerup' | 'pointerleave',
      pointerType = 'mouse'
    ): Promise<void> => {
      const event = new MouseEvent(type, { bubbles: type !== 'pointerleave' });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      target?.dispatchEvent(event);
      await fixture.whenStable();
    };
    const caption = (svg: Element | null): string =>
      svg?.nextElementSibling?.matches('p.quest-outline-caption')
        ? (svg.nextElementSibling.textContent?.trim() ?? '')
        : 'no caption';
    const states = (): SVGSVGElement | null => statesPanel().querySelector('svg.quest-outline');

    it("names every keyed shape under the pointer with its place's name, and nothing else", async () => {
      const svgs = Array.from(host.querySelectorAll('svg.quest-outline'));
      expect(svgs.map(caption).every((line) => line === '')).toBe(true);

      for (const quest of QUESTS) {
        const svg = host.querySelector(`#quest-panel-${quest.id} svg.quest-outline`);
        const names = new Map(quest.places.map((place) => [place.id, place.name]));
        const keyed = Array.from(svg?.querySelectorAll('path[data-id]') ?? []);
        expect(keyed.length, quest.id).toBe(quest.outline?.shapes.length);

        for (const path of keyed) {
          const id = path.getAttribute('data-id') ?? '';
          expect(path.querySelector('title'), `${quest.id} ${id}`).toBeNull();
          await point(path, 'pointerover');
          expect(caption(svg), `${quest.id} ${id}`).toBe(`${names.get(id)} — not yet visited`);
        }
        // The ground between places, and unkeyed land where a map has it, are
        // none of the places, so they are named as none of them.
        await point(svg, 'pointerover');
        expect(caption(svg), quest.id).toBe('');
        const unkeyed = svg?.querySelector('path.quest-outline-unkeyed');
        if (unkeyed) {
          await point(keyed[0], 'pointerover');
          await point(unkeyed, 'pointerover');
          expect(caption(svg), quest.id).toBe('');
        }
      }
    });

    it('says the state, follows a mark at once, and empties when the pointer leaves', async () => {
      await point(shape('TX'), 'pointerover');
      expect(caption(states())).toBe('Texas — not yet visited');

      await clickShape('TX');
      expect(caption(states())).toBe('Texas — visited');

      await point(states(), 'pointerleave');
      expect(caption(states())).toBe('');
    });

    it("names the checklist row's place, but only on a drawing that holds it", async () => {
      box('Ohio')?.focus();
      await fixture.whenStable();
      expect(caption(states())).toBe('Ohio — not yet visited');

      const countries = host.querySelector<HTMLElement>('#quest-panel-countries') ?? host;
      const [world, europe] = Array.from(countries.querySelectorAll('svg.quest-outline'));
      const focusCountry = async (name: string): Promise<void> => {
        const label = Array.from(countries.querySelectorAll('label')).find(
          (candidate) => candidate.textContent?.trim() === name
        );
        countries.querySelector<HTMLInputElement>(`#${label?.htmlFor}`)?.focus();
        await fixture.whenStable();
      };
      await focusCountry('Belgium');
      expect([caption(world), caption(europe)]).toEqual([
        'Belgium — not yet visited',
        'Belgium — not yet visited',
      ]);
      await focusCountry('Brazil');
      expect([caption(world), caption(europe)]).toEqual(['Brazil — not yet visited', '']);
    });

    it('names the place a tap toggled, keeps it after the finger lifts, and yields to a row', async () => {
      // A finger passing over is a scroll as often as a tap, so it names nothing.
      await point(shape('UT'), 'pointerover', 'touch');
      expect(caption(states())).toBe('');

      await point(shape('UT'), 'pointerup', 'touch');
      await clickShape('UT');
      await point(states(), 'pointerleave', 'touch');
      expect(caption(states())).toBe('Utah — visited');

      box('Nevada')?.focus();
      await fixture.whenStable();
      expect(caption(states())).toBe('Nevada — not yet visited');
    });

    it('is not a live region, so a hover is never read aloud', () => {
      for (const line of Array.from(host.querySelectorAll('.quest-outline-caption'))) {
        expect(line.closest('[aria-live], [role="status"], [role="log"]')).toBeNull();
      }
    });
  });

  it('draws the bonus on the states panel, below the states, as one named image', () => {
    const maps = Array.from(host.querySelectorAll('svg.quest-bonus-map'));
    expect(maps.map((map) => map.closest('section')?.id)).toEqual(['quest-panel-states']);

    const [map] = maps;
    expect(map.getAttribute('role')).toBe('img');
    expect(map.getAttribute('aria-label')).toBe(
      'Outline maps of the District of Columbia and the five inhabited territories'
    );
    expect(map.querySelectorAll('[tabindex], a, [focusable="true"]').length).toBe(0);
    const states = statesPanel().querySelector('svg.quest-outline');
    expect(
      states && states.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('keys one shape per bonus place in BONUS order, names each tile, and fills none yet', () => {
    const map = statesPanel().querySelector('svg.quest-bonus-map');
    const keyed = Array.from(map?.querySelectorAll('path[data-id]') ?? []);
    expect(keyed.map((path) => path.getAttribute('data-id'))).toEqual(
      BONUS.map((place) => place.id)
    );
    expect(keyed.every((path) => (path.getAttribute('d') ?? '').length > 0)).toBe(true);
    expect(map?.querySelectorAll('rect.quest-bonus-tile').length).toBe(BONUS.length);

    const names = Array.from(map?.querySelectorAll('text.quest-bonus-name') ?? []).map((name) =>
      Array.from(name.querySelectorAll('tspan'))
        .map((line) => line.textContent?.trim())
        .join(' ')
    );
    expect(names).toEqual(BONUS.map((place) => place.name));
    expect(map?.querySelectorAll('.quest-visited').length).toBe(0);
  });

  it('says in text that the bonus tiles are not to a common scale, and what one leaves out', () => {
    const notes = Array.from(host.querySelectorAll('.quest-bonus-scale'));
    expect(notes.map((note) => note.closest('section')?.id)).toEqual(['quest-panel-states']);
    expect(notes[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Each bonus place is drawn to fill its own tile, so the tiles are not to a common scale. ' +
        'Northern Mariana Islands: drawn as its southern islands, Saipan, Tinian and Rota, ' +
        'without the Northern Islands beyond them.'
    );
  });

  it('draws the land that is none of the countries apart, and keys it as not counted', async () => {
    // The world and its two insets, each with the land of its own frame.
    const unkeyed = Array.from(host.querySelectorAll('path.quest-outline-unkeyed'));
    expect(unkeyed.length, 'only the countries maps have land outside their count').toBe(3);
    for (const land of unkeyed) {
      expect(land.closest('section')?.id).toBe('quest-panel-countries');
      expect(land.hasAttribute('data-id')).toBe(false);
    }

    tabs()[2].click();
    await fixture.whenStable();
    const key = Array.from(visiblePanels()[0].querySelectorAll('.quest-key-item')).map(
      (item) => item.textContent?.trim() ?? ''
    );
    expect(key).toContain('Not counted');
  });

  it('draws every place on some map, so no panel says a place is too small to draw', () => {
    // The line is still in the template for an outline that leaves a place
    // out; since the smallest countries became dots, none does.
    expect(host.querySelectorAll('.quest-undrawn').length).toBe(0);
  });

  it('says on the countries panel only what drawing places as dots costs', () => {
    const notes = Array.from(host.querySelectorAll<HTMLElement>('.quest-outline-note'));
    expect(notes.map((note) => note.closest('section')?.id)).toEqual(['quest-panel-countries']);
    expect(notes[0].textContent?.trim()).toBe(COUNTRIES_OUTLINE.note);
  });

  it('gives each panel its own palette in six-digit hex, and the bonus to states only', () => {
    const hex = /^#[0-9a-f]{6}$/;
    for (const quest of QUESTS) {
      const palette = palettes()[quest.id];
      for (const role of ROLES) {
        if (role === 'bonus' && !quest.bonusPlaces) {
          expect(palette.bonus, `${quest.id} has a bonus colour`).toBe('');
        } else {
          expect(palette[role], `${quest.id} ${role}`).toMatch(hex);
        }
      }
    }
    const visited = QUESTS.map((quest) => palettes()[quest.id].visited);
    expect(new Set(visited).size).toBe(QUESTS.length);
  });

  it('holds every visited colour at 3:1 on the page and on its own unvisited', () => {
    for (const quest of QUESTS) {
      const palette = palettes()[quest.id];
      const marks = quest.bonusPlaces ? [palette.visited, palette.bonus] : [palette.visited];
      for (const mark of marks) {
        expect(
          contrast(mark, PAGE_BACKGROUND),
          `${quest.id} ${mark} on the page`
        ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
        expect(
          contrast(mark, palette.unvisited),
          `${quest.id} ${mark} on ${palette.unvisited}`
        ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
      }
    }
  });

  it('keeps every role in a palette apart under protanopia and deuteranopia', () => {
    for (const quest of QUESTS) {
      const palette = palettes()[quest.id];
      const roles = ROLES.filter((role) => palette[role]);
      for (const deficiency of RED_GREEN) {
        roles.forEach((one, i) => {
          for (const two of roles.slice(i + 1)) {
            expect(
              apart(palette[one], palette[two], deficiency),
              `${quest.id} ${one} and ${two} under ${deficiency}`
            ).toBeGreaterThanOrEqual(WITHIN_PALETTE);
          }
        });
      }
    }
  });

  it('keeps the three palettes apart under protanopia and deuteranopia', () => {
    const all = palettes();
    for (const role of ['unvisited', 'visited', 'highlight'] as const) {
      for (const deficiency of RED_GREEN) {
        QUESTS.forEach((one, i) => {
          for (const two of QUESTS.slice(i + 1)) {
            expect(
              apart(all[one.id][role], all[two.id][role], deficiency),
              `${one.id} and ${two.id} ${role} under ${deficiency}`
            ).toBeGreaterThanOrEqual(ACROSS_PALETTES);
          }
        });
      }
    }
  });

  describe('the sea under the world maps', () => {
    const seas = (): SVGPathElement[] =>
      Array.from(host.querySelectorAll<SVGPathElement>('path.quest-outline-sphere'));
    /** The quests whose outline sits on a globe: every Equal Earth one, and not the states. */
    const global = QUESTS.filter((quest) => quest.outline?.sphere !== undefined);

    it('lies under every place on the world maps and the insets, and under none on the states', () => {
      expect(global.map((quest) => quest.id)).toEqual([
        QUEST_STATE.CONTINENTS,
        QUEST_STATE.COUNTRIES,
      ]);
      expect(seas().map((sea) => sea.closest('section')?.id)).toEqual([
        'quest-panel-continents',
        'quest-panel-countries',
        'quest-panel-countries',
        'quest-panel-countries',
      ]);
      for (const sea of seas()) {
        expect(sea.parentElement?.firstElementChild).toBe(sea);
        expect(sea.hasAttribute('data-id')).toBe(false);
        // jsdom resolves the rule but not the token; the token is measured below.
        expect(window.getComputedStyle(sea).fill).toBe('var(--color-surface)');
        expect(window.getComputedStyle(sea).pointerEvents).toBe('none');
      }
    });

    it('answers no click', async () => {
      for (const sea of seas()) {
        sea.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
      await fixture.whenStable();
      expect(host.querySelectorAll('path.quest-visited').length).toBe(0);
      expect(storage.getItem(GUEST_PROGRESS_KEY)).toBeNull();
    });

    it('holds every mark on it at 3:1, as the page holds them', () => {
      for (const quest of global) {
        const { visited, highlight } = palettes()[quest.id];
        for (const mark of [visited, highlight]) {
          expect(contrast(mark, SEA), `${quest.id} ${mark} on the sea`).toBeGreaterThanOrEqual(
            NON_TEXT_CONTRAST
          );
        }
      }
    });

    // Neither is a mark, so neither owes the sea 3:1, and no fill that dark
    // could reach it; but each is land, and must not read as sea. So each is
    // held apart from it as two roles in a palette are, and for typical
    // vision too: the unkeyed grey looks the same to everyone.
    it('keeps the unvisited fill and the unkeyed grey apart from it, as land', () => {
      const land = [
        ...global.map((quest) => [quest.id, palettes()[quest.id].unvisited]),
        ['unkeyed', UNKEYED],
      ];
      for (const [name, fill] of land) {
        for (const deficiency of [null, ...RED_GREEN]) {
          expect(
            apart(fill, SEA, deficiency),
            `${name} ${fill} on the sea under ${deficiency ?? 'typical vision'}`
          ).toBeGreaterThanOrEqual(WITHIN_PALETTE);
        }
      }
      // The unkeyed land is drawn beside the countries' unmarked ones.
      for (const deficiency of [null, ...RED_GREEN]) {
        expect(
          apart(UNKEYED, palettes()[QUEST_STATE.COUNTRIES].unvisited, deficiency),
          `unkeyed beside the countries under ${deficiency ?? 'typical vision'}`
        ).toBeGreaterThanOrEqual(WITHIN_PALETTE);
      }
    });
  });

  it('switches the palette, and its key, with the view', async () => {
    const shown = (): { visited: string; key: string[] } => {
      const panel = visiblePanels()[0];
      return {
        visited: window.getComputedStyle(panel).getPropertyValue('--quest-visited').trim(),
        key: Array.from(panel.querySelectorAll('.quest-key-item')).map(
          (item) => item.textContent?.trim() ?? ''
        ),
      };
    };

    const states = shown();
    tabs()[1].click();
    await fixture.whenStable();
    const continents = shown();

    expect(continents.visited).not.toBe(states.visited);
    expect(continents.visited).toBe(palettes()[QUEST_STATE.CONTINENTS].visited);
    // Every colour is named beside its swatch, so none of them is the only signal.
    expect(states.key).toEqual(['Not yet visited', 'Visited', 'Highlighted', 'Bonus, visited']);
    expect(continents.key).toEqual(['Not yet visited', 'Visited', 'Highlighted']);
  });

  it('toggles one state from the map and from its checkbox, and the tally follows both', async () => {
    const tally = (): string => text(statesPanel(), '.quest-tally');
    const filled = (): boolean => shape('CA')?.classList.contains('quest-visited') ?? false;

    await clickShape('CA');
    expect([filled(), box('California')?.checked, tally()]).toEqual([
      true,
      true,
      '1 of 50 states visited',
    ]);

    await clickBox('California');
    expect([filled(), box('California')?.checked, tally()]).toEqual([
      false,
      false,
      '0 of 50 states visited',
    ]);

    await clickBox('California');
    await clickShape('CA');
    expect([filled(), box('California')?.checked, tally()]).toEqual([
      false,
      false,
      '0 of 50 states visited',
    ]);
  });

  it('offers a native checkbox for every state and every bonus place, and nothing else', () => {
    const names = Array.from(statesPanel().querySelectorAll('label')).map(
      (label) => label.textContent?.trim() ?? ''
    );
    expect(names).toEqual([...STATES, ...BONUS].map((place) => place.name));
    expect(statesPanel().querySelectorAll('input[type="checkbox"]').length).toBe(
      STATES.length + BONUS.length
    );
    expect(
      Array.from(host.querySelectorAll('app-quest-checklist')).map(
        (list) => list.closest('section')?.id
      )
    ).toEqual(QUESTS.map((quest) => `quest-panel-${quest.id}`));
    // Only the 195 are long enough to need searching.
    expect(statesPanel().querySelector('input[type="search"]')).toBeNull();
  });

  it('fills the bonus tally from the list, never the states tally', async () => {
    await clickBox('Puerto Rico');
    await clickBox('Guam');

    expect(text(statesPanel(), '.quest-bonus')).toContain('2 of 6');
    expect(text(statesPanel(), '.quest-tally')).toBe('0 of 50 states visited');
    expect(statesPanel().querySelectorAll('svg.quest-outline path.quest-visited').length).toBe(0);
  });

  it('draws the tally as a hidden bar that the bonus never fills', async () => {
    const bars = (): HTMLElement[] =>
      Array.from(statesPanel().querySelectorAll<HTMLElement>('.quest-progress'));
    const fill = (): string =>
      statesPanel().querySelector<HTMLElement>('.quest-progress-fill')?.style.width ?? '';

    expect(bars().map((bar) => bar.getAttribute('aria-hidden'))).toEqual(['true']);
    expect(fill()).toBe('0%');

    await clickBox('California');
    await clickBox('Texas');
    expect(fill()).toBe('4%');

    await clickBox('Puerto Rico');
    expect([fill(), bars().length]).toEqual(['4%', 1]);
  });

  describe('a checklist row lighting its place', () => {
    const row = (name: string, within: HTMLElement = statesPanel()): HTMLElement | null => {
      const label = Array.from(within.querySelectorAll('label')).find(
        (candidate) => candidate.textContent?.trim() === name
      );
      return label?.closest('li') ?? null;
    };
    const lit = (within: HTMLElement = statesPanel()): string[] =>
      Array.from(within.querySelectorAll('svg.quest-outline path.quest-highlighted')).map(
        (path) => path.getAttribute('data-id') ?? ''
      );
    const send = async (target: Element | null, type: string): Promise<void> => {
      target?.dispatchEvent(new Event(type, { bubbles: type.startsWith('focus') }));
      await fixture.whenStable();
    };

    it('lights the shape while the pointer is over the row, and clears it on leaving', async () => {
      await send(row('California'), 'mouseenter');
      expect(lit()).toEqual(['CA']);
      const path = shape('CA');
      // jsdom resolves the rule but not the custom property; the colour is
      // the key's, held to its palette above.
      expect(path ? window.getComputedStyle(path).fill : '').toBe('var(--quest-highlight)');

      await send(row('California'), 'mouseleave');
      expect(lit()).toEqual([]);
    });

    it('lights the shape while focus is in the row, for a keyboard user', async () => {
      box('Nevada')?.focus();
      await fixture.whenStable();
      expect(lit()).toEqual(['NV']);

      box('Utah')?.focus();
      await fixture.whenStable();
      expect(lit()).toEqual(['UT']);

      box('Utah')?.blur();
      await fixture.whenStable();
      expect(lit()).toEqual([]);
    });

    it('lights a marked place too, and leaves its mark alone', async () => {
      await clickBox('Texas');
      await send(row('Texas'), 'mouseenter');
      expect(lit()).toEqual(['TX']);
      expect(shape('TX')?.classList.contains('quest-visited')).toBe(true);
      expect(text(statesPanel(), '.quest-tally')).toBe('1 of 50 states visited');
    });

    it('lights only its own quest, though ids repeat across quests', async () => {
      const countries = host.querySelector<HTMLElement>('#quest-panel-countries') ?? host;
      await send(row('California'), 'mouseenter');
      expect(lit(countries)).toEqual([]);

      await send(row('Canada', countries), 'mouseenter');
      expect([lit(), lit(countries)]).toEqual([[], ['CA']]);
    });

    it('lights a country drawn as a dot exactly as it lights a shape', async () => {
      const countries = host.querySelector<HTMLElement>('#quest-panel-countries') ?? host;
      await send(row('Singapore', countries), 'mouseenter');
      expect(lit(countries)).toEqual(['SG']);
    });

    it('does nothing, quietly, for a bonus place, which the outline does not draw', async () => {
      await send(row('Guam'), 'mouseenter');
      expect(host.querySelectorAll('.quest-highlighted').length).toBe(0);
    });
  });

  describe('the bonus map', () => {
    const map = (): SVGSVGElement | null =>
      statesPanel().querySelector<SVGSVGElement>('svg.quest-bonus-map');
    const land = (id: string): SVGPathElement | null =>
      map()?.querySelector<SVGPathElement>(`path[data-id="${id}"]`) ?? null;
    const water = (id: string): Element | null =>
      map()?.querySelector(`g[data-id="${id}"] rect.quest-bonus-tile`) ?? null;
    const name = (id: string): Element | null =>
      map()?.querySelector(`g[data-id="${id}"] text.quest-bonus-name tspan`) ?? null;
    const click = async (target: Element | null | undefined): Promise<void> => {
      target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await fixture.whenStable();
    };
    const filled = (id: string): boolean => land(id)?.classList.contains('quest-visited') ?? false;
    const bonus = (): string => text(statesPanel(), '.quest-bonus');
    const stored = (): Record<string, string[]> =>
      JSON.parse(storage.getItem(GUEST_PROGRESS_KEY) ?? '{}') as Record<string, string[]>;

    it('marks a place from a click on its land, and the checkbox and tally follow', async () => {
      await click(land('GU'));
      expect([filled('GU'), box('Guam')?.checked]).toEqual([true, true]);
      expect(bonus()).toContain('1 of 6');

      await click(land('GU'));
      expect([filled('GU'), box('Guam')?.checked]).toEqual([false, false]);
      expect(bonus()).toContain('0 of 6');
    });

    it('takes a click anywhere on the tile, its water and its name, not only the land', async () => {
      // DC's land fills its tile; American Samoa's is a few specks in water.
      await click(water('AS'));
      expect([filled('AS'), box('American Samoa')?.checked]).toEqual([true, true]);

      await click(name('AS'));
      expect(filled('AS')).toBe(false);
    });

    it('ignores a click on the ground between the tiles', async () => {
      await click(map());
      expect(map()?.querySelectorAll('.quest-visited').length).toBe(0);
      expect(storage.getItem(GUEST_PROGRESS_KEY)).toBeNull();
    });

    it('stays in step with the checkboxes, whichever is used', async () => {
      await clickBox('Puerto Rico');
      expect(filled('PR')).toBe(true);

      await click(water('PR'));
      expect([filled('PR'), box('Puerto Rico')?.checked]).toEqual([false, false]);

      await click(water('VI'));
      await clickBox('U.S. Virgin Islands');
      expect([filled('VI'), box('U.S. Virgin Islands')?.checked]).toEqual([false, false]);
      expect(bonus()).toContain('0 of 6');
    });

    it('fills a mark with the bonus colour, which the key names', async () => {
      await click(water('DC'));
      const path = land('DC');
      const fill = path ? window.getComputedStyle(path).fill : '';
      // jsdom resolves the rule but not the custom property, so the rule is
      // what is held here; the colour's contrast is held above.
      expect(fill).toBe('var(--quest-bonus)');
      expect(path?.classList.contains('quest-visited')).toBe(true);
    });

    describe('the rings round scattered land', () => {
      const ringsOf = (id: string): SVGCircleElement[] =>
        Array.from(
          map()?.querySelectorAll<SVGCircleElement>(`g[data-id="${id}"] circle.quest-bonus-ring`) ??
            []
        );

      it('draws one per island group the outline names, and none where the land fills', () => {
        for (const tile of BONUS_OUTLINE.tiles ?? []) {
          expect(
            ringsOf(tile.id).map((ring) => ['cx', 'cy', 'r'].map((a) => ring.getAttribute(a))),
            tile.id
          ).toEqual((tile.circles ?? []).map(({ cx, cy, r }) => [cx, cy, r].map(String)));
        }
        for (const id of ['DC', 'PR', 'GU']) {
          expect(ringsOf(id), id).toEqual([]);
        }
      });

      it('strokes nothing while the place is unmarked, and the bonus colour once it is', async () => {
        // jsdom resolves the rule but not the custom property; the colour's
        // contrast is held below.
        const strokes = (): string[] =>
          ringsOf('AS').map((ring) => window.getComputedStyle(ring).stroke);
        expect(strokes()).toEqual(['none', 'none']);

        await click(water('AS'));
        expect(strokes()).toEqual(['var(--quest-bonus)', 'var(--quest-bonus)']);
        expect(ringsOf('AS').every((ring) => ring.classList.contains('quest-visited'))).toBe(true);

        await click(water('AS'));
        expect(strokes()).toEqual(['none', 'none']);
      });

      it('takes no click of its own, so the tile beneath is still the target', () => {
        for (const ring of ringsOf('VI')) {
          expect(window.getComputedStyle(ring).pointerEvents).toBe('none');
        }
      });

      it('uses only the fills that clear 3:1 on the page, and not the unvisited one', () => {
        // The ring takes its land's fill: the bonus colour once marked, the
        // highlight under the pointer. The unvisited fill fails the pair,
        // which is why an unmarked place has no ring.
        const { bonus, highlight, unvisited } = palettes()[QUEST_STATE.STATES];
        for (const stroke of [bonus, highlight]) {
          expect(contrast(stroke, PAGE_BACKGROUND), `${stroke} ring`).toBeGreaterThanOrEqual(
            NON_TEXT_CONTRAST
          );
        }
        expect(contrast(unvisited, PAGE_BACKGROUND)).toBeLessThan(NON_TEXT_CONTRAST);
      });
    });

    it('never writes the bonus to the states, or the states to the bonus', async () => {
      await click(water('MP'));
      expect(stored()).toEqual(expect.objectContaining({ states: [], bonus: ['MP'] }));
      expect(text(statesPanel(), '.quest-tally')).toBe('0 of 50 states visited');

      await clickShape('CA');
      expect(stored()).toEqual(expect.objectContaining({ states: ['CA'], bonus: ['MP'] }));
      expect(filled('MP')).toBe(true);
      expect(shape('CA')?.classList.contains('quest-visited')).toBe(true);
      expect(map()?.querySelectorAll('path.quest-visited').length).toBe(1);
    });

    it('keeps its marks through a reload, under the one key', async () => {
      await click(water('DC'));
      await click(land('VI'));
      await reload();

      expect([filled('DC'), filled('VI'), filled('PR')]).toEqual([true, true, false]);
      expect(box('District of Columbia')?.checked).toBe(true);
      expect(storage.length).toBe(1);
    });

    it('empties with "Clear my states", along with the checkboxes', async () => {
      await click(water('GU'));
      await clickShape('NV');
      const clear = async (label: string): Promise<void> => {
        Array.from(statesPanel().querySelectorAll<HTMLButtonElement>('button.quest-clear'))
          .find((candidate) => candidate.textContent?.trim() === label)
          ?.click();
        await fixture.whenStable();
      };
      await clear('Clear my states');
      await clear('Clear them');

      expect(map()?.querySelectorAll('.quest-visited').length).toBe(0);
      expect(box('Guam')?.checked).toBe(false);
      expect(bonus()).toContain('0 of 6');
    });

    it('works for the visit, and says so, when storage throws', async () => {
      const refusing = memoryStorage();
      vi.spyOn(refusing, 'getItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      vi.spyOn(refusing, 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });
      await openWith(refusing);

      await click(water('AS'));
      expect([filled('AS'), box('American Samoa')?.checked]).toEqual([true, true]);
      expect(bonus()).toContain('1 of 6');
      expect(text(statesPanel(), '.quest-storage')).toContain('last only until you leave');
    });
  });

  it('ignores a click on the ground between places, and on land that is none of them', async () => {
    statesPanel()
      .querySelector('svg.quest-outline')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const unkeyed = host.querySelector('#quest-panel-countries path.quest-outline-unkeyed');
    expect(unkeyed).not.toBeNull();
    unkeyed?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();

    expect(unkeyed?.classList.contains('quest-visited')).toBe(false);

    expect(host.querySelectorAll('path.quest-visited').length).toBe(0);
    expect(storage.getItem(GUEST_PROGRESS_KEY)).toBeNull();
  });

  it('restores the selection on reload, and keeps the owner out of it', async () => {
    await clickShape('RI');
    await clickBox('Delaware');
    await clickBox('District of Columbia');
    await reload();

    expect(box('Rhode Island')?.checked).toBe(true);
    expect(box('Delaware')?.checked).toBe(true);
    expect(box('District of Columbia')?.checked).toBe(true);
    expect(shape('DE')?.classList.contains('quest-visited')).toBe(true);
    expect(text(statesPanel(), '.quest-tally')).toBe('2 of 50 states visited');
    expect(text(statesPanel(), '.quest-owner')).toContain(
      `${OWNER_PROGRESS.states.length} of 50 states`
    );
  });

  it('drops ids from storage that are not places, rather than counting them', async () => {
    await openWith(
      memoryStorage({
        [GUEST_PROGRESS_KEY]: JSON.stringify({ states: ['TX', 'ZZ', 'DC', 7], bonus: ['XX'] }),
      })
    );

    expect(text(statesPanel(), '.quest-tally')).toBe('1 of 50 states visited');
    expect(text(statesPanel(), '.quest-bonus')).toContain('0 of 6');
    expect(statesPanel().querySelector('.quest-storage')).toBeNull();
  });

  it('says the quest is complete at 50, not at 49, and the bonus changes nothing', async () => {
    const seeded = async (states: readonly string[], bonus: readonly string[]): Promise<void> =>
      openWith(memoryStorage({ [GUEST_PROGRESS_KEY]: JSON.stringify({ states, bonus }) }));
    const all = STATES.map((place) => place.id);

    await seeded(all.slice(1), []);
    expect(text(statesPanel(), '.quest-tally')).toBe('49 of 50 states visited');

    await seeded(all, []);
    expect(text(statesPanel(), '.quest-tally')).toBe('All 50 states visited');
    expect(text(statesPanel(), '.quest-bonus')).toContain('Bonus, not required: 0 of 6');

    await seeded(
      all,
      BONUS.map((place) => place.id)
    );
    expect(text(statesPanel(), '.quest-tally')).toBe('All 50 states visited');
    expect(text(statesPanel(), '.quest-bonus')).toContain('Bonus, not required: 6 of 6');
  });

  it('works for the visit and says so when storage throws', async () => {
    const refusing = memoryStorage();
    vi.spyOn(refusing, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(refusing, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await openWith(refusing);

    expect(text(statesPanel(), '.quest-storage')).toContain('last only until you leave');
    await clickShape('OR');
    expect(text(statesPanel(), '.quest-tally')).toBe('1 of 50 states visited');
  });

  it('says marks will not be kept when a write is the first thing refused', async () => {
    const full = memoryStorage();
    vi.spyOn(full, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await openWith(full);
    expect(statesPanel().querySelector('.quest-storage')).toBeNull();

    await clickBox('Ohio');
    expect(box('Ohio')?.checked).toBe(true);
    expect(statesPanel().querySelector('.quest-storage')?.getAttribute('role')).toBe('status');
  });

  it('works for the visit when there is no storage to reach at all', async () => {
    await openWith(null);
    await clickBox('Maine');

    expect(box('Maine')?.checked).toBe(true);
    expect(statesPanel().querySelector('.quest-storage')).not.toBeNull();
  });

  // The introduction sits above the notice and is not withdrawn when the
  // notice appears, so it may say where marks go but never that they stay.
  it('introduces the page with a line that stays true when storage refuses', async () => {
    await openWith(null);
    await clickBox('Maine');

    const intro = text(host, '.wanderquest-header h1 + .wanderquest-intro');
    expect(intro).toContain('nothing you mark leaves this browser');
    expect(intro).not.toMatch(/\b(keep|kept|stays?|saved?|remember)/i);
    expect(text(statesPanel(), '.quest-storage')).toContain('last only until you leave');
  });

  it('asks before clearing, and keeps everything when the answer is no', async () => {
    const button = (label: string): HTMLButtonElement | undefined =>
      Array.from(statesPanel().querySelectorAll<HTMLButtonElement>('button.quest-clear')).find(
        (candidate) => candidate.textContent?.trim() === label
      );
    const press = async (label: string): Promise<void> => {
      button(label)?.click();
      await fixture.whenStable();
    };

    // Nothing to clear: the control stays focusable and does nothing.
    expect(button('Clear my states')?.getAttribute('aria-disabled')).toBe('true');
    await press('Clear my states');
    expect(statesPanel().querySelector('.quest-clear-question')).toBeNull();

    await clickShape('NV');
    await clickBox('Guam');
    await press('Clear my states');

    expect(text(statesPanel(), '.quest-clear-question')).toBe(
      'Clear the 2 places you have marked? This cannot be undone.'
    );
    expect(document.activeElement).toBe(button('Keep them'));

    await press('Keep them');
    expect(text(statesPanel(), '.quest-tally')).toBe('1 of 50 states visited');
    expect(document.activeElement).toBe(button('Clear my states'));

    await press('Clear my states');
    // Only the answer that loses data is drawn in the state colour. jsdom
    // resolves the rule but not the token, so the rule is held here and the
    // colour's contrast below.
    const colour = (label: string): string => {
      const found = button(label);
      return found ? window.getComputedStyle(found).color : '';
    };
    expect(colour('Clear them')).toBe('var(--color-negative)');
    expect(colour('Keep them')).not.toBe('var(--color-negative)');
    expect(contrast(NEGATIVE, PAGE_BACKGROUND)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(document.activeElement).toBe(button('Keep them'));
    await press('Clear them');

    expect(text(statesPanel(), '.quest-tally')).toBe('0 of 50 states visited');
    expect(text(statesPanel(), '.quest-bonus')).toContain('0 of 6');
    expect(button('Clear my states')?.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(button('Clear my states'));
    await reload();
    expect(box('Nevada')?.checked).toBe(false);
  });

  it('asks about one place in the singular', async () => {
    await clickBox('Utah');
    statesPanel().querySelector<HTMLButtonElement>('button.quest-clear')?.click();
    await fixture.whenStable();

    expect(text(statesPanel(), '.quest-clear-question')).toBe(
      'Clear the 1 place you have marked? This cannot be undone.'
    );
  });

  describe('the continents', () => {
    const continents = (): HTMLElement =>
      host.querySelector<HTMLElement>(`#quest-panel-${QUEST_STATE.CONTINENTS}`) ?? host;
    const tally = (): string => text(continents(), '.quest-tally');
    const filled = (id: string): boolean =>
      continents()
        .querySelector(`svg.quest-outline path[data-id="${id}"]`)
        ?.classList.contains('quest-visited') ?? false;
    const checkbox = (name: string): HTMLInputElement | null => {
      const label = Array.from(continents().querySelectorAll('label')).find(
        (candidate) => candidate.textContent?.trim() === name
      );
      return label ? continents().querySelector<HTMLInputElement>(`#${label.htmlFor}`) : null;
    };
    const clickContinent = async (id: string): Promise<void> => {
      continents()
        .querySelector(`svg.quest-outline path[data-id="${id}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await fixture.whenStable();
    };
    const tick = async (name: string): Promise<void> => {
      checkbox(name)?.click();
      await fixture.whenStable();
    };

    beforeEach(async () => {
      tabs()[1].click();
      await fixture.whenStable();
    });

    it('offers one checkbox per continent, and no bonus', () => {
      expect(
        Array.from(continents().querySelectorAll('label')).map((label) => label.textContent?.trim())
      ).toEqual(CONTINENTS.map((place) => place.name));
      expect(continents().querySelectorAll('input[type="checkbox"]').length).toBe(7);
      expect(continents().querySelector('.quest-bonus')).toBeNull();
    });

    it('toggles one continent from the map and its checkbox, and the tally follows both', async () => {
      await clickContinent('AS');
      expect([filled('AS'), checkbox('Asia')?.checked, tally()]).toEqual([
        true,
        true,
        '1 of 7 continents visited',
      ]);

      await tick('Asia');
      await tick('Antarctica');
      expect([filled('AS'), filled('AN'), tally()]).toEqual([
        false,
        true,
        '1 of 7 continents visited',
      ]);
      expect(text(continents(), '.quest-owner')).toBe(
        `Jacob's own record: ${OWNER_PROGRESS.continents.length} of 7 continents`
      );
    });

    it('restores the continents on reload, apart from the states', async () => {
      await clickContinent('OC');
      await clickShape('TX');
      await reload();

      expect(checkbox('Oceania')?.checked).toBe(true);
      expect(filled('OC')).toBe(true);
      expect(tally()).toBe('1 of 7 continents visited');
      expect(text(statesPanel(), '.quest-tally')).toBe('1 of 50 states visited');
    });

    it('clears only the continents, and asks first', async () => {
      await clickShape('TX');
      await clickContinent('EU');
      await clickContinent('AF');
      const button = (label: string): HTMLButtonElement | undefined =>
        Array.from(continents().querySelectorAll<HTMLButtonElement>('button.quest-clear')).find(
          (candidate) => candidate.textContent?.trim() === label
        );

      button('Clear my continents')?.click();
      await fixture.whenStable();
      expect(text(continents(), '.quest-clear-question')).toBe(
        'Clear the 2 places you have marked? This cannot be undone.'
      );
      button('Clear them')?.click();
      await fixture.whenStable();

      expect(tally()).toBe('0 of 7 continents visited');
      expect(text(statesPanel(), '.quest-tally')).toBe('1 of 50 states visited');
    });

    it('says the marks will not be kept when there is no storage', async () => {
      await openWith(null);
      tabs()[1].click();
      await fixture.whenStable();
      await tick('Europe');

      expect(checkbox('Europe')?.checked).toBe(true);
      expect(text(continents(), '.quest-storage')).toContain('last only until you leave');
    });

    // `places.data.ts`: a continent is marked on its own and never derived
    // from countries. The outline dissolves countries into continents, but
    // that is a drawing choice, not a rule, so neither list moves the other.
    it('never marks a continent for a country, or a country for a continent', async () => {
      const store = fixture.debugElement.injector.get(GuestProgressStore);

      store.toggle('countries', 'FR');
      await fixture.whenStable();
      expect(tally()).toBe('0 of 7 continents visited');
      expect(filled('EU')).toBe(false);

      await clickContinent('SA');
      expect(store.visited('countries')).toEqual(new Set(['FR']));

      store.toggle('countries', 'FR');
      await fixture.whenStable();
      expect(store.visited('continents')).toEqual(new Set(['SA']));
      expect(text(host.querySelector('#quest-panel-countries') ?? host, '.quest-tally')).toBe(
        '0 of 195 countries visited'
      );
    });
  });

  describe('the countries', () => {
    const countries = (): HTMLElement =>
      host.querySelector<HTMLElement>(`#quest-panel-${QUEST_STATE.COUNTRIES}`) ?? host;
    const tally = (): string => text(countries(), '.quest-tally');
    const path = (id: string): Element | null =>
      countries().querySelector(`svg.quest-outline path[data-id="${id}"]`);
    /** The short list's rows: what sits above the disclosure, not inside it. */
    const listed = (): string[] =>
      Array.from(
        countries().querySelectorAll('fieldset.quest-checklist > ul > .quest-checklist-item label')
      ).map((label) => label.textContent?.trim() ?? '');
    const all = (): HTMLDetailsElement | null =>
      countries().querySelector<HTMLDetailsElement>('details.quest-all');
    const checkbox = (name: string): HTMLInputElement | null => {
      const label = Array.from(countries().querySelectorAll('label')).find(
        (candidate) => candidate.textContent?.trim() === name
      );
      return label ? countries().querySelector<HTMLInputElement>(`#${label.htmlFor}`) : null;
    };
    const tick = async (name: string): Promise<void> => {
      checkbox(name)?.click();
      await fixture.whenStable();
    };
    const filter = (): HTMLInputElement | null =>
      countries().querySelector<HTMLInputElement>('input[type="search"]');
    const type = async (query: string): Promise<void> => {
      const input = filter();
      if (input) {
        input.value = query;
        input.dispatchEvent(new Event('input'));
      }
      await fixture.whenStable();
    };
    const count = (): string => text(countries(), '.quest-filter-count');

    beforeEach(async () => {
      tabs()[2].click();
      await fixture.whenStable();
    });

    it('opens on a labelled search and the whole list closed behind a disclosure', () => {
      const id = filter()?.id ?? '';
      expect(countries().querySelector(`label[for="${id}"]`)?.textContent?.trim()).toBe(
        'Find a country'
      );
      expect(countries().querySelector('.quest-filter-count')?.getAttribute('role')).toBe('status');
      expect([listed(), count()]).toEqual([[], '']);

      const details = all();
      expect(details?.open).toBe(false);
      expect(text(details ?? host, 'summary')).toBe('All 195 countries');
      expect(
        Array.from(details?.querySelectorAll('.quest-checklist-item label') ?? []).map((label) =>
          label.textContent?.trim()
        )
      ).toEqual(COUNTRIES.map((place) => place.name));
    });

    // The search is the first control: nothing focusable comes before it in
    // the checklist, and the disclosure's summary comes after it.
    it('puts the search before every other control in the list', () => {
      const controls = Array.from(
        countries().querySelectorAll('app-quest-checklist input, app-quest-checklist summary')
      );
      expect(controls[0]).toBe(filter());
      expect(controls[1]?.tagName).toBe('SUMMARY');
    });

    it('gives every checkbox its own id, though a place can have two', async () => {
      await tick('Japan');
      const ids = Array.from(countries().querySelectorAll('input[type="checkbox"]')).map(
        (box) => box.id
      );
      expect(ids.length).toBe(196);
      expect(new Set(ids).size).toBe(196);
    });

    it('narrows by name as the guest types, ignoring case and accents', async () => {
      await type('GUINEA');
      expect(listed()).toEqual(
        COUNTRIES.filter((place) => place.name.toLowerCase().includes('guinea')).map(
          (place) => place.name
        )
      );
      expect(count()).toBe(`${listed().length} countries match “GUINEA”`);

      await type('turkiye');
      expect(listed()).toEqual(['Türkiye']);
      expect(count()).toBe('1 country matches “turkiye”');
    });

    it('says when nothing matches, and empties the short list when cleared', async () => {
      await type('Atlantis');
      expect(listed()).toEqual([]);
      expect(count()).toBe('No country matches “Atlantis”');

      await type('');
      expect([listed(), count()]).toEqual([[], '']);
      expect(all()?.querySelectorAll('.quest-checklist-item').length).toBe(195);
    });

    it('lists the visited beside whatever the search matches', async () => {
      await type('japan');
      await tick('Japan');
      await type('kenya');
      expect(listed()).toEqual(['Japan', 'Kenya']);
      await tick('Kenya');
      expect(tally()).toBe('2 of 195 countries visited');

      await type('');
      expect(listed()).toEqual(['Japan', 'Kenya']);
      expect(checkbox('Japan')?.checked).toBe(true);
      expect(checkbox('Kenya')?.checked).toBe(true);
      expect(path('JP')?.classList.contains('quest-visited')).toBe(true);
    });

    it('lists a place ticked in the full list, or on the map, above it', async () => {
      all()?.querySelector<HTMLInputElement>('#quest-place-countries-all-PE')?.click();
      await fixture.whenStable();
      path('BR')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await fixture.whenStable();
      expect(listed()).toEqual(['Brazil', 'Peru']);
    });

    // Removing the row would take the focused checkbox with it.
    it('keeps a row unticked from the short list until the search changes', async () => {
      await tick('Chile');
      await type('');
      await tick('Chile');
      expect([listed(), checkbox('Chile')?.checked, tally()]).toEqual([
        ['Chile'],
        false,
        '0 of 195 countries visited',
      ]);

      await type('c');
      await type('');
      expect(listed()).toEqual([]);
    });

    it('toggles a country from the map and its checkbox, and the tally follows both', async () => {
      path('BR')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await fixture.whenStable();
      expect([checkbox('Brazil')?.checked, tally()]).toEqual([true, '1 of 195 countries visited']);

      await tick('Brazil');
      expect([path('BR')?.classList.contains('quest-visited'), tally()]).toEqual([
        false,
        '0 of 195 countries visited',
      ]);
      expect(text(countries(), '.quest-owner')).toBe(
        `Jacob's own record: ${OWNER_PROGRESS.countries.length} of 195 countries`
      );
    });

    it('fills a country drawn as a dot when it is ticked, and toggles it from the dot', async () => {
      await tick('Malta');
      expect([path('MT')?.classList.contains('quest-visited'), tally()]).toEqual([
        true,
        '1 of 195 countries visited',
      ]);

      path('MT')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await fixture.whenStable();
      expect([checkbox('Malta')?.checked, tally()]).toEqual([false, '0 of 195 countries visited']);
    });

    it('gives every country a place on the map to fill', () => {
      const drawn = new Set(
        Array.from(countries().querySelectorAll('svg.quest-outline path[data-id]')).map((shape) =>
          shape.getAttribute('data-id')
        )
      );
      expect(COUNTRIES.filter((place) => !drawn.has(place.id))).toEqual([]);
    });

    describe('and Europe and the Caribbean enlarged', () => {
      const insets = (): SVGSVGElement[] =>
        Array.from(countries().querySelectorAll<SVGSVGElement>('svg.quest-outline-inset'));
      const inset = (): SVGSVGElement | null => insets()[0] ?? null;
      const world = (): SVGSVGElement | null =>
        countries().querySelector<SVGSVGElement>('svg.quest-outline:not(.quest-outline-inset)');
      const inEurope = (id: string): Element | null =>
        inset()?.querySelector(`path[data-id="${id}"]`) ?? null;
      const row = (name: string): Element | null => checkbox(name)?.closest('li') ?? null;

      it('draws them on the countries panel only, under the world, in order, each one named image', () => {
        const all = Array.from(host.querySelectorAll('svg.quest-outline-inset'));
        expect(all.map((svg) => svg.closest('section')?.id)).toEqual([
          'quest-panel-countries',
          'quest-panel-countries',
        ]);

        const outlines = [EUROPE_OUTLINE, CARIBBEAN_OUTLINE];
        let previous = world();
        insets().forEach((svg, i) => {
          const outline = outlines[i];
          expect(svg.getAttribute('role')).toBe('img');
          expect(svg.getAttribute('aria-label')).toBe(outline.label);
          expect(svg.querySelectorAll('[tabindex], a, [focusable="true"]').length).toBe(0);
          expect(
            Array.from(svg.querySelectorAll('path[data-id]')).map((path) =>
              path.getAttribute('data-id')
            )
          ).toEqual(outline.shapes.map((shape) => shape.id));
          expect(
            previous && previous.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING,
            outline.label
          ).toBeTruthy();
          previous = svg;
        });
      });

      it('toggles Trinidad and Tobago from the Caribbean, where no dot hides it', async () => {
        insets()[1]
          ?.querySelector('path[data-id="TT"]')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await fixture.whenStable();
        expect(checkbox('Trinidad and Tobago')?.checked).toBe(true);
        expect(path('TT')?.classList.contains('quest-visited')).toBe(true);
      });

      it('toggles a place from a click on the inset, and fills it on both maps', async () => {
        inEurope('LU')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await fixture.whenStable();
        expect([checkbox('Luxembourg')?.checked, tally()]).toEqual([
          true,
          '1 of 195 countries visited',
        ]);
        expect(inEurope('LU')?.classList.contains('quest-visited')).toBe(true);
        expect(path('LU')?.classList.contains('quest-visited')).toBe(true);

        path('LU')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await fixture.whenStable();
        expect(inEurope('LU')?.classList.contains('quest-visited')).toBe(false);
      });

      it('lights a place on both maps from its checklist row', async () => {
        row('Belgium')?.dispatchEvent(new Event('mouseenter'));
        await fixture.whenStable();
        const lit = (svg: SVGSVGElement | null): string[] =>
          Array.from(svg?.querySelectorAll('path.quest-highlighted') ?? []).map(
            (shape) => shape.getAttribute('data-id') ?? ''
          );
        expect([lit(world()), lit(inset())]).toEqual([['BE'], ['BE']]);
      });

      it('marks the part each enlarges on the world map, and frames each the same', () => {
        const rects = (svg: SVGSVGElement | null): number[][] =>
          Array.from(svg?.querySelectorAll('rect.quest-outline-frame') ?? []).map((frame) =>
            ['x', 'y', 'width', 'height'].map((key) => Number(frame.getAttribute(key)))
          );
        const outlines = [EUROPE_OUTLINE, CARIBBEAN_OUTLINE];
        const enlarged = outlines.map(({ enlarges }) => {
          const { x, y, width, height } = enlarges ?? { x: 0, y: 0, width: 0, height: 0 };
          return [x, y, width, height];
        });
        expect(rects(world())).toEqual(enlarged);
        insets().forEach((svg, i) => {
          const own = rects(svg);
          expect(own.length).toBe(1);
          const [, , frameWidth, frameHeight] = own[0];
          const [, , width, height] = enlarged[i];
          expect(frameWidth / width, outlines[i].label).toBe(frameHeight / height);
        });
        // The frame is interface: it answers no click and is no place.
        for (const frame of countries().querySelectorAll('rect.quest-outline-frame')) {
          expect(frame.hasAttribute('data-id')).toBe(false);
        }
        expect(host.querySelectorAll('rect.quest-outline-frame').length).toBe(4);
      });
    });

    it('never colours the unkeyed land, whatever is marked', async () => {
      for (const place of COUNTRIES.slice(0, 20)) {
        await tick(place.name);
      }
      const unkeyed = countries().querySelector('path.quest-outline-unkeyed');
      expect(unkeyed?.hasAttribute('data-id')).toBe(false);
      expect(unkeyed?.classList.contains('quest-visited')).toBe(false);
    });

    it('restores the countries on reload and clears only them', async () => {
      await tick('Chile');
      await clickShape('TX');
      await reload();
      tabs()[2].click();
      await fixture.whenStable();
      expect(checkbox('Chile')?.checked).toBe(true);

      const clear = (label: string): void =>
        Array.from(countries().querySelectorAll<HTMLButtonElement>('button.quest-clear'))
          .find((candidate) => candidate.textContent?.trim() === label)
          ?.click();
      clear('Clear my countries');
      await fixture.whenStable();
      clear('Clear them');
      await fixture.whenStable();

      expect(tally()).toBe('0 of 195 countries visited');
      expect(text(statesPanel(), '.quest-tally')).toBe('1 of 50 states visited');
    });

    it('says the marks will not be kept when there is no storage', async () => {
      await openWith(null);
      tabs()[2].click();
      await fixture.whenStable();
      await tick('Peru');

      expect(checkbox('Peru')?.checked).toBe(true);
      expect(text(countries(), '.quest-storage')).toContain('last only until you leave');
    });
  });

  it('writes one versioned key and nothing else', async () => {
    await clickShape('WA');

    expect(storage.length).toBe(1);
    expect(JSON.parse(storage.getItem(GUEST_PROGRESS_KEY) ?? '{}')).toEqual({
      states: ['WA'],
      bonus: [],
      continents: [],
      countries: [],
    });
  });
});

/** In-memory `Storage`, so each test starts from an empty browser. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(seed));
  return {
    get length(): number {
      return items.size;
    },
    clear: (): void => items.clear(),
    getItem: (key: string): string | null => items.get(key) ?? null,
    key: (index: number): string | null => [...items.keys()][index] ?? null,
    removeItem: (key: string): void => {
      items.delete(key);
    },
    setItem: (key: string, value: string): void => {
      items.set(key, value);
    },
  };
}
