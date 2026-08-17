import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { BENCH_COPY } from './desk';
import type { FilmEffect } from './projection';

/** One switch, as the bench renders it. */
export interface ISwitch {
  /** Which of the six. Also the key the label and the description are built from. */
  readonly effect: FilmEffect;

  /** The mechanism's name. */
  readonly label: string;

  /** One line about what that mechanism is for. */
  readonly note: string;

  /** Whether it is down. */
  readonly on: boolean;
}

/**
 * The projectionist's bench — Floor −4's controls.
 *
 * AUBADE asks for the film stack to be "exposed as a projectionist's bench you can
 * operate", and this is the operable half of that. The other half is a real bench in
 * the room, in `rooms/hotel.frag.ts`, because a floor that offers a bench on its plate
 * and has none in it has told the visitor the controls belong to the software.
 *
 * ## Why this is a component and not six more lines of `aubade.html`
 *
 * Two reasons, and the second is the one that matters.
 *
 * The lint config caps a template's cyclomatic complexity, and the lobby's template
 * was already close to it before this floor existed — the Cellar's instruction is
 * what spent most of the budget, and `desk.ts` and `remarks` both exist because of
 * that same cap. A control surface with a conditional, a loop and three bindings per
 * item does not fit under it.
 *
 * But the reason it *should* be separate is that it is the only thing on this route
 * that is not the hotel talking. Every other control on that plate is furniture: a
 * card on a desk, a door somebody may let themselves through, a lift. This is a
 * machine with its lid off and its levers handed over, and keeping it in its own file
 * with its own stylesheet is what stops it from being written in the desk clerk's
 * voice by accident.
 *
 * It owns no state. The bench lives on `Aubade`, because it has to survive a ride —
 * a visitor who switches the grain off, goes up to look at the library and comes back
 * finds the bench where they left it — and a control that held its own state would
 * reset every time the lift doors opened.
 */
@Component({
  selector: 'app-bench',
  templateUrl: './bench.html',
  // `tokens.css` first, exactly as `/aubade` and `/aubade/reader` load it: it
  // declares the palette all three are drawn in, so the bench cannot drift into a
  // second brass.
  styleUrls: ['./tokens.css', './bench.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Bench {
  /** The six, in the order `FILM_STACK` names them. */
  public readonly switches = input.required<readonly ISwitch[]>();

  /**
   * What the machine is doing — the one thing on this floor a visitor cannot touch.
   *
   * A string rather than a rate, because the two situations do not read the same way
   * round: a running machine is a number and a stopped one is not.
   *
   * `null` on every floor but −4, and on any floor at all when there is no render to
   * operate. It doubles as the whole component's condition — see `bench.html`, where
   * that is done rather than in the parent for a reason that is about a lint budget
   * and is nonetheless the right shape.
   */
  public readonly projector = input.required<string | null>();

  /** Somebody threw a switch. */
  public readonly thrown = output<FilmEffect>();

  /** The headings, and the line that says what is not on the bench. */
  public readonly copy = BENCH_COPY;
}
