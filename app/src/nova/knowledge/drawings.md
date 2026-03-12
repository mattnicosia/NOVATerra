# NOVA-Plans — Construction Drawing Knowledge Base

> This document is injected into NOVA's context before reading construction drawings.
> Matt: edit and expand this over time. NOVA uses it on every scan.

## Sheet Identification

Sheet numbering follows a standard prefix system across most commercial projects:

| Prefix | Discipline | What to look for |
|--------|-----------|-----------------|
| G | General — cover, index, legends, abbreviations, life safety plans |
| C | Civil — site plan, grading, utilities |
| L | Landscape |
| S | Structural — foundation, framing, details |
| A | Architectural — floor plans, elevations, sections, enlarged plans, details |
| I | Interiors / Interior Design (some firms use ID-) |
| M | Mechanical — HVAC, ductwork, piping |
| P | Plumbing |
| FP | Fire Protection |
| E | Electrical — power, lighting, low voltage |
| T | Telecom / Technology |

**Sheet numbering convention:** Prefix + Level + Sequence. Example: `A2.01` = Architectural, 2nd floor, sheet 01. `A1.01` = 1st floor plan. `A0.01` = Ground/site level architectural.

**Detail sheets:** `A5.xx` or `A6.xx` typically contain enlarged details, schedules, and wall sections. This is where door, window, and finish schedules most often appear.

**Key pattern:** Schedules are almost always on sheets numbered A5.xx through A8.xx. If a schedule says "SEE SHEET A6.01" — that's where the matching schedule lives.

## Schedule Table Formats

### Door Schedules

**Typical columns:** Mark (door number), Width, Height, Thickness, Material (WD/HM/AL/GL), Type (SC/PR/SL), Frame Material, Frame Type, Hardware Group/Set, Fire Rating, Glazing, Head Detail, Jamb Detail, Sill/Threshold, Remarks/Notes.

**Key extraction points for estimating:**
- Count unique door marks = total door quantity
- Group by material + type for pricing (HM doors ≠ wood doors)
- Fire-rated doors cost 2-3x standard doors
- Hardware groups reference a separate hardware schedule or spec section

**Common variations:**
- Some firms use "DOOR NO." instead of "MARK"
- Width/Height may be combined as "SIZE" (e.g., "3'-0\" x 7'-0\"")
- "TYPE" column may reference a separate door type detail drawing
- Borrowed lite/sidelite columns indicate glazed configurations

### Window Schedules

**Typical columns:** Mark, Type, Width, Height, Material (AL/VN/WD), Glazing Type (IG/LAM/TEMP), Operation (FX/AW/CS/SH/SL), Frame Color, U-Value, SHGC, STC Rating, Head/Sill/Jamb Details, Remarks.

**Key for estimating:**
- Count marks = total windows
- Operable vs fixed dramatically affects cost
- Curtain wall systems (CW-) are bid as complete systems, not individual windows
- Storefront (SF-) is similar — priced as a system per linear foot

### Wall Type Schedules

**Typical columns:** Type Mark (e.g., WT-1, A, B), Description, Stud Size, Stud Gauge, Stud Spacing, Layers (each side), Insulation, Total Thickness, Fire Rating, STC Rating.

**Key for estimating:**
- Wall types define the scope of drywall, framing, and insulation
- Fire-rated assemblies (1-HR, 2-HR) require specific UL-listed configurations
- STC-rated walls require specific acoustic treatments
- A "Type A" wall in one project is completely different from "Type A" in another — always read the schedule

### Room Finish Schedules

**Typical columns:** Room Number, Room Name, Floor Finish, Base, North Wall, South Wall, East Wall, West Wall (or just "Walls"), Ceiling Height, Ceiling Type, Remarks.

**Key for estimating:**
- Maps every room to its finishes — primary source for painting, flooring, ceilings
- Abbreviations: PT = paint, VCT = vinyl composition tile, CPT = carpet, CT = ceramic tile, ACT = acoustic ceiling tile, GWB = gypsum wallboard
- Ceiling heights drive wall area calculations
- "N.I.C." = Not In Contract, "BY OWNER" = excluded from GC scope

### Plumbing Fixture Schedules

**Typical columns:** Mark, Type, Manufacturer, Model, Mounting (floor/wall), Supply, Waste Size, Carrier Required, ADA Compliant, Remarks.

**Key for estimating:**
- Counts by type (WC = water closet, LAV = lavatory, UR = urinal, SK = sink)
- Carrier-mounted fixtures cost significantly more (backing/blocking required)
- ADA fixtures have specific clearance and mounting requirements

### Equipment Schedules

**Typical columns:** Mark, Description, Manufacturer, Model, Size/Dimensions, Power Requirements, Connection Type, Furnished By, Installed By, Remarks.

**Key for estimating:**
- "?"NIC" or "BY OWNER" = estimator excludes from scope
- "FURNISHED BY OWNER, INSTALLED BY CONTRACTOR" (OFCI) = include installation labor
- Power and utility connections are separate line items
- Equipment pads/bases are usually in the GC scope

### Lighting Fixture Schedules

**Typical columns:** Type/Mark, Description, Manufacturer, Catalog Number, Lamp Type, Wattage, Voltage, Mounting, Dimensions, Emergency Battery, Remarks.

**Key for estimating:**
- Count by type from reflected ceiling plans (RCPs)
- Emergency fixtures (EM) and exit signs cost more
- Recessed vs surface vs pendant affects installation labor
- Dimming/controls add cost

### Mechanical Equipment Schedules

**Typical columns:** Mark, Description, Manufacturer, Model, Capacity (tons/BTU/CFM), Power, Voltage/Phase, Weight, Sound Rating, Remarks.

**Key for estimating:**
- RTUs, AHUs, FCUs, VAVs each have different cost structures
- Tonnage/CFM drives equipment cost
- Roof-mounted vs ground-mounted affects structural and rigging costs
- Ductwork and piping are separate from equipment

### Finish Detail Schedules

**Typical columns:** Type, Material, Pattern, Color, Manufacturer, Product, Application, Location, Remarks.

**Key for estimating:**
- Tile types, stone types, specialty finishes
- Substrate preparation requirements
- Pattern complexity affects labor (herringbone > stack bond)

## Drawing Notes Conventions

**General Notes vs Keynotes:**
- **General Notes** appear on early sheets (G or A0 series), apply project-wide
- **Keynotes** appear on individual drawings, reference spec sections (e.g., "07 21 16" = batt insulation)
- Keynote format: number in a circle/diamond pointing to a specific element

**Critical abbreviations in notes:**
- **U.N.O.** = Unless Noted Otherwise (the default applies everywhere except where shown differently)
- **TYP.** = Typical (applies to all similar conditions)
- **N.I.C.** = Not In Contract (excluded from this contractor's scope)
- **N.T.S.** = Not To Scale
- **SIM.** = Similar
- **E.Q.** = Equal / Equally spaced
- **V.I.F.** = Verify In Field
- **F.O.** or **BY OWNER** = Furnished by Owner

**Note hierarchy for conflicts:**
Large-scale drawings govern over small-scale. Written dimensions govern over scaled dimensions. Specifications govern over drawings for quality/material requirements.

## Mark and Symbol Systems

- **Door marks:** Numbers or letter-number combos (101, 101A, D-1) reference the door schedule
- **Window marks:** Similar pattern (W-1, W-2, or A, B, C)
- **Room numbers:** Three-digit (101, 201) where first digit = floor level
- **Column grid:** Letter-number grid (A-1, B-2) for structural orientation
- **Section cuts:** Circle with two numbers — top = section number, bottom = sheet where section is drawn
- **Detail callouts:** Similar circles, reference enlarged detail views
- **Revision clouds:** Bubbly outlines around changes, with triangle revision number

## Dimension and Measurement Conventions

- Standard format: `XX'-XX"` (e.g., `12'-6"`) or `XX' - XX"` with spaces
- Metric: shown in millimeters on international projects
- Dimension strings: chains of continuous dimensions, usually to face of stud or centerline
- **E.Q.** in dimension = equally spaced (divide the overall by count)
- **+/-** = approximate, verify in field
- Interior dimensions are typically to face of framing, not face of finish

## Common OCR Misreads

These character confusions are common when reading construction drawings via OCR:

| Actual | OCR Reads As | Context |
|--------|-------------|---------|
| 1 (one) | l (lowercase L) or I (capital i) | Dimensions, marks |
| 0 (zero) | O (letter O) | Dimensions, model numbers |
| " (inches) | '' (two single quotes) | Dimension notation |
| ' (feet) | ` (backtick) | Dimension notation |
| ½ | 1/2 or 1/ 2 | Fractional dimensions |
| ¼ | 1/4 | Fractional dimensions |
| × (multiply) | x (letter x) or X | Size notations |
| – (en-dash) | - (hyphen) | Range notation |
| ° (degree) | o or 0 | Angle notations |

**Rules:** When a dimension looks wrong (e.g., "l2'-6""), assume the first character is "1". When a size reads "3'-O"", that's "3'-0"". Fraction formatting varies wildly — normalize to decimal when uncertain.

## Architect and Engineer Patterns

**Large national firms** (HOK, Gensler, HKS, Perkins&Will):
- Highly standardized sheet numbering and keynoting
- More detailed schedules with more columns
- Multiple addenda and ASIs common
- Often use Revit — clean OCR, consistent formatting

**Small regional firms:**
- More variation in sheet numbering
- Schedules may be hand-formatted or simpler
- Notes may be more conversational
- Hand-drafted schedules are harder to parse

**MEP engineers:**
- M/P/E/FP prefix sheets
- Equipment schedules are the critical parsing target
- Panel schedules (electrical) have specific format
- Pipe and duct sizing schedules

**Structural engineers:**
- S prefix, framing plans, foundation plans
- Rebar schedules and structural steel schedules
- Connection details with specific callouts
