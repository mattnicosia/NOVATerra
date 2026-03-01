// City Cost Index (CCI) — location-based pricing factors
// Based on RSMeans City Cost Index methodology
// National average = 1.00 for each trade (material, labor, equipment)
// Updated: 2025 data

// ─── Metro Areas ───────────────────────────────────────────────
// ~70 metro areas with per-trade multipliers
export const METRO_AREAS = [
  // Northeast
  { id: "nyc",          label: "New York, NY",            mat: 1.10, lab: 1.48, equip: 1.05 },
  { id: "long-island",  label: "Long Island, NY",         mat: 1.09, lab: 1.50, equip: 1.04 },
  { id: "westchester",  label: "Westchester County, NY",  mat: 1.08, lab: 1.42, equip: 1.03 },
  { id: "albany",       label: "Albany, NY",               mat: 1.01, lab: 1.08, equip: 0.99 },
  { id: "buffalo",      label: "Buffalo, NY",              mat: 1.01, lab: 1.05, equip: 0.98 },
  { id: "syracuse",     label: "Syracuse, NY",             mat: 1.00, lab: 1.02, equip: 0.98 },
  { id: "newark",       label: "Newark, NJ",               mat: 1.08, lab: 1.40, equip: 1.03 },
  { id: "trenton",      label: "Trenton, NJ",              mat: 1.06, lab: 1.32, equip: 1.02 },
  { id: "philadelphia", label: "Philadelphia, PA",          mat: 1.06, lab: 1.35, equip: 1.02 },
  { id: "pittsburgh",   label: "Pittsburgh, PA",            mat: 1.02, lab: 1.10, equip: 0.99 },
  { id: "boston",        label: "Boston, MA",                mat: 1.08, lab: 1.38, equip: 1.04 },
  { id: "worcester",    label: "Worcester, MA",             mat: 1.05, lab: 1.25, equip: 1.02 },
  { id: "hartford",     label: "Hartford, CT",              mat: 1.05, lab: 1.22, equip: 1.02 },
  { id: "new-haven",    label: "New Haven, CT",             mat: 1.05, lab: 1.20, equip: 1.01 },
  { id: "providence",   label: "Providence, RI",            mat: 1.04, lab: 1.18, equip: 1.01 },
  { id: "portland-me",  label: "Portland, ME",              mat: 1.02, lab: 1.02, equip: 1.00 },
  { id: "burlington",   label: "Burlington, VT",            mat: 1.01, lab: 0.98, equip: 0.99 },

  // Mid-Atlantic / DC
  { id: "dc",           label: "Washington, DC",            mat: 1.04, lab: 1.20, equip: 1.02 },
  { id: "baltimore",    label: "Baltimore, MD",             mat: 1.02, lab: 1.10, equip: 1.00 },
  { id: "richmond",     label: "Richmond, VA",              mat: 0.98, lab: 0.88, equip: 0.97 },
  { id: "norfolk",      label: "Norfolk, VA",               mat: 0.97, lab: 0.85, equip: 0.97 },
  { id: "wilmington",   label: "Wilmington, DE",            mat: 1.04, lab: 1.18, equip: 1.01 },

  // Southeast
  { id: "charlotte",    label: "Charlotte, NC",             mat: 0.97, lab: 0.78, equip: 0.96 },
  { id: "raleigh",      label: "Raleigh, NC",               mat: 0.97, lab: 0.80, equip: 0.96 },
  { id: "charleston",   label: "Charleston, SC",             mat: 0.96, lab: 0.75, equip: 0.96 },
  { id: "atlanta",      label: "Atlanta, GA",               mat: 0.98, lab: 0.82, equip: 0.97 },
  { id: "savannah",     label: "Savannah, GA",              mat: 0.96, lab: 0.75, equip: 0.96 },
  { id: "jacksonville", label: "Jacksonville, FL",          mat: 0.97, lab: 0.78, equip: 0.96 },
  { id: "orlando",      label: "Orlando, FL",               mat: 0.98, lab: 0.80, equip: 0.97 },
  { id: "miami",        label: "Miami, FL",                 mat: 1.01, lab: 0.85, equip: 0.98 },
  { id: "tampa",        label: "Tampa, FL",                 mat: 0.97, lab: 0.78, equip: 0.97 },
  { id: "birmingham",   label: "Birmingham, AL",            mat: 0.95, lab: 0.72, equip: 0.95 },
  { id: "nashville",    label: "Nashville, TN",             mat: 0.97, lab: 0.82, equip: 0.97 },
  { id: "memphis",      label: "Memphis, TN",               mat: 0.96, lab: 0.78, equip: 0.96 },
  { id: "new-orleans",  label: "New Orleans, LA",           mat: 0.98, lab: 0.82, equip: 0.97 },
  { id: "jackson-ms",   label: "Jackson, MS",               mat: 0.94, lab: 0.70, equip: 0.95 },

  // Midwest
  { id: "chicago",      label: "Chicago, IL",               mat: 1.03, lab: 1.38, equip: 1.01 },
  { id: "springfield-il", label: "Springfield, IL",         mat: 1.00, lab: 1.10, equip: 0.99 },
  { id: "detroit",      label: "Detroit, MI",               mat: 1.01, lab: 1.12, equip: 0.99 },
  { id: "grand-rapids", label: "Grand Rapids, MI",          mat: 0.99, lab: 0.95, equip: 0.98 },
  { id: "cleveland",    label: "Cleveland, OH",             mat: 1.01, lab: 1.05, equip: 0.99 },
  { id: "columbus",     label: "Columbus, OH",              mat: 1.00, lab: 0.98, equip: 0.98 },
  { id: "cincinnati",   label: "Cincinnati, OH",            mat: 1.00, lab: 1.00, equip: 0.98 },
  { id: "indianapolis", label: "Indianapolis, IN",          mat: 0.99, lab: 0.95, equip: 0.98 },
  { id: "milwaukee",    label: "Milwaukee, WI",             mat: 1.01, lab: 1.08, equip: 0.99 },
  { id: "madison",      label: "Madison, WI",               mat: 1.00, lab: 1.02, equip: 0.99 },
  { id: "minneapolis",  label: "Minneapolis, MN",           mat: 1.02, lab: 1.18, equip: 1.00 },
  { id: "stlouis",      label: "St. Louis, MO",             mat: 1.01, lab: 1.12, equip: 0.99 },
  { id: "kansascity",   label: "Kansas City, MO",           mat: 1.00, lab: 1.05, equip: 0.98 },
  { id: "omaha",        label: "Omaha, NE",                 mat: 0.99, lab: 0.92, equip: 0.98 },
  { id: "des-moines",   label: "Des Moines, IA",            mat: 0.99, lab: 0.95, equip: 0.98 },

  // Southwest
  { id: "dallas",       label: "Dallas, TX",                mat: 0.97, lab: 0.78, equip: 0.97 },
  { id: "houston",      label: "Houston, TX",               mat: 0.98, lab: 0.82, equip: 0.97 },
  { id: "austin",       label: "Austin, TX",                mat: 0.97, lab: 0.80, equip: 0.97 },
  { id: "san-antonio",  label: "San Antonio, TX",           mat: 0.96, lab: 0.75, equip: 0.96 },
  { id: "oklahoma-city", label: "Oklahoma City, OK",        mat: 0.96, lab: 0.78, equip: 0.96 },
  { id: "tulsa",        label: "Tulsa, OK",                 mat: 0.96, lab: 0.78, equip: 0.96 },
  { id: "phoenix",      label: "Phoenix, AZ",               mat: 0.99, lab: 0.85, equip: 0.98 },
  { id: "tucson",       label: "Tucson, AZ",                mat: 0.97, lab: 0.80, equip: 0.97 },
  { id: "albuquerque",  label: "Albuquerque, NM",           mat: 0.98, lab: 0.82, equip: 0.97 },
  { id: "las-vegas",    label: "Las Vegas, NV",             mat: 1.02, lab: 1.08, equip: 1.00 },

  // West
  { id: "la",           label: "Los Angeles, CA",           mat: 1.08, lab: 1.32, equip: 1.03 },
  { id: "sf",           label: "San Francisco, CA",         mat: 1.12, lab: 1.52, equip: 1.06 },
  { id: "san-jose",     label: "San Jose, CA",              mat: 1.10, lab: 1.48, equip: 1.05 },
  { id: "san-diego",    label: "San Diego, CA",             mat: 1.06, lab: 1.22, equip: 1.02 },
  { id: "sacramento",   label: "Sacramento, CA",            mat: 1.06, lab: 1.28, equip: 1.02 },
  { id: "fresno",       label: "Fresno, CA",                mat: 1.04, lab: 1.18, equip: 1.01 },
  { id: "seattle",      label: "Seattle, WA",               mat: 1.06, lab: 1.18, equip: 1.02 },
  { id: "portland-or",  label: "Portland, OR",              mat: 1.04, lab: 1.10, equip: 1.00 },
  { id: "denver",       label: "Denver, CO",                mat: 1.02, lab: 0.95, equip: 0.99 },
  { id: "salt-lake",    label: "Salt Lake City, UT",        mat: 1.00, lab: 0.88, equip: 0.98 },
  { id: "boise",        label: "Boise, ID",                 mat: 0.99, lab: 0.85, equip: 0.98 },

  // Mountain / Remote
  { id: "honolulu",     label: "Honolulu, HI",              mat: 1.22, lab: 1.20, equip: 1.08 },
  { id: "anchorage",    label: "Anchorage, AK",             mat: 1.20, lab: 1.18, equip: 1.10 },
];


// ─── State-Level Fallback Factors ──────────────────────────────
// Used when a zip prefix doesn't map to a specific metro area
export const STATE_FACTORS = {
  "AL": { mat: 0.94, lab: 0.72, equip: 0.95 },
  "AK": { mat: 1.20, lab: 1.18, equip: 1.10 },
  "AZ": { mat: 0.98, lab: 0.83, equip: 0.97 },
  "AR": { mat: 0.94, lab: 0.70, equip: 0.95 },
  "CA": { mat: 1.07, lab: 1.30, equip: 1.03 },
  "CO": { mat: 1.01, lab: 0.92, equip: 0.99 },
  "CT": { mat: 1.05, lab: 1.20, equip: 1.01 },
  "DE": { mat: 1.03, lab: 1.15, equip: 1.00 },
  "DC": { mat: 1.04, lab: 1.20, equip: 1.02 },
  "FL": { mat: 0.98, lab: 0.80, equip: 0.97 },
  "GA": { mat: 0.97, lab: 0.78, equip: 0.96 },
  "HI": { mat: 1.22, lab: 1.20, equip: 1.08 },
  "ID": { mat: 0.98, lab: 0.82, equip: 0.97 },
  "IL": { mat: 1.02, lab: 1.20, equip: 1.00 },
  "IN": { mat: 0.99, lab: 0.92, equip: 0.98 },
  "IA": { mat: 0.98, lab: 0.90, equip: 0.97 },
  "KS": { mat: 0.97, lab: 0.85, equip: 0.97 },
  "KY": { mat: 0.96, lab: 0.82, equip: 0.96 },
  "LA": { mat: 0.97, lab: 0.78, equip: 0.96 },
  "ME": { mat: 1.01, lab: 0.95, equip: 0.99 },
  "MD": { mat: 1.02, lab: 1.05, equip: 1.00 },
  "MA": { mat: 1.06, lab: 1.30, equip: 1.03 },
  "MI": { mat: 1.00, lab: 1.00, equip: 0.98 },
  "MN": { mat: 1.01, lab: 1.10, equip: 0.99 },
  "MS": { mat: 0.93, lab: 0.68, equip: 0.95 },
  "MO": { mat: 1.00, lab: 1.05, equip: 0.98 },
  "MT": { mat: 1.00, lab: 0.82, equip: 0.98 },
  "NE": { mat: 0.98, lab: 0.88, equip: 0.97 },
  "NV": { mat: 1.01, lab: 1.05, equip: 0.99 },
  "NH": { mat: 1.02, lab: 1.00, equip: 1.00 },
  "NJ": { mat: 1.07, lab: 1.35, equip: 1.02 },
  "NM": { mat: 0.97, lab: 0.80, equip: 0.97 },
  "NY": { mat: 1.05, lab: 1.25, equip: 1.02 },
  "NC": { mat: 0.96, lab: 0.76, equip: 0.96 },
  "ND": { mat: 0.99, lab: 0.82, equip: 0.97 },
  "OH": { mat: 1.00, lab: 1.00, equip: 0.98 },
  "OK": { mat: 0.96, lab: 0.76, equip: 0.96 },
  "OR": { mat: 1.03, lab: 1.05, equip: 1.00 },
  "PA": { mat: 1.03, lab: 1.15, equip: 1.00 },
  "RI": { mat: 1.04, lab: 1.15, equip: 1.01 },
  "SC": { mat: 0.95, lab: 0.72, equip: 0.96 },
  "SD": { mat: 0.97, lab: 0.75, equip: 0.97 },
  "TN": { mat: 0.96, lab: 0.78, equip: 0.96 },
  "TX": { mat: 0.97, lab: 0.78, equip: 0.97 },
  "UT": { mat: 0.99, lab: 0.86, equip: 0.98 },
  "VT": { mat: 1.01, lab: 0.95, equip: 0.99 },
  "VA": { mat: 0.97, lab: 0.85, equip: 0.97 },
  "WA": { mat: 1.04, lab: 1.12, equip: 1.01 },
  "WV": { mat: 0.98, lab: 0.92, equip: 0.97 },
  "WI": { mat: 1.00, lab: 1.02, equip: 0.99 },
  "WY": { mat: 0.99, lab: 0.78, equip: 0.97 },
};


// ─── Zip Prefix → Metro Area Mapping ──────────────────────────
// First 3 digits of 5-digit zip → metro area ID
export const ZIP_TO_METRO = {
  // New York City metro (100-104, 110-119)
  "100": "nyc", "101": "nyc", "102": "nyc", "103": "nyc", "104": "nyc",
  "110": "long-island", "111": "long-island", "112": "long-island", "113": "long-island",
  "114": "long-island", "115": "long-island", "116": "long-island", "117": "long-island",
  "118": "long-island", "119": "long-island",
  // Westchester / Hudson Valley (105-109)
  "105": "westchester", "106": "westchester", "107": "westchester", "108": "westchester", "109": "westchester",
  // Albany (120-124)
  "120": "albany", "121": "albany", "122": "albany", "123": "albany", "124": "albany",
  // Syracuse (130-132)
  "130": "syracuse", "131": "syracuse", "132": "syracuse",
  // Buffalo (140-143)
  "140": "buffalo", "141": "buffalo", "142": "buffalo", "143": "buffalo",

  // New Jersey (070-089)
  "070": "newark", "071": "newark", "072": "newark", "073": "newark",
  "074": "newark", "075": "newark", "076": "newark", "077": "newark",
  "078": "newark", "079": "newark",
  "080": "trenton", "081": "trenton", "082": "trenton", "083": "trenton",
  "084": "trenton", "085": "trenton", "086": "trenton", "087": "trenton",
  "088": "trenton", "089": "trenton",

  // Pennsylvania — Philadelphia (190-196)
  "190": "philadelphia", "191": "philadelphia", "192": "philadelphia", "193": "philadelphia",
  "194": "philadelphia", "195": "philadelphia", "196": "philadelphia",
  // Pennsylvania — Pittsburgh (150-153)
  "150": "pittsburgh", "151": "pittsburgh", "152": "pittsburgh", "153": "pittsburgh",

  // Massachusetts — Boston (010-024)
  "010": "worcester", "011": "worcester", "012": "worcester", "013": "worcester",
  "014": "worcester", "015": "worcester", "016": "worcester",
  "017": "boston", "018": "boston", "019": "boston", "020": "boston",
  "021": "boston", "022": "boston", "023": "boston", "024": "boston",

  // Connecticut (060-069)
  "060": "hartford", "061": "hartford", "062": "hartford",
  "063": "new-haven", "064": "new-haven", "065": "new-haven", "066": "new-haven",
  "067": "hartford", "068": "hartford", "069": "new-haven",

  // Rhode Island (028-029)
  "028": "providence", "029": "providence",

  // Maine (039-049)
  "039": "portland-me", "040": "portland-me", "041": "portland-me",
  "042": "portland-me", "043": "portland-me", "044": "portland-me",
  "045": "portland-me", "046": "portland-me", "047": "portland-me",
  "048": "portland-me", "049": "portland-me",

  // Vermont (050-059)
  "050": "burlington", "051": "burlington", "052": "burlington", "053": "burlington",
  "054": "burlington", "055": "burlington", "056": "burlington", "057": "burlington",
  "058": "burlington", "059": "burlington",

  // Delaware (197-199)
  "197": "wilmington", "198": "wilmington", "199": "wilmington",

  // DC / Maryland / Virginia
  "200": "dc", "201": "dc", "202": "dc", "203": "dc", "204": "dc", "205": "dc",
  "206": "dc", "207": "dc", "208": "dc", "209": "dc",
  "210": "baltimore", "211": "baltimore", "212": "baltimore", "214": "baltimore",
  "215": "baltimore", "216": "baltimore", "217": "baltimore", "218": "baltimore",
  "219": "baltimore",
  "220": "dc", "221": "dc", "222": "dc", "223": "richmond",
  "230": "richmond", "231": "richmond", "232": "richmond", "233": "richmond",
  "234": "richmond",
  "235": "norfolk", "236": "norfolk", "237": "norfolk", "238": "norfolk",
  "239": "norfolk",

  // North Carolina (270-289)
  "270": "raleigh", "271": "raleigh", "272": "raleigh", "273": "raleigh",
  "274": "raleigh", "275": "raleigh", "276": "raleigh",
  "280": "charlotte", "281": "charlotte", "282": "charlotte", "283": "charlotte",
  "284": "charlotte", "285": "charlotte",

  // South Carolina (290-299)
  "290": "charleston", "291": "charleston", "292": "charleston", "293": "charleston",
  "294": "charleston", "295": "charleston", "296": "charleston",

  // Georgia (300-319, 398-399)
  "300": "atlanta", "301": "atlanta", "302": "atlanta", "303": "atlanta",
  "304": "atlanta", "305": "atlanta", "306": "atlanta",
  "310": "savannah", "311": "savannah", "312": "savannah", "313": "savannah",
  "314": "savannah",

  // Florida (320-349)
  "320": "jacksonville", "321": "jacksonville", "322": "jacksonville",
  "323": "orlando", "324": "orlando", "327": "orlando", "328": "orlando",
  "329": "orlando",
  "330": "miami", "331": "miami", "332": "miami", "333": "miami",
  "334": "miami",
  "335": "tampa", "336": "tampa", "337": "tampa", "338": "tampa",
  "339": "tampa",
  "340": "miami", "341": "tampa", "342": "orlando", "344": "jacksonville",
  "346": "tampa", "347": "orlando",

  // Alabama (350-369)
  "350": "birmingham", "351": "birmingham", "352": "birmingham",
  "353": "birmingham", "354": "birmingham", "355": "birmingham",

  // Tennessee (370-385)
  "370": "nashville", "371": "nashville", "372": "nashville", "373": "nashville",
  "374": "nashville",
  "380": "memphis", "381": "memphis", "382": "memphis", "383": "memphis",
  "384": "memphis", "385": "memphis",

  // Mississippi (386-397)
  "390": "jackson-ms", "391": "jackson-ms", "392": "jackson-ms",
  "393": "jackson-ms", "394": "jackson-ms", "395": "jackson-ms",
  "396": "jackson-ms", "397": "jackson-ms",

  // Louisiana (700-714)
  "700": "new-orleans", "701": "new-orleans", "702": "new-orleans",
  "703": "new-orleans", "704": "new-orleans",

  // Illinois — Chicago (600-609)
  "600": "chicago", "601": "chicago", "602": "chicago", "603": "chicago",
  "604": "chicago", "605": "chicago", "606": "chicago", "607": "chicago",
  "608": "chicago", "609": "chicago",
  // Illinois — Springfield (625-629)
  "625": "springfield-il", "626": "springfield-il", "627": "springfield-il",
  "628": "springfield-il", "629": "springfield-il",

  // Michigan — Detroit (480-489)
  "480": "detroit", "481": "detroit", "482": "detroit", "483": "detroit",
  "484": "detroit", "485": "detroit",
  // Michigan — Grand Rapids (490-499)
  "490": "grand-rapids", "491": "grand-rapids", "492": "grand-rapids",
  "493": "grand-rapids", "494": "grand-rapids", "495": "grand-rapids",
  "496": "grand-rapids", "497": "grand-rapids", "498": "grand-rapids", "499": "grand-rapids",

  // Ohio — Cleveland (440-449)
  "440": "cleveland", "441": "cleveland", "442": "cleveland", "443": "cleveland",
  "444": "cleveland", "445": "cleveland", "446": "cleveland", "447": "cleveland",
  "448": "cleveland", "449": "cleveland",
  // Ohio — Columbus (430-432)
  "430": "columbus", "431": "columbus", "432": "columbus",
  // Ohio — Cincinnati (450-455)
  "450": "cincinnati", "451": "cincinnati", "452": "cincinnati",
  "453": "cincinnati", "454": "cincinnati", "455": "cincinnati",

  // Indiana — Indianapolis (460-462)
  "460": "indianapolis", "461": "indianapolis", "462": "indianapolis",

  // Wisconsin — Milwaukee (530-532)
  "530": "milwaukee", "531": "milwaukee", "532": "milwaukee",
  // Wisconsin — Madison (535-537)
  "535": "madison", "536": "madison", "537": "madison",

  // Minnesota — Minneapolis (550-559)
  "550": "minneapolis", "551": "minneapolis", "553": "minneapolis",
  "554": "minneapolis", "555": "minneapolis", "556": "minneapolis",

  // Missouri — St. Louis (630-631)
  "630": "stlouis", "631": "stlouis",
  // Missouri — Kansas City (640-641)
  "640": "kansascity", "641": "kansascity",
  // Kansas — Kansas City (660-662)
  "660": "kansascity", "661": "kansascity", "662": "kansascity",

  // Nebraska — Omaha (680-681)
  "680": "omaha", "681": "omaha",

  // Iowa — Des Moines (500-503)
  "500": "des-moines", "501": "des-moines", "502": "des-moines", "503": "des-moines",

  // Texas — Dallas (750-759)
  "750": "dallas", "751": "dallas", "752": "dallas", "753": "dallas",
  "754": "dallas", "755": "dallas", "756": "dallas",
  // Texas — Houston (770-779)
  "770": "houston", "771": "houston", "772": "houston", "773": "houston",
  "774": "houston", "775": "houston",
  // Texas — Austin (786-787)
  "786": "austin", "787": "austin",
  // Texas — San Antonio (780-782)
  "780": "san-antonio", "781": "san-antonio", "782": "san-antonio",

  // Oklahoma (730-741)
  "730": "oklahoma-city", "731": "oklahoma-city", "732": "oklahoma-city",
  "733": "oklahoma-city", "734": "oklahoma-city", "735": "oklahoma-city",
  "740": "tulsa", "741": "tulsa",

  // Arizona — Phoenix (850-853)
  "850": "phoenix", "851": "phoenix", "852": "phoenix", "853": "phoenix",
  // Arizona — Tucson (856-857)
  "856": "tucson", "857": "tucson",

  // New Mexico — Albuquerque (870-871)
  "870": "albuquerque", "871": "albuquerque",

  // Nevada — Las Vegas (889-891)
  "889": "las-vegas", "890": "las-vegas", "891": "las-vegas",

  // California — Los Angeles (900-908, 910-918)
  "900": "la", "901": "la", "902": "la", "903": "la", "904": "la",
  "905": "la", "906": "la", "907": "la", "908": "la",
  "910": "la", "911": "la", "912": "la", "913": "la", "914": "la",
  "915": "la", "916": "la", "917": "la", "918": "la",
  // California — San Diego (919-921)
  "919": "san-diego", "920": "san-diego", "921": "san-diego",
  // California — San Francisco (940-949)
  "940": "sf", "941": "sf", "942": "sf", "943": "sf", "944": "sf",
  "945": "sf", "946": "sf", "947": "sf", "948": "sf", "949": "sf",
  // California — San Jose (950-953)
  "950": "san-jose", "951": "san-jose", "952": "san-jose", "953": "san-jose",
  // California — Sacramento (956-958)
  "956": "sacramento", "957": "sacramento", "958": "sacramento",
  // California — Fresno (935-938)
  "935": "fresno", "936": "fresno", "937": "fresno", "938": "fresno",

  // Washington — Seattle (980-984)
  "980": "seattle", "981": "seattle", "982": "seattle", "983": "seattle", "984": "seattle",

  // Oregon — Portland (970-974)
  "970": "portland-or", "971": "portland-or", "972": "portland-or",
  "973": "portland-or", "974": "portland-or",

  // Colorado — Denver (800-804)
  "800": "denver", "801": "denver", "802": "denver", "803": "denver", "804": "denver",

  // Utah — Salt Lake City (840-841)
  "840": "salt-lake", "841": "salt-lake",

  // Idaho — Boise (836-838)
  "836": "boise", "837": "boise", "838": "boise",

  // Hawaii (967-968)
  "967": "honolulu", "968": "honolulu",

  // Alaska (995-999)
  "995": "anchorage", "996": "anchorage", "997": "anchorage", "998": "anchorage", "999": "anchorage",
};


// ─── Zip Prefix → State Code Mapping ──────────────────────────
// Covers ALL 3-digit zip prefixes → 2-letter state code
export const ZIP_TO_STATE = {
  // Alabama 350-369
  "350": "AL", "351": "AL", "352": "AL", "353": "AL", "354": "AL",
  "355": "AL", "356": "AL", "357": "AL", "358": "AL", "359": "AL",
  "360": "AL", "361": "AL", "362": "AL", "363": "AL", "364": "AL",
  "365": "AL", "366": "AL", "367": "AL", "368": "AL", "369": "AL",
  // Alaska 995-999
  "995": "AK", "996": "AK", "997": "AK", "998": "AK", "999": "AK",
  // Arizona 850-865
  "850": "AZ", "851": "AZ", "852": "AZ", "853": "AZ", "854": "AZ",
  "855": "AZ", "856": "AZ", "857": "AZ", "858": "AZ", "859": "AZ",
  "860": "AZ", "863": "AZ", "864": "AZ", "865": "AZ",
  // Arkansas 716-729
  "716": "AR", "717": "AR", "718": "AR", "719": "AR", "720": "AR",
  "721": "AR", "722": "AR", "723": "AR", "724": "AR", "725": "AR",
  "726": "AR", "727": "AR", "728": "AR", "729": "AR",
  // California 900-961
  "900": "CA", "901": "CA", "902": "CA", "903": "CA", "904": "CA",
  "905": "CA", "906": "CA", "907": "CA", "908": "CA", "910": "CA",
  "911": "CA", "912": "CA", "913": "CA", "914": "CA", "915": "CA",
  "916": "CA", "917": "CA", "918": "CA", "919": "CA", "920": "CA",
  "921": "CA", "922": "CA", "923": "CA", "924": "CA", "925": "CA",
  "926": "CA", "927": "CA", "928": "CA", "930": "CA", "931": "CA",
  "932": "CA", "933": "CA", "934": "CA", "935": "CA", "936": "CA",
  "937": "CA", "938": "CA", "939": "CA", "940": "CA", "941": "CA",
  "942": "CA", "943": "CA", "944": "CA", "945": "CA", "946": "CA",
  "947": "CA", "948": "CA", "949": "CA", "950": "CA", "951": "CA",
  "952": "CA", "953": "CA", "954": "CA", "955": "CA", "956": "CA",
  "957": "CA", "958": "CA", "959": "CA", "960": "CA", "961": "CA",
  // Colorado 800-816
  "800": "CO", "801": "CO", "802": "CO", "803": "CO", "804": "CO",
  "805": "CO", "806": "CO", "807": "CO", "808": "CO", "809": "CO",
  "810": "CO", "811": "CO", "812": "CO", "813": "CO", "814": "CO",
  "815": "CO", "816": "CO",
  // Connecticut 060-069
  "060": "CT", "061": "CT", "062": "CT", "063": "CT", "064": "CT",
  "065": "CT", "066": "CT", "067": "CT", "068": "CT", "069": "CT",
  // Delaware 197-199
  "197": "DE", "198": "DE", "199": "DE",
  // DC 200-205
  "200": "DC", "201": "DC", "202": "DC", "203": "DC", "204": "DC", "205": "DC",
  // Florida 320-349
  "320": "FL", "321": "FL", "322": "FL", "323": "FL", "324": "FL",
  "325": "FL", "326": "FL", "327": "FL", "328": "FL", "329": "FL",
  "330": "FL", "331": "FL", "332": "FL", "333": "FL", "334": "FL",
  "335": "FL", "336": "FL", "337": "FL", "338": "FL", "339": "FL",
  "340": "FL", "341": "FL", "342": "FL", "344": "FL",
  "346": "FL", "347": "FL", "349": "FL",
  // Georgia 300-319, 398-399
  "300": "GA", "301": "GA", "302": "GA", "303": "GA", "304": "GA",
  "305": "GA", "306": "GA", "307": "GA", "308": "GA", "309": "GA",
  "310": "GA", "311": "GA", "312": "GA", "313": "GA", "314": "GA",
  "315": "GA", "316": "GA", "317": "GA", "318": "GA", "319": "GA",
  "398": "GA", "399": "GA",
  // Hawaii 967-968
  "967": "HI", "968": "HI",
  // Idaho 832-838
  "832": "ID", "833": "ID", "834": "ID", "835": "ID",
  "836": "ID", "837": "ID", "838": "ID",
  // Illinois 600-629
  "600": "IL", "601": "IL", "602": "IL", "603": "IL", "604": "IL",
  "605": "IL", "606": "IL", "607": "IL", "608": "IL", "609": "IL",
  "610": "IL", "611": "IL", "612": "IL", "613": "IL", "614": "IL",
  "615": "IL", "616": "IL", "617": "IL", "618": "IL", "619": "IL",
  "620": "IL", "622": "IL", "623": "IL", "624": "IL",
  "625": "IL", "626": "IL", "627": "IL", "628": "IL", "629": "IL",
  // Indiana 460-479
  "460": "IN", "461": "IN", "462": "IN", "463": "IN", "464": "IN",
  "465": "IN", "466": "IN", "467": "IN", "468": "IN", "469": "IN",
  "470": "IN", "471": "IN", "472": "IN", "473": "IN", "474": "IN",
  "475": "IN", "476": "IN", "477": "IN", "478": "IN", "479": "IN",
  // Iowa 500-528
  "500": "IA", "501": "IA", "502": "IA", "503": "IA", "504": "IA",
  "505": "IA", "506": "IA", "507": "IA", "508": "IA", "509": "IA",
  "510": "IA", "511": "IA", "512": "IA", "513": "IA", "514": "IA",
  "515": "IA", "516": "IA", "520": "IA", "521": "IA", "522": "IA",
  "523": "IA", "524": "IA", "525": "IA", "526": "IA", "527": "IA", "528": "IA",
  // Kansas 660-679
  "660": "KS", "661": "KS", "662": "KS", "664": "KS", "665": "KS",
  "666": "KS", "667": "KS", "668": "KS", "669": "KS",
  "670": "KS", "671": "KS", "672": "KS", "673": "KS", "674": "KS",
  "675": "KS", "676": "KS", "677": "KS", "678": "KS", "679": "KS",
  // Kentucky 400-427
  "400": "KY", "401": "KY", "402": "KY", "403": "KY", "404": "KY",
  "405": "KY", "406": "KY", "407": "KY", "408": "KY", "409": "KY",
  "410": "KY", "411": "KY", "412": "KY", "413": "KY", "414": "KY",
  "415": "KY", "416": "KY", "417": "KY", "418": "KY",
  "420": "KY", "421": "KY", "422": "KY", "423": "KY", "424": "KY",
  "425": "KY", "426": "KY", "427": "KY",
  // Louisiana 700-714
  "700": "LA", "701": "LA", "702": "LA", "703": "LA", "704": "LA",
  "705": "LA", "706": "LA", "707": "LA", "708": "LA",
  "710": "LA", "711": "LA", "712": "LA", "713": "LA", "714": "LA",
  // Maine 039-049
  "039": "ME", "040": "ME", "041": "ME", "042": "ME", "043": "ME",
  "044": "ME", "045": "ME", "046": "ME", "047": "ME", "048": "ME", "049": "ME",
  // Maryland 206-219
  "206": "MD", "207": "MD", "208": "MD", "209": "MD",
  "210": "MD", "211": "MD", "212": "MD", "214": "MD",
  "215": "MD", "216": "MD", "217": "MD", "218": "MD", "219": "MD",
  // Massachusetts 010-027
  "010": "MA", "011": "MA", "012": "MA", "013": "MA", "014": "MA",
  "015": "MA", "016": "MA", "017": "MA", "018": "MA", "019": "MA",
  "020": "MA", "021": "MA", "022": "MA", "023": "MA", "024": "MA",
  "025": "MA", "026": "MA", "027": "MA",
  // Michigan 480-499
  "480": "MI", "481": "MI", "482": "MI", "483": "MI", "484": "MI",
  "485": "MI", "486": "MI", "487": "MI", "488": "MI", "489": "MI",
  "490": "MI", "491": "MI", "492": "MI", "493": "MI", "494": "MI",
  "495": "MI", "496": "MI", "497": "MI", "498": "MI", "499": "MI",
  // Minnesota 550-567
  "550": "MN", "551": "MN", "553": "MN", "554": "MN", "555": "MN",
  "556": "MN", "557": "MN", "558": "MN", "559": "MN",
  "560": "MN", "561": "MN", "562": "MN", "563": "MN", "564": "MN",
  "565": "MN", "566": "MN", "567": "MN",
  // Mississippi 386-397
  "386": "MS", "387": "MS", "388": "MS", "389": "MS",
  "390": "MS", "391": "MS", "392": "MS", "393": "MS", "394": "MS",
  "395": "MS", "396": "MS", "397": "MS",
  // Missouri 630-658
  "630": "MO", "631": "MO", "633": "MO", "634": "MO", "635": "MO",
  "636": "MO", "637": "MO", "638": "MO",
  "640": "MO", "641": "MO", "644": "MO", "645": "MO", "646": "MO",
  "647": "MO", "648": "MO", "649": "MO",
  "650": "MO", "651": "MO", "652": "MO", "653": "MO", "654": "MO",
  "655": "MO", "656": "MO", "657": "MO", "658": "MO",
  // Montana 590-599
  "590": "MT", "591": "MT", "592": "MT", "593": "MT", "594": "MT",
  "595": "MT", "596": "MT", "597": "MT", "598": "MT", "599": "MT",
  // Nebraska 680-693
  "680": "NE", "681": "NE", "683": "NE", "684": "NE", "685": "NE",
  "686": "NE", "687": "NE", "688": "NE", "689": "NE",
  "690": "NE", "691": "NE", "692": "NE", "693": "NE",
  // Nevada 889-898
  "889": "NV", "890": "NV", "891": "NV", "893": "NV",
  "894": "NV", "895": "NV", "897": "NV", "898": "NV",
  // New Hampshire 030-038
  "030": "NH", "031": "NH", "032": "NH", "033": "NH", "034": "NH",
  "035": "NH", "036": "NH", "037": "NH", "038": "NH",
  // New Jersey 070-089
  "070": "NJ", "071": "NJ", "072": "NJ", "073": "NJ", "074": "NJ",
  "075": "NJ", "076": "NJ", "077": "NJ", "078": "NJ", "079": "NJ",
  "080": "NJ", "081": "NJ", "082": "NJ", "083": "NJ", "084": "NJ",
  "085": "NJ", "086": "NJ", "087": "NJ", "088": "NJ", "089": "NJ",
  // New Mexico 870-884
  "870": "NM", "871": "NM", "872": "NM", "873": "NM", "874": "NM",
  "875": "NM", "877": "NM", "878": "NM", "879": "NM",
  "880": "NM", "881": "NM", "882": "NM", "883": "NM", "884": "NM",
  // New York 005, 100-149
  "005": "NY",
  "100": "NY", "101": "NY", "102": "NY", "103": "NY", "104": "NY",
  "105": "NY", "106": "NY", "107": "NY", "108": "NY", "109": "NY",
  "110": "NY", "111": "NY", "112": "NY", "113": "NY", "114": "NY",
  "115": "NY", "116": "NY", "117": "NY", "118": "NY", "119": "NY",
  "120": "NY", "121": "NY", "122": "NY", "123": "NY", "124": "NY",
  "125": "NY", "126": "NY", "127": "NY", "128": "NY", "129": "NY",
  "130": "NY", "131": "NY", "132": "NY", "133": "NY", "134": "NY",
  "135": "NY", "136": "NY", "137": "NY", "138": "NY", "139": "NY",
  "140": "NY", "141": "NY", "142": "NY", "143": "NY", "144": "NY",
  "145": "NY", "146": "NY", "147": "NY", "148": "NY", "149": "NY",
  // North Carolina 270-289
  "270": "NC", "271": "NC", "272": "NC", "273": "NC", "274": "NC",
  "275": "NC", "276": "NC", "277": "NC", "278": "NC", "279": "NC",
  "280": "NC", "281": "NC", "282": "NC", "283": "NC", "284": "NC",
  "285": "NC", "286": "NC", "287": "NC", "288": "NC", "289": "NC",
  // North Dakota 580-588
  "580": "ND", "581": "ND", "582": "ND", "583": "ND", "584": "ND",
  "585": "ND", "586": "ND", "587": "ND", "588": "ND",
  // Ohio 430-458
  "430": "OH", "431": "OH", "432": "OH", "433": "OH", "434": "OH",
  "435": "OH", "436": "OH", "437": "OH", "438": "OH", "439": "OH",
  "440": "OH", "441": "OH", "442": "OH", "443": "OH", "444": "OH",
  "445": "OH", "446": "OH", "447": "OH", "448": "OH", "449": "OH",
  "450": "OH", "451": "OH", "452": "OH", "453": "OH", "454": "OH",
  "455": "OH", "456": "OH", "457": "OH", "458": "OH",
  // Oklahoma 730-749
  "730": "OK", "731": "OK", "732": "OK", "733": "OK", "734": "OK",
  "735": "OK", "736": "OK", "737": "OK", "738": "OK", "739": "OK",
  "740": "OK", "741": "OK", "743": "OK", "744": "OK", "745": "OK",
  "746": "OK", "747": "OK", "748": "OK", "749": "OK",
  // Oregon 970-979
  "970": "OR", "971": "OR", "972": "OR", "973": "OR", "974": "OR",
  "975": "OR", "976": "OR", "977": "OR", "978": "OR", "979": "OR",
  // Pennsylvania 150-196
  "150": "PA", "151": "PA", "152": "PA", "153": "PA", "154": "PA",
  "155": "PA", "156": "PA", "157": "PA", "158": "PA", "159": "PA",
  "160": "PA", "161": "PA", "162": "PA", "163": "PA", "164": "PA",
  "165": "PA", "166": "PA", "167": "PA", "168": "PA", "169": "PA",
  "170": "PA", "171": "PA", "172": "PA", "173": "PA", "174": "PA",
  "175": "PA", "176": "PA", "177": "PA", "178": "PA", "179": "PA",
  "180": "PA", "181": "PA", "182": "PA", "183": "PA", "184": "PA",
  "185": "PA", "186": "PA", "187": "PA", "188": "PA", "189": "PA",
  "190": "PA", "191": "PA", "192": "PA", "193": "PA", "194": "PA",
  "195": "PA", "196": "PA",
  // Rhode Island 028-029
  "028": "RI", "029": "RI",
  // South Carolina 290-299
  "290": "SC", "291": "SC", "292": "SC", "293": "SC", "294": "SC",
  "295": "SC", "296": "SC", "297": "SC", "298": "SC", "299": "SC",
  // South Dakota 570-577
  "570": "SD", "571": "SD", "572": "SD", "573": "SD", "574": "SD",
  "575": "SD", "576": "SD", "577": "SD",
  // Tennessee 370-385
  "370": "TN", "371": "TN", "372": "TN", "373": "TN", "374": "TN",
  "375": "TN", "376": "TN", "377": "TN", "378": "TN", "379": "TN",
  "380": "TN", "381": "TN", "382": "TN", "383": "TN", "384": "TN", "385": "TN",
  // Texas 750-799
  "750": "TX", "751": "TX", "752": "TX", "753": "TX", "754": "TX",
  "755": "TX", "756": "TX", "757": "TX", "758": "TX", "759": "TX",
  "760": "TX", "761": "TX", "762": "TX", "763": "TX", "764": "TX",
  "765": "TX", "766": "TX", "767": "TX", "768": "TX", "769": "TX",
  "770": "TX", "771": "TX", "772": "TX", "773": "TX", "774": "TX",
  "775": "TX", "776": "TX", "777": "TX", "778": "TX", "779": "TX",
  "780": "TX", "781": "TX", "782": "TX", "783": "TX", "784": "TX",
  "785": "TX", "786": "TX", "787": "TX", "788": "TX", "789": "TX",
  "790": "TX", "791": "TX", "792": "TX", "793": "TX", "794": "TX",
  "795": "TX", "796": "TX", "797": "TX", "798": "TX", "799": "TX",
  // Utah 840-847
  "840": "UT", "841": "UT", "842": "UT", "843": "UT", "844": "UT",
  "845": "UT", "846": "UT", "847": "UT",
  // Vermont 050-059
  "050": "VT", "051": "VT", "052": "VT", "053": "VT", "054": "VT",
  "055": "VT", "056": "VT", "057": "VT", "058": "VT", "059": "VT",
  // Virginia 220-246
  "220": "VA", "221": "VA", "222": "VA", "223": "VA", "224": "VA",
  "225": "VA", "226": "VA", "227": "VA", "228": "VA", "229": "VA",
  "230": "VA", "231": "VA", "232": "VA", "233": "VA", "234": "VA",
  "235": "VA", "236": "VA", "237": "VA", "238": "VA", "239": "VA",
  "240": "VA", "241": "VA", "242": "VA", "243": "VA", "244": "VA",
  "245": "VA", "246": "VA",
  // Washington 980-994
  "980": "WA", "981": "WA", "982": "WA", "983": "WA", "984": "WA",
  "985": "WA", "986": "WA", "988": "WA", "989": "WA",
  "990": "WA", "991": "WA", "992": "WA", "993": "WA", "994": "WA",
  // West Virginia 247-268
  "247": "WV", "248": "WV", "249": "WV",
  "250": "WV", "251": "WV", "252": "WV", "253": "WV", "254": "WV",
  "255": "WV", "256": "WV", "257": "WV", "258": "WV", "259": "WV",
  "260": "WV", "261": "WV", "262": "WV", "263": "WV", "264": "WV",
  "265": "WV", "266": "WV", "267": "WV", "268": "WV",
  // Wisconsin 530-549
  "530": "WI", "531": "WI", "532": "WI", "534": "WI",
  "535": "WI", "536": "WI", "537": "WI", "538": "WI", "539": "WI",
  "540": "WI", "541": "WI", "542": "WI", "543": "WI", "544": "WI",
  "545": "WI", "546": "WI", "547": "WI", "548": "WI", "549": "WI",
  // Wyoming 820-831
  "820": "WY", "821": "WY", "822": "WY", "823": "WY", "824": "WY",
  "825": "WY", "826": "WY", "827": "WY", "828": "WY", "829": "WY",
  "830": "WY", "831": "WY",
};


// ─── Resolver Functions ────────────────────────────────────────

/**
 * Resolve location pricing factors from a zip code.
 * Returns { mat, lab, equip, label, source } where source is "metro" | "state" | "none"
 * All factors default to 1.0 (national average) when no match is found.
 */
export function resolveLocationFactors(zip) {
  if (!zip || zip.length < 3) {
    return { mat: 1, lab: 1, equip: 1, label: "National Average", source: "none" };
  }
  const prefix = zip.substring(0, 3);

  // Try metro area first (most specific)
  const metroId = ZIP_TO_METRO[prefix];
  if (metroId) {
    const metro = METRO_AREAS.find(m => m.id === metroId);
    if (metro) {
      return { mat: metro.mat, lab: metro.lab, equip: metro.equip, label: metro.label, source: "metro" };
    }
  }

  // Fall back to state-level factors
  const stateCode = ZIP_TO_STATE[prefix];
  if (stateCode && STATE_FACTORS[stateCode]) {
    const sf = STATE_FACTORS[stateCode];
    return { mat: sf.mat, lab: sf.lab, equip: sf.equip, label: stateCode, source: "state" };
  }

  return { mat: 1, lab: 1, equip: 1, label: "National Average", source: "none" };
}

/**
 * Get all metro areas for dropdown selection (manual override).
 * Returns array sorted alphabetically with "National Average" at top.
 */
export function getAllLocations() {
  return [
    { id: "", label: "National Average (1.00x)", mat: 1, lab: 1, equip: 1 },
    ...METRO_AREAS.map(m => ({
      ...m,
      label: `${m.label} (M:${m.mat} L:${m.lab} E:${m.equip})`,
    })).sort((a, b) => a.label.localeCompare(b.label)),
  ];
}
