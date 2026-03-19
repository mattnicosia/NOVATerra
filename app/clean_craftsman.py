#!/usr/bin/env python3
"""
Clean up the extracted Craftsman data:
1. Fix PDF kerning artifacts (spaced-out characters)
2. Remove junk/narrative rows
3. Normalize descriptions
4. Output clean JSON
"""

import json
import re
import os

INPUT = os.path.join(os.path.dirname(__file__), "app", "src", "constants", "craftsmanData2026.json")
OUTPUT = INPUT  # overwrite

def fix_kerning(text):
    """Fix PDF kerning artifacts where characters get extra spaces.
    e.g., 'Breakin g and st ack ing' -> 'Breaking and stacking'

    Strategy: If a single character is surrounded by spaces and preceded by
    2+ chars that look like part of a word, join them.
    """
    if not text:
        return text

    # Step 1: Fix patterns like "word_fragment + space + 1-2_chars + space + word_fragment"
    # e.g., "Breakin g and" -> join the 'g' to 'Breakin'
    # Pattern: (letters)(space)(single lowercase letter)(space)(letters)
    # Only join if the single char looks like it belongs to the previous word

    # Fix: letter(s) + space + single lowercase letter + space -> merge left
    # "Breakin g " -> "Breaking "
    text = re.sub(r'([a-zA-Z]{2,})\s([a-z])\s', r'\1\2 ', text)

    # Fix: space + single lowercase letter + space + letter(s) -> merge right
    # " g and" was already caught above, but handle " s tone" -> "stone"
    text = re.sub(r'\s([a-z])\s([a-z]{2,})', r' \1\2', text)

    # Fix double-fragment: "st ack" -> "stack", "br ick" -> "brick"
    # Two short fragments (2-3 chars each) that together make a word
    text = re.sub(r'\b([a-z]{2,3})\s([a-z]{2,4})\b', lambda m:
        m.group(1) + m.group(2) if len(m.group(1) + m.group(2)) >= 4 else m.group(0),
        text)

    # Fix common PDF artifacts with capitals: "C L@" -> "CL@"
    text = re.sub(r'\b([A-Z])\s+([A-Z0-9])@', r'\1\2@', text)

    # Fix "ga ug e" -> "gauge", "sp ac e" -> "space" (vowel-consonant splits)
    text = re.sub(r'([a-z]{2})\s([a-z]{2})\s([a-z])\b', lambda m:
        m.group(1) + m.group(2) + m.group(3) if len(m.group(0).replace(' ', '')) <= 7 else m.group(0),
        text)

    # Collapse remaining multi-spaces
    text = re.sub(r'\s{2,}', ' ', text).strip()

    return text

def is_junk_row(item):
    """Filter out rows that aren't actual cost items."""
    desc = item.get('description', '').lower()
    total = item.get('total', 0)

    if not total or total == 0:
        return True
    if len(desc) < 3:
        return True

    # Narrative/prose indicators
    junk_phrases = [
        'expense included in these',
        'modification table on pages',
        'the figures below show',
        'the costs shown',
        'this cost is usually',
        'for more information',
        'costs in this section',
        'copyright',
        'all figures are in',
        'based on the value',
        'the hourly labor cost',
        'the industrial and commercial',
        'labor costs for the various',
    ]
    for phrase in junk_phrases:
        if phrase in desc:
            return True

    # Labor rate table rows (page 309) - have percentage patterns
    if re.search(r'\d{2}\.\d{2}%', desc):
        return True

    # Starts with narrative words AND has no unit/craft
    narrative_starts = ('the ', 'these ', 'this ', 'for more', 'see also', 'note:')
    if desc.startswith(narrative_starts):
        if item.get('unit', '') == '' and item.get('craftHrs', '') == '':
            return True

    return False

def normalize_unit(unit):
    """Normalize unit names."""
    unit_map = {
        'M$': 'M$', 'M\\$': 'M$',
        'ft': 'LF', 'FT': 'LF',
        'LB': 'Lb', 'TON': 'Ton', 'GAL': 'Gal', 'Hour': 'Hr',
    }
    return unit_map.get(unit, unit)

def main():
    # Re-parse from original extraction
    with open(INPUT) as f:
        data = json.load(f)

    items = data['items']
    print(f"Input: {len(items)} items")

    cleaned = []
    removed = 0
    for item in items:
        if is_junk_row(item):
            removed += 1
            continue

        item['description'] = fix_kerning(item['description'])

        if item.get('unit'):
            item['unit'] = normalize_unit(item['unit'])

        for field in ('material', 'labor', 'equipment', 'total'):
            if item[field] is None:
                item[field] = 0
            item[field] = round(float(item[field]), 2)

        cleaned.append(item)

    print(f"Removed: {removed} junk rows")
    print(f"Output: {len(cleaned)} clean items")

    # Division summary
    print("\nItems per division:")
    div_counts = {}
    for item in cleaned:
        d = item.get('division', '??')
        div_counts[d] = div_counts.get(d, 0) + 1
    for code in sorted(div_counts.keys()):
        name = data['divisions'].get(code, '?')
        print(f"  {code} {name}: {div_counts[code]} items")

    # Comparison with seed data
    print(f"\n=== COMPARISON ===")
    print(f"  Current seed data:  823 items across 20 divisions")
    print(f"  Craftsman 2026:     {len(cleaned)} items across {len(div_counts)} divisions")
    print(f"  Multiplier:         {len(cleaned)/823:.0f}x more items")

    # Sample cleaned descriptions
    print("\n=== SAMPLE CLEANED DESCRIPTIONS ===")
    seen = {}
    for item in cleaned:
        div = item['division']
        if div not in seen:
            seen[div] = 0
        if seen[div] < 2:
            desc = item['description'][:65]
            print(f"  Div {div} | {desc:<65} | {item['unit']:<5} | T: ${item['total']:>9,.2f}")
            seen[div] += 1

    # Save
    data['items'] = cleaned
    data['totalItems'] = len(cleaned)

    with open(OUTPUT, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"\nSaved {len(cleaned)} items to {OUTPUT}")
    print(f"File size: {os.path.getsize(OUTPUT) / 1024:.1f} KB")

if __name__ == '__main__':
    main()
