# NOVA-Specs — Construction Specification Knowledge Base

> Focused on what an estimator needs from specs — the cost-impacting parts.

## Specification Structure

Specs follow CSI MasterFormat with 6-digit section numbers:

**Format:** `XX XX XX` — Division (2 digits) → Level 2 (2 digits) → Level 3 (2 digits)

**Example:** `09 29 00` = Division 09 (Finishes) → Gypsum Board (29) → General (00)

**Each section has 3 parts:**
- **Part 1 — General:** Scope, related sections, submittals, quality assurance, warranties
- **Part 2 — Products:** Materials, manufacturers, performance requirements
- **Part 3 — Execution:** Installation methods, tolerances, cleaning, protection

**Where cost info hides:**
- Part 1: Submittal requirements (cost of mock-ups, samples), warranty durations (longer = more expensive), quality assurance (testing, inspections)
- Part 2: Specified manufacturers (sole-source vs competitive), performance specs (drives material selection), product substitution rules
- Part 3: Surface preparation requirements, installation tolerances (tighter = more labor), protection/cleaning during construction

## Critical Spec Sections by Trade

**For a GC estimator, MUST read these sections:**

| Trade | Critical Sections | What to Extract |
|-------|------------------|----------------|
| General | 01 10 00 - Summary | Scope divisions, work by others, owner-furnished items |
| | 01 21 00 - Allowances | Dollar values and what they cover |
| | 01 23 00 - Alternates | Add/deduct pricing requirements |
| | 01 26 00 - Contract Modification | Change order procedures |
| | 01 31 00 - Coordination | Phasing, scheduling constraints |
| | 01 50 00 - Temporary Facilities | Who provides what, duration |
| | 01 73 00 - Execution | Cutting/patching scope |
| | 01 77 00 - Closeout | Attic stock, O&M manuals, training |
| Concrete | 03 30 00 | Strength, finish, testing requirements |
| Steel | 05 12 00 | Connection type, coating, shop drawings |
| Openings | 08 11-14 | Door materials, fire ratings, hardware |
| | 08 44-45 | Curtain wall / storefront system |
| Finishes | 09 21-29 | Drywall levels, abuse-resistant |
| | 09 30 00 | Tile — material, pattern, grout |
| | 09 51-68 | Ceilings — type, grid, height |
| | 09 91 00 | Paint — coats, prep, primers |
| MEP | 23 05 00 | Common HVAC work results |
| | 26 05 00 | Common electrical work results |

## Scope-Defining Language

**These phrases define who does what:**

- **"Furnish and Install" (F&I)** — Contractor provides material AND labor. Full scope.
- **"Furnish Only"** — Contractor buys/delivers but someone else installs.
- **"Install Only"** — Someone else provides material, contractor installs.
- **"By Owner"** / **"Owner-Furnished"** — Owner pays for and provides.
- **"OFCI"** — Owner Furnished, Contractor Installed. Include installation labor.
- **"By Others"** — Another contractor handles this. Exclude from scope.
- **"N.I.C."** — Not In Contract. Explicitly excluded.
- **"Allowance"** — Include exact dollar amount stated. Track for reconciliation.
- **"Alternate"** — Separate price, add or deduct. Clearly label.
- **"Unit Price"** — Price per unit for quantity adjustments during construction.

**Critical nuance:** "Provide" in specs almost always means "furnish and install." Some specs define it explicitly in Division 01.

## Cost-Impacting Clauses

**These clauses add cost that's easy to miss:**

**Testing & Inspection:**
- Concrete testing (break tests, slump): $500-2,000/test series
- Steel inspection (UT, MT, PT): $2,000-10,000 per project
- Air/water testing of building envelope
- Duct pressure testing
- Fire stopping inspection (3rd party)

**Submittals & Mock-ups:**
- Shop drawing preparation: $500-5,000/submittal depending on complexity
- Physical mock-ups (curtain wall, exterior wall): $5,000-50,000+
- Material samples, color boards
- Resubmittal cycles add time and cost

**Warranties:**
- Standard 1-year = no added cost (included in base)
- Extended warranties (2, 5, 10 year) = manufacturer premium
- Roofing: 20-year NDL warranty = significant premium over 10-year
- Waterproofing: 10-year warranty standard, 20-year adds 10-15%

**LEED / Sustainability:**
- IAQ management during construction (dust barriers, HVAC protection)
- Construction waste diversion (recycling %, documentation)
- Low-VOC materials (paints, adhesives, sealants) — modest premium
- Commissioning (Cx) requirements — 3rd party cost
- Enhanced commissioning = 2x basic commissioning cost

**Working Restrictions:**
- Night/weekend work = 1.5-2x labor rate premium
- Noise restrictions = slower work methods
- Occupied building phasing = reduced productivity (30-50% loss)
- Clean room / sensitive environment = specialty procedures

## Red Flags for Estimators

**Watch for these in specs — they signal hidden cost or risk:**

1. **"Or Equal" without criteria** — Who decides if substitution is equal? Approval risk.
2. **Sole-source specification** — Only one manufacturer. No competitive pricing.
3. **Performance spec without prescriptive backup** — "Achieve STC 55" without saying how. Design responsibility shifts to contractor.
4. **Missing sections** — If drawings show tile but spec has no 09 30 00, scope is unclear.
5. **Contradictions between drawings and specs** — Spec says "Level 5 finish" but drawings show "Level 4." Clarify via RFI.
6. **"As directed by architect"** — Open-ended scope. Price for reasonable interpretation + contingency.
7. **Phasing without schedule** — "Work in phases" without defining phases = coordination nightmare.
8. **Liquidated damages** — Note the daily rate. Factor into schedule risk.
9. **Retainage** — Standard is 10% to 50%, 5% after substantial completion. Affects cash flow.
10. **Indemnification clauses** — Legal cost. Flag for management review.
