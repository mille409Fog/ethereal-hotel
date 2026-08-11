import { TestBed } from '@angular/core/testing';
import { BookingApiError, BookingApiService, IBooking } from './booking-api.service';
import { environment } from '../../environments/environment';

/**
 * The service's job is not "call fetch" — it is to turn three different
 * failure bodies into one error type that a form can act on. That translation
 * is what these tests are about; the happy paths are here mostly to prove the
 * URLs and payloads are what the backend documents.
 */

const draft = {
  guest_id: 1,
  room_id: 3,
  check_in: '2026-08-11',
  check_out: '2026-08-13',
  adults: 2,
  children: 0,
};

const created: IBooking = {
  id: 42,
  ...draft,
  nightly_rate: 300,
  status: 'reserved',
};

/** A `fetch` result good enough for the service; only these fields are read. */
function ok(body: unknown, status = 200): Response {
  return { ok: true, status, json: async () => body } as Response;
}

function refused(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as Response;
}

describe('BookingApiService', () => {
  let service: BookingApiService;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BookingApiService);

    fetchSpy = vi.fn();
    vi.spyOn(window, 'fetch').mockImplementation(fetchSpy as typeof window.fetch);
    // The service logs every failure. Silenced so a passing run is quiet, but
    // spied rather than stubbed away, because "did not swallow it" is part of
    // what the failure tests below assert.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('reads', () => {
    it('lists rooms from the reference endpoint', async () => {
      const rooms = [
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
      fetchSpy.mockResolvedValue(ok(rooms));

      await expect(service.listRooms()).resolves.toEqual(rooms);
      expect(fetchSpy).toHaveBeenCalledWith(`${environment.apiUrl}/rooms`, { method: 'GET' });
    });

    it('lists guests from the reference endpoint', async () => {
      fetchSpy.mockResolvedValue(ok([{ id: 1, full_name: 'Ada Lovelace' }]));

      await expect(service.listGuests()).resolves.toEqual([{ id: 1, full_name: 'Ada Lovelace' }]);
      expect(fetchSpy).toHaveBeenCalledWith(`${environment.apiUrl}/guests`, { method: 'GET' });
    });

    it('asks for a bounded page of bookings', async () => {
      fetchSpy.mockResolvedValue(ok({ items: [created], total: 1, limit: 20, offset: 0 }));

      const page = await service.listBookings();

      expect(page.total).toBe(1);
      // Explicitly paged rather than relying on the server's default: the API
      // caps `limit` at 200 and answers 422 above it, so an unbounded read is
      // a request that can start failing as the demo database grows.
      expect(fetchSpy).toHaveBeenCalledWith(`${environment.apiUrl}/bookings?limit=20&offset=0`, {
        method: 'GET',
      });
    });
  });

  describe('createBooking', () => {
    it('posts the draft as JSON and returns the stored record', async () => {
      fetchSpy.mockResolvedValue(ok(created, 201));

      await expect(service.createBooking(draft)).resolves.toEqual(created);
      expect(fetchSpy).toHaveBeenCalledWith(`${environment.apiUrl}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
    });

    it('attributes a domain rejection to the field the server named', async () => {
      // The shape `routers/bookings.py` builds from a `BookingError`.
      fetchSpy.mockResolvedValue(
        refused(422, {
          detail: { message: 'check_out must be after check_in', field: 'check_out' },
        })
      );

      const error = await service.createBooking(draft).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BookingApiError);
      const booking = error as BookingApiError;
      expect(booking.status).toBe(422);
      expect(booking.message).toBe('check_out must be after check_in');
      expect(booking.fieldErrors).toEqual({ check_out: 'check_out must be after check_in' });
      expect(booking.isUnreachable).toBe(false);
    });

    it('attributes an unknown room to room_id rather than to the form', async () => {
      fetchSpy.mockResolvedValue(
        refused(404, { detail: { message: 'Room 9999 not found', field: 'room_id' } })
      );

      const error = (await service
        .createBooking(draft)
        .catch((e: unknown) => e)) as BookingApiError;

      expect(error.fieldErrors).toEqual({ room_id: 'Room 9999 not found' });
    });

    it('leaves an unattributed domain error unattached to any field', async () => {
      // `field: null` is what a failure about the booking as a whole looks
      // like. Inventing an attribution here would highlight an innocent input.
      fetchSpy.mockResolvedValue(refused(400, { detail: { message: 'Nope', field: null } }));

      const error = (await service
        .createBooking(draft)
        .catch((e: unknown) => e)) as BookingApiError;

      expect(error.message).toBe('Nope');
      expect(error.fieldErrors).toEqual({});
    });

    it("reads Pydantic's own 422, which has a different shape entirely", async () => {
      // Raised before the handler runs, so it never passes through the
      // router's error mapping and looks nothing like the case above.
      fetchSpy.mockResolvedValue(
        refused(422, {
          detail: [
            {
              loc: ['body', 'check_in'],
              msg: 'Input should be a valid date',
              type: 'date_parsing',
            },
            {
              loc: ['body', 'adults'],
              msg: 'Input should be greater than 0',
              type: 'greater_than',
            },
          ],
        })
      );

      const error = (await service
        .createBooking(draft)
        .catch((e: unknown) => e)) as BookingApiError;

      expect(error.fieldErrors).toEqual({
        check_in: 'Input should be a valid date',
        adults: 'Input should be greater than 0',
      });
      // The summary message is the first field's, not a generic placeholder.
      expect(error.message).toBe('Input should be a valid date');
    });

    it('ignores a validation issue located at the body rather than a field', async () => {
      fetchSpy.mockResolvedValue(
        refused(422, { detail: [{ loc: ['body'], msg: 'Field required', type: 'missing' }] })
      );

      const error = (await service
        .createBooking(draft)
        .catch((e: unknown) => e)) as BookingApiError;

      // Nothing to highlight, so nothing is highlighted — but the failure is
      // still reported rather than being turned into a success.
      expect(error.fieldErrors).toEqual({});
      expect(error.status).toBe(422);
    });

    it('survives an error body that is not JSON at all', async () => {
      // A proxy's HTML 502 page. The status is the only fact available.
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('Unexpected token <');
        },
      } as unknown as Response);

      const error = (await service
        .createBooking(draft)
        .catch((e: unknown) => e)) as BookingApiError;

      expect(error).toBeInstanceOf(BookingApiError);
      expect(error.status).toBe(502);
      expect(error.fieldErrors).toEqual({});
    });

    it('distinguishes an unreachable API from a refusal', async () => {
      // A rejected fetch, not a bad status: no response, no body, no blame to
      // assign. The caller has to be able to tell these apart, because one
      // means "fix your input" and the other means "the write did not happen".
      fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

      const error = (await service
        .createBooking(draft)
        .catch((e: unknown) => e)) as BookingApiError;

      expect(error).toBeInstanceOf(BookingApiError);
      expect(error.status).toBe(0);
      expect(error.isUnreachable).toBe(true);
      expect(error.fieldErrors).toEqual({});
      expect(console.error).toHaveBeenCalled();
    });

    it('reports an unreachable API on reads too, not only on writes', async () => {
      fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

      const error = (await service.listRooms().catch((e: unknown) => e)) as BookingApiError;

      expect(error.isUnreachable).toBe(true);
    });
  });
});
