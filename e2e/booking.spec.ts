/**
 * Booking route smoke test.
 *
 * `booking.spec.ts` in `src/` proves the component decides correctly and
 * `booking.render.spec.ts` proves those decisions reach a jsdom DOM. Neither
 * touches a form the way a person does. What is only provable here is the
 * round trip: type into a real input in a real browser running the production
 * bundle, submit, and find the row — then reload and find it still there,
 * which is the specific claim a mocked-up demo cannot make.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { GUESTS, ROOMS, SEEDED_BOOKING, stubBackendDown, stubBookingApi } from './support/backend';

/** The row for a room number, found by its row header. */
function bookingRow(page: Page, roomNumber: string): Locator {
  return page
    .locator('tbody tr')
    .filter({ has: page.getByRole('rowheader', { name: roomNumber }) });
}

/** Fill the form for a stay in `roomNumber`, leaving dates alone by default. */
async function fillBooking(
  page: Page,
  roomNumber: string,
  dates?: { checkIn: string; checkOut: string }
): Promise<void> {
  const room = ROOMS.find((candidate) => candidate.number === roomNumber);
  await page.getByLabel('Room').selectOption(String(room?.id));
  await page.getByLabel('Guest').selectOption(String(GUESTS[0].id));

  if (dates) {
    await page.getByLabel('Check-in').fill(dates.checkIn);
    await page.getByLabel('Check-out').fill(dates.checkOut);
  }
}

test.describe('booking with the API up', () => {
  test.beforeEach(async ({ page }) => {
    await stubBookingApi(page);
    await page.goto('/booking');
  });

  test('shows the bookings already on file and offers real rooms', async ({ page }) => {
    await expect(page.locator('.data-source--live')).toBeVisible();

    // The seeded row, resolved from ids into names the reference lists supplied.
    const seeded = bookingRow(page, '101');
    await expect(seeded).toContainText('Alan Turing');
    await expect(seeded).toContainText('Checked in');

    // Every room, including the one out of service — labelled, not hidden.
    await expect(page.getByLabel('Room').locator('option')).toHaveText([
      '101 · Standard · sleeps 3 · $100/night',
      '103 · Deluxe · sleeps 4 · $300/night',
      '201 · Suite · sleeps 4 · $400/night · out of service',
    ]);
  });

  test('creates a booking, and it is still there after a reload', async ({ page }) => {
    await expect(bookingRow(page, '103')).toHaveCount(0);

    await fillBooking(page, '103', { checkIn: '2026-06-01', checkOut: '2026-06-04' });
    await page.getByRole('button', { name: 'Create booking' }).click();

    const created = bookingRow(page, '103');
    await expect(created).toContainText('Ada Lovelace');
    // The rate was defaulted by the server from the room, not sent by the form
    // — so its presence here means the response was read, not echoed.
    await expect(created).toContainText('$300');
    await expect(page.locator('.form-outcome')).toContainText('created');
    await expect(page.locator('#bookings-heading')).toContainText('2 on file');

    // The whole point. A row that survives a reload came from the server.
    await page.reload();
    await expect(bookingRow(page, '103')).toContainText('Ada Lovelace');
    await expect(bookingRow(page, '103')).toHaveCount(1);
  });

  test('places the new row in the order the server would return it', async ({ page }) => {
    // Earlier check-in than the seeded stay, so it belongs below it.
    await fillBooking(page, '103', { checkIn: '2025-12-01', checkOut: '2025-12-03' });
    await page.getByRole('button', { name: 'Create booking' }).click();

    await expect(page.getByRole('rowheader')).toHaveText(['101', '103']);

    // ...and the reload agrees, which is what makes the local sort correct
    // rather than merely plausible.
    await page.reload();
    await expect(page.getByRole('rowheader')).toHaveText(['101', '103']);
  });

  test("renders the server's rejection on the field that caused it", async ({ page }) => {
    // The one rule the client deliberately does not duplicate: a stay must be
    // at least one night. Equal dates reach the API and come back attributed.
    await fillBooking(page, '103', { checkIn: '2026-06-01', checkOut: '2026-06-01' });
    await page.getByRole('button', { name: 'Create booking' }).click();

    const checkOut = page.getByLabel('Check-out');
    await expect(page.locator('#check_out-error')).toContainText(
      'check_out must be after check_in'
    );
    await expect(checkOut).toHaveAttribute('aria-invalid', 'true');

    // Described by it, not merely next to it — the message is on the control's
    // accessible description or a screen reader never reaches it.
    await expect(checkOut).toHaveAccessibleDescription(/check_out must be after check_in/);

    // Nothing else is blamed, and nothing was written.
    await expect(page.locator('.field-error')).toHaveCount(1);
    await expect(page.getByLabel('Check-in')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });

  test('clears the rejection once the field is corrected', async ({ page }) => {
    await fillBooking(page, '103', { checkIn: '2026-06-01', checkOut: '2026-06-01' });
    await page.getByRole('button', { name: 'Create booking' }).click();
    await expect(page.locator('#check_out-error')).toBeVisible();

    await page.getByLabel('Check-out').fill('2026-06-05');

    await expect(page.locator('#check_out-error')).toHaveCount(0);
    await expect(page.getByLabel('Check-out')).not.toHaveAttribute('aria-invalid', 'true');
  });
});

test.describe('booking with the API down', () => {
  test('disables the form and says why, rather than faking a hotel', async ({ page }) => {
    await stubBackendDown(page);
    await page.goto('/booking');

    await expect(page.locator('.data-source--simulated')).toContainText('API unreachable');
    await expect(page.locator('.data-source--live')).toHaveCount(0);

    // Disabled, because a form whose submissions go nowhere is worse than no
    // form: it invites a visitor to do work that will be silently discarded.
    await expect(page.getByRole('button', { name: 'Create booking' })).toBeDisabled();
    await expect(page.getByLabel('Room')).toBeDisabled();
    await expect(page.getByLabel('Check-in')).toBeDisabled();

    // And no fixture. The dashboard falls back to a committed snapshot; this
    // page states the absence instead, because invented bookings would be a
    // claim about writes that never happened.
    await expect(page.locator('.booking-empty')).toContainText('no offline fixture');
    await expect(page.locator('table')).toHaveCount(0);
    await expect(page.getByText(String(SEEDED_BOOKING.id))).toHaveCount(0);
  });
});
