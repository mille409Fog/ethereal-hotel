import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LinearRgb, linearToOklab } from '../aesthetic/colour';
import { Deficiency, simulateLinear } from '../aesthetic/cvd';
import { contrastRatio } from '../aesthetic/winnow';
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

/** WCAG 1.4.11: a mark a reader has to tell apart from what surrounds it. */
const NON_TEXT_CONTRAST = 3;

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

/** OKLab distance between two colours as someone with `deficiency` sees them. */
function apart(a: string, b: string, deficiency: Deficiency): number {
  const [p, q] = [a, b].map((hex) => linearToOklab(simulateLinear(linear(hex), deficiency)));
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
    expect(host.querySelectorAll('svg.quest-outline').length).toBe(QUESTS.length);

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
    const unkeyed = host.querySelectorAll('path.quest-outline-unkeyed');
    expect(unkeyed.length, 'only the countries map has land outside its count').toBe(1);
    expect(unkeyed[0].closest('section')?.id).toBe('quest-panel-countries');
    expect(unkeyed[0].hasAttribute('data-id')).toBe(false);

    tabs()[2].click();
    await fixture.whenStable();
    const key = Array.from(visiblePanels()[0].querySelectorAll('.quest-key-item')).map(
      (item) => item.textContent?.trim() ?? ''
    );
    expect(key).toContain('Not counted');
  });

  it('says how many places are too small to draw, and only where there are some', () => {
    const notes = Array.from(host.querySelectorAll<HTMLElement>('.quest-undrawn'));
    expect(notes.map((note) => note.closest('section')?.id)).toEqual(['quest-panel-countries']);

    const drawn = QUESTS.find((quest) => quest.id === QUEST_STATE.COUNTRIES)?.outline?.shapes
      .length;
    expect(notes[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(
      `${COUNTRIES.length - (drawn ?? 0)} of the ${COUNTRIES.length} countries are too small to ` +
        'draw at this scale, and count all the same.'
    );
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
    expect(statesPanel().querySelectorAll('path.quest-visited').length).toBe(0);
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
    const listed = (): string[] =>
      Array.from(countries().querySelectorAll('.quest-checklist-item label')).map(
        (label) => label.textContent?.trim() ?? ''
      );
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

    it('lists all 195, labelled, with a filter above them', () => {
      expect(listed()).toEqual(COUNTRIES.map((place) => place.name));
      const id = filter()?.id ?? '';
      expect(countries().querySelector(`label[for="${id}"]`)?.textContent?.trim()).toBe(
        'Find a country'
      );
      expect(countries().querySelector('.quest-filter-count')?.getAttribute('role')).toBe('status');
      expect(count()).toBe('All 195 countries');
    });

    it('narrows by name as the guest types, ignoring case and accents', async () => {
      await type('GUINEA');
      expect(listed()).toEqual(
        COUNTRIES.filter((place) => place.name.toLowerCase().includes('guinea')).map(
          (place) => place.name
        )
      );
      expect(count()).toBe(`${listed().length} of 195 countries`);

      await type('turkiye');
      expect(listed()).toEqual(['Türkiye']);
      expect(count()).toBe('1 of 195 countries');
    });

    it('says when nothing matches, and restores the whole list when cleared', async () => {
      await type('Atlantis');
      expect(listed()).toEqual([]);
      expect(count()).toBe('No country matches “Atlantis”');

      await type('');
      expect(listed().length).toBe(195);
      expect(count()).toBe('All 195 countries');
    });

    it('keeps a selection through filtering', async () => {
      await type('japan');
      await tick('Japan');
      await type('kenya');
      await tick('Kenya');
      expect(tally()).toBe('2 of 195 countries visited');

      await type('');
      expect(checkbox('Japan')?.checked).toBe(true);
      expect(checkbox('Kenya')?.checked).toBe(true);
      expect(path('JP')?.classList.contains('quest-visited')).toBe(true);
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

    it('lets a guest mark and count the countries too small to draw', async () => {
      const drawn = new Set(
        QUESTS.find((quest) => quest.id === QUEST_STATE.COUNTRIES)?.outline?.shapes.map(
          (shape) => shape.id
        )
      );
      const undrawn = COUNTRIES.filter((place) => !drawn.has(place.id));
      expect(undrawn.length).toBe(33);

      for (const place of undrawn) {
        await tick(place.name);
      }
      expect(tally()).toBe('33 of 195 countries visited');
      expect(countries().querySelectorAll('path.quest-visited').length).toBe(0);
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
