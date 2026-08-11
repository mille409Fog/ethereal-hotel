import { TestBed } from '@angular/core/testing';
import { Booking } from './booking';
import {
  BookingApiError,
  BookingApiService,
  IBooking,
  IBookingPage,
  IGuest,
  IRoom,
} from '../services/booking-api.service';

/**
 * These exercise the component class directly, the way `dashboard.spec.ts`
 * does: what is under test is the decision logic — whether the page believes
 * it can write, where a rejection is displayed, and what ends up in the list —
 * none of which needs a rendered template.
 *
 * The three cases the roadmap asks for are `creates a booking…`, `renders the
 * server's rejection on the field…` and `treats a dropped connection…`. The
 * rest are the edges those three walk past.
 */

const rooms: IRoom[] = [
  {
    id: 4,
    number: '201',
    room_type: 'suite',
    floor: 2,
    capacity: 4,
    base_rate: 400,
    status: 'maintenance',
  },
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

const guests: IGuest[] = [
  { id: 1, full_name: 'Ada Lovelace' },
  { id: 2, full_name: 'Alan Turing' },
];

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

const page: IBookingPage = { items: [existing], total: 1, limit: 20, offset: 0 };

/** The record the API returns for a successful create. */
function createdBooking(overrides: Partial<IBooking> = {}): IBooking {
  return {
    id: 42,
    guest_id: 1,
    room_id: 3,
    check_in: '2026-09-01',
    check_out: '2026-09-03',
    adults: 2,
    children: 0,
    nightly_rate: 300,
    status: 'reserved',
    ...overrides,
  };
}

describe('Booking', () => {
  let api: {
    listRooms: ReturnType<typeof vi.fn>;
    listGuests: ReturnType<typeof vi.fn>;
    listBookings: ReturnType<typeof vi.fn>;
    createBooking: ReturnType<typeof vi.fn>;
  };

  const makeComponent = (): Booking => TestBed.runInInjectionContext(() => new Booking());

  /** A component whose initial load succeeded, ready to submit. */
  async function readyComponent(): Promise<Booking> {
    const component = makeComponent();
    await component.ngOnInit();
    return component;
  }

  beforeEach(() => {
    api = {
      listRooms: vi.fn().mockResolvedValue(rooms),
      listGuests: vi.fn().mockResolvedValue(guests),
      listBookings: vi.fn().mockResolvedValue(page),
      createBooking: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: BookingApiService, useValue: api }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loading', () => {
    it('reads reference data and bookings, and opens the form for writing', async () => {
      const component = await readyComponent();

      expect(component.status()).toBe('ready');
      expect(component.rooms()).toEqual(rooms);
      expect(component.bookings()).toEqual([existing]);
      expect(component.total()).toBe(1);
      expect(component.form.enabled).toBe(true);
    });

    it('preselects a sellable room rather than whichever came back first', async () => {
      // Room 201 is first in the payload and is out of service. Defaulting to
      // it would open the form on a booking the hotel cannot honour.
      const component = await readyComponent();

      expect(component.form.getRawValue().room_id).toBe(3);
      expect(component.form.getRawValue().guest_id).toBe(1);
    });

    it('opens with a one-night stay so the form is submittable as it stands', async () => {
      const component = await readyComponent();
      // Read through the form value rather than destructured: the wire names
      // are snake_case and the lint rule that keeps *variables* camelCase is
      // worth more than the two characters destructuring would save.
      const stay = component.form.getRawValue();

      expect(stay.check_in).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(stay.check_out).getTime()).toBeGreaterThan(new Date(stay.check_in).getTime());
      expect(component.form.valid).toBe(true);
    });

    it('disables the form and says so when the API is not there', async () => {
      api.listRooms.mockRejectedValue(new BookingApiError('unreachable', 0));
      const component = await readyComponent();

      expect(component.status()).toBe('unreachable');
      expect(component.form.disabled).toBe(true);
      expect(component.bookings()).toEqual([]);
      // No fixture, and the empty state has to say which kind of empty it is.
      expect(component.emptyMessage()).toContain('no offline fixture');
      expect(component.statusAnnouncement()).toContain('unreachable');
    });
  });

  describe('creating a booking', () => {
    it('creates a booking and shows the stored record in the list', async () => {
      const created = createdBooking();
      api.createBooking.mockResolvedValue(created);
      const component = await readyComponent();

      await component.submit();

      expect(api.createBooking).toHaveBeenCalledWith(component.form.getRawValue());
      expect(component.bookings()).toContainEqual(created);
      expect(component.total()).toBe(2);
      expect(component.outcomeIsError()).toBe(false);
      expect(component.outcome()).toContain('#42');
      // Re-enabled, so a second booking can be made without a reload.
      expect(component.form.enabled).toBe(true);
      expect(component.submitting()).toBe(false);
    });

    it('does not re-read the list it was just handed', async () => {
      api.createBooking.mockResolvedValue(createdBooking());
      const component = await readyComponent();

      await component.submit();

      // The 201 body is the stored record; a second GET would be a round trip
      // to be told what we already know.
      expect(api.listBookings).toHaveBeenCalledTimes(1);
    });

    it('places the new row where a re-read would put it', async () => {
      // Backend order is check_in descending. This booking starts before the
      // one already on file, so it belongs second, not at the top.
      api.createBooking.mockResolvedValue(createdBooking({ id: 43, check_in: '2026-07-01' }));
      const component = await readyComponent();

      await component.submit();

      expect(component.bookings().map((booking) => booking.id)).toEqual([7, 43]);
    });

    it('posts numbers, not the strings a select hands back', async () => {
      api.createBooking.mockResolvedValue(createdBooking());
      const component = await readyComponent();
      // What the DOM produces for `<select>`: the bound id, stringified.
      component.form.controls['room_id'].setValue('3');
      component.form.controls['guest_id'].setValue('1');

      await component.submit();

      expect(api.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({ room_id: 3, guest_id: 1 })
      );
    });

    it('explains an out-of-range party size in the terms the field offered', async () => {
      const component = await readyComponent();
      component.form.controls['adults'].setValue(0);

      await component.submit();

      expect(api.createBooking).not.toHaveBeenCalled();
      expect(component.errorFor('adults')).toBe('Enter a number between 0 and 12.');
    });

    it('still says something when a validator it does not recognise fires', async () => {
      // Adding a validator without adding a message here would otherwise mark
      // the field invalid and explain nothing, which is the worst of both.
      const component = await readyComponent();
      component.form.controls['children'].setErrors({ notAWholeNumber: true });
      component.form.controls['children'].markAsTouched();

      expect(component.errorFor('children')).toBe('This value is not valid.');
    });

    it('refuses to submit an incomplete form and does not call the API', async () => {
      const component = await readyComponent();
      component.form.controls['guest_id'].setValue(null);

      await component.submit();

      expect(api.createBooking).not.toHaveBeenCalled();
      expect(component.errorFor('guest_id')).toBe('This is required.');
      expect(component.outcomeIsError()).toBe(true);
    });
  });

  describe('when the server rejects the booking', () => {
    /** The 422 the API answers when check-out is not after check-in. */
    const datesRejected = new BookingApiError('check_out must be after check_in', 422, {
      check_out: 'check_out must be after check_in',
    });

    it("renders the server's rejection on the field it named", async () => {
      api.createBooking.mockRejectedValue(datesRejected);
      const component = await readyComponent();

      await component.submit();

      expect(component.errorFor('check_out')).toBe('check_out must be after check_in');
      expect(component.invalidAttr('check_out')).toBe('true');
      // And nowhere else: an error on every field is an error on none.
      expect(component.errorFor('check_in')).toBeNull();
      expect(component.invalidAttr('check_in')).toBeNull();
    });

    it('wires the message into aria-describedby so it is announced, not just drawn', async () => {
      api.createBooking.mockRejectedValue(datesRejected);
      const component = await readyComponent();

      expect(component.describedBy('check_out', true)).toBe('check_out-hint');

      await component.submit();

      expect(component.describedBy('check_out', true)).toBe('check_out-hint check_out-error');
      expect(component.describedBy('check_in', false)).toBeNull();
    });

    it('adds nothing to the list and keeps the form usable', async () => {
      api.createBooking.mockRejectedValue(datesRejected);
      const component = await readyComponent();

      await component.submit();

      expect(component.bookings()).toEqual([existing]);
      expect(component.total()).toBe(1);
      expect(component.status()).toBe('ready');
      expect(component.form.enabled).toBe(true);
    });

    it('drops the message when that field is edited, and only that field', async () => {
      api.createBooking.mockRejectedValue(
        new BookingApiError('rejected', 422, {
          check_out: 'check_out must be after check_in',
          adults: 'Input should be greater than 0',
        })
      );
      const component = await readyComponent();
      await component.submit();

      component.form.controls['check_out'].setValue('2026-12-31');

      expect(component.errorFor('check_out')).toBeNull();
      // Still standing: the user has not addressed it, and clearing it here
      // would erase a message they may not have read yet.
      expect(component.errorFor('adults')).toBe('Input should be greater than 0');
    });

    it('still reports a rejection it could not attribute to any field', async () => {
      api.createBooking.mockRejectedValue(new BookingApiError('Server exploded', 500));
      const component = await readyComponent();

      await component.submit();

      expect(component.outcomeIsError()).toBe(true);
      expect(component.outcome()).toContain('500');
      expect(component.outcome()).toContain('Server exploded');
      expect(component.errorFor('check_out')).toBeNull();
    });

    it('reports a non-API failure without pretending to know the cause', async () => {
      api.createBooking.mockRejectedValue(new TypeError('undefined is not a function'));
      const component = await readyComponent();

      await component.submit();

      expect(component.outcomeIsError()).toBe(true);
      expect(component.status()).toBe('ready');
    });
  });

  describe('when the API disappears mid-session', () => {
    it('treats a dropped connection as a lost write, not a rejected one', async () => {
      api.createBooking.mockRejectedValue(new BookingApiError('unreachable', 0));
      const component = await readyComponent();

      await component.submit();

      expect(component.status()).toBe('unreachable');
      expect(component.form.disabled).toBe(true);
      expect(component.outcome()).toContain('not saved');
      // Nothing optimistic survives a write that did not happen.
      expect(component.bookings()).toEqual([existing]);
      expect(component.total()).toBe(1);
    });

    it('keeps the rows it already read on screen rather than blanking them', async () => {
      // They are real records; they are just no longer current. Clearing them
      // would throw away true data to signal a connection problem the badge
      // already states.
      api.createBooking.mockRejectedValue(new BookingApiError('unreachable', 0));
      const component = await readyComponent();

      await component.submit();

      expect(component.bookings()).toEqual([existing]);
      expect(component.emptyMessage()).toContain('no offline fixture');
    });

    it('will not submit again once the API is known to be gone', async () => {
      api.createBooking.mockRejectedValue(new BookingApiError('unreachable', 0));
      const component = await readyComponent();
      await component.submit();

      await component.submit();

      expect(api.createBooking).toHaveBeenCalledTimes(1);
    });
  });

  describe('display helpers', () => {
    it('labels a room with everything needed to choose one', async () => {
      const component = await readyComponent();

      expect(component.roomLabel(rooms[1])).toBe('103 · Deluxe · sleeps 4 · $300/night');
      // The out-of-service room is offered and marked, not hidden: it is
      // inventory the hotel has, and concealing it would misstate the estate.
      expect(component.roomLabel(rooms[0])).toContain('out of service');
    });

    it('resolves the ids the booking list carries into names', async () => {
      const component = await readyComponent();

      expect(component.roomNumber(3)).toBe('103');
      expect(component.guestName(2)).toBe('Alan Turing');
      // A row referencing something the reference lists did not include still
      // renders — as the id, rather than as a blank cell.
      expect(component.roomNumber(999)).toBe('#999');
      expect(component.guestName(999)).toBe('Guest #999');
    });

    it('says when the table is a page rather than the whole collection', async () => {
      // The seeded hotel has over a thousand bookings and the read is paged,
      // so "1,344 on file" above twenty rows would read as a failed load.
      api.listBookings.mockResolvedValue({ items: [existing], total: 1344, limit: 20, offset: 0 });
      const component = await readyComponent();

      expect(component.listSummary()).toBe('showing 1 of 1,344');
    });

    it('drops the qualifier when the table is the whole collection', async () => {
      const component = await readyComponent();

      expect(component.listSummary()).toBe('1 on file');
    });

    it('makes an enum readable', async () => {
      const component = await readyComponent();

      expect(component.statusLabel('checked_in')).toBe('Checked in');
      expect(component.statusLabel('reserved')).toBe('Reserved');
    });

    it('names the submit button after what it is doing', async () => {
      const component = await readyComponent();
      expect(component.submitLabel()).toBe('Create booking');

      let resolve: (value: IBooking) => void = () => {};
      api.createBooking.mockReturnValue(
        new Promise<IBooking>((r) => {
          resolve = r;
        })
      );
      const pending = component.submit();
      expect(component.submitLabel()).toBe('Saving…');

      resolve(createdBooking());
      await pending;
      expect(component.submitLabel()).toBe('Create booking');
    });
  });
});
