// ============================================================
// NOVA Core — BLS OEWS Labor Rates Import
// scripts/nova-core/bls_labor_rates.ts
//
// Uses BLS Occupational Employment & Wage Statistics (OEWS) API
// to pull prevailing wage rates for all construction SOC 47-xxxx
// trades across US metro areas. Maps to trade_ids, computes
// open_shop_rate, and upserts to labor_rates.
//
// The DOL SCA API (original source) was deprecated. BLS OEWS
// provides the same SOC-coded wage data at metro granularity.
//
// Env: BLS_API_KEY (optional, increases rate limits 25→500 req/day)
//      SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// Run: npx tsx scripts/nova-core/bls_labor_rates.ts
// ============================================================

import { createClient } from '@supabase/supabase-js';

// ── Config ──
const BLS_API_KEY = process.env.BLS_API_KEY || '';
const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BLS_API_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const BATCH_SIZE = 500;

// System org UUID for system-imported data (BLS seed data is cross-org)
const SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000000';

// State → climate zone mapping for seasonal adjustment lookups
const STATE_CLIMATE_ZONE: Record<string, string> = {
  // Northern
  AK: 'northern', CT: 'northern', IL: 'northern', IN: 'northern', IA: 'northern',
  ME: 'northern', MA: 'northern', MI: 'northern', MN: 'northern', NH: 'northern',
  NJ: 'northern', NY: 'northern', ND: 'northern', OH: 'northern', PA: 'northern',
  RI: 'northern', SD: 'northern', VT: 'northern', WI: 'northern',
  // Mountain
  CO: 'mountain', ID: 'mountain', MT: 'mountain', NV: 'mountain', NM: 'mountain',
  UT: 'mountain', WY: 'mountain',
  // Southern
  AL: 'southern', AR: 'southern', FL: 'southern', GA: 'southern', KY: 'southern',
  LA: 'southern', MS: 'southern', NC: 'southern', OK: 'southern', SC: 'southern',
  TN: 'southern', TX: 'southern', VA: 'southern', WV: 'southern',
  // Western
  AZ: 'western', CA: 'western', HI: 'western', OR: 'western', WA: 'western',
  // Central
  KS: 'central', MO: 'central', NE: 'central', DC: 'central', DE: 'central',
  MD: 'central', PR: 'southern',
};

// With key: 50 series/request, 500 requests/day
// Without key: 10 series/request, 25 requests/day
const SERIES_PER_REQUEST = BLS_API_KEY ? 50 : 10;
const REQUEST_DELAY_MS = BLS_API_KEY ? 500 : 2000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Supabase URL and service role key required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Types ──
interface TradeRow {
  id: string;
  code: string;
  soc_codes: string[];
  burden_multiplier: number;
  open_shop_ratio: number;
}

interface LaborRateRecord {
  org_id: string;
  trade_id: string;
  soc_code: string;
  county: string;
  state: string;
  metro_area: string;
  climate_zone: string;
  base_rate: number;
  burden_multiplier: number;
  open_shop_rate: number;
  source: string;
  data_vintage: string;
  is_active: boolean;
  created_at: string;
}

// ── All OEWS Metropolitan Statistical Area codes ──
// Format: 7-digit area code used in BLS series IDs
// Source: BLS OEWS area definitions (CBSA codes with leading zeros)
const METRO_AREAS: Record<string, { name: string; state: string }> = {
  '0010420': { name: 'Akron, OH', state: 'OH' },
  '0010580': { name: 'Albany-Schenectady-Troy, NY', state: 'NY' },
  '0010740': { name: 'Albuquerque, NM', state: 'NM' },
  '0010900': { name: 'Allentown-Bethlehem-Easton, PA-NJ', state: 'PA' },
  '0011700': { name: 'Asheville, NC', state: 'NC' },
  '0012060': { name: 'Atlanta-Sandy Springs-Roswell, GA', state: 'GA' },
  '0012260': { name: 'Augusta-Richmond County, GA-SC', state: 'GA' },
  '0012420': { name: 'Austin-Round Rock, TX', state: 'TX' },
  '0012540': { name: 'Bakersfield, CA', state: 'CA' },
  '0012580': { name: 'Baltimore-Columbia-Towson, MD', state: 'MD' },
  '0012940': { name: 'Baton Rouge, LA', state: 'LA' },
  '0013140': { name: 'Beaumont-Port Arthur, TX', state: 'TX' },
  '0013780': { name: 'Binghamton, NY', state: 'NY' },
  '0013820': { name: 'Birmingham-Hoover, AL', state: 'AL' },
  '0014260': { name: 'Boise City, ID', state: 'ID' },
  '0014460': { name: 'Boston-Cambridge-Nashua, MA-NH', state: 'MA' },
  '0014860': { name: 'Bridgeport-Stamford-Norwalk, CT', state: 'CT' },
  '0015180': { name: 'Brownsville-Harlingen, TX', state: 'TX' },
  '0015380': { name: 'Buffalo-Cheektowaga-Niagara Falls, NY', state: 'NY' },
  '0015940': { name: 'Canton-Massillon, OH', state: 'OH' },
  '0015980': { name: 'Cape Coral-Fort Myers, FL', state: 'FL' },
  '0016580': { name: 'Champaign-Urbana, IL', state: 'IL' },
  '0016700': { name: 'Charleston-North Charleston, SC', state: 'SC' },
  '0016740': { name: 'Charlotte-Concord-Gastonia, NC-SC', state: 'NC' },
  '0016860': { name: 'Chattanooga, TN-GA', state: 'TN' },
  '0016980': { name: 'Chicago-Naperville-Elgin, IL-IN-WI', state: 'IL' },
  '0017140': { name: 'Cincinnati, OH-KY-IN', state: 'OH' },
  '0017460': { name: 'Cleveland-Elyria, OH', state: 'OH' },
  '0017660': { name: 'Coeur d\'Alene, ID', state: 'ID' },
  '0017780': { name: 'College Station-Bryan, TX', state: 'TX' },
  '0017820': { name: 'Colorado Springs, CO', state: 'CO' },
  '0017860': { name: 'Columbia, MO', state: 'MO' },
  '0017900': { name: 'Columbia, SC', state: 'SC' },
  '0018140': { name: 'Columbus, OH', state: 'OH' },
  '0018580': { name: 'Corpus Christi, TX', state: 'TX' },
  '0019100': { name: 'Dallas-Fort Worth-Arlington, TX', state: 'TX' },
  '0019340': { name: 'Davenport-Moline-Rock Island, IA-IL', state: 'IA' },
  '0019380': { name: 'Dayton, OH', state: 'OH' },
  '0019660': { name: 'Deltona-Daytona Beach-Ormond Beach, FL', state: 'FL' },
  '0019740': { name: 'Denver-Aurora-Lakewood, CO', state: 'CO' },
  '0019780': { name: 'Des Moines-West Des Moines, IA', state: 'IA' },
  '0019820': { name: 'Detroit-Warren-Dearborn, MI', state: 'MI' },
  '0020500': { name: 'Durham-Chapel Hill, NC', state: 'NC' },
  '0021340': { name: 'El Paso, TX', state: 'TX' },
  '0021500': { name: 'Erie, PA', state: 'PA' },
  '0021660': { name: 'Eugene, OR', state: 'OR' },
  '0022180': { name: 'Fayetteville, NC', state: 'NC' },
  '0022220': { name: 'Fayetteville-Springdale-Rogers, AR-MO', state: 'AR' },
  '0023060': { name: 'Fort Wayne, IN', state: 'IN' },
  '0023420': { name: 'Fresno, CA', state: 'CA' },
  '0023540': { name: 'Gainesville, FL', state: 'FL' },
  '0024340': { name: 'Grand Rapids-Wyoming, MI', state: 'MI' },
  '0024660': { name: 'Greensboro-High Point, NC', state: 'NC' },
  '0024860': { name: 'Greenville-Anderson-Mauldin, SC', state: 'SC' },
  '0025420': { name: 'Harrisburg-Carlisle, PA', state: 'PA' },
  '0025540': { name: 'Hartford-West Hartford-East Hartford, CT', state: 'CT' },
  '0026420': { name: 'Houston-The Woodlands-Sugar Land, TX', state: 'TX' },
  '0026620': { name: 'Huntsville, AL', state: 'AL' },
  '0026900': { name: 'Indianapolis-Carmel-Anderson, IN', state: 'IN' },
  '0027140': { name: 'Jackson, MS', state: 'MS' },
  '0027260': { name: 'Jacksonville, FL', state: 'FL' },
  '0027740': { name: 'Johnson City, TN', state: 'TN' },
  '0028140': { name: 'Kansas City, MO-KS', state: 'MO' },
  '0028660': { name: 'Killeen-Temple, TX', state: 'TX' },
  '0028700': { name: 'Kingsport-Bristol-Bristol, TN-VA', state: 'TN' },
  '0028940': { name: 'Knoxville, TN', state: 'TN' },
  '0029460': { name: 'Lakeland-Winter Haven, FL', state: 'FL' },
  '0029540': { name: 'Lancaster, PA', state: 'PA' },
  '0029620': { name: 'Lansing-East Lansing, MI', state: 'MI' },
  '0029820': { name: 'Las Vegas-Henderson-Paradise, NV', state: 'NV' },
  '0030460': { name: 'Lexington-Fayette, KY', state: 'KY' },
  '0030780': { name: 'Little Rock-North Little Rock-Conway, AR', state: 'AR' },
  '0031080': { name: 'Los Angeles-Long Beach-Anaheim, CA', state: 'CA' },
  '0031140': { name: 'Louisville/Jefferson County, KY-IN', state: 'KY' },
  '0031180': { name: 'Lubbock, TX', state: 'TX' },
  '0031460': { name: 'Madera, CA', state: 'CA' },
  '0031540': { name: 'Madison, WI', state: 'WI' },
  '0032580': { name: 'McAllen-Edinburg-Mission, TX', state: 'TX' },
  '0032820': { name: 'Memphis, TN-MS-AR', state: 'TN' },
  '0033100': { name: 'Miami-Fort Lauderdale-West Palm Beach, FL', state: 'FL' },
  '0033340': { name: 'Milwaukee-Waukesha-West Allis, WI', state: 'WI' },
  '0033460': { name: 'Minneapolis-St. Paul-Bloomington, MN-WI', state: 'MN' },
  '0033660': { name: 'Mobile, AL', state: 'AL' },
  '0033700': { name: 'Modesto, CA', state: 'CA' },
  '0034820': { name: 'Myrtle Beach-Conway-North Myrtle Beach, SC-NC', state: 'SC' },
  '0034980': { name: 'Nashville-Davidson-Murfreesboro-Franklin, TN', state: 'TN' },
  '0035004': { name: 'Nassau County-Suffolk County, NY', state: 'NY' },
  '0035084': { name: 'Newark, NJ-PA', state: 'NJ' },
  '0035300': { name: 'New Haven-Milford, CT', state: 'CT' },
  '0035380': { name: 'New Orleans-Metairie, LA', state: 'LA' },
  '0035614': { name: 'New York-Jersey City-White Plains, NY-NJ', state: 'NY' },
  '0035840': { name: 'North Port-Sarasota-Bradenton, FL', state: 'FL' },
  '0036100': { name: 'Ocala, FL', state: 'FL' },
  '0036260': { name: 'Ogden-Clearfield, UT', state: 'UT' },
  '0036420': { name: 'Oklahoma City, OK', state: 'OK' },
  '0036540': { name: 'Omaha-Council Bluffs, NE-IA', state: 'NE' },
  '0036740': { name: 'Orlando-Kissimmee-Sanford, FL', state: 'FL' },
  '0036780': { name: 'Oshkosh-Neenah, WI', state: 'WI' },
  '0037100': { name: 'Oxnard-Thousand Oaks-Ventura, CA', state: 'CA' },
  '0037340': { name: 'Palm Bay-Melbourne-Titusville, FL', state: 'FL' },
  '0037860': { name: 'Pensacola-Ferry Pass-Brent, FL', state: 'FL' },
  '0037980': { name: 'Philadelphia-Camden-Wilmington, PA-NJ-DE-MD', state: 'PA' },
  '0038060': { name: 'Phoenix-Mesa-Scottsdale, AZ', state: 'AZ' },
  '0038300': { name: 'Pittsburgh, PA', state: 'PA' },
  '0038900': { name: 'Portland-Vancouver-Hillsboro, OR-WA', state: 'OR' },
  '0038940': { name: 'Port St. Lucie, FL', state: 'FL' },
  '0039100': { name: 'Poughkeepsie-Newburgh-Middletown, NY', state: 'NY' },
  '0039300': { name: 'Providence-Warwick, RI-MA', state: 'RI' },
  '0039340': { name: 'Provo-Orem, UT', state: 'UT' },
  '0039580': { name: 'Raleigh, NC', state: 'NC' },
  '0039740': { name: 'Reading, PA', state: 'PA' },
  '0039900': { name: 'Reno, NV', state: 'NV' },
  '0040060': { name: 'Richmond, VA', state: 'VA' },
  '0040140': { name: 'Riverside-San Bernardino-Ontario, CA', state: 'CA' },
  '0040380': { name: 'Rochester, NY', state: 'NY' },
  '0040420': { name: 'Rockford, IL', state: 'IL' },
  '0040900': { name: 'Sacramento-Roseville-Arden-Arcade, CA', state: 'CA' },
  '0041060': { name: 'St. Louis, MO-IL', state: 'MO' },
  '0041180': { name: 'St. Louis, MO-IL', state: 'MO' },
  '0041420': { name: 'Salem, OR', state: 'OR' },
  '0041620': { name: 'Salt Lake City, UT', state: 'UT' },
  '0041700': { name: 'San Antonio-New Braunfels, TX', state: 'TX' },
  '0041740': { name: 'San Diego-Carlsbad, CA', state: 'CA' },
  '0041860': { name: 'San Francisco-Oakland-Hayward, CA', state: 'CA' },
  '0041940': { name: 'San Jose-Sunnyvale-Santa Clara, CA', state: 'CA' },
  '0042020': { name: 'San Luis Obispo-Paso Robles-Arroyo Grande, CA', state: 'CA' },
  '0042100': { name: 'Santa Cruz-Watsonville, CA', state: 'CA' },
  '0042140': { name: 'Santa Maria-Santa Barbara, CA', state: 'CA' },
  '0042200': { name: 'Santa Rosa, CA', state: 'CA' },
  '0042260': { name: 'Savannah, GA', state: 'GA' },
  '0042340': { name: 'Scranton-Wilkes-Barre-Hazleton, PA', state: 'PA' },
  '0042660': { name: 'Seattle-Tacoma-Bellevue, WA', state: 'WA' },
  '0043340': { name: 'Shreveport-Bossier City, LA', state: 'LA' },
  '0043580': { name: 'Sioux Falls, SD', state: 'SD' },
  '0043780': { name: 'South Bend-Mishawaka, IN-MI', state: 'IN' },
  '0044060': { name: 'Spokane-Spokane Valley, WA', state: 'WA' },
  '0044140': { name: 'Springfield, MA', state: 'MA' },
  '0044180': { name: 'Springfield, MO', state: 'MO' },
  '0044700': { name: 'Stockton-Lodi, CA', state: 'CA' },
  '0045060': { name: 'Syracuse, NY', state: 'NY' },
  '0045104': { name: 'Tacoma-Lakewood, WA', state: 'WA' },
  '0045300': { name: 'Tampa-St. Petersburg-Clearwater, FL', state: 'FL' },
  '0045780': { name: 'Toledo, OH', state: 'OH' },
  '0046060': { name: 'Tucson, AZ', state: 'AZ' },
  '0046140': { name: 'Tulsa, OK', state: 'OK' },
  '0046520': { name: 'Urban Honolulu, HI', state: 'HI' },
  '0046700': { name: 'Vallejo-Fairfield, CA', state: 'CA' },
  '0047260': { name: 'Virginia Beach-Norfolk-Newport News, VA-NC', state: 'VA' },
  '0047580': { name: 'Warner Robins, GA', state: 'GA' },
  '0047900': { name: 'Washington-Arlington-Alexandria, DC-VA-MD-WV', state: 'DC' },
  '0048620': { name: 'Wichita, KS', state: 'KS' },
  '0049180': { name: 'Winston-Salem, NC', state: 'NC' },
  '0049340': { name: 'Worcester, MA-CT', state: 'MA' },
  '0049620': { name: 'York-Hanover, PA', state: 'PA' },
  '0049660': { name: 'Youngstown-Warren-Boardman, OH-PA', state: 'OH' },
  // Additional metros for coverage
  '0011100': { name: 'Amarillo, TX', state: 'TX' },
  '0011260': { name: 'Anchorage, AK', state: 'AK' },
  '0011460': { name: 'Ann Arbor, MI', state: 'MI' },
  '0012020': { name: 'Athens-Clarke County, GA', state: 'GA' },
  '0012700': { name: 'Barnstable Town, MA', state: 'MA' },
  '0013900': { name: 'Bismarck, ND', state: 'ND' },
  '0014500': { name: 'Boulder, CO', state: 'CO' },
  '0014740': { name: 'Bremerton-Silverdale, WA', state: 'WA' },
  '0015764': { name: 'Camden, NJ', state: 'NJ' },
  '0015804': { name: 'Anaheim-Santa Ana-Irvine, CA', state: 'CA' },
  '0016020': { name: 'Cape Girardeau, MO-IL', state: 'MO' },
  '0016060': { name: 'Carbondale-Marion, IL', state: 'IL' },
  '0016180': { name: 'Carson City, NV', state: 'NV' },
  '0016300': { name: 'Cedar Rapids, IA', state: 'IA' },
  '0017020': { name: 'Chico, CA', state: 'CA' },
  '0017420': { name: 'Clarksville, TN-KY', state: 'TN' },
  '0017900': { name: 'Columbia, SC', state: 'SC' },
  '0017980': { name: 'Columbus, GA-AL', state: 'GA' },
  '0018580': { name: 'Corpus Christi, TX', state: 'TX' },
  '0019060': { name: 'Cumberland, MD-WV', state: 'MD' },
  '0019180': { name: 'Danville, IL', state: 'IL' },
  '0019460': { name: 'Decatur, AL', state: 'AL' },
  '0019500': { name: 'Decatur, IL', state: 'IL' },
  '0020100': { name: 'Dover, DE', state: 'DE' },
  '0020220': { name: 'Dubuque, IA', state: 'IA' },
  '0020460': { name: 'Duluth, MN-WI', state: 'MN' },
  '0020700': { name: 'East Stroudsburg, PA', state: 'PA' },
  '0020740': { name: 'Eau Claire, WI', state: 'WI' },
  '0020940': { name: 'El Centro, CA', state: 'CA' },
  '0021060': { name: 'Elizabethtown-Fort Knox, KY', state: 'KY' },
  '0021140': { name: 'Elkhart-Goshen, IN', state: 'IN' },
  '0021300': { name: 'Elmira, NY', state: 'NY' },
  '0021780': { name: 'Evansville, IN-KY', state: 'IN' },
  '0022020': { name: 'Fargo, ND-MN', state: 'ND' },
  '0022380': { name: 'Flagstaff, AZ', state: 'AZ' },
  '0022660': { name: 'Fort Collins, CO', state: 'CO' },
  '0022900': { name: 'Fort Smith, AR-OK', state: 'AR' },
  '0023104': { name: 'Fort Worth-Arlington, TX', state: 'TX' },
  '0023580': { name: 'Gainesville, GA', state: 'GA' },
  '0023844': { name: 'Gary, IN', state: 'IN' },
  '0024020': { name: 'Glens Falls, NY', state: 'NY' },
  '0024220': { name: 'Grand Junction, CO', state: 'CO' },
  '0024300': { name: 'Grand Rapids-Wyoming, MI', state: 'MI' },
  '0024500': { name: 'Great Falls, MT', state: 'MT' },
  '0024580': { name: 'Green Bay, WI', state: 'WI' },
  '0025060': { name: 'Gulfport-Biloxi-Pascagoula, MS', state: 'MS' },
  '0025180': { name: 'Hagerstown-Martinsburg, MD-WV', state: 'MD' },
  '0025260': { name: 'Hanford-Corcoran, CA', state: 'CA' },
  '0025620': { name: 'Hattiesburg, MS', state: 'MS' },
  '0025860': { name: 'Hickory-Lenoir-Morganton, NC', state: 'NC' },
  '0025940': { name: 'Hilton Head Island-Bluffton-Beaufort, SC', state: 'SC' },
  '0026140': { name: 'Homosassa Springs, FL', state: 'FL' },
  '0026300': { name: 'Hot Springs, AR', state: 'AR' },
  '0026380': { name: 'Houma-Thibodaux, LA', state: 'LA' },
  '0026580': { name: 'Huntington-Ashland, WV-KY-OH', state: 'WV' },
  '0026820': { name: 'Idaho Falls, ID', state: 'ID' },
  '0027060': { name: 'Ithaca, NY', state: 'NY' },
  '0027180': { name: 'Jackson, TN', state: 'TN' },
  '0027340': { name: 'Jacksonville, NC', state: 'NC' },
  '0027500': { name: 'Janesville-Beloit, WI', state: 'WI' },
  '0027620': { name: 'Jefferson City, MO', state: 'MO' },
  '0027860': { name: 'Jonesboro, AR', state: 'AR' },
  '0027900': { name: 'Joplin, MO', state: 'MO' },
  '0028020': { name: 'Kalamazoo-Portage, MI', state: 'MI' },
  '0028100': { name: 'Kankakee, IL', state: 'IL' },
  '0028420': { name: 'Kennewick-Richland, WA', state: 'WA' },
  '0029100': { name: 'La Crosse-Onalaska, WI-MN', state: 'WI' },
  '0029180': { name: 'Lafayette, LA', state: 'LA' },
  '0029200': { name: 'Lafayette-West Lafayette, IN', state: 'IN' },
  '0029340': { name: 'Lake Charles, LA', state: 'LA' },
  '0029700': { name: 'Laredo, TX', state: 'TX' },
  '0029740': { name: 'Las Cruces, NM', state: 'NM' },
  '0029940': { name: 'Lawrence, KS', state: 'KS' },
  '0030020': { name: 'Lawton, OK', state: 'OK' },
  '0030140': { name: 'Lebanon, PA', state: 'PA' },
  '0030300': { name: 'Lewiston-Auburn, ME', state: 'ME' },
  '0030620': { name: 'Lima, OH', state: 'OH' },
  '0030700': { name: 'Lincoln, NE', state: 'NE' },
  '0030860': { name: 'Logan, UT-ID', state: 'UT' },
  '0030980': { name: 'Longview, TX', state: 'TX' },
  '0031340': { name: 'Lynchburg, VA', state: 'VA' },
  '0031420': { name: 'Macon, GA', state: 'GA' },
  '0031700': { name: 'Manchester-Nashua, NH', state: 'NH' },
  '0031900': { name: 'Mansfield, OH', state: 'OH' },
  '0032420': { name: 'Mayaguez, PR', state: 'PR' },
  '0032780': { name: 'Medford, OR', state: 'OR' },
  '0032900': { name: 'Merced, CA', state: 'CA' },
  '0033124': { name: 'Fort Lauderdale-Pompano Beach, FL', state: 'FL' },
  '0033260': { name: 'Midland, TX', state: 'TX' },
  '0033540': { name: 'Missoula, MT', state: 'MT' },
  '0033740': { name: 'Monroe, LA', state: 'LA' },
  '0033780': { name: 'Monroe, MI', state: 'MI' },
  '0033860': { name: 'Montgomery, AL', state: 'AL' },
  '0034060': { name: 'Morgantown, WV', state: 'WV' },
  '0034580': { name: 'Mount Vernon-Anacortes, WA', state: 'WA' },
  '0034740': { name: 'Muskegon, MI', state: 'MI' },
  '0034900': { name: 'Napa, CA', state: 'CA' },
  '0035100': { name: 'New Bern, NC', state: 'NC' },
  '0035620': { name: 'New York-Newark-Jersey City, NY-NJ-PA', state: 'NY' },
  '0035980': { name: 'Norwich-New London, CT', state: 'CT' },
  '0036084': { name: 'Oakland-Hayward-Berkeley, CA', state: 'CA' },
  '0036220': { name: 'Odessa, TX', state: 'TX' },
  '0036420': { name: 'Oklahoma City, OK', state: 'OK' },
  '0036500': { name: 'Olympia-Tumwater, WA', state: 'WA' },
  '0036620': { name: 'Ontario-San Bernardino-Riverside, CA', state: 'CA' },
  '0037460': { name: 'Panama City, FL', state: 'FL' },
  '0037620': { name: 'Parkersburg-Vienna, WV', state: 'WV' },
  '0037764': { name: 'Peabody-Salem-Beverly, MA', state: 'MA' },
  '0037900': { name: 'Peoria, IL', state: 'IL' },
  '0038340': { name: 'Pittsfield, MA', state: 'MA' },
  '0038860': { name: 'Portland-South Portland, ME', state: 'ME' },
  '0039380': { name: 'Pueblo, CO', state: 'CO' },
  '0039460': { name: 'Punta Gorda, FL', state: 'FL' },
  '0039540': { name: 'Racine, WI', state: 'WI' },
  '0039660': { name: 'Rapid City, SD', state: 'SD' },
  '0040220': { name: 'Roanoke, VA', state: 'VA' },
  '0040580': { name: 'Rocky Mount, NC', state: 'NC' },
  '0040980': { name: 'Saginaw, MI', state: 'MI' },
  '0041100': { name: 'St. Cloud, MN', state: 'MN' },
  '0041500': { name: 'Salinas, CA', state: 'CA' },
  '0041540': { name: 'Salisbury, MD-DE', state: 'MD' },
  '0041660': { name: 'San Angelo, TX', state: 'TX' },
  '0042540': { name: 'Scranton-Wilkes-Barre, PA', state: 'PA' },
  '0042644': { name: 'Seattle-Bellevue-Everett, WA', state: 'WA' },
  '0043100': { name: 'Sheboygan, WI', state: 'WI' },
  '0043300': { name: 'Sherman-Denison, TX', state: 'TX' },
  '0043620': { name: 'Sioux City, IA-NE-SD', state: 'IA' },
  '0043900': { name: 'Spartanburg, SC', state: 'SC' },
  '0044100': { name: 'Springfield, IL', state: 'IL' },
  '0044220': { name: 'Springfield, OH', state: 'OH' },
  '0044300': { name: 'State College, PA', state: 'PA' },
  '0044420': { name: 'Staunton-Waynesboro, VA', state: 'VA' },
  '0044940': { name: 'Sumter, SC', state: 'SC' },
  '0045220': { name: 'Tallahassee, FL', state: 'FL' },
  '0045460': { name: 'Terre Haute, IN', state: 'IN' },
  '0045540': { name: 'Texarkana, TX-AR', state: 'TX' },
  '0045820': { name: 'Topeka, KS', state: 'KS' },
  '0045940': { name: 'Trenton, NJ', state: 'NJ' },
  '0046220': { name: 'Tuscaloosa, AL', state: 'AL' },
  '0046340': { name: 'Tyler, TX', state: 'TX' },
  '0046540': { name: 'Utica-Rome, NY', state: 'NY' },
  '0046660': { name: 'Valdosta, GA', state: 'GA' },
  '0047020': { name: 'Victoria, TX', state: 'TX' },
  '0047220': { name: 'Vineland-Bridgeton, NJ', state: 'NJ' },
  '0047300': { name: 'Visalia-Porterville, CA', state: 'CA' },
  '0047380': { name: 'Waco, TX', state: 'TX' },
  '0047940': { name: 'Waterloo-Cedar Falls, IA', state: 'IA' },
  '0048060': { name: 'Watertown-Fort Drum, NY', state: 'NY' },
  '0048140': { name: 'Wausau, WI', state: 'WI' },
  '0048260': { name: 'Weirton-Steubenville, WV-OH', state: 'WV' },
  '0048300': { name: 'Wenatchee, WA', state: 'WA' },
  '0048424': { name: 'West Palm Beach-Boca Raton, FL', state: 'FL' },
  '0048540': { name: 'Wheeling, WV-OH', state: 'WV' },
  '0048660': { name: 'Wichita Falls, TX', state: 'TX' },
  '0048700': { name: 'Williamsport, PA', state: 'PA' },
  '0048900': { name: 'Wilmington, NC', state: 'NC' },
  '0049020': { name: 'Winchester, VA-WV', state: 'VA' },
  '0049420': { name: 'Yakima, WA', state: 'WA' },
};

// ── Build BLS series IDs ──
// Format: OEUM + area(7) + industry(6, 000000=all) + occupation(6, no dash) + datatype(2, 03=mean hourly)
function buildSeriesId(areaCode: string, socCode: string): string {
  const occ = socCode.replace('-', '');
  return `OEUM${areaCode}000000${occ}03`;
}

// ── SOC code to trade mapping ──
async function buildSocTradeMap(): Promise<Map<string, TradeRow[]>> {
  const { data: trades, error } = await supabase
    .from('trades')
    .select('id, code, soc_codes, burden_multiplier, open_shop_ratio');

  if (error) throw new Error(`Failed to fetch trades: ${error.message}`);
  if (!trades || trades.length === 0) throw new Error('No trades found. Run seed data first.');

  // Map SOC → array of trades (multiple trades can share a SOC code)
  const socMap = new Map<string, TradeRow[]>();
  for (const trade of trades) {
    for (const soc of trade.soc_codes) {
      const existing = socMap.get(soc) || [];
      existing.push(trade as TradeRow);
      socMap.set(soc, existing);
    }
  }

  const uniqueSocs = socMap.size;
  console.log(`Loaded ${trades.length} trades, mapped to ${uniqueSocs} unique SOC codes.`);
  return socMap;
}

// ── Fetch BLS wage data ──
async function fetchBlsSeries(seriesIds: string[]): Promise<Map<string, number>> {
  const body: any = {
    seriesid: seriesIds,
    startyear: '2024',
    endyear: '2024',
  };

  if (BLS_API_KEY) {
    body.registrationkey = BLS_API_KEY;
  }

  const res = await fetch(BLS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`BLS API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  if (json.status !== 'REQUEST_SUCCEEDED') {
    const msgs = json.message?.join('; ') || 'Unknown error';
    throw new Error(`BLS API failed: ${msgs}`);
  }

  const results = new Map<string, number>();
  for (const series of json.Results?.series || []) {
    const sid = series.seriesID;
    // Get most recent annual value
    const latestData = series.data?.[0];
    if (latestData?.value) {
      const rate = parseFloat(latestData.value);
      if (rate > 0) {
        results.set(sid, rate);
      }
    }
  }

  return results;
}

// ── Main import ──
async function main() {
  console.log('NOVA Core — BLS OEWS Labor Rates Import');
  console.log('========================================');
  console.log(`API key: ${BLS_API_KEY ? 'provided (500 req/day limit)' : 'none (25 req/day limit)'}`);
  console.log(`Series per request: ${SERIES_PER_REQUEST}`);
  console.log('');

  const socMap = await buildSocTradeMap();
  const uniqueSocs = Array.from(socMap.keys());
  const areaEntries = Object.entries(METRO_AREAS);

  console.log(`Metro areas: ${areaEntries.length}`);
  console.log(`SOC codes: ${uniqueSocs.length}`);
  console.log(`Total series to fetch: ${areaEntries.length * uniqueSocs.length}`);
  console.log('');

  // Build all series IDs with metadata
  interface SeriesMeta {
    seriesId: string;
    areaCode: string;
    socCode: string;
    metroName: string;
    state: string;
  }

  const allSeries: SeriesMeta[] = [];
  for (const [areaCode, metro] of areaEntries) {
    for (const soc of uniqueSocs) {
      allSeries.push({
        seriesId: buildSeriesId(areaCode, soc),
        areaCode,
        socCode: soc,
        metroName: metro.name,
        state: metro.state,
      });
    }
  }

  // Chunk into batches for API calls
  const chunks: SeriesMeta[][] = [];
  for (let i = 0; i < allSeries.length; i += SERIES_PER_REQUEST) {
    chunks.push(allSeries.slice(i, i + SERIES_PER_REQUEST));
  }

  console.log(`API requests needed: ${chunks.length}`);
  console.log('');

  let totalFetched = 0;
  let totalImported = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let requestCount = 0;
  const dbBatch: LaborRateRecord[] = [];
  const now = new Date().toISOString();

  for (const chunk of chunks) {
    requestCount++;
    const seriesIds = chunk.map(s => s.seriesId);

    if (requestCount % 10 === 0 || requestCount === 1) {
      console.log(`Request ${requestCount}/${chunks.length} (${totalImported} imported so far)...`);
    }

    let results: Map<string, number>;
    try {
      results = await fetchBlsSeries(seriesIds);
    } catch (err: any) {
      if (err.message.includes('threshold') || err.message.includes('limit')) {
        console.error(`Rate limit hit at request ${requestCount}. Stopping.`);
        console.error(`  Imported ${totalImported} records so far.`);
        break;
      }
      console.error(`Request ${requestCount} failed: ${err.message}`);
      await sleep(REQUEST_DELAY_MS * 2);
      // Retry once
      try {
        results = await fetchBlsSeries(seriesIds);
      } catch (retryErr: any) {
        console.error(`Retry failed: ${retryErr.message}. Skipping batch.`);
        totalSkipped += chunk.length;
        continue;
      }
    }

    totalFetched += chunk.length;

    // Map BLS results to labor rate records
    for (const meta of chunk) {
      const baseRate = results.get(meta.seriesId);
      if (!baseRate) {
        totalSkipped++;
        continue;
      }

      // Get all trades that use this SOC code
      const trades = socMap.get(meta.socCode) || [];
      for (const trade of trades) {
        dbBatch.push({
          org_id: SYSTEM_ORG_ID,
          trade_id: trade.id,
          soc_code: meta.socCode,
          county: '',
          state: meta.state,
          metro_area: meta.metroName,
          climate_zone: STATE_CLIMATE_ZONE[meta.state] || 'central',
          base_rate: baseRate,
          burden_multiplier: trade.burden_multiplier,
          open_shop_rate: parseFloat((baseRate * trade.open_shop_ratio).toFixed(2)),
          source: 'bls_oews',
          data_vintage: '2024',
          is_active: true,
          created_at: now,
        });
      }
    }

    // Flush to Supabase when batch is full
    if (dbBatch.length >= BATCH_SIZE) {
      const result = await flushBatch(dbBatch.splice(0, BATCH_SIZE));
      totalImported += result.imported;
      totalFailed += result.failed;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  // Flush remaining
  if (dbBatch.length > 0) {
    const result = await flushBatch(dbBatch);
    totalImported += result.imported;
    totalFailed += result.failed;
  }

  console.log('\n========================================');
  console.log('Import complete.');
  console.log(`  Series queried: ${totalFetched}`);
  console.log(`  Records imported: ${totalImported}`);
  console.log(`  Skipped (no data): ${totalSkipped}`);
  console.log(`  Failed: ${totalFailed}`);
}

async function flushBatch(batch: LaborRateRecord[]): Promise<{ imported: number; failed: number }> {
  const { error } = await supabase
    .from('labor_rates')
    .upsert(batch, { onConflict: 'trade_id,soc_code,metro_area,state' });

  if (error) {
    console.error(`Batch upsert error (${batch.length} records): ${error.message}`);
    return { imported: 0, failed: batch.length };
  }

  return { imported: batch.length, failed: 0 };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
