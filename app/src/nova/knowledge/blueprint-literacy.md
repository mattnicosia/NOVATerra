NOVA Blueprint Intelligence — Visual Literacy & Reading Comprehension
Knowledge Base for AI System Context
Version 1.0 | NOVATerra


## Line Weights

| Weight | Pen Width | Represents | Examples |
|---|---|---|---|
| EXTRA HEAVY | 0.70-1.00mm | Drawing border, match lines, section cut lines | Sheet border, section bubble line |
| HEAVY | 0.50-0.70mm | Cut elements (section slice passes through) | Cut walls in plan, cut columns, slab edge |
| MEDIUM | 0.35-0.50mm | Visible edges beyond cut plane | Wall beyond, door/window frames |
| LIGHT | 0.18-0.25mm | Dimensions, notes, leaders, grid lines | Dimension strings, keynote leaders |
| EXTRA LIGHT | 0.10-0.18mm | Hatch patterns, fill patterns, background | Concrete stipple, earth hatch |

Rule: Heaviest lines in floor plan = walls the cut plane passes through. Lighter = above/below.


## Line Types

| Line Type | Pattern | Meaning |
|---|---|---|
| SOLID | continuous | Visible edge at/above cut plane |
| DASHED (HIDDEN) | short dashes | Below cut plane or hidden behind |
| CENTERLINE | long-short-long | Axis of symmetry, center of element |
| PHANTOM | long-short-short | Future work, alternate position, demo, NIC |
| PROPERTY/EASEMENT | long-short-short-short | Property line, setback, easement boundary |
| HIDDEN OVERHEAD | long dashes | Beam above, skylight, ceiling change |

Dashed rectangle on floor plan: Near columns/walls = footing/beam. Open area = below-slab utility or depression.


## Hatch Patterns and Material Symbols

Concrete: Random stipple dots = CIP concrete. Triangular lines + stipple = lightweight concrete. Solid black = steel in section. Dense stipple = grout.

Masonry: Brick coursing (horizontal + offset joints) = face brick. Large rectangles with alternating joints = CMU. Irregular horizontal layers = stone. Diagonal + outlined cells = structural clay tile.

Wood: Parallel lines along grain = dimensional lumber face. Small circles/ellipses = end grain (cross-section). Wavy grain = finish wood/millwork.

Insulation: Wavy parallel (cloud profile) = batt (fiberglass/mineral wool). X pattern between lines = rigid (polyiso/XPS/EPS). Dotted between lines = spray foam.

Earth/Site: Diagonal + irregular dots = native soil. Dots + horizontal base = compacted fill. Coarser diagonal = gravel/aggregate. Fine horizontal = sand.

Steel/Metals: Solid black thin = steel in section. Cross-hatch 45 degrees = aluminum/non-ferrous. Single diagonal = heavier metal section.

Gypsum: Parallel fine lines + solid edge = GWB/drywall. Very fine parallel = plaster.

Wall section reading order (exterior to interior): Cladding, sheathing, stud cavity (insulation), interior finish. Each layer = separate cost item + separate sub scope.


## Sheet Numbering System

Discipline prefixes: G=General, C=Civil, L=Landscape, A=Architectural, S=Structural, M=Mechanical, P=Plumbing, FP=Fire Protection, E=Electrical, T=Technology, FA=Fire Alarm

Architectural sub-numbers:
- A0.x = General/Cover
- A1.x = Floor Plans
- A2.x = Elevations
- A3.x = Sections
- A4.x = Wall Sections
- A5.x = Details
- A6.x = Schedules
- A7.x = Interior Elevations
- A8.x = RCP
- A9.x = Roof Plans

Structural sub-numbers:
- S0.x = General Notes
- S1.x = Foundation
- S2.x = Framing (per level)
- S3.x = Roof Framing
- S4.x = Sections
- S5.x = Details
- S6.x = Schedules


## Scale Recognition

| Scale | Use | Info Density |
|---|---|---|
| 1"=100' | Site overview | Very low — massing only |
| 1/8"=1'-0" | Small building plans | Medium — rooms, major dims |
| 1/4"=1'-0" | Standard floor plans | Standard — all tags, dims |
| 1/2"=1'-0" | Enlarged plans | High — all detail |
| 1"=1'-0" | Large details | Very high — full assembly |
| 1-1/2"=1'-0" | Standard details | Very high — all components |
| 3"=1'-0" | Fine details | Extremely high — every fastener |

NTS = Not To Scale — do not extract geometry; use only written dimensions.
Scale inference: Standard door = 3'-0" wide. Standard stud bay = 16" or 24" OC.


## Abbreviation Dictionary

General: TYP=Typical, SIM=Similar, NTS=Not to Scale, NIC=Not in Contract, VIF=Verify in Field, UNO=Unless Noted Otherwise, EQ=Equal, OC=On Center, EW=Each Way, CLR=Clear, CL=Centerline, CONT=Continuous, SYM=Symmetrical

Structural: AFF=Above Finished Floor, SOG=Slab on Grade, SOD=Slab on Deck, TOS=Top of Slab/Steel, BOC=Bottom of Construction, EJ=Expansion Joint, CJ=Control Joint, CMU=Concrete Masonry Unit, CIP=Cast-In-Place, PT=Post-Tensioned, WWF=Welded Wire Fabric, GB=Grade Beam

Architectural: GWB=Gypsum Wallboard, MTL=Metal, FFE=Finished Floor Elevation, RCP=Reflected Ceiling Plan, WP=Waterproofing, VB=Vapor Barrier, ACT=Acoustical Ceiling Tile, STC=Sound Transmission Class, HR=Hour (fire rating), EIFS=Exterior Insulation Finish System

MEP: AHU=Air Handling Unit, FCU=Fan Coil Unit, VAV=Variable Air Volume, VFD=Variable Frequency Drive, CHW=Chilled Water, MCC=Motor Control Center, MDP=Main Distribution Panel, GFCI=Ground Fault Circuit Interrupter, FD=Floor Drain, RD=Roof Drain, CO=Cleanout


## Keynote Systems

Keynotes = numbered callouts referencing a legend that maps to a CSI spec section and full material standard.

CSI Divisions: 01=General Req, 02=Existing, 03=Concrete, 04=Masonry, 05=Metals, 06=Wood, 07=Thermal/Moisture, 08=Openings, 09=Finishes, 10=Specialties, 11=Equipment, 12=Furnishings, 14=Conveying, 21=Fire Suppression, 22=Plumbing, 23=HVAC, 26=Electrical, 27=Communications, 28=Electronic Safety, 31=Earthwork, 32=Exterior Improvements, 33=Utilities

Rule: Keynote CSI division identifies the responsible trade sub. Div 09 = drywall+flooring+paint. Div 07 = roofing+waterproofing.


## Notes Hierarchy

Authority order (highest first):
1. Project-specific drawing note (on specific drawing)
2. Sheet-specific general note (same sheet)
3. Project general notes (G-001 or A-001)
4. Project specifications (spec book)
5. Referenced standards (ACI, AISC, IBC, etc.)
6. Building code minimum

Key patterns: "SEE STRUCTURAL FOR..." = structural governs. "OFCI" = owner buys, GC installs. "NIC" = excluded. "VIF" = measure in field. "MATCH EXISTING" = premium. "COORDINATE WITH [TRADE]" = scope gap risk.


## Title Block Intelligence

Extract: Project name, address, architect/engineer, sheet number, drawing date, revision block, scale, phase/status.

Drawing status codes with contingency ranges:
- SD (Schematic Design): 10-30% complete, 30-50% contingency
- DD (Design Development): 30-60% complete, 15-25% contingency
- 50% CD: 10-15% contingency
- 90% CD: 5-10% contingency
- IFC (Issued for Construction): price as shown
- ASI (Architect Supplemental Instruction): change, verify cost impact

Rule: Always check revision block before reading any drawing. Latest revision governs.


## Dimension Hierarchy

Overall > Intermediate > Detail — must add up. If they don't, flag an RFI.
- "DO NOT SCALE" = law. Use only written numbers.
- Architectural dims = face-to-face. Structural dims = center-to-center.
- Nominal vs actual: 2x4 = actually 1.5" x 3.5"
