# NOVA-Market — Regional Construction Intelligence Knowledge Base
**Simulated Board:** Chamath Palihapitiya · Mike DeLuca · Bozoma Saint John  
**Version:** 1.0 | **Classification:** NOVATerra Internal AI Training Data  
**Purpose:** Enable ROM estimates that are location-aware from project address alone

---

> **CHAMATH:** "The same building costs 40% more in San Francisco than Atlanta. That's not magic — it's a compounding stack of labor rates, union rules, permitting drag, code compliance costs, and material logistics. Understand each layer and you can predict it."
>
> **MIKE DELUCA:** "I've built in both worlds — union halls and open shop. The paperwork looks different, the coffee tastes different, but the real difference shows up in your labor burden rate and your crew's productivity assumptions. You get that wrong, you bleed."
>
> **BOZOMA:** "The number is only half the story. In Boston, if you walk in without a relationship with the sub community, you're not getting their A-crew. In Dallas, speed is the relationship. Know the room before you price the room."

---

## PART 1 — MAJOR MARKET COST INDICES

### 1.1 Framework: What the Index Means

The **National Construction Cost Index (NCCI)** baseline = **1.00**, representing the U.S. average all-in cost per square foot for a standard commercial office building (Class B, mid-rise, Type II-A construction). The index compounds:

- **Labor** (typically 40–55% of total cost)
- **Materials** (typically 35–45%)
- **Overhead & regulatory compliance** (typically 8–15%)

> **CHAMATH:** "Labor is the biggest variable. Materials price converge faster because steel and concrete are commodities with national pricing floors. Labor is local. Always local."

---

### 1.2 Top 50 Metro Cost Index Table

| Rank | Metro | Overall Index | Labor Sub-Index | Materials Sub-Index | Regulatory Drag | Primary Cost Driver |
|------|-------|:---:|:---:|:---:|:---:|-----|
| 1 | San Francisco, CA | **1.42** | 1.55 | 1.18 | High | Union labor + Title 24 + seismic |
| 2 | New York City, NY | **1.40** | 1.60 | 1.12 | Very High | Union prevailing wage + permitting |
| 3 | Honolulu, HI | **1.38** | 1.35 | 1.45 | High | Material import costs (90%+ shipped) |
| 4 | Boston, MA | **1.30** | 1.45 | 1.10 | High | Union + historic district compliance |
| 5 | Seattle, WA | **1.28** | 1.40 | 1.08 | High | Union + seismic + green building code |
| 6 | Los Angeles, CA | **1.27** | 1.42 | 1.15 | High | Union + Title 24 + fire/seismic overlay |
| 7 | Washington DC | **1.22** | 1.35 | 1.08 | High | Davis-Bacon dominance + federal overlay |
| 8 | Chicago, IL | **1.21** | 1.42 | 1.05 | Medium-High | Union density + winter premiums |
| 9 | San Diego, CA | **1.20** | 1.38 | 1.12 | High | Title 24 + coastal permitting |
| 10 | Oakland/East Bay, CA | **1.19** | 1.48 | 1.14 | Very High | Labor + fire + seismic + permitting |
| 11 | Denver, CO | **1.14** | 1.18 | 1.05 | Medium | Construction boom demand pressure |
| 12 | Portland, OR | **1.13** | 1.22 | 1.04 | Medium-High | Prevailing wage + green code |
| 13 | Hartford, CT | **1.12** | 1.28 | 1.05 | Medium | Union + aging infrastructure complexity |
| 14 | Philadelphia, PA | **1.11** | 1.30 | 1.06 | Medium-High | Union + historic requirements |
| 15 | Minneapolis, MN | **1.10** | 1.20 | 1.04 | Medium | Winter premium + union mix |
| 16 | Baltimore, MD | **1.09** | 1.22 | 1.04 | Medium | Prevailing wage + port material access |
| 17 | Sacramento, CA | **1.09** | 1.25 | 1.08 | High | Title 24 overflow from Bay Area |
| 18 | Miami, FL | **1.08** | 1.10 | 1.12 | Medium | Hurricane code + import material costs |
| 19 | Newark/NJ Metro | **1.08** | 1.30 | 1.04 | High | NYC spillover + NJ union density |
| 20 | Hartford/Springfield | **1.07** | 1.22 | 1.03 | Medium | Union mix |
| 21 | Salt Lake City, UT | **1.06** | 1.08 | 1.02 | Low-Medium | Boom market labor pressure |
| 22 | Pittsburgh, PA | **1.05** | 1.15 | 1.02 | Medium | Union legacy + Mon Valley steel access |
| 23 | Detroit, MI | **1.04** | 1.12 | 0.98 | Medium | Union + automotive industrial code |
| 24 | Cleveland, OH | **1.03** | 1.10 | 0.99 | Medium | Mixed union + industrial base |
| 25 | Austin, TX | **1.03** | 1.05 | 1.00 | Low | Boom demand + shortage pressure |
| 26 | Phoenix, AZ | **1.02** | 1.00 | 1.00 | Low | High volume / efficient supply chain |
| 27 | Orlando, FL | **1.01** | 0.98 | 1.02 | Low-Medium | Hurricane code offset by open shop |
| 28 | Raleigh, NC | **1.00** | 0.95 | 1.00 | Low | Benchmark metro |
| 29 | Columbus, OH | **0.99** | 1.02 | 0.97 | Low | Mixed market, efficient |
| 30 | Indianapolis, IN | **0.98** | 0.98 | 0.97 | Low | Open shop, central logistics |
| 31 | Kansas City, MO | **0.98** | 1.00 | 0.96 | Low | Central hub, low regulatory drag |
| 32 | Charlotte, NC | **0.97** | 0.94 | 0.98 | Low | Open shop + growth market |
| 33 | Nashville, TN | **0.97** | 0.95 | 0.97 | Low | Open shop + boomtown |
| 34 | Jacksonville, FL | **0.96** | 0.93 | 0.98 | Low | Open shop + hurricane code |
| 35 | Louisville, KY | **0.96** | 0.96 | 0.95 | Low | Mixed market, efficient |
| 36 | St. Louis, MO | **0.95** | 0.98 | 0.94 | Low | Union legacy declining, open shop growing |
| 37 | Tampa, FL | **0.95** | 0.92 | 0.98 | Low | Open shop + hurricane code |
| 38 | Oklahoma City, OK | **0.94** | 0.90 | 0.96 | Low | Open shop, energy sector alignment |
| 39 | Cincinnati, OH | **0.94** | 0.97 | 0.93 | Low | Mixed, efficient supply chain |
| 40 | Richmond, VA | **0.94** | 0.93 | 0.95 | Low | Mixed market |
| 41 | Memphis, TN | **0.93** | 0.90 | 0.95 | Low | Open shop + logistics hub |
| 42 | New Orleans, LA | **0.93** | 0.91 | 0.96 | Medium | Post-Katrina code + coastal |
| 43 | Dallas/Fort Worth, TX | **0.92** | 0.90 | 0.94 | Low | Open shop + scale efficiency |
| 44 | Houston, TX | **0.92** | 0.89 | 0.95 | Very Low | Open shop + petrochemical scale |
| 45 | San Antonio, TX | **0.91** | 0.88 | 0.93 | Low | Open shop, labor availability |
| 46 | Las Vegas, NV | **0.91** | 0.93 | 0.90 | Low | Hospitality-scale efficiency |
| 47 | Albuquerque, NM | **0.90** | 0.88 | 0.93 | Low | Open shop, remote surcharge offset |
| 48 | Tucson, AZ | **0.89** | 0.86 | 0.92 | Low | Open shop, limited union presence |
| 49 | El Paso, TX | **0.88** | 0.85 | 0.93 | Low | Open shop + border labor dynamics |
| 50 | Atlanta, GA | **0.88** | 0.86 | 0.91 | Low | Open shop + high labor availability |

---

### 1.3 Trade-Level Index Variation (Same City, Different Trades)

> **MIKE DELUCA:** "The city-level index is a blunt instrument. Concrete in Chicago is not the same story as steel in Chicago. The union jurisdiction lines up differently. Always decompose by trade before you submit."

#### New York City — Trade-Level Breakdown (City Index: 1.40)

| Trade | NYC Index | Driver |
|-------|:---------:|--------|
| Concrete (cast-in-place) | **1.65** | Concrete Workers Local 18A; placement restrictions; inspector OT |
| Structural Steel | **1.45** | Ironworkers Local 40/361; NYC steel erection rules |
| MEP (combined) | **1.55** | High union density; multiple jurisdictional rules |
| Mechanical (HVAC) | **1.60** | UA Local 638 (steamfitters); complex zone requirements |
| Electrical | **1.58** | IBEW Local 3; inspector hold points; NYC electrical code |
| Plumbing | **1.52** | UA Local 1; DOB inspection backlog |
| Carpentry/Framing | **1.40** | DC 9 + Carpenters; multi-union overlap |
| Drywall/Finishes | **1.35** | Tapers Local 1974; apartment finishing rules |
| Roofing | **1.30** | Local 8; NYC Local Law requirements |
| Masonry | **1.38** | BAC Local 1 jurisdiction |
| Elevator | **1.70** | IUEC Local 1; NYC DOB elevator division; longest inspection lead times |
| Façade/Curtainwall | **1.42** | Local Law 11 compliance requirements; specialty sub market |

#### San Francisco — Trade-Level Breakdown (City Index: 1.42)

| Trade | SF Index | Driver |
|-------|:--------:|--------|
| Concrete | **1.55** | Seismic detailing + Cement Masons Local 300 |
| Structural Steel | **1.48** | Seismic connections + special inspection |
| MEP | **1.50** | Title 24 mechanical/electrical compliance overhead |
| Electrical | **1.52** | Title 24 lighting; EV infrastructure mandates |
| Plumbing | **1.45** | Water reclamation requirements; CALGreen |
| Drywall | **1.38** | Mixed; seismic bracing of walls |
| Roofing | **1.35** | Cool roof requirements; solar-ready mandates |
| Elevator | **1.60** | CAL/OSHA + DSA + city elevator inspection |

#### Chicago — Trade-Level Breakdown (City Index: 1.21)

| Trade | CHI Index | Driver |
|-------|:---------:|--------|
| Concrete | **1.32** | Cement Masons + Laborers 76; winter pour premium |
| Structural Steel | **1.22** | Ironworkers Local 1; Great Lakes steel proximity (offset) |
| Electrical | **1.35** | IBEW Local 134 rates; city electrical permit |
| Mechanical | **1.28** | Pipe Fitters Local 597 |
| Carpentry | **1.20** | UBCJA Local 10 |
| Roofing | **1.25** | Roofers Local 11; winter mobilization |

#### Houston — Trade-Level Breakdown (City Index: 0.92)

| Trade | HOU Index | Driver |
|-------|:---------:|--------|
| Concrete | **0.90** | Abundant open shop supply; no pour restrictions |
| Structural Steel | **0.88** | Gulf Coast fabricator access; port proximity |
| Electrical | **0.94** | Competitive open shop; NECA rates low |
| Mechanical | **0.92** | Heavy industrial training pipeline |
| Drywall | **0.88** | High labor supply; large immigrant workforce |
| Roofing | **0.91** | Large workforce; hurricane code adds some cost |

---

### 1.4 What Drives the Premium — Cost Stack Anatomy

> **CHAMATH:** "Break the premium into five layers. Most estimators only see the first two. The last three are where the surprise lives."

```
COST PREMIUM STACK (Example: NYC vs. Atlanta on a $10M project)

Layer 1 — Union Labor Rate Differential          +$1,800,000
Layer 2 — Prevailing Wage Compliance + Reporting    +$200,000
Layer 3 — Regulatory / Permitting Overhead          +$350,000
Layer 4 — Material Logistics & Local Code Spec      +$280,000
Layer 5 — Market Demand Premium (Sub Margins)       +$370,000
─────────────────────────────────────────────────────────────
Total Premium over Atlanta Baseline:             +$3,000,000
Effective Index:                                      1.30x
```

**Layer Breakdown by Market Type:**

| Layer | Union/Dense Market | Open Shop/Growth | Rural/Remote |
|-------|--------------------|-----------------|--------------|
| Labor rate | 40–60% of premium | 5–15% | 10–20% |
| Prevailing wage | 10–20% | Minimal | 0–5% |
| Permitting/reg. | 15–25% | 2–8% | 1–5% |
| Material/logistics | 8–15% | 8–12% | 20–40% |
| Sub margin premium | 10–20% | 5–15% | 15–25% |

---

## PART 2 — LABOR MARKET DYNAMICS

### 2.1 Union vs. Open Shop Market Map

> **MIKE DELUCA:** "Union density isn't binary. Chicago's 85% union density is a different animal from Pittsburgh at 60% and Kansas City at 35%. And within a union market, some trades are more militant on jurisdiction than others."

#### Union Density by Region

| Region | Union Density | Dominant Trades | Notes |
|--------|:---:|---------|-------|
| New York City Metro | **78–85%** | All trades; Electricians, Steamfitters, Concrete most enforced | No non-union crews on public work; mixed on private |
| Chicago Metro | **70–80%** | IBEW, Plumbers, Ironworkers | PLA requirements on most city work |
| Boston Metro | **65–75%** | All major trades | AFL-CIO Boston Building Trades very active |
| Philadelphia Metro | **60–70%** | Carpenters, Electricians, Laborers | Mixed for suburban projects |
| San Francisco Bay Area | **60–72%** | IBEW, Plumbers, Concrete | City projects near 100%; private commercial mixed |
| Seattle Metro | **55–65%** | Ironworkers, Carpenters, Electricians | Boeing/industrial base maintains pipeline |
| Los Angeles Metro | **40–55%** | IBEW, Cement Masons | Multi-employer agreements common |
| Washington DC Metro | **45–55%** | All trades on federal/DC work | Davis-Bacon essentially mandates union rates |
| Denver Metro | **35–45%** | Ironworkers, Electricians | Growing but open shop competing |
| Phoenix Metro | **12–18%** | Limited | Predominantly open shop |
| Dallas/Fort Worth | **10–15%** | Limited | Right-to-work; open shop standard |
| Houston Metro | **8–14%** | Limited | Energy sector = industrial unions; commercial open shop |
| Atlanta Metro | **8–12%** | Limited | Right-to-work state; strong open shop |
| Southeast (general) | **5–12%** | Limited | Right-to-work states dominate |
| Mountain West | **15–30%** | Ironworkers, Electricians | Varies significantly by project type |

#### Right-to-Work State Impact on Bidding

Right-to-work states (workers cannot be required to join a union): AL, AZ, AR, FL, GA, ID, IN, IA, KS, KY, MI, MS, NE, NV, NH, NC, ND, OK, SC, SD, TN, TX, UT, VA, WV, WI, WY

**Practical impact on estimates:**
- Labor burden rate drops from ~42–48% (union) to ~28–34% (open shop)
- Workers' comp rates typically lower in right-to-work states (competitive market)
- Productivity assumptions can increase 8–12% (no restrictive work rules)
- Crew size flexibility (no jurisdictional minimum man rules)

---

### 2.2 Prevailing Wage Triggers

> **MIKE DELUCA:** "Miss the prevailing wage trigger and you'll win the bid and lose your shirt. It's not just federal — states have their own thresholds, and some are lower than you think."

#### Federal Davis-Bacon Act
- **Trigger:** Any federally funded construction contract over **$2,000**
- **Impact:** Must pay local prevailing wage rates as published by DOL for each trade
- **Reporting burden:** Weekly certified payrolls; compliance overhead ~2–4% of labor cost
- **Applies to:** Direct federal contracts AND federally assisted projects (HUD, FHWA, FAA, etc.)

#### State Prevailing Wage Laws (Select States)

| State | Threshold | Scope | Effective Rate Premium |
|-------|-----------|-------|----------------------|
| California | $1,000 | All public works | +30–45% over market |
| New York | $0 | All public works | +35–55% over market |
| New Jersey | $2,000 | Public works | +25–40% |
| Illinois | $5,000 | Public works + some private with TIF | +30–45% |
| Washington | $1,000 | Public works | +25–35% |
| Oregon | $50,000 | Public works | +20–30% |
| Maryland | $500,000 | State contracts | +20–30% |
| Massachusetts | $2,000 | Public works | +30–45% |
| Michigan | None | N/A (repealed 2023, being challenged) | N/A |
| Texas | None | No state prevailing wage law | N/A |
| Florida | None | No state prevailing wage law | N/A |

**Key estimation rule:** Always check if the project uses ANY of the following:
- Federal funds (any percentage)
- Tax increment financing (TIF)
- Community Development Block Grants (CDBG)
- State infrastructure bonds
- Public land (ground leases, air rights)

Any of these can trigger prevailing wage requirements regardless of project owner type.

---

### 2.3 Current Trade Shortages by Region (2024–2025)

> **MIKE DELUCA:** "The trades shortage is not uniform. You can find drywall hangers in Houston all day. Try finding a licensed journeyman electrician in Boise on two weeks' notice. Regional specificity matters enormously."

#### Critical Shortage Trades (National)
1. **Electricians** — IBEW journeyman shortage estimated at 79,000 nationally; acute in fast-growth markets (Austin, Phoenix, Denver, Raleigh)
2. **Plumbers/Pipefitters** — Shortage driving 15–20% premium in 40+ markets; worst in Southeast and Mountain West
3. **Ironworkers** — Structural and reinforcing; shortage concentrated in secondary markets (not NYC/Chicago where apprenticeship pipelines are stronger)
4. **HVAC Technicians** — Commercial HVAC installer shortage exacerbated by electrification/heat pump transition
5. **Welders** — Industrial welders with certifications (D1.1, D1.8) in critical shortage nationally

#### Regional Shortage Severity Matrix

| Trade | Northeast | Mid-Atlantic | Southeast | Midwest | Southwest | Mountain West | Pacific |
|-------|:---------:|:------------:|:---------:|:-------:|:---------:|:-------------:|:-------:|
| Electricians | Medium | Medium | **Critical** | Medium | **Critical** | **Critical** | High |
| Plumbers | Medium | Medium | High | Medium | High | High | Medium |
| Ironworkers | Low | Low | High | Medium | High | **Critical** | Medium |
| Carpenters | Medium | Medium | Low | Medium | Low | Medium | Medium |
| Concrete | Low | Medium | Low | Low | Medium | High | Medium |
| Drywall | Low | Low | Low | Low | Low | Medium | Medium |
| Masons | High | High | Medium | High | Medium | High | Medium |
| Roofers | Medium | Medium | Medium | Medium | Low | Medium | Medium |
| Heavy Equipment | Low | Low | Medium | Low | Medium | High | Low |

**Critical = 20%+ wage premium; 4+ week lead time for crew mobilization**
**High = 10–20% premium; 2–4 week lead time**
**Medium = 5–10% premium; 1–2 week lead time**
**Low = Spot market pricing; crews available within days**

---

### 2.4 Apprenticeship Pipeline Health

> **MIKE DELUCA:** "An apprenticeship program is a 4–5 year lag indicator. What got funded in 2020 shows up as journeymen in 2025. Right now, the pipeline is healthiest where the unions are strongest — and that's not the markets with the most construction activity."

#### Pipeline Strength by Region

| Region | Pipeline Health | Registered Apps (est.) | Notes |
|--------|:--------------:|------------------------|-------|
| NYC Metro | Strong | 12,000+ active | JATC programs well-funded; union density maintains enrollment |
| Chicago Metro | Strong | 8,000+ active | Trades training council robust; city apprenticeship mandates |
| Bay Area | Moderate | 5,000+ active | Strong electrical/plumbing; weaker carpentry pipeline |
| Boston | Strong | 4,500+ active | Building trades apprenticeship programs well-organized |
| Southeast | **Weak** | Fragmented | Right-to-work environment weakens program funding |
| Texas | Weak-Moderate | Industry-led | ABC (Associated Builders & Contractors) programs growing but not filling gap |
| Phoenix/Las Vegas | **Weak** | 2,000–3,000 | Boom/bust cycles discourage long-term enrollment |
| Mountain West | **Weak** | Low density | Population growth outpacing pipeline by 3–4x |

**National Gap Estimate:** Construction industry needs 546,000 new workers annually through 2026 (Associated General Contractors, 2024). Current apprenticeship graduation rate: ~180,000/year. Net gap: ~366,000/year.

---

### 2.5 Immigration Policy Impact on Labor Availability

> **BOZOMA:** "Immigration is both a labor supply question and a political temperature question. How you talk about it in your bid depends on the room. But the numbers don't care about the politics."

#### Trade-by-Trade Immigration Dependency (Estimated % of Workforce, Immigrant/Foreign-Born)

| Trade | % Immigrant | Primary Countries | Risk Level (Policy Shift) |
|-------|:-----------:|-------------------|:-------------------------:|
| Drywall Installation | **65–75%** | Mexico, Central America | Very High |
| Concrete Formwork/Placing | **55–65%** | Mexico, Central America | Very High |
| Masonry (brick/block) | **45–55%** | Mexico, Central America | High |
| Painting | **50–60%** | Mexico, Central America, Caribbean | High |
| Roofing | **40–55%** | Mexico, Central America | High |
| Landscaping/Earthwork | **50–65%** | Mexico, Central America | Very High |
| Carpentry/Framing | **30–45%** | Mexico, Eastern Europe | Medium-High |
| Plumbing/Pipefitting | **20–30%** | Various | Medium |
| Electricians | **15–20%** | Various | Low-Medium |
| Ironworkers | **15–25%** | Various | Medium |

**Enforcement Impact Scenarios:**

| Policy Environment | Labor Cost Impact | Availability Impact | Most Affected Trades |
|-------------------|:-----------------:|:-------------------:|----------------------|
| Status quo (2024) | Baseline | Baseline | — |
| Moderate enforcement increase | +5–8% finishes/concrete | -10–15% | Drywall, masonry, roofing |
| Significant enforcement + deportations | +15–25% | -25–40% | All above + framing |
| Mass deportation scenario | +30–50% | -40–60% | Total market disruption |

**Regional Exposure:** Southeast, Southwest, and Texas are most exposed due to higher immigrant workforce concentration. Northeast/Midwest union markets have somewhat insulated labor pools due to citizenship requirements for many union membership paths.

---

## PART 3 — MATERIAL & SUPPLY CHAIN

### 3.1 Regional Material Availability and Cost Premiums

> **CHAMATH:** "The supply chain is a distance-cost function. Every mile of haul adds to unit cost. The smart estimator maps where the material is made before pricing where it's being built."

#### Concrete & Aggregate

| Region | Availability | Aggregate Source | Cost Index vs. National Avg. |
|--------|:-----------:|-----------------|:---:|
| Northeast | Moderate | Local quarries; some haul from PA/NY | 1.10–1.15 |
| Great Lakes | High | Abundant limestone belt; quarries in OH, IN, MI | 0.92–0.98 |
| Southeast | High | Granite/limestone deposits; local plants | 0.88–0.94 |
| Texas/Oklahoma | High | Abundant limestone and caliche | 0.87–0.93 |
| Mountain West | Moderate | Remote quarries; haul distances add cost | 1.02–1.12 |
| Hawaii | Very High | Limited local aggregate; imports required | 1.40–1.60 |
| Pacific Northwest | Moderate | Local basalt; seasonal river closures | 1.05–1.10 |
| Coastal California | High | Local, but regulated extraction adds cost | 1.12–1.18 |

**Concrete Plant Coverage:** Urban markets typically have ready-mix plants within 20–40 miles. Rural projects beyond 50-mile radius from plant: add $15–35/CY haul surcharge. Beyond 100 miles: consider on-site batching plant (adds $150K–$400K to project cost, viable for 5,000+ CY projects).

#### Structural Steel

| Region | Proximity to Mills | Lead Time (Current) | Regional Cost Premium |
|--------|:-----------------:|:-------------------:|:---------------------:|
| Pittsburgh/Cleveland/Detroit | Excellent (mills in region) | 8–12 weeks | 0.90–0.95 |
| Chicago | Excellent | 8–12 weeks | 0.92–0.96 |
| Texas Gulf Coast | Good (mini-mills + port) | 10–14 weeks | 0.90–0.95 |
| Southeast | Moderate (mini-mills in SC, AL) | 12–16 weeks | 0.94–0.98 |
| Northeast | Moderate (port access + service centers) | 12–18 weeks | 1.02–1.08 |
| West Coast | Fair (port import + service centers) | 14–20 weeks | 1.04–1.10 |
| Mountain West/Interior | Poor (haul from coast or midwest) | 16–24 weeks | 1.08–1.15 |
| Hawaii | Very Poor | 20–28 weeks | 1.25–1.40 |

**Key Mill Locations:** Nucor (Charlotte, Birmingham, Seattle, Jewett TX), Steel Technologies (Louisville), SSAB (Mobile), ArcelorMittal (Burns Harbor IN, Cleveland OH). Service center network fills gaps nationally.

#### Lumber & Mass Timber

| Region | Availability | Cost Index | Notes |
|--------|:-----------:|:---:|-------|
| Pacific Northwest | Excellent | 0.85–0.92 | Source region for softwood |
| Mountain West | High | 0.90–0.96 | Regional mills access |
| Southeast | High | 0.88–0.94 | Southern yellow pine production belt |
| Midwest | Moderate | 0.96–1.02 | Haul from SE or PNW |
| Northeast | Moderate | 1.00–1.08 | Haul surcharge; some regional mills |
| Southwest | Moderate | 0.96–1.04 | AZ/NM import; some regional supply |
| Hawaii | Very Low | 1.35–1.55 | Almost entirely imported |

**Mass Timber Specific (CLT/GLT):** Current fabricators concentrated in PNW (Structurlam, DR Johnson, Nordic Structures). Lead times: 14–28 weeks depending on size/complexity. Shipping to non-PNW markets adds $15–35/SF to structural system cost.

#### MEP Equipment (National Lead Times, 2025)

| Equipment Type | Lead Time | Shortage Status | Notes |
|----------------|:---------:|:--------------:|-------|
| Medium-voltage switchgear (>15kV) | **52–72 weeks** | Critical | Data center/EV demand surge |
| Pad-mount transformers | **50–65 weeks** | Critical | Utility competition for supply |
| Low-voltage switchgear | **30–40 weeks** | High | Recovery from 2022–23 shortage |
| Commercial HVAC chillers | **20–30 weeks** | Moderate | Refrigerant transition affecting |
| Variable air volume (VAV) boxes | **12–16 weeks** | Low-Moderate | Normalization |
| Fire alarm panels | **14–20 weeks** | Moderate | Chip-dependent |
| Elevator packages | **30–52 weeks** | High | Long-lead; lock in early |
| Generators (diesel, >500kW) | **26–36 weeks** | High | Data center demand |
| Solar inverters | **16–24 weeks** | Moderate | Tariff uncertainty creating variability |
| EV charging equipment (DCFC) | **20–28 weeks** | Moderate | Incentive programs driving demand |

**NOVA Alert Trigger:** Any project in healthcare, data center, or multi-family with a scheduled start within 12 months should flag transformer and switchgear procurement as Day-1 action items.

---

### 3.2 Transportation Cost Impact

> **MIKE DELUCA:** "Everyone talks about material cost. Nobody talks about material delivery cost until the superintendent calls to say the truck couldn't find the site. Remote is expensive. Congested urban is also expensive — just differently."

#### Urban Congestion Premium (Materials Delivery)

| Market | Delivery Premium | Key Factors |
|--------|:----------------:|-------------|
| Manhattan | **+18–28%** | Restricted delivery windows (7AM–10AM, 3PM–7PM off-limits); site logistics; holding fees |
| Chicago Loop | **+12–18%** | Lane closures; permit for large vehicles; limited staging |
| Downtown Boston | **+10–15%** | One-way streets; historic district restrictions |
| Downtown SF | **+14–20%** | Grade constraints; SFMTA permits; narrow streets |
| Houston (sprawl) | **+3–5%** | Distance offset by road quality; minimal restriction |
| Dallas (sprawl) | **+2–4%** | Efficient logistics network |

#### Remote/Rural Premium

| Distance from Major Supply Hub | Material Cost Premium | Delivery Surcharge Estimate |
|-------------------------------|:--------------------:|:---------------------------:|
| 0–25 miles | 0% | Included in standard pricing |
| 25–50 miles | +1–3% | $200–600/truckload |
| 50–100 miles | +3–8% | $600–1,500/truckload |
| 100–200 miles | +8–15% | $1,500–3,000/truckload |
| 200–400 miles | +15–25% | $3,000–5,500/truckload |
| 400+ miles | +25–45% | Custom; consider staging yard |
| Island/Ferry Required | +40–80% | Project-specific |

---

### 3.3 Import Dependencies & Tariff Risk

> **CHAMATH:** "Tariff exposure is the new black swan in construction estimates. You can price materials perfectly today and have a 15% cost increase by permit issuance. The smart estimate flags import dependency and reserves accordingly."

#### High Import Dependency Items (2025)

| Category | Import Dependency | Primary Sources | Current Tariff Status | Price Volatility |
|----------|:-----------------:|-----------------|:---------------------:|:----------------:|
| Aluminum curtainwall | 45–60% | China, Canada | 25% Section 301 on Chinese | High |
| Ceramic/porcelain tile | 60–75% | Italy, Spain, China | Anti-dumping on China | Medium-High |
| Specialty stone (marble, granite) | 70–85% | Italy, Brazil, India | Low (MFN rates) | Medium |
| Plumbing fixtures (mid/high-end) | 35–50% | Germany, Italy | Low; supply normalized | Low-Medium |
| Electrical conduit (steel) | 20–30% | Mexico, Canada (USMCA) | Generally low | Medium |
| Glass (float, specialty) | 25–40% | China, Belgium, Mexico | 25% on Chinese glass | High |
| HVAC refrigerant (HFCs) | Domestic but transitioning | Domestic/EU | Phase-down under AIM Act | High |
| Architectural hardware (specialty) | 30–45% | Germany, Italy, Taiwan | Low; supply adequate | Low |
| Photovoltaic panels | 80%+ | China (via SE Asia) | 25–50%; Section 201 + 301 | Very High |
| LED drivers/controls | 60–70% | China | 25% | Medium-High |

**Tariff Reserve Recommendation:**
- Projects with >30% imported content: add **3–5%** contingency specifically for tariff/supply volatility
- Projects with >50% imported content (hospitality interiors, high-end residential): add **5–8%** contingency
- Projects breaking ground 12+ months from estimate: flag for re-pricing at GMP

---

## PART 4 — REGULATORY ENVIRONMENT

### 4.1 Permitting Timelines by Major City

> **BOZOMA:** "Permitting is a relationship business wearing a bureaucracy costume. In some cities, if you know the right people, you can move through the system. In others — looking at you, NYC DOB — relationships don't matter because the system is genuinely broken. Know the difference."

#### Commercial Building Permit Timeline (New Construction, Type I/II, >20,000 SF)

| City | Typical Timeline | Expedited (If Available) | Key Friction Points |
|------|:---------------:|:------------------------:|---------------------|
| New York City | **12–24 months** | 8–14 months (+$50K–$200K) | DOB plan exam backlog; multiple agency reviews (DEP, FDNY, DOT) |
| San Francisco | **18–36 months** | 12–20 months | Planning Commission; CEQA review; neighborhood appeals |
| Los Angeles | **12–24 months** | 8–14 months | LADBS; CEQA; Planning; Fire; multiple sign-offs |
| Boston | **6–14 months** | 4–8 months | ISD + BRA/BPDA review; public comment process |
| Chicago | **6–12 months** | 3–6 months (fast-track) | City fast-track available; Zoning Board for variances |
| Seattle | **6–12 months** | 3–8 months | Shoreline management; SEPA; historic districts |
| Washington DC | **8–16 months** | N/A (limited) | DCRA + Historic Preservation + DDOT |
| Miami | **4–10 months** | 2–5 months | Building dept. has improved; wind code review adds time |
| Denver | **4–8 months** | 2–4 months | Generally efficient; growth pressure adding time |
| Austin | **3–8 months** | 2–4 months | Growth exceeding staff capacity; improving with tech |
| Phoenix | **4–8 months** | 2–3 months (commercial fast-track) | Generally efficient |
| Dallas | **2–5 months** | 1–3 months | City actively business-friendly; limited review |
| Houston | **3–6 weeks** | 1–3 weeks | No zoning; limited plan review; fastest major city |
| Atlanta | **3–8 months** | 2–4 months | Fulton County adds complexity; city improving |
| Nashville | **3–6 months** | 2–3 months | Growth pressure; improving systems |
| Charlotte | **2–4 months** | 1–2 months | Efficient; growth-oriented |
| Raleigh | **2–4 months** | 1–2 months | Tech-forward permitting; efficient |

**Soft Cost Impact of Permitting Delay:**  
Every month of delay adds carrying costs. Rule of thumb: **$15,000–$45,000/month per $10M of project value** in financing carry, escalation risk, and holding costs.

---

### 4.2 Energy Code Stringency

> **CHAMATH:** "California Title 24 is a full-time job. It adds 3–8% to construction cost — but it also future-proofs the asset. The question for the owner is whether they're pricing in the operational savings or just seeing the upfront hit."

#### Energy Code Hierarchy

```
STRICTEST ────────────────────────────────────► LEAST STRICT

California     →    NY/MA/WA    →    IECC 2021    →    IECC 2018    →    State-specific
Title 24            stretch             national           adopted          older codes
(2022)              codes               standard           standard         (SE states)
```

#### Code Cost Impact by Jurisdiction

| Jurisdiction | Code Standard | Construction Cost Premium vs. Baseline IECC 2015 | Key Requirements |
|-------------|---------------|:------------------------------------------------:|-----------------|
| California | Title 24 (2022) | **+5–9%** | All-electric mandate; solar-ready; EV charging; cool roofs; high envelope performance |
| Massachusetts (stretch) | IECC 2021 + stretch | **+4–7%** | Passive house pathway popular; high airtightness |
| New York City | NYC Energy Conservation Code + LL97 | **+5–8%** | LL97 carbon caps drive MEP upgrades on existing and new |
| Washington State | WSEC 2021 | **+3–6%** | EV charging mandates; heat pump requirements |
| Colorado | IECC 2021 (local adoption varies) | **+2–4%** | Denver/Boulder at 2021; some counties still on 2018 |
| Texas (most jurisdictions) | IECC 2015 or local amendment | **0% (baseline)** | Limited state enforcement; jurisdictions opt-in |
| Florida | FBC Energy (2020) | **+1–3%** | Driven by cooling load requirements; hurricane overlay |
| Georgia | IECC 2015 (2021 in some jurisdictions) | **+0–2%** | Limited enforcement in many counties |

**NYC Local Law 97 — Special Note:**  
Buildings over 25,000 SF face carbon intensity caps beginning 2024, with escalating fines through 2029 and 2034. New construction must plan for compliance from Day 1. MEP systems must target:
- Tier 1 (2024–2029): 0.00675 tCO2e/SF/year for office
- Tier 2 (2030+): Essentially near-zero carbon

Achieving LL97 compliance adds **$15–$35/SF** to base MEP costs for commercial new construction.

---

### 4.3 Seismic Zones and Structural Cost Impact

> **MIKE DELUCA:** "Seismic detailing is invisible until you're in the field and the inspector is rejecting your rebar lap lengths. By then, it's a change order conversation. Build it into the estimate from ZIP code one."

#### Seismic Design Category by Region

| Region | ASCE 7 SDC | Structural Cost Premium | Key Requirements |
|--------|:----------:|:-----------------------:|-----------------|
| Alaska | D–E | **+12–20%** | Maximum seismic; specialty connections; |
| Pacific Northwest (Seattle, Portland) | D | **+8–15%** | Moment frames; special shear walls; special inspection |
| San Francisco Bay Area | D–E | **+9–16%** | Performance-based design common; OSHPD for healthcare |
| Los Angeles Metro | D | **+8–14%** | Soft story retrofit ordinances; CBF/MF steel |
| Salt Lake City | D | **+7–12%** | Wasatch Front fault; increasingly enforced |
| Memphis/New Madrid Zone | C–D | **+4–8%** | Historically under-designed; updating to code |
| Charleston, SC | C | **+3–6%** | New Madrid zone fringe |
| Central US (most) | A–B | **0–2%** | Minimal seismic requirements |
| East Coast (most) | A–B | **0–2%** | Low seismic; wind governs |
| Florida | A | **0%** | Wind governs exclusively; negligible seismic |

**Trade Impact of Seismic Design:**
- Structural steel: add 10–20% to tonnage for moment frames vs. braced frames
- Concrete: add 15–25% for special moment frames (ACI 318-19 Chapter 18) vs. ordinary
- Anchorage and embed plates: often underestimated; add $3–6/SF for SDC D
- Special inspection program: add $0.50–1.50/SF for materials testing and inspection

---

### 4.4 Fire Code and Life Safety Variations

| Code Area | Stringent Markets | Impact | Notes |
|-----------|------------------|--------|-------|
| High-rise sprinkler requirements | NYC (all buildings), Chicago | +$2–5/SF | NYC requires sprinklers in all new construction; some codes exempt low-rise |
| Automatic fire suppression threshold | Varies by jurisdiction | Varies | Some jurisdictions require at 3 stories; others at 5 |
| Stairwell pressurization | NYC, Boston, Chicago | +$1–3/SF MEP | High-rise requirement; varies by jurisdiction |
| Fire-rated assemblies | IBC governs nationally; local amendments | Varies | NYC has additional requirements in certain occupancies |
| Mass notification (EVAC) systems | Healthcare, high-rise, assembly | +$0.50–2/SF | NCAA/joint commission for healthcare |
| Emergency generator requirements | NYC (critical facilities), CA, FL | +$3–8/SF | NYC requires for residential high-rise; CA for healthcare |

---

### 4.5 ADA and Accessibility Variations

**Federal baseline:** ADA Standards for Accessible Design (2010)  
**Stricter jurisdictions:** California (CBC Chapter 11B is significantly stricter than federal ADA)

California CBC 11B key differences from ADA:
- 48" minimum aisle width vs. 36" federal
- More restrictive reach range requirements
- Lower counter height requirements for service counters
- Stricter parking ratio requirements
- Add **$1.50–4.00/SF** for California vs. federal compliance on commercial

NYC: Largely consistent with ADA but administrative requirements add compliance documentation cost.

---

## PART 5 — SEASONAL & MARKET CYCLE FACTORS

### 5.1 Seasonal Cost Premiums

> **MIKE DELUCA:** "The Midwest/Northeast winter premium is real and calculable. January concrete in Chicago is not February concrete in Atlanta. Know your project calendar before your estimate goes out."

#### Winter Construction Premium (Cold Climates: Zone 5+)

| Activity | Winter Premium | Applicable Months | Trigger Temperature |
|----------|:--------------:|-------------------|:-----------------:|
| Concrete placement (heated enclosures) | **+15–25%** | Dec–Mar (Zone 5+) | Below 40°F ambient |
| Masonry (heated, anti-freeze admix) | **+20–35%** | Dec–Mar | Below 40°F |
| Earthwork (frozen ground) | **+25–50%** | Jan–Feb (severe winters) | Below 28°F |
| Steel erection (wind chill) | **+8–15%** | Dec–Feb | Below 20°F with wind |
| Roofing (cold adhesives) | **+10–20%** | Nov–Mar | Below 40°F |
| Underground utilities | **+20–40%** | Dec–Mar | Frost line depth premium |
| Landscaping/site restoration | **+30–60%** | Nov–Apr | Frozen ground; deferred to spring |
| General overhead (heating) | **+$3,000–8,000/month** | Nov–Mar | Full enclosure heating |

**Markets where winter premium is material to estimate:**
Minneapolis, Chicago, Detroit, Cleveland, Buffalo, Boston, Hartford, Albany, Milwaukee, Denver (mountain projects), Salt Lake City, Seattle (high elevation), NYC (January–February pour risk)

---

### 5.2 Hurricane Season Impact (Coastal Markets)

> **BOZOMA:** "After Hurricane Ian hit Fort Myers, every GC in Southwest Florida was sitting on the same subcontractor list. Materials were being price-gouged 40% above list. The smart play is to build in the scenario, not wait for the event."

#### Hurricane Season Dynamics (June 1 – November 30)

**Active season labor/material disruption model:**

| Scenario | Labor Availability Impact | Material Pricing Impact | Duration |
|----------|:------------------------:|:-----------------------:|----------|
| Major hurricane (Cat 3+) direct hit | -30–50% (subs chase restoration) | +20–40% (demand surge) | 6–18 months |
| Near-miss/flooding event | -10–20% | +5–15% | 2–4 months |
| Active season (no major event) | -5–10% (event preparation) | +3–8% (material hoarding) | June–November |
| Post-season normalization | +5–10% (return of crews) | -5–10% | Dec–Feb |

**Markets with highest hurricane cost exposure:**
1. Miami/Ft. Lauderdale/West Palm Beach
2. Tampa/St. Petersburg
3. Southwest Florida (Naples, Ft. Myers)
4. Houston/Galveston
5. New Orleans
6. Jacksonville
7. Outer Banks, NC
8. Gulf Coast Mississippi/Alabama

**Hurricane code construction premiums (baseline vs. non-hurricane markets):**
- Florida Building Code wind requirements: +4–8% vs. ASCE 7-16 non-hurricane
- Coastal construction (high-velocity hurricane zone): +8–14%
- Miami-Dade product approval requirements: +3–5% on envelope products

---

### 5.3 Q4 Spending Rush ("Use-It-Or-Lose-It")

> **CHAMATH:** "Every Q4, institutional money chases the fiscal year deadline. Healthcare systems, universities, government agencies — they need to commit budget or lose it. October 15 through December 15 is the highest-demand period for professional services AND construction. Price accordingly."

#### Q4 Market Dynamics

**Demand surge window:** October – December  
**Affected project types:** Healthcare, higher education, government/municipal, corporate (fiscal year-end capital)

| Effect | Magnitude | Trades Most Affected |
|--------|:---------:|---------------------|
| Sub bid premium (busy market) | +3–8% on new awards | Electricians, mechanical, controls |
| GC overhead absorption | +1–3% | PM/superintendent availability |
| Material delivery congestion | +5–10% lead time extension | All; particularly long-lead MEP |
| Design professional fees | +10–15% for rushed scope | All disciplines |
| Permit processing slowdown | +15–30% timeline | All jurisdictions (holiday staffing) |

**Scheduling intelligence for estimates:**
- Projects breaking ground October–December: add 5–7% soft cost contingency
- Projects with December 31 substantial completion requirement: flag as high-risk; premium sub pricing likely
- Budget year-end often creates design rush; add $0.50–1.50/SF for scope/coordination contingency

---

### 5.4 Construction Boom/Bust Indicators

> **CHAMATH:** "You want leading indicators, not lagging ones. By the time the 'slowdown' shows up in bid day results, the smart money already adjusted. Here's what Nova should be watching."

#### Leading Indicators (6–18 Month Forward View)

| Indicator | What It Predicts | Current Status (2025) | Nova Data Source |
|-----------|-----------------|:---------------------:|-----------------|
| AIA Architecture Billings Index (ABI) | Commercial construction starts, 9–12mo lead | **Below 50 (contracting)** | AIA monthly |
| Dodge Construction Network starts | Volume of future work | **Moderating** | Dodge monthly |
| Building permits (residential) | Residential pipeline | **Mixed by market** | Census monthly |
| Crane count (major cities) | Active construction | **Declining in most** | RLB Crane Index |
| Federal funds rate trajectory | Project financing cost | **Elevated; watch Fed pivots** | FOMC minutes |
| CMBS delinquency rate | Owner financial health | **Rising** | Trepp quarterly |
| Contractor backlog (AGC survey) | Near-term trade capacity | **7–8 months (healthy range)** | AGC quarterly |
| Job openings (BLS construction) | Labor pressure gauge | **Elevated** | BLS monthly |

#### Boom/Bust Regional Scorecard (2025)

| Market | Construction Cycle | Bid Climate | Recommended Contingency |
|--------|:-----------------:|:-----------:|:-----------------------:|
| Austin, TX | **Peak → Moderation** | Competitive; subs tightening | +3% |
| Phoenix, AZ | **Peak → Moderation** | More bid activity; subs available | +2% |
| Nashville, TN | **Mid-boom** | Active; some sub pushback | +3% |
| NYC Metro | **Stable-Slow** | Subs available; better competition | +0% |
| Chicago | **Stable** | Healthy competition | +0% |
| Denver, CO | **Moderation** | Better sub availability | +1% |
| Miami, FL | **Moderation** | Some relief; still active | +2% |
| SF Bay Area | **Contraction** | Best sub market in years; price concessions | -2% (favorable) |
| Houston, TX | **Stable-Active** | Energy sector driving; good availability | +1% |
| Seattle, WA | **Slowing** | Tech sector pullback; more competition | -1% |

---

### 5.5 Interest Rate Impact on Project Pipelines

> **CHAMATH:** "Interest rates are the most powerful lever on construction volume. When the cost of capital doubles, marginal projects die. The developer math is simple: if cap rate compression disappears, only essential-use projects survive."

#### Rate-to-Pipeline Impact Model

| 10-Yr Treasury Range | Typical Dev Spread | Effective Cap Rate Needed | Project Types That Survive |
|---------------------|:-----------------:|:-------------------------:|---------------------------|
| 1.5–2.5% (2020–2021) | +150–200 bps | 3.0–4.5% | All; development boom |
| 3.5–4.5% (2022–2023) | +200–250 bps | 5.5–7.0% | Core assets; healthcare; data center |
| 4.5–5.5% (2024–2025) | +200–275 bps | 6.5–8.0% | Essential use; government; owner-user |
| 5.5%+ (stress scenario) | +250–300 bps | 8.0–9.0% | Owner-occupied; government; mission-critical |

**By asset class — pipeline sensitivity to rate environment:**

| Asset Class | Rate Sensitivity | Current Pipeline Status (2025) |
|-------------|:---------------:|-------------------------------|
| Multifamily market-rate | **Very High** | Significantly reduced starts |
| Office (speculative) | **Very High** | Near-zero new starts nationally |
| Retail (new construction) | **High** | Minimal; mostly renovation/retenanting |
| Hotel/Hospitality | **High** | Selective; lifestyle/resort categories active |
| Industrial/Logistics | **Medium** | Moderating after 2021–2023 boom; still active |
| Data Centers | **Low** | AI/cloud demand driving regardless of rates |
| Healthcare | **Low** | Demographic demand; mostly bond-funded |
| Education (K-12/Higher Ed) | **Low** | Bond measure funded; rate-insensitive |
| Government/Municipal | **Low** | Budget cycle; federal infrastructure bill funding |
| Residential for-sale | **High** | Builder pullback; some lock-in effect |

---

## NOVA INTELLIGENCE SYNTHESIS — Quick Reference

### Address-to-Index Lookup Logic

When Nova receives a project address, apply this decision tree:

```
1. MAP ZIP CODE → Metro Area → Overall Cost Index (Section 1.2)
2. IDENTIFY TRADE MIX → Apply trade-level index (Section 1.3)
3. CHECK UNION STATUS → Apply labor burden rate (Section 2.1)
4. CHECK PREVAILING WAGE → Federal funding? State thresholds? (Section 2.2)
5. CHECK SEISMIC ZONE → Apply structural premium (Section 4.3)
6. CHECK ENERGY CODE → Apply MEP/envelope premium (Section 4.2)
7. CHECK PERMITTING TIMELINE → Flag if >6 months; add soft cost carry (Section 4.1)
8. CHECK SEASONAL WINDOW → Winter premium? Hurricane season? (Section 5.1–5.2)
9. CHECK MARKET CYCLE → Current boom/bust status; adjust contingency (Section 5.4)
10. FLAG LONG-LEAD ITEMS → Transformer, switchgear, elevator, specialty (Section 3.1)
```

### Cost Index Quick-Reference Card

```
TIER 1 (1.25x+):  San Francisco, NYC, Honolulu, Boston, Seattle, LA
TIER 2 (1.10–1.24x): DC, Chicago, San Diego, Oakland, Denver, Portland
TIER 3 (1.00–1.09x): Philadelphia, Minneapolis, Miami, Baltimore, Austin
TIER 4 (0.90–0.99x): Phoenix, Dallas, Charlotte, Nashville, Kansas City
TIER 5 (<0.90x): Houston, Atlanta, San Antonio, El Paso, Tucson
```

### ROM Adjustment Formula

```
ADJUSTED_COST = BASE_NATIONAL_COST × METRO_INDEX 
              × TRADE_WEIGHT_ADJUSTMENT 
              × UNION_LABOR_MULTIPLIER 
              × SEISMIC_PREMIUM 
              × ENERGY_CODE_PREMIUM 
              × SEASONAL_PREMIUM 
              × MARKET_CYCLE_ADJUSTMENT
```

**Example:**  
40,000 SF office building, Denver CO, January groundbreaking, union project, standard MEP  
= $250/SF national base × 1.14 metro × 1.00 trade mix × 1.10 union × 1.05 seismic (SDC D) × 1.04 energy code × 1.03 winter × 1.02 boom cycle  
= **$310/SF all-in** vs. $250/SF national baseline  
= **24% premium** over benchmark

---

*Document maintained by NOVA Intelligence Layer | NOVATerra Platform*  
*Data sources: RSMeans 2024, Dodge Analytics, AIA, AGC, BLS, ASCE 7-22, local jurisdiction codes*  
*Update cadence: Quarterly for index values; annual for regulatory data*  
*Next review: Q3 2025*
