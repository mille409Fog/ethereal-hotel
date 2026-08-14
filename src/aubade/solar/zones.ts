/**
 * IANA timezone → representative coordinates.
 *
 * AUBADE's clock refuses the geolocation prompt: a permission dialog in the first
 * two seconds kills the piece, and the browser hands us a zone for free. A zone is
 * a worse instrument than a GPS fix and a much better one than nothing — it pins
 * longitude to roughly the width of the zone and latitude to whatever the zone's
 * namesake city sits at. Twilight timings tolerate that; the piece never claims
 * more precision than it has.
 *
 * The table is the ~150 zones that cover almost everyone. Everything else — an
 * obscure zone, a spoofed one, a browser that reports nothing — falls back to
 * longitude derived from the zone's own UTC offset and latitude 40°N, and reports
 * `precise: false` so the caller can say so rather than pretend.
 *
 * Coordinates are the zone's namesake city, east-positive longitude, rounded to
 * two decimals. Two decimals is ~1km, which is four orders of magnitude finer than
 * the error already baked into "you are somewhere in Asia/Shanghai" — the rounding
 * is for readability, not accuracy, and adding digits would be a lie about both.
 */

/** Where the sun is being computed for, and how much to trust it. */
export interface IZoneLocation {
  /** Degrees north of the equator. Negative in the southern hemisphere. */
  readonly latitude: number;

  /** Degrees east of Greenwich. Negative in the western hemisphere. */
  readonly longitude: number;

  /**
   * True when the zone was found in the table below. False when the coordinates
   * were derived from the zone's UTC offset, which fixes longitude to the middle
   * of a 15°-wide band and guesses latitude outright.
   */
  readonly precise: boolean;
}

/** Latitude used when a zone is not in the table. Mid-northern, where most people are. */
export const FALLBACK_LATITUDE = 40;

/**
 * The table. Alphabetical within each region so a missing zone is easy to spot
 * and easy to slot in.
 */
export const ZONE_COORDINATES: Readonly<Record<string, readonly [number, number]>> = {
  'Africa/Abidjan': [5.32, -4.03],
  'Africa/Accra': [5.6, -0.19],
  'Africa/Addis_Ababa': [9.03, 38.74],
  'Africa/Algiers': [36.75, 3.06],
  'Africa/Cairo': [30.04, 31.24],
  'Africa/Casablanca': [33.57, -7.59],
  'Africa/Dakar': [14.72, -17.47],
  'Africa/Dar_es_Salaam': [-6.79, 39.21],
  'Africa/Harare': [-17.83, 31.05],
  'Africa/Johannesburg': [-26.2, 28.05],
  'Africa/Khartoum': [15.5, 32.56],
  'Africa/Kinshasa': [-4.32, 15.31],
  'Africa/Lagos': [6.52, 3.38],
  'Africa/Luanda': [-8.84, 13.23],
  'Africa/Maputo': [-25.97, 32.57],
  'Africa/Nairobi': [-1.29, 36.82],
  'Africa/Tripoli': [32.89, 13.19],
  'Africa/Tunis': [36.81, 10.18],
  'Africa/Windhoek': [-22.56, 17.06],

  'America/Anchorage': [61.22, -149.9],
  'America/Argentina/Buenos_Aires': [-34.6, -58.38],
  'America/Asuncion': [-25.26, -57.58],
  'America/Bogota': [4.71, -74.07],
  'America/Caracas': [10.48, -66.9],
  'America/Chicago': [41.88, -87.63],
  'America/Costa_Rica': [9.93, -84.08],
  'America/Denver': [39.74, -104.99],
  'America/Detroit': [42.33, -83.05],
  'America/Edmonton': [53.55, -113.49],
  'America/El_Salvador': [13.69, -89.19],
  'America/Fortaleza': [-3.73, -38.52],
  'America/Guatemala': [14.63, -90.51],
  'America/Guayaquil': [-2.17, -79.92],
  'America/Halifax': [44.65, -63.57],
  'America/Havana': [23.11, -82.37],
  'America/Indiana/Indianapolis': [39.77, -86.16],
  'America/Jamaica': [17.97, -76.79],
  'America/La_Paz': [-16.5, -68.15],
  'America/Lima': [-12.05, -77.04],
  'America/Los_Angeles': [34.05, -118.24],
  'America/Manaus': [-3.12, -60.02],
  'America/Mexico_City': [19.43, -99.13],
  'America/Monterrey': [25.69, -100.32],
  'America/Montevideo': [-34.9, -56.16],
  'America/Nassau': [25.06, -77.34],
  'America/New_York': [40.71, -74.01],
  'America/Panama': [8.98, -79.52],
  'America/Phoenix': [33.45, -112.07],
  'America/Port-au-Prince': [18.59, -72.31],
  'America/Puerto_Rico': [18.47, -66.11],
  'America/Regina': [50.45, -104.62],
  'America/Santiago': [-33.45, -70.67],
  'America/Santo_Domingo': [18.49, -69.93],
  'America/Sao_Paulo': [-23.55, -46.63],
  'America/St_Johns': [47.56, -52.71],
  'America/Tijuana': [32.51, -117.04],
  'America/Toronto': [43.65, -79.38],
  'America/Vancouver': [49.28, -123.12],
  'America/Winnipeg': [49.9, -97.14],

  'Antarctica/McMurdo': [-77.85, 166.67],

  // Svalbard. Barely populated, and in the table on purpose: it is the zone where
  // the piece's `open` state is unreachable for four months and its `shuttered`
  // one for four more. The fallback's 40°N would answer every polar question with
  // an ordinary temperate day, which is the wrong answer arriving quietly.
  'Arctic/Longyearbyen': [78.22, 15.63],

  'Asia/Almaty': [43.24, 76.89],
  'Asia/Amman': [31.95, 35.93],
  'Asia/Baghdad': [33.31, 44.37],
  'Asia/Baku': [40.41, 49.87],
  'Asia/Bangkok': [13.76, 100.5],
  'Asia/Beirut': [33.89, 35.5],
  'Asia/Colombo': [6.93, 79.86],
  'Asia/Damascus': [33.51, 36.28],
  'Asia/Dhaka': [23.81, 90.41],
  'Asia/Dubai': [25.2, 55.27],
  'Asia/Ho_Chi_Minh': [10.82, 106.63],
  'Asia/Hong_Kong': [22.32, 114.17],
  'Asia/Irkutsk': [52.29, 104.3],
  'Asia/Jakarta': [-6.21, 106.85],
  'Asia/Jerusalem': [31.77, 35.21],
  'Asia/Kabul': [34.56, 69.21],
  'Asia/Karachi': [24.86, 67.01],
  'Asia/Kathmandu': [27.72, 85.32],
  'Asia/Kolkata': [22.57, 88.36],
  'Asia/Krasnoyarsk': [56.02, 92.87],
  'Asia/Kuala_Lumpur': [3.14, 101.69],
  'Asia/Kuwait': [29.38, 47.99],
  'Asia/Manila': [14.6, 120.98],
  'Asia/Muscat': [23.59, 58.41],
  'Asia/Novosibirsk': [55.01, 82.94],
  'Asia/Phnom_Penh': [11.56, 104.92],
  'Asia/Qatar': [25.29, 51.53],
  'Asia/Riyadh': [24.71, 46.68],
  'Asia/Seoul': [37.57, 126.98],
  'Asia/Shanghai': [31.23, 121.47],
  'Asia/Singapore': [1.35, 103.82],
  'Asia/Taipei': [25.03, 121.57],
  'Asia/Tashkent': [41.3, 69.24],
  'Asia/Tbilisi': [41.72, 44.78],
  'Asia/Tehran': [35.69, 51.39],
  'Asia/Tokyo': [35.68, 139.65],
  'Asia/Ulaanbaatar': [47.89, 106.91],
  'Asia/Vientiane': [17.98, 102.63],
  'Asia/Vladivostok': [43.12, 131.89],
  'Asia/Yangon': [16.87, 96.2],
  'Asia/Yekaterinburg': [56.84, 60.61],
  'Asia/Yerevan': [40.18, 44.51],

  'Atlantic/Azores': [37.74, -25.68],
  'Atlantic/Canary': [28.1, -15.41],
  'Atlantic/Reykjavik': [64.15, -21.94],

  'Australia/Adelaide': [-34.93, 138.6],
  'Australia/Brisbane': [-27.47, 153.03],
  'Australia/Darwin': [-12.46, 130.84],
  'Australia/Hobart': [-42.88, 147.33],
  'Australia/Melbourne': [-37.81, 144.96],
  'Australia/Perth': [-31.95, 115.86],
  'Australia/Sydney': [-33.87, 151.21],

  'Europe/Amsterdam': [52.37, 4.9],
  'Europe/Athens': [37.98, 23.73],
  'Europe/Belgrade': [44.79, 20.45],
  'Europe/Berlin': [52.52, 13.4],
  'Europe/Brussels': [50.85, 4.35],
  'Europe/Bucharest': [44.43, 26.1],
  'Europe/Budapest': [47.5, 19.04],
  'Europe/Copenhagen': [55.68, 12.57],
  'Europe/Dublin': [53.35, -6.26],
  'Europe/Helsinki': [60.17, 24.94],
  'Europe/Istanbul': [41.01, 28.98],
  'Europe/Kyiv': [50.45, 30.52],
  'Europe/Lisbon': [38.72, -9.14],
  'Europe/London': [51.51, -0.13],
  'Europe/Madrid': [40.42, -3.7],
  'Europe/Minsk': [53.9, 27.57],
  'Europe/Moscow': [55.76, 37.62],
  'Europe/Oslo': [59.91, 10.75],
  'Europe/Paris': [48.86, 2.35],
  'Europe/Prague': [50.08, 14.44],
  'Europe/Riga': [56.95, 24.11],
  'Europe/Rome': [41.9, 12.5],
  'Europe/Sofia': [42.7, 23.32],
  'Europe/Stockholm': [59.33, 18.07],
  'Europe/Tallinn': [59.44, 24.75],
  'Europe/Vienna': [48.21, 16.37],
  'Europe/Vilnius': [54.69, 25.28],
  'Europe/Warsaw': [52.23, 21.01],
  'Europe/Zurich': [47.38, 8.54],

  'Indian/Maldives': [4.18, 73.51],
  'Indian/Mauritius': [-20.16, 57.5],

  'Pacific/Auckland': [-36.85, 174.76],
  'Pacific/Fiji': [-18.14, 178.44],
  'Pacific/Guam': [13.44, 144.79],
  'Pacific/Honolulu': [21.31, -157.86],
  'Pacific/Port_Moresby': [-9.44, 147.18],
  'Pacific/Tahiti': [-17.53, -149.57],
};

/**
 * The zone's offset from UTC at a given instant, in minutes east of Greenwich.
 *
 * Read from `Intl` rather than a table because offsets move: DST twice a year, and
 * the occasional government that reschedules a country. Returns 0 for a zone the
 * runtime does not recognise, which is the same answer as "we have no idea" and
 * lands the fallback on the prime meridian.
 */
export function utcOffsetMinutes(zone: string, at: Date): number {
  let name: string;
  try {
    name =
      new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
        .formatToParts(at)
        .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  } catch {
    // RangeError: the runtime does not know this zone.
    return 0;
  }

  // "GMT" on the nose for UTC itself; otherwise "GMT+05:30" / "GMT-03:00".
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
  if (match === null) {
    return 0;
  }

  const [, sign, hours, minutes] = match;
  const magnitude = Number(hours) * 60 + Number(minutes);
  return sign === '-' ? -magnitude : magnitude;
}

/**
 * Coordinates for a zone, with an honest flag on how they were arrived at.
 *
 * `at` matters only for the fallback path, where the zone's current UTC offset
 * stands in for its longitude — and that offset depends on the date.
 */
export function locationForZone(zone: string, at: Date): IZoneLocation {
  const known = ZONE_COORDINATES[zone];
  if (known !== undefined) {
    const [latitude, longitude] = known;
    return { latitude, longitude, precise: true };
  }

  // 15° of longitude per hour, so one degree per four minutes of offset. This is
  // where the zone's nominal meridian is, not where anybody stands: China spans
  // five of these bands and keeps one clock.
  //
  // Wrapped into [−180, 180) because offsets run past the date line — UTC+14 in
  // Kiritimati would otherwise come out as 210°E. The trigonometry downstream is
  // periodic and would not have noticed, which is exactly why it is fixed here
  // rather than left for something that reads the longitude to display it.
  // No offset exceeds ±14h, so `+ 540` is always positive and the modulo needs no
  // second correction for negative operands.
  const meridian = utcOffsetMinutes(zone, at) / 4;

  return {
    latitude: FALLBACK_LATITUDE,
    longitude: ((meridian + 540) % 360) - 180,
    precise: false,
  };
}
