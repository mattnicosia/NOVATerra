NOVA Blueprint Intelligence — Estimating Data Reference
Knowledge Base for AI System Context
Version 1.0 | NOVATerra


## Structural Notation

Rebar callout format: #[size] @ [spacing] [direction] [coverage]
- #4 @ 12" OC EW = #4 bars at 12" on center, each way (X and Y)
- #5 @ 8" OC T&B = #5 bars at 8" OC, top and bottom mats
- #6 @ 6" OC EF = #6 bars at 6" OC, each face (walls)

Rebar sizes:

| Bar | Diameter | Weight (lbs/LF) | Common Use |
|---|---|---|---|
| #3 | 3/8" | 0.376 | Ties, stirrups, small slabs |
| #4 | 1/2" | 0.668 | SOG, walls, standard footings |
| #5 | 5/8" | 1.043 | Elevated slabs, beams |
| #6 | 3/4" | 1.502 | Columns, retaining walls |
| #7 | 7/8" | 2.044 | Heavy columns, transfer beams |
| #8 | 1" | 2.670 | Mat foundations |
| #9 | 1-1/8" | 3.400 | Large mat foundations |
| #10 | 1-1/4" | 4.303 | Very heavy structural |
| #11 | 1-3/8" | 5.313 | Massive foundations, seismic |

Modifiers: EW=Each Way (double count), T&B=Top and Bottom (double), EF=Each Face (double), OC=On Center, CONT=Continuous, ALT=Alternating (half count)


## Structural Steel Designations

- W shapes: W12x26 = Wide flange, approx 12" deep, 26 lbs/LF (beams, columns)
- HSS: HSS6x4x1/4 = Rectangular tube 6"x4", 1/4" wall (columns, bracing)
- Pipe: PIPE 6 STD = 6" nominal, standard weight (round columns, handrails)
- Angles: L4x4x1/2 = Equal leg, 4"x4", 1/2" thick (lintels, stair stringers)
- Channels: C10x20 = 10" deep, 20 lbs/LF (framing, ledgers)
- Plates: PL1/2"x8"x12" = 1/2" thick, 8"x12" (base plates, gussets)


## Concrete Callout System

Format: [PSI], [thickness], [reinforcing], [special]
Example: 4000 PSI, 6" SOG, #4@18"OC EW, 6x6-W2.9xW2.9 WWF, VB BELOW

Concrete PSI uses: 2500=lean fill, 3000=residential, 4000=commercial standard, 5000=high-rise/elevated, 6000+=post-tensioned/special


## MEP Symbol Libraries

Electrical: Circle with dot = duplex outlet. +GFI = GFCI. +WP = weatherproof. +220 = 240V. Bar perpendicular = single-pole switch. Square with X = ceiling light. Rectangle with lines = fluorescent/LED. Circle with E = emergency light. Rectangle with P = panel. Arrow = home run to panel.

Plumbing: Circle with crosshairs = floor drain. Wavy circle = roof drain. Cleanout symbol = cleanout. Rectangle + oval = lavatory. Oval = water closet. Long rectangle = bathtub. Narrow rectangle = urinal. Hose bibb symbol = hose bibb. Line labels: W=cold water, HW=hot water, S=sanitary, V=vent, ST=storm.

HVAC: Rectangle + diagonal lines = supply diffuser. Rectangle outline = return grille. Circle + lines = exhaust. Double parallel lines = large duct. Single line = small duct. Circle + cross = fan. Rectangle + coil = FCU. V inside rectangle = VAV. Large rectangle + connections = AHU. Dashed labels: CHW=chilled water, HW=heating water, REF=refrigerant.


## Door Schedule Columns

Standard columns: Door#, Width x Height, Thickness, Material (HM/WD/AL/SS/FRP), Core (HC/SC/FC), Fire Rating (20/45/60/90-min, 3-hr), Frame Type (KD/Welded), Hardware Set, Glazing (FLT/TEMP/WIRE/LAM/IG), Threshold, Remarks (NIC/OFCI/special)


## Window Schedule Columns

Standard columns: Window#, Width x Height, Operation (Fixed/Casement/Awning/Hung/Slider), Frame Material (AL/VIN/WD/FRP), Glazing Type (SGL/DBL/TRIP/IG), U-Factor, SHGC, Performance Class (CW/AW/HC/R), Sill Height AFF, Head Height AFF, Fire Rating, Impact Rated, Special Notes


## Finish Schedule Format

Layout: ROOM | FLOOR | BASE | N WALL | S WALL | E WALL | W WALL | CEILING | CLG HGT | REMARKS

Floor codes: CPT=Carpet, LVT=Luxury Vinyl, VCT=Vinyl Tile, CT=Ceramic Tile, HWT=Hardwood, SLT=Stone, CON=Exposed Concrete, ESD=Epoxy, RBR=Rubber, ACC=Access Floor

Wall codes: PT=Paint (note sheen), CT=Ceramic Tile (note height), VWC=Vinyl Wall Covering, WD PNL=Wood Panel, CMU=Exposed Masonry

Ceiling codes: GWB=Gypsum, ACT=Acoustical Tile, WD=Wood, EXP=Exposed Structure, MET PNL=Metal Panel

Ceiling height entries: Flat value = flat ceiling. VIF = verify in field. TO DECK = no ceiling, exposed. SEE RCP = complex condition.


## Wall Type Legend

Format: WALL TYPE: A -- 3-5/8" MS @ 16" OC, 1 layer 5/8" Type X GWB each side -- 1-HR UL U419 -- STC 44

Stud sizes: 1-5/8"=non-structural. 2-1/2"/3-5/8"=standard partition. 6"=exterior with cavity insulation. 8"+=high wind/tall wall.

GWB types: Standard 1/2", Type X 5/8" (fire-rated), Type C (enhanced fire), MR (moisture areas), Cement Board (tile backer)

Relative costs (base = simplest partition):
- Standard partition: 1.2x
- Fire-rated (2-layer Type X): 1.8x
- Acoustic (staggered + batt + 2-layer): 2.2x
- Exterior light gauge: 4-6x
- CMU ungrouted: 3x
- CMU grouted/reinforced: 4.5x


## Code Compliance Cost Flags

Fire ratings on drawings: "1-HR"/"2-HR" on wall = rated assembly required. "FIRE WALL" = full structural continuity. "FD" on door = fire door (rated frame + hardware). "FSC" on glazing = fire-safety glass (very expensive).

ADA markers: Wheelchair symbol = accessible route. "CLR" at door = clear opening (32" min). "AFF" dims at accessories = reach range (15"-48" forward, 9"-54" side). Ramp slope max 1:12. "1% MAX"/"2% MAX" = cross-slope limits.

Cost flags: Fire-rated door = 2-3x standard. P/T slab = no cutting without engineer. VIF = assumption risk. Revision cloud (delta) = scope change. "MATCH EXISTING" = unknown scope premium. "NIC" = exclude. "OFCI" = coordination risk. "TBD" = incomplete set.
