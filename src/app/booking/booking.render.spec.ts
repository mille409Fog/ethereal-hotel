import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Booking } from './booking';
import {
  BookingApiError,
  BookingApiService,
  IBooking,
  IGuest,
  IRoom,
} from '../services/booking-api.service';

/**
 * The other spec proves the component *decides* correctly. This one proves the
 * decisions reach the DOM, which for a form is a separate claim and the one
 * that tends to be false.
 *
 * Specifically: `aria-describedby` is computed in TypeScript and consumed by
 * an element rendered somewhere else in the template. Every assertion about it
 * in a class-only test is an assertion about a string. Here the id is resolved
 * against the document, so a message that renders without ever being announced
 * — the usual way form accessibility fails — fails a test instead.
 */

const rooms: IRoom[] = [
  {
    id: 3,
    number: '103',
    room_type: 'deluxe',
    floor: 1,
    capacity: 4,
    base_rate: 300,
    status: 'operational',
  },
];

const guests: IGuest[] = [{ id: 1, full_name: 'Ada Lovelace' }];

const existing: IBooking = {
  id: 7,
  guest_id: 1,
  room_id: 3,
  check_in: '2026-08-01',
  check_out: '2026-08-04',
  adults: 2,
  children: 1,
  nightly_rate: 300,
  status: 'checked_in',
};

describe('Booking (rendered)', () => {
  let fixture: ComponentFixture<Booking>;
  let api: {
    listRooms: ReturnType<typeof vi.fn>;
    listGuests: ReturnType<typeof vi.fn>;
    listBookings: ReturnType<typeof vi.fn>;
    createBooking: ReturnType<typeof vi.fn>;
  };

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';
  const $ = <T extends HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);

  /**
   * The accessible description of a control, resolved the way a screen reader
   * resolves it: follow `aria-describedby` to the elements it names and read
   * them. Returns null when the attribute is absent.
   */
  function describedText(controlId: string): string | null {
    const ids = $(`#${controlId}`)?.getAttribute('aria-describedby');
    if (!ids) {
      return null;
    }
    return ids
      .split(' ')
      .map((id) => {
        const target = $(`#${id}`);
        // A dangling reference is the failure this helper exists to catch, so
        // it is made loud rather than skipped.
        expect(
          target,
          `aria-describedby names #${id}, which is not in the document`
        ).not.toBeNull();
        return target?.textContent?.trim() ?? '';
      })
      .join(' ');
  }

  /**
   * Mount, run `ngOnInit`, let its three reads settle, and paint the result.
   *
   * Polled on the component's own state rather than awaited on
   * `fixture.whenStable()`, which returns here before anything has happened:
   * `ngOnInit` is async and nothing tracks the promises it is waiting on, so
   * "stable" is true while three reads are still in flight and the first
   * `detectChanges` has only rendered the `checking` state.
   */
  async function render(): Promise<void> {
    fixture = TestBed.createComponent(Booking);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.status()).not.toBe('checking'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    api = {
      listRooms: vi.fn().mockResolvedValue(rooms),
      listGuests: vi.fn().mockResolvedValue(guests),
      listBookings: vi
        .fn()
        .mockResolvedValue({ items: [existing], total: 1, limit: 20, offset: 0 }),
      createBooking: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [Booking],
      providers: [{ provide: BookingApiService, useValue: api }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('with the API up', () => {
    beforeEach(render);

    it('labels every control, and points each label at a real input', () => {
      const labels = Array.from(el().querySelectorAll('label'));

      expect(labels.map((label) => label.textContent?.trim())).toEqual([
        'Room',
        'Guest',
        'Check-in',
        'Check-out',
        'Adults',
        'Children',
      ]);

      // A `for` that names nothing is indistinguishable from a correct one by
      // eye, and leaves the control unnamed for anyone not using their eyes.
      for (const label of labels) {
        expect($(`#${label.getAttribute('for')}`), `label for=${label.htmlFor}`).not.toBeNull();
      }
    });

    it('offers the rooms and guests the API returned', () => {
      const roomOptions = Array.from(el().querySelectorAll('#room_id option'));

      expect(roomOptions.map((option) => option.textContent?.trim())).toEqual([
        '103 · Deluxe · sleeps 4 · $300/night',
      ]);
      expect(text()).toContain('Ada Lovelace');
    });

    it('describes a field by its hint before anything has gone wrong', () => {
      expect(describedText('check_out')).toContain('Must be at least one night after check-in');
      expect($('#check_out')?.getAttribute('aria-invalid')).toBeNull();
      // A field with no hint has no description to give.
      expect(describedText('check_in')).toBeNull();
    });

    it('renders the existing bookings as a table with row headers', () => {
      const rowHeader = $('tbody th');

      expect(rowHeader?.textContent?.trim()).toBe('103');
      expect(rowHeader?.getAttribute('scope')).toBe('row');
      expect(text()).toContain('Ada Lovelace');
      expect(text()).toContain('$300');
      expect(text()).toContain('Checked in');
      expect(text()).toContain('1 on file');
    });

    it('says the data is live, in the badge and in the live region', () => {
      expect($('.data-source--live')).not.toBeNull();
      expect($('.data-source--simulated')).toBeNull();
      expect($('[role="status"].visually-hidden')?.textContent).toContain('real database');
    });

    it('keeps the outcome region in the DOM before there is an outcome', () => {
      // It has to exist ahead of time: a live region inserted at the same
      // moment as its text is not observed, and the first result goes
      // unannounced. Hidden while empty by `:empty` in CSS, not by @if.
      const outcome = $('.form-outcome');

      expect(outcome).not.toBeNull();
      expect(outcome?.getAttribute('aria-live')).toBe('polite');
      expect(outcome?.textContent?.trim()).toBe('');
    });
  });

  describe('when the server rejects the booking', () => {
    beforeEach(async () => {
      api.createBooking.mockRejectedValue(
        new BookingApiError('check_out must be after check_in', 422, {
          check_out: 'check_out must be after check_in',
        })
      );
      await render();
      await fixture.componentInstance.submit();
      fixture.detectChanges();
    });

    it('renders the message under the field and inside its description', () => {
      const error = $('#check_out-error');

      expect(error?.textContent).toContain('check_out must be after check_in');
      expect($('#check_out')?.getAttribute('aria-invalid')).toBe('true');
      // The hint stays: the rule and the objection to it are both useful.
      expect(describedText('check_out')).toContain('Must be at least one night');
      expect(describedText('check_out')).toContain('check_out must be after check_in');
    });

    it('marks no other field, and adds no row', () => {
      expect(el().querySelectorAll('.field-error')).toHaveLength(1);
      expect($('#check_in')?.getAttribute('aria-invalid')).toBeNull();
      expect(el().querySelectorAll('tbody tr')).toHaveLength(1);
    });

    it('announces the outcome in the live region', () => {
      expect($('.form-outcome')?.textContent).toContain('rejected');
      expect($('.form-outcome')?.classList.contains('form-outcome--error')).toBe(true);
    });
  });

  describe('with the API down', () => {
    beforeEach(async () => {
      api.listRooms.mockRejectedValue(new BookingApiError('unreachable', 0));
      api.listGuests.mockRejectedValue(new BookingApiError('unreachable', 0));
      api.listBookings.mockRejectedValue(new BookingApiError('unreachable', 0));
      await render();
    });

    it('disables the whole form rather than offering a write that cannot land', () => {
      expect($<HTMLSelectElement>('#room_id')?.disabled).toBe(true);
      expect($<HTMLInputElement>('#check_in')?.disabled).toBe(true);
      expect($<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    });

    it('states what happened instead of showing an empty hotel', () => {
      expect($('.data-source--simulated')?.textContent).toContain('API unreachable');
      expect($('.booking-empty')?.textContent).toContain('no offline fixture');
      expect(el().querySelector('table')).toBeNull();
    });
  });
});
