NOVA-Plans
Construction Drawing Intelligence — Knowledge Base
Version 1.0  |  NOVATerra  |  For AI System Context Use
Authored by: Mike DeLuca (30-yr GC Chief Estimator)  ·  Jony Ive (Information Architecture)  ·  Sarah Chen (AI Edge Cases & OCR Risk)

PURPOSE OF THIS DOCUMENT
This knowledge base is injected as system-level context before NOVA-Plans analyzes any construction drawing set. Reading this document first, NOVA should interpret sheet numbers, schedule tables, notes, marks, symbols, dimensions, and common OCR artifacts as a 10-year commercial estimator would — not as a first-day intern. Every section was written against what actually appears on drawings, not textbook ideals.


1. SHEET IDENTIFICATION
1.1 Primary Discipline Prefixes
Every sheet number begins with a letter code identifying the discipline. Know these cold:

Prefix
Discipline
Typical Content
A
Architectural
Floor plans, elevations, sections, details, finish/door/window schedules
S
Structural
Foundation plans, framing plans, connection details, structural schedules
M
Mechanical (HVAC)
Ductwork plans, mechanical equipment schedules, details
E
Electrical
Power/lighting plans, panel schedules, one-line diagrams
P
Plumbing
Pipe routing plans, plumbing fixture schedules, isometrics
FP
Fire Protection
Sprinkler plans, riser diagrams, fire alarm layouts
L
Landscape
Planting plans, irrigation, site furnishings
C
Civil
Site plans, grading, utility layout, paving
G
General / Cover
Project data, drawing index, abbreviations, code analysis
T
Technology / Telecom
Data, AV, security — often by specialty consultant
I
Interiors
Interior elevations, millwork details — sometimes separate from A sheets

1.2 Sub-Numbering Conventions (Architectural — Most Common Basis)
The two-digit group after the decimal point identifies the drawing type. The most widely adopted convention for A-series sheets:

Code Range
Drawing Type
Estimator Looks For
A0.xx
General / Cover Sheets
Project data, abbreviations list, drawing index
A1.xx
Floor Plans
Room layouts, partition locations, door/window marks, column grid
A2.xx
Exterior Elevations
Cladding types, opening sizes, material call-outs
A3.xx
Building Sections
Floor-to-floor heights, slab thicknesses, ceiling plenum space
A4.xx
Enlarged Plans / Interior Elevations
Toilet room details, kitchen layouts, casework
A5.xx
Details
Wall assemblies, flashing, expansion joints, threshold conditions
A6.xx
Schedules
Door, window, room finish, hardware group schedules
A7.xx
Door/Window Details
Frame profiles, glazing types, hardware mounting
A8.xx
Reflected Ceiling Plans
Ceiling heights, grid orientation, light fixture locations
A9.xx
3D / Rendering Sheets
Perspectives — little estimating value, check for alternates

MIKE: Real-World Variation
Many firms do not follow this exact schema. Smaller firms often put schedules on the floor plan sheets. Some number sequentially (A-1, A-2, A-3) with no sub-grouping. Large institutional firms (hospitals, universities) may add a third digit: A1.01.01. Always check the drawing index on the G or A0 sheets first to map the actual structure of that specific set.

1.3 Cover Sheets and Drawing Index
	•	Cover sheet is almost always G0.01, G-000, or A0.01 — the first sheet in the set
	•	Drawing Index lists all sheets by number and title. This is the authoritative sheet list — do not assume sheets exist if they're not indexed
	•	Abbreviation Legend is typically on G or A0 sheets. On smaller sets it may appear on A1.01
	•	Applicable Code Summary, project address, owner/architect/engineer blocks always on cover
	•	Revision history may be on cover or distributed across title blocks on each sheet

SARAH: OCR RISK — Sheet Number Parsing
Sheet numbers often appear in title block areas with surrounding box borders. OCR may read 'A1.01' as 'Al.01' (lowercase L for 1), or interpret the period as a comma. Always validate that the parsed sheet number matches a known discipline prefix pattern. Flag any sheet number where the prefix does not match a standard letter code.


2. SCHEDULE TABLE FORMATS
Schedules are the most data-dense elements in a drawing set. Each schedule type has standard column headers, but architects modify them freely. The critical skill is identifying the schedule type from context even when headers are abbreviated or truncated.

2.1 Door Schedule
Always found on A6.xx sheets or embedded on A1.xx floor plan sheets on smaller projects.

Column
Typical Header Variants
Data Format
Estimator Extracts
Mark
DR #, DOOR #, ID
Letter (A, B), Number (101), Alphanumeric (D-01)
Unique identifier — ties to mark on floor plan
Quantity
QTY, NO., COUNT
Integer
Total door count by type
Width
WDT, W, WIDTH
3'-0", 36", 900mm
Opening rough-in size
Height
HGT, H, HEIGHT
7'-0", 84", 2134mm
Opening rough-in size
Thickness
THK, T
1-3/4", 1-3/8"
Door slab spec
Material / Type
MAT, TYPE, MATL
HM, WD, AL, FRP
Hardware/material cost driver
Core
CORE
STC-33, SC, HC
Acoustic/fire rating implication
Label
LABEL, FIRE RATING, HR
20 MIN, 45 MIN, 60 MIN, 90 MIN, 3 HR
Fire door cost premium
Frame Type
FRM, FRAME
HM, AL, WD
Separate frame cost
Hardware Group
HDW GRP, HW, HARDWARE
H-1, H-2, HW-A
Maps to hardware schedule
Remarks / Notes
REMARKS, NTS, NOTE
Free text or note number
Exceptions, special conditions

	•	Most common mark formats: single letters (A–Z), then AA, AB, etc.; or floor-prefixed numbers (101, 102 = first floor)
	•	'HM' = hollow metal (steel). Most commercial interior doors. 'WD' = wood. 'AL' = aluminum storefront.
	•	Hardware groups are critical — each group is a line item. Verify hardware schedule exists on same sheet set
	•	Fire label column: blank = no rating required. Never assume unlabeled = standard door on egress paths

2.2 Window Schedule
Found on A6.xx or embedded in elevation sheets. Window marks appear as circled letters or numbers on floor plans and elevations.

Column
Typical Header Variants
Data Format
Estimator Extracts
Mark
WIN #, W#, ID, MARK
W1, W-1, 101A
Ties to floor plan and elevation callout
Quantity
QTY, NO.
Integer
Unit count for pricing
Width
WDT, W, WIDTH
4'-0", 48"
Rough opening or nominal size — confirm which
Height
HGT, H, HEIGHT
4'-6", 54"
Rough opening or nominal
Frame Material
FRAME, FRM
AL, VIN, FRP, WD, CLAD
Frame cost basis
Glazing
GLAZ, GLASS, UNIT
1" IGU, 1" LAM, 1/4" TEMP
Glass spec and cost tier
U-Value / SHGC
U-VAL, SHGC
0.28 / 0.25
Energy code compliance — check spec
Operation
OPER, TYPE
FIXED, CASEMENT, AWNING, SH, DH, SLIDER
Operability affects cost and hardware
Sill Height
SILL, SH
2'-6" AFF
Guard/fall protection threshold
Remarks
REMARKS, NTS
Free text
Special conditions, tinting, film

	•	Rough opening vs. nominal size: drawings do not always specify which. Default assumption is rough opening unless 'NOM' is noted
	•	Glazing spec 'IGU' = insulating glass unit. 'LAM' = laminated. 'TEMP' = tempered. Critical for safety glazing locations
	•	Curtain wall systems are almost never scheduled — they appear in elevations with system designations (CW-1, etc.)

2.3 Wall Type Legend / Schedule
Usually presented as a legend graphic (not a tabular schedule) on floor plan sheets or A5.xx detail sheets. Each wall type is a hatched or shaded assembly with a designation.

Field
Common Format
Estimator Extracts
Wall Type Mark
WT-1, W1, TYPE A, 4" PART.
Unique identifier in keynote/legend
Stud Size
3-5/8" @ 16" OC, 6" MTL STUD
Framing labor and material cost basis
Stud Material
MTL, WD, LB (light gauge)
Material cost tier
GWB Layers
5/8" GWB EA. SIDE, 2 LAYERS TYPE X
Drywall quantities by type
Fire Rating
1-HR, 2-HR, UL #
Fire partition cost premium, UL listing
Acoustic Rating
STC-47, STC-50
Acoustic batt, sealant, special clip requirements
Insulation
R-11 BATT, 2" RIGID, NONE
Insulation type and R-value for thermal walls
Total Width
Overall assembly dimension
Verify against plan dimensions
Height Note
TO DECK, TO 10'-0", TO CLG
Labor multiplier — full-height vs. partial

	•	'U.N.O.' (unless noted otherwise) on wall height means all walls go to structure unless a specific height is called out
	•	'TO DECK' = full height to structural deck. This adds cost vs. 'TO CLG' (to ceiling height)
	•	Double check that all wall marks used on the floor plan appear in the legend. Missing types = RFI risk

2.4 Room Finish Schedule
The most complex tabular schedule. One row per room. Each column is a surface/material. Found on A6.xx or at the end of floor plan sheets.

Column Group
Common Headers
Data Format
Notes
Room ID
RM #, ROOM NO.
101, 1.01, A-101
Must match floor plan room bubble
Room Name
ROOM NAME, DESCRIPTION
OFFICE, CORRIDOR, TOILET RM
Classification for finish grade
Floor
FL, FLR
CPT-1, VCT-2, CT-3, CONC, WD-1
Finish code ties to finish legend
Base
BASE, BS
VB-1, RB-2, WB-3, NONE
Base type and height
North/South/East/West Walls
N, S, E, W or combined WALLS
PT-1, PT-2, ACT, TLE-1
Each face may differ
Ceiling
CLG, CEIL
ACT-1, GWB, EXP, PT-2
Material and height on some schedules
Ceiling Height
CLG HT, FINISH HT
9'-0", 10'-6" AFF
Critical for material quantification
Remarks
NTS, REMARKS
Free text or note ref
Special conditions, owner-furnished finishes

	•	Finish codes (CPT-1, CT-3, etc.) always reference a separate finish material legend on same sheet or G sheets
	•	'PT' = paint. The paint schedule (sheen, color) is typically in the spec, not the drawings
	•	'ACT' = acoustical ceiling tile (lay-in grid). 'GWB' = gypsum board. 'EXP' = exposed structure
	•	Missing wall or ceiling entry = assume 'PT' (painted GWB) — confirm with architect

2.5 Plumbing Fixture Schedule
Found on P-series sheets. Each row is a fixture type. Critical for mechanical rough-in counts.

Column
Common Headers
Data Format
Estimator Extracts
Mark
FIX #, FIXT ID, P#
P-1, WC-1, LAV-2
Ties to plan symbol
Description
DESC, FIXTURE
WATER CLOSET, LAVATORY, URINAL
Fixture type classification
Manufacturer
MFR, MANUF
KOHLER, AMERICAN STD, TOTO
Spec basis — may say 'OR EQUAL'
Model
MODEL, CAT NO.
K-4620, etc.
Exact model for pricing
Rough-In
ROUGH, R.I.
12" FROM WALL, 14" FROM WALL
Rough-in dimension — labor impact
Water Supply
CW, HW, CW/HW
1/2" CW, 1/2" HW
Supply line size
Drain
DRAIN, DR
3", 4"
Drain line size
Vent
VENT
2", 3"
Vent line size
Trap
TRAP
2" P-TRAP
Trap size
Remarks
REMARKS, NTS
ADA, BY OWNER, NIC
Special conditions

	•	'BY OWNER' or 'NIC' (not in contract) — exclude from plumbing subcontractor bid scope
	•	ADA fixtures have specific rough-in requirements — verify clearances on plan, not just schedule

2.6 Equipment Schedule
Common on A, K (kitchen), and M sheets. Covers GC-furnished and owner-furnished equipment.

Column
Common Headers
Data Format
Notes
Mark
EQUIP #, EQ, E#
EQ-1, K-1, OFE-1
Mark on plan
Description
DESC, EQUIP
REFRIGERATOR, DISHWASHER
Equipment type
Manufacturer / Model
MFR / MODEL
Varies
Verify utility rough-in requirements
Furnished By
F.B., FURN BY
GC, OWNER, NIC
CRITICAL — defines scope split
Installed By
INST BY
GC, OWNER, ELEC, PLMB, MECH
Trade coordination trigger
Electrical
ELEC, CIRCUIT
20A/1PH/120V, 30A/3PH/208V
Panel capacity and circuit count
Plumbing
PLMB, CW/HW/DRN
CW 3/4", DRN 2"
Rough-in requirements
Gas
GAS
1/2" GAS, 3/4" GAS, NONE
Gas line sizing
Dimensions (W×D×H)
DIM, W×D×H
36"×30"×36"
Clearance verification

2.7 Lighting Fixture Schedule
Found on E-series sheets. Links fixture type to plan symbol.

Column
Common Headers
Data Format
Notes
Type
TYPE, FIX TYPE, LTG TYPE
A, B, C, A1, A2
Ties to symbol on lighting plan
Description
DESC, FIXTURE
2×4 RECESSED LED TROFFER
Fixture description
Manufacturer
MFR
LITHONIA, ACUITY, COOPER
Or 'approved equal'
Catalog No.
CAT NO., MODEL
2GTL-4-32-MVOLT-GEB10IS
Full catalog number for pricing
Lamps / Driver
LAMP, DRIVER
LED 4000K, 3500K, CRI 80
Technology spec
Wattage
WATTS, W
28W, 54W, 16W
Energy calc and circuit loading
Mounting
MNT, MOUNT
REC, SURF, PEND, WALL
Labor type
Voltage
VOLT, V
120V, 277V
Circuit design
Dimming
DIM, DIMMING
0-10V, DALI, NO
Controls coordination
Emergency
EMER, EM
EM, NONE, BATTERY
Code-required circuits
Remarks
NTS, REM
Free text
Special mounting, zone, exception

2.8 Mechanical Equipment Schedule
Found on M-series sheets. Covers AHUs, RTUs, fan coils, VAV boxes, exhaust fans.

Column
Common Headers
Data Format
Notes
Unit Tag
UNIT, TAG, EQUIP #
AHU-1, RTU-2, FC-3, VAV-101
Equipment identifier on plan
Description
DESC
AIR HANDLING UNIT, RTU
Equipment type
Served Area
SERVES, SVC AREA
ZONE A, 1ST FLOOR NORTH
Scope verification
CFM
CFM, SUPPLY CFM
2,400 CFM, 5,000 CFM
Sizing basis
Cooling / Heating
CLG, HTG
5 TON, 60 MBH
Capacity
External Static
ESP, EXT. STATIC
0.75" WC, 1.0" WC
Duct system design parameter
Electrical
ELEC, MCA, MOP
208V/3PH/60A MCA
Panel load and circuit size
Gas / Steam
GAS, STM
150 MBH INPUT
Utility rough-in
Weight
WT, WEIGHT
850 LBS
Structural support and rigging cost
Manufacturer / Model
MFR / MODEL
CARRIER, TRANE, DAIKIN
Pricing basis

2.9 Finish Detail Schedule / Finish Material Legend
Companion to the room finish schedule. Maps finish codes to full material specifications.

Column
Common Headers
Data Format
Notes
Code
CODE, ID
CPT-1, CT-3, PT-1, WD-1
Matches room finish schedule codes
Description
DESC, MATERIAL
CARPET TILE, CERAMIC TILE
Material type
Manufacturer
MFR
SHAW, MOHAWK, DALTILE
Brand spec
Product Name / #
PRODUCT, CAT NO.
Interface, Equilibrium
Exact product for pricing
Color
COLOR, FINISH
Varies
Color selection — may say 'TBD'
Size
SIZE
24"×24", 12"×24", 3/8"
Tile/plank sizing affects labor
Pattern / Install
INSTALL, PATTERN
STRAIGHT, DIAGONAL, HERRINGBONE
Labor factor
Remarks
NTS
Free text
Substrate prep, adhesive, special conditions

SARAH: OCR RISK — Schedule Tables
The most common OCR failures in schedules: (1) Table cell borders read as characters — a 'T' may actually be a corner of a table grid. (2) Multi-line cells where text wraps — the second line may be parsed as a separate row. (3) Narrow columns with truncated text — 'DOUBLE ACTING' becomes 'DOUBLE A'. (4) Superscript note markers (1, 2, *) attached to cell content may merge with the data value. Always validate that the number of parsed columns matches the header row.


3. DRAWING NOTES CONVENTIONS
3.1 Note Types
	•	General Notes: Numbered list in a border box, usually titled 'GENERAL NOTES'. Apply to entire sheet or entire project. Located in upper-left or lower-left of sheet.
	•	Keynotes: Numbered circles or hexagons on the drawing that reference a keynote legend (also on the sheet). Each keynote number is unique to the sheet. Format: ① ② ③ or in a triangle △1 △2.
	•	Specific / Leader Notes: Arrowhead pointing to an element with inline text. Not cross-referenced to a legend. Most common in details.
	•	Drawing Notes vs. Specification: Notes on drawings describe location and quantity. Specifications (separate document) describe quality and standards. Never assume spec requirements from drawings alone.

3.2 Scope Qualifier Abbreviations
These abbreviations materially affect what a contractor includes or excludes:

Abbreviation
Full Form
Estimator Action
U.N.O.
Unless Noted Otherwise
Default condition. Exceptions will be called out separately — scan for them.
TYP.
Typical
This condition applies everywhere it geometrically fits. Quantify all occurrences.
N.I.C.
Not In Contract
Excluded from this contract. Flag for owner-furnished / separate contract items.
BY OWNER
Owner-Furnished / Owner-Installed
Exclude from bid. Confirm if GC installs owner-furnished items.
V.I.F.
Verify In Field
Dimension or condition must be confirmed on-site. Do not rely on drawing dimension.
E.Q.
Equal (spacing)
Spaces are equal — calculate from overall dimension. Do not assume equal means symmetrical.
SIM.
Similar
This element is similar to a referenced element. Differences not shown must be confirmed.
B.O.
By Others
Provided or installed by a separate trade or contractor not in this scope.
D.F.A.
Deferred / Design for Approval
Element design not finalized. May be subject to engineer submittal.
G.C.
General Contractor
GC scope item — confirm in scope of work
A.I.C.
Architect In Charge / Approved In Contract
Context-dependent — read carefully

3.3 Specification Section References
Notes on drawings often reference spec sections for material and installation requirements. The format follows CSI MasterFormat:

See Section 08 71 00 — Door Hardware
See Spec. Section 09 21 16 — Gypsum Board
Per Specification Section 07 62 00 — Sheet Metal Flashing
09 30 00 — Tiling (abbreviated form)

	•	Three-level numbering: 08 = Division (Openings), 71 = Section Group (Door Hardware), 00 = Specific Section
	•	Old 16-division format (Div. 8, Div. 15) still appears on older drawing sets or when architects reference legacy specs
	•	When a spec section is called out, the drawing is NOT showing all requirements — the spec controls quality and acceptable substitutions

3.4 Detail Callout Conventions
Details are referenced from plan/section sheets using standardized bubble or triangle symbols:

Standard circle callout:    [3/A5.01]  =  Detail 3, found on sheet A5.01
Triangle callout:           △ 4/S3.02   =  Section cut 4, found on sheet S3.02
Section cut arrow:          ←→ with tail =  Direction of view and sheet reference
Break line:                 Zigzag line =  Portion of element not shown

	•	Top number = detail number on destination sheet. Bottom = sheet number. Always read as 'detail/sheet'.
	•	Some firms reverse this — always check a known detail to confirm firm's convention before parsing
	•	Revision clouds: Irregular bubble drawn around changed area. Delta triangle (▲ or Δ) with revision number nearby. Check title block for revision history.

SARAH: OCR RISK — Note Numbers
Keynote circles (①) and triangles (△1) are frequently misread. The circle border may be dropped entirely, leaving just the number. A '6' in a circle may read as '0' if the circle is small. Leader lines (arrows) pointing to text may cause the arrow tip to be included as a character — watch for stray glyphs preceding note text.


4. MARK AND SYMBOL SYSTEMS
4.1 Door Marks
	•	Single letter: A, B, C — common on small projects (under ~20 door types)
	•	Floor-prefixed number: 101, 102, 201 (first digit = floor number)
	•	Type + sequence: D-01, D-02 or DR-1, DR-2
	•	Mark appears in a small circle tag on the floor plan, pinned to the door swing
	•	Same mark = same type (dimensions + material + hardware group). Multiple quantity.
	•	If a door has no mark, it is typically a standard interior hollow-core — confirm with GC

4.2 Window Marks
	•	Usually a letter in a hexagonal or square tag, or W1/W-1 format
	•	On curtain wall elevations, window types within a curtain wall system use alphanumeric sub-tags (CW-1A, CW-1B)
	•	Storefront systems often use type designations (SF-1, SF-2) rather than individual marks

4.3 Room Numbers
	•	Appear in a circle or rounded rectangle on the floor plan
	•	Format: floor prefix + sequential number (101, 102, 103 on first floor; 201, 202 on second)
	•	Some firms use descriptive codes: MECH, ELEV, STAIR, CORR — not numbered
	•	Room number is the primary key for the room finish schedule lookup
	•	Mezzanines and interstitial spaces may use M-prefix or letter suffix (101A, 101B)

4.4 Column Grid Lines
Grid Direction
Convention
Example
Notes
Horizontal (left-right)
Numbered 1, 2, 3...
1, 2, 3, 3A, 4
Additional column between grids adds letter suffix: 3A
Vertical (up-down)
Lettered A, B, C...
A, B, B.5, C
Skips 'I' and 'O' to avoid confusion with 1 and 0
Intersection designation
Number + Letter
B-3, A-2
Column is at intersection of grid lines
Intermediate grids
Decimal or fraction
A.5, B.1
Added column between primary grids

	•	Column grids extend across all floors — same grid line designation applies on every level
	•	Plan notes frequently reference grids: 'ALL COLUMNS ALONG GRID LINE B' — always parse the grid reference as a separate entity from other text

4.5 Elevation and Level Marks
Elevation mark format:    ELEV. = 100'-0"  or  100.00 (datum)
Finished floor:          F.F.E. 100'-0"  or  0'-0" (project datum)
Top of slab:             T.O.S. 110'-6"
Top of steel:            T.O.S.  (context distinguishes slab vs steel)
Top of wall:             T.O.W. 12'-0" A.F.F.
Finished ceiling:        F.C. 9'-0" A.F.F.
Above finished floor:    A.F.F.
Above finished grade:    A.F.G.

SARAH: OCR RISK — Grid Lines
Column grid letters 'I' and 'O' are officially excluded by convention — but some firms use them anyway. If a parsed grid letter is 'I' or 'O', verify whether it is actually '1' or '0' (numeral). Grid bubbles (circles at sheet edge containing the grid designator) have borders that can cause OCR to append circle characters to the grid letter.


5. DIMENSION AND MEASUREMENT CONVENTIONS
5.1 Feet-Inches Notation Formats
All of the following formats appear on drawings and mean the same thing:

Format
Example
Reads As
Notes
Feet-inches with hyphen
3'-6"
3 feet 6 inches
Most common on architectural sheets
Feet-inches no space
3'6"
3 feet 6 inches
Common on structural and MEP
Feet-inches with fraction
3'-6 1/2"
3 feet 6.5 inches
Fraction after inch value
Inches only
42"
42 inches (3'-6")
Common on detail sheets, schedules
Decimal feet
3.5'
3 feet 6 inches
Rare — more common in civil/site work
Metric (mm)
1067mm
Approx. 3'-6"
On international or dual-unit projects
Metric (m)
1.067m
Same
Civil sheets may use meters

5.2 Dimension String Hierarchy
Dimensions are stacked in layers from the drawing element outward. Reading order: smallest detail first, building to overall:

Layer 1 (innermost): Individual components — 3"-16"-3" (stud cavity)
Layer 2:             Room-to-room — 12'-0" + 8'-0" + 12'-0"
Layer 3:             Wing/zone — 32'-0"
Layer 4 (outermost): Overall building dimension — 148'-6"

	•	Always verify: sum of intermediate dimensions must equal outer dimension. If they don't, an RFI is required.
	•	Grid-to-grid dimensions are the most reliable — column grids are the design control lines
	•	Face-of-stud dimensions are the contractor reference. Face-of-finish dimensions are for aesthetics.

5.3 Key Dimension Abbreviations
Abbreviation
Meaning
Estimator Notes
EQ.
Equal spacing
Divide available dimension by number of spaces. Not always symmetrical about center.
+/-
Plus or minus / approximate
Do not rely on this dimension for quantity takeoff — field verify.
CLR.
Clear dimension
Inside face to inside face. Use for code clearance checks.
NOM.
Nominal
Rough lumber or masonry nominal size, not actual. 2×4 actual = 1.5"×3.5".
MAX.
Maximum
Cannot exceed this dimension. Clearance or limit condition.
MIN.
Minimum
Must not be less than. ADA or code compliance.
(3'-0")
Dimension in parentheses
Reference dimension only — do not use for layout. For verification only.

SARAH: OCR RISK — Dimensions
Prime (') and double-prime (") symbols for feet/inches are frequently OCR'd as straight apostrophes or quotation marks — or dropped entirely. '3'-6"' may parse as '3-6', '36', or '3\'6\''. The dimension dash (hyphen between feet and inches) may be parsed as a minus sign in a formula. Fractions: '1/2' is usually correct; the Unicode ½ character may OCR as '12' or '72'. Always validate that parsed dimension values fall within plausible ranges for the element type.


6. COMMON OCR MISREADS & MACHINE FAILURE MODES
This section documents the most frequent parsing failures when extracting data from construction drawings. Each failure type includes detection logic and correction strategy.

6.1 Character Substitution Table
OCR Reads
Likely Intended
Context Detection
Correction Strategy
l (lowercase L)
1 (one)
In a door/room mark or dimension
If followed by digits or in alphanumeric mark context, treat as '1'
I (uppercase i)
1 (one)
In schedule column data
Same as above — context is key
O (uppercase o)
0 (zero)
In marks, grid designators
If grid context excludes I/O by convention, treat as '0'
0 (zero)
O (letter)
In room name or material code
Rare on drawings — material codes use letters not zero
" (double quote)
'' (two singles)
Inch marks
Normalize all inch marks to " before parsing
' (apostrophe)
' (prime/feet)
Foot marks
Normalize — straight or curly are equivalent
½ ¾ ¼ (Unicode)
1/2, 3/4, 1/4
Fractions in dimensions
Always normalize Unicode fractions to slash notation
- (hyphen)
' or –  (em-dash)
Dimension strings
Parse entire dimension string as unit, not as subtraction
B (letter B)
8 (eight)
In measurements or marks
Validate: B should not appear in numeric-only fields
S (letter S)
5 (five)
Same as above
Context: if in numeric field, flag for review
rn (r+n)
m (em)
In material names: 'rn' → 'm'
Common in 'mm' (millimeters), 'FRAME'

6.2 Structural Parsing Failures
	•	Table borders: Horizontal or vertical lines in a table grid may be parsed as underscores, hyphens, or pipe characters. These should be stripped from cell content.
	•	Multi-line cells: A cell containing wrapped text across two lines will produce two rows in naive parsing. Detect by checking if row count exceeds header column count — indicates merged content.
	•	Header row identification: Schedule headers are often bold or shaded. OCR engines may not flag boldness. Use positional heuristic: first row of table that contains all non-numeric values is the header.
	•	Dense schedule overlap: When two schedules are printed adjacent on the same sheet without sufficient whitespace, column data from one schedule may bleed into another. Detect by checking if any column header is duplicated.
	•	Rotated text: Column headers in narrow schedules are sometimes printed vertically (90°). These will be misread or omitted entirely by most OCR engines.

6.3 Symbol and Notation Failures
	•	Diameter symbol (Ø): Often misread as '0', 'o', or 'Q'. In structural or pipe contexts, Ø before a number always means diameter.
	•	Degree symbol (°): May be dropped or read as an apostrophe. '45°' becomes '45''.
	•	Plus/minus (±): May become '+/-' or be dropped. Always normalize to +/-.
	•	Delta (Δ or ▲): Revision symbol. May OCR as 'A' or be dropped. If a number appears inside or adjacent to a triangle-shaped mark, treat it as a revision number.
	•	Centerline (℄): May OCR as 'L', 'C', 'CL', or be dropped. Normalize all variations to 'CL'.
	•	Section mark (§): Rare on drawings but appears in spec references. May be read as 'S'.

SARAH: Highest-Priority OCR Risks on Construction Drawings
In order of frequency and consequence: (1) Dimension units dropped — '3-6' instead of '3'-6"'. (2) Door mark 'B' misread as '8'. (3) Room number '101' misread as '1O1'. (4) Wall type 'W-1' misread as 'VV-1'. (5) Spec section '08 71 00' misread as '0871 00'. (6) Schedule column borders creating phantom rows. (7) 'N.I.C.' misread as 'N.LC.' or 'NIC' (without periods, meaning changes). Never skip a validation pass on dimension values, mark designators, and scope qualifiers.


7. ARCHITECT / ENGINEER FIRM PATTERNS
7.1 Large Firms (HOK, Gensler, SOM, HDR, Perkins+Will)
	•	Highly standardized — drawing organization matches AIA standards closely
	•	BIM-generated drawings: Revit models produce schedules automatically. Schedules are accurate to model but may have parametric truncation (field data cut off if column too narrow in Revit view)
	•	Title blocks are consistent across sheets. Revision history is rigorous.
	•	Sheet numbering follows strict AIA classification. Sub-discipline consultants may use different prefix conventions (e.g., LPA-01 for landscape architecture)
	•	Large project sets: 200-800+ sheets. Drawing index is essential — do not assume logical sequence

7.2 Small / Mid-Size Firms (1–20 staff)
	•	CAD (AutoCAD) or hybrid CAD/Revit. More manual annotation = more variation
	•	Schedules hand-drafted or Excel-inserted as blocks. Column widths inconsistent.
	•	Sheet numbering may be purely sequential (A-1 through A-24) without discipline sub-grouping
	•	Abbreviation lists may be informal or missing. Context-inference required.
	•	Notes may be inconsistent: general notes on some sheets, keynotes on others

7.3 MEP Engineer Conventions vs. Architectural
	•	MEP engineers typically have different title block formats than the architect of record
	•	Schedules on M, E, P sheets use engineering-specific column headers not found on A sheets
	•	Electrical panel schedules: always tabular, often formatted with two columns of circuits (odd left, even right). Misread as two separate schedules.
	•	Piping isometrics: schematic 3D drawings. No scale. Dimensions shown as text, not measured from drawing.
	•	Equipment tags on MEP sheets use trade-specific systems (AHU-1, EF-3, CWP-2) that do not appear on A sheets

7.4 Design-Build vs. Traditional Delivery
Factor
Traditional (Design-Bid-Build)
Design-Build
Drawing Completeness
100% CDs before bid. All schedules populated.
Bridging docs or performance specs. Schedules may be placeholder.
Specification Relationship
Specs separate, drawings cross-reference
May be combined in DB RFP document
RFI Expectation
Drawings should be complete. RFIs for conflicts.
Design gaps expected. DB team fills in details.
Sheet Count
Full set
May be 30-40% of full CD set
Schedule Accuracy
High — schedules match design intent
Lower — placeholder counts and types common

7.5 Permit Set vs. Construction Documents vs. Issued For Construction (IFC)
	•	Permit Set: May be missing details not required for permit. Not for construction quantities.
	•	100% Construction Documents: Full intent, but pre-bid comments not yet incorporated
	•	IFC / Addendum: Final issued-for-construction set. This is the bid and build basis. Always confirm drawing issue status from title block before extracting quantities.
	•	ASI (Architect's Supplemental Instructions): Post-bid field changes. Look for 'ASI-##' designation on revised sheets


8. QUICK REFERENCE — COMMON ABBREVIATIONS
The most frequently appearing abbreviations across all sheet types:

Abbreviation
Meaning
Abbreviation
Meaning
A.F.F.
Above Finished Floor
MTL.
Metal
A.F.G.
Above Finished Grade
N.I.C.
Not In Contract
ACT
Acoustical Ceiling Tile
NOM.
Nominal
AHU
Air Handling Unit
OC
On Center
AL.
Aluminum
PTD.
Painted
BD.
Board
RTU
Rooftop Unit
BOT.
Bottom
S.S.
Stainless Steel
CLG.
Ceiling
SIM.
Similar
CL / CL
Centerline
STC
Sound Transmission Class
CMU
Concrete Masonry Unit
T.O.S.
Top of Slab / Top of Steel
DIA. / Ø
Diameter
T.O.W.
Top of Wall
EQ.
Equal
TYP.
Typical
EWC
Electric Water Cooler
U.N.O.
Unless Noted Otherwise
FE.
Fire Extinguisher
V.I.F.
Verify In Field
FEC
Fire Extinguisher Cabinet
VCT
Vinyl Composition Tile
FF&E
Furniture, Fixtures & Equipment
W/
With
FRP
Fiberglass Reinforced Panel
W/O
Without
GWB
Gypsum Wallboard
WC
Water Closet (toilet)
HM
Hollow Metal
WD.
Wood
IGU
Insulating Glass Unit
WP
Waterproof / Waterproofing


NOVA-Plans Drawing Intelligence Knowledge Base  |  NOVATerra  |  v1.0
Authored by the BLDG Board: Mike DeLuca · Jony Ive · Sarah Chen
