/**
 * Every place a quest can count, once.
 *
 * Kept apart from `progress.data.ts` so the progress file can only name a
 * place that exists here: the ids are literal types, and a typo is a compile
 * error rather than a quest that can never be finished. No Angular imports, for
 * the same reason `projects.data.ts` has none.
 *
 * Each list is a decision, and the decision is written above it, because a
 * count on screen is only as honest as the definition behind it.
 */

/** Where a list's membership comes from, cited on the page beside its count. */
export interface ISource {
  readonly label: string;
  readonly url: string;
}

/** One place: a stable two-letter id and the name shown for it. */
export interface IPlace<Id extends string = string> {
  readonly id: Id;
  readonly name: string;
}

/**
 * The fifty states, by USPS code. DC and the territories are not states and are
 * not here; they are `BONUS`, which no quest requires.
 */
export const STATES = [
  { id: 'AL', name: 'Alabama' },
  { id: 'AK', name: 'Alaska' },
  { id: 'AZ', name: 'Arizona' },
  { id: 'AR', name: 'Arkansas' },
  { id: 'CA', name: 'California' },
  { id: 'CO', name: 'Colorado' },
  { id: 'CT', name: 'Connecticut' },
  { id: 'DE', name: 'Delaware' },
  { id: 'FL', name: 'Florida' },
  { id: 'GA', name: 'Georgia' },
  { id: 'HI', name: 'Hawaii' },
  { id: 'ID', name: 'Idaho' },
  { id: 'IL', name: 'Illinois' },
  { id: 'IN', name: 'Indiana' },
  { id: 'IA', name: 'Iowa' },
  { id: 'KS', name: 'Kansas' },
  { id: 'KY', name: 'Kentucky' },
  { id: 'LA', name: 'Louisiana' },
  { id: 'ME', name: 'Maine' },
  { id: 'MD', name: 'Maryland' },
  { id: 'MA', name: 'Massachusetts' },
  { id: 'MI', name: 'Michigan' },
  { id: 'MN', name: 'Minnesota' },
  { id: 'MS', name: 'Mississippi' },
  { id: 'MO', name: 'Missouri' },
  { id: 'MT', name: 'Montana' },
  { id: 'NE', name: 'Nebraska' },
  { id: 'NV', name: 'Nevada' },
  { id: 'NH', name: 'New Hampshire' },
  { id: 'NJ', name: 'New Jersey' },
  { id: 'NM', name: 'New Mexico' },
  { id: 'NY', name: 'New York' },
  { id: 'NC', name: 'North Carolina' },
  { id: 'ND', name: 'North Dakota' },
  { id: 'OH', name: 'Ohio' },
  { id: 'OK', name: 'Oklahoma' },
  { id: 'OR', name: 'Oregon' },
  { id: 'PA', name: 'Pennsylvania' },
  { id: 'RI', name: 'Rhode Island' },
  { id: 'SC', name: 'South Carolina' },
  { id: 'SD', name: 'South Dakota' },
  { id: 'TN', name: 'Tennessee' },
  { id: 'TX', name: 'Texas' },
  { id: 'UT', name: 'Utah' },
  { id: 'VT', name: 'Vermont' },
  { id: 'VA', name: 'Virginia' },
  { id: 'WA', name: 'Washington' },
  { id: 'WV', name: 'West Virginia' },
  { id: 'WI', name: 'Wisconsin' },
  { id: 'WY', name: 'Wyoming' },
] as const satisfies readonly IPlace[];

/**
 * The bonus category: the federal district and the five inhabited territories,
 * by USPS code. The uninhabited minor outlying islands are left out — most
 * cannot be visited without a federal permit, so counting them would make the
 * category a list of places nobody finishes.
 */
export const BONUS = [
  { id: 'DC', name: 'District of Columbia' },
  { id: 'PR', name: 'Puerto Rico' },
  { id: 'GU', name: 'Guam' },
  { id: 'VI', name: 'U.S. Virgin Islands' },
  { id: 'MP', name: 'Northern Mariana Islands' },
  { id: 'AS', name: 'American Samoa' },
] as const satisfies readonly IPlace[];

/**
 * The seven-continent model, the one taught in English-speaking schools. There
 * is no authority to cite for it — six- and five-continent models are equally
 * standard elsewhere — so it is stated as a choice rather than a fact. A
 * continent is marked on its own and never derived from countries: Antarctica
 * has none, and Russia, Türkiye, Egypt and Kazakhstan sit on two.
 */
export const CONTINENTS = [
  { id: 'AF', name: 'Africa' },
  { id: 'AN', name: 'Antarctica' },
  { id: 'AS', name: 'Asia' },
  { id: 'EU', name: 'Europe' },
  { id: 'NA', name: 'North America' },
  { id: 'OC', name: 'Oceania' },
  { id: 'SA', name: 'South America' },
] as const satisfies readonly IPlace[];

/**
 * The 193 UN member states, by ISO 3166-1 alpha-2 code — the code Natural
 * Earth's shapes carry, so a map can join on it — and named as the UN names
 * them, in the UN's order.
 */
export const UN_MEMBERS = [
  { id: 'AF', name: 'Afghanistan' },
  { id: 'AL', name: 'Albania' },
  { id: 'DZ', name: 'Algeria' },
  { id: 'AD', name: 'Andorra' },
  { id: 'AO', name: 'Angola' },
  { id: 'AG', name: 'Antigua and Barbuda' },
  { id: 'AR', name: 'Argentina' },
  { id: 'AM', name: 'Armenia' },
  { id: 'AU', name: 'Australia' },
  { id: 'AT', name: 'Austria' },
  { id: 'AZ', name: 'Azerbaijan' },
  { id: 'BS', name: 'Bahamas' },
  { id: 'BH', name: 'Bahrain' },
  { id: 'BD', name: 'Bangladesh' },
  { id: 'BB', name: 'Barbados' },
  { id: 'BY', name: 'Belarus' },
  { id: 'BE', name: 'Belgium' },
  { id: 'BZ', name: 'Belize' },
  { id: 'BJ', name: 'Benin' },
  { id: 'BT', name: 'Bhutan' },
  { id: 'BO', name: 'Bolivia (Plurinational State of)' },
  { id: 'BA', name: 'Bosnia and Herzegovina' },
  { id: 'BW', name: 'Botswana' },
  { id: 'BR', name: 'Brazil' },
  { id: 'BN', name: 'Brunei Darussalam' },
  { id: 'BG', name: 'Bulgaria' },
  { id: 'BF', name: 'Burkina Faso' },
  { id: 'BI', name: 'Burundi' },
  { id: 'CV', name: 'Cabo Verde' },
  { id: 'KH', name: 'Cambodia' },
  { id: 'CM', name: 'Cameroon' },
  { id: 'CA', name: 'Canada' },
  { id: 'CF', name: 'Central African Republic' },
  { id: 'TD', name: 'Chad' },
  { id: 'CL', name: 'Chile' },
  { id: 'CN', name: 'China' },
  { id: 'CO', name: 'Colombia' },
  { id: 'KM', name: 'Comoros' },
  { id: 'CG', name: 'Congo' },
  { id: 'CR', name: 'Costa Rica' },
  { id: 'CI', name: "Côte d'Ivoire" },
  { id: 'HR', name: 'Croatia' },
  { id: 'CU', name: 'Cuba' },
  { id: 'CY', name: 'Cyprus' },
  { id: 'CZ', name: 'Czechia' },
  { id: 'KP', name: "Democratic People's Republic of Korea" },
  { id: 'CD', name: 'Democratic Republic of the Congo' },
  { id: 'DK', name: 'Denmark' },
  { id: 'DJ', name: 'Djibouti' },
  { id: 'DM', name: 'Dominica' },
  { id: 'DO', name: 'Dominican Republic' },
  { id: 'EC', name: 'Ecuador' },
  { id: 'EG', name: 'Egypt' },
  { id: 'SV', name: 'El Salvador' },
  { id: 'GQ', name: 'Equatorial Guinea' },
  { id: 'ER', name: 'Eritrea' },
  { id: 'EE', name: 'Estonia' },
  { id: 'SZ', name: 'Eswatini' },
  { id: 'ET', name: 'Ethiopia' },
  { id: 'FJ', name: 'Fiji' },
  { id: 'FI', name: 'Finland' },
  { id: 'FR', name: 'France' },
  { id: 'GA', name: 'Gabon' },
  { id: 'GM', name: 'Gambia' },
  { id: 'GE', name: 'Georgia' },
  { id: 'DE', name: 'Germany' },
  { id: 'GH', name: 'Ghana' },
  { id: 'GR', name: 'Greece' },
  { id: 'GD', name: 'Grenada' },
  { id: 'GT', name: 'Guatemala' },
  { id: 'GN', name: 'Guinea' },
  { id: 'GW', name: 'Guinea-Bissau' },
  { id: 'GY', name: 'Guyana' },
  { id: 'HT', name: 'Haiti' },
  { id: 'HN', name: 'Honduras' },
  { id: 'HU', name: 'Hungary' },
  { id: 'IS', name: 'Iceland' },
  { id: 'IN', name: 'India' },
  { id: 'ID', name: 'Indonesia' },
  { id: 'IR', name: 'Iran (Islamic Republic of)' },
  { id: 'IQ', name: 'Iraq' },
  { id: 'IE', name: 'Ireland' },
  { id: 'IL', name: 'Israel' },
  { id: 'IT', name: 'Italy' },
  { id: 'JM', name: 'Jamaica' },
  { id: 'JP', name: 'Japan' },
  { id: 'JO', name: 'Jordan' },
  { id: 'KZ', name: 'Kazakhstan' },
  { id: 'KE', name: 'Kenya' },
  { id: 'KI', name: 'Kiribati' },
  { id: 'KW', name: 'Kuwait' },
  { id: 'KG', name: 'Kyrgyzstan' },
  { id: 'LA', name: "Lao People's Democratic Republic" },
  { id: 'LV', name: 'Latvia' },
  { id: 'LB', name: 'Lebanon' },
  { id: 'LS', name: 'Lesotho' },
  { id: 'LR', name: 'Liberia' },
  { id: 'LY', name: 'Libya' },
  { id: 'LI', name: 'Liechtenstein' },
  { id: 'LT', name: 'Lithuania' },
  { id: 'LU', name: 'Luxembourg' },
  { id: 'MG', name: 'Madagascar' },
  { id: 'MW', name: 'Malawi' },
  { id: 'MY', name: 'Malaysia' },
  { id: 'MV', name: 'Maldives' },
  { id: 'ML', name: 'Mali' },
  { id: 'MT', name: 'Malta' },
  { id: 'MH', name: 'Marshall Islands' },
  { id: 'MR', name: 'Mauritania' },
  { id: 'MU', name: 'Mauritius' },
  { id: 'MX', name: 'Mexico' },
  { id: 'FM', name: 'Micronesia (Federated States of)' },
  { id: 'MC', name: 'Monaco' },
  { id: 'MN', name: 'Mongolia' },
  { id: 'ME', name: 'Montenegro' },
  { id: 'MA', name: 'Morocco' },
  { id: 'MZ', name: 'Mozambique' },
  { id: 'MM', name: 'Myanmar' },
  { id: 'NA', name: 'Namibia' },
  { id: 'NR', name: 'Nauru' },
  { id: 'NP', name: 'Nepal' },
  { id: 'NL', name: 'Netherlands (Kingdom of the)' },
  { id: 'NZ', name: 'New Zealand' },
  { id: 'NI', name: 'Nicaragua' },
  { id: 'NE', name: 'Niger' },
  { id: 'NG', name: 'Nigeria' },
  { id: 'MK', name: 'North Macedonia' },
  { id: 'NO', name: 'Norway' },
  { id: 'OM', name: 'Oman' },
  { id: 'PK', name: 'Pakistan' },
  { id: 'PW', name: 'Palau' },
  { id: 'PA', name: 'Panama' },
  { id: 'PG', name: 'Papua New Guinea' },
  { id: 'PY', name: 'Paraguay' },
  { id: 'PE', name: 'Peru' },
  { id: 'PH', name: 'Philippines' },
  { id: 'PL', name: 'Poland' },
  { id: 'PT', name: 'Portugal' },
  { id: 'QA', name: 'Qatar' },
  { id: 'KR', name: 'Republic of Korea' },
  { id: 'MD', name: 'Republic of Moldova' },
  { id: 'RO', name: 'Romania' },
  { id: 'RU', name: 'Russian Federation' },
  { id: 'RW', name: 'Rwanda' },
  { id: 'KN', name: 'Saint Kitts and Nevis' },
  { id: 'LC', name: 'Saint Lucia' },
  { id: 'VC', name: 'Saint Vincent and the Grenadines' },
  { id: 'WS', name: 'Samoa' },
  { id: 'SM', name: 'San Marino' },
  { id: 'ST', name: 'Sao Tome and Principe' },
  { id: 'SA', name: 'Saudi Arabia' },
  { id: 'SN', name: 'Senegal' },
  { id: 'RS', name: 'Serbia' },
  { id: 'SC', name: 'Seychelles' },
  { id: 'SL', name: 'Sierra Leone' },
  { id: 'SG', name: 'Singapore' },
  { id: 'SK', name: 'Slovakia' },
  { id: 'SI', name: 'Slovenia' },
  { id: 'SB', name: 'Solomon Islands' },
  { id: 'SO', name: 'Somalia' },
  { id: 'ZA', name: 'South Africa' },
  { id: 'SS', name: 'South Sudan' },
  { id: 'ES', name: 'Spain' },
  { id: 'LK', name: 'Sri Lanka' },
  { id: 'SD', name: 'Sudan' },
  { id: 'SR', name: 'Suriname' },
  { id: 'SE', name: 'Sweden' },
  { id: 'CH', name: 'Switzerland' },
  { id: 'SY', name: 'Syrian Arab Republic' },
  { id: 'TJ', name: 'Tajikistan' },
  { id: 'TH', name: 'Thailand' },
  { id: 'TL', name: 'Timor-Leste' },
  { id: 'TG', name: 'Togo' },
  { id: 'TO', name: 'Tonga' },
  { id: 'TT', name: 'Trinidad and Tobago' },
  { id: 'TN', name: 'Tunisia' },
  { id: 'TR', name: 'Türkiye' },
  { id: 'TM', name: 'Turkmenistan' },
  { id: 'TV', name: 'Tuvalu' },
  { id: 'UG', name: 'Uganda' },
  { id: 'UA', name: 'Ukraine' },
  { id: 'AE', name: 'United Arab Emirates' },
  { id: 'GB', name: 'United Kingdom of Great Britain and Northern Ireland' },
  { id: 'TZ', name: 'United Republic of Tanzania' },
  { id: 'US', name: 'United States of America' },
  { id: 'UY', name: 'Uruguay' },
  { id: 'UZ', name: 'Uzbekistan' },
  { id: 'VU', name: 'Vanuatu' },
  { id: 'VE', name: 'Venezuela (Bolivarian Republic of)' },
  { id: 'VN', name: 'Viet Nam' },
  { id: 'YE', name: 'Yemen' },
  { id: 'ZM', name: 'Zambia' },
  { id: 'ZW', name: 'Zimbabwe' },
] as const satisfies readonly IPlace[];

/** The UN's two non-member observer states, which make 193 into 195. */
export const UN_OBSERVERS = [
  { id: 'VA', name: 'Holy See' },
  { id: 'PS', name: 'State of Palestine' },
] as const satisfies readonly IPlace[];

/** The countries quest: members and observers together, 195. */
export const COUNTRIES: ReadonlyArray<IPlace<CountryId>> = [...UN_MEMBERS, ...UN_OBSERVERS];

/** Cited beside the countries count, so 195 can be checked rather than trusted. */
export const COUNTRY_SOURCES: readonly ISource[] = [
  { label: 'UN member states', url: 'https://www.un.org/en/about-us/member-states' },
  { label: 'UN non-member states', url: 'https://www.un.org/en/about-us/non-member-states' },
];

export type StateId = (typeof STATES)[number]['id'];
export type BonusId = (typeof BONUS)[number]['id'];
export type ContinentId = (typeof CONTINENTS)[number]['id'];
export type CountryId = (typeof UN_MEMBERS)[number]['id'] | (typeof UN_OBSERVERS)[number]['id'];
