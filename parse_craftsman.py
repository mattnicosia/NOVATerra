#!/usr/bin/env python3
"""
Parse the 2026 National Construction Estimator PDF (Craftsman Book Company)
Extracts Industrial & Commercial Division cost data (pages 310-639)
Uses line-by-line text extraction (NOT table extraction) for clean descriptions.
Outputs structured JSON for CORE integration.
"""

import pdfplumber
import json
import re
import os
from datetime import datetime

PDF_PATH = os.path.join(os.path.dirname(__file__), "2026_national_construction_estimator_ebook_1.pdf")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "app", "src", "constants", "craftsmanData2026.json")

START_PAGE = 310  # Industrial & Commercial Division starts here
END_PAGE = 639

# Division header: "01 General Requirements", "03 Concrete", etc.
DIV_HEADER_RE = re.compile(r'^(\d{2})\s+([A-Z][A-Za-z &,\-]+)$')

# Craft@Hrs: F5@.070, CL@.051, C8@1.24, S1@.133, E1@4.24, PF@9.94, U1@3.10
CRAFT_RE = re.compile(r'([A-Z][A-Z0-9]?@[\d.]+)')

# Valid units
UNITS = {
    'SF', 'LF', 'CY', 'Ea', 'LS', 'SFCA', 'MSF', 'Day', 'Hr', 'Hour',
    'Acre', 'CF', 'SY', 'MBF', 'CSF', 'CLF', 'M', 'Gal', 'Lb', 'Ton',
    'VLF', 'Bag', 'Roll', 'BF', 'MBM', 'Sq', '%', 'M$', 'CWT', 'Job',
    'MSFCA', 'KLF', 'Pr', 'Set', 'Mo', 'Wk', 'Mile', 'Sta',
}

# Number pattern
NUM_RE = re.compile(r'^-?[\d,]+\.\d+$|^-?[\d,]+$')

def parse_cost(s):
    """Parse a cost string to float. Returns None for dashes."""
    if not s:
        return None
    s = s.strip()
    if s in ('—', '-', '–', ''):
        return None
    s = s.replace(',', '')
    try:
        return float(s)
    except ValueError:
        return None

def parse_data_line(line, div_code, div_name, section_context):
    """Parse a single line that contains cost data.

    Expected format:
    Description [Craft@Hrs] Unit [Material] [Labor] [Equipment] Total

    The rightmost number is always Total.
    Working backwards: numbers before Total are Equipment, Labor, Material.
    Dashes (—) indicate zero for that column.
    """
    line = line.strip()
    if not line or len(line) < 5:
        return None

    # Must have at least one number (the Total)
    # Find all numbers and dashes from the right side
    tokens = line.split()
    if len(tokens) < 2:
        return None

    # Extract the rightmost number (Total)
    total_str = tokens[-1]
    total = parse_cost(total_str)
    if total is None:
        return None

    # Now work backwards through the tokens to find the cost columns
    # Pattern: ... Material Labor [Equipment] Total
    # or: ... — Labor — Total
    # or: ... — — — Total  (lump sum)

    # Find where the data columns start (rightmost group of numbers/dashes)
    cost_tokens = []
    desc_end_idx = len(tokens)

    for i in range(len(tokens) - 1, -1, -1):
        t = tokens[i]
        if parse_cost(t) is not None or t in ('—', '-', '–'):
            cost_tokens.insert(0, (i, t))
            desc_end_idx = i
        elif t in UNITS:
            desc_end_idx = i
            break
        elif CRAFT_RE.match(t):
            desc_end_idx = i
            break
        else:
            break

    if not cost_tokens:
        return None

    # Parse cost values
    costs = [parse_cost(ct[1]) for ct in cost_tokens]

    # Find unit and craft@hrs
    craft_hrs = ''
    unit = ''

    # Look for craft and unit between description and numbers
    for i in range(desc_end_idx, len(tokens)):
        t = tokens[i]
        if CRAFT_RE.match(t):
            craft_hrs = t
        elif t in UNITS:
            unit = t

    # Also check just before desc_end_idx
    if desc_end_idx > 0:
        for i in range(max(0, desc_end_idx - 3), desc_end_idx):
            t = tokens[i]
            if CRAFT_RE.match(t):
                craft_hrs = t
                desc_end_idx = min(desc_end_idx, i)
            elif t in UNITS and not unit:
                unit = t
                desc_end_idx = min(desc_end_idx, i)

    # Description is everything before the data columns
    description = ' '.join(tokens[:desc_end_idx]).strip()

    # Skip if description looks like a header or page number
    if not description or len(description) < 2:
        # Use section context as description
        if section_context:
            description = section_context
        else:
            return None

    # Assign costs based on count
    material = 0
    labor = 0
    equipment = 0

    if len(costs) >= 4:
        material = costs[-4] or 0
        labor = costs[-3] or 0
        equipment = costs[-2] or 0
        total = costs[-1] or 0
    elif len(costs) >= 3:
        material = costs[-3] or 0
        labor = costs[-2] or 0
        total = costs[-1] or 0
    elif len(costs) >= 2:
        # Could be Labor + Total or Material + Total
        # If we have a craft@hrs, first is probably Labor
        if craft_hrs:
            labor = costs[-2] or 0
        else:
            material = costs[-2] or 0
        total = costs[-1] or 0
    elif len(costs) == 1:
        total = costs[0] or 0

    if total == 0 and total is not None:
        # Total of 0 isn't useful
        return None

    return {
        'description': description,
        'craftHrs': craft_hrs,
        'unit': unit,
        'material': round(material, 2),
        'labor': round(labor, 2),
        'equipment': round(equipment, 2),
        'total': round(total or 0, 2),
        'division': div_code,
        'divisionName': div_name,
    }

def is_data_line(line):
    """Quick check if a line likely contains cost data (ends with a number)."""
    tokens = line.strip().split()
    if len(tokens) < 2:
        return False
    last = tokens[-1].replace(',', '')
    try:
        float(last)
        return True
    except ValueError:
        return False

def is_section_header(line):
    """Check if line is a bold section header (description context)."""
    line = line.strip()
    # Section headers are typically title-cased, don't end with numbers,
    # and aren't too long
    if not line or len(line) > 100:
        return False
    if is_data_line(line):
        return False
    if line[0].isupper() and not any(c.isdigit() for c in line[-5:]):
        return True
    return False

def is_junk_item(item):
    """Filter out items that aren't real cost data."""
    desc = item['description'].lower()

    # Skip labor rate rows (page 309 bleed)
    if re.search(r'\d{2}\.\d{2}%', desc):
        return True

    # Skip narrative
    if desc.startswith(('the ', 'these ', 'this ', 'costs in ', 'for more ', 'see page')):
        if not item['unit'] and not item['craftHrs']:
            return True

    # Skip page numbers
    if desc.isdigit():
        return True

    return False

def main():
    print(f"Opening: {PDF_PATH}")
    print(f"Parsing pages {START_PAGE}-{END_PAGE}")
    print()

    all_items = []
    current_div = '01'
    current_div_name = 'General Requirements'
    divisions_found = {}
    section_context = ''  # Last section header for context

    with pdfplumber.open(PDF_PATH) as pdf:
        print(f"Total pages: {len(pdf.pages)}")

        for page_idx in range(START_PAGE - 1, min(END_PAGE, len(pdf.pages))):
            page = pdf.pages[page_idx]
            page_num = page_idx + 1

            text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
            lines = text.split('\n')

            for line in lines:
                line = line.strip()
                if not line:
                    continue

                # Check for division header
                m = DIV_HEADER_RE.match(line)
                if m:
                    code = m.group(1)
                    name = m.group(2).strip()
                    if int(code) <= 48:
                        current_div = code
                        current_div_name = name
                        if code not in divisions_found:
                            divisions_found[code] = name
                            print(f"  Div {code}: {name} (page {page_num})")
                        section_context = ''
                    continue

                # Skip column headers
                if 'Craft@Hrs' in line and ('Material' in line or 'Unit' in line):
                    continue

                # Track section context
                if is_section_header(line) and not is_data_line(line):
                    section_context = line
                    continue

                # Parse data lines
                if is_data_line(line):
                    item = parse_data_line(line, current_div, current_div_name, section_context)
                    if item and not is_junk_item(item):
                        all_items.append(item)

            if page_num % 50 == 0:
                print(f"  ... page {page_num}, {len(all_items)} items")

    print(f"\nExtraction complete: {len(all_items)} items")

    # Summary
    div_counts = {}
    for item in all_items:
        d = item['division']
        div_counts[d] = div_counts.get(d, 0) + 1

    print(f"\nItems per division:")
    for code in sorted(div_counts.keys()):
        name = divisions_found.get(code, '?')
        print(f"  {code} {name}: {div_counts[code]}")

    # Quality stats
    has_unit = sum(1 for i in all_items if i['unit'])
    has_mat = sum(1 for i in all_items if i['material'] > 0)
    has_lab = sum(1 for i in all_items if i['labor'] > 0)
    has_equip = sum(1 for i in all_items if i['equipment'] > 0)
    has_craft = sum(1 for i in all_items if i['craftHrs'])
    n = len(all_items)
    print(f"\nData quality:")
    print(f"  With unit:       {has_unit}/{n} ({100*has_unit//n}%)")
    print(f"  With material:   {has_mat}/{n} ({100*has_mat//n}%)")
    print(f"  With labor:      {has_lab}/{n} ({100*has_lab//n}%)")
    print(f"  With equipment:  {has_equip}/{n} ({100*has_equip//n}%)")
    print(f"  With craft@hrs:  {has_craft}/{n} ({100*has_craft//n}%)")

    # Sample
    print(f"\n=== SAMPLES ===")
    seen = {}
    for item in all_items:
        d = item['division']
        if d not in seen:
            seen[d] = 0
        if seen[d] < 2:
            desc = item['description'][:60]
            print(f"  {d} | {desc:<60} | {item['unit']:<5} | M:{item['material']:>8} L:{item['labor']:>8} E:{item['equipment']:>8} T:{item['total']:>9}")
            seen[d] += 1

    # Save
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    output = {
        'source': 'Craftsman 2026 National Construction Estimator, 74th Edition',
        'year': 2026,
        'extractedAt': datetime.now().isoformat(),
        'totalItems': len(all_items),
        'divisions': divisions_found,
        'items': all_items,
    }
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)

    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"\nSaved to: {OUTPUT_PATH}")
    print(f"File size: {size_kb:.1f} KB")
    print(f"\nComparison: Current seed data has 823 items. Craftsman adds {len(all_items)} items ({len(all_items)//823}x more)")

if __name__ == '__main__':
    main()
