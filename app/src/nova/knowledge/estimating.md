# NOVA-Cost — Construction Estimating Knowledge Base

> Injected into NOVA's context for ROM generation, cost validation, and pricing suggestions.

## CSI MasterFormat Structure

The CSI MasterFormat organizes construction work into 50 divisions. The first 14 are most relevant for building estimating:

| Div | Name | Typical $/SF Range | Notes |
|-----|------|-------------------|-------|
| 01 | General Requirements | $3-12 | General conditions, bonds, insurance, temp facilities |
| 02 | Existing Conditions | $0-15 | Demo, hazmat abatement, site prep (varies wildly) |
| 03 | Concrete | $8-30 | Foundation, SOG, structural, flatwork |
| 04 | Masonry | $0-15 | CMU, brick, stone (0 if not used) |
| 05 | Metals | $5-25 | Structural steel, misc metals, railings |
| 06 | Wood/Plastics/Composites | $2-12 | Rough/finish carpentry, casework |
| 07 | Thermal & Moisture | $4-18 | Roofing, insulation, waterproofing, caulking |
| 08 | Openings | $5-20 | Doors, frames, hardware, windows, glazing |
| 09 | Finishes | $10-40 | Drywall, paint, flooring, ceilings, tile |
| 10 | Specialties | $1-8 | Toilet accessories, signage, fire extinguishers |
| 11 | Equipment | $0-25 | Kitchen, laundry, residential appliances (varies) |
| 12 | Furnishings | $0-15 | Window treatments, furniture (often NIC) |
| 21 | Fire Suppression | $3-8 | Sprinkler systems |
| 22 | Plumbing | $8-20 | Piping, fixtures, water heaters |
| 23 | HVAC | $12-40 | Ductwork, equipment, controls, TAB |
| 26 | Electrical | $10-30 | Power, lighting, low voltage |

**Project type cost profiles ($/SF, 2024-2026 national median):**
- Office (Class A): $180-280/SF
- Healthcare (hospital): $400-700/SF
- Healthcare (clinic/MOB): $200-350/SF
- Retail (shell): $80-150/SF
- Retail (tenant fit-out): $60-120/SF
- Education (K-12): $250-400/SF
- Higher Ed: $300-500/SF
- Industrial/Warehouse: $80-160/SF
- Hospitality: $200-450/SF
- Multifamily: $150-280/SF
- Mixed-Use: $180-320/SF

## Cost Drivers by Division

**Division 03 — Concrete:**
- Material: 40%, Labor: 45%, Equipment: 15%
- Key drivers: concrete strength (psi), rebar density (#/CY), formwork complexity
- Waste factor: 3-5% for concrete, 5-8% for rebar
- Pumping adds $15-25/CY

**Division 05 — Metals:**
- Material: 55%, Labor: 35%, Equipment: 10%
- Structural steel priced per ton ($2,500-4,500/ton installed)
- Misc metals (stairs, railings, embeds) often 15-20% of structural
- Connection type drives fabrication cost

**Division 08 — Openings:**
- Material: 60%, Labor: 30%, Equipment: 10%
- Doors priced per leaf: HM $600-1,200, WD $400-1,500, AL/GL $1,500-5,000
- Hardware per set: $200-800 standard, $1,200+ access control
- Fire-rated assemblies: 2-3x standard cost

**Division 09 — Finishes:**
- Material: 45%, Labor: 50%, Equipment: 5%
- Drywall: $2.50-5.00/SF (one side, taped/finished/primed)
- Paint: $0.50-1.50/SF
- ACT ceiling: $3-7/SF installed
- Ceramic tile: $8-25/SF installed
- VCT: $3-6/SF, CPT: $4-12/SF, LVT: $6-15/SF

**Division 23 — HVAC:**
- Material: 40%, Labor: 40%, Equipment: 20%
- RTU: $2,000-3,500/ton installed (packaged)
- Split system: $3,000-5,000/ton installed
- Ductwork: $3-8/lb fabricated and installed
- VAV box: $800-2,000/ea installed
- Controls/BMS: $1-3/SF

**Division 26 — Electrical:**
- Material: 45%, Labor: 45%, Equipment: 10%
- Power distribution: $5-12/SF
- Lighting: $3-8/SF
- Fire alarm: $2-5/SF
- Low voltage/data: $2-6/SF

## Pricing Methodology

**Three approaches (from least to most detailed):**

1. **Parametric/SF** — $/SF by building type. Good for ROM (+/- 25-30%). Based on historical data adjusted for market conditions.

2. **Assembly/System** — Price by building system (e.g., "exterior wall assembly = $45/SF including framing, sheathing, insulation, membrane, cladding"). Good for schematic estimates (+/- 15-20%).

3. **Unit Cost** — Individual line items (e.g., "5/8" GWB, 1 side, Level 4 finish = $2.85/SF"). Most accurate (+/- 5-10%). Requires complete drawings.

**Markup structure (typical GC):**
- Direct cost (material + labor + equipment) = 100%
- Overhead: 8-15% (office, insurance, admin)
- Profit: 3-8%
- Contingency: 3-10% (depends on document completeness)
- Bond: 1-3% if required
- Escalation: 3-6%/year if project is future-dated

**Crew rates:**
- Carpenter: $65-95/hr (burdened)
- Electrician: $75-110/hr (burdened)
- Plumber: $75-110/hr (burdened)
- Sheet metal: $70-100/hr (burdened)
- Laborer: $45-65/hr (burdened)
- Operating Engineer: $80-120/hr (burdened)
- Painter: $55-80/hr (burdened)
- Iron Worker: $80-115/hr (burdened)

*Burdened = base wage + benefits + taxes + insurance*

## Regional Cost Factors

**What drives regional variation:**
- Labor rates (union vs open shop, prevailing wage)
- Material transportation costs
- Local code requirements (seismic, wind, energy)
- Market conditions (supply/demand for trades)
- Permitting costs and timeline

**Metro multipliers (national average = 1.00):**
- New York City: 1.35-1.50
- San Francisco: 1.30-1.45
- Boston: 1.15-1.25
- Chicago: 1.10-1.20
- Los Angeles: 1.15-1.30
- Seattle: 1.10-1.20
- Denver: 1.00-1.10
- Dallas/Houston: 0.90-1.00
- Atlanta: 0.90-1.00
- Phoenix: 0.90-1.00
- Rural areas: 0.80-0.95

**Union vs Open Shop:** Union labor is typically 20-40% more expensive but productivity may be higher on complex projects. Prevailing wage projects (government/public) require union-scale rates regardless.

## ROM Methodology

**Confidence ranges by phase:**
- Conceptual (no drawings): +/- 30-50%
- Schematic Design: +/- 20-30%
- Design Development: +/- 15-20%
- Construction Documents (50%): +/- 10-15%
- Construction Documents (100%): +/- 5-10%
- Bid Day: +/- 3-5%

**Calibration from historicals:**
- Compare ROM output to actual proposals for same project type/size
- Adjust division-level factors (e.g., "our Division 09 runs 15% over RS Means")
- Track calibration factors over time — they shift with market conditions

**Red flags in an estimate:**
- Total $/SF significantly outside range for project type
- Any single division > 40% of total (unless specialized project)
- Division 01 < 5% or > 15% (usually indicates miscalculation)
- MEP combined < 30% of total on commercial (probably missing scope)
- Zero cost in Division 09 (finishes always have cost)
- Contingency < 3% (unrealistically aggressive)
