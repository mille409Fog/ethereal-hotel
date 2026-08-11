import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { BookingField } from './booking-field/booking-field';
import {
  BookingApiError,
  BookingApiService,
  IBooking,
  IBookingDraft,
  IGuest,
  IRoom,
} from '../services/booking-api.service';

/**
 * Whether the page is still loading, working against the live API, or has
 * found the API absent.
 *
 * There is no fourth state and, deliberately, no fixture. `/dashboard` falls
 * back to a committed snapshot when the backend is down, and that is honest
 * there because a recording of real numbers is still a fact about the hotel —
 * the badge just has to say which it is. It would not be honest here. This
 * page's whole claim is that submitting the form writes a row somebody else
 * can read back; a fixture would let a visitor fill the form, watch a booking
 * appear, reload, and find it gone. So when the API is unreachable the form is
 * disabled and the page says why. Read-only, stated, not simulated.
 */
export type BookingPageStatus = 'checking' | 'ready' | 'unreachable';

/** Fields the form owns, named after the wire so errors map straight back. */
const FIELDS = ['room_id', 'guest_id', 'check_in', 'check_out', 'adults', 'children'] as const;

type FieldName = (typeof FIELDS)[number];

/** ISO `YYYY-MM-DD` in the visitor's own timezone, which is what a date input wants. */
function isoDate(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * The backend's ordering: newest stay first, tie-broken on id descending.
 * Duplicated here so a locally inserted row lands where a re-read would put
 * it, rather than sitting at the top until the next load moves it.
 */
function byNewestStay(a: IBooking, b: IBooking): number {
  return b.check_in.localeCompare(a.check_in) || b.id - a.id;
}

@Component({
  selector: 'app-booking',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, BookingField],
  templateUrl: './booking.html',
  styleUrl: './booking.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Booking implements OnInit {
  private readonly api = inject(BookingApiService);
  private readonly fb = inject(FormBuilder);

  public readonly status = signal<BookingPageStatus>('checking');
  public readonly submitting = signal(false);

  public readonly rooms = signal<IRoom[]>([]);
  public readonly guests = signal<IGuest[]>([]);
  public readonly bookings = signal<IBooking[]>([]);
  public readonly total = signal(0);

  /**
   * Messages the server attributed to a field, keyed by field name.
   *
   * Kept apart from Angular's own validator errors rather than pushed into the
   * controls with `setErrors`. A server error is a fact about one submitted
   * payload, not a property of the current value, and mixing the two makes
   * `form.invalid` mean two different things — one of which no amount of
   * typing can clear.
   */
  private readonly serverErrors = signal<Readonly<Record<string, string>>>({});

  /** The outcome of the last submit, in a sentence. Null before the first. */
  public readonly outcome = signal<string | null>(null);
  public readonly outcomeIsError = signal(false);

  public readonly form: FormGroup = this.fb.group({
    room_id: [null as number | null, Validators.required],
    guest_id: [null as number | null, Validators.required],
    check_in: ['', Validators.required],
    // No cross-field date validator here on purpose: "check-out must be after
    // check-in" is a rule in `services/bookings.py`, and a copy in the browser
    // would be a second implementation to keep in step. Letting the server own
    // it is also what makes the rejection path demonstrable instead of
    // theoretical.
    check_out: ['', Validators.required],
    adults: [2, [Validators.required, Validators.min(1), Validators.max(12)]],
    children: [0, [Validators.required, Validators.min(0), Validators.max(12)]],
  });

  /** Room by id, for the list — which carries ids, not names. */
  private readonly roomsById = computed(() => new Map(this.rooms().map((room) => [room.id, room])));

  private readonly guestsById = computed(
    () => new Map(this.guests().map((guest) => [guest.id, guest]))
  );

  public readonly submitLabel = computed(() => (this.submitting() ? 'Saving…' : 'Create booking'));

  /**
   * How much of the collection this table is showing.
   *
   * The distinction is not pedantry. `listBookings` reads one page and the
   * seeded hotel has over a thousand bookings, so a bare "1,344 on file" over
   * twenty rows reads as a table that failed to load the rest. Say which is
   * which, and the twenty rows are a page rather than a bug.
   */
  public readonly listSummary = computed(() => {
    const shown = this.bookings().length;
    const total = this.total().toLocaleString('en-US');
    return shown < this.total() ? `showing ${shown} of ${total}` : `${total} on file`;
  });

  /**
   * What to say when the table has no rows — which means two different things.
   *
   * An empty hotel and an absent API look identical in a bare "No bookings"
   * message, and only one of them is a fact about the hotel.
   */
  public readonly emptyMessage = computed(() =>
    this.status() === 'unreachable'
      ? 'The API did not answer, so there is nothing to show. This page has no offline fixture ' +
        'on purpose: a list of bookings nobody made would be the one lie a booking demo cannot afford.'
      : 'No bookings yet.'
  );

  /**
   * The provenance line, in words, for the `role="status"` region.
   *
   * Same reasoning as the dashboard's badge: on screen a colour and a dot
   * carry the distinction, and neither survives being read aloud.
   */
  public readonly statusAnnouncement = computed(() => {
    switch (this.status()) {
      case 'ready':
        return 'Connected to the API. Bookings submitted here are written to a real database.';
      case 'unreachable':
        return 'The booking API is unreachable, so the form is disabled. Nothing shown here is simulated.';
      default:
        return 'Connecting to the booking API.';
    }
  });

  public async ngOnInit(): Promise<void> {
    // Server errors describe a payload that has since been edited, so each one
    // is dropped the moment its own field changes. Clearing the whole set on
    // any keystroke would wipe messages the user has not looked at yet.
    for (const field of FIELDS) {
      this.form.controls[field].valueChanges.subscribe(() => this.clearServerError(field));
    }

    await this.load();
  }

  /** Read the reference lists and the current bookings, or give up honestly. */
  private async load(): Promise<void> {
    try {
      const [rooms, guests, page] = await Promise.all([
        this.api.listRooms(),
        this.api.listGuests(),
        this.api.listBookings(),
      ]);

      this.rooms.set(rooms);
      this.guests.set(guests);
      this.bookings.set([...page.items].sort(byNewestStay));
      this.total.set(page.total);
      this.applyDefaults(rooms, guests);
      this.status.set('ready');
      this.form.enable({ emitEvent: false });
    } catch {
      // No health probe first, unlike the dashboard: these three reads *are*
      // the probe, and a separate `/api/health` round trip would only tell us
      // what their failure already has.
      this.status.set('unreachable');
      this.form.disable({ emitEvent: false });
    }
  }

  /** Preselect something bookable so the form opens ready to submit. */
  private applyDefaults(rooms: IRoom[], guests: IGuest[]): void {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const sellable = rooms.find((room) => room.status === 'operational') ?? rooms[0];

    this.form.patchValue(
      {
        room_id: sellable?.id ?? null,
        guest_id: guests[0]?.id ?? null,
        check_in: isoDate(today),
        check_out: isoDate(tomorrow),
      },
      { emitEvent: false }
    );
  }

  public async submit(): Promise<void> {
    if (this.status() !== 'ready' || this.submitting()) {
      return;
    }

    this.serverErrors.set({});
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.setOutcome(
        'Some details are missing or out of range. Check the highlighted fields.',
        true
      );
      return;
    }

    // Read before the form is disabled: a disabled control is absent from
    // `form.value`, which would post a payload with holes in it.
    const draft = this.toDraft(this.form.getRawValue());

    this.submitting.set(true);
    this.form.disable({ emitEvent: false });
    try {
      const created = await this.api.createBooking(draft);
      this.insert(created);
      this.setOutcome(
        `Booking #${created.id} created. It is in the database — reload the page and it is still here.`,
        false
      );
    } catch (error) {
      this.handleFailure(error);
    } finally {
      this.submitting.set(false);
      if (this.status() === 'ready') {
        this.form.enable({ emitEvent: false });
      }
    }
  }

  /**
   * Turn the form's raw value into the wire payload.
   *
   * The coercion is load-bearing, not defensive. A `<select>` hands its value
   * back as a string whatever was bound to the option, so `room_id` and
   * `guest_id` arrive as `"3"` and `"1"`. Pydantic's lax mode would accept
   * those and the demo would work — on an implementation detail of the
   * server's parsing, which is not something a client should be spending.
   */
  private toDraft(raw: Record<string, unknown>): IBookingDraft {
    return {
      guest_id: Number(raw['guest_id']),
      room_id: Number(raw['room_id']),
      check_in: String(raw['check_in']),
      check_out: String(raw['check_out']),
      adults: Number(raw['adults']),
      children: Number(raw['children']),
    };
  }

  /**
   * Show the created booking without re-reading the list.
   *
   * The 201 body *is* the stored record, so a follow-up `GET /api/bookings`
   * would be a round trip to be told what we were just told. The row is placed
   * in the server's sort order rather than prepended, so it does not move on
   * the next load.
   */
  private insert(created: IBooking): void {
    this.bookings.update((current) => [created, ...current].sort(byNewestStay));
    this.total.update((count) => count + 1);
  }

  private handleFailure(error: unknown): void {
    if (!(error instanceof BookingApiError)) {
      this.setOutcome('Something went wrong and the booking was not saved.', true);
      return;
    }

    if (error.isUnreachable) {
      // The API was there when the page loaded and is not there now. Say so,
      // and stop offering a form whose submissions go nowhere. The list stays
      // on screen: it is real data, just no longer current.
      this.status.set('unreachable');
      this.form.disable({ emitEvent: false });
      this.setOutcome('The booking API is unreachable. This booking was not saved.', true);
      return;
    }

    this.serverErrors.set(error.fieldErrors);
    const attributed = Object.keys(error.fieldErrors).length > 0;
    this.setOutcome(
      attributed
        ? `The server rejected this booking: ${error.message}`
        : `The server rejected this booking (HTTP ${error.status}): ${error.message}`,
      true
    );
  }

  private setOutcome(message: string, isError: boolean): void {
    this.outcome.set(message);
    this.outcomeIsError.set(isError);
  }

  private clearServerError(field: FieldName): void {
    if (!(field in this.serverErrors())) {
      return;
    }
    this.serverErrors.update((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Template helpers
  // -------------------------------------------------------------------------

  /**
   * The message to show under a field: the server's objection if there is one,
   * otherwise the client-side one, and only once the user has been near it.
   *
   * Server first because it is the more specific of the two, and because it is
   * the one the user has not already been shown.
   */
  public errorFor(field: FieldName): string | null {
    const fromServer = this.serverErrors()[field];
    if (fromServer) {
      return fromServer;
    }

    const control = this.form.controls[field];
    if (!control.touched || control.valid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'This is required.';
    }
    if (control.hasError('min') || control.hasError('max')) {
      return 'Enter a number between 0 and 12.';
    }
    return 'This value is not valid.';
  }

  /** `aria-invalid`, as a string or null so the attribute is simply absent. */
  public invalidAttr(field: FieldName): string | null {
    return this.errorFor(field) ? 'true' : null;
  }

  /**
   * The `aria-describedby` list for a field: its hint, plus its error when one
   * is showing. Built rather than hardcoded because an error element that is
   * referenced while absent, or present while unreferenced, is the specific
   * way form a11y usually breaks — the message renders and is never announced.
   */
  public describedBy(field: FieldName, hasHint: boolean): string | null {
    const ids = [hasHint ? `${field}-hint` : null, this.errorFor(field) ? `${field}-error` : null];
    const present = ids.filter((id): id is string => id !== null);
    return present.length > 0 ? present.join(' ') : null;
  }

  /** `103 · Deluxe · sleeps 4 · $300/night`, for the room select. */
  public roomLabel(room: IRoom): string {
    const type = room.room_type[0].toUpperCase() + room.room_type.slice(1);
    const rate = `$${room.base_rate.toFixed(0)}/night`;
    const suffix = room.status === 'maintenance' ? ' · out of service' : '';
    return `${room.number} · ${type} · sleeps ${room.capacity} · ${rate}${suffix}`;
  }

  public roomNumber(roomId: number): string {
    return this.roomsById().get(roomId)?.number ?? `#${roomId}`;
  }

  public guestName(guestId: number): string {
    return this.guestsById().get(guestId)?.full_name ?? `Guest #${guestId}`;
  }

  /** `checked_in` reads badly in a table cell; `Checked in` does not. */
  public statusLabel(status: string): string {
    const words = status.replace(/_/g, ' ');
    return words[0].toUpperCase() + words.slice(1);
  }
}
