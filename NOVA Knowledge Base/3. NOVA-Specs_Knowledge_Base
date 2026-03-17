# NOVA-Specs — Specification Reading Knowledge Base
**NOVATerra Intelligence Layer | Simulated Board: Mike DeLuca · Parker Conrad · Sarah Chen**

---

> **How to read this document:**
> Each section is co-authored by three voices:
> - 🔨 **Mike DeLuca** — Chief Estimator. What costs money. What to read first.
> - 🔗 **Parker Conrad** — Product Thinker. How specs connect to drawings, to costs, to NOVA agents.
> - 🤖 **Sarah Chen** — CTO. Where AI parsing breaks down and how to guard against it.

---

## 1. SPECIFICATION STRUCTURE

### 1.1 CSI MasterFormat — 6-Digit Section Numbering

All modern construction specifications use CSI MasterFormat, organized as a 6-digit code:

```
XX  XX  XX
│   │   └── Section (specific work type)
│   └────── Level 2 (subdivision)
└────────── Division (broad trade or system)
```

**Example:**
```
09  29  00
│   │   └── 00 = base section (no further subdivision)
│   └────── 29 = Gypsum Board
└────────── 09 = Finishes
```

**Key Divisions by Trade Group:**

| Division Range | Trade Group |
|---|---|
| 00 | Procurement & Contracting Requirements |
| 01 | General Requirements |
| 02 | Existing Conditions |
| 03 | Concrete |
| 04 | Masonry |
| 05 | Metals |
| 06 | Wood, Plastics & Composites |
| 07 | Thermal & Moisture Protection |
| 08 | Openings (Doors, Windows, Glazing) |
| 09 | Finishes |
| 10 | Specialties |
| 11 | Equipment |
| 12 | Furnishings |
| 21–23 | Fire Suppression, Plumbing, HVAC |
| 26–28 | Electrical, Communications, Electronic Safety |
| 31–35 | Earthwork, Exterior Improvements, Utilities |

---

### 1.2 Division → Section → Part Structure

Every spec section follows a mandatory three-part format. This is not arbitrary — each Part hides cost in different ways.

```
SECTION XX XX XX — [Section Title]

  PART 1 — GENERAL
    1.1  Summary / Scope
    1.2  References (ASTM, ACI, AISC standards)
    1.3  Submittals
    1.4  Quality Assurance
    1.5  Delivery, Storage, Handling
    1.6  Project Conditions
    1.7  Warranty

  PART 2 — PRODUCTS
    2.1  Manufacturers
    2.2  Materials
    2.3  Fabrication
    2.4  Mixes / Performance Requirements
    2.5  Source Quality Control

  PART 3 — EXECUTION
    3.1  Examination / Pre-installation Conditions
    3.2  Preparation
    3.3  Installation
    3.4  Field Quality Control
    3.5  Cleaning
    3.6  Protection
```

---

### 1.3 Part 1 — General: Where the Money Hides

**🔨 Mike DeLuca:**
> Part 1 is the most underread and most dangerous part of any spec section. Estimators skim to Part 2 for material specs and miss the land mines buried in submittals, quality assurance, and warranty clauses.

**Cost-Impacting Elements in Part 1:**

| Clause | What to Look For | Cost Risk |
|---|---|---|
| **Summary (1.1)** | Scope inclusions/exclusions, related sections, work by others | Scope gaps |
| **References (1.2)** | Which ASTM/ACI/AISC edition governs — newer editions = higher standards | Material or labor upgrade |
| **Submittals (1.3)** | Shop drawings, product data, samples, mock-ups, certifications | 40–200+ hours of PM/engineering time |
| **Quality Assurance (1.4)** | Pre-qualification requirements, installer certifications, third-party testing | Testing fees, schedule risk |
| **Delivery/Storage (1.5)** | Climate-controlled storage, staging area requirements, sequencing | Logistics cost |
| **Warranty (1.7)** | Extended warranties, NDT requirements, labor inclusion | Insurance/bonding cost |

**🤖 Sarah Chen:**
> AI parsing challenge: Part 1 is heavily boilerplate across projects. The hard problem is identifying when a "standard" warranty clause has been customized to 5 years instead of 1, or when a submittal requirement adds a mock-up that no one priced. NOVA must diff spec sections against a boilerplate baseline and surface deviations as flags — not just extract what's there, but flag what's *unusual*.

**🔗 Parker Conrad:**
> Part 1 cross-agent connection: Submittals in Part 1 → NOVA-PM (Sofia) tracks submittal log. Quality Assurance clauses → NOVA-Cost adds testing line items. Warranty requirements → NOVA-Risk flags extended exposure. Part 1 is where the spec talks to every agent simultaneously.

---

### 1.4 Part 2 — Products: Material Specs and Substitutions

**🔨 Mike DeLuca:**
> Part 2 is where you find out if the architect wants one specific manufacturer or if there's real competition. "Or equal" language means you can shop. "No substitutions" means you're locked in and you need to price the specified product — not what your sub usually uses.

**Cost-Impacting Elements in Part 2:**

| Clause | What to Look For | Cost Risk |
|---|---|---|
| **Manufacturers (2.1)** | Sole-source vs. "or equal" vs. approved list | Markup opportunity or lock-in |
| **Performance Requirements** | Minimum STC ratings, fire resistance, structural loads | Drives product selection |
| **Mixes (2.4)** | Concrete PSI, admixtures, fly ash percentage | Lab testing, premium pricing |
| **Fabrication (2.3)** | Shop-fabricated vs. field-fabricated | Labor shift between shop and field |
| **Source QC (2.5)** | Mill certificates, factory testing, inspection | Procurement overhead |

**🤖 Sarah Chen:**
> Critical AI parsing issue: Manufacturer lists often read as: *"Subject to compliance with requirements, provide products by one of the following: [list]."* NOVA must extract the complete approved list and flag when a list has only one manufacturer (de facto sole source) vs. three or more (competitive). Single-manufacturer lists are a cost risk and a negotiating flag. Also: watch for "or equal as approved" — this phrase is deceptively open; in practice, substitution approval has a 4–6 week lead time that estimators routinely miss.

---

### 1.5 Part 3 — Execution: Labor and Quality Requirements

**🔨 Mike DeLuca:**
> This is where labor costs live. How something is installed — the prep requirements, the tolerances, the field testing — determines your labor unit prices. A floor coating spec that requires shot-blasting the substrate before application is a completely different job than one that allows hand-grinding.

**Cost-Impacting Elements in Part 3:**

| Clause | What to Look For | Cost Risk |
|---|---|---|
| **Examination (3.1)** | Conditions contractor must verify before starting | Delay/schedule risk if conditions unmet |
| **Preparation (3.2)** | Surface prep standards (SSPC, ICRI), substrate requirements | Can double labor cost |
| **Installation (3.3)** | Tolerances (FF/FL numbers), fastener spacing, joint design | Labor productivity impact |
| **Field QC (3.4)** | Tests per area, inspector hold points, destructive testing | Third-party fees, schedule holds |
| **Cleaning (3.5)** | Level of cleaning (SSPC SP6 vs SP10 blast), final cleaning scope | Often unpriced |
| **Protection (3.6)** | Traffic protection, temporary barriers, re-cleaning if damaged | Easily forgotten |

**🔗 Parker Conrad:**
> Part 3 talks directly to NOVA-Plans. When Part 3 says "install per manufacturer's written instructions," NOVA-Plans needs to pull the manufacturer's installation guide as a linked reference. When it says "tolerances shall not exceed FF25/FL20," NOVA-Plans flags floor areas in the drawing model where that tolerance matters (finished concrete in occupied spaces vs. slabs under raised floors). Part 3 is the handshake between the spec and the quantity takeoff.

---

## 2. CRITICAL SPEC SECTIONS BY TRADE

### 2.1 Concrete — Division 03

**🔨 Mike DeLuca — Must-Read Sections:**

| Section | Title | What to Price |
|---|---|---|
| **03 10 00** | Concrete Forming | Form type (stay-in-place, pan, specialty), release agent, form ties, reshoring |
| **03 20 00** | Concrete Reinforcing | Bar grade (Grade 60 vs Grade 80), epoxy coating, coupler splices, BIM coordination |
| **03 30 00** | Cast-in-Place Concrete | Mix design (PSI, w/c ratio, admixtures), ACI exposure class, placement method |
| **03 35 00** | Concrete Finishing | FF/FL flatness numbers, burnish vs broom vs exposed aggregate, curing method |
| **03 39 00** | Concrete Curing | Curing compound type, curing blankets, duration — often a separate line item |
| **03 45 00** | Precast Concrete | Plant certification (PCI), connection details, erection sequence, tolerances |

**Critical Cost Flags — Concrete:**
- **ACI 318 exposure categories** (F0–F3, W0–W2, S0–S3, C0–C2): Higher exposure = air entrainment, lower w/c ratio, higher cement content → cost premium
- **Special inspection requirements** (IBC Chapter 17): Continuous vs. periodic inspection changes testing budget dramatically
- **Self-consolidating concrete (SCC)**: Premium over standard mix; requires pre-qualification pour
- **Flatness numbers (FF/FL)**: FF25 is standard slab; FF50+ (superflat) requires laser screed, adds 15–25% to placement cost
- **Architectural concrete**: Formwork, release agents, patching standards, sample panels — can 3× standard cost

**🤖 Sarah Chen:**
> Parsing trap: Concrete specs often embed critical requirements in referenced standards without restating them. "Concrete shall conform to ACI 301-16" pulls in 200 pages of requirements. NOVA must maintain a standards library cross-reference: when a spec cites a standard, retrieve the key cost-impacting clauses from that standard. Also: mix design tables are often formatted inconsistently — some use narrative prose, others use tables with f'c, w/cm, and admixture columns. NOVA needs both parsers.

---

### 2.2 Masonry — Division 04

**🔨 Mike DeLuca — Must-Read Sections:**

| Section | Title | What to Price |
|---|---|---|
| **04 05 13** | Masonry Mortaring | Mortar type (S vs N vs M), portland vs masonry cement, pre-mixed |
| **04 05 19** | Masonry Anchorage | Anchor type, spacing, corrosion protection (hot-dipped galvanized vs stainless) |
| **04 20 00** | Unit Masonry | CMU weight class (normal vs medium vs lightweight), face brick grade, coursing |
| **04 21 13** | Brick Masonry | Bond pattern, joint profile, efflorescence control, cleaning method |
| **04 22 00** | Concrete Unit Masonry | Hollow vs solid, grout-filled cells, bond beams, lintel blocks |
| **04 27 00** | Multiple-Wythe Masonry | Cavity width, wall ties, drainage mat, flashing system |

**Critical Cost Flags — Masonry:**
- **Mortar type**: Type S (high strength) vs Type N (standard) — Type S required for below-grade and high-load applications; material cost similar but mixing labor varies
- **Grout schedule**: Which cells are grouted solid vs. hollow — often shown on structural drawings, not in spec. Verify coordination
- **Flashing and weep systems**: Often underpriced. Full cavity drainage systems (dimple mat + mortar collection device + through-wall flashing + weeps) can add $8–15/SF to wall cost
- **Reinforcement (04 05 19 + structural drawings)**: Vertical rebar at 32" vs 16" OC is a significant cost differential
- **Special inspection**: Continuous masonry inspection during grouting adds a inspector fee; not always caught

**🔗 Parker Conrad:**
> Masonry specs are a prime example of spec-to-drawing cross-referencing. The spec establishes mortar type and CMU class; the structural drawings show the wall reinforcement schedule; the architectural drawings show the coursing, bond pattern, and face brick elevations. NOVA-Plans must pull all three and reconcile them into a single wall assembly for each wall type. A wall type shown as "8" CMU + brick veneer" on the architectural plan could be spec'd as 5 different assemblies depending on location (below grade, at-grade, above grade, parapet, foundation wall).

---

### 2.3 Metals — Division 05

**🔨 Mike DeLuca — Must-Read Sections:**

| Section | Title | What to Price |
|---|---|---|
| **05 12 00** | Structural Steel | ASTM grade (A992 vs A36 vs A572), connection type, camber, surface prep |
| **05 12 13** | Architecturally Exposed Structural Steel (AESS) | Finish category (AESS 1–4), weld grinding, shop prime, exposure — premium cost |
| **05 21 00** | Steel Joist Framing | Joist series, bridging, joist girders, bottom chord extensions |
| **05 31 00** | Steel Decking | Deck profile and gauge, diaphragm requirements, composite vs non-composite |
| **05 40 00** | Cold-Formed Metal Framing | Stud gauge and spacing, track gauge, deflection limits, blocking |
| **05 50 00** | Metal Fabrications | Stairs, railings, misc steel — often lump-sum bid, easy to miss scope |
| **05 12 23** | Structural Steel Fireproofing | Type (spray-applied vs intumescent vs board), UL design number, thickness |

**Critical Cost Flags — Metals:**
- **AESS categories** (CISC/AISC): AESS 1 = basic cleaning and prime; AESS 4 = museum quality, full weld grinding, premium finish. Cost can vary by 200–400% across the AESS spectrum
- **Intumescent fireproofing vs. SFRM**: Intumescent (thin-film) is 3–5× the cost of spray-applied but required for exposed structural steel in high-end interiors. The spec drives this choice
- **Connection types**: Fully welded vs. bolted vs. moment connections — drives both steel and erection cost
- **Shop drawings and EOR approval**: Structural steel requires engineer-of-record approval of all shop drawings. Lead time 6–12 weeks minimum; affects schedule cost
- **Surface preparation (SSPC SP6 vs SP10)**: SP10 near-white blast on all structural steel adds significant abrasive cost

**🤖 Sarah Chen:**
> AI parsing trap: Metals specs use UL Design Numbers and AISC table references extensively. "Provide fire resistance rated construction in accordance with UL Design X123" is meaningless without the UL Fire Resistance Directory. NOVA must either maintain a curated subset of UL design numbers with their thickness/density requirements, or flag the clause for human review. Do not assume — a wrong fireproofing thickness on a $2M steel package is a six-figure error.

---

### 2.4 Wood & Plastics — Division 06

**🔨 Mike DeLuca — Must-Read Sections:**

| Section | Title | What to Price |
|---|---|---|
| **06 10 00** | Rough Carpentry | Lumber species and grade (HF #2 vs Doug Fir Select), treatment (ACQ, borate) |
| **06 11 00** | Wood Framing | Stud spacing (16" vs 12" OC), top plate configuration, fire blocking |
| **06 16 00** | Sheathing | OSB vs plywood, rated vs unrated, nail schedule, blocking for panels |
| **06 20 00** | Finish Carpentry | Lumber grade, wood species, moisture content limits |
| **06 40 00** | Architectural Woodwork | AWI quality grade (Economy, Custom, Premium), substrate, edge banding |
| **06 40 23** | Interior Architectural Woodwork | Casework construction (frameless vs face-frame), hardware, finish system |

**Critical Cost Flags — Wood:**
- **AWI Quality Grades**: Economy, Custom, and Premium are dramatically different products. Custom to Premium can be 40–80% cost difference. Verify grade against drawings and specifications
- **Pressure treatment type**: ACQ (above-grade exterior) vs. CCA (industrial) vs. borate (interior insect control) — different costs, availability, and hardware compatibility
- **Fire-retardant treated (FRT) lumber**: Required in many Type III/IV buildings for exposed roof framing. Premium over standard lumber; some sizes must be special-ordered
- **Moisture content specifications**: "Kiln-dried to 19% maximum" vs "19% at time of installation" — the latter is harder to enforce but easier to buy
- **Solid wood vs. MDF vs. veneer**: AWI specs define substrate and face material separately. A "wood" door could be MDF core with wood veneer — both meet spec; one costs less

---

### 2.5 Thermal & Moisture Protection — Division 07

**🔨 Mike DeLuca — Must-Read Sections:**

| Section | Title | What to Price |
|---|---|---|
| **07 11 00** | Dampproofing | Below-grade, brush vs spray, single vs double coat |
| **07 13 00** | Sheet Waterproofing | Below-grade membrane type (hot vs cold-applied), drainage board, protection layer |
| **07 17 00** | Bentonite Waterproofing | Panel system vs spray, drainage composite, perimeter detail |
| **07 21 00** | Thermal Insulation | R-value, product type (batt, rigid, spray), vapor retarder requirements |
| **07 24 00** | EIFS | Class (PB vs PM), base coat thickness, mesh type, impact resistance |
| **07 41 00** | Roofing Panels | Metal type, seam type (standing vs snap-lock), warranty, substrate |
| **07 50 00** | Membrane Roofing | System type (TPO, EPDM, mod-bit), attachment (adhered vs mechanically fastened vs ballasted), warranty years and coverages |
| **07 60 00** | Flashing & Sheet Metal | Gauge, metal type (lead-coated copper vs aluminum vs stainless), solder joints |
| **07 84 00** | Firestopping | System types per UL, penetration catalog, installer certification |
| **07 92 00** | Joint Sealants | Sealant type per exposure, backer rod, primer, joint dimensions |

**Critical Cost Flags — Thermal/Moisture:**
- **Roofing warranty level**: 10-year vs 20-year NDL (No Dollar Limit) manufacturer warranty requires specific membrane thickness, fastening pattern, and detail execution. 20-year NDL warranty can add 20–35% to base roofing cost
- **R-value requirements**: Energy code drives minimum continuous insulation (ci) requirements. ASHRAE 90.1-2019 vs 2022 is a meaningful difference in R-value and cost
- **Firestopping (07 84 00)**: This section is almost always underpriced. Every penetration through a fire-rated assembly requires a listed UL system with specific materials. On a complex commercial building this can be $150,000–$500,000+ and is frequently missed entirely
- **Air barrier continuity**: Increasingly required by code; requires specific materials, sequencing, and QC testing (ASTM E1186 or E779). Adds cost and coordination across multiple trades
- **Sealant joint size tolerance**: If joint dimensions shown on drawings are inadequate for thermal movement, sealant will fail. NOVA-Plans should flag joints narrower than 3/8" in exterior applications

**🤖 Sarah Chen:**
> Roofing and waterproofing specs are complex because they describe systems, not single products. A "TPO roofing system" pulls in 15–20 components across 4–5 spec sections. NOVA must be able to recognize system references and expand them — when the spec says "roofing system as specified," it means the membrane, insulation, coverboard, adhesive, fasteners, flashing, edge metal, and walkway pads are all in scope. The word "system" is a scope-expansion trigger.

---

### 2.6 Doors, Windows & Openings — Division 08

**🔨 Mike DeLuca — Must-Read Sections:**

| Section | Title | What to Price |
|---|---|---|
| **08 11 13** | Hollow Metal Doors & Frames | Series (14 ga vs 16 ga), face sheet, core type, fire label |
| **08 14 16** | Flush Wood Doors | Core type (PC5, SLC, mineral), face veneer, fire label, AWI grade |
| **08 31 00** | Access Doors | Type, size, fire rating, key-operated vs flush bolt |
| **08 41 13** | Aluminum-Framed Entrances | System, thermal break, finish, hardware |
| **08 44 13** | Glazed Aluminum Curtain Walls | Performance specs (water, air, structural), mock-up requirements |
| **08 71 00** | Door Hardware | Hardware set schedule, finish, grade (BHMA AA, A, B) |
| **08 80 00** | Glazing | Glass type, thickness, U-value, SHGC, safety glazing requirements |
| **08 88 00** | Special Function Glazing | Ballistic, forced entry, blast, fire-rated glazing — major cost items |

**Critical Cost Flags — Openings:**
- **Hardware sets**: The door hardware schedule is usually in Section 08 71 00 and lists every function, brand, finish, and BHMA grade for every door type. Commodity grade to architectural grade hardware can vary by 5× in cost. Always price the schedule, not an assumption
- **Fire-labeled frames**: UL fire-labeled hollow metal frames vs standard frames. A 20-minute rated frame looks identical but costs significantly more; miss the label requirement and you'll be paying for upgrades in the field
- **Curtain wall performance specs and mock-ups**: Water infiltration testing (AAMA 501.2), structural performance (ASTM E330), and thermal performance mock-ups can add $50,000–$200,000 to the curtain wall contract
- **Electrified hardware**: Card readers, electrified strikes, electric latch retraction — often specified in 08 71 00 but powered and controlled from Division 28. Scope split must be priced carefully
- **Glass U-value and SHGC requirements**: Energy code compliance drives IGU specifications. Triple-pane, low-e coatings, gas fills — each adds cost and lead time

---

### 2.7 Finishes — Division 09

**🔨 Mike DeLuca — Must-Read Sections:**

| Section | Title | What to Price |
|---|---|---|
| **09 21 16** | Gypsum Board Assemblies | Board type (regular, Type X, Type C, moisture, abuse-resistant), thickness, UL assembly numbers |
| **09 22 16** | Non-Structural Metal Framing | Stud gauge (25 ga vs 20 ga vs 18 ga), spacing, track, deflection track |
| **09 30 00** | Tiling | Tile type, bond coat, grout type, setting bed, waterproofing substrate |
| **09 51 00** | Acoustical Ceiling Systems | Grid type, tile NRC/CAC ratings, seismic requirements |
| **09 65 00** | Resilient Flooring | LVT/VCT/sheet vinyl, wear layer thickness, flash cove, transitions |
| **09 68 00** | Carpeting | Face weight, fiber type, pattern match, carpet tile vs broadloom, pad |
| **09 91 00** | Painting | System type (primer + intermediate + finish), sheen level, VOC limits |
| **09 96 00** | High-Performance Coatings | Epoxy, urethane, intumescent — mil thickness, substrate prep |

**Critical Cost Flags — Finishes:**
- **Gypsum board type stack**: A fire-rated wall assembly may require multiple layers of Type X. A UL assembly number like U419 specifies exactly the layer count, board type, and framing gauge. "Match UL U419" is not the same as "one layer 5/8" Type X." Pull the UL design
- **Acoustic isolation assemblies**: Double-stud walls, resilient channels, sound isolation clips — these change both the wall section width and the labor cost dramatically. Often shown on drawings but only detailed in spec
- **Tile setting bed**: Bonded mortar bed vs. thin-set vs. uncoupling membrane — same finished look, very different cost and schedule
- **High-build/high-performance coatings (09 96 00)**: Epoxy floor coatings with SSPC SP10 blast prep, multiple build coats, non-skid aggregate, and topcoat are often 5–8× the cost of standard paint. These sections need individual line items, not "per SF floor coating"

**🔗 Parker Conrad:**
> Division 09 is the most drawing-dependent division for NOVA-Plans. Finishes are almost never fully specified in the spec alone — the room finish schedule on the drawings lists which floor, wall, and ceiling finish applies to each room, and the spec sections define those materials. NOVA-Plans must parse the room finish schedule (typically on an A-series drawing), map each finish code to a spec section, and output a quantity-by-room matrix that NOVA-Cost can price. This is one of the most valuable automation opportunities in the whole estimating workflow.

---

### 2.8 MEP — Divisions 21–28

**🔨 Mike DeLuca — Must-Read Sections:**

| Division | Key Sections | What to Price |
|---|---|---|
| **21** Fire Suppression | 21 13 13 (wet pipe), 21 13 16 (dry pipe) | Pipe type, density/area, sprinkler coverage, seismic bracing |
| **22** Plumbing | 22 05 29 (supports), 22 11 16 (domestic water), 22 13 16 (sanitary) | Pipe material (copper vs PEX vs PVC), insulation, fixture schedule |
| **23** HVAC | 23 05 93 (testing/balancing), 23 31 00 (ductwork), 23 73 00 (AHUs) | Duct material/gauge, insulation, equipment schedules, controls |
| **26** Electrical | 26 05 19 (wire), 26 24 16 (panelboards), 26 27 26 (wiring devices) | Wire size/type, conduit type, load calculations, equipment |
| **27** Communications | 27 15 00 (structured cabling), 27 51 16 (clock) | Category rating, pathway, equipment racks, testing |
| **28** Electronic Safety | 28 13 00 (access control), 28 31 11 (fire alarm) | Panel type, device count, monitoring, battery backup |

**Critical Cost Flags — MEP:**
- **Equipment schedules**: MEP specs usually reference equipment schedules on the drawings. NOVA-Plans must read the M, P, and E schedules to price equipment — the spec section sets performance and installation requirements, but the schedule sets the specific units, quantities, and connections
- **Testing and balancing (23 05 93)**: This is almost always a stand-alone subcontract — $15,000 to $150,000+ on a commercial project — and is frequently missed as a separate line item
- **Controls and BAS integration**: Controls specs (23 09 00) reference sequences of operation that drive both control panel complexity and commissioning scope. The more complex the sequence, the higher the controls cost
- **Commissioning (01 91 00 or 23 08 00)**: Cx requirements vary widely — Cx agent, functional testing, seasonal testing, LEED Cx documentation. This can be $50,000–$500,000 depending on scope
- **Conduit type by location**: EMT vs. rigid vs. flexible vs. liquidtight — electrical specs define conduit type per exposure condition. Field-run EMT in an exposed parking garage needs to be rigid. One missed upgrade on a large project = significant field change orders

**🤖 Sarah Chen:**
> MEP specs are the hardest for AI parsing because they are deeply interlocked with drawing schedules. The spec section for air handling units might be 4 pages, but the actual unit — its CFM, static pressure, coil configuration, motor HP — is on a schedule on drawing M-601. NOVA must treat equipment schedules as first-class data sources and join them to spec sections by equipment tag number. This tag-matching problem (AHU-1 on the drawing = AHU-1 in the schedule = air handling unit spec) is a structured data problem once the tags are consistently formatted — but inconsistent formatting across project teams makes it hard. Flag when tags don't reconcile.

---

## 3. SCOPE-DEFINING LANGUAGE

### 3.1 Furnish / Install / Provide — The Critical Verb

**🔨 Mike DeLuca:**
> This is day-one estimating. Get the verb wrong and you're either eating a scope gap or fighting over who owes what for six months.

| Language | Meaning | Estimator Action |
|---|---|---|
| **"Furnish and install"** | Supply material AND perform installation | Both in your scope |
| **"Furnish only"** | Supply material; someone else installs | Material cost only; confirm installer |
| **"Install only"** | You install; material furnished by others | Labor only; confirm material delivery timing |
| **"Provide"** | Per CSI definition = furnish AND install (same as "furnish and install") | Both in scope |
| **"Deliver"** | Transport to site; no installation | Logistics only |

**Common scope split patterns (know who does what):**

```
Owner-furnished, Contractor-installed (OFCI):
  → Spec says "install only" or "installed by [Trade] Contractor"
  → Owner purchases equipment; your sub installs it
  → Risk: delivery timing, damage claims, missing accessories

Owner-furnished, Owner-installed (OFOI):
  → "By Owner" or "NIC" (Not in Contract)
  → Completely out of your scope; but you must coordinate
  → Risk: owner work delays your work

Contractor-furnished, Owner-installed (CFOI):
  → Rare; usually for specialty equipment
  → Material in your budget; coordinate install timing
```

---

### 3.2 "By Others" / "Not in Contract" / "NIC"

These phrases remove scope from the section but don't tell you who picks it up. They create scope gaps.

**🔨 Mike DeLuca:**
> Every time I see "by others" I ask: who are "others"? Is it another trade on this contract? The owner? A separate contractor? If the answer is "I don't know," that's a risk log item. Someone needs to pay for it or it doesn't get done.

**Scope gap checklist:**
- [ ] What work is specifically excluded by this phrase?
- [ ] Is there another spec section that includes it?
- [ ] Is there a Division 01 clarification about scope splits?
- [ ] Did the GC's scope letter address it?
- [ ] Is it in the Owner-Direct contracts list?

**🤖 Sarah Chen:**
> Pattern for NOVA: build a scope exclusion register during spec parsing. Every instance of "by others," "NIC," "not included," "by Owner," or "under separate contract" should be extracted as a structured record: {section, clause, excluded_work, responsible_party_if_stated}. At bid time, NOVA displays this register so the estimator can confirm coverage before submitting.

---

### 3.3 "As Directed by Architect" — Risk Flag

**🔨 Mike DeLuca:**
> This is the most dangerous phrase in construction. It means: you will do whatever the architect decides, at whatever cost that implies, with no basis for a change order. Every instance of "as directed" is an open-ended obligation. You need a contingency for it or a clarification letter excluding it.

**Where it appears most often:**
- Concrete patching and repair extent ("patch as directed")
- Paint and finish touchup ("touch up as directed")
- Mock-up disposition ("maintain mock-up as directed")
- Concealed condition discovery ("remediate as directed")
- Cleaning standards ("clean to satisfaction of architect")

**Risk mitigation language for bid letters:**
> "We have included [X] hours / [X] SF / [X] allowance for items described as 'as directed by architect.' Work in excess of this allowance will be performed under a separately priced change order."

---

### 3.4 Allowances

Allowances are pre-set budget amounts included in the base bid for work whose scope is not yet defined at bid time.

**Types:**

| Type | Definition | Pricing Rule |
|---|---|---|
| **Cash allowance** | Dollar amount for material or equipment | Include in base bid dollar for dollar |
| **Quantity allowance** | Fixed unit price × TBD quantity | Price the unit rate; quantity determined later |
| **Contingency allowance** | Owner's contingency for unforeseen work | Include as a lump sum in the bid |

**🔨 Mike DeLuca:**
> Allowances are not free money. They represent real work the owner hasn't designed yet. When you bid an allowance, you own the schedule impact of that work whether or not the allowance is sufficient. If the allowance is $50,000 for flooring and the actual selection costs $90,000, you may have a change order for the overage — but you still need to complete the floor on schedule. Price the markup and overhead on top of the allowance amount; some GCs miss this.

**🤖 Sarah Chen:**
> Allowances create ambiguity in cost models. NOVA-Cost must flag allowances separately from hard costs — they should not be treated as confirmed scope. When parsing specs, extract all allowance language into a structured register: {section, allowance_amount_or_unit, description, governing_section_if_any}. At bid summary time, surface this register so the estimator sees the full allowance list before submitting.

---

### 3.5 Unit Prices

Unit prices are per-unit rates submitted with the bid that govern additions or deductions if quantities change after award.

**Common unit price items:**
- Concrete (CY)
- Earthwork excavation (CY, BCY)
- Rock excavation (CY)
- Structural steel (ton)
- Waterproofing (SF)
- Piling (LF)

**🔨 Mike DeLuca:**
> Unit prices can be weapons — the owner uses them to add scope at a locked rate you submitted at bid time. Price unit price work with margin. Provisional quantities (especially rock excavation) are where owners play hardball. If the drawings show 500 CY of rock and your unit price is $400/CY, you better have priced the unit price to include all your overhead and profit — not just material cost.

---

### 3.6 Alternates

Alternates are specific scope modifications (additions or deductions) that are priced separately at bid time and may or may not be accepted by the owner after bid opening.

| Type | Definition |
|---|---|
| **Add alternate** | Owner accepts additional scope at the priced premium |
| **Deduct alternate** | Owner removes scope to reduce contract value |

**🔨 Mike DeLuca:**
> Alternates affect how you buy work. If there's a roofing alternate for a 20-year warranty upgrade, your roofing sub needs to price both the base bid and the alternate from the same manufacturer. You can't submit the base bid from Carlisle and the alternate from Firestone and have them be additive — they'd be a system mismatch. Read alternates before you buy and make sure your subs price them from the same base.

**🔗 Parker Conrad:**
> NOVA-Cost needs an alternates register as a first-class data structure — not just a footnote in the estimate. Each alternate should be: {alternate_number, description, sections_affected, add_or_deduct, amount}. This register should be visible in the bid summary and should allow what-if scenario analysis before bid submission.

---

## 4. COST-IMPACTING CLAUSES

### 4.1 Quality Requirements and Testing

**🔨 Mike DeLuca:**
> Testing is a line item. It's not overhead. Special inspection alone on a mid-size commercial building can run $80,000–$200,000. Miss it and you'll be looking for it in your contingency.

**Testing and inspection types with cost implications:**

| Type | Spec Location | Typical Cost Range |
|---|---|---|
| Concrete cylinder testing | 03 30 00 | $15–$25/test; 1 set per 50 CY minimum |
| Structural steel mill certificates | 05 12 00 | Usually no added cost; review/file time |
| Special inspection (IBC Ch. 17) | 01 45 33 | $80–$200K per project |
| Roofing nuclear density testing | 07 50 00 | $500–$1,500/day |
| Roofing flood testing | 07 13 00 | $1,000–$3,000 per area |
| Waterproofing EFVM testing | 07 13 00 | $3,000–$10,000 |
| Air barrier testing (ASTM E779) | 07 27 00 | $5,000–$15,000 per test |
| Fire door functional testing | 08 71 00 | $75–$150/door |
| TAB (Testing, Adjusting, Balancing) | 23 05 93 | $15K–$150K |
| Commissioning | 23 08 00 / 01 91 00 | $50K–$500K |

**Third-party vs contractor testing:**
- Third-party testing (hired by owner) = not in GC scope, but GC must coordinate access
- Contractor-paid testing = explicitly in your scope; price it
- "Owner shall engage a special inspector" = not in GC cost; "Contractor shall provide" = it is

---

### 4.2 Submittal Requirements

**Types of submittals and their real cost:**

| Submittal Type | Who Prepares | Time/Cost Implication |
|---|---|---|
| **Product data** | Sub/supplier submits brochures | Minimal; administrative |
| **Shop drawings** | Sub/fabricator prepares | 20–200 engineering hours per package |
| **Samples** | Sub provides physical sample | Material cost + delivery; multiple submissions possible |
| **Mock-ups** | Contractor builds full-scale assembly | $5,000–$100,000+ depending on complexity |
| **Design data** | Contractor-engineer prepares calculations | PE fee: $2,000–$20,000+ |
| **Certificates** | Manufacturer issues | Administrative |
| **Test reports** | Lab issues | $500–$5,000 per report |

**🔨 Mike DeLuca:**
> Mock-ups are the most dangerous submittal requirement in terms of underpricing. When a spec says "construct a mock-up of the curtain wall system at location designated by architect, minimum 10 feet wide × 12 feet tall, including all components," that's a $50,000–$150,000 item for supply and install of a non-permanent assembly that gets torn down. Read every mock-up requirement and put a number on it.

**🤖 Sarah Chen:**
> Submittal registers are a structured data problem. NOVA should parse all spec sections and build a submittal register automatically: {section, submittal_type, description, copies_required, schedule_requirement}. This register feeds Sofia PM's submittal tracking module directly. The parsing challenge: submittal requirements appear in Part 1 under "Submittals" but also as embedded clauses in Parts 2 and 3 ("submit manufacturer's installation instructions prior to start of work"). NOVA must scan all three Parts.

---

### 4.3 Warranty Requirements Beyond Standard

**Standard warranties vs. enhanced warranties — know the difference:**

| Warranty Type | Standard | Enhanced (Spec-Driven) | Cost Implication |
|---|---|---|---|
| Roofing | 2-year labor, 5-year product | 20-year NDL | +20–35% on roofing cost |
| Waterproofing | 1-year labor | 5-year system with annual inspection | +$5–15K in inspection cost |
| Exterior glazing | 1-year | 10-year thermal seal failure | Premium IGU required |
| Mechanical equipment | 1-year | 5-year parts + labor | Extended service contract |
| Flooring | 1-year | 10-year finish wear | Premium product required |

**🔨 Mike DeLuca:**
> An NDL (No Dollar Limit) roofing warranty from a major manufacturer requires: specific membrane thickness (60 mil vs 45 mil TPO), specific fastening patterns, specific edge metal, and a manufacturer's representative present for critical installations. Price all of that, not just the warranty paperwork.

---

### 4.4 LEED / Sustainability Requirements

**Most common LEED spec clauses and cost implications:**

| Clause | Typical Location | Cost Driver |
|---|---|---|
| **Regional materials** (within 500 miles) | 01 35 14 | May restrict material sourcing; premium for local product |
| **Recycled content tracking** | 01 35 14 | Administrative cost for documentation |
| **Low-emitting materials** (VOC limits) | 09 91 00, 09 30 00, etc. | Premium for compliant products |
| **Construction waste management** | 01 74 19 | $5–$15K for sorting/reporting on large projects |
| **Enhanced commissioning** (EAp1) | 01 91 00 | +$25–$75K over standard Cx |
| **Indoor air quality during construction** (IEQc3.1) | 01 57 19 | Air filtration, sequencing cost |
| **Wood certified (FSC)** | 06 10 00, 06 40 00 | 10–20% premium on lumber |
| **Measurement & verification** | 01 78 43 | Metering hardware + ongoing reporting cost |

**🤖 Sarah Chen:**
> LEED requirements create a documentation burden that scales with project size. NOVA should parse Division 01 sustainability sections and build a LEED documentation checklist: {credit, spec_section, documentation_required, responsible_party, cost_estimate}. The hard parsing problem is that LEED specs often reference the LEED credit number (IEQc4.1) but the contractor must know what that credit actually requires. NOVA needs a LEED credit library to resolve these references.

---

### 4.5 Phasing, Working Hours, and Building Conditions

**🔨 Mike DeLuca:**
> Occupied building work is a completely different animal. Your crew can't work at full productivity. You need staging areas. You may be working 6pm–6am shifts. Your dust protection costs real money. If the spec is for an occupied facility and you price it like a vacant building, you're losing money.

**Cost multipliers for phased/restricted work:**

| Condition | Productivity Impact | Cost Adder |
|---|---|---|
| Night shift work | –20 to –35% | 15–25% labor premium |
| Occupied building noise restrictions | –15 to –25% | Schedule extension cost |
| Occupied building dust protection | Additive | Poly barriers, HEPA units, daily cleanup |
| Weekend-only access | –15% (setup/teardown time) | Potential premium pay |
| Phased construction sequence | –10 to –20% (mobilizations) | Multiple mob/demob costs |
| Interim occupancy dates | Hard deadline risk | Completion bond or LD exposure |

**Key clauses to flag:**
- Working hours restrictions: "Work shall be performed between 8:00 AM and 5:00 PM Monday through Friday" — flag for all trades
- Noise limits: Specific dBA limits, especially in hospital or occupied residential work
- Infection control risk assessment (ICRA): Healthcare projects; defines containment zones, negative pressure requirements, barrier types
- Vibration limits: Near sensitive equipment (MRI machines, data centers, precision labs) — may restrict jackhammering and sawing methods

---

## 5. CROSS-REFERENCE PATTERNS

### 5.1 Spec-to-Spec Cross References

Construction specs are a hyperlinked document system. Every cross-reference is a scope and cost dependency.

**Common cross-reference patterns:**

```
"See Section 07 92 00 for joint sealants."
→ Means: this section does NOT include sealants; 07 92 00 does
→ Action: confirm 07 92 00 is in your contract; check interface conditions

"Primer coat specified in Section 09 91 00."
→ Means: your painting sub primes; this trade applies finish
→ Action: confirm sequence and responsibility with painting sub

"Provide backing plates for items indicated on drawings; see Section 05 50 00."
→ Means: metal fabricator supplies the backing; you coordinate rough-in
→ Action: coordinate between trades; set install timing

"Products and installation shall conform to ASTM C1063."
→ Means: the standard governs; you must obtain and read it
→ Action: NOVA flags unresolved standard references for review
```

**🔗 Parker Conrad:**
> Cross-references are a graph problem. Every spec section is a node; every "See Section XX XX XX" is a directed edge. NOVA should build this dependency graph during spec parsing. A section with many incoming edges (e.g., Division 01 General Requirements) affects every other section. A section with many outgoing edges (e.g., 09 29 00 gypsum board) is dependent on many others. When NOVA prices a wall assembly, it traverses the dependency graph to pull in all connected cost items — framing from 09 22 16, gypsum from 09 29 00, joint treatment from 09 29 00 Part 3, prime coat from 09 91 00, firestopping from 07 84 00, and so on.

---

### 5.2 Spec-to-Drawing Cross References

**🔨 Mike DeLuca:**
> "See Detail 5/A5.01" in a spec means the drawing provides additional requirements not repeated in the spec. You must read both. The drawing might show a custom edge condition, a special fastener, or a depth requirement that changes your cost.

**Reference formats to recognize:**

| Format | Meaning | NOVA Action |
|---|---|---|
| `See Detail 5/A5.01` | Detail 5 on sheet A5.01 | Flag for NOVA-Plans to cross-reference |
| `As shown on drawings` | Drawing governs over spec for geometry | Drawing dimensions take precedence |
| `Per room finish schedule` | A-series drawing lists finishes by room | NOVA-Plans must parse the schedule |
| `See equipment schedule on M-601` | Mechanical drawing lists equipment specs | NOVA-Plans must parse M-601 schedule |
| `Coordinate with structural drawings` | Additional requirements on S-series | Pull and read S-series for that element |
| `See door schedule` | Door schedule on drawings governs | NOVA-Plans must join door schedule to spec |

---

### 5.3 Division 01 — How General Requirements Govern Everything

Division 01 (General Requirements) contains contractual and procedural requirements that apply to every section in the project spec. It is the most important division for scope and cost impact — and the most frequently skipped.

**Critical Division 01 sections:**

| Section | Title | What It Controls |
|---|---|---|
| **01 10 00** | Summary of Work | Overall project scope, phasing, owner-occupied areas, contract type |
| **01 20 00** | Price and Payment Procedures | Schedule of values format, pay application requirements, retainage |
| **01 26 00** | Contract Modification Procedures | Change order process, markups, pricing requirements, notice periods |
| **01 31 00** | Project Management | Meetings, schedule requirements, reporting |
| **01 32 00** | Construction Progress Documentation | Schedule type (CPM required vs bar chart), update frequency |
| **01 33 00** | Submittal Procedures | Review periods, resubmission requirements, expediting responsibility |
| **01 40 00** | Quality Requirements | Testing plan, special inspection, mock-up requirements |
| **01 45 33** | Special Inspection | IBC Chapter 17 compliance; designates who pays for inspection |
| **01 50 00** | Temporary Facilities | Temporary power, water, heat, sanitary, enclosures — who provides |
| **01 57 19** | Temporary Environmental Controls | Erosion control, dust, noise, indoor air quality |
| **01 74 19** | Construction Waste Management | Diversion targets, sorting, reporting |
| **01 77 00** | Closeout | As-built drawings, O&M manuals, training, commissioning |
| **01 78 39** | Project Record Documents | Number of copies, format (BIM vs paper), delivery schedule |
| **01 91 00** | Commissioning | Scope, schedule, documentation requirements |

**🔨 Mike DeLuca:**
> Before I read a single trade section, I read Division 01 soup to nuts. The change order markup allowed in 01 26 00 affects how I build my GMP. The schedule requirements in 01 32 00 tell me if I need to buy CPM software and a scheduler. The temporary facilities in 01 50 00 tell me if I'm buying and removing a trailer compound or if the owner provides the site office. These aren't details — they're contract obligations.

---

### 5.4 General Conditions vs. Supplementary Conditions vs. Special Conditions

**🔨 Mike DeLuca:**
> The conditions of contract are the rules of the game. Estimators who don't read them get blindsided by liquidated damages, retainage rates, and payment term structures that are buried in AIA A201 modifications.

| Document | What It Is | Cost Relevance |
|---|---|---|
| **General Conditions** (AIA A201 or similar) | Standard industry contract terms | LDs, indemnification, insurance minimums, warranty periods |
| **Supplementary Conditions** | Project-specific modifications to general conditions | Where owners customize LDs, retainage, insurance limits |
| **Special Conditions** | Additional project-specific requirements (often in Division 01) | Sequencing, access, local requirements |

**High-impact clauses in supplementary conditions:**

- **Liquidated Damages**: Dollar amount per calendar day of delay. $1,000/day is common; $10,000–$25,000/day is not unusual on large projects. This is a schedule risk that belongs in your contingency
- **Retainage**: Standard is 10%; some owners specify 5% after 50% completion. A 5% retainage reduction halfway through is a cash flow improvement worth pricing
- **Insurance requirements**: Umbrella limits of $10M vs $25M affect your insurance premium. Professional liability requirements (design-build) are a separate cost
- **Indemnification scope**: Broad form vs. limited form indemnification; affects your legal exposure and insurance requirements

**🤖 Sarah Chen:**
> General conditions and supplementary conditions are contract documents, not spec sections. NOVA must treat them as a separate document class. Parse them for: LD amount and accrual trigger, retainage schedule, payment application deadline and response period, change order markup formula, and insurance requirements. These feed a risk register that surfaces at bid time — not as part of the estimate, but as a side-by-side contract risk dashboard.

---

## 6. RED FLAGS FOR ESTIMATORS

### 6.1 Performance Specification — Design Responsibility Transfer

**Definition:** A performance specification defines required outcomes (thermal performance, structural loads, acoustic ratings) without specifying how those outcomes must be achieved. The contractor selects the means and assumes the engineering responsibility.

**🔨 Mike DeLuca:**
> "Provide a curtain wall system achieving minimum U-0.25 and structural performance in accordance with ASCE 7-22 wind loads as calculated by Contractor" — that last phrase just transferred the structural engineering to you. You need to hire an engineer to size the mullions, assume liability for the structural design, and carry that risk through the warranty period. Price an engineering fee and an increased insurance premium.

**How to identify performance specs:**
- "As designed by Contractor"
- "Contractor shall design and install"
- "Provide a system meeting the following performance criteria"
- "Certify that the installed system achieves"
- "Contractor-engineered system"
- "Design-build" scope in any section

**Risk mitigation:**
- [ ] Identify all performance-specified sections
- [ ] Estimate engineering/design fees for each
- [ ] Confirm professional liability coverage
- [ ] Flag in bid letter: "Performance spec assumptions listed below"

---

### 6.2 Open-Ended Language

**🔨 Mike DeLuca:**
> Open-ended language is a scope trap. The spec is telling you that the owner or architect will decide the extent of the work during construction. Your only protection is to define your assumption in your bid letter or include a specific allowance.

**Most dangerous open-ended phrases:**

| Phrase | Risk | Response |
|---|---|---|
| "as required" | Scope is unbounded | Define assumed extent in bid; price allowance |
| "as necessary" | Same | Same |
| "to the satisfaction of the architect" | Subjective standard | Define acceptance criteria in bid |
| "where directed" | Scope location is TBD | Price unit rate; confirm approx. quantity |
| "complete and in place" | Everything needed is included — period | Read every scope exclusion carefully |
| "incidental to the work" | No separate payment for small items | Price the incidental work; it adds up |
| "in a workmanlike manner" | Standard is undefined | Minimal risk; industry standard applies |
| "clean" / "clean and sound" | Substrate standard is vague | Define assumed prep standard in bid |

---

### 6.3 Missing Spec Sections

**🔨 Mike DeLuca:**
> If a spec section is missing and the work shows up on the drawings, someone has to do it. Usually, the contract says the GC is responsible for all work shown on the drawings whether or not it's specified. Missing spec = no standard = you pick the standard. That's actually dangerous, because the architect can reject any product or installation method without a specified baseline.

**Common missing sections by project type:**

| Project Type | Commonly Missing Sections |
|---|---|
| Tenant improvement | 03 30 00 (concrete), 05 40 00 (cold-formed framing — deferred to GC standard) |
| Renovation | 02 41 00 (demolition) — scope often vague or absent |
| Fast-track | 07 84 00 (firestopping) — often an afterthought |
| Small commercial | 23 05 93 (TAB) — frequently missing; still required |
| Residential-scale | 28 31 00 (fire alarm) — often referenced to code only |

**NOVA check:** When NOVA-Plans identifies a system or assembly on the drawings, it should cross-check whether a corresponding spec section exists. If not, flag as a missing specification for estimator review.

---

### 6.4 Contradictions Between Specs and Drawings

**The governing document hierarchy (when specs and drawings conflict):**

Per most standard general conditions (AIA A201 §1.2.1):

```
Priority (highest to lowest):
1. Modifications / Change Orders (most recent)
2. Agreement / Contract
3. Addenda (most recent addendum governs over earlier)
4. Supplementary Conditions
5. General Conditions
6. Division 01 specifications
7. Technical specifications (Divisions 02–49)
8. Drawings

Note: Higher standards ALWAYS govern regardless of document hierarchy.
If drawings show a more stringent requirement than specs, 
the higher standard applies. Always price the more expensive option 
and flag the conflict for clarification.
```

**🔨 Mike DeLuca:**
> When specs say Type X and drawings show Type Y, I price the more expensive one and send an RFI. I never assume away a conflict. The worst outcome is pricing the cheap option and having to upgrade in the field at 0% markup.

**🤖 Sarah Chen:**
> Spec-drawing contradictions are a detection problem. NOVA-Plans reads drawings; NOVA-Specs reads specs. The contradiction only appears when both agents are looking at the same element — wall type W-3, door D-112, roof assembly RA-7 — and comparing attributes. This requires a shared assembly taxonomy: every named assembly in the drawings must map to a corresponding spec section, and NOVA must compare attributes (fire rating, material type, thickness, finish) across both. Build the assembly reconciliation engine before the contradiction detection can work.

---

### 6.5 Specification Date vs. Drawing Date

**🔨 Mike DeLuca:**
> Projects accumulate addenda. The original spec set might be dated 6 months before the drawings. If there was a spec addendum that updated Section 07 50 00 from TPO to PVC roofing, but your NOVA system parsed the original spec, you're pricing the wrong roofing system. Always price from the most current addenda-incorporated set.

**Document date rules:**

| Scenario | Governing Document | Action |
|---|---|---|
| Spec dated later than drawing | Spec governs for product/material | Price per spec; note drawing discrepancy |
| Drawing addendum issued after spec | Drawing addendum governs for that sheet | Price per addendum drawing |
| Addendum changes spec section | Addendum spec governs | Always parse addenda as spec overrides |
| Substitution approved by addendum | Substitution addendum governs | Update product selection |

**🤖 Sarah Chen:**
> For NOVA's document ingestion pipeline: every spec section and drawing must be tagged with its issue date and revision number upon ingestion. When parsing for cost, NOVA must always use the most recently issued version of each document. The merge logic for addenda is non-trivial — an addendum may replace an entire spec section (reissued in full), modify specific clauses (paragraph replacement), or add supplementary information. NOVA must handle all three update patterns without losing the unchanged portions of the original section.

---

### 6.6 Master Red Flag Register — NOVA Automated Flags

**🔗 Parker Conrad:**
> Every red flag in this section represents a NOVA detection rule. During spec parsing, NOVA should produce a structured flag output that feeds the estimator dashboard before pricing begins. Here is the complete flag set:

```
FLAG REGISTRY — NOVA-Specs Automated Detection

[SCOPE-001] "By others" / "NIC" / "By Owner" without named party
  → Severity: HIGH | Action: Resolve responsible party before bid

[SCOPE-002] Performance specification language ("as designed by Contractor")
  → Severity: HIGH | Action: Flag for engineering fee + liability review

[SCOPE-003] "As directed by architect" / "to satisfaction of architect"
  → Severity: MEDIUM | Action: Price allowance; include in bid letter assumptions

[SCOPE-004] Missing spec section for work visible on drawings
  → Severity: HIGH | Action: RFI or GC standard assumption letter

[SCOPE-005] Spec section present but drawings not yet issued
  → Severity: MEDIUM | Action: Flag for drawing reconciliation at GMP

[COST-001] Mock-up required (Part 1 Submittals)
  → Severity: HIGH | Action: Price mock-up as separate line item

[COST-002] Third-party testing / special inspection required
  → Severity: HIGH | Action: Price testing budget line item

[COST-003] Extended warranty required (>2 years for roofing, >1 year for most)
  → Severity: MEDIUM | Action: Confirm product/system meets warranty criteria

[COST-004] Commissioning required (01 91 00 or trade-specific)
  → Severity: HIGH | Action: Cx scope as separate line item; confirm Cx agent

[COST-005] LEED documentation requirements present
  → Severity: MEDIUM | Action: Price documentation administration cost

[COST-006] Occupied building / working hours restrictions present
  → Severity: HIGH | Action: Apply productivity factor; price shift premium

[COST-007] ICRA / infection control requirements present
  → Severity: HIGH | Action: Price containment, HEPA, disposal, sequencing

[RISK-001] Spec date precedes drawing date by more than 60 days
  → Severity: MEDIUM | Action: Confirm no addenda to spec issued post-drawings

[RISK-002] Spec-drawing contradiction detected (attribute mismatch)
  → Severity: HIGH | Action: RFI required; price higher standard

[RISK-003] Liquidated damages present in supplementary conditions
  → Severity: HIGH | Action: Schedule risk review; LD amount in risk register

[RISK-004] Unit price items with provisional quantities
  → Severity: MEDIUM | Action: Price unit rate with margin; flag quantity risk

[RISK-005] Allowance items without defined scope
  → Severity: MEDIUM | Action: List allowances separately in bid summary

[RISK-006] Single-manufacturer specification (de facto sole source)
  → Severity: MEDIUM | Action: Flag for substitution request or price lock-in

[RISK-007] "Or equal as approved" with no pre-approval process defined
  → Severity: MEDIUM | Action: Flag lead time risk; price approved product
```

---

## APPENDIX: NOVA-Specs Cross-Agent Connection Map

```
NOVA-Specs Parsing Output
         │
         ├──► NOVA-Plans
         │    • Wall type assembly reconciliation (spec vs. drawing)
         │    • Room finish schedule parsing (Division 09 → room finish matrix)
         │    • Equipment tag matching (MEP schedule → spec section)
         │    • Door/hardware schedule join (Section 08 71 00 → door schedule)
         │
         ├──► NOVA-Cost
         │    • Testing and inspection line items (01 45 33, trade QC sections)
         │    • Mock-up pricing (all Part 1 Submittal sections)
         │    • Allowance register (extracted from all sections)
         │    • Alternate register (extracted from Division 01)
         │    • Extended warranty cost adders
         │    • Occupied building productivity adjustments
         │    • LEED documentation administration cost
         │
         ├──► Sofia PM
         │    • Submittal register (all Part 1 Submittal clauses)
         │    • Commissioning schedule requirements
         │    • Closeout document requirements (01 77 00, 01 78 39)
         │    • Working hour restrictions (schedule constraints)
         │    • Phasing requirements (milestone triggers)
         │
         └──► NOVA-Risk
              • Performance specification flags
              • Open-ended scope language flags
              • Spec-drawing contradiction flags
              • Missing spec section flags
              • Liquidated damages register
              • Document date discrepancy flags
```

---

*NOVA-Specs Knowledge Base v1.0 | NOVATerra Intelligence Layer*
*Authors: Mike DeLuca (Estimating), Parker Conrad (Product), Sarah Chen (Engineering)*
*Classification: Internal — NOVATerra Core Knowledge*
