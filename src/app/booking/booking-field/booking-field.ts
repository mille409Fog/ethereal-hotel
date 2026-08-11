import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Label, hint and error for one form control, with the control itself
 * projected in.
 *
 * This exists because the wiring around an input is where form accessibility
 * quietly breaks: the `for`/`id` pair, the hint and error ids, and the
 * `aria-describedby` that has to reference exactly the ones currently
 * rendered. Written out six times it is six chances to typo an id and ship a
 * message that is displayed and never announced. Written once it is one.
 *
 * The `aria-describedby` and `aria-invalid` bindings stay on the control in
 * the parent template, because a component cannot set attributes on content
 * projected into it. What lives here is the half that can be centralised: the
 * ids those attributes point at, derived from the same `fieldId`.
 */
@Component({
  selector: 'app-booking-field',
  imports: [],
  templateUrl: './booking-field.html',
  styleUrl: './booking-field.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingField {
  /** Id of the projected control. Hint and error ids are derived from it. */
  public readonly fieldId = input.required<string>();
  public readonly label = input.required<string>();

  /** Static guidance, always shown. Empty means the field has none. */
  public readonly hint = input<string>('');

  /** The current objection to this field, or null when there is none. */
  public readonly error = input<string | null>(null);

  /** Narrow layout, for the two small numeric fields. */
  public readonly narrow = input(false);
}
