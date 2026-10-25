import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BONUS, CONTINENTS, COUNTRIES, STATES } from './places.data';
import { OWNER_PROGRESS } from './progress.data';
import { QUEST_STATE, QUESTS, stepQuest } from './quest-state';
import { Wanderquest } from './wanderquest';

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
    expect(selected()).toEqual(['states']);
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

    expect(selected()).toEqual(['countries']);
    expect(visiblePanels().map((panel) => panel.id)).toEqual(['quest-panel-countries']);
  });

  it('moves selection and focus with the arrow keys, Home and End', async () => {
    tabs()[0].focus();

    const event = await press('ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(selected()).toEqual(['continents']);
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);

    await press('End');
    expect(selected()).toEqual(['countries']);
    expect(document.activeElement).toBe(tabs()[2]);

    await press('ArrowRight');
    expect(selected()).toEqual(['states']);
    expect(document.activeElement).toBe(tabs()[0]);

    await press('ArrowLeft');
    expect(selected()).toEqual(['countries']);

    await press('Home');
    expect(selected()).toEqual(['states']);
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('leaves other keys to the browser', async () => {
    tabs()[0].focus();
    const event = await press('ArrowDown');
    expect(event.defaultPrevented).toBe(false);
    expect(selected()).toEqual(['states']);
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
});
