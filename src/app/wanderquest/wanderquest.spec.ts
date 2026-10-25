import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LinearRgb, linearToOklab } from '../aesthetic/colour';
import { Deficiency, simulateLinear } from '../aesthetic/cvd';
import { contrastRatio } from '../aesthetic/winnow';
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
    const totals = Object.fromEntries(QUESTS.map((quest) => [quest.id, quest.tally.total]));
    expect(totals).toEqual({
      [QUEST_STATE.STATES]: STATES.length,
      [QUEST_STATE.CONTINENTS]: CONTINENTS.length,
      [QUEST_STATE.COUNTRIES]: COUNTRIES.length,
    });
    expect(Object.values(totals)).toEqual([50, 7, 195]);
  });

  it('gives the bonus category to the states quest only', () => {
    expect(QUESTS.map((quest) => quest.bonus?.total ?? null)).toEqual([BONUS.length, null, null]);
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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Wanderquest],
    }).compileComponents();

    fixture = TestBed.createComponent(Wanderquest);
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  });

  afterEach(() => {
    host.remove();
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

  it("shows each quest's count and the owner's progress against it", async () => {
    const tallies: string[] = [];
    for (const tab of tabs()) {
      tab.click();
      await fixture.whenStable();
      tallies.push(visiblePanels()[0].querySelector('.quest-tally')?.textContent?.trim() ?? '');
    }

    expect(tallies).toEqual([
      `${OWNER_PROGRESS.states.length} of 50 states visited`,
      `${OWNER_PROGRESS.continents.length} of 7 continents visited`,
      `${OWNER_PROGRESS.countries.length} of 195 countries visited`,
    ]);
  });

  it('shows the bonus category on the states panel only', async () => {
    expect(visiblePanels()[0].querySelector('.quest-bonus')?.textContent).toContain(
      `${OWNER_PROGRESS.bonus.length} of 6`
    );

    tabs()[1].click();
    await fixture.whenStable();
    expect(visiblePanels()[0].querySelector('.quest-bonus')).toBeNull();
  });

  it('gives each panel its own palette in six-digit hex, and the bonus to states only', () => {
    const hex = /^#[0-9a-f]{6}$/;
    for (const quest of QUESTS) {
      const palette = palettes()[quest.id];
      for (const role of ROLES) {
        if (role === 'bonus' && !quest.bonus) {
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
      const marks = quest.bonus ? [palette.visited, palette.bonus] : [palette.visited];
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
});
