# NOVA-FIELD: Means & Methods Knowledge Base
## Version 1.0 | NOVATerra Intelligence Layer

> **Panel Authors:** Mike DeLuca (Field Reality), Paul Franklin (4D Sequencing), Sarah Chen (AI Structure)
>
> *"The drawings show WHAT. This document teaches the AI HOW."*

---

# SECTION 1: CONSTRUCTION SEQUENCING

## 1.1 Standard Commercial Building Sequence

### Master Dependency Chain

```
[SITE WORK] → [FOUNDATIONS] → [STRUCTURE] → [ENVELOPE] → [ROUGH-INS] → [FINISHES] → [COMMISSIONING] → [PUNCH LIST]
```

**AI RULE:** Each phase gates the next. No phase can fully complete until its predecessor is substantially complete (≥80%). Partial overlaps are permitted under specific conditions defined below.

---

### Phase 1: Site Work
**Predecessor:** None (can begin upon permit issuance)
**Duration Driver:** Earthwork volume (CY), dewatering complexity, utility conflicts

| Activity | Dependency | Overlappable? |
|---|---|---|
| Demolition | Clear site | Yes — zone by zone |
| Erosion/SWPPP controls | Pre-grading | NO — regulatory |
| Mass grading | Demo complete | Yes — phased |
| Underground utilities (storm, sewer, water) | Rough grade | Yes — by utility type |
| Subbase compaction | Underground utilities | NO |
| Temporary access roads | Rough grade | Yes |

**Weather Sensitivity:** Earthwork halts below 20°F sustained or during heavy rain if soil moisture exceeds compaction spec limits.

---

### Phase 2: Foundations
**Predecessor:** Site work ≥ 80% complete in foundation zone
**Critical Path Items:** Soil bearing confirmation, waterproofing cure times, backfill sequencing

| Activity | Dependency | Overlappable? |
|---|---|---|
| Soil bearing test/observation | Excavation complete | NO — observation required |
| Form footings | Bearing confirmed | Yes — by grid |
| Pour footings | Formwork + rebar inspection | NO — inspection required |
| Cure time (footings) | Pour complete | NO — min 7 days for stripping (28-day design strength) |
| Foundation walls (CMU or concrete) | Footings at design strength | Yes — by bay |
| Waterproofing | Foundation walls complete | NO — substrate dry/cured |
| Drainage board / protection | Waterproofing tack-free | Yes |
| Backfill | Waterproofing protection complete + structure anchors walls | NO |
| Underslab utilities | After backfill | Yes — by area |
| Slab-on-grade | Underslab complete + compaction tested | By pour section |

**AI FLAG:** Backfill against foundation walls before structure is erected creates lateral load risk — flag this sequencing in any estimate.

---

### Phase 3: Structure
**Predecessor:** Foundations at design strength (28 days concrete / immediate for steel base plates on cured slab)
**This phase defines the project's critical path more than any other.**

#### Steel Frame
| Activity | Dependency |
|---|---|
| Anchor bolt survey | Footing pour + 7 days |
| Steel delivery | 16–24 week lead time from award |
| Iron workers mobilize | Steel on-site + crane set |
| Column erection | Anchor bolts accepted |
| Beam erection (floor by floor) | Columns plumb and bolted |
| Metal deck | Beams at 90% per level |
| Shear studs | Deck complete |
| Concrete on deck | Shear studs, rebar, MEP sleeves set |
| Plumbing out framing | Per level — begins when deck poured above |

#### Cast-in-Place Concrete Frame
| Activity | Dependency |
|---|---|
| Flying form system setup | Footings complete |
| Column forms + pour | Per level |
| Shoring | Columns at 3,000 PSI (approx. 5–7 days) |
| Slab formwork | Columns stripped and reshored |
| Slab pour | Formwork, rebar, embeds, MEP sleeves set |
| Form stripping | 3,000 PSI reached (7–14 days, temp-dependent) |
| Reshoring | Required until 2 levels above carry loads |

#### Wood Frame (Light Commercial/Multifamily)
| Activity | Dependency |
|---|---|
| Sill plate anchor bolts | Foundation walls |
| 1st floor deck framing | Sill plates |
| 1st floor sheathing | Framing complete per level |
| 2nd floor walls | 1st floor sheathing |
| Repeat per floor | — |
| Roof framing | Top floor walls |
| Sheathing + felt/WRB | Roof framing |

**AI RULE:** Wood frame projects are **weather-critical** from framing through envelope. Do not assume continuous productivity in winter months. Apply a 15–25% winter inefficiency factor north of the Mason-Dixon line for exposed framing.

---

### Phase 4: Building Envelope
**Predecessor:** Structure complete per zone; can begin on lower floors while upper floors are still being framed.

| System | Lead Time | Notes |
|---|---|---|
| Curtain wall | 20–32 weeks | Shop drawings, extrusion, glazing |
| Precast panels | 16–24 weeks | Custom molds add 4–6 weeks |
| Brick veneer | 6–8 weeks material | Labor-intensive, weather-sensitive |
| Metal panel systems | 12–16 weeks | |
| TPO/EPDM roofing | 4–6 weeks material | |
| Storefront / windows | 8–12 weeks | |

**4D RULE (Paul):** Envelope is the **dry-in gate**. Interior trades CANNOT begin on any floor until that floor is dried in — meaning: roof over, windows and exterior doors temporary-closed or fully installed, and floor deck waterproof. Track dry-in floor by floor, not building-wide.

---

### Phase 5: MEP Rough-Ins
**Predecessor:** Floor dried in; rough structure complete; coordination drawings approved

**Coordination Sequence:**
1. BIM coordination / clash detection → approve before any rough-in
2. Structural penetrations (core drilling, sleeve setting) → first in
3. Plumbing (gravity drains first — they own the slope)
4. HVAC main ductwork (large trunk lines before branches)
5. Electrical conduit runs
6. Sprinkler mains and branches
7. Low-voltage (data, security, AV) — last because smallest and most flexible

**AI RULE:** In tight ceiling cavities (less than 18" clear), coordination drawings are not optional — flag every project with less than 24" ceiling cavity as a coordination risk.

---

### Phase 6: Finishes
**Predecessor:** Rough-ins inspected and approved; building fully dried in; HVAC operational or temporary heat/humidity control active

| Activity | Predecessor | Overlappable? |
|---|---|---|
| Spray fireproofing | Structure + rough-in complete | NO — overspray damages finishes |
| Insulation (wall cavity) | After fireproofing, before drywall | YES by zone |
| Drywall hang | Inspections passed | YES by floor |
| Drywall tape + finish | Hang ≥ 50% complete per floor | YES |
| Paint prime | Drywall Level 3 minimum | YES |
| Flooring (hard) | Paint prime + HVAC running | YES |
| Ceiling grid | Paint complete, MEP above-ceiling done | YES |
| Millwork/casework | Drywall finish coat | YES |
| Paint finish coats | Casework set | YES — with protection |
| Flooring (carpet/VCT) | Finish paint | YES by zone |
| Plumbing trim-out | Finishes complete in wet areas | YES |
| Electrical devices | Drywall finish + paint prime | YES |
| Light fixtures | Ceiling grid + paint | YES |
| HVAC grilles/diffusers | Ceiling grid | YES |
| Door hardware | Door frames set (frames pre-drywall) | YES |

**AI RULE:** Flooring is the "no-go-back" trade. Once flooring goes down, heavy material deliveries and wheeled equipment require protection. Apply floor protection cost ($0.35–0.75/SF) to all projects with finishes sequencing.

---

### Phase 7: Commissioning
**Predecessor:** All systems installed and operational; construction substantially complete

| Activity | Duration | Notes |
|---|---|---|
| Pre-functional testing | 1–2 weeks | Contractor self-performs |
| Functional testing | 2–4 weeks | Cx agent directed |
| Test & Balance (TAB) | 1–3 weeks | Concurrent with Cx |
| Fire alarm test | 3–5 days | AHJ present |
| Sprinkler hydrostatic test | 1–2 days per zone | |
| Elevator inspection | 1 week per cab | Requires state inspector |
| Final inspections (building dept) | Variable | AHJ schedule-dependent |
| Certificate of Occupancy | Post all inspections | |

---

### Phase 8: Punch List
**Predecessor:** Certificate of Occupancy issued or TCO granted
**Duration:** Typically 2–6% of total construction duration
**AI RULE:** Projects with poor QC programs during construction have 3–5× longer punch list phases. Flag projects without a stated quality control program.

---

## 1.2 How Sequencing Changes by Structure Type

| Variable | Steel Frame | CIP Concrete | Wood Frame | CMU Load-Bearing |
|---|---|---|---|---|
| Primary schedule driver | Steel lead time (16–24 wk) | Concrete cure cycle | Framing speed | Masonry production |
| Weather sensitivity | High (erection) | Very high (pour/cure) | High (drying) | High (mortar) |
| Floor cycle (typical) | 1–2 weeks/floor | 5–10 days/floor (flying form) | 3–5 days/floor | 7–14 days/floor |
| Crane dependency | Always | Usually | Rarely | Rarely |
| MEP coordination complexity | High (open web joists) | High (slab penetrations) | Moderate | Moderate |
| Typical building height range | Unlimited | Unlimited | ≤ 6 stories (Type III/V) | ≤ 6 stories |

---

## 1.3 Long-Lead Items: Critical Order Windows

**AI RULE:** Flag any item on this list. Failure to order on time is the #1 avoidable schedule delay cause.

| Item | Typical Lead Time | When to Order |
|---|---|---|
| Structural steel (fabricated) | 16–24 weeks | At schematic design completion |
| Elevators | 26–52 weeks | At DD completion / permit submission |
| Curtain wall system | 20–32 weeks | At CD 50% |
| Main electrical switchgear (>400A) | 20–52 weeks (post-COVID norm) | At DD completion |
| Generator (>150 kW) | 20–40 weeks | At DD completion |
| Cooling tower | 16–24 weeks | At CD 50% |
| Custom precast panels | 20–28 weeks | At CD 50% |
| Stair pans (custom) | 12–16 weeks | At CD 90% |
| Custom storefront | 10–14 weeks | At permit |
| Fire pump assembly | 16–24 weeks | At CD 90% |
| Medium voltage transformers | 40–65 weeks (current) | At schematic design |

---

## 1.4 Overlap Matrix: What Can Run Concurrently

| Phase A | Phase B | Can Overlap? | Condition |
|---|---|---|---|
| Site work (upper site) | Foundations (lower site) | YES | Separate zones |
| Structural steel (upper floors) | MEP rough-in (lower floors) | YES | 2-floor buffer minimum |
| Envelope (lower floors) | Rough-in (same floors) | YES | Floor dried in |
| Drywall hang | Tape/finish (different floors) | YES | 1 floor offset |
| Rough-in | Framing | NO | Framing must be inspected first |
| Painting | Flooring installation | NO | Paint must be complete |
| Exterior masonry | Interior finishes | YES | If envelope is independent |
| Commissioning | Punch list | YES | Zone-by-zone |

---

## 1.5 Weather-Dependent Activities

| Activity | Temperature Limit | Precipitation Limit | Notes |
|---|---|---|---|
| Concrete pour | 40°F rising / 35°F with protection | No active rain | Cold weather plan required <40°F |
| Masonry | 40°F rising / 35°F with enclosure | No rain | Mortar freezes; joints fail |
| Roofing (membrane) | 40°F min for adhesives | No moisture | TPO/EPDM adhesive won't cure |
| Painting (exterior) | 50°F, surface 5°F above dew point | No rain / <85% RH | |
| Steel erection | No limit (temp) | Wind >25 mph = stop | OSHA 1926.1416 |
| Earthwork/compaction | 28°F | Saturated soil | Proctor test governs |
| Paving (asphalt) | 50°F air and rising | No rain | Asphalt cools below 275°F = reject |
| Waterproofing (liquid) | 40°F min | No moisture | Surface prep critical |
| Spray fireproofing | 40°F min | No moisture | Humidity <90% |

---

# SECTION 2: CREW COMPOSITIONS & PRODUCTION RATES

> **Sarah Chen's Structuring Note:** All rates are expressed as [Unit/Crew-Day]. A "crew-day" is one full crew working one 8-hour shift. Apply shift factors: 10-hr day = 1.15×; 12-hr day = 1.25× (diminishing returns apply). Apply region/market factors: NYC Metro = 0.7× (congestion, union rules); Southeast = 1.1×; Midwest = 1.0× (index base).

---

## 2.1 Concrete

### Footing/Foundation Wall Crew
- **Composition:** 1 Foreman + 3 Carpenters (forms) + 2 Rod Busters (rebar) + 4 Laborers
- **Form erection:** 200–350 SF of contact area/crew/day (complex geometry = 150 SF)
- **Rebar placement:** 1,500–2,500 LB/rod buster/day
- **Pour rate (pump):** 60–100 CY/hour
- **Pour rate (crane + bucket):** 20–35 CY/hour
- **Crew for a pour:** 1 Foreman + 1 Finisher/CY operator + 2 Vibrators + 2 Laborers (screed) + 1 Pump operator

### Slab on Grade Crew
- **Composition:** 1 Foreman + 2 Finishers + 4 Laborers
- **Production:** 2,000–4,000 SF/day (flatwork, standard — no special finishes)
- **Fine finish (power trowel):** 1,500–2,500 SF/day
- **Polished concrete:** 500–1,000 SF/day per polishing crew

### Elevated Slab (Deck on Metal Deck or Flying Form)
- **Forming crew:** 1 Foreman + 4 Carpenters = 400–600 SF deck/day
- **Rebar crew:** 1 Foreman + 4 Rod Busters = 3,000–5,000 SF slab/day
- **Pour crew:** Per above
- **Cycle time (flying form system):** 5–7 days/floor (3-form set at 3 days/pour is theoretical max)

### Key Cost Factors (AI Flag List)
- Pump line distance over 300 LF = add pump line surcharge
- Pours over 150 CY = continuous operation required (flag overtime + extended day)
- Winter pours: add 15–25% for heating blankets, enclosures, calcium chloride
- High-early cement specification: adds $15–25/CY material premium

---

## 2.2 Structural Steel Erection

### Crew Composition (Typical Low/Mid-Rise)
- **Core crew:** 1 Foreman + 4 Connectors + 2 Bolters + 1 Crane Operator + 1 Oiler + 1 Rigger
- **Support:** 1 Surveyor (shared) + 1 Safety watch on large crews

### Production Rates

| Project Type | Tons/Day | Notes |
|---|---|---|
| Simple industrial (warehouse, box) | 8–15 tons/day | Repetitive, large members |
| Mid-rise office/commercial | 4–8 tons/day | Mixed members, more connections |
| High-rise (above 20 floors) | 2–4 tons/day | Wind exposure, logistics, pick complexity |
| Structural mezzanine | 3–6 tons/day | Tight access, complex detailing |

### Crane Pick Rate
- Simple picks (columns, beams): 12–20 picks/hour
- Complex picks (trusses, long-span): 4–8 picks/hour

### Bolting Production
- Standard bolt pattern: 200–400 bolts/crew/day (field bolted connections)
- High-strength tension-control bolts: 150–300/crew/day

**AI FLAG:** Erection drawings and anchor bolt plans must be approved before mobilization. Each RFI during erection costs approximately 1–3 days of schedule.

---

## 2.3 Masonry

### Unit Masonry Crew
- **Composition:** 1 Mason Foreman + 4 Journeymen Masons + 4 Tenders (2 tenders per mason standard)

### Production Rates

| Unit Type | Units/Mason/Day | SF/Mason/Day | Notes |
|---|---|---|---|
| 8" CMU (standard) | 125–175 | 110–155 | Normal running bond |
| 12" CMU | 90–130 | 90–130 | Heavier — fatigue factor |
| 4" brick (running bond) | 350–500 | 100–145 | Experienced mason |
| 4" brick (complex pattern) | 200–300 | 58–87 | Soldier course, herringbone |
| Stone veneer (cut) | 30–60 SF/mason/day | Varies | Complex — high skill |
| Grout (CMU fill) | 1,500–2,500 LF of cells/day | — | Low-lift grouting |

### Weather and Productivity Modifiers
- Below 40°F: productivity drops 10–25%; requires enclosures
- Above 95°F: productivity drops 10–15% (hydration schedule required)
- Rain: work stops (mortar washout)
- Scaffold setup/move days: 0 masonry production; plan 1 move per 6–8 courses of scaffold

---

## 2.4 Metal Stud Framing

### Crew Composition
- **Typical:** 1 Foreman + 3 Carpenters + 1 Laborer
- **Large open floor plates:** Scale up to 1 Foreman + 6–8 Carpenters

### Production Rates

| Work Type | Unit | LF or SF/Carpenter/Day |
|---|---|---|
| Exterior wall track/stud layout | LF of wall | 150–250 LF/day |
| Interior partition layout + framing | LF of wall | 200–350 LF/day |
| Interior non-structural partition (fully framed) | SF of wall | 300–500 SF/day |
| Exterior load-bearing stud wall (complex) | SF of wall | 150–250 SF/day |
| Ceiling framing (soffits, clouds) | SF | 200–350 SF/day |
| Framing around openings (doors, windows) | EA | 4–8 openings/carpenter/day |

**AI FLAG:** Projects with high door density (hospitals, schools) have 20–30% lower linear footage productivity vs. open office floor plates.

---

## 2.5 Drywall

### Hanging Crew
- **Composition:** 1 Foreman + 4 Hangers + 2 Laborers

| Condition | SF/Hanger/Day |
|---|---|
| Open flat walls, 9' ceiling, standard | 1,200–1,800 SF |
| Corridors + many rooms | 800–1,200 SF |
| High walls (12'–16') | 800–1,200 SF |
| Ceilings (flat) | 600–1,000 SF |
| Complex ceilings (soffits, curves) | 300–600 SF |

### Taping & Finishing Crew
- **Composition:** 1 Foreman + 3 Finishers + 1 Helper
- **Tape (coat 1):** 1,500–2,500 SF/finisher/day
- **Second coat:** 2,000–3,000 SF/finisher/day
- **Third coat / skim:** 1,500–2,000 SF/finisher/day
- **Sanding:** 1,000–1,500 SF/finisher/day

### Finish Level Reference

| Level | Description | Typical Use |
|---|---|---|
| L1 | Tape embedded only | Fire-rated assemblies hidden above tile |
| L2 | Tape + one coat | Water-resistant board in wet areas |
| L3 | Two coats | Texture or heavy wall covering |
| L4 | Three coats (standard) | Flat/eggshell paint |
| L5 | Skim coat | High-gloss paint, critical lighting |

---

## 2.6 Painting

### Crew Composition
- **Typical:** 1 Foreman + 3–4 Painters + 1 Helper (prep/move)

### Production Rates

| System | SF/Painter/Day | Notes |
|---|---|---|
| Prime coat (roller, flat walls) | 2,500–4,000 SF | Open floor plates |
| Finish coat (roller) | 2,000–3,500 SF | Open floor plates |
| Corridors + doors (cut-in heavy) | 1,000–1,800 SF | High linear trim |
| Ceiling (roller) | 2,000–3,500 SF | No obstructions |
| Ceiling (spray, commercial) | 5,000–8,000 SF | Masking time not included |
| Epoxy (2-part, roller) | 800–1,500 SF | Prep time significant |
| Staining (millwork) | 200–400 LF/day | Wipe + seal system |

**AI RULE:** Every additional coat = 70–80% of the base coat production rate (surface is prepped). Never assume 100% re-coat rate.

---

## 2.7 Flooring

| Type | SF/Installer/Day | Crew Size | Notes |
|---|---|---|---|
| VCT (vinyl composition tile) | 500–800 SF | 2–3 | Adhesive, seaming, and rolling |
| LVT/LVP (luxury vinyl plank) | 600–1,000 SF | 2 | Floating = faster; glue-down = slower |
| Carpet tile (2×2) | 800–1,200 SF | 2 | |
| Broadloom carpet | 600–1,000 SF | 2–3 | Seaming reduces rate |
| Porcelain tile (12×12 grid) | 150–250 SF | 2 | Thin-set, layout lines |
| Large format tile (24×24+) | 80–150 SF | 2–3 | Back-butter, leveling |
| Epoxy terrazzo (poured) | 50–100 SF | 3–4 | High skill, long cure |
| Hardwood (strip, nailed) | 300–500 SF | 2 | |
| Polished concrete (grind + seal only) | 400–800 SF | 2 | Separate from pour |

---

## 2.8 Ceiling Grid (Suspended ACT)

| Condition | SF/Installer/Day |
|---|---|
| Open, standard 2×4 grid | 600–900 SF |
| Open, 2×2 grid | 500–800 SF |
| Heavy obstructions (lots of MEP) | 350–550 SF |
| Custom or specialty grid (tegular, reveals) | 300–500 SF |
| Grid in corridors | 200–400 LF |

**AI FLAG:** ACT grid is the finish-phase coordinator. All above-ceiling MEP must be complete, tested, and accessible-panel locations confirmed before grid installation begins.

---

## 2.9 MEP Rough-In Production Rates

### Plumbing

| Activity | Rate | Unit |
|---|---|---|
| Waste + vent rough-in (standard) | 4–8 | Fixtures/plumber/day |
| Supply rough-in (copper) | 80–120 | LF/plumber/day |
| Cast iron stack | 20–40 | LF/plumber/day |
| PVC DWV | 80–150 | LF/plumber/day |
| Trim-out (fixture set) | 6–10 | Fixtures/plumber/day |
| Underground sanitary | 60–100 | LF/crew/day (2-man) |

### Electrical

| Activity | Rate | Unit |
|---|---|---|
| EMT conduit run (straight) | 150–250 | LF/electrician/day |
| Conduit in tight ceiling cavity | 60–100 | LF/electrician/day |
| Wire pull (parallel circuits) | 400–800 | LF/electrician/day |
| Device rough (receptacles, switches) | 15–25 | Devices/electrician/day |
| Device trim (devices + plates) | 25–50 | Devices/electrician/day |
| Panel wiring | 1 | Panel/electrician/day |
| Light fixture rough | 20–35 | Fixtures/electrician/day |
| Light fixture trim | 15–25 | Fixtures/electrician/day |

### HVAC/Mechanical

| Activity | Rate | Unit |
|---|---|---|
| Rectangular duct (main trunk) | 150–300 | LB sheet metal/crew/day |
| Rectangular duct (branch distribution) | 80–150 | LB/crew/day |
| Flex duct | 15–30 | Connections/mechanic/day |
| VAV box set | 4–8 | Units/mechanic/day |
| Fan coil unit set | 3–6 | Units/crew/day |
| Pipe insulation | 100–200 | LF/insulator/day |

---

# SECTION 3: EQUIPMENT & LOGISTICS

## 3.1 Crane Decision Matrix

### Mobile Crane vs. Tower Crane

| Factor | Suggests Mobile | Suggests Tower |
|---|---|---|
| Building height | ≤ 6 stories | ≥ 7 stories |
| Duration of picks | Short duration (≤ 4 weeks) | Extended (≥ 6 weeks) |
| Site size | Open, mobile access possible | Tight urban site |
| Steel tonnage | < 200 tons total | > 200 tons total |
| Floor cycle picks/day | < 30 picks/day | > 50 picks/day |
| Material hoisting ongoing | Not needed | Needed throughout |

**AI RULE:** Tower crane is almost always required when: (1) building exceeds 100 feet, (2) site is urban/constrained (< 30 feet clearance around perimeter), or (3) project duration exceeds 12 months and continuous hoisting is required.

### Tower Crane Cost Factors
- **Mobilization/demobilization:** $35,000–$120,000 depending on crane size
- **Monthly rental:** $18,000–$45,000/month
- **Operator (union NYC):** $95–$125/hour including benefits
- **Foundation anchor:** $25,000–$80,000 (tied-in to structure adds cost)
- **Climbing:** $15,000–$40,000 per climb

---

## 3.2 Concrete Pump vs. Crane-and-Bucket

| Factor | Pump | Crane + Bucket |
|---|---|---|
| Pour volume | > 50 CY | Any volume |
| Pour rate required | High (>40 CY/hr) | Lower acceptable |
| Access to crane | Not available / crane busy | Crane available |
| Concrete mix | Standard slump | Must be pumpable mix |
| Location | Ground-to-high elevation | Any height |
| Cost premium | Pump: $800–$2,500/day + line rental | Crane time only |

**Mike DeLuca Note:** On urban sites, a concrete pump with boom can place concrete without occupying the tower crane — which is often more valuable doing steel or other picks simultaneously. Always evaluate crane productivity vs. pump cost.

---

## 3.3 Scaffold vs. Aerial Lift

| Factor | Scaffolding | Scissors / Boom Lift |
|---|---|---|
| Duration of access | Sustained (>2 weeks same zone) | Short, moving access |
| Load requirement | Heavy materials (masonry) | Personnel + light tools |
| Weather exposure | Better (enclosed possible) | High wind = no-go |
| Ground condition | Stable, flat | Stable required |
| Height | Unlimited (frame scaffold) | Scissors to 50', boom to 150' |
| Daily access speed | High (once erected) | Flexible (move quickly) |
| Setup cost | $4–10/SF/month | $800–$2,500/day rental |

**AI RULE:** Masonry work always uses scaffold. Interior drywall in open spaces uses lifts. Exterior envelope work on tall buildings uses swing stage or mast climbers.

---

## 3.4 High-Rise vs. Low-Rise Logistics

### Low-Rise (1–4 Stories)
- Materials delivered to grade and manually distributed
- Forklift (rough terrain) handles most horizontal distribution
- No dedicated hoist
- Dumpster positioned at perimeter
- Concrete via pump or chute

### Mid-Rise (5–12 Stories)
- Personnel/material hoist required (starts at approximately 6 stories or 65 feet)
- Hoist cost: $8,000–$20,000/month + $25,000–$60,000 mobilization
- Dedicated hoist zone (lockout perimeter at grade)
- Floor-by-floor staging areas required
- Tower crane handles structural picks; hoist handles everything else

### High-Rise (13+ Stories)
- Multiple hoists often required (personnel separate from material)
- Concrete via pump (stationary or truck)
- Strict material laydown on each floor (maximum 50 PSF live load typical)
- Just-in-time delivery required — no floor storage of multiple floors of material
- Dedicated receiving area at grade
- Traffic management plan required (NYC: flagman required for deliveries)

---

## 3.5 Temporary Facilities

| Item | When Needed | Typical Cost |
|---|---|---|
| Construction trailer (GC) | Mobilization through CO | $800–$2,500/month |
| Sub trailers | As needed per trade | $600–$1,500/month each |
| Temporary power (service entrance) | Before underground complete | $5,000–$25,000 install + $800–$2,000/month |
| Temporary water | Immediately | $500–$2,000 tap + meter |
| Dumpsters (30 CY) | Throughout | $500–$900/pull |
| Portable toilets | Throughout | $150–$300/month each (1 per 10 workers) |
| Construction fencing (chain link) | Mobilization | $3–8/LF installed |
| Temp lighting (interior) | Before permanent energized | $0.15–0.35/SF installed |
| Fire watch (hot work) | Per hot work operation | $45–$65/hour |
| Street closure permits (NYC) | Per work zone | $500–$5,000 + NYPD coordination |

---

# SECTION 4: GENERAL CONDITIONS COST DRIVERS

## 4.1 Project Duration Impact on General Conditions

**Core Principle:** General conditions cost is 70% time-based, 30% fixed. Extending a project schedule directly increases GC cost.

**Typical GC General Conditions as % of Direct Cost:**

| Project Size | GC % Range | Notes |
|---|---|---|
| < $1M | 18–25% | High overhead ratio |
| $1M–$5M | 14–20% | |
| $5M–$25M | 10–16% | |
| $25M–$100M | 8–12% | Economy of scale |
| > $100M | 6–10% | |

**Weekly GC Burn Rate by Project Size:**

| Project Value | Weekly GC Cost |
|---|---|
| $500K | $3,000–$5,000/week |
| $2M | $8,000–$14,000/week |
| $10M | $20,000–$35,000/week |
| $50M | $60,000–$100,000/week |

**AI RULE:** Every month of schedule extension = 4.3 × weekly GC burn rate in added cost. Use this to price acceleration vs. delay decisions.

---

## 4.2 Staffing by Project Size

| Project Size | Superintendent | PM | Field Engineer | Project Executive |
|---|---|---|---|---|
| < $500K | 1 (shared) | 1 (PM/Super dual) | 0 | 0.1 (oversight) |
| $500K–$2M | 1 | 1 (may be shared) | 0 | 0.25 |
| $2M–$10M | 1 | 1 | 1 | 0.5 |
| $10M–$50M | 1–2 | 1 | 1–2 | 0.5 |
| > $50M | 2–3 | 1–2 | 2–4 | 1 |

**Burdened Labor Rates (NYC Metro, 2024–2025):**

| Role | Annual Salary | Burden (35%) | Total Annual | Weekly |
|---|---|---|---|---|
| Superintendent | $130,000–$185,000 | +$46,000–$65,000 | $176,000–$250,000 | $3,385–$4,808 |
| Project Manager | $110,000–$165,000 | +$39,000–$58,000 | $149,000–$223,000 | $2,865–$4,288 |
| Field Engineer | $75,000–$105,000 | +$26,000–$37,000 | $101,000–$142,000 | $1,942–$2,731 |
| Project Executive | $180,000–$275,000 | +$63,000–$96,000 | $243,000–$371,000 | $4,673–$7,135 |

---

## 4.3 Insurance and Bonding

| Coverage | Typical Cost (% of contract) |
|---|---|
| General Liability | 0.5–1.5% |
| Builder's Risk | 0.4–0.8% of project value |
| Workers' Comp | 5–25% of labor cost (trade-dependent) |
| Umbrella | 0.2–0.5% |
| Performance & Payment Bond | 0.5–1.5% (varies by contractor financials) |
| **Total Insurance + Bond (typical)** | **3–6% of contract value** |

**High-risk trade workers' comp rates (approximate):**
- Ironworkers: 18–28% of labor
- Roofers: 20–30% of labor
- Concrete (structural): 10–18% of labor
- Electrical: 5–10% of labor
- Drywall: 6–12% of labor

---

## 4.4 Permit and Fee Structures

**AI NOTE:** These are highly jurisdiction-dependent. Flag for verification on each project. NYC Metro representative:

| Fee Type | Basis | Typical Range |
|---|---|---|
| Building permit | Per $1,000 construction value | $5–$15/$1,000 |
| Plan review | Flat or per page | $1,500–$15,000 |
| Fire prevention | Per construction value | $1–$5/$1,000 |
| Plumbing permit | Per fixture | $25–$75/fixture |
| Electrical permit | Per circuit or value | $500–$5,000 |
| Elevator permit | Per cab | $2,000–$8,000 |
| Street opening | Per excavation | $500–$3,000 |
| NYC sidewalk shed | Per LF/year | $7–$15/LF/year |
| **Total permit fees (rough)** | **% of construction cost** | **1.5–4%** |

---

## 4.5 Temporary Protection

| Item | When Required | Cost Estimate |
|---|---|---|
| Winter enclosures (heated tents) | Concrete pours or masonry < 40°F | $2–$5/SF/month of enclosed area |
| Heating (propane/temporary) | Interior work < 50°F | $800–$3,000/week per floor |
| Dust barriers (ZipWall/poly) | Occupied building work | $1–$3/LF barrier installed |
| Floor protection (Ram Board) | Finishes in occupied or final | $0.35–$0.75/SF |
| Window protection | Masonry / spray work near glass | $0.25–$0.50/SF |
| Ceiling/wall protection (plastic sheet) | Above finishes during other work | $0.15–$0.35/SF |

---

## 4.6 OSHA and Site Safety

**Required regardless of project size:**
- Safety Data Sheets (SDS) for all hazardous materials
- Fall protection at 6 feet (construction) — 29 CFR 1926.502
- Hard hats, safety glasses, hi-vis vest — site entry minimum
- Weekly toolbox talks (documented)
- Competent person for excavations > 5 feet

**Site-Size Based Requirements:**

| Threshold | Requirement |
|---|---|
| > 20 workers at peak | Site safety coordinator (dedicated, not PM-collateral) |
| > $10M contract (NYC) | Designated safety manager + site-specific safety plan |
| Trenching > 5' deep | Competent person + shoring/sloping plan |
| Scaffold > 10 feet | Competent person erection supervision |
| Any crane pick | Lift plan required; critical picks (>75% capacity) require engineer |
| Confined space work | Permit required + attendant |

**Safety Cost Rule of Thumb:** Budget 1.0–2.5% of direct construction cost for site safety (personnel, equipment, training, signage, monitoring). Higher end for healthcare, occupied buildings, and complex urban sites.

---

## 4.7 Cleaning

| Type | When | Cost |
|---|---|---|
| Progressive cleaning | Ongoing — per phase | $0.10–$0.25/SF of active work area/week |
| Post-drywall rough clean | After drywall, before flooring | $0.15–$0.30/SF |
| Pre-finish final clean | Before floor protection down | $0.20–$0.40/SF |
| Construction final clean | Post punch list | $0.30–$0.60/SF |
| Window cleaning (construction film) | At turnover | $2–$5/window |

**AI RULE:** Never allow cleaning to be a single line item at project end. Progressive cleaning is a direct cost of each phase. Under-budgeting progressive cleaning causes finish damage, subcontractor disputes, and schedule delays.

---

# SECTION 5: CONSTRUCTABILITY FLAGS

> **AI Behavioral Rule:** When NOVATerra detects any of the following conditions in project scope, drawings, or description, it must raise a constructability flag in the estimate with an explanation and recommended action.

---

## 5.1 Access-Driven Difficulty

| Condition | Flag | Suggested Action |
|---|---|---|
| Site with < 20 feet of clearance on any side | TIGHT_SITE | Add premium for material staging, limited laydown, possible street permits |
| Urban infill with no street-level staging | URBAN_LOGISTICS | Add hoisting plan, just-in-time delivery premium (10–20% labor) |
| Interior demo/renovation in occupied building | OCCUPIED_PHASING | Phase plan required; off-hours premium (50–100% labor uplift) |
| Below-grade work with water table < 5 feet below slab | DEWATERING | Dewatering plan required; can add $50K–$500K to project |
| Roof work with no crane access and material over 50 LB | ROOF_LOGISTICS | Crane or hoist plan required |
| Work above occupied occupied space | OVERHEAD_PROTECTION | Debris netting or plywood deck required; phasing required |

---

## 5.2 Design-Driven Difficulty

| Condition | Flag | Suggested Action |
|---|---|---|
| Structural bay spacing > 40 LF with no intermediate support | LONG_SPAN | Verify deflection, add camber; erection bracing required |
| Cantilever > 12 feet | CANTILEVER_RISK | Shoring until structural completion; flag temp support cost |
| Ceiling cavity < 18 inches clear | TIGHT_CEILING | MEP coordination drawings required; may require custom products |
| Curved or non-orthogonal geometry (walls, roofs) | COMPLEX_GEOMETRY | Custom forming premium 25–50%; labor productivity reduction 30–50% |
| Mixed structure types in single project | HYBRID_STRUCTURE | Multiple trade mobilizations; interface coordination required |
| Exterior wall assembly > 12 inches thick with multiple trades | THICK_WALL_COORD | Sequencing plan required; thermal bridging review |
| More than 4 mechanical/electrical systems through same shaft | SHAFT_CONFLICT | BIM coordination required |
| Exposed structure requirements (concrete, steel) | EXPOSED_FINISH | Premium on formwork quality; additional abrasive blasting or grinding |

---

## 5.3 Value Engineering Opportunities

**AI Behavior:** When flagged conditions are detected, NOVA should generate a VE option alongside the base estimate.

| Condition | VE Opportunity | Typical Savings |
|---|---|---|
| Cast-in-place concrete structure < 8 stories | Evaluate structural steel frame | Schedule savings (8–12 weeks); cost depends on market |
| Custom curtain wall specified | Evaluate punched window + panel system | 20–40% of envelope cost |
| Custom millwork specified | Evaluate semi-custom or modular casework | 25–40% of millwork cost |
| Specified stone flooring | Evaluate large-format porcelain | 30–60% of material cost |
| 2×2 ceiling tile with standard grid | Evaluate 2×4 tile or eliminating grid in back-of-house | 15–25% of ceiling cost |
| Multiple mechanical systems (4-pipe fan coil) | Evaluate VRF/VRF-W | 10–20% net; evaluate case by case |
| Steel stair with custom pan | Evaluate prefab stair or open riser | 15–30% |
| Plaster walls | Evaluate Level 5 drywall | 40–60% labor savings |
| Site-built features (reception desk, feature wall) | Evaluate modular or pre-fab | 20–40% |

---

## 5.4 MEP Coordination Challenges

**AI FLAG TRIGGER:** Any project with ceiling cavity less than 30 inches, multi-tenancy MEP, or renovation of existing MEP systems should trigger a coordination flag.

| Challenge | Impact | Required Action |
|---|---|---|
| HVAC duct routing through structural bays | Conflicts with beams; may require offsets | BIM coordination; structural penetration cost (+$150–500/penetration) |
| Plumbing stack above slab | Concrete core drilling required | $200–$600 per core + scheduling coordination |
| Fire sprinkler head layout conflicts with ceiling grid | Head spacing must align with 2×2 or 2×4 module | Coordination drawing required; relocation premium $50–$150/head |
| Electrical conduit + HVAC in same joist bay | Common conflict in open web joists | Strict routing plan; first-in rules apply |
| Low-voltage pathways through fire-rated walls | Penetration sealing required per UL | $25–$75 per penetration (firestop material + inspection) |
| Generator fuel line routing | Long runs require seismic restraint and slope | Add 15–25% to fuel system cost for complex routing |

---

## 5.5 Phasing in Occupied Buildings

**AI RULE:** Any renovation or addition to an occupied building requires a phasing plan as part of the estimate. Occupied building work without a phasing plan should not be priced — it is an incomplete scope.

### Phasing Cost Premiums

| Condition | Labor Premium | Notes |
|---|---|---|
| Work during business hours in occupied space | +20–35% | Noise restrictions, limited access windows |
| Work after hours (6PM–6AM) | +50–100% | Overtime + premium for all trades |
| Work with infection control (hospital, clean room) | +30–50% | ICRA protocol; negative pressure; barriers |
| Weekend work only | +50–75% | Limited crew availability; premium pay |
| Phased area access (one room at a time) | +40–60% | Setup/breakdown per phase; no staging |
| Dust/noise restrictions (legal, judicial, healthcare) | +25–40% | Work window limitations, slow-cut requirements |

### Critical Phasing Requirements
1. **ICRA (Infection Control Risk Assessment)** — Required for any healthcare construction
2. **Temporary egress plan** — Required when existing exit is blocked even temporarily
3. **Firewatch** — Required when fire detection system is disabled (any duration)
4. **Utility shutdowns** — Must be scheduled with owner; each shutdown is a separate event
5. **Interim occupancy plan** — Certificate required from building dept for change-of-use phases

---

# APPENDIX: AI COMPUTATION RULES SUMMARY

> **Sarah Chen:** The following rules are formatted for direct use in NOVATerra's estimation logic engine.

## Production Rate Application Rules

```
RULE: Apply_Market_Factor
  IF region = "NYC_Metro" THEN productivity_factor = 0.70
  IF region = "Northeast" THEN productivity_factor = 0.85
  IF region = "Midwest" THEN productivity_factor = 1.00
  IF region = "Southeast" THEN productivity_factor = 1.05
  IF region = "West_Coast" THEN productivity_factor = 0.90

RULE: Apply_Shift_Factor
  IF shift_hours = 8 THEN shift_factor = 1.00
  IF shift_hours = 10 THEN shift_factor = 1.15
  IF shift_hours = 12 THEN shift_factor = 1.25
  NOTE: Hours > 12 require additional analysis; fatigue factor applies

RULE: Apply_Winter_Factor (Nov 15 – Mar 15, northern latitudes)
  IF work_type IN [concrete, masonry, earthwork, exterior_finishes]
     AND project_location.lat > 39.5 THEN
     winter_productivity_factor = 0.75–0.85
     ADD winter_conditions_cost = [heating + enclosures + materials]

RULE: Flag_Long_Lead
  IF item IN long_lead_list AND design_phase < "CDs_90%"
     THEN FLAG "ORDER NOW — [item] has [n]-week lead time"

RULE: Schedule_Extension_Cost
  IF project_duration_extension > 0 weeks THEN
     added_GC_cost = extension_weeks × weekly_GC_burn_rate
     NOTE: This is a direct cost impact; present to estimator for review

RULE: Constructability_Flag
  FOR EACH scope_element IN project_scope:
     IF matches ANY condition IN Section_5 THEN
        RAISE flag WITH description AND recommended_action AND cost_impact
```

---

*NOVA-FIELD Knowledge Base v1.0 | NOVATerra AI Layer | Compiled by: DeLuca, Franklin, Chen*
*For internal NOVATerra AI consumption. All rates are representative mid-range values for estimation guidance. Final numbers require local market verification.*
