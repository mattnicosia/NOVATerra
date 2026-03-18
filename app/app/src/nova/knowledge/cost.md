# NOVA-Cost — Estimating Knowledge Base
## Simulated Board: Mike DeLuca · Chamath Palihapitiya · Reid Hoffman

> **Mike DeLuca** — 30 years commercial GC estimating. Ground truth on cost.  
> **Chamath Palihapitiya** — Marketplace strategy. What makes an estimate win or lose.  
> **Reid Hoffman** — Data moat. What compounds with more estimates over time.

---

# SECTION 1 — CSI MASTERFORMAT STRUCTURE

## 1.1 All 50 Divisions: Typical $/SF Ranges (Commercial, 2024 USD, Mid-Market U.S.)

> **Mike:** These are representative ranges for mid-rise commercial work in a mid-cost metro (think Columbus, Charlotte, Denver). Coastal or union markets scale these up 20–60%. Super-high-finish work can 2x the interior divisions.

| Division | Name | $/SF Range | Notes |
|----------|------|------------|-------|
| 00 | Procurement & Contracting | — | Soft cost; not in hard cost budget |
| 01 | General Requirements | $8–$22/SF | Field supervision, temp facilities, insurance, bonds |
| 02 | Existing Conditions | $1–$15/SF | Wide range; abatement can explode costs |
| 03 | Concrete | $12–$40/SF | Structural dominant; slab-on-grade vs elevated |
| 04 | Masonry | $4–$25/SF | If in scope; can be $0 on curtainwall buildings |
| 05 | Metals | $18–$55/SF | Structural steel + misc metals + stairs |
| 06 | Wood, Plastics & Composites | $2–$20/SF | Low in commercial; high in hospitality/multifamily |
| 07 | Thermal & Moisture Protection | $8–$28/SF | Roofing + envelope; wide spec range |
| 08 | Openings | $10–$45/SF | Curtainwall can dominate; hollow metal vs storefront |
| 09 | Finishes | $15–$60/SF | Most variable division; spec-driven |
| 10 | Specialties | $2–$8/SF | Toilet partitions, signage, fire extinguishers |
| 11 | Equipment | $1–$40/SF | $0 for office; $30+ for healthcare/food service |
| 12 | Furnishings | $2–$25/SF | Often owner-furnished; FF&E allowances |
| 13 | Special Construction | $0–$50/SF | Pools, cleanrooms, blast resistance, etc. |
| 14 | Conveying Equipment | $2–$10/SF | Elevators and escalators; amortized over floors |
| 21 | Fire Suppression | $3–$8/SF | Wet pipe vs pre-action; hazard classification |
| 22 | Plumbing | $8–$22/SF | Fixture count + trap primer + specialty fluids |
| 23 | HVAC | $18–$55/SF | System type is everything: VAV vs VRF vs DOAS |
| 25 | Integrated Automation | $2–$12/SF | BAS/BMS; often underestimated |
| 26 | Electrical | $18–$50/SF | Service size + lighting controls + specialty power |
| 27 | Communications | $4–$15/SF | Low voltage, data, AV |
| 28 | Electronic Safety & Security | $2–$10/SF | Access control, cameras, intrusion |

> **Note:** Divisions 15–20 are reserved (not used). Division 31–49 (Site/Civil) are highly project-specific and excluded from above; see section 4 for site factor methodology.

---

## 1.2 Cost Dominance by Project Type

### Office (Class A)
**Dominant Divisions:** 05, 07, 08, 09, 21–28  
**Why:** Steel structure, curtainwall envelope, open-plan finishes, and full MEP. Div 09 (finishes) is the spec battleground — same floor plan, wildly different cost depending on spec.  
**Ballpark:** $200–$380/SF core & shell; $280–$500/SF full fit-out, coastal.

### Healthcare
**Dominant Divisions:** 11, 22, 23, 25, 26, 28  
**Why:** Equipment (Div 11) and MEP together can represent 45–55% of total cost. Infection control, air pressure relationships, medical gas, and redundant power are cost multipliers unavailable in any other sector.  
**Ballpark:** $450–$900/SF for acute care; MOBs are closer to $350–$550/SF.

### Retail (Big Box / Inline)
**Dominant Divisions:** 08, 09, 12  
**Why:** Tenant-driven spec on finishes, storefronts, and fixtures. Big box is fast and cheap ($60–$120/SF shell). High-end inline retail can run $200–$350/SF fit-out.  
**Ballpark:** $60–$120/SF shell; $150–$350/SF high-end interior.

### Industrial / Warehouse
**Dominant Divisions:** 03, 05, 13  
**Why:** Tilt-wall or pre-engineered metal building structural systems. Slab is often the single largest line item. Clear height is the #1 unit cost driver — 28' clear is substantially more expensive than 24' clear.  
**Ballpark:** $65–$130/SF (shell); add $30–$80/SF for freezer/cold storage.

### Education (K-12 / Higher Ed)
**Dominant Divisions:** 09, 11, 12, 21–28  
**Why:** Durable finishes (VCT, CMU, epoxy), specialty equipment (labs, cafeteria), and full MEP to ASHRAE 90.1. Public work often hits prevailing wage. Modular/prefab increasingly common.  
**Ballpark:** $280–$480/SF for K-12 new construction; higher ed can push $500–$700/SF.

### Hospitality
**Dominant Divisions:** 06, 09, 11, 12  
**Why:** Finish quality and millwork drive cost. Custom casework (Div 06), tile, stone, carpet, and FF&E are where budget goes. Branded hotel PIPs can lock specification to brands' standards, removing value engineering flexibility.  
**Ballpark:** $250–$450/SF select service; $400–$700/SF full service/luxury.

---

## 1.3 Common Scope Gaps Between Divisions

> **Mike:** These are the gaps that burn estimators. Every missed scope gap is a job that comes in over budget.

| Gap Zone | What Gets Missed |
|----------|-----------------|
| Div 03 / Div 05 | Embed plates, anchor bolts, blockouts — who furnishes and who installs? Often neither sub claims it until the RFI |
| Div 07 / Div 08 | Sealants and flashing at window perimeters — roofing says it's glazing, glazing says it's roofing |
| Div 09 / Div 10 | Toilet accessory blocking — Div 09 framer has to rough it in before drywall; Div 10 sub usually shows up after |
| Div 22 / Div 23 | Insulation of plumbing lines in mechanical rooms — plumber and HVAC sub both exclude it |
| Div 26 / Div 23 | Power to HVAC equipment — electrical says "by mechanical," mechanical says "by electrical" |
| Div 26 / Div 27 | Conduit runs for low voltage — who provides home runs back to IDF/MDF? |
| Div 01 / All | Temporary hoisting, material handling, dumpsters — GC assumes subs include, subs assume GC includes |
| Div 02 / Div 31 | Existing utility relocation — civil/geotech scope end where Div 02 demo begins; unclear who moves active utilities |

---

## 1.4 Sub Overlap Matrix (Who Covers What)

| Scope Item | Typical Responsible Trade | Common Conflict |
|------------|--------------------------|-----------------|
| Rough-in for owner-furnished equipment | Plumbing + Electrical split | Both exclude rough-in if OFE is not on drawings |
| Fire stopping penetrations | Firestopping sub or GC self-perform | Each trade creates penetrations; firestopping is an afterthought |
| Concrete patching after mechanical core drilling | Typically GC, but often excluded | Mechanical sub drills, leaves rough holes |
| Elevator pit waterproofing | Div 03 or Div 07 | Structural says "not structural waterproofing"; roofing says "below grade is not us" |
| Generator pad and fuel piping | Electrical vs Plumbing | Electrical provides the pad, but fuel oil piping is plumbing; disconnect often at skid boundary |

---

# SECTION 2 — COST DRIVERS BY DIVISION

## Division 03 — Concrete

**Primary Driver:** Labor (placing/finishing) + Equipment (formwork)  
**Productivity:** Slab on grade: 400–600 SF/day per crew of 4 finishers. Elevated deck: 150–300 SF/day depending on forming system.  
**Material Volatility:** Cement and fly ash tied to energy and supply chain. 2021–2023 saw 30–50% swings. Rebar follows steel market closely.  
**Spec Choices That Matter:**
- Post-tensioned slab vs conventionally reinforced: PT reduces slab thickness, saves structural cost, but adds tendon labor
- Polished concrete vs VCT: $4–6/SF vs $3–5/SF + base, but polished has longer labor tail and grinding equipment cost
- Fiber reinforced vs rebar in slabs: faster but less flexible for future coring

**Waste Factor:** 5–8% for concrete volume; 10–15% for rebar  
**VE Moves:** Reduce slab thickness with PT; switch to lightweight concrete for elevated decks; use jump forms vs crane-set panels

---

## Division 04 — Masonry

**Primary Driver:** Labor  
**Productivity:** CMU block: 200–300 units/day per mason. Face brick: 400–600 units/day.  
**Material Volatility:** Moderate. Brick supply is regional; certain colors/textures have 12–20 week lead times.  
**Spec Choices That Matter:**
- CMU vs metal stud backup: CMU adds weight, reduces floor area, but is more durable and simpler fire rating
- Thin brick vs full brick veneer: $12/SF vs $18–28/SF; thin brick delamination risk is real

**Waste Factor:** 5% for block; 8–10% for brick  
**VE Moves:** Reduce coursing height; eliminate decorative soldier courses; switch to EIFS on upper floors

---

## Division 05 — Metals

**Primary Driver:** Material (steel) + Labor (erection)  
**Productivity:** Structural steel erection: 2–4 tons/day per 4-person crew depending on member size and connection complexity.  
**Material Volatility:** HIGH. Steel is among the most volatile commodities in construction. HSS and wide flange prices can move 20–40% in a single year. Always escalate steel separately.  
**Spec Choices That Matter:**
- AISC 360 vs seismic detailing (AISC 341): seismic can add 15–25% to steel cost
- Hollow structural section vs wide flange columns: HSS is more architecturally clean but heavier per linear foot for equivalent load
- Galvanized vs painted misc metals: galvanized is 10–15% premium but eliminates field painting

**Waste Factor:** 3–5% for structural; 10% for misc metals  
**VE Moves:** Reduce bay spacing to reduce member sizes; substitute HSS with pipe where aesthetic is secondary; eliminate transfer beams through structural redesign

---

## Division 06 — Wood, Plastics & Composites

**Primary Driver:** Labor (custom millwork and framing)  
**Productivity:** Rough framing: 500–800 SF/day per crew of 3. Custom millwork: owner-specific; no standard productivity — price by linear foot.  
**Material Volatility:** HIGH for lumber (COVID demonstrated 3x spikes). MDF and plywood track lumber closely.  
**Spec Choices That Matter:**
- Custom millwork vs semi-custom vs modular casework: custom can be 3–5x modular cost
- Solid surface vs laminate counters: $80–120/LF vs $25–40/LF
- Engineered hardwood vs solid wood flooring: 20–30% cost savings; comparable performance

**Waste Factor:** 10–15% for framing lumber; 8% for sheet goods  
**VE Moves:** Reduce millwork linear footage; switch from custom to semi-custom; substitute solid surface with laminate at low-visibility locations

---

## Division 07 — Thermal & Moisture Protection

**Primary Driver:** Material (membrane, insulation) + Labor (installation quality)  
**Productivity:** TPO roofing: 1,000–1,500 SF/day per crew of 3. EIFS: 200–400 SF/day.  
**Material Volatility:** Moderate–high. Petroleum-based membranes track oil prices. Polyiso insulation spiked during supply chain disruptions.  
**Spec Choices That Matter:**
- TPO vs EPDM vs PVC: TPO is cost/performance sweet spot; PVC adds 15–25% but superior chemical resistance; EPDM is most economical
- R-value targets: code minimum vs 10–20% above for LEED/energy credit
- Air barrier: fluid-applied vs mechanically attached sheet; fluid-applied is faster but requires dry conditions

**Waste Factor:** 10–15% for sheet membrane; 5% for rigid insulation  
**VE Moves:** Reduce roof insulation to code minimum; eliminate green roof if in program; switch to face seal vs drainage plane on exterior wall system

---

## Division 08 — Openings

**Primary Driver:** Material (glazing, framing) + Labor (installation precision)  
**Productivity:** Hollow metal frames: 6–10 frames/day per carpenter. Curtainwall: highly variable; typically 500–800 SF/day per 4-person crew.  
**Material Volatility:** Aluminum extrusions track LME aluminum closely. Glass has moderate volatility; specialty coatings (fritted, heat-treated) have longer lead times and pricing premiums.  
**Spec Choices That Matter:**
- Curtainwall vs punched window vs storefront: curtainwall is $80–120/SF; storefront is $45–65/SF; punched window is cheapest but limits daylight
- Hollow metal vs wood doors: HM is $600–$1,200/door installed; WD is $400–$800 depending on veneer/finish
- Hardware spec: standard lever set vs access-controlled panic hardware — 3–5x cost per door

**Waste Factor:** 5% for frames; minimal for custom-sized glazing (made to order)  
**VE Moves:** Reduce glazing percentage; switch curtainwall to storefront in low-visibility zones; standardize door hardware sets

---

## Division 09 — Finishes

> **Mike:** This is where estimates live and die. Same building, same structure, can be a $180/SF interior or a $380/SF interior. Spec discipline here is everything.

**Primary Driver:** Labor (skilled trades: tile setters, painters, carpet installers) + Material (highly spec-driven)  
**Productivity:**
- Drywall framing: 400–700 SF/day per crew of 2
- Drywall hanging: 800–1,200 SF/day per crew of 2
- Painting (roller): 2,000–3,500 SF/day per painter (depending on cuts and conditions)
- Ceramic/porcelain tile: 100–150 SF/day per tile setter
- Carpet: 500–800 SF/day per installer

**Material Volatility:** Gypsum/drywall: moderate. Flooring materials: varies widely by product. Porcelain tile can range $2–$20/SF material alone.  
**Spec Choices That Matter:**
- 5/8" Type X vs 1/2" standard GWB: fire rating assemblies are non-negotiable; verify UL design number
- Porcelain vs ceramic tile: porcelain is $1–4/SF more in material; harder to cut = 10–15% longer labor
- LVP vs carpet vs polished concrete: labor implications are significant; polished concrete is front-loaded (grinding, densifying)
- Acoustic ceiling tile: standard 2x4 vs specialty tegular vs open plenum: $3–6/SF vs $6–12/SF vs $1/SF (painted structure)

**Waste Factor:** 10–15% for tile; 8% for carpet; 5% for drywall  
**VE Moves:** Reduce tile scope; substitute LVP for carpet in high-wear zones; open plenum ceiling in back-of-house

---

## Division 10 — Specialties

**Primary Driver:** Material + Owner Specification  
**Typical Items:** Toilet partitions ($300–$800 each), lockers, fire extinguisher cabinets, operable partitions, corner guards, signage  
**VE Moves:** Simplify partition systems; reduce operable wall spec; combine signage with owner vendor

---

## Division 11 — Equipment

**Primary Driver:** Equipment procurement  
**Volatility:** Extreme — equipment is project-specific, vendor-quoted. Healthcare equipment changes lead times and cost annually. Food service equipment tracks stainless steel market.  
**Key Rule:** Never estimate Div 11 parametrically. Always get vendor quotes. An allowance without a vendor quote is a liability.  
**VE Moves:** Owner-furnished equipment (OFE) strategy; value-engineer kitchen layout for operational flow vs contractor convenience

---

## Division 12 — Furnishings

**Primary Driver:** Specification and procurement  
**Note:** Often breaks into GC scope (fixed seating, blinds) vs FF&E (owner-procured). Boundary must be defined in bid documents. Treat as allowance unless designed.  
**VE Moves:** Extend owner-furnished scope; reduce built-in furniture in favor of freestanding

---

## Divisions 21–28 — MEP & Technology Systems

### Division 21 — Fire Suppression
**Driver:** Pipe material (CPVC vs Schedule 10 black steel) + hazard classification  
**Ranges:** Wet pipe: $3–5/SF. Pre-action/deluge: $7–12/SF. High-piled storage/special hazard: $12–20/SF+  
**VE Moves:** Confirm hazard classification with AHJ early; CPVC in office instead of steel

### Division 22 — Plumbing
**Driver:** Fixture count + linear footage of distribution  
**Key Rule:** Plumbing cost correlates most directly with fixture count and pipe length, not floor area. High-fixture-density buildings (healthcare, food service) are outliers to $/SF metrics.  
**VE Moves:** Stack plumbing vertically; reduce fixture count; specify less expensive trim packages

### Division 23 — HVAC
**Driver:** System type is the dominant variable  

| System Type | $/SF Range | Notes |
|-------------|------------|-------|
| Packaged RTU | $15–22 | Simple retail/warehouse |
| VAV with reheat | $28–40 | Standard commercial office |
| VRF (multi-split) | $25–38 | Good for retrofit; tenant flexibility |
| Chilled water / 4-pipe | $38–60 | High-end office, healthcare |
| DOAS + radiant | $45–70 | High performance, LEED Platinum |

**VE Moves:** Reduce system from 4-pipe to 2-pipe; reduce perimeter heating; use packaged equipment instead of central plant

### Division 25 — Integrated Automation
**Driver:** Points count, software license, and commissioning  
**Rule:** BAS is chronically underestimated. Typical miss is 30–50% on first estimate. Involves multiple trades (HVAC controls, lighting controls, access, security integration) and scope gaps are rampant.

### Division 26 — Electrical
**Driver:** Service size + lighting control complexity + specialty power  
**Key Variables:** Electrical is highly sensitive to data center/lab loads, EV charging infrastructure, and code-required lighting controls.  
**Material Volatility:** Copper is the most volatile commodity in electrical. A 20% copper swing on a $2M electrical budget is a $40K exposure.  
**VE Moves:** Reduce lighting control zones; defer EV charging infrastructure to future phase; reduce panel and switchgear redundancy

### Division 27 — Communications
**Driver:** Cable runs, infrastructure quantity, and AV specification  
**VE Moves:** Reduce AV scope; eliminate redundant pathways; specify Category 6 vs 6A where bandwidth permits

### Division 28 — Electronic Safety & Security
**Driver:** Camera count, access hardware, and integration complexity  
**VE Moves:** Reduce camera density in low-risk zones; simplify access control to key entry points only

---

# SECTION 3 — PRICING METHODOLOGY

## 3.1 Unit Cost vs Assembly vs Parametric

| Method | When to Use | Accuracy | Speed |
|--------|-------------|----------|-------|
| **Parametric ($/SF, $/unit)** | Conceptual through Schematic | ±20–40% | Fastest |
| **Assembly-based** | Design Development | ±10–20% | Moderate |
| **Unit Cost (detailed takeoff)** | Construction Documents | ±5–10% | Slowest |

> **Mike:** The mistake is using the wrong method for the phase. Running a detailed takeoff on a schematic set gives you false precision. Running a $/SF on a CD set loses you money.

---

## 3.2 $/SF vs Detailed Takeoff Decision Matrix

Use $/SF when:
- Project is in early design (conceptual through SD)
- Comparing design options
- Owner is asking for order-of-magnitude budget
- Project type is similar to recent comparable projects

Use detailed takeoff when:
- CDs are 90%+ complete
- Significant specialty scope is present
- You are submitting a hard bid
- The project has site conditions that deviate from typical

---

## 3.3 Crew Rate Build-Up

```
Base Wage (journeyman)                         $XX.XX/hr
+ Fringe Benefits (pension, health, training)  + $X.XX–$XX.XX/hr
= Total Craft Cost                             $XX.XX/hr

+ Payroll Burden (FICA, FUTA, SUI, WC, GL)    ~30–38% of base wage
= Fully Burdened Labor Rate                   $XX.XX/hr

Crew Mix Example (carpenter crew):
  1 Foreman @ $XX.XX
  3 Journeymen @ $XX.XX
  1 Apprentice @ $XX.XX
  = Blended Crew Rate / hr

÷ Productivity (SF/hr or units/hr)
= Labor Cost per Unit of Work
```

> **Mike:** The burden rate is where most young estimators get killed. A $35/hr carpenter is really $48–52/hr fully burdened. Add foreman time, and your crew rate on paper becomes something very different on the job.

---

## 3.4 Markup Structure (Bottom-Up)

```
Direct Cost (material + labor + equipment)
+ Subcontractor Cost
= Total Direct Cost (TDC)

× GC Markup on Self-Performed Work:     8–15% OH&P
× GC Markup on Sub Work:                3–8% OH&P

= Cost Before General Conditions
+ General Conditions (field overhead):   6–12% of TDC
= Total Project Cost (TPC)

+ Overhead (home office allocation):     2–5% of TPC
+ Profit:                                2–6% of TPC
+ Bond Premium:                          0.5–1.5% of contract

= CONTRACT VALUE / BID PRICE
```

---

## 3.5 Typical GC Markup Ranges

| Scope Category | Typical Range | Notes |
|----------------|---------------|-------|
| Self-performed labor | 8–15% | Compensates for risk, supervision, OH |
| Subcontractor cost | 3–8% | Lower due to sub assuming execution risk |
| Major subs (MEP) | 3–5% | Competition reduces GC leverage |
| Owner-furnished/installed | 0–2% | Coordination only |
| General conditions | 6–12% of TDC | Project duration is primary driver |
| Home office overhead | 2–5% | Volume-dependent |
| Profit | 2–6% | Market-dependent; see Section 6 |

---

## 3.6 Contingency Strategy

| Phase | Design Contingency | Construction Contingency | Escalation |
|-------|-------------------|-------------------------|------------|
| Conceptual | 15–25% | 5–10% | 5–10% |
| Schematic Design | 10–15% | 5–10% | 3–7% |
| Design Development | 5–10% | 3–5% | 2–5% |
| 90% CDs | 2–5% | 2–3% | 1–3% |

> **Chamath:** Contingency is the honesty layer in an estimate. GCs who compress contingency to win work and then draw on owner contingency to survive are extracting value from clients. The GCs who model contingency well are the ones who hit budget and get invited back.

---

# SECTION 4 — REGIONAL COST FACTORS

## 4.1 What Drives Regional Variation

**Labor Rates:** The dominant variable. A union ironworker in NYC earns 2.5–3x what a non-union ironworker earns in rural Southeast. Labor accounts for 35–50% of construction cost, so this is the primary regional lever.

**Union vs Open Shop:** Union markets (NYC, Chicago, Boston, San Francisco) carry 20–50% labor premium over open shop markets (Southeast, parts of Texas, Mountain West). Union brings higher productivity on complex work but is structurally more expensive.

**Material Availability:** Concrete aggregates, lumber, and brick are regionally sourced. Transportation cost adds 5–20% premium in remote markets. Dense metro markets have supply chain depth; rural markets do not.

**Code Requirements:** California Title 24 (energy), NYC Local Law compliance, Florida wind load requirements, seismic zones (Pacific Coast, New Madrid) all add cost. IECC code cycle adoption varies by state and can affect envelope and MEP costs by 5–15%.

---

## 4.2 Major Metro Premium Factors (Baseline = 1.00, Midwest mid-size city)

| Market | Cost Factor | Notes |
|--------|-------------|-------|
| New York City | 1.45–1.65 | Union, high logistics cost, complex permitting |
| San Francisco Bay Area | 1.40–1.60 | Union, labor shortage, high land cost |
| Boston | 1.30–1.50 | Union-dominant, strong local labor rules |
| Chicago | 1.25–1.40 | Union, competitive GC market |
| Los Angeles | 1.30–1.50 | Union, seismic requirements, congestion |
| Seattle | 1.25–1.40 | Union, active market, moisture detailing premium |
| Washington D.C. | 1.25–1.35 | Prevailing wage on most public work |
| Denver | 1.05–1.20 | Growing, labor market tightening |
| Dallas / Houston | 0.95–1.10 | Open shop dominant, competitive labor market |
| Atlanta | 0.90–1.05 | Open shop, strong subcontractor base |
| Phoenix | 0.95–1.10 | Active market; heat complicates schedules |
| Nashville / Charlotte | 0.90–1.05 | Growing; some labor tightening |
| Rural / Secondary Markets | 0.85–0.95 | Lowest labor cost, limited sub competition |

---

## 4.3 Prevailing Wage / Davis-Bacon Impact

**Federal Prevailing Wage (Davis-Bacon Act):** Applies to federal and federally-assisted construction contracts exceeding $2,000. Sets minimum wage rates by trade and locality, published by DOL. In many markets, Davis-Bacon rates equal or exceed union scale.

**State Prevailing Wage:** Many states have their own prevailing wage laws (California, New York, New Jersey, Illinois, etc.) that apply to state-funded and some local projects. California prevailing wage in major metros can add 20–35% to labor cost vs private market rates.

**Practical Impact on Bid:**
- Payroll records and certified payroll reports are required — adds administrative cost
- Fringe benefit compliance requires careful HR coordination
- On a $10M project in a prevailing wage jurisdiction, Davis-Bacon compliance can add $400K–$1.2M vs open shop pricing

---

## 4.4 Seasonal Pricing Factors

| Condition | Affected Scope | Cost Impact |
|-----------|---------------|-------------|
| Winter concrete (below 32°F) | Div 03 | +$1.50–$4/SF for heated enclosures, admixtures |
| Rainy season roofing | Div 07 | Premium for scheduling risk; 15–25% delay factor |
| Summer heat (Southwest) | All labor-intensive | Productivity drops 15–25% above 95°F; mandated breaks |
| Late season steel | Div 05 | Mill lead times extend in fall; expedite fees if needed |
| Pre-hurricane season MEP | Div 21–28 in Southeast | Pricing spikes in May–June as contractors get booked |

---

## 4.5 Supply Chain & Lead Time Factors

> **Mike:** Lead time doesn't just affect schedule. It affects price. If you spec something with a 40-week lead time and you're bidding a 12-month project, you're either changing the spec or paying an expedite premium. Know this before bid day.

| Item | Typical Lead Time (2024) | Price Risk |
|------|-------------------------|------------|
| Structural steel (fabricated) | 16–24 weeks | HIGH — lock price at contract |
| Elevator (mid-rise) | 28–48 weeks | HIGH — order at NTP or lose schedule |
| Custom curtainwall | 20–36 weeks | HIGH — design freeze drives price |
| Switchgear (medium voltage) | 30–52 weeks | VERY HIGH — shortage continues post-COVID |
| Generators (400kW+) | 40–60 weeks | VERY HIGH |
| HVAC chillers | 20–36 weeks | HIGH |
| Low voltage equipment | 8–16 weeks | MODERATE |
| Doors & hardware | 12–20 weeks | MODERATE |
| Standard roofing | 2–4 weeks | LOW |

---

# SECTION 5 — ROM (ROUGH ORDER OF MAGNITUDE) METHODOLOGY

## 5.1 When ROM Is Appropriate

ROM is appropriate when:
- Owner is evaluating project feasibility
- Design is less than 30% complete
- Comparing multiple program options
- Quickly screening a potential bid opportunity
- Responding to a client's budget question before design contract is signed

ROM is NOT appropriate when:
- Submitting a hard bid
- A GMP is being established
- Project has significant site unknowns
- Client will make a major financial decision based on the number

> **Chamath:** ROM is a sales tool as much as it's an estimating tool. The GC who delivers a well-reasoned ROM with clear assumptions builds credibility. The one who delivers a sloppy number and then re-estimates at CD phase has already lost trust.

---

## 5.2 Confidence Ranges by Phase

| Phase | Design Completion | ROM Range |
|-------|-------------------|-----------|
| Conceptual | 0–10% | ±30–50% |
| Schematic Design | 10–30% | ±20–30% |
| Design Development | 30–60% | ±10–20% |
| Construction Documents (50%) | 60–80% | ±10–15% |
| Construction Documents (90%) | 80–95% | ±5–10% |

**The correct way to report ROM:**  
Always express as a range, not a point estimate.  
"This project is estimated at $18–$24M based on current program assumptions."  
Never: "This project will cost $21M." (at conceptual phase)

---

## 5.3 How to Calibrate ROM from Historical Data

**Step 1:** Build a normalized cost database. Store past projects as $/SF by building type, location, and year.  
**Step 2:** Adjust historical cost forward using ENR CCI (Construction Cost Index) or RSMeans historical escalation tables.  
**Step 3:** Apply location factor from your regional database.  
**Step 4:** Apply project-specific complexity modifiers (see Section 5.5).  
**Step 5:** Apply phase-appropriate contingency from Section 3.6.

**Normalization Formula:**
```
Adjusted Historical Cost/SF = 
  (Historical Cost/SF) 
  × (Current CCI / Historical CCI) 
  × (Current Location Factor / Historical Location Factor)
  × Complexity Modifier
```

---

## 5.4 Red Flags That Indicate ROM Will Be Inaccurate

- Unusual building height (>12 stories adds premium; super-tall is non-parametric)
- Significant site remediation or shoring requirements
- High-density MEP scope not reflected in building type comparables
- Program assumptions are incomplete or in flux
- Client has a fixed budget that does not align with market data (budget-driven vs market-driven)
- Complex structural system (transfer floors, long-span atrium, cantilevers)
- Historic building renovation with unknown existing conditions
- Fast-track schedule requiring premium labor or multiple-shift work

---

## 5.5 Building Height, Complexity & Site Condition Multipliers

| Factor | Modifier Range | Notes |
|--------|---------------|-------|
| 1–4 story (baseline) | 1.00 | Baseline for most commercial |
| 5–12 story | 1.05–1.15 | Hoisting, higher GC overhead, more complex logistics |
| 13–25 story | 1.15–1.30 | Tower crane, floor-by-floor logistics |
| 25+ story | 1.30–1.50+ | Parametric breaks down; require detailed estimate |
| Simple program | 1.00 | Standard commercial |
| Moderate complexity | 1.10–1.20 | Some specialty systems |
| High complexity | 1.20–1.40 | Healthcare, data center, lab |
| Extreme specialty | 1.40–1.80+ | Cleanroom, BSL-3/4, mission critical |
| Flat/accessible site | 1.00 | Easy access, no shoring |
| Sloped site with shoring | 1.05–1.15 | Adds Div 03 and temporary earth retention |
| Below-grade parking | 1.20–1.35 | Adds significant Div 03, waterproofing, ventilation |
| Urban infill with neighbor protection | 1.10–1.20 | Underpinning, monitoring, access constraints |

---

# SECTION 6 — BID STRATEGY INTELLIGENCE

> **Chamath:** Most construction estimating software is cost calculation software. The gap in the market is that none of it is pricing strategy software. Cost ≠ Price. This section is where NOVA can be genuinely differentiated.

## 6.1 How GCs Decide Markup Based on Competition Level

**The Competitive Pressure Equation:**
```
Expected Competition Level → Adjusts Profit Margin Target
  - 3 or fewer bidders:      Target 5–8% profit
  - 4–6 bidders:             Target 3–5% profit
  - 7+ bidders:              Target 2–4% profit; evaluate if bid makes sense
  - Negotiated / sole source: Target 6–10%+ profit
```

**How GCs Assess Competition:**
- Who else is invited to bid (pre-bid list from owner/architect)
- Who picked up plans (plan room data, BuildingConnected bid invites)
- Competitor capacity: who is busy, who is hungry
- Competitor specialty: some GCs are better suited to the project type
- Relationship intel: who has a relationship with the owner or A/E

---

## 6.2 "Must-Win" Pricing vs Standard Pricing

**Must-Win conditions:**
- Relationship client: losing means relationship damage
- Strategic project type: new sector entry
- Capacity fill: backlog is dangerously thin
- Geographic expansion: needed for bonding capacity or licensing in new market

**Must-Win Tactics:**
- Reduce profit margin to 1–2%
- Self-perform more scope to improve margin on labor
- Identify value engineering items to offer in the bid
- Offer schedule acceleration or risk sharing
- Consider joint venture with a better-positioned firm

**Standard Pricing:** Apply market-rate markup with appropriate profit. Win rate target: 20–35% on competitive bid. If you're winning more than 40% of bids, you're leaving money on the table.

---

## 6.3 Relationship With Owner/Architect: Pricing Impact

| Relationship Type | Typical Impact on Pricing |
|-------------------|---------------------------|
| Repeat owner, no competition | +2–4% on profit target; faster estimate process |
| Preferred GC (pre-qualified only) | Moderate competition; still price to win but less pressure |
| New owner, competitive bid | Standard competitive pricing |
| Owner with history of scope change | Price contingency higher; add allowances vs hard prices |
| Architect you have history with | Can price more aggressively; trust reduces risk |
| Unknown owner, private funding | Price risk premium; vet owner creditworthiness |

---

## 6.4 Bid Day Mistakes and How to Avoid Them

| Mistake | Prevention |
|---------|------------|
| Missing last-minute addenda | Close bid file no earlier than 2 hours before due; assign dedicated addenda tracker |
| Sub phone bid errors (mishearing) | Read numbers back to sub; confirm in writing same day |
| Incorrect bid form math | Use formula-checked spreadsheet; two-person review |
| Arithmetic error in scope compilation | Locked bid form; estimator + PM sign off |
| Scope gap discovered at last minute | Pre-bid scope matrix review with PMs 48 hrs before bid |
| Bond premium miscalculation | Have surety pre-calculate for anticipated contract range |
| Escalation not applied to material-heavy subs | Pre-apply escalation factor to steel, copper, aluminum subs |
| Leaving out alternates | Alternate checklist from bid documents review at kickoff |

---

## 6.5 Alternate Pricing Strategy

**Base Bid + Alternates** allows owners to test scope expansion/reduction at known prices.

**GC Strategy for Alternates:**
- Price deduct alternates higher than the true deduct value (preserve margin if owner accepts deducts)
- Price add alternates competitively (add-alts that get accepted improve volume with lower marginal cost)
- Use alternates to lower base bid: move scope into add alternates to get under a budget threshold
- Know which alternates are likely to be accepted based on owner type and budget signals

---

## 6.6 Allowance Strategy (When to Allowance vs Hard Price)

**Use Allowances when:**
- Scope is not designed (material selections TBD)
- Owner has direct purchasing relationships (FF&E)
- Sub market pricing is thin or unavailable
- Specialty scope requires longer design to price accurately

**Allowance Risks:**
- Allowances shift risk to GC if owner's "vision" exceeds the allowance
- Always define allowance scope in writing: unit, quantity, installed vs material-only
- Never allowance structural, MEP, or envelope scope without strong historical data

**Allowance Rule:** Set allowances at the 70th percentile of expected range, not median. This reduces exposure on the upside while remaining competitive.

---

# SECTION 7 — HISTORICAL DATA PATTERNS

> **Reid:** This section is the data moat thesis. A single estimate is a snapshot. Ten thousand estimates are a prediction engine. The question is: what data, captured consistently over time, becomes more valuable the more of it you have?

## 7.1 What Data Points Matter Most for Future Accuracy

**High-value data to capture at every estimate:**

| Data Point | Why It Compounds |
|------------|-----------------|
| Estimate date + bid date | Enables precise escalation normalization |
| Project type + building program | Enables peer comparison |
| Location (market, zip code) | Regional factor calibration |
| $/SF by CSI division | Division-level benchmarking |
| Estimate at bid vs final cost at completion | Accuracy delta by division |
| # of bidders + winning bid | Win/loss data for pricing strategy |
| Bid result (win, lose, no bid) | Portfolio-level win rate analysis |
| Scope gaps identified post-bid | Error pattern identification |
| Sub bids received vs sub bids used | Sub reliability database |
| Material costs at time of bid | Price point reference for escalation |
| Change order log at close | Identifies estimate risk zones |

---

## 7.2 How to Normalize Historical Costs

**Time Normalization:** Apply ENR Construction Cost Index escalation factor.
```
Normalized Cost = Historical Cost × (Current ENR CCI / Historical ENR CCI)
```

**Location Normalization:** Apply relative location factor.
```
Normalized Cost = Historical Cost × (Target Location Factor / Historical Location Factor)
```

**Scope Normalization:** The hard one. Two buildings with the same $/SF may be incomparable if one had a significant site, a structured parking deck, or owner-furnished equipment. Best practice:
- Record scope inclusions/exclusions at the division level in every estimate
- Tag estimates with "scope flags" (includes parking, includes site, excludes FF&E, etc.)
- Only compare estimates with matching scope flags

---

## 7.3 Escalation Calculation Methods

**Method 1: ENR CCI (Annual)**  
Broad construction market index. Best for year-over-year comparison of general commercial work.

**Method 2: Trade-Specific Escalation**  
Steel escalation ≠ concrete escalation ≠ electrical escalation. For material-heavy scopes, apply trade-specific escalation rates from the BLS Producer Price Index (PPI) tables.

**Method 3: Sub-Quoted Escalation**  
Ask subs to quote with escalation clauses for price protection beyond 60–90 days. Useful on large projects with extended procurement periods.

**Method 4: Owner-Side Escalation Fund**  
For projects with 24+ month construction periods, recommend owner carry 3–7% escalation reserve on material-heavy scope.

---

## 7.4 How to Identify Outlier Bids

**Too Low Outlier (potential buy-in or mistake):**
- More than 10% below median of all bids on same scope
- Missing major division (scope gap on bid form)
- Sub has no experience in project type
- No bond capacity for contract size
- Payment history issues in public records

**Too High Outlier (not competitive):**
- More than 15% above second-low bidder
- May indicate misunderstanding of scope
- May indicate too-busy contractor pricing to lose
- May indicate different project approach (over-engineering)

**Outlier Response:**
- Verify scope coverage before dismissing low bid
- Request scope confirmation letter or scope sheet from low bidder
- Document outlier analysis in bid file for owner presentation

---

## 7.5 Pattern Recognition: When Actual > Estimate, Which Divisions Were the Culprits?

> **Mike:** After 30 years I can tell you exactly where estimates blow up. It's not random.

**Chronic Over-Run Divisions (ranked by frequency):**

| Rank | Division | Why |
|------|----------|-----|
| 1 | Div 23 (HVAC) | Scope gaps, change in mechanical engineer at DD phase, owner-added load requirements |
| 2 | Div 03 (Concrete) | Site conditions (groundwater, unsuitable subgrade), design changes requiring re-engineering |
| 3 | Div 09 (Finishes) | Spec upgrade during construction, finish selections made after bid |
| 4 | Div 26 (Electrical) | Added power requirements for owner equipment, AV/technology scope growth |
| 5 | Div 02 (Existing Conditions) | Surprises under slab, hidden mold/asbestos, unknown utilities |
| 6 | Div 01 (General Conditions) | Schedule extension (which is actually a symptom, not a cause) |
| 7 | Div 11 (Equipment) | Owner changes to equipment selection, late vendor information |

**Pattern Implication for NOVA:** Weight these divisions higher in estimate confidence scoring. If Div 23 is estimated parametrically and HVAC system type is unconfirmed, flag the estimate with a warning: *"HVAC system type not confirmed — this line item carries elevated uncertainty."*

---

## 7.6 Reid's Data Moat Thesis: What Gets More Valuable With Scale

> **Reid:** The compounding assets in this knowledge base are not the $/SF numbers — those are commodities. The compounding assets are:

**1. Sub Reliability Database**  
Every time a sub bids and either performs or fails, that's signal. After 1,000 bids, you know which subs cover their scope, which ones buy-in low and change order, and which ones are reliable in which geographies. No competitor can replicate this without the bid volume.

**2. Division-Level Accuracy Delta**  
For each project type, in each geography, track estimate vs actual by division. After enough projects, you can say: "In healthcare MEP in NYC, our Div 23 estimates are systematically 8% low. Adjust." This automatic calibration is not possible without volume.

**3. Owner Behavior Patterns**  
Which owners change scope after award? Which ones add alternates? Which ones trigger escalation disputes? This behavioral data informs bid strategy and risk pricing.

**4. Bid Day Sub Coverage Patterns**  
Which trades go uncovered on bid day? Which subs cover multiple trades? Understanding the sub market structure in each geography allows more accurate last-minute bid assembly.

**5. Win/Loss Pricing Intelligence**  
Over thousands of bids, the relationship between your price, competition level, and win probability becomes a pricing model. This is yield management for construction. No one in the industry has this today.

**6. Material Price Correlation Signals**  
When copper moves X%, Div 26 bids move Y% with a Z-week lag. Building these empirical correlations across commodities and divisions creates a real-time cost signal engine.

> **Chamath:** The GC who figures out that their estimating data is a business asset — not just an internal tool — wins. Every project is a data collection event. The question NOVA has to ask is: is the data being captured in a way that compounds?

---

# APPENDIX — QUICK REFERENCE CARDS

## A1: Bid Budget Sanity Check (Mike's Field Test)

Before submitting any estimate, ask:
1. Does the MEP total to 35–50% of TDC? (If less, check scope coverage.)
2. Does Div 01 (General Conditions) sit at 8–12% of direct cost? (If less, check project duration assumptions.)
3. Is the structural system (Div 03 + 05) 20–35% of hard cost on a mid-rise commercial project? (If less, confirm no scope gaps.)
4. Does the total $/SF match the building type parametric range for this market? (If not, identify why.)
5. Have all lead-time items been identified and sourced? (Elevators, switchgear, generator, curtainwall.)

## A2: Spec Decision Tree — The Cost Levers

```
Envelope Choice:
  Curtainwall → $80–120/SF
  Storefront  → $45–65/SF
  Punched HM  → $25–40/SF

Ceiling System:
  Open plenum (painted structure) → $1–2/SF
  Standard 2x4 ACT               → $4–6/SF
  Linear/specialty ceiling        → $10–18/SF

Floor Covering:
  VCT                → $3–5/SF installed
  Carpet tile        → $6–10/SF installed
  LVP                → $7–12/SF installed
  Porcelain tile     → $14–22/SF installed
  Polished concrete  → $8–14/SF (on existing slab)

HVAC System:
  Packaged RTU  → $15–22/SF
  VAV           → $28–40/SF
  4-pipe CW     → $38–60/SF
```

## A3: Escalation Quick Reference

| Commodity | Index to Track | Typical Volatility |
|-----------|---------------|-------------------|
| Structural steel | CME HRC Futures + AISC Mill Tracker | HIGH (±20–40%/yr) |
| Copper (electrical) | LME Copper | HIGH (±15–30%/yr) |
| Lumber | CME Random Length Lumber Futures | VERY HIGH (±50%+ in disruptions) |
| Concrete (ready-mix) | BLS PPI: Ready-Mix Concrete | MODERATE (±5–15%/yr) |
| Petroleum-based products (roofing, sealants) | WTI Crude | MODERATE–HIGH |
| General CCI | ENR Construction Cost Index | LOW–MODERATE (±3–8%/yr baseline) |

---

*NOVA-Cost Knowledge Base v1.0 | Compiled for NOVATerra AI Platform*  
*Board: Mike DeLuca (Ground Truth) · Chamath Palihapitiya (Strategy) · Reid Hoffman (Data Moat)*
