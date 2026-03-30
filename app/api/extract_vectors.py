"""
NOVATerra Vector Extraction API — Vercel Python Serverless Function

Extracts wall segments, rooms, and text from PDF vector data using PyMuPDF.
Returns structured JSON with coordinates in PDF points (72 DPI).

Client converts to feet using: feet = points * 1.5 / ppf (calibration)
"""

from http.server import BaseHTTPRequestHandler
import json
import base64
import math
import tempfile
import os
from collections import defaultdict

import fitz  # PyMuPDF


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


def extract_paths(doc, page_num=0):
    """Extract and classify all vector paths from a PDF page."""
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
                            bbox = span.get("bbox", [0,0,0,0])
                            text_blocks.append({
                                "text": txt,
                                "x": bbox[0], "y": bbox[1],
                                "x2": bbox[2], "y2": bbox[3],
                                "cx": (bbox[0] + bbox[2]) / 2,
                                "cy": (bbox[1] + bbox[3]) / 2,
                                "size": span.get("size", 10),
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
                seg = {
                    "x1": start.x, "y1": start.y,
                    "x2": end.x, "y2": end.y,
                    "weight": weight,
                    "length": math.sqrt((end.x - start.x)**2 + (end.y - start.y)**2),
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
                        "x1": rect.x0, "y1": rect.y0,
                        "x2": rect.x1, "y2": rect.y1,
                        "weight": weight, "length": max(w, h),
                        "is_rect": True, "width": w, "height": h,
                    }
                    if weight >= 1.5:
                        segments["heavy_walls"].append(seg)
                    else:
                        segments["walls"].append(seg)

    return {
        **segments,
        "text_blocks": text_blocks,
        "page_width": page_width,
        "page_height": page_height,
        "wall_threshold": wall_threshold,
        "drawing_type": "commercial" if wall_threshold >= 0.7 else "residential",
    }


def merge_wall_segments(raw_segments, angle_tolerance=2.0, gap_tolerance=12, min_length=8):
    """Merge collinear segments into wall objects. Returns list of walls in PDF points."""
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
        angle = math.degrees(math.atan2(dy, dx)) % 180
        is_h = angle < 15 or angle > 165
        is_v = 75 < angle < 105
        if not (is_h or is_v):
            continue
        candidates.append({**seg, "is_horizontal": is_h})

    # Group and merge
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
            return [{"start": [w["min"], w["pos"]], "end": [w["max"], w["pos"]],
                     "weight": w["w"], "length": w["max"] - w["min"],
                     "orientation": "horizontal"} for w in walls if w["max"] - w["min"] >= min_length]
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
            return [{"start": [w["pos"], w["min"]], "end": [w["pos"], w["max"]],
                     "weight": w["w"], "length": w["max"] - w["min"],
                     "orientation": "vertical"} for w in walls if w["max"] - w["min"] >= min_length]

    for _, segs in h_groups.items():
        merged.extend(merge_group(segs, True))
    for _, segs in v_groups.items():
        merged.extend(merge_group(segs, False))

    merged.sort(key=lambda w: -w["length"])
    return merged


def detect_rooms(merged_walls, min_room_area_pts=2000):
    """Detect rooms via flood-fill. Returns rooms with polygon in PDF points."""
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
        if grid[0][x] == 0:
            stack.append((0, x))
        if grid[grid_h-1][x] == 0:
            stack.append((grid_h-1, x))
    for y in range(grid_h):
        if grid[y][0] == 0:
            stack.append((y, 0))
        if grid[y][grid_w-1] == 0:
            stack.append((y, grid_w-1))

    while stack:
        cy, cx = stack.pop()
        if cy < 0 or cy >= grid_h or cx < 0 or cx >= grid_w:
            continue
        if exterior[cy][cx] or grid[cy][cx] == 1:
            continue
        exterior[cy][cx] = True
        stack.extend([(cy-1, cx), (cy+1, cx), (cy, cx-1), (cy, cx+1)])

    # Cluster interior cells into rooms
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
                        "polygon": [[bx1, by1], [bx2, by1], [bx2, by2], [bx1, by2]],
                        "area_sq_pts": area_pts,
                        "centroid": [(bx1 + bx2) / 2, (by1 + by2) / 2],
                        "cells": len(cells),
                    })

    rooms.sort(key=lambda r: -r["area_sq_pts"])
    return rooms


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            pdf_b64 = data.get("pdf_base64", "")
            page_num = data.get("page_num", 0)

            if not pdf_b64:
                self._respond(400, {"error": "pdf_base64 is required"})
                return

            # Strip data URL prefix if present
            if "," in pdf_b64:
                pdf_b64 = pdf_b64.split(",", 1)[1]

            pdf_bytes = base64.b64decode(pdf_b64)

            # Write to temp file (PyMuPDF needs a file or bytes)
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")

            if page_num >= len(doc):
                self._respond(400, {"error": f"Page {page_num} not found (PDF has {len(doc)} pages)"})
                doc.close()
                return

            # Extract paths
            extracted = extract_paths(doc, page_num)

            # Combine wall segments for merging
            all_wall_segs = extracted["walls"] + extracted["heavy_walls"] + extracted["outlines"]

            # Merge collinear segments
            merged = merge_wall_segments(all_wall_segs)

            # Detect rooms
            rooms = detect_rooms(merged)

            doc.close()

            result = {
                "page_width": extracted["page_width"],
                "page_height": extracted["page_height"],
                "walls": merged,
                "rooms": rooms,
                "text_blocks": extracted["text_blocks"][:100],  # limit text blocks
                "drawing_type": extracted["drawing_type"],
                "wall_threshold": extracted["wall_threshold"],
                "stats": {
                    "total_paths": sum(len(extracted[k]) for k in ["outlines", "heavy_walls", "walls", "annotations"]),
                    "wall_candidates": len(all_wall_segs),
                    "merged_walls": len(merged),
                    "rooms_detected": len(rooms),
                },
            }

            self._respond(200, result)

        except Exception as e:
            self._respond(500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def _respond(self, status, data):
        self.send_response(status)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
