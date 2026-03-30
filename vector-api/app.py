"""
NOVATerra Vector Extraction API
Extracts wall segments, rooms, and text from PDF vector data using PyMuPDF.
Returns structured JSON with coordinates in PDF points (72 DPI).
Deploy on Render as a standalone Python web service.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import math
import fitz  # PyMuPDF
from collections import defaultdict

app = Flask(__name__)
CORS(app)


def _get_wall_threshold(paths):
    """Auto-detect wall line weight: residential hairline vs commercial standard."""
    weights = []
    for p in paths:
        w = p.get("width") or 0
        for item in p["items"]:
            if item[0] == "l":
                s, e = item[1], item[2]
                length = math.sqrt((e.x - s.x)**2 + (e.y - s.y)**2)
                if length > 15:
                    weights.append(round(w, 2))
    if not weights:
        return 0.7
    unique_weights = sorted(set(weights))
    lightest = unique_weights[0]
    lightest_ratio = weights.count(lightest) / len(weights)
    if lightest_ratio > 0.4 and lightest < 0.5:
        return max(0, lightest - 0.01)
    return 0.7


def _filter_border_and_titleblock(segments, page_width, page_height, margin=50):
    """Remove segments in the border margin or title block region.
    Border: within 50pts (0.7") of any page edge.
    Title block: bottom-right corner, ~560×250 pts (standard AIA).
    Only removes segments where BOTH endpoints are in the exclusion zone.
    """
    tb_x = page_width - 560   # title block left edge
    tb_y = page_height - 250  # title block top edge
    filtered = []
    for seg in segments:
        x1, y1, x2, y2 = seg["x1"], seg["y1"], seg["x2"], seg["y2"]
        # Both endpoints in border margin?
        in_margin = (
            (x1 < margin and x2 < margin) or
            (x1 > page_width - margin and x2 > page_width - margin) or
            (y1 < margin and y2 < margin) or
            (y1 > page_height - margin and y2 > page_height - margin)
        )
        # Both endpoints in title block?
        in_tb = (x1 > tb_x and x2 > tb_x and y1 > tb_y and y2 > tb_y)
        if not in_margin and not in_tb:
            filtered.append(seg)
    return filtered


def _largest_cluster(walls, proximity=100):
    """Keep only the largest spatial cluster of walls.
    Uses union-find on wall midpoints. Two walls are connected if their
    midpoints are within `proximity` PDF points. Returns the cluster with
    the most total wall length — the main plan view on the page.
    """
    if len(walls) <= 3:
        return walls
    n = len(walls)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[a] = b

    # Compute midpoints
    mids = []
    for w in walls:
        mx = (w["start"][0] + w["end"][0]) / 2
        my = (w["start"][1] + w["end"][1]) / 2
        mids.append((mx, my))

    # Union walls whose midpoints are close
    for i in range(n):
        for j in range(i + 1, n):
            dx = abs(mids[i][0] - mids[j][0])
            dy = abs(mids[i][1] - mids[j][1])
            if dx < proximity and dy < proximity:
                union(i, j)

    # Find largest cluster by total wall length
    clusters = defaultdict(list)
    for i in range(n):
        clusters[find(i)].append(i)

    best = max(clusters.values(), key=lambda idxs: sum(walls[i]["length"] for i in idxs))
    return [walls[i] for i in best]


def extract_paths(doc, page_num=0):
    """Extract and classify all vector paths from a PDF page."""
    if page_num >= len(doc):
        return None

    page = doc[page_num]
    page_width = page.rect.width
    page_height = page.rect.height
    paths = page.get_drawings()

    # Extract text
    text_blocks = []
    try:
        text_dict = page.get_text("dict")
        for block in text_dict.get("blocks", []):
            if block.get("type") == 0:
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        txt = span.get("text", "").strip()
                        if txt:
                            bbox = span.get("bbox", [0, 0, 0, 0])
                            text_blocks.append({
                                "text": txt,
                                "x": round(bbox[0], 1),
                                "y": round(bbox[1], 1),
                                "x2": round(bbox[2], 1),
                                "y2": round(bbox[3], 1),
                                "size": round(span.get("size", 10), 1),
                            })
    except Exception:
        pass

    wall_threshold = _get_wall_threshold(paths)

    segments = {"outlines": [], "heavy_walls": [], "walls": [], "annotations": []}

    for p in paths:
        weight = p.get("width") or 0
        for item in p["items"]:
            kind = item[0]
            if kind == "l":
                start, end = item[1], item[2]
                length = math.sqrt((end.x - start.x)**2 + (end.y - start.y)**2)
                if length < 3:
                    continue
                seg = {
                    "x1": round(start.x, 1), "y1": round(start.y, 1),
                    "x2": round(end.x, 1), "y2": round(end.y, 1),
                    "weight": round(weight, 2),
                    "length": round(length, 1),
                }
                if weight > 2.5:
                    segments["outlines"].append(seg)
                elif weight >= 1.5:
                    segments["heavy_walls"].append(seg)
                elif weight >= wall_threshold:
                    segments["walls"].append(seg)
                else:
                    segments["annotations"].append(seg)
            elif kind == "re":
                rect = item[1]
                w = abs(rect.x1 - rect.x0)
                h = abs(rect.y1 - rect.y0)
                fill = p.get("fill")
                if weight >= 0.7 or (fill and min(w, h) > 2 and max(w, h) > 20):
                    seg = {
                        "x1": round(rect.x0, 1), "y1": round(rect.y0, 1),
                        "x2": round(rect.x1, 1), "y2": round(rect.y1, 1),
                        "weight": round(weight, 2), "length": round(max(w, h), 1),
                        "is_rect": True, "width": round(w, 1), "height": round(h, 1),
                    }
                    if weight >= 1.5:
                        segments["heavy_walls"].append(seg)
                    else:
                        segments["walls"].append(seg)

    return {
        **segments,
        "text_blocks": text_blocks[:100],
        "page_width": round(page_width, 1),
        "page_height": round(page_height, 1),
        "wall_threshold": wall_threshold,
        "drawing_type": "commercial" if wall_threshold >= 0.7 else "residential",
    }


def merge_wall_segments(raw_segments, angle_tolerance=2.0, gap_tolerance=12, min_length=8):
    """Merge collinear segments into wall objects."""
    candidates = []
    for seg in raw_segments:
        if seg.get("is_rect"):
            w, h = seg.get("width", 0), seg.get("height", 0)
            if w < 3 or h < 3:
                continue
            aspect = max(w, h) / (min(w, h) + 0.01)
            if aspect > 3:
                if w > h:
                    cy = (seg["y1"] + seg["y2"]) / 2
                    candidates.append({"x1": seg["x1"], "y1": cy, "x2": seg["x2"], "y2": cy,
                                       "weight": seg["weight"], "length": w, "is_horizontal": True})
                else:
                    cx = (seg["x1"] + seg["x2"]) / 2
                    candidates.append({"x1": cx, "y1": seg["y1"], "x2": cx, "y2": seg["y2"],
                                       "weight": seg["weight"], "length": h, "is_horizontal": False})
            continue

        if seg["length"] < min_length:
            continue
        dx = seg["x2"] - seg["x1"]
        dy = seg["y2"] - seg["y1"]
        angle = math.degrees(math.atan2(abs(dy), abs(dx)))
        is_h = angle < 15
        is_v = angle > 75
        if not (is_h or is_v):
            continue
        candidates.append({**seg, "is_horizontal": is_h})

    h_groups = defaultdict(list)
    v_groups = defaultdict(list)
    for seg in candidates:
        if seg.get("is_horizontal"):
            y_key = round(((seg["y1"] + seg["y2"]) / 2) / gap_tolerance) * gap_tolerance
            h_groups[y_key].append(seg)
        else:
            x_key = round(((seg["x1"] + seg["x2"]) / 2) / gap_tolerance) * gap_tolerance
            v_groups[x_key].append(seg)

    merged = []

    def merge_group(segs, is_h):
        if not segs:
            return []
        walls = []
        if is_h:
            segs.sort(key=lambda s: min(s["x1"], s["x2"]))
            cur = {"min": min(segs[0]["x1"], segs[0]["x2"]),
                   "max": max(segs[0]["x1"], segs[0]["x2"]),
                   "pos": (segs[0]["y1"] + segs[0]["y2"]) / 2,
                   "w": segs[0]["weight"], "n": 1}
            for seg in segs[1:]:
                s_min = min(seg["x1"], seg["x2"])
                s_max = max(seg["x1"], seg["x2"])
                if s_min <= cur["max"] + gap_tolerance:
                    cur["max"] = max(cur["max"], s_max)
                    cur["w"] = max(cur["w"], seg["weight"])
                    cur["n"] += 1
                else:
                    walls.append(cur)
                    cur = {"min": s_min, "max": s_max,
                           "pos": (seg["y1"] + seg["y2"]) / 2,
                           "w": seg["weight"], "n": 1}
            walls.append(cur)
            return [{"start": [round(w["min"], 1), round(w["pos"], 1)],
                     "end": [round(w["max"], 1), round(w["pos"], 1)],
                     "weight": round(w["w"], 2),
                     "length": round(w["max"] - w["min"], 1),
                     "orientation": "horizontal"}
                    for w in walls if w["max"] - w["min"] >= min_length]
        else:
            segs.sort(key=lambda s: min(s["y1"], s["y2"]))
            cur = {"min": min(segs[0]["y1"], segs[0]["y2"]),
                   "max": max(segs[0]["y1"], segs[0]["y2"]),
                   "pos": (segs[0]["x1"] + segs[0]["x2"]) / 2,
                   "w": segs[0]["weight"], "n": 1}
            for seg in segs[1:]:
                s_min = min(seg["y1"], seg["y2"])
                s_max = max(seg["y1"], seg["y2"])
                if s_min <= cur["max"] + gap_tolerance:
                    cur["max"] = max(cur["max"], s_max)
                    cur["w"] = max(cur["w"], seg["weight"])
                    cur["n"] += 1
                else:
                    walls.append(cur)
                    cur = {"min": s_min, "max": s_max,
                           "pos": (seg["x1"] + seg["x2"]) / 2,
                           "w": seg["weight"], "n": 1}
            walls.append(cur)
            return [{"start": [round(w["pos"], 1), round(w["min"], 1)],
                     "end": [round(w["pos"], 1), round(w["max"], 1)],
                     "weight": round(w["w"], 2),
                     "length": round(w["max"] - w["min"], 1),
                     "orientation": "vertical"}
                    for w in walls if w["max"] - w["min"] >= min_length]

    for _, segs in h_groups.items():
        merged.extend(merge_group(segs, True))
    for _, segs in v_groups.items():
        merged.extend(merge_group(segs, False))

    merged.sort(key=lambda w: -w["length"])
    return merged


def detect_rooms(merged_walls, min_room_area_pts=2000):
    """Detect rooms via flood-fill."""
    if not merged_walls:
        return []

    all_x = [c for w in merged_walls for c in [w["start"][0], w["end"][0]]]
    all_y = [c for w in merged_walls for c in [w["start"][1], w["end"][1]]]
    min_x, max_x = min(all_x) - 20, max(all_x) + 20
    min_y, max_y = min(all_y) - 20, max(all_y) + 20

    cell_size = 6
    grid_w = int((max_x - min_x) / cell_size) + 1
    grid_h = int((max_y - min_y) / cell_size) + 1

    if grid_w > 2000 or grid_h > 2000:
        cell_size = 12
        grid_w = int((max_x - min_x) / cell_size) + 1
        grid_h = int((max_y - min_y) / cell_size) + 1

    if grid_w > 5000 or grid_h > 5000:
        return []

    grid = [[0] * grid_w for _ in range(grid_h)]

    for w in merged_walls:
        x1, y1 = w["start"]
        x2, y2 = w["end"]
        if w["orientation"] == "horizontal":
            gy = int((y1 - min_y) / cell_size)
            gx1 = int((min(x1, x2) - min_x) / cell_size)
            gx2 = int((max(x1, x2) - min_x) / cell_size)
            for gx in range(max(0, gx1), min(grid_w, gx2 + 1)):
                for dy in range(-1, 2):
                    gy2 = gy + dy
                    if 0 <= gy2 < grid_h:
                        grid[gy2][gx] = 1
        else:
            gx = int((x1 - min_x) / cell_size)
            gy1 = int((min(y1, y2) - min_y) / cell_size)
            gy2 = int((max(y1, y2) - min_y) / cell_size)
            for gy in range(max(0, gy1), min(grid_h, gy2 + 1)):
                for dx in range(-1, 2):
                    gx2 = gx + dx
                    if 0 <= gx2 < grid_w:
                        grid[gy][gx2] = 1

    # Flood fill exterior
    exterior = [[False] * grid_w for _ in range(grid_h)]
    stack = []
    for x in range(grid_w):
        if grid[0][x] == 0: stack.append((0, x))
        if grid[grid_h-1][x] == 0: stack.append((grid_h-1, x))
    for y in range(grid_h):
        if grid[y][0] == 0: stack.append((y, 0))
        if grid[y][grid_w-1] == 0: stack.append((y, grid_w-1))

    while stack:
        cy, cx = stack.pop()
        if cy < 0 or cy >= grid_h or cx < 0 or cx >= grid_w:
            continue
        if exterior[cy][cx] or grid[cy][cx] == 1:
            continue
        exterior[cy][cx] = True
        stack.extend([(cy-1, cx), (cy+1, cx), (cy, cx-1), (cy, cx+1)])

    # Cluster interior cells
    visited = [[False] * grid_w for _ in range(grid_h)]
    rooms = []

    for y in range(grid_h):
        for x in range(grid_w):
            if grid[y][x] == 0 and not exterior[y][x] and not visited[y][x]:
                cells = []
                room_stack = [(y, x)]
                while room_stack:
                    ry, rx = room_stack.pop()
                    if ry < 0 or ry >= grid_h or rx < 0 or rx >= grid_w:
                        continue
                    if visited[ry][rx] or grid[ry][rx] == 1 or exterior[ry][rx]:
                        continue
                    visited[ry][rx] = True
                    cells.append((rx, ry))
                    room_stack.extend([(ry-1, rx), (ry+1, rx), (ry, rx-1), (ry, rx+1)])

                area_pts = len(cells) * cell_size * cell_size
                if area_pts >= min_room_area_pts and len(cells) >= 4:
                    xs = [c[0] for c in cells]
                    ys = [c[1] for c in cells]
                    bx1 = min(xs) * cell_size + min_x
                    bx2 = (max(xs) + 1) * cell_size + min_x
                    by1 = min(ys) * cell_size + min_y
                    by2 = (max(ys) + 1) * cell_size + min_y
                    rooms.append({
                        "polygon": [[round(bx1, 1), round(by1, 1)], [round(bx2, 1), round(by1, 1)],
                                    [round(bx2, 1), round(by2, 1)], [round(bx1, 1), round(by2, 1)]],
                        "area_sq_pts": round(area_pts, 1),
                        "centroid": [round((bx1 + bx2) / 2, 1), round((by1 + by2) / 2, 1)],
                        "cells": len(cells),
                    })

    rooms.sort(key=lambda r: -r["area_sq_pts"])
    return rooms


def classify_page(doc, page_num):
    """Classify a PDF page as floor_plan, elevation, detail, schedule, cover, or other."""
    page = doc[page_num]
    text = page.get_text().lower()
    paths = page.get_drawings()

    # Count line types
    h_lines = v_lines = diag_lines = total_lines = 0
    heavy_lines = 0

    for p in paths:
        weight = p.get("width") or 0
        for item in p["items"]:
            if item[0] == "l":
                s, e = item[1], item[2]
                dx = abs(e.x - s.x)
                dy = abs(e.y - s.y)
                length = math.sqrt(dx**2 + dy**2)
                if length > 15:
                    total_lines += 1
                    if weight > 1.0:
                        heavy_lines += 1
                    angle = math.degrees(math.atan2(dy, dx)) % 180
                    if angle < 15 or angle > 165:
                        h_lines += 1
                    elif 75 < angle < 105:
                        v_lines += 1
                    else:
                        diag_lines += 1

    hv_ratio = (h_lines + v_lines) / max(total_lines, 1)

    # Floor plan keywords
    FLOOR_PLAN_KW = ["floor plan", "first floor", "second floor", "basement",
                     "ground floor", "level 1", "level 2", "main floor",
                     "upper floor", "lower floor", "1st floor", "2nd floor",
                     "third floor", "3rd floor", "penthouse", "mezzanine"]
    ROOM_KW = ["bedroom", "bathroom", "kitchen", "living", "dining", "garage",
               "closet", "laundry", "office", "storage", "lobby", "corridor",
               "restroom", "conference", "break room", "reception", "entry"]
    ELEVATION_KW = ["elevation", "north elevation", "south elevation", "east elevation", "west elevation"]
    DETAIL_KW = ["detail", "section", "enlarged", "typical"]
    SCHEDULE_KW = ["schedule", "legend", "notes", "specifications"]
    COVER_KW = ["cover", "index", "title sheet", "drawing list", "abbreviations"]

    has_fp_title = any(kw in text for kw in FLOOR_PLAN_KW)
    room_count = sum(1 for kw in ROOM_KW if kw in text)
    has_elevation = any(kw in text for kw in ELEVATION_KW)
    has_detail = any(kw in text for kw in DETAIL_KW)
    has_schedule = any(kw in text for kw in SCHEDULE_KW)
    has_cover = any(kw in text for kw in COVER_KW)

    # Scoring
    score = 0
    page_type = "other"
    reasons = []

    if has_cover and total_lines < 100:
        page_type = "cover"
        reasons.append("cover keywords + few lines")
    elif has_schedule and total_lines < 200:
        page_type = "schedule"
        reasons.append("schedule keywords")
    elif has_elevation and diag_lines > h_lines * 0.3:
        page_type = "elevation"
        reasons.append("elevation keywords + diagonal lines")
    elif has_detail and total_lines < 300:
        page_type = "detail"
        reasons.append("detail keywords + moderate lines")
    elif has_fp_title or room_count >= 2:
        page_type = "floor_plan"
        score = 80
        if has_fp_title: reasons.append("floor plan title")
        if room_count >= 2: reasons.append(f"{room_count} room labels")
    elif hv_ratio > 0.6 and total_lines > 200 and heavy_lines > 20:
        page_type = "floor_plan"
        score = 60
        reasons.append(f"H/V ratio {hv_ratio:.0%}, {total_lines} lines, {heavy_lines} heavy")
    elif total_lines > 100 and hv_ratio > 0.5:
        page_type = "floor_plan"
        score = 40
        reasons.append(f"likely plan: {total_lines} lines, {hv_ratio:.0%} H/V")

    # Infer floor number from text
    floor_num = None
    floor_label = None
    import re
    for pattern, num, label in [
        (r"basement|below grade|b1", -1, "Basement"),
        (r"ground\s*floor|1st\s*floor|first\s*floor|level\s*1|floor\s*plan.*1", 1, "Floor 1"),
        (r"2nd\s*floor|second\s*floor|level\s*2|floor\s*plan.*2", 2, "Floor 2"),
        (r"3rd\s*floor|third\s*floor|level\s*3|floor\s*plan.*3", 3, "Floor 3"),
        (r"4th\s*floor|fourth\s*floor|level\s*4", 4, "Floor 4"),
        (r"roof\s*plan|roof\s*level", 99, "Roof"),
        (r"mezzanine|mezz", 1.5, "Mezzanine"),
    ]:
        if re.search(pattern, text):
            floor_num = num
            floor_label = label
            break

    return {
        "page_num": page_num,
        "page_type": page_type,
        "confidence": score,
        "floor_num": floor_num,
        "floor_label": floor_label,
        "reasons": reasons,
        "stats": {
            "total_lines": total_lines,
            "h_lines": h_lines,
            "v_lines": v_lines,
            "diag_lines": diag_lines,
            "heavy_lines": heavy_lines,
            "hv_ratio": round(hv_ratio, 2),
            "text_length": len(text),
        }
    }


@app.route("/analyze", methods=["POST", "OPTIONS"])
def analyze():
    """Analyze all pages in a PDF — classify each page and identify floor plans."""
    if request.method == "OPTIONS":
        return "", 200

    data = request.get_json(force=True)
    pdf_b64 = data.get("pdf_base64", "")

    if not pdf_b64:
        return jsonify({"error": "pdf_base64 is required"}), 400

    try:
        if "," in pdf_b64:
            pdf_b64 = pdf_b64.split(",", 1)[1]

        pdf_bytes = base64.b64decode(pdf_b64)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        pages = []
        floor_plans = []

        for i in range(len(doc)):
            classification = classify_page(doc, i)
            pages.append(classification)
            if classification["page_type"] == "floor_plan":
                floor_plans.append(classification)

        doc.close()

        # Sort floor plans by floor number (if detected), then by confidence
        floor_plans.sort(key=lambda p: (p["floor_num"] or 999, -p["confidence"]))

        return jsonify({
            "total_pages": len(pages),
            "pages": pages,
            "floor_plans": floor_plans,
            "floor_plan_count": len(floor_plans),
            "summary": {
                "cover": sum(1 for p in pages if p["page_type"] == "cover"),
                "floor_plan": len(floor_plans),
                "elevation": sum(1 for p in pages if p["page_type"] == "elevation"),
                "detail": sum(1 for p in pages if p["page_type"] == "detail"),
                "schedule": sum(1 for p in pages if p["page_type"] == "schedule"),
                "other": sum(1 for p in pages if p["page_type"] == "other"),
            }
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "novaterra-vector-api"})


@app.route("/extract", methods=["POST", "OPTIONS"])
def extract():
    if request.method == "OPTIONS":
        return "", 200

    data = request.get_json(force=True)
    pdf_b64 = data.get("pdf_base64", "")
    page_num = data.get("page_num", 0)

    if not pdf_b64:
        return jsonify({"error": "pdf_base64 is required"}), 400

    try:
        # Strip data URL prefix
        if "," in pdf_b64:
            pdf_b64 = pdf_b64.split(",", 1)[1]

        pdf_bytes = base64.b64decode(pdf_b64)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        if page_num >= len(doc):
            doc.close()
            return jsonify({"error": f"Page {page_num} not found (PDF has {len(doc)} pages)"}), 400

        extracted = extract_paths(doc, page_num)
        if not extracted:
            doc.close()
            return jsonify({"error": "Failed to extract paths"}), 500

        all_wall_segs = extracted["walls"] + extracted["heavy_walls"] + extracted["outlines"]

        # Filter out border lines and title block
        pre_filter = len(all_wall_segs)
        all_wall_segs = _filter_border_and_titleblock(
            all_wall_segs, extracted["page_width"], extracted["page_height"])

        merged = merge_wall_segments(all_wall_segs)

        # Keep only the largest spatial cluster (main plan view)
        pre_cluster = len(merged)
        if len(merged) > 5:
            merged = _largest_cluster(merged)

        rooms = detect_rooms(merged)

        doc.close()

        return jsonify({
            "page_width": extracted["page_width"],
            "page_height": extracted["page_height"],
            "walls": merged,
            "rooms": rooms,
            "text_blocks": extracted["text_blocks"],
            "drawing_type": extracted["drawing_type"],
            "wall_threshold": extracted["wall_threshold"],
            "stats": {
                "total_paths": sum(len(extracted[k]) for k in ["outlines", "heavy_walls", "walls", "annotations"]),
                "wall_candidates": pre_filter,
                "after_border_filter": len(all_wall_segs),
                "merged_walls": pre_cluster,
                "after_cluster_filter": len(merged),
                "rooms_detected": len(rooms),
            },
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(__import__("os").environ.get("PORT", 5000)))
