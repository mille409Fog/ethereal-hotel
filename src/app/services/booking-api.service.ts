import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * The booking half of the API, typed the same way `DashboardApiService` types
 * the metrics half: `window.fetch` against `environment.apiUrl`, no HttpClient,
 * no second base URL.
 *
 * Field names are snake_case here and nowhere else in the frontend. That is
 * deliberate and it is the backend's convention, not an oversight —
 * `backend/schemas.py` says the metrics payloads are camelCase because Angular
 * consumes them as `IMetrics`, while the booking models mirror their ORM
 * columns. Keeping the wire names means the form controls can be named after
 * them, which turns "which field did the server reject?" into a dictionary
 * lookup instead of a translation table that has to be kept in step with two
 * schemas at once.
 */

/** Room class, matching `RoomType` in `backend/db/models.py`. */
export type RoomType = 'standard' | 'deluxe' | 'suite' | 'penthouse';

/** Whether a room is sellable at all, independent of who is in it. */
export type RoomStatus = 'operational' | 'maintenance';

/** Where a booking is in its lifecycle, matching `BookingStatus`. */
export type BookingStatus = 'reserved' | 'checked_in' | 'checked_out' | 'cancelled';

/** A room as `GET /api/rooms` serves it. */
export interface IRoom {
  id: number;
  number: string;
  room_type: RoomType;
  floor: number;
  capacity: number;
  /** List price per night, in USD. A booking may lock in a different rate. */
  base_rate: number;
  status: RoomStatus;
}

/**
 * A guest as `GET /api/guests` serves it — an id and a display name, and
 * nothing contactable. The backend decides that; this type records it.
 */
export interface IGuest {
  id: number;
  full_name: string;
}

/** A booking as the API returns it. Dates are ISO `YYYY-MM-DD`. */
export interface IBooking {
  id: number;
  guest_id: number;
  room_id: number;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  /** Rate locked in at booking time, in USD. */
  nightly_rate: number;
  status: BookingStatus;
}

/** One page of bookings; `total` is the count before limit/offset. */
export interface IBookingPage {
  items: IBooking[];
  total: number;
  limit: number;
  offset: number;
}

/** What `POST /api/bookings` accepts. `nightly_rate` defaults to the room's. */
export interface IBookingDraft {
  guest_id: number;
  room_id: number;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
}

/** Server-side messages keyed by the request field each one belongs to. */
export type FieldErrors = Readonly<Record<string, string>>;

/**
 * A request the API refused, or could not be made at all.
 *
 * `fieldErrors` is the part worth having: it is what lets a form render the
 * server's objection against the input that caused it rather than as a banner
 * at the top. It is empty for failures with nothing to blame — a dropped
 * connection, a 500 — and callers have to handle that case, which is why it is
 * a dictionary rather than an optional single field.
 */
export class BookingApiError extends Error {
  /** HTTP status, or 0 when the request never got a response. */
  public readonly status: number;
  public readonly fieldErrors: FieldErrors;

  constructor(message: string, status: number, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = 'BookingApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  /** True when the failure was the network rather than the server. */
  public get isUnreachable(): boolean {
    return this.status === 0;
  }
}

/** `{ message, field }` — a `BookingError` mapped by `routers/bookings.py`. */
interface IDomainDetail {
  message: string;
  field: string | null;
}

/** One entry of FastAPI's own 422 body, raised before a handler is reached. */
interface IValidationIssue {
  loc: Array<string | number>;
  msg: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDomainDetail(value: unknown): value is IDomainDetail {
  return isRecord(value) && typeof value['message'] === 'string';
}

function isValidationIssue(value: unknown): value is IValidationIssue {
  return isRecord(value) && Array.isArray(value['loc']) && typeof value['msg'] === 'string';
}

/** Fallback wording for a refusal that arrived without a usable body. */
const UNEXPLAINED = 'The booking was rejected.';

/**
 * Fold Pydantic's list of located issues into one message per field.
 *
 * `loc` is a path from the request root, e.g. `["body", "check_out"]`. The
 * leaf is the field; anything shallower is the body itself, which is not
 * attributable to a control. First message per field wins — a field with two
 * objections still only has one place to show them.
 */
function fromValidationIssues(issues: readonly unknown[]): FieldErrors {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    if (!isValidationIssue(issue)) {
      continue;
    }
    const leaf = issue.loc[issue.loc.length - 1];
    if (typeof leaf === 'string' && leaf !== 'body') {
      fieldErrors[leaf] ??= issue.msg;
    }
  }
  return fieldErrors;
}

/**
 * Read FastAPI's `detail` into a message and a per-field breakdown.
 *
 * There are two error bodies to cope with and they are not interchangeable.
 * Pydantic rejects a malformed request *before* the handler runs and returns a
 * list of issues located by path; a booking rule that fails inside the handler
 * comes back as the single `{message, field}` object the router builds. A
 * client that only understood one of them would silently lose half its errors
 * — and it would be the half that fires on a typo, which is the common one.
 */
function parseDetail(detail: unknown): { message: string; fieldErrors: FieldErrors } {
  if (isDomainDetail(detail)) {
    const field = typeof detail.field === 'string' ? detail.field : null;
    return {
      message: detail.message,
      fieldErrors: field ? { [field]: detail.message } : {},
    };
  }

  if (Array.isArray(detail)) {
    const fieldErrors = fromValidationIssues(detail);
    return { message: Object.values(fieldErrors)[0] ?? UNEXPLAINED, fieldErrors };
  }

  return {
    message: typeof detail === 'string' ? detail : UNEXPLAINED,
    fieldErrors: {},
  };
}

@Injectable({
  providedIn: 'root',
})
export class BookingApiService {
  private readonly API_URL = environment.apiUrl;

  /** Every room the hotel has, including the ones out of service. */
  public async listRooms(): Promise<IRoom[]> {
    return this.read<IRoom[]>('/rooms');
  }

  /** Every guest on file, as id and display name. */
  public async listGuests(): Promise<IGuest[]> {
    return this.read<IGuest[]>('/guests');
  }

  /**
   * One page of bookings, newest stay first.
   *
   * @param limit How many to read. The API caps this at 200 and answers 422
   *   above that rather than silently truncating.
   */
  public async listBookings(limit = 20): Promise<IBookingPage> {
    return this.read<IBookingPage>(`/bookings?limit=${limit}&offset=0`);
  }

  /**
   * Create a booking.
   *
   * Rejections arrive as {@link BookingApiError} with `fieldErrors` populated
   * wherever the server could attribute them — including the rule this form
   * deliberately does not duplicate on the client, that check-out must be
   * after check-in. That rule lives in `services/bookings.py`, and asking the
   * server about it is the point: a copy in the browser would be a second
   * implementation to keep in step, and it would hide the one path this demo
   * exists to show.
   */
  public async createBooking(draft: IBookingDraft): Promise<IBooking> {
    return this.request<IBooking>('/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
  }

  /** GET a path under the API base. */
  private async read<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  /**
   * Perform a request and normalise every way it can fail into one error type.
   *
   * The two failure modes are kept apart on purpose. A rejected `fetch` means
   * the API was never reached — no status, nothing to attribute — and the page
   * has to say so rather than render an empty list as if the hotel had no
   * bookings. A response with a bad status means the server answered and had a
   * reason, which is worth reading out of the body.
   */
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await window.fetch(`${this.API_URL}${path}`, init);
    } catch (error) {
      console.error(`Booking API unreachable (${path}):`, error);
      throw new BookingApiError('The booking API is unreachable.', 0);
    }

    if (!response.ok) {
      throw await BookingApiService.toError(response);
    }

    // 204 No Content has no body to parse; nothing here returns one today, but
    // `delete` would, and a JSON parse of "" throws rather than yielding null.
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  /** Build the error for a response the server refused. */
  private static async toError(response: Response): Promise<BookingApiError> {
    let detail: unknown;
    try {
      detail = ((await response.json()) as { detail?: unknown }).detail;
    } catch {
      // A non-JSON error body — a proxy's HTML 502 page, typically. There is
      // nothing to attribute, and the status is the only fact available.
      detail = undefined;
    }

    const { message, fieldErrors } = parseDetail(detail);
    console.error(`Booking API error ${response.status}: ${message}`);
    return new BookingApiError(message, response.status, fieldErrors);
  }
}
