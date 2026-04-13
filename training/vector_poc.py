#!/usr/bin/env python3
"""
NOVATerra Vector-First Floor Plan Pipeline — Proof of Concept

Turns a PDF into a structured building model with ZERO AI on the wall layer.
Pure geometry extraction from PDF vector paths.

4 Functions:
1. extract_paths() — classify vector paths by line weight
2. merge_wall_segments() — merge collinear segments into wall objects
3. detect_rooms() — build planar graph, detect room polygons
4. label_rooms() — assign text labels via point-in-polygon

Success criteria:
- Wall extraction: perimeter matches known building outline
- Room detection: room count matches plan
- Area calculation: within 3% of hand-measured SF
- Runtime: under 10 seconds per sheet
"""

import fitz  # PyMuPDF
import math
import time
import json
import sys
from collections import defaultdict


# ═══════════════════════════════════════════════════════════════════
# Adaptive threshold: detect residential vs commercial line weights
# ═══════════════════════════════════════════════════════════════════

def _get_wall_threshold(paths):
    """
    Auto-detect wall line weight threshold.

    Residential drawings often use 0pt hairlines for walls.
    Commercial drawings use 0.7pt+ for walls.

    If the lightest weight dominates (>40% of line segments),
    it's a residential hairline drawing — include them as walls.
    Otherwise use the commercial 0.7pt standard.
    """
    weights = []
    for p in paths:
        w = p.get("width") or 0
        for item in p["items"]:
            if item[0] == "l":
                s, e = item[1], item[2]
                length = math.sqrt((e.x - s.x)**2 + (e.y - s.y)**2)
                if length > 15:  # only meaningful segments
                    weights.append(round(w, 2))

    if not weights:
        return 0.7

    unique_weights = sorted(set(weights))
    lightest = unique_weights[0]
    lightest_count = weights.count(lightest)
    lightest_ratio = lightest_count / len(weights)

    if lightest_ratio > 0.4 and lightest < 0.5:
        # Lightest weight dominates — residential hairline drawing
        # Use lightest as wall threshold (include hairlines)
        threshold = max(0, lightest - 0.01)  # include the lightest weight
        print(f"  Adaptive threshold: RESIDENTIAL mode ({lightest}pt = {lightest_ratio:.0%} of segments) → threshold={threshold}pt")
        return threshold
    else:
        # Multiple weights present — commercial drawing
        # Standard threshold
        print(f"  Adaptive threshold: COMMERCIAL mode (lightest={lightest}pt at {lightest_ratio:.0%}) → threshold=0.7pt")
        return 0.7


# ═══════════════════════════════════════════════════════════════════
# Page classifier: auto-detect floor plan pages
# ═══════════════════════════════════════════════════════════════════

def find_floor_plan_pages(pdf_path):
    """
    Auto-detect which pages in a PDF are floor plans (vs elevations,
    details, schedules, title sheets, takeoff overlays).

    Heuristics:
    - Floor plans have many H+V line segments (walls)
    - Floor plans have room label text (BEDROOM, KITCHEN, etc.)
    - Elevations have more diagonal lines (roof slopes)
    - Schedules/title sheets have mostly text, few lines
    - Takeoff overlays have colored fills (not in vector data)

    Returns: list of (page_num, confidence, reason) tuples
    """
    doc = fitz.open(pdf_path)
    results = []

    FLOOR_PLAN_KEYWORDS = [
        "floor plan", "first floor", "second floor", "basement",
        "ground floor", "level 1", "level 2", "main floor",
        "upper floor", "lower floor", "1st floor", "2nd floor",
    ]

    ROOM_KEYWORDS = [
        "bedroom", "bathroom", "kitchen", "living", "dining",
        "garage", "closet", "laundry", "office", "storage",
        "lobby", "corridor", "restroom", "conference",
    ]

    for page_num in range(len(doc)):
        page = doc[page_num]

        # Quick text scan
        text = page.get_text().lower()

        # Check for floor plan title
        has_floor_plan_title = any(kw in text for kw in FLOOR_PLAN_KEYWORDS)

        # Check for room labels
        room_label_count = sum(1 for kw in ROOM_KEYWORDS if kw in text)

        # Count vector paths
        paths = page.get_drawings()
        h_lines = 0
        v_lines = 0
        total_lines = 0

        for p in paths:
            for item in p["items"]:
                if item[0] == "l":
                    s, e = item[1], item[2]
                    dx = abs(e.x - s.x)
                    dy = abs(e.y - s.y)
                    length = math.sqrt(dx**2 + dy**2)
                    if length > 15:
                        total_lines += 1
                        angle = math.degrees(math.atan2(dy, dx)) % 180
                        if angle < 15 or angle > 165:
                            h_lines += 1
                        elif 75 < angle < 105:
                            v_lines += 1

        # Score
        hv_ratio = (h_lines + v_lines) / max(total_lines, 1)

        confidence = 0
        reasons = []

        if has_floor_plan_title:
            confidence += 40
            reasons.append("floor plan title")
        if room_label_count >= 2:
            confidence += 30
            reasons.append(f"{room_label_count} room labels")
        if hv_ratio > 0.6 and total_lines > 50:
            confidence += 20
            reasons.append(f"H/V ratio {hv_ratio:.0%}")
        if total_lines > 200:
            confidence += 10
            reasons.append(f"{total_lines} lines")

        if confidence >= 30:
            results.append((page_num, confidence, ", ".join(reasons)))

    doc.close()

    results.sort(key=lambda x: -x[1])
    return results


# ═══════════════════════════════════════════════════════════════════
# Function 1: Extract and classify all vector paths
# ═══════════════════════════════════════════════════════════════════

def extract_paths(pdf_path, page_num=0):
    """
    Extract all vector paths from a PDF page, classified by line weight.

    Returns dict:
        walls[]        — medium-weight lines (likely partition walls)
        heavy_walls[]  — heavy-weight lines (cut walls, exterior)
        annotations[]  — light-weight lines (dimensions, notes)
        outlines[]     — heaviest lines (building perimeter, property)
        text_blocks[]  — extracted text with positions
        page_width     — page width in points
        page_height    — page height in points
    """
    doc = fitz.open(pdf_path)
    page = doc[page_num]

    # Grab page dimensions before any operation that might invalidate the page
    page_width = page.rect.width
    page_height = page.rect.height

    paths = page.get_drawings()

    # Extract text blocks for room labeling
    text_dict = page.get_text("dict")
    text_blocks = []
    for block in text_dict["blocks"]:
        if block["type"] == 0:  # text block
            for line in block["lines"]:
                for span in line["spans"]:
                    text_blocks.append({
                        "text": span["text"].strip(),
                        "x": span["bbox"][0],
                        "y": span["bbox"][1],
                        "x2": span["bbox"][2],
                        "y2": span["bbox"][3],
                        "cx": (span["bbox"][0] + span["bbox"][2]) / 2,
                        "cy": (span["bbox"][1] + span["bbox"][3]) / 2,
                        "size": span["size"],
                    })

    # Adaptive threshold: detect residential hairline drawings
    wall_threshold = _get_wall_threshold(paths)

    # Classify line segments by weight
    segments = {
        "outlines": [],      # > 2.5pt — building perimeter, property lines
        "heavy_walls": [],   # 1.5-2.5pt — cut walls (exterior, rated)
        "walls": [],         # >= wall_threshold — partition walls, interior
        "annotations": [],   # < wall_threshold — dimensions, notes, hatching
    }

    for p in paths:
        weight = p.get("width") or 0
        color = p.get("color")  # RGB tuple or None
        fill = p.get("fill")    # fill color or None

        for item in p["items"]:
            kind = item[0]

            if kind == "l":  # line segment
                start, end = item[1], item[2]
                seg = {
                    "x1": start.x, "y1": start.y,
                    "x2": end.x, "y2": end.y,
                    "weight": weight,
                    "length": math.sqrt((end.x - start.x)**2 + (end.y - start.y)**2),
                    "color": color,
                }

                if weight > 2.5:
                    segments["outlines"].append(seg)
                elif weight >= 1.5:
                    segments["heavy_walls"].append(seg)
                elif weight >= wall_threshold:
                    segments["walls"].append(seg)
                else:
                    segments["annotations"].append(seg)

            elif kind == "re":  # rectangle
                rect = item[1]
                # Large filled rectangles might be wall fills
                w = abs(rect.x1 - rect.x0)
                h = abs(rect.y1 - rect.y0)
                if weight >= 0.7 or (fill and min(w, h) > 2 and max(w, h) > 20):
                    seg = {
                        "x1": rect.x0, "y1": rect.y0,
                        "x2": rect.x1, "y2": rect.y1,
                        "weight": weight,
                        "length": max(w, h),
                        "is_rect": True,
                        "width": w,
                        "height": h,
                        "color": color,
                        "fill": fill,
                    }
                    if weight >= 1.5:
                        segments["heavy_walls"].append(seg)
                    else:
                        segments["walls"].append(seg)

    doc.close()

    result = {
        **segments,
        "text_blocks": text_blocks,
        "page_width": page_width,
        "page_height": page_height,
    }

    # Stats
    total = sum(len(v) for k, v in segments.items())
    print(f"  Extracted {total} line segments:")
    for k, v in segments.items():
        print(f"    {k}: {len(v)}")
    print(f"  Text blocks: {len(text_blocks)}")

    return result


# ═══════════════════════════════════════════════════════════════════
# Function 2: Merge broken collinear segments into wall objects
# ═══════════════════════════════════════════════════════════════════

def merge_wall_segments(raw_segments, scale_px_per_ft=1.0, angle_tolerance=2.0, gap_tolerance=12):
    """
    Merge broken collinear segments into continuous wall objects.

    Pre-filters:
    - Reject segments shorter than 6 inches at drawing scale
    - Reject segments not roughly H or V (±15° from 0/90/180/270)
    - Reject closed paths (symbols, not walls)

    Args:
        raw_segments: list of {x1, y1, x2, y2, weight, length} dicts
        scale_px_per_ft: pixels per foot for length filtering
        angle_tolerance: degrees tolerance for collinear merge
        gap_tolerance: max pixel gap between segments to merge

    Returns: list of wall objects
        [{start: (x,y), end: (x,y), weight, length_px, length_ft, angle, merged_count}]
    """
    min_length_px = 0.5 * scale_px_per_ft  # 6 inches minimum
    if min_length_px < 8:
        min_length_px = 8  # absolute minimum 8px

    # Pre-filter
    candidates = []
    rejected = {"short": 0, "diagonal": 0, "closed": 0}

    for seg in raw_segments:
        if seg.get("is_rect"):
            # Rectangles: decompose into 4 line segments if wall-like
            # Wall-like = one dimension much larger than the other
            w, h = seg.get("width", 0), seg.get("height", 0)
            if w < 3 or h < 3:
                continue  # too thin to be a wall fill

            aspect = max(w, h) / (min(w, h) + 0.01)
            if aspect > 3:  # elongated rectangle = likely wall fill
                if w > h:
                    # horizontal wall
                    cy = (seg["y1"] + seg["y2"]) / 2
                    candidates.append({
                        "x1": seg["x1"], "y1": cy,
                        "x2": seg["x2"], "y2": cy,
                        "weight": seg["weight"],
                        "length": w,
                        "thickness": h,
                    })
                else:
                    # vertical wall
                    cx = (seg["x1"] + seg["x2"]) / 2
                    candidates.append({
                        "x1": cx, "y1": seg["y1"],
                        "x2": cx, "y2": seg["y2"],
                        "weight": seg["weight"],
                        "length": h,
                        "thickness": w,
                    })
            continue

        # Length filter
        if seg["length"] < min_length_px:
            rejected["short"] += 1
            continue

        # Angle filter — only roughly H or V (within 15° of axis)
        dx = seg["x2"] - seg["x1"]
        dy = seg["y2"] - seg["y1"]
        angle = math.degrees(math.atan2(dy, dx)) % 180  # normalize to 0-180

        is_horizontal = angle < 15 or angle > 165
        is_vertical = 75 < angle < 105

        if not (is_horizontal or is_vertical):
            rejected["diagonal"] += 1
            continue

        candidates.append({
            **seg,
            "angle": angle,
            "is_horizontal": is_horizontal,
        })

    print(f"  Pre-filter: {len(candidates)} candidates from {len(raw_segments)} segments")
    print(f"    Rejected: {rejected['short']} short, {rejected['diagonal']} diagonal")

    # Group by orientation and approximate position (for merging)
    h_groups = defaultdict(list)  # keyed by rounded y-coordinate
    v_groups = defaultdict(list)  # keyed by rounded x-coordinate

    merge_band = gap_tolerance  # pixels

    for seg in candidates:
        if seg.get("is_horizontal", False) or (hasattr(seg, 'angle') and (seg.get("angle", 45) < 15 or seg.get("angle", 45) > 165)):
            # Horizontal: group by y position
            y_key = round(((seg["y1"] + seg["y2"]) / 2) / merge_band) * merge_band
            h_groups[y_key].append(seg)
        else:
            # Vertical: group by x position
            x_key = round(((seg["x1"] + seg["x2"]) / 2) / merge_band) * merge_band
            v_groups[x_key].append(seg)

    # Merge collinear segments within each group
    merged_walls = []

    def merge_group(segs, is_horizontal):
        """Merge overlapping/adjacent collinear segments."""
        if not segs:
            return []

        walls = []

        if is_horizontal:
            # Sort by x-start
            segs.sort(key=lambda s: min(s["x1"], s["x2"]))

            current = {
                "x_min": min(segs[0]["x1"], segs[0]["x2"]),
                "x_max": max(segs[0]["x1"], segs[0]["x2"]),
                "y": (segs[0]["y1"] + segs[0]["y2"]) / 2,
                "weight": segs[0]["weight"],
                "count": 1,
            }

            for seg in segs[1:]:
                seg_min = min(seg["x1"], seg["x2"])
                seg_max = max(seg["x1"], seg["x2"])

                if seg_min <= current["x_max"] + gap_tolerance:
                    # Merge
                    current["x_max"] = max(current["x_max"], seg_max)
                    current["weight"] = max(current["weight"], seg["weight"])
                    current["count"] += 1
                else:
                    # Emit current, start new
                    walls.append(current)
                    current = {
                        "x_min": seg_min,
                        "x_max": seg_max,
                        "y": (seg["y1"] + seg["y2"]) / 2,
                        "weight": seg["weight"],
                        "count": 1,
                    }
            walls.append(current)

            # Convert to wall objects
            result = []
            for w in walls:
                length_px = w["x_max"] - w["x_min"]
                if length_px < min_length_px:
                    continue
                result.append({
                    "start": (w["x_min"], w["y"]),
                    "end": (w["x_max"], w["y"]),
                    "weight": w["weight"],
                    "length_px": length_px,
                    "length_ft": length_px / scale_px_per_ft if scale_px_per_ft > 0 else 0,
                    "orientation": "horizontal",
                    "merged_count": w["count"],
                })
            return result
        else:
            # Vertical — sort by y-start
            segs.sort(key=lambda s: min(s["y1"], s["y2"]))

            current = {
                "y_min": min(segs[0]["y1"], segs[0]["y2"]),
                "y_max": max(segs[0]["y1"], segs[0]["y2"]),
                "x": (segs[0]["x1"] + segs[0]["x2"]) / 2,
                "weight": segs[0]["weight"],
                "count": 1,
            }

            for seg in segs[1:]:
                seg_min = min(seg["y1"], seg["y2"])
                seg_max = max(seg["y1"], seg["y2"])

                if seg_min <= current["y_max"] + gap_tolerance:
                    current["y_max"] = max(current["y_max"], seg_max)
                    current["weight"] = max(current["weight"], seg["weight"])
                    current["count"] += 1
                else:
                    walls.append(current)
                    current = {
                        "y_min": seg_min,
                        "y_max": seg_max,
                        "x": (seg["x1"] + seg["x2"]) / 2,
                        "weight": seg["weight"],
                        "count": 1,
                    }
            walls.append(current)

            result = []
            for w in walls:
                length_px = w["y_max"] - w["y_min"]
                if length_px < min_length_px:
                    continue
                result.append({
                    "start": (w["x"], w["y_min"]),
                    "end": (w["x"], w["y_max"]),
                    "weight": w["weight"],
                    "length_px": length_px,
                    "length_ft": length_px / scale_px_per_ft if scale_px_per_ft > 0 else 0,
                    "orientation": "vertical",
                    "merged_count": w["count"],
                })
            return result

    for y_key, segs in h_groups.items():
        merged_walls.extend(merge_group(segs, is_horizontal=True))

    for x_key, segs in v_groups.items():
        merged_walls.extend(merge_group(segs, is_horizontal=False))

    # Sort by length descending
    merged_walls.sort(key=lambda w: -w["length_px"])

    print(f"  Merged: {len(merged_walls)} wall segments")

    return merged_walls


# ═══════════════════════════════════════════════════════════════════
# Function 3: Build planar graph + detect room polygons
# ═══════════════════════════════════════════════════════════════════

def detect_rooms(merged_walls, scale_px_per_ft, min_room_area_sf=20):
    """
    Detect enclosed rooms using rasterized flood fill.

    Algorithm (from Pascal Editor space-detection.ts):
    1. Rasterize walls onto a grid (0.5ft resolution)
    2. Flood fill from edges (exterior)
    3. Remaining unfilled cells = interior spaces
    4. Cluster adjacent interior cells into rooms
    5. Extract bounding polygon for each room

    Returns: list of room objects
        [{polygon: [(x,y)...], area_sf, perimeter_ft, centroid: (x,y), grid_cells: int}]
    """
    if not merged_walls:
        return []

    # Determine bounds
    all_x = []
    all_y = []
    for w in merged_walls:
        all_x.extend([w["start"][0], w["end"][0]])
        all_y.extend([w["start"][1], w["end"][1]])

    min_x, max_x = min(all_x) - 20, max(all_x) + 20
    min_y, max_y = min(all_y) - 20, max(all_y) + 20

    # Grid resolution: 1 cell = ~0.5ft (or 6px minimum)
    cell_size = max(6, 0.5 * scale_px_per_ft)

    grid_w = int((max_x - min_x) / cell_size) + 1
    grid_h = int((max_y - min_y) / cell_size) + 1

    if grid_w > 2000 or grid_h > 2000:
        cell_size *= 2  # coarser grid for large drawings
        grid_w = int((max_x - min_x) / cell_size) + 1
        grid_h = int((max_y - min_y) / cell_size) + 1

    print(f"  Room detection grid: {grid_w}x{grid_h} cells (cell_size={cell_size:.1f}px)")

    # Rasterize walls onto grid
    # 0 = empty, 1 = wall
    grid = [[0] * grid_w for _ in range(grid_h)]

    wall_thickness = max(2, int(cell_size * 0.8))  # wall occupies most of a cell

    for w in merged_walls:
        x1, y1 = w["start"]
        x2, y2 = w["end"]

        # Bresenham-style rasterization with thickness
        if w["orientation"] == "horizontal":
            gy = int((y1 - min_y) / cell_size)
            gx1 = int((min(x1, x2) - min_x) / cell_size)
            gx2 = int((max(x1, x2) - min_x) / cell_size)
            for gx in range(max(0, gx1), min(grid_w, gx2 + 1)):
                for dy in range(-1, 2):  # thickness of 3 cells
                    gy2 = gy + dy
                    if 0 <= gy2 < grid_h:
                        grid[gy2][gx] = 1
        else:
            gx = int((x1 - min_x) / cell_size)
            gy1 = int((min(y1, y2) - min_y) / cell_size)
            gy2 = int((max(y1, y2) - min_y) / cell_size)
            for gy in range(max(0, gy1), min(grid_h, gy2 + 1)):
                for dx in range(-1, 2):  # thickness of 3 cells
                    gx2 = gx + dx
                    if 0 <= gx2 < grid_w:
                        grid[gy][gx2] = 1

    # Flood fill from edges to mark exterior
    # 2 = exterior (filled from edges)
    from collections import deque
    queue = deque()

    # Seed from all edge cells that aren't walls
    for gx in range(grid_w):
        if grid[0][gx] == 0:
            grid[0][gx] = 2
            queue.append((0, gx))
        if grid[grid_h-1][gx] == 0:
            grid[grid_h-1][gx] = 2
            queue.append((grid_h-1, gx))

    for gy in range(grid_h):
        if grid[gy][0] == 0:
            grid[gy][0] = 2
            queue.append((gy, 0))
        if grid[gy][grid_w-1] == 0:
            grid[gy][grid_w-1] = 2
            queue.append((gy, grid_w-1))

    # BFS flood fill exterior
    while queue:
        gy, gx = queue.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = gy + dy, gx + dx
            if 0 <= ny < grid_h and 0 <= nx < grid_w and grid[ny][nx] == 0:
                grid[ny][nx] = 2
                queue.append((ny, nx))

    # Remaining 0-cells are interior spaces
    # Cluster adjacent interior cells into rooms
    room_id = 3  # start room IDs at 3
    rooms = []

    for gy in range(grid_h):
        for gx in range(grid_w):
            if grid[gy][gx] == 0:
                # BFS to find connected interior region
                cells = []
                queue = deque([(gy, gx)])
                grid[gy][gx] = room_id

                while queue:
                    cy, cx = queue.popleft()
                    cells.append((cx, cy))
                    for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < grid_h and 0 <= nx < grid_w and grid[ny][nx] == 0:
                            grid[ny][nx] = room_id
                            queue.append((ny, nx))

                # Convert to area
                area_cells = len(cells)
                area_px = area_cells * cell_size * cell_size
                area_sf = area_px / (scale_px_per_ft ** 2) if scale_px_per_ft > 0 else 0

                if area_sf >= min_room_area_sf:
                    # Compute bounding box
                    xs = [c[0] for c in cells]
                    ys = [c[1] for c in cells]
                    bbox_min_x = min(xs) * cell_size + min_x
                    bbox_max_x = (max(xs) + 1) * cell_size + min_x
                    bbox_min_y = min(ys) * cell_size + min_y
                    bbox_max_y = (max(ys) + 1) * cell_size + min_y

                    centroid_x = sum(xs) / len(xs) * cell_size + min_x
                    centroid_y = sum(ys) / len(ys) * cell_size + min_y

                    # Approximate perimeter (count cells on boundary)
                    boundary_cells = 0
                    for cx, cy in cells:
                        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            ny, nx = cy + dy, cx + dx
                            if not (0 <= ny < grid_h and 0 <= nx < grid_w) or grid[ny][nx] == 1:
                                boundary_cells += 1
                                break

                    perimeter_ft = boundary_cells * cell_size / scale_px_per_ft if scale_px_per_ft > 0 else 0

                    rooms.append({
                        "id": room_id,
                        "polygon": [
                            (bbox_min_x, bbox_min_y),
                            (bbox_max_x, bbox_min_y),
                            (bbox_max_x, bbox_max_y),
                            (bbox_min_x, bbox_max_y),
                        ],
                        "area_sf": round(area_sf, 1),
                        "perimeter_ft": round(perimeter_ft, 1),
                        "centroid": (round(centroid_x, 1), round(centroid_y, 1)),
                        "grid_cells": area_cells,
                        "bbox": (bbox_min_x, bbox_min_y, bbox_max_x, bbox_max_y),
                    })

                room_id += 1

    print(f"  Detected {len(rooms)} rooms (min {min_room_area_sf} SF)")

    return rooms


# ═══════════════════════════════════════════════════════════════════
# Function 4: Assign text labels to rooms via point-in-polygon
# ═══════════════════════════════════════════════════════════════════

def label_rooms(rooms, text_blocks):
    """
    Assign extracted text labels to detected rooms.
    Uses point-in-polygon (bbox containment) to match text to rooms.

    Returns: rooms with labels assigned
    """
    # Simple bbox containment check
    def point_in_bbox(px, py, bbox):
        return bbox[0] <= px <= bbox[2] and bbox[1] <= py <= bbox[3]

    # Room name keywords (filter out dimension text, notes, etc.)
    ROOM_KEYWORDS = [
        "bedroom", "bath", "kitchen", "living", "dining", "garage",
        "closet", "laundry", "entry", "foyer", "hall", "corridor",
        "office", "storage", "mechanical", "utility", "pantry",
        "mudroom", "porch", "deck", "balcony", "vestibule",
        "lobby", "conference", "break", "restroom", "janitor",
        "stair", "elevator", "shaft", "electrical", "telecom",
        "retail", "tenant", "open", "reception", "waiting",
        "exam", "lab", "nurse", "doctor", "patient",
        "classroom", "library", "gym", "cafeteria", "auditorium",
        "basement", "crawl", "attic", "mezzanine",
        "bed", "br", "kit", "lr", "dr", "gar",
    ]

    labeled_count = 0

    for room in rooms:
        bbox = room["bbox"]
        room_texts = []

        for tb in text_blocks:
            if point_in_bbox(tb["cx"], tb["cy"], bbox):
                text = tb["text"].strip()
                if len(text) > 1 and not text.replace(".", "").replace("-", "").replace("'", "").replace('"', '').isdigit():
                    room_texts.append(text)

        # Find the most likely room name
        room["label"] = None
        room["all_text"] = room_texts

        for text in room_texts:
            text_lower = text.lower()
            for kw in ROOM_KEYWORDS:
                if kw in text_lower:
                    room["label"] = text
                    labeled_count += 1
                    break
            if room["label"]:
                break

        # If no keyword match, use the largest text block in the room
        if not room["label"] and room_texts:
            room["label"] = max(room_texts, key=len)
            labeled_count += 1

    print(f"  Labeled {labeled_count}/{len(rooms)} rooms")

    return rooms


# ═══════════════════════════════════════════════════════════════════
# Main POC Runner
# ═══════════════════════════════════════════════════════════════════

def run_poc(pdf_path, page_num=0, scale_px_per_ft=None):
    """Run the complete vector-first pipeline on a single sheet."""

    print(f"\n{'='*70}")
    print(f"NOVATerra Vector-First Pipeline — Proof of Concept")
    print(f"{'='*70}")
    print(f"PDF: {pdf_path}")
    print(f"Page: {page_num + 1}")
    print()

    t_start = time.time()

    # Step 1: Extract paths
    print("[1/4] Extracting vector paths...")
    data = extract_paths(pdf_path, page_num)
    t1 = time.time()
    print(f"  Time: {t1 - t_start:.2f}s")

    # Auto-detect scale if not provided
    if scale_px_per_ft is None:
        # Try to find scale from text blocks
        for tb in data["text_blocks"]:
            text = tb["text"].lower().strip()
            if "= 1'-0" in text or "= 1'" in text:
                # Found scale annotation
                # Common: 1/4" = 1'-0" means 1 foot = (72 * page_scale * 0.25) pixels
                # At 72 DPI, 1/4" = 18pt = 18px
                if "1/4" in text:
                    scale_px_per_ft = 18  # 1/4" = 1'-0" at 72 DPI
                elif "1/8" in text:
                    scale_px_per_ft = 9
                elif "1/2" in text:
                    scale_px_per_ft = 36
                elif "3/8" in text:
                    scale_px_per_ft = 27
                print(f"  Auto-detected scale: {text} → {scale_px_per_ft} px/ft")
                break

        if scale_px_per_ft is None:
            # Fallback: estimate from page size
            # Typical 24x36 arch sheet at 72 DPI = 1728x2592 pixels
            # At 1/4" scale, that's ~96x144 feet
            page_w = data["page_width"]
            scale_px_per_ft = page_w / 120  # rough estimate assuming ~120ft wide view
            print(f"  No scale found — estimated {scale_px_per_ft:.1f} px/ft from page width")

    # Step 2: Merge wall segments
    print(f"\n[2/4] Merging wall segments...")
    # Combine walls + heavy_walls for merging
    all_wall_segments = data["walls"] + data["heavy_walls"] + data["outlines"]
    merged = merge_wall_segments(all_wall_segments, scale_px_per_ft=scale_px_per_ft)
    t2 = time.time()
    print(f"  Time: {t2 - t1:.2f}s")

    # Step 3: Detect rooms
    print(f"\n[3/4] Detecting rooms...")
    rooms = detect_rooms(merged, scale_px_per_ft=scale_px_per_ft)
    t3 = time.time()
    print(f"  Time: {t3 - t2:.2f}s")

    # Step 4: Label rooms
    print(f"\n[4/4] Labeling rooms...")
    rooms = label_rooms(rooms, data["text_blocks"])
    t4 = time.time()
    print(f"  Time: {t4 - t3:.2f}s")

    total_time = t4 - t_start

    # ── Results ──
    print(f"\n{'='*70}")
    print(f"RESULTS")
    print(f"{'='*70}")
    print(f"Total runtime: {total_time:.2f}s {'✅ PASS' if total_time < 10 else '❌ FAIL (>10s)'}")
    print(f"Scale: {scale_px_per_ft:.1f} px/ft")
    print()

    print(f"WALLS: {len(merged)} segments")
    total_wall_ft = sum(w["length_ft"] for w in merged)
    print(f"  Total wall length: {total_wall_ft:.1f} LF")

    h_walls = [w for w in merged if w["orientation"] == "horizontal"]
    v_walls = [w for w in merged if w["orientation"] == "vertical"]
    print(f"  Horizontal: {len(h_walls)} ({sum(w['length_ft'] for w in h_walls):.1f} LF)")
    print(f"  Vertical: {len(v_walls)} ({sum(w['length_ft'] for w in v_walls):.1f} LF)")

    # Top 10 longest walls
    print(f"\n  Top 10 walls by length:")
    for i, w in enumerate(merged[:10]):
        print(f"    {i+1}. {w['length_ft']:.1f} ft {w['orientation']} (weight={w['weight']:.1f}pt, merged={w['merged_count']})")

    print(f"\nROOMS: {len(rooms)}")
    total_sf = sum(r["area_sf"] for r in rooms)
    print(f"  Total area: {total_sf:.1f} SF")

    for i, r in enumerate(rooms):
        label = r["label"] or "(unlabeled)"
        print(f"    {i+1}. {label}: {r['area_sf']:.1f} SF")

    # Save JSON output
    output = {
        "pdf": pdf_path,
        "page": page_num,
        "scale_px_per_ft": scale_px_per_ft,
        "runtime_seconds": round(total_time, 2),
        "walls": [{
            "start": list(w["start"]),
            "end": list(w["end"]),
            "weight": w["weight"],
            "length_ft": round(w["length_ft"], 1),
            "orientation": w["orientation"],
            "merged_count": w["merged_count"],
        } for w in merged],
        "rooms": [{
            "label": r["label"],
            "area_sf": r["area_sf"],
            "perimeter_ft": r["perimeter_ft"],
            "centroid": list(r["centroid"]),
            "polygon": [list(p) for p in r["polygon"]],
        } for r in rooms],
        "summary": {
            "wall_count": len(merged),
            "total_wall_length_ft": round(total_wall_ft, 1),
            "room_count": len(rooms),
            "total_area_sf": round(total_sf, 1),
        }
    }

    output_path = pdf_path.rsplit(".", 1)[0] + f"_page{page_num+1}_vectorpoc.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nOutput saved: {output_path}")

    return output


# ═══════════════════════════════════════════════════════════════════
# Sheet Segmentation — identify regions before detection
# ═══════════════════════════════════════════════════════════════════

import re as _re

# Scale notation patterns
_SCALE_PATTERNS = [
    _re.compile(r'(\d+/\d+)"\s*=\s*1\'', _re.IGNORECASE),          # 1/4" = 1'-0"
    _re.compile(r'SCALE:\s*(\d+/\d+"?\s*=\s*[\d\'-]+)', _re.IGNORECASE),  # SCALE: 1/4" = 1'-0"
    _re.compile(r'(\d+)\s*:\s*(\d+)', _re.IGNORECASE),              # 1:50
    _re.compile(r'NTS|NOT\s+TO\s+SCALE', _re.IGNORECASE),           # NTS
]

# Viewport title keywords
_VP_TYPE_MAP = {
    "plan": ["plan", "floor", "level", "basement", "ground", "mezzanine", "penthouse", "lower"],
    "rcp": ["reflected ceiling", "rcp", "ceiling plan"],
    "elevation": ["elevation", "elev", "exterior"],
    "section": ["section", "sect", "cross section", "longitudinal"],
    "detail": ["detail", "dtl", "enlarged", "blow-up"],
    "schedule": ["schedule", "sched"],
}


def _rect_overlap_pct(r1, r2):
    """Fraction of r1 overlapping with r2."""
    x0 = max(r1[0], r2[0])
    y0 = max(r1[1], r2[1])
    x1 = min(r1[2], r2[2])
    y1 = min(r1[3], r2[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    inter = (x1 - x0) * (y1 - y0)
    area1 = (r1[2] - r1[0]) * (r1[3] - r1[1])
    return inter / max(area1, 1)


def _rect_contains(outer, inner):
    """Does outer fully contain inner?"""
    return (outer[0] <= inner[0] and outer[1] <= inner[1] and
            outer[2] >= inner[2] and outer[3] >= inner[3])


def _classify_viewport(title):
    """Classify viewport type from title text."""
    if not title:
        return "unknown"
    lower = title.lower()
    for vp_type, keywords in _VP_TYPE_MAP.items():
        if any(kw in lower for kw in keywords):
            return vp_type
    return "unknown"


def _find_scale_in_text(text):
    """Extract scale notation from text."""
    for pat in _SCALE_PATTERNS:
        m = pat.search(text)
        if m:
            return m.group(0)
    return None


def segment_sheet(pdf_path_or_bytes, page_num=0):
    """
    Segment a construction drawing sheet into semantic regions.

    Returns:
      {
        "page_width": float, "page_height": float,
        "has_layers": bool,
        "layers": [str],
        "sheet_label": str,
        "sheet_type": str,
        "regions": {
          "sheet_border": {"rect": [x1,y1,x2,y2]},
          "title_block": {"rect": [...], "fields": {}},
          "viewports": [{"rect": [...], "title": str, "scale": str, "type": str}],
          "notes": [{"rect": [...], "type": str}],
          "legends": [{"rect": [...]}],
          "schedules": [{"rect": [...]}],
        }
      }
    """
    if isinstance(pdf_path_or_bytes, bytes):
        doc = fitz.open(stream=pdf_path_or_bytes, filetype="pdf")
    else:
        doc = fitz.open(str(pdf_path_or_bytes))

    if page_num >= len(doc):
        doc.close()
        return {"error": f"Page {page_num} out of range (doc has {len(doc)} pages)"}

    page = doc[page_num]
    pw, ph = page.rect.width, page.rect.height
    page_area = pw * ph

    # ── Tier 1: Check OCG layers ──
    ocgs = doc.get_ocgs()
    layer_names = [info.get("name", "") for info in ocgs.values()] if ocgs else []
    has_layers = len(layer_names) > 0

    # ── Sheet label from page label ──
    sheet_label = ""
    try:
        sheet_label = page.get_label() or ""
    except Exception:
        pass

    # Classify sheet type from label prefix
    sheet_type = "unknown"
    label_upper = sheet_label.upper().strip()
    if label_upper:
        prefix = label_upper.split("-")[0].strip() if "-" in label_upper else label_upper[0]
        type_map = {"A": "architectural", "S": "structural", "M": "mechanical",
                     "E": "electrical", "P": "plumbing", "C": "civil",
                     "L": "landscape", "G": "general", "I": "interior"}
        sheet_type = type_map.get(prefix, "unknown")

    # ── Extract all vector paths ──
    drawings = page.get_drawings()

    # ── Extract text blocks ──
    text_dict = page.get_text("dict")
    text_blocks = []
    for block in text_dict.get("blocks", []):
        if block.get("type") != 0:  # text blocks only
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "").strip()
                if not text:
                    continue
                bbox = span.get("bbox", [0, 0, 0, 0])
                text_blocks.append({
                    "text": text,
                    "x": bbox[0], "y": bbox[1],
                    "x2": bbox[2], "y2": bbox[3],
                    "cx": (bbox[0] + bbox[2]) / 2,
                    "cy": (bbox[1] + bbox[3]) / 2,
                    "size": span.get("size", 0),
                    "font": span.get("font", ""),
                    "flags": span.get("flags", 0),
                })

    # ── Tier 2: Find rectangles from vector geometry ──
    rectangles = []
    for p in drawings:
        w = p.get("width") or 0
        if w < 0.1:
            continue

        for item in p["items"]:
            # Native rectangle
            if item[0] == "re":
                rect = item[1]
                rw = abs(rect.x1 - rect.x0)
                rh = abs(rect.y1 - rect.y0)
                if rw < 20 or rh < 20:
                    continue
                area = rw * rh
                rectangles.append({
                    "rect": [rect.x0, rect.y0, rect.x1, rect.y1],
                    "width": rw, "height": rh,
                    "area": area, "area_pct": area / page_area,
                    "line_weight": w,
                })

        # Also check if the path itself forms a large rectangle (4 lines, closed)
        if p.get("closePath") and len(p["items"]) == 4:
            all_lines = all(item[0] == "l" for item in p["items"])
            if all_lines:
                r = p["rect"]
                rw = abs(r.x1 - r.x0)
                rh = abs(r.y1 - r.y0)
                if rw > 50 and rh > 50:
                    area = rw * rh
                    rectangles.append({
                        "rect": [r.x0, r.y0, r.x1, r.y1],
                        "width": rw, "height": rh,
                        "area": area, "area_pct": area / page_area,
                        "line_weight": w,
                    })

    # ── Find sheet border ──
    sheet_border = None
    for r in sorted(rectangles, key=lambda r: -r["area"]):
        if r["area_pct"] > 0.85 and r["line_weight"] >= 0.8:
            sheet_border = {"rect": r["rect"]}
            break
    if not sheet_border:
        sheet_border = {"rect": [0, 0, pw, ph]}

    # ── Find title block ──
    title_block = None
    tb_candidates = [r for r in rectangles
                     if r["rect"][2] > pw * 0.55
                     and r["rect"][3] > ph * 0.55
                     and r["line_weight"] >= 0.6
                     and 0.005 < r["area_pct"] < 0.25]

    if tb_candidates:
        # Union all overlapping candidates in the bottom-right
        min_x = min(c["rect"][0] for c in tb_candidates)
        min_y = min(c["rect"][1] for c in tb_candidates)
        max_x = max(c["rect"][2] for c in tb_candidates)
        max_y = max(c["rect"][3] for c in tb_candidates)
        tb_rect = [min_x, min_y, max_x, max_y]

        # Extract text fields within title block
        tb_fields = {}
        for t in text_blocks:
            if min_x <= t["cx"] <= max_x and min_y <= t["cy"] <= max_y:
                text_lower = t["text"].lower()
                if not tb_fields.get("project") and t["size"] >= 10:
                    tb_fields["project"] = t["text"]
                scale = _find_scale_in_text(t["text"])
                if scale and not tb_fields.get("scale"):
                    tb_fields["scale"] = scale
                if not tb_fields.get("sheet_number") and _re.match(r'^[A-Z]-?\d', t["text"]):
                    tb_fields["sheet_number"] = t["text"]
                    if not sheet_label:
                        sheet_label = t["text"]

        title_block = {"rect": tb_rect, "fields": tb_fields}

    # ── Find viewports ──
    tb_rect_for_overlap = title_block["rect"] if title_block else [pw, ph, pw, ph]
    sb_rect = sheet_border["rect"]

    vp_candidates = []
    for r in rectangles:
        if r["area_pct"] < 0.03 or r["area_pct"] > 0.85:
            continue
        if r["line_weight"] < 0.3:
            continue
        # Skip if overlaps >60% with title block
        if _rect_overlap_pct(r["rect"], tb_rect_for_overlap) > 0.6:
            continue
        # Skip if it IS the sheet border
        if r["area_pct"] > 0.83:
            continue
        vp_candidates.append(r)

    # Remove candidates that fully contain others (keep inner viewports)
    vp_candidates.sort(key=lambda r: r["area"])
    viewports_raw = []
    for c in vp_candidates:
        # Check if this candidate is already contained by a smaller accepted viewport
        contained = any(_rect_contains(v["rect"], c["rect"]) for v in viewports_raw)
        if contained:
            continue
        # Check if this candidate contains an already-accepted viewport (it's a grouping border)
        contains_existing = any(_rect_contains(c["rect"], v["rect"]) for v in viewports_raw)
        if contains_existing and c["area_pct"] > 0.4:
            continue  # skip large grouping borders
        viewports_raw.append(c)

    # For each viewport, find title + scale from nearby text
    viewports = []
    for vp in viewports_raw:
        vr = vp["rect"]
        vp_title = ""
        vp_scale = ""

        # Search for title: text just below viewport bottom or above viewport top
        for t in text_blocks:
            # Below bottom edge (within 30pt)
            if (vr[0] - 10 <= t["cx"] <= vr[2] + 10 and
                    vr[3] <= t["cy"] <= vr[3] + 40 and
                    t["size"] >= 8):
                if len(t["text"]) > len(vp_title) and t["text"].replace(" ", "").isalpha() is False:
                    vp_title = t["text"]
            # Above top edge
            if (vr[0] - 10 <= t["cx"] <= vr[2] + 10 and
                    vr[1] - 40 <= t["cy"] <= vr[1] and
                    t["size"] >= 8):
                if len(t["text"]) > len(vp_title):
                    vp_title = t["text"]

        # Search for scale near viewport
        for t in text_blocks:
            if (vr[0] - 20 <= t["cx"] <= vr[2] + 20 and
                    vr[1] - 50 <= t["cy"] <= vr[3] + 50):
                s = _find_scale_in_text(t["text"])
                if s:
                    vp_scale = s
                    break

        vp_type = _classify_viewport(vp_title)

        viewports.append({
            "rect": [round(v, 1) for v in vr],
            "title": vp_title.strip(),
            "scale": vp_scale,
            "type": vp_type,
            "area_pct": round(vp["area_pct"] * 100, 1),
        })

    # ── Find notes, legends, schedules from orphan text clusters ──
    excluded_rects = [v["rect"] for v in viewports]
    if title_block:
        excluded_rects.append(title_block["rect"])

    def _point_in_any_rect(cx, cy, rects):
        for r in rects:
            if r[0] <= cx <= r[2] and r[1] <= cy <= r[3]:
                return True
        return False

    orphan_texts = [t for t in text_blocks
                    if not _point_in_any_rect(t["cx"], t["cy"], excluded_rects)]

    # Simple spatial clustering of orphan texts
    notes_regions = []
    if orphan_texts:
        # Cluster by proximity (within 40pt gap)
        used = set()
        for i, t in enumerate(orphan_texts):
            if i in used:
                continue
            cluster = [t]
            used.add(i)
            for j, t2 in enumerate(orphan_texts):
                if j in used:
                    continue
                for ct in cluster:
                    if (abs(t2["cx"] - ct["cx"]) < 200 and abs(t2["cy"] - ct["cy"]) < 40):
                        cluster.append(t2)
                        used.add(j)
                        break

            if len(cluster) >= 2:
                cx_min = min(t["x"] for t in cluster) - 5
                cy_min = min(t["y"] for t in cluster) - 5
                cx_max = max(t["x2"] for t in cluster) + 5
                cy_max = max(t["y2"] for t in cluster) + 5
                combined_text = " ".join(t["text"] for t in cluster).lower()

                region_type = "notes"
                if "schedule" in combined_text or "sched" in combined_text:
                    region_type = "schedule"
                elif "legend" in combined_text or "symbol" in combined_text:
                    region_type = "legend"
                elif "key" in combined_text and "note" in combined_text:
                    region_type = "keynotes"
                elif "general" in combined_text and "note" in combined_text:
                    region_type = "general_notes"

                notes_regions.append({
                    "rect": [round(cx_min, 1), round(cy_min, 1), round(cx_max, 1), round(cy_max, 1)],
                    "type": region_type,
                })

    doc.close()

    return {
        "page_width": round(pw, 1),
        "page_height": round(ph, 1),
        "has_layers": has_layers,
        "layers": layer_names[:20],  # cap at 20 layers
        "sheet_label": sheet_label,
        "sheet_type": sheet_type,
        "regions": {
            "sheet_border": sheet_border,
            "title_block": title_block,
            "viewports": viewports,
            "notes": [n for n in notes_regions if n["type"] in ("notes", "keynotes", "general_notes")],
            "legends": [n for n in notes_regions if n["type"] == "legend"],
            "schedules": [n for n in notes_regions if n["type"] == "schedule"],
        },
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        # Default: run on 36 Old School House Road floor plan (page 4)
        pdf = "/Users/mattnicosia/Downloads/36_Old_School_House_Rd.pdf"
        page = 3  # 0-indexed, page 4 = floor plans
        scale = 18  # 1/4" = 1'-0" at 72 DPI
    else:
        pdf = sys.argv[1]
        page = int(sys.argv[2]) if len(sys.argv) > 2 else 0
        scale = float(sys.argv[3]) if len(sys.argv) > 3 else None

    run_poc(pdf, page, scale)
